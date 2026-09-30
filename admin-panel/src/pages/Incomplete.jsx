import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { bnDate } from '../constants.js';

const INC_STATUS = { new: 'নতুন', called: 'কল করা', converted: 'কনভার্টেড', dead: 'ডেড' };
const INC_COLOR = { new: '#3b82f6', called: '#f59e0b', converted: '#10b981', dead: '#6b7280' };

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 60) return mins + ' মিনিট আগে';
  const h = Math.floor(mins / 60);
  if (h < 24) return h + ' ঘণ্টা আগে';
  return Math.floor(h / 24) + ' দিন আগে';
}
function waLink(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return 'https://wa.me/' + (d.startsWith('0') ? '88' + d : d);
}

export default function Incomplete() {
  const [data, setData] = useState({ items: [], statusCounts: {} });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [convert, setConvert] = useState(null); // incomplete being converted
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/incomplete', { params: { status } });
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  async function setStatusOf(id, s) {
    await api('/incomplete/' + id + '/status', { method: 'PATCH', body: { status: s } });
    load();
  }
  async function followUp(id) {
    setMsg('');
    try {
      const r = await api('/incomplete/' + id + '/followup', { method: 'POST' });
      setMsg(r.ok ? 'ফলো-আপ SMS পাঠানো হয়েছে।' : 'SMS পাঠানো যায়নি: ' + (r.error || ''));
    } catch (e) {
      setMsg(e.message);
    }
  }

  const { items, statusCounts } = data;

  return (
    <div>
      <div className="page-head">
        <h1>অসম্পূর্ণ অর্ডার</h1>
        <p className="muted" style={{ margin: 0 }}>ফোন নম্বরই আসল সম্পদ — ফলো-আপে সেল ফিরিয়ে আনুন।</p>
      </div>

      <div className="tabs">
        {['', 'new', 'called', 'converted', 'dead'].map((s) => (
          <button key={s} className={'tab' + (status === s ? ' active' : '')} onClick={() => setStatus(s)}>
            {s === '' ? 'সক্রিয়' : INC_STATUS[s]} {s && <span className="tab-count">{statusCounts[s] || 0}</span>}
          </button>
        ))}
      </div>

      {msg && <p className="ok-text" style={{ marginBottom: 10 }}>{msg}</p>}
      {loading ? (
        <p className="muted">লোড হচ্ছে…</p>
      ) : items.length === 0 ? (
        <p className="muted">কোনো অসম্পূর্ণ অর্ডার নেই।</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>নাম</th><th>ফোন</th><th>অফার</th><th>কতক্ষণ আগে</th><th>স্ট্যাটাস</th><th>অ্যাকশন</th></tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it._id}>
                  <td>
                    <div>{it.data?.name || <span className="muted">—</span>}</div>
                    {it.data?.exitReason && (
                      <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <span className="pill sm" style={{ background: '#d97706', fontSize: '0.70rem' }}>
                          ⚠️ কারণ: {it.data.exitReason}
                        </span>
                        {it.data?.discountOffered ? (
                          <span className="pill sm" style={{ background: '#16a34a', fontSize: '0.70rem' }}>
                            {it.data.discountOffered}৳ অফার
                          </span>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td>{it.phoneValid ? it.phone : <span className="muted">অসম্পূর্ণ</span>}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{it.offerId?.title || '—'}</div>
                    {it.data && (it.data.size || it.data.color) && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                        <span className="pill sm" style={{ background: '#3b82f6', fontSize: '0.72rem' }}>
                          {[it.data.size && `সাইজ: ${it.data.size}`, it.data.color && `কালার: ${it.data.color}`].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="muted">{timeAgo(it.lastActivityAt)}</td>
                  <td><span className="pill" style={{ background: INC_COLOR[it.status] }}>{INC_STATUS[it.status]}</span></td>
                  <td>
                    <div className="row-actions">
                      {it.phoneValid && <a className="btn-ghost sm" href={'tel:' + it.phone}>📞</a>}
                      {it.phoneValid && <a className="btn-ghost sm" href={waLink(it.phone)} target="_blank" rel="noreferrer">💬</a>}
                      {it.phoneValid && <button className="btn-ghost sm" onClick={() => followUp(it._id)}>SMS</button>}
                      <button className="btn-ghost sm" onClick={() => setConvert(it)}>কনভার্ট</button>
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
    Promise.all([api('/incomplete/offers'), api('/zones'), api('/fields')]).then(([o, z, f]) => {
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
        <div className="modal-head"><h3>অর্ডারে কনভার্ট করুন</h3><button className="btn-ghost" onClick={onClose}>✕</button></div>
        <div className="fld">
          <label>অফার</label>
          <select value={form.offerId} onChange={(e) => setForm({ ...form, offerId: e.target.value })}>
            {offers.map((o) => <option key={o._id} value={o._id}>{o.title} — {o.price}৳</option>)}
          </select>
        </div>
        <div className="fld"><label>কোয়ান্টিটি</label><input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
        <div className="fld">
          <label>ডেলিভারি এলাকা</label>
          <select value={form.deliveryZoneId} onChange={(e) => setForm({ ...form, deliveryZoneId: e.target.value })}>
            {zones.map((z) => <option key={z._id} value={z._id}>{z.name} — {z.charge}৳</option>)}
          </select>
        </div>
        {fields.map((f) => (
          <div className="fld" key={f._id}>
            <label>{f.label} {f.required && <span style={{ color: '#e63946' }}>*</span>}</label>
            {f.type === 'select' || f.type === 'radio' ? (
              <select value={form.values[f.name] || ''} onChange={(e) => setForm({ ...form, values: { ...form.values, [f.name]: e.target.value } })}>
                <option value="">নির্বাচন করুন</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input value={form.values[f.name] || ''} onChange={(e) => setForm({ ...form, values: { ...form.values, [f.name]: e.target.value } })} />
            )}
            {err[f.name] && <span className="err">{err[f.name]}</span>}
          </div>
        ))}
        {err._ && <p className="err">{err._}</p>}
        <div className="save-bar"><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? 'তৈরি হচ্ছে…' : 'অর্ডার তৈরি করুন'}</button></div>
      </div>
    </div>
  );
}
