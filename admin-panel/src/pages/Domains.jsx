import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { Notice, Pill } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

// Account-level custom domains + the free signup subdomain. Not funnel-scoped.
export default function Domains() {
  const [data, setData] = useState({ domains: [], appDomain: '', tlsAuto: false });
  const [adding, setAdding] = useState(false);
  const [host, setHost] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setData(await api('/domains'));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!host.trim()) return;
    setBusy(true); setMsg(null);
    try {
      await api('/domains', { method: 'POST', body: { host } });
      setHost(''); setAdding(false);
      await load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  async function verify(d) {
    setBusy(true); setMsg(null);
    try {
      const r = await api('/domains/' + d._id + '/verify', { method: 'POST' });
      setMsg(r.verified ? { ok: true, text: `${d.host} verified!` } : { ok: false, text: r.error || 'Not verified yet.' });
      await load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  async function makePrimary(d) {
    try { await api('/domains/' + d._id + '/primary', { method: 'POST' }); await load(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  async function remove(d) {
    if (!confirm(`Disconnect ${d.host}?`)) return;
    try { await api('/domains/' + d._id, { method: 'DELETE' }); await load(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Domains</h1>
          <p className="muted" style={{ margin: 0 }}>Your free subdomain and any custom domains that serve your funnels.</p>
        </div>
        <button className="btn-primary" onClick={() => { setAdding(true); setMsg(null); }}><Icon name="plus" size={16} /> Add custom domain</button>
      </div>

      {msg && <Notice type={msg.ok ? 'ok' : 'err'}>{msg.text}</Notice>}
      {!data.tlsAuto && (
        <p className="muted" style={{ fontSize: '.84rem' }}>
          Note: automatic HTTPS for custom domains isn’t configured on this server — TLS must be handled by the operator (e.g. Cloudflare for SaaS).
        </p>
      )}

      {adding && (
        <div className="card">
          <h3>Connect a custom domain</h3>
          <div className="zone-edit add">
            <input placeholder="shop.yourbrand.com" value={host} onChange={(e) => setHost(e.target.value)} autoFocus />
            <button className="btn-primary" onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
            <button className="btn-ghost" onClick={() => { setAdding(false); setHost(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {data.domains.map((d) => (
        <div className="card" key={d._id}>
          <div className="offer-admin-head" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: '1rem' }}>{d.host}</b>
            <Pill color={d.type === 'subdomain' ? '#64748b' : '#7c3aed'} small>{d.type === 'subdomain' ? 'Free subdomain' : 'Custom'}</Pill>
            {d.verified ? <Pill color="#10b981" small>Verified</Pill> : <Pill color="#f59e0b" small>Pending DNS</Pill>}
            {d.isPrimary && <Pill color="#0ea5e9" small>Primary</Pill>}
            <a href={`https://${d.host}/funnel-step/checkout/`} target="_blank" rel="noreferrer" className="muted" style={{ marginLeft: 'auto', fontSize: '.84rem' }}>
              Open <Icon name="external" size={13} />
            </a>
          </div>

          {d.instructions && (
            <div style={{ marginTop: 10 }}>
              <p className="muted" style={{ margin: '0 0 6px', fontSize: '.86rem' }}>Add these DNS records at your domain provider, then click Verify:</p>
              <DnsRow rec={d.instructions.cname} />
              <DnsRow rec={d.instructions.txt} />
            </div>
          )}

          <div className="fr-actions" style={{ marginTop: 10, gap: 6, flexWrap: 'wrap' }}>
            {d.type === 'custom' && !d.verified && (
              <button className="btn-primary sm" onClick={() => verify(d)} disabled={busy}><Icon name="refresh" size={14} /> Verify</button>
            )}
            {d.verified && !d.isPrimary && (
              <button className="btn-ghost sm" onClick={() => makePrimary(d)}>Make primary</button>
            )}
            {d.type === 'custom' && (
              <button className="btn-ghost sm danger" onClick={() => remove(d)}><Icon name="trash" size={14} /> Disconnect</button>
            )}
          </div>
        </div>
      ))}

      {data.domains.length === 0 && <div className="empty">No domains yet.</div>}
    </div>
  );
}

function DnsRow({ rec }) {
  return (
    <div className="kv" style={{ fontFamily: 'monospace', fontSize: '.8rem', alignItems: 'start' }}>
      <span style={{ minWidth: 48 }}>{rec.type}</span>
      <b style={{ wordBreak: 'break-all', textAlign: 'left' }}>{rec.name} &nbsp;→&nbsp; {rec.value}</b>
    </div>
  );
}
