import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { STATUSES, STATUS_MAP, bnDate } from '../constants.js';

function waLink(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const intl = digits.startsWith('0') ? '88' + digits : digits;
  return 'https://wa.me/' + intl;
}

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fraud, setFraud] = useState(null);
  const [courierMsg, setCourierMsg] = useState('');

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
    setBusy(true); setCourierMsg('');
    try { const r = await api('/orders/' + id + '/courier', { method: 'POST' }); setOrder(r.order); setCourierMsg('কুরিয়ারে পাঠানো হয়েছে।'); }
    catch (e) { setCourierMsg(e.message); }
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
  if (!order) return <p className="muted">লোড হচ্ছে…</p>;

  const st = STATUS_MAP[order.status] || {};

  return (
    <div className="detail">
      <div className="page-head">
        <h1>
          অর্ডার #{order.orderNumber}{' '}
          <span className="pill" style={{ background: st.color }}>{st.label}</span>
        </h1>
        <Link to="/orders" className="btn-ghost">← তালিকায় ফিরুন</Link>
      </div>

      <div className="detail-grid">
        {/* Left: customer + items */}
        <div className="card">
          <h3>কাস্টমার</h3>
          <div className="kv"><span>নাম</span><b>{order.customer.name}</b></div>
          <div className="kv"><span>ফোন</span><b>{order.customer.phone}</b></div>
          <div className="kv"><span>ঠিকানা</span><b>{order.customer.address}</b></div>

          {order.customFields && Object.keys(order.customFields).length > 0 && (
            <>
              <h4>সাইজ, কালার ও অন্যান্য তথ্য</h4>
              {Object.entries(order.customFields).map(([k, v]) => {
                const label = order.customFieldLabels?.[k] || (k === 'size' ? 'সাইজ' : k === 'color' ? 'কালার' : k);
                return (
                  <div className="kv" key={k}>
                    <span>{label}</span>
                    <b style={{ color: '#2563eb' }}>{String(v)}</b>
                  </div>
                );
              })}
            </>
          )}

          <div className="quick-actions">
            <a className="btn-outline" href={'tel:' + order.customer.phone}>📞 কল</a>
            <a className="btn-outline" href={waLink(order.customer.phone)} target="_blank" rel="noreferrer">💬 WhatsApp</a>
          </div>

          <h3 style={{ marginTop: 20 }}>অর্ডার</h3>
          <div className="kv">
            <div>
              <b style={{ fontSize: '1rem', display: 'block' }}>{order.offerTitle}</b>
              {(order.variantSummary || (order.customFields && Object.keys(order.customFields).length > 0)) && (
                <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {order.variantSummary ? (
                    <span className="pill sm" style={{ background: '#2563eb', padding: '3px 8px', fontSize: '0.78rem' }}>
                      🏷️ {order.variantSummary}
                    </span>
                  ) : (
                    Object.entries(order.customFields || {}).map(([k, v]) => (
                      <span key={k} className="pill sm" style={{ background: '#2563eb', padding: '3px 8px', fontSize: '0.78rem' }}>
                        {order.customFieldLabels?.[k] || (k === 'size' ? 'সাইজ' : k === 'color' ? 'কালার' : k)}: {String(v)}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>
            <b>{order.unitPrice}৳ × {order.quantity}</b>
          </div>
          <div className="kv"><span>সাবটোটাল</span><b>{order.subtotal}৳</b></div>
          <div className="kv"><span>ডেলিভারি ({order.deliveryZoneName})</span><b>{order.deliveryCharge}৳</b></div>
          <div className="kv total"><span>সর্বমোট</span><b>{order.total}৳</b></div>

          <div className="kv" style={{ marginTop: 14 }}><span>সোর্স (অ্যাトリবিউশন)</span><b>{order.source}</b></div>
          {(order.tracking?.utm?.campaign || order.tracking?.campaignId) && (
            <div className="kv"><span>ক্যাম্পেইন</span><b>{order.tracking?.utm?.campaign || order.tracking?.campaignId}</b></div>
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
          <h3>স্ট্যাটাস পরিবর্তন</h3>
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

          <h3 style={{ marginTop: 20 }}>কুরিয়ার ও ফ্রড চেক</h3>
          <div className="courier-box">
            {order.courier?.consignmentId ? (
              <div className="kv"><span>{order.courier.provider}</span><b>{order.courier.trackingCode || order.courier.consignmentId}</b></div>
            ) : (
              <button className="btn-outline" disabled={busy} onClick={toCourier}>🚚 কুরিয়ারে পাঠান</button>
            )}
            <button className="btn-ghost" disabled={busy} onClick={runFraud}>🛡️ ফ্রড চেক</button>
          </div>
          {courierMsg && <p className={courierMsg.includes('হয়েছে') ? 'ok-text' : 'err'}>{courierMsg}</p>}
          {fraud && (
            <div className={'fraud-result ' + fraud.verdict}>
              <b>ফ্রড সিগন্যাল: {{ good: '✅ ভালো', caution: '⚠️ সতর্ক', risky: '❌ ঝুঁকিপূর্ণ', unknown: 'তথ্য নেই' }[fraud.verdict]}</b>
              <div className="muted">
                মোট {fraud.internal.totalOrders} অর্ডার · ডেলিভারড {fraud.internal.delivered} · ব্যর্থ {fraud.internal.failed}
                {fraud.internal.successRate != null && ` · সাকসেস রেট ${fraud.internal.successRate}%`}
              </div>
            </div>
          )}

          <h3 style={{ marginTop: 20 }}>নোট</h3>
          <form onSubmit={addNote} className="note-form">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="নোট লিখুন…" />
            <button className="btn-primary" disabled={busy}>যোগ করুন</button>
          </form>
          <ul className="notes">
            {(order.notes || []).slice().reverse().map((n, i) => (
              <li key={i}>
                <p>{n.text}</p>
                <span className="muted">{n.by} · {bnDate(n.at)}</span>
              </li>
            ))}
            {(!order.notes || order.notes.length === 0) && <li className="muted">কোনো নোট নেই।</li>}
          </ul>

          <h3 style={{ marginTop: 20 }}>স্ট্যাটাস হিস্ট্রি</h3>
          <ul className="timeline">
            {(order.statusHistory || []).slice().reverse().map((h, i) => (
              <li key={i}>
                <span className="pill sm" style={{ background: (STATUS_MAP[h.status] || {}).color }}>
                  {(STATUS_MAP[h.status] || {}).label}
                </span>
                <span className="muted">{h.by} · {bnDate(h.at)}</span>
              </li>
            ))}
          </ul>

          {history.length > 0 && (
            <>
              <h3 style={{ marginTop: 20 }}>এই ফোনের আগের অর্ডার</h3>
              <ul className="history">
                {history.map((h) => (
                  <li key={h._id}>
                    <Link to={'/orders/' + h._id}>#{h.orderNumber}</Link>
                    <span className="pill sm" style={{ background: (STATUS_MAP[h.status] || {}).color }}>
                      {(STATUS_MAP[h.status] || {}).label}
                    </span>
                    <span>{h.total}৳</span>
                    <span className="muted">{bnDate(h.createdAt)}</span>
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
