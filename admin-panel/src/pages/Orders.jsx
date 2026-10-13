import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken } from '../api.js';
import { STATUSES, fmtDate, money, num, fieldLabel } from '../constants.js';
import { StatusPill, Pill, Notice } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../auth.jsx';
import { FunnelFilter, useFunnel } from '../funnel.jsx';

export default function Orders() {
  const navigate = useNavigate();
  const { admin } = useAuth();
  const isAdmin = admin?.role === 'admin';
  const { nameOf, multi } = useFunnel();
  const [data, setData] = useState({ orders: [], pagination: {}, statusCounts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ status: '', search: '', source: '', funnel: '', page: 1 });
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
    try { const r = await api('/orders/bulk/status', { method: 'PATCH', body: { ids: [...sel], status: bulkStatus } }); setMsg(`${r.updated} order(s) updated.`); load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function bulkToCourier() {
    if (sel.size === 0) return;
    setBusy(true); setMsg('');
    try { const r = await api('/orders/bulk/courier', { method: 'POST', body: { ids: [...sel] } }); setMsg(`${r.sent} sent to courier${r.failures.length ? `, ${r.failures.length} failed` : ''}.`); load(); }
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
        <h1>Orders</h1>
        <div className="head-tools">
          <FunnelFilter value={filters.funnel} onChange={(v) => setFilter({ funnel: v })} />
          <form className="search" onSubmit={(e) => { e.preventDefault(); load(); }}>
            <input placeholder="Phone / name / order number" value={filters.search} onChange={(e) => setFilter({ search: e.target.value })} />
            <button className="btn-primary" type="submit">Search</button>
          </form>
          <button className="btn-ghost" onClick={exportCsv}><Icon name="download" size={16} /> CSV</button>
        </div>
      </div>

      <div className="tabs">
        <button className={'tab' + (filters.status === '' ? ' active' : '')} onClick={() => setFilter({ status: '' })}>All <span className="tab-count">{num(totalCount)}</span></button>
        {STATUSES.map((s) => (
          <button key={s.key} className={'tab' + (filters.status === s.key ? ' active' : '')} onClick={() => setFilter({ status: s.key })}>
            {s.label} <span className="tab-count">{num(statusCounts[s.key] || 0)}</span>
          </button>
        ))}
      </div>

      {sel.size > 0 && (
        <div className="bulk-bar">
          <span>{num(sel.size)} selected</span>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="mini-select">
            <option value="">Change status…</option>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="btn-ghost sm" disabled={busy || !bulkStatus} onClick={applyBulkStatus}>Apply</button>
          {isAdmin && <button className="btn-ghost sm" disabled={busy} onClick={bulkToCourier}><Icon name="truck" size={15} /> Send to courier</button>}
          <button className="btn-ghost sm" onClick={() => setSel(new Set())}>Cancel</button>
        </div>
      )}
      <Notice type="ok">{msg}</Notice>
      <Notice type="err">{error}</Notice>

      {loading ? <p className="muted">Loading…</p> : orders.length === 0 ? <p className="muted">No orders.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={sel.size === orders.length && orders.length > 0} onChange={toggleAll} /></th>
                <th>Order</th>{multi && <th>Funnel</th>}<th>Name</th><th>Phone</th><th>Offer</th><th className="num">Total</th><th>Status</th><th>Courier</th><th>Source</th><th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id} className={sel.has(o._id) ? 'row-sel' : ''}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(o._id)} onChange={() => toggle(o._id)} /></td>
                  <td onClick={() => navigate('/orders/' + o._id)}><span className="cell-strong">#{o.orderNumber}</span></td>
                  {multi && <td>{nameOf(o.productId) ? <Pill color="#7c3aed" small>{nameOf(o.productId)}</Pill> : <span className="muted">—</span>}</td>}
                  <td onClick={() => navigate('/orders/' + o._id)}>{o.customer?.name}</td>
                  <td>{o.customer?.phone}</td>
                  <td onClick={() => navigate('/orders/' + o._id)}>
                    <div style={{ fontWeight: 600 }}>{o.offerTitle} <span className="muted">×{o.quantity}</span></div>
                    {(o.variantSummary || (o.customFields && Object.keys(o.customFields).length > 0)) && (
                      <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {o.variantSummary ? (
                          <Pill color="#2563eb" small>{o.variantSummary}</Pill>
                        ) : (
                          Object.entries(o.customFields || {}).map(([k, v]) => (
                            <Pill key={k} color="#2563eb" small>{fieldLabel(o, k)}: {String(v)}</Pill>
                          ))
                        )}
                      </div>
                    )}
                  </td>
                  <td className="num cell-strong">{money(o.total)}</td>
                  <td><StatusPill status={o.status} /></td>
                  <td>{o.courier?.trackingCode ? <span className="ok-text">{o.courier.trackingCode}</span> : <span className="muted">—</span>}</td>
                  <td>{o.source}</td>
                  <td className="muted">{fmtDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="pager">
          <button disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>‹ Prev</button>
          <span>{num(filters.page)} / {num(pagination.pages)}</span>
          <button disabled={filters.page >= pagination.pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next ›</button>
        </div>
      )}
    </div>
  );
}
