import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { money, num } from '../constants.js';
import { Pill, Notice } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { FunnelFilter } from '../funnel.jsx';

const INC_STATUS = { new: 'New', called: 'Called', converted: 'Converted', dead: 'Dead' };
const INC_COLOR = { new: '#3b82f6', called: '#f59e0b', converted: '#10b981', dead: '#6b7280' };

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 60) return mins + ' min ago';
  const h = Math.floor(mins / 60);
  if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  const d = Math.floor(h / 24);
  return d + (d === 1 ? ' day ago' : ' days ago');
}
function waLink(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return 'https://wa.me/' + (d.startsWith('0') ? '88' + d : d);
}

export default function Incomplete() {
  const [data, setData] = useState({ items: [], statusCounts: {} });
  const [status, setStatus] = useState('');
  const [funnel, setFunnel] = useState('');
  const [loading, setLoading] = useState(true);
  const [convert, setConvert] = useState(null); // incomplete being converted
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/incomplete', { params: { status, funnel } });
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [status, funnel]);
  useEffect(() => { load(); }, [load]);

  async function setStatusOf(id, s) {
    await api('/incomplete/' + id + '/status', { method: 'PATCH', body: { status: s } });
    load();
  }
  async function followUp(id) {
    setMsg('');
    try {
      const r = await api('/incomplete/' + id + '/followup', { method: 'POST' });
      setMsg(r.ok ? 'Follow-up SMS sent.' : 'Could not send SMS: ' + (r.error || ''));
    } catch (e) {
      setMsg(e.message);
    }
  }

  const { items, statusCounts } = data;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Incomplete orders</h1>
          <p className="muted" style={{ margin: 0 }}>The phone number is the real asset — follow up and win the sale back.</p>
        </div>
        <FunnelFilter value={funnel} onChange={setFunnel} />
      </div>

      <div className="tabs">
        {['', 'new', 'called', 'converted', 'dead'].map((s) => (
          <button key={s} className={'tab' + (status === s ? ' active' : '')} onClick={() => setStatus(s)}>
            {s === '' ? 'Active' : INC_STATUS[s]} {s && <span className="tab-count">{num(statusCounts[s] || 0)}</span>}
          </button>
        ))}
      </div>

      <Notice type="ok">{msg}</Notice>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No incomplete orders.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Offer</th><th>When</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it._id}>
                  <td>
                    <div>{it.data?.name || <span className="muted">—</span>}</div>
                    {it.data?.exitReason && (
                      <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <Pill color="#d97706" small>Reason: {it.data.exitReason}</Pill>
                        {it.data?.discountOffered ? (
                          <Pill color="#16a34a" small>{money(it.data.discountOffered)} offer</Pill>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td>{it.phoneValid ? it.phone : <span className="muted">Incomplete</span>}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{it.offerId?.title || '—'}</div>
                    {it.data && (it.data.size || it.data.color) && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                        <Pill color="#3b82f6" small>
                          {[it.data.size && `Size: ${it.data.size}`, it.data.color && `Colour: ${it.data.color}`].filter(Boolean).join(' · ')}
                        </Pill>
                      </div>
                    )}
                  </td>
                  <td className="muted">{timeAgo(it.lastActivityAt)}</td>
                  <td><Pill color={INC_COLOR[it.status]}>{INC_STATUS[it.status]}</Pill></td>
                  <td>
                    <div className="row-actions">
                      {it.phoneValid && <a className="btn-ghost sm" href={'tel:' + it.phone} title="Call"><Icon name="phone" size={15} /></a>}
                      {it.phoneValid && <a className="btn-ghost sm" href={waLink(it.phone)} target="_blank" rel="noreferrer" title="WhatsApp"><Icon name="chat" size={15} /></a>}
                      {it.phoneValid && <button className="btn-ghost sm" onClick={() => followUp(it._id)}>SMS</button>}
                      <button className="btn-ghost sm" onClick={() => setConvert(it)}>Convert</button>
                      <select className="mini-select" value={it.status} onChange={(e) => setStatusOf(it._id, e.target.value)}>
                        {Object.entries(INC_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {convert && <ConvertModal item={convert} onClose={() => setConvert(null)} onDone={() => { setConvert(null); load(); }} />}
    </div>
  );
}

function ConvertModal({ item, onClose, onDone }) {
  const [offers, setOffers] = useState([]);
  const [zones, setZones] = useState([]);
  const [fields, setFields] = useState([]);
  const [form, setForm] = useState({ offerId: '', quantity: 1, deliveryZoneId: '', values: { ...(item.data || {}) } });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = { funnel: item.productId || undefined };
    Promise.all([
      api('/incomplete/offers', { params }),
      api('/zones', { params }),
      api('/fields', { params }),
    ]).then(([o, z, f]) => {
      setOffers(o.offers);
      setZones(z.zones.filter((x) => x.active));
      setFields(f.fields.filter((x) => x.active));
      setForm((s) => ({ ...s, offerId: item.offerId?._id || o.offers[0]?._id || '', deliveryZoneId: z.zones[0]?._id || '' }));
    });
  }, [item]);

  async function submit() {
    setBusy(true); setErr({});
    try {
      const r = await api('/incomplete/' + item._id + '/convert', {
        method: 'POST',
        body: { offerId: form.offerId, quantity: Number(form.quantity) || 1, deliveryZoneId: form.deliveryZoneId, fields: form.values },
      });
      if (r.ok) onDone();
    } catch (e) {
      if (e.status === 422) setErr(e.fields || { _: e.message });
      else setErr({ _: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Convert to order</h3><button className="btn-ghost" onClick={onClose}><Icon name="x" size={16} /></button></div>
        <div className="fld">
          <label>Offer</label>
          <select value={form.offerId} onChange={(e) => setForm({ ...form, offerId: e.target.value })}>
            {offers.map((o) => <option key={o._id} value={o._id}>{o.title} — {money(o.price)}</option>)}
          </select>
        </div>
        <div className="fld"><label>Quantity</label><input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
        <div className="fld">
          <label>Delivery zone</label>
          <select value={form.deliveryZoneId} onChange={(e) => setForm({ ...form, deliveryZoneId: e.target.value })}>
            {zones.map((z) => <option key={z._id} value={z._id}>{z.name} — {money(z.charge)}</option>)}
          </select>
        </div>
        {fields.map((f) => (
          <div className="fld" key={f._id}>
            <label>{f.label} {f.required && <span style={{ color: '#e63946' }}>*</span>}</label>
            {f.type === 'select' || f.type === 'radio' ? (
              <select value={form.values[f.name] || ''} onChange={(e) => setForm({ ...form, values: { ...form.values, [f.name]: e.target.value } })}>
                <option value="">Select</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input value={form.values[f.name] || ''} onChange={(e) => setForm({ ...form, values: { ...form.values, [f.name]: e.target.value } })} />
            )}
            {err[f.name] && <span className="err">{err[f.name]}</span>}
          </div>
        ))}
        {err._ && <p className="err">{err._}</p>}
        <div className="save-bar"><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create order'}</button></div>
      </div>
    </div>
  );
}
