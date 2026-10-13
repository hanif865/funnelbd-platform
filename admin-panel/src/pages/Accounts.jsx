import { useEffect, useState, useCallback } from 'react';
import { api, setImpersonate } from '../api.js';
import { money, num } from '../constants.js';
import { Pill, Notice } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

// Platform super-admin: every tenant account, with suspend/activate and
// "manage as" (impersonate via the X-Account-Id header, full reload).
export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAccounts((await api('/superadmin/accounts')).accounts); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(a, status) {
    try {
      await api('/superadmin/accounts/' + a._id + '/status', { method: 'PATCH', body: { status } });
      load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  function manage(a) {
    setImpersonate(a._id);
    localStorage.setItem('fbd_admin_impersonate_name', a.name);
    // Full reload so every page re-initialises scoped to this account.
    window.location.href = '/admin/orders';
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p className="muted" style={{ margin: 0 }}>Every store on the platform. Suspend blocks the store and its team.</p>
        </div>
        <span className="muted">{num(accounts.length)} account{accounts.length === 1 ? '' : 's'}</span>
      </div>

      {msg && <Notice type={msg.ok ? 'ok' : 'err'}>{msg.text}</Notice>}

      {loading ? <p className="muted">Loading…</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Store</th><th>Owner</th><th>Primary domain</th><th className="num">Funnels</th><th className="num">Orders</th><th className="num">Revenue</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a._id}>
                  <td><div className="cell-strong">{a.name}</div><div className="muted">{a.slug}</div></td>
                  <td>{a.ownerEmail || <span className="muted">—</span>}</td>
                  <td className="muted">{a.primaryHost}</td>
                  <td className="num">{num(a.funnels)}</td>
                  <td className="num">{num(a.orders)}</td>
                  <td className="num cell-strong">{money(a.revenue)}</td>
                  <td>
                    <Pill color={a.status === 'active' ? '#10b981' : a.status === 'suspended' ? '#ef4444' : '#f59e0b'} small>{a.status}</Pill>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-ghost sm" onClick={() => manage(a)}><Icon name="external" size={14} /> Manage</button>
                      {a.status === 'suspended'
                        ? <button className="btn-ghost sm" onClick={() => setStatus(a, 'active')}>Activate</button>
                        : <button className="btn-ghost sm danger" onClick={() => setStatus(a, 'suspended')}>Suspend</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
