import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken } from '../api.js';
import { STATUSES, STATUS_MAP, bnDate } from '../constants.js';
import { useAuth } from '../auth.jsx';

export default function Orders() {
  const navigate = useNavigate();
  const { admin } = useAuth();
  const isAdmin = admin?.role === 'admin';
  const [data, setData] = useState({ orders: [], pagination: {}, statusCounts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ status: '', search: '', source: '', page: 1 });
  const [sel, setSel] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(''); setSel(new Set());
    try { setData(await api('/orders', { params: filters })); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  function setFilter(patch) { setFilters((f) => ({ ...f, page: 1, ...patch })); }
  function toggle(id) { setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleAll() {
    setSel((s) => s.size === orders.length ? new Set() : new Set(orders.map((o) => o._id)));
  }

  async function applyBulkStatus() {
    if (!bulkStatus || sel.size === 0) return;
    setBusy(true); setMsg('');
    try { const r = await api('/orders/bulk/status', { method: 'PATCH', body: { ids: [...sel], status: bulkStatus } }); setMsg(`${r.updated} অর্ডার আপডেট হয়েছে।`); load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function bulkToCourier() {
    if (sel.size === 0) return;
    setBusy(true); setMsg('');
    try { const r = await api('/orders/bulk/courier', { method: 'POST', body: { ids: [...sel] } }); setMsg(`${r.sent} কুরিয়ারে পাঠানো হয়েছে${r.failures.length ? `, ${r.failures.length} ব্যর্থ` : ''}।`); load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function exportCsv() {
    const qs = new URLSearchParams(Object.entries(filters).filter(([k, v]) => v && k !== 'page')).toString();
    const res = await fetch('/api/admin/orders/export?' + qs, { headers: { Authorization: 'Bearer ' + getToken() } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'orders.csv'; a.click(); URL.revokeObjectURL(url);
  }

  const { orders, pagination, statusCounts } = data;
  const totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="page-head">
        <h1>অর্ডার</h1>
        <div className="head-tools">
          <form className="search" onSubmit={(e) => { e.preventDefault(); load(); }}>
            <input placeholder="ফোন / নাম / অর্ডার নম্বর" value={filters.search} onChange={(e) => setFilter({ search: e.target.value })} />
            <button className="btn-primary" type="submit">খুঁজুন</button>
          </form>
          <button className="btn-ghost" onClick={exportCsv}>⬇ CSV</button>
        </div>
      </div>

      <div className="tabs">
        <button className={'tab' + (filters.status === '' ? ' active' : '')} onClick={() => setFilter({ status: '' })}>সব <span className="tab-count">{totalCount}</span></button>
        {STATUSES.map((s) => (
          <button key={s.key} className={'tab' + (filters.status === s.key ? ' active' : '')} onClick={() => setFilter({ status: s.key })}>
            {s.label} <span className="tab-count">{statusCounts[s.key] || 0}</span>
          </button>
        ))}
      </div>

      {sel.size > 0 && (
        <div className="bulk-bar">
          <span>{sel.size}টি নির্বাচিত</span>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="mini-select">
            <option value="">স্ট্যাটাস বদলান…</option>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="btn-ghost sm" disabled={busy || !bulkStatus} onClick={applyBulkStatus}>প্রয়োগ</button>
          {isAdmin && <button className="btn-ghost sm" disabled={busy} onClick={bulkToCourier}>🚚 কুরিয়ারে পাঠান</button>}
          <button className="btn-ghost sm" onClick={() => setSel(new Set())}>বাতিল</button>
        </div>
      )}
      {msg && <p className="ok-text">{msg}</p>}
      {error && <p className="err">{error}</p>}

      {loading ? <p className="muted">লোড হচ্ছে…</p> : orders.length === 0 ? <p className="muted">কোনো অর্ডার নেই।</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={sel.size === orders.length && orders.length > 0} onChange={toggleAll} /></th>
                <th>অর্ডার</th><th>নাম</th><th>ফোন</th><th>অফার</th><th>টোটাল</th><th>স্ট্যাটাস</th><th>কুরিয়ার</th><th>সোর্স</th><th>সময়</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const st = STATUS_MAP[o.status] || {};
                return (
                  <tr key={o._id} className={sel.has(o._id) ? 'row-sel' : ''}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(o._id)} onChange={() => toggle(o._id)} /></td>
                    <td onClick={() => navigate('/orders/' + o._id)}>#{o.orderNumber}</td>
                    <td onClick={() => navigate('/orders/' + o._id)}>{o.customer?.name}</td>
                    <td>{o.customer?.phone}</td>
                    <td onClick={() => navigate('/orders/' + o._id)}>
                      <div style={{ fontWeight: 600 }}>{o.offerTitle} <span className="muted">×{o.quantity}</span></div>
                      {(o.variantSummary || (o.customFields && Object.keys(o.customFields).length > 0)) && (
                        <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {o.variantSummary ? (
                            <span className="pill sm" style={{ background: '#2563eb', fontSize: '0.72rem', padding: '2px 7px' }}>
                              🏷️ {o.variantSummary}
                            </span>
                          ) : (
                            Object.entries(o.customFields || {}).map(([k, v]) => (
                              <span key={k} className="pill sm" style={{ background: '#2563eb', fontSize: '0.72rem', padding: '2px 7px' }}>
                                {o.customFieldLabels?.[k] || (k === 'size' ? 'সাইজ' : k === 'color' ? 'কালার' : k)}: {String(v)}
                              </span>
                            ))
                          )}
                        </div>
                      )}
                    </td>
                    <td>{o.total}৳</td>
                    <td><span className="pill" style={{ background: st.color }}>{st.label}</span></td>
                    <td>{o.courier?.trackingCode ? <span className="ok-text">{o.courier.trackingCode}</span> : <span className="muted">—</span>}</td>
                    <td>{o.source}</td>
                    <td className="muted">{bnDate(o.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="pager">
          <button disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>‹ আগের</button>
          <span>{filters.page} / {pagination.pages}</span>
          <button disabled={filters.page >= pagination.pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>পরের ›</button>
        </div>
      )}
    </div>
  );
}
