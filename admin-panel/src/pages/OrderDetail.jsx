import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { STATUSES, fmtDate, money, fieldLabel } from '../constants.js';
import { StatusPill, Pill, Notice } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { useFunnel } from '../funnel.jsx';

function waLink(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const intl = digits.startsWith('0') ? '88' + digits : digits;
  return 'https://wa.me/' + intl;
}

const FRAUD_VERDICT = {
  good: 'Good',
  caution: 'Caution',
  risky: 'Risky',
  unknown: 'No data',
};

export default function OrderDetail() {
  const { id } = useParams();
  const { nameOf, multi } = useFunnel();
  const [order, setOrder] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fraud, setFraud] = useState(null);
  const [courierMsg, setCourierMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api('/orders/' + id);
      setOrder(res.order);
      setHistory(res.phoneHistory || []);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(status) {
    setBusy(true);
    try {
      const res = await api('/orders/' + id + '/status', { method: 'PATCH', body: { status } });
      setOrder(res.order);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runFraud() {
    setBusy(true);
    try { setFraud(await api('/orders/' + id + '/fraud')); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function toCourier() {
    setBusy(true); setCourierMsg(null);
    try { const r = await api('/orders/' + id + '/courier', { method: 'POST' }); setOrder(r.order); setCourierMsg({ ok: true, text: 'Sent to courier.' }); }
    catch (e) { setCourierMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  async function addNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      const res = await api('/orders/' + id + '/notes', { method: 'POST', body: { text: note } });
      setOrder((o) => ({ ...o, notes: res.notes }));
      setNote('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="err">{error}</p>;
  if (!order) return <p className="muted">Loading…</p>;

  return (
    <div className="detail">
      <div className="page-head">
        <h1>
          Order #{order.orderNumber}{' '}
          <StatusPill status={order.status} />
          {multi && nameOf(order.productId) && (
            <Pill color="#7c3aed" small>{nameOf(order.productId)}</Pill>
          )}
        </h1>
        <Link to="/orders" className="btn-ghost"><Icon name="back" size={16} /> Back to list</Link>
      </div>

      <div className="detail-grid">
        {/* Left: customer + items */}
        <div className="card">
          <h3>Customer</h3>
          <div className="kv"><span>Name</span><b>{order.customer.name}</b></div>
          <div className="kv"><span>Phone</span><b>{order.customer.phone}</b></div>
          <div className="kv"><span>Address</span><b>{order.customer.address}</b></div>

          {order.customFields && Object.keys(order.customFields).length > 0 && (
            <>
              <h4>Size, colour &amp; other details</h4>
              {Object.entries(order.customFields).map(([k, v]) => (
                <div className="kv" key={k}>
                  <span>{fieldLabel(order, k)}</span>
                  <b style={{ color: '#2563eb' }}>{String(v)}</b>
                </div>
              ))}
            </>
          )}

          <div className="quick-actions">
            <a className="btn-outline" href={'tel:' + order.customer.phone}><Icon name="phone" size={16} /> Call</a>
            <a className="btn-outline" href={waLink(order.customer.phone)} target="_blank" rel="noreferrer"><Icon name="chat" size={16} /> WhatsApp</a>
          </div>

          <h3 style={{ marginTop: 20 }}>Order</h3>
          <div className="kv">
            <div>
              <b style={{ fontSize: '1rem', display: 'block' }}>{order.offerTitle}</b>
              {(order.variantSummary || (order.customFields && Object.keys(order.customFields).length > 0)) && (
                <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {order.variantSummary ? (
                    <Pill color="#2563eb" small>{order.variantSummary}</Pill>
                  ) : (
                    Object.entries(order.customFields || {}).map(([k, v]) => (
                      <Pill key={k} color="#2563eb" small>{fieldLabel(order, k)}: {String(v)}</Pill>
                    ))
                  )}
                </div>
              )}
            </div>
            <b>{money(order.unitPrice)} × {order.quantity}</b>
          </div>
          <div className="kv"><span>Subtotal</span><b>{money(order.subtotal)}</b></div>
          <div className="kv"><span>Delivery ({order.deliveryZoneName})</span><b>{money(order.deliveryCharge)}</b></div>
          <div className="kv total"><span>Total</span><b>{money(order.total)}</b></div>

          <div className="kv" style={{ marginTop: 14 }}><span>Source (attribution)</span><b>{order.source}</b></div>
          {(order.tracking?.utm?.campaign || order.tracking?.campaignId) && (
            <div className="kv"><span>Campaign</span><b>{order.tracking?.utm?.campaign || order.tracking?.campaignId}</b></div>
          )}
          {order.tracking?.adId && (
            <div className="kv"><span>Ad ID</span><b style={{ fontFamily: 'monospace' }}>{order.tracking.adId}</b></div>
          )}
          {order.tracking?.adsetId && (
            <div className="kv"><span>AdSet ID</span><b style={{ fontFamily: 'monospace' }}>{order.tracking.adsetId}</b></div>
          )}
          {order.tracking?.fbclid && (
            <div className="kv"><span>FB Click ID (fbclid)</span><b style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>{order.tracking.fbclid}</b></div>
          )}
          {order.tracking?.ttclid && (
            <div className="kv"><span>TikTok Click ID</span><b style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>{order.tracking.ttclid}</b></div>
          )}
          {order.tracking?.gclid && (
            <div className="kv"><span>Google Click ID</span><b style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>{order.tracking.gclid}</b></div>
          )}
          {order.tracking?.eventId && (
            <div className="kv"><span>Dedup Event ID</span><span className="muted" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{order.tracking.eventId}</span></div>
          )}
        </div>

        {/* Right: status, notes, history */}
        <div className="card">
          <h3>Change status</h3>
          <div className="status-btns">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                disabled={busy || s.key === order.status}
                className={'status-btn' + (s.key === order.status ? ' current' : '')}
                style={{ borderColor: s.color, color: s.key === order.status ? '#fff' : s.color, background: s.key === order.status ? s.color : '#fff' }}
                onClick={() => changeStatus(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <h3 style={{ marginTop: 20 }}>Courier &amp; fraud check</h3>
          <div className="courier-box">
            {order.courier?.consignmentId ? (
              <div className="kv"><span>{order.courier.provider}</span><b>{order.courier.trackingCode || order.courier.consignmentId}</b></div>
            ) : (
              <button className="btn-outline" disabled={busy} onClick={toCourier}><Icon name="truck" size={16} /> Send to courier</button>
            )}
            <button className="btn-ghost" disabled={busy} onClick={runFraud}><Icon name="shield" size={16} /> Fraud check</button>
          </div>
          {courierMsg && <Notice type={courierMsg.ok ? 'ok' : 'err'}>{courierMsg.text}</Notice>}
          {fraud && (
            <div className={'fraud-result ' + fraud.verdict}>
              <b>Fraud signal: {FRAUD_VERDICT[fraud.verdict] || fraud.verdict}</b>
              <div className="muted">
                {fraud.internal.totalOrders} orders · {fraud.internal.delivered} delivered · {fraud.internal.failed} failed
                {fraud.internal.successRate != null && ` · ${fraud.internal.successRate}% success rate`}
              </div>
            </div>
          )}

          <h3 style={{ marginTop: 20 }}>Notes</h3>
          <form onSubmit={addNote} className="note-form">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Write a note…" />
            <button className="btn-primary" disabled={busy}>Add</button>
          </form>
          <ul className="notes">
            {(order.notes || []).slice().reverse().map((n, i) => (
              <li key={i}>
                <p>{n.text}</p>
                <span className="muted">{n.by} · {fmtDate(n.at)}</span>
              </li>
            ))}
            {(!order.notes || order.notes.length === 0) && <li className="muted">No notes yet.</li>}
          </ul>

          <h3 style={{ marginTop: 20 }}>Status history</h3>
          <ul className="timeline">
            {(order.statusHistory || []).slice().reverse().map((h, i) => (
              <li key={i}>
                <StatusPill status={h.status} small />
                <span className="muted">{h.by} · {fmtDate(h.at)}</span>
              </li>
            ))}
          </ul>

          {history.length > 0 && (
            <>
              <h3 style={{ marginTop: 20 }}>Previous orders from this phone</h3>
              <ul className="history">
                {history.map((h) => (
                  <li key={h._id}>
                    <Link to={'/orders/' + h._id}>#{h.orderNumber}</Link>
                    <StatusPill status={h.status} small />
                    <span>{money(h.total)}</span>
                    <span className="muted">{fmtDate(h.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
