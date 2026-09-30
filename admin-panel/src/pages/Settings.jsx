import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Notice } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export default function Settings() {
  const [tab, setTab] = useState('general');
  return (
    <div>
      <div className="page-head">
        <h1>Settings</h1>
        <div className="tabs">
          {[['general', 'General'], ['courier', 'Courier'], ['users', 'Users']].map(([k, l]) => (
            <button key={k} className={'tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>
      {tab === 'general' && <GeneralTab />}
      {tab === 'courier' && <CourierTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  );
}

// ─── Store helpline numbers (each gets its own call/WhatsApp button) ──
const MAX_PHONES = 5;
function StorePhones({ phones, onChange }) {
  const set = (i, patch) => onChange(phones.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const remove = (i) => onChange(phones.filter((_, j) => j !== i));
  const move = (i, d) => {
    const next = [...phones];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="fld">
      <label>Helpline numbers <span className="muted">(each number gets its own call button on the landing page; the first is the SMS {'{{storePhone}}'})</span></label>
      {phones.map((p, i) => (
        <div key={i} className="phone-row">
          <input placeholder="01XXXXXXXXX" value={p.number} onChange={(e) => set(i, { number: e.target.value })} />
          <input placeholder="Label (optional) — e.g. To order" value={p.label} onChange={(e) => set(i, { label: e.target.value })} />
          <label className="cbx"><input type="checkbox" checked={!!p.whatsapp} onChange={(e) => set(i, { whatsapp: e.target.checked })} /> WhatsApp</label>
          <button type="button" className="btn-ghost sm" disabled={i === 0} onClick={() => move(i, -1)} title="Move up"><Icon name="up" size={14} /></button>
          <button type="button" className="btn-ghost sm" disabled={i === phones.length - 1} onClick={() => move(i, 1)} title="Move down"><Icon name="down" size={14} /></button>
          <button type="button" className="btn-ghost sm danger" onClick={() => remove(i)}>Remove</button>
        </div>
      ))}
      {phones.length < MAX_PHONES && (
        <button type="button" className="btn-outline" style={{ marginTop: 6 }} onClick={() => onChange([...phones, { number: '', label: '', whatsapp: false }])}>
          <Icon name="plus" size={15} /> Add number
        </button>
      )}
    </div>
  );
}

// ─── General ─────────────────────────────────────────────
function GeneralTab() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/settings').then(setS); }, []);
  function upd(sec, patch) { setS((x) => ({ ...x, [sec]: { ...x[sec], ...patch } })); }
  function updTpl(patch) { setS((x) => ({ ...x, sms: { ...x.sms, templates: { ...x.sms.templates, ...patch } } })); }

  async function save() {
    setBusy(true); setMsg('');
    try {
      const body = { duplicateCooldown: s.duplicateCooldown, storeInfo: s.storeInfo, sms: { ...s.sms } };
      if (String(body.sms.apiKey || '').startsWith('••••')) body.sms.apiKey = '';
      setS(await api('/settings', { method: 'PUT', body }));
      setMsg('Saved.');
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  if (!s) return <p className="muted">Loading…</p>;
  return (
    <div>
      <div className="card">
        <h3>Duplicate-order cooldown</h3>
        <label className="cbx"><input type="checkbox" checked={s.duplicateCooldown.enabled} onChange={(e) => upd('duplicateCooldown', { enabled: e.target.checked })} /> Enabled</label>
        <div className="fld" style={{ marginTop: 8 }}><label>Hours</label><input type="number" value={s.duplicateCooldown.hours} onChange={(e) => upd('duplicateCooldown', { hours: Number(e.target.value) || 0 })} /></div>
        <div className="fld"><label>Blocked-customer message</label><textarea rows={2} value={s.duplicateCooldown.message} onChange={(e) => upd('duplicateCooldown', { message: e.target.value })} /></div>
      </div>
      <div className="card">
        <h3>Store info</h3>
        <StorePhones phones={s.storeInfo.phones || []} onChange={(phones) => upd('storeInfo', { phones })} />
        <div className="fld"><label>Address</label><input value={s.storeInfo.address} onChange={(e) => upd('storeInfo', { address: e.target.value })} /></div>
      </div>
      <div className="card">
        <h3>SMS gateway</h3>
        <label className="cbx"><input type="checkbox" checked={s.sms.enabled} onChange={(e) => upd('sms', { enabled: e.target.checked })} /> SMS enabled</label>
        <div className="two-col" style={{ marginTop: 8 }}>
          <div className="fld"><label>API URL</label><input value={s.sms.apiUrl} onChange={(e) => upd('sms', { apiUrl: e.target.value })} /></div>
          <div className="fld"><label>Method</label><select value={s.sms.method} onChange={(e) => upd('sms', { method: e.target.value })}><option>GET</option><option>POST</option></select></div>
        </div>
        <div className="two-col">
          <div className="fld"><label>API Key {s.sms.apiKeySet && <span className="ok-text">✓</span>}</label><input type="password" placeholder={s.sms.apiKeySet ? '•••• (enter a new one to change)' : 'key'} onChange={(e) => upd('sms', { apiKey: e.target.value })} /></div>
          <div className="fld"><label>Sender ID</label><input value={s.sms.senderId} onChange={(e) => upd('sms', { senderId: e.target.value })} /></div>
        </div>
        <div className="fld"><label>Confirmation template <span className="muted">{'{{name}} {{orderNumber}} {{total}}'}</span></label><textarea rows={2} value={s.sms.templates.confirmation} onChange={(e) => updTpl({ confirmation: e.target.value })} /></div>
        <label className="cbx"><input type="checkbox" checked={s.sms.followUpEnabled} onChange={(e) => upd('sms', { followUpEnabled: e.target.checked })} /> Auto follow-up SMS (after {s.sms.followUpDelayMinutes} minutes)</label>
        <div className="fld" style={{ marginTop: 8 }}><label>Follow-up template <span className="muted">{'{{storePhone}}'}</span></label><textarea rows={2} value={s.sms.templates.followUp} onChange={(e) => updTpl({ followUp: e.target.value })} /></div>
      </div>
      <div className="save-bar sticky-save"><button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>{msg && <Notice type="ok">{msg}</Notice>}</div>
    </div>
  );
}

// ─── Courier ─────────────────────────────────────────────
function CourierTab() {
  const [c, setC] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/courier').then((d) => setC(d.courier)); }, []);
  function upd(sec, patch) { setC((x) => ({ ...x, [sec]: { ...x[sec], ...patch } })); }

  async function save() {
    setBusy(true); setMsg('');
    try {
      const body = JSON.parse(JSON.stringify(c));
      // strip masked secrets so they aren't re-sent as literals
      ['apiKey', 'secretKey'].forEach((k) => { if (String(body.steadfast[k] || '').startsWith('••••')) body.steadfast[k] = ''; });
      ['clientSecret', 'password'].forEach((k) => { if (String(body.pathao[k] || '').startsWith('••••')) body.pathao[k] = ''; });
      if (String(body.fraudCheck.apiKey || '').startsWith('••••')) body.fraudCheck.apiKey = '';
      setC((await api('/courier', { method: 'PUT', body })).courier);
      setMsg('Saved.');
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  if (!c) return <p className="muted">Loading…</p>;
  return (
    <div>
      <div className="card">
        <h3>Active provider</h3>
        <select value={c.provider} onChange={(e) => setC({ ...c, provider: e.target.value })} style={{ maxWidth: 240 }}>
          <option value="">— None —</option>
          <option value="steadfast">Steadfast</option>
          <option value="pathao">Pathao</option>
        </select>
      </div>
      <div className="card">
        <h3>Steadfast</h3>
        <label className="cbx"><input type="checkbox" checked={c.steadfast.enabled} onChange={(e) => upd('steadfast', { enabled: e.target.checked })} /> Enabled</label>
        <div className="two-col" style={{ marginTop: 8 }}>
          <div className="fld"><label>API Key {c.steadfast.apiKeySet && <span className="ok-text">✓</span>}</label><input type="password" placeholder={c.steadfast.apiKeySet ? '••••' : ''} onChange={(e) => upd('steadfast', { apiKey: e.target.value })} /></div>
          <div className="fld"><label>Secret Key {c.steadfast.secretKeySet && <span className="ok-text">✓</span>}</label><input type="password" placeholder={c.steadfast.secretKeySet ? '••••' : ''} onChange={(e) => upd('steadfast', { secretKey: e.target.value })} /></div>
        </div>
      </div>
      <div className="card">
        <h3>Pathao</h3>
        <label className="cbx"><input type="checkbox" checked={c.pathao.enabled} onChange={(e) => upd('pathao', { enabled: e.target.checked })} /> Enabled</label>
        <div className="two-col" style={{ marginTop: 8 }}>
          <div className="fld"><label>Client ID</label><input value={c.pathao.clientId} onChange={(e) => upd('pathao', { clientId: e.target.value })} /></div>
          <div className="fld"><label>Client Secret {c.pathao.clientSecretSet && <span className="ok-text">✓</span>}</label><input type="password" placeholder={c.pathao.clientSecretSet ? '••••' : ''} onChange={(e) => upd('pathao', { clientSecret: e.target.value })} /></div>
          <div className="fld"><label>Username</label><input value={c.pathao.username} onChange={(e) => upd('pathao', { username: e.target.value })} /></div>
          <div className="fld"><label>Password {c.pathao.passwordSet && <span className="ok-text">✓</span>}</label><input type="password" placeholder={c.pathao.passwordSet ? '••••' : ''} onChange={(e) => upd('pathao', { password: e.target.value })} /></div>
          <div className="fld"><label>Store ID</label><input value={c.pathao.storeId} onChange={(e) => upd('pathao', { storeId: e.target.value })} /></div>
        </div>
      </div>
      <div className="card">
        <h3>External fraud check (optional)</h3>
        <p className="muted" style={{ marginTop: 0 }}>Even when off, the fraud signal still works from your own order history.</p>
        <label className="cbx"><input type="checkbox" checked={c.fraudCheck.externalEnabled} onChange={(e) => upd('fraudCheck', { externalEnabled: e.target.checked })} /> External API enabled</label>
        <div className="two-col" style={{ marginTop: 8 }}>
          <div className="fld"><label>API URL</label><input value={c.fraudCheck.apiUrl} onChange={(e) => upd('fraudCheck', { apiUrl: e.target.value })} /></div>
          <div className="fld"><label>API Key {c.fraudCheck.apiKeySet && <span className="ok-text">✓</span>}</label><input type="password" placeholder={c.fraudCheck.apiKeySet ? '••••' : ''} onChange={(e) => upd('fraudCheck', { apiKey: e.target.value })} /></div>
        </div>
      </div>
      <div className="save-bar sticky-save"><button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>{msg && <Notice type="ok">{msg}</Notice>}</div>
    </div>
  );
}

// ─── Users ───────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [adding, setAdding] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [msg, setMsg] = useState(null);
  async function load() { setUsers((await api('/users')).users); }
  useEffect(() => { load(); }, []);

  async function create() {
    setMsg(null);
    try { await api('/users', { method: 'POST', body: adding }); setAdding({ name: '', email: '', password: '', role: 'staff' }); load(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  async function update(id, patch) { try { await api('/users/' + id, { method: 'PUT', body: patch }); load(); } catch (e) { setMsg({ ok: false, text: e.message }); } }
  async function remove(id) { if (!confirm('Delete this user?')) return; try { await api('/users/' + id, { method: 'DELETE' }); load(); } catch (e) { setMsg({ ok: false, text: e.message }); } }
  async function resetPw(id) { const pw = prompt('New password (6+ characters):'); if (!pw) return; try { await api('/users/' + id + '/password', { method: 'POST', body: { password: pw } }); setMsg({ ok: true, text: 'Password reset.' }); } catch (e) { setMsg({ ok: false, text: e.message }); } }

  return (
    <div>
      {msg && <Notice type={msg.ok ? 'ok' : 'err'}>{msg.text}</Notice>}
      <div className="card">
        <h3>Panel users</h3>
        <p className="muted" style={{ marginTop: 0 }}>Admin = everything · Staff = order management only (not settings / tracking / config).</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td>{u.name}</td><td>{u.email}</td>
                  <td><select className="mini-select" value={u.role} onChange={(e) => update(u._id, { role: e.target.value })}><option value="admin">admin</option><option value="staff">staff</option></select></td>
                  <td><input type="checkbox" checked={u.active} onChange={(e) => update(u._id, { active: e.target.checked })} /></td>
                  <td><div className="row-actions"><button className="btn-ghost sm" onClick={() => resetPw(u._id)}>Password</button><button className="btn-ghost sm danger" onClick={() => remove(u._id)} title="Delete"><Icon name="trash" size={15} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>New user</h3>
        <div className="two-col">
          <div className="fld"><label>Name</label><input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} /></div>
          <div className="fld"><label>Email</label><input type="email" value={adding.email} onChange={(e) => setAdding({ ...adding, email: e.target.value })} /></div>
          <div className="fld"><label>Password</label><input type="password" value={adding.password} onChange={(e) => setAdding({ ...adding, password: e.target.value })} /></div>
          <div className="fld"><label>Role</label><select value={adding.role} onChange={(e) => setAdding({ ...adding, role: e.target.value })}><option value="staff">staff</option><option value="admin">admin</option></select></div>
        </div>
        <button className="btn-primary" onClick={create}>Create user</button>
      </div>
    </div>
  );
}
