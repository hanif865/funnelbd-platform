import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { money, num } from '../constants.js';
import { Pill, Notice } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

// Per-tenant Meta Ads control: paste a token + ad account, then view campaigns
// and pause/resume them. Account-scoped via the JWT (not funnel-scoped).
export default function MetaAds() {
  const [cfg, setCfg] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [form, setForm] = useState({ accessToken: '', adAccountId: '' });
  const [campaigns, setCampaigns] = useState([]);
  const [loadingC, setLoadingC] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadCfg = useCallback(async () => {
    const d = await api('/meta');
    setCfg(d);
    setForm((f) => ({ ...f, adAccountId: d.adAccountId || '' }));
    return d;
  }, []);

  const loadCampaigns = useCallback(async () => {
    setLoadingC(true); setMsg(null);
    try { setCampaigns((await api('/meta/campaigns')).campaigns || []); }
    catch (e) { setMsg({ ok: false, text: e.message }); setCampaigns([]); }
    finally { setLoadingC(false); }
  }, []);

  useEffect(() => { loadCfg().then((d) => { if (d.connected) loadCampaigns(); else setShowSettings(true); }); }, [loadCfg, loadCampaigns]);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const d = await api('/meta', { method: 'PUT', body: form });
      setCfg(d);
      setForm((f) => ({ ...f, accessToken: '' }));
      if (d.connected) { setShowSettings(false); loadCampaigns(); }
      else setMsg({ ok: false, text: 'Enter both the access token and ad account id.' });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  async function toggle(c) {
    const next = c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setBusy(true); setMsg(null);
    try {
      await api('/meta/campaigns/' + c.id + '/status', { method: 'PATCH', body: { status: next } });
      setCampaigns((list) => list.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  if (!cfg) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Meta Ads</h1>
          <p className="muted" style={{ margin: 0 }}>Connect your Facebook ad account to view campaigns and pause / resume them here.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {cfg.connected && <button className="btn-ghost" onClick={loadCampaigns}><Icon name="refresh" size={15} /> Refresh</button>}
          <button className="btn-ghost" onClick={() => setShowSettings((s) => !s)}><Icon name="settings" size={15} /> {cfg.connected ? 'Connection' : 'Connect'}</button>
        </div>
      </div>

      {msg && <Notice type={msg.ok ? 'ok' : 'err'}>{msg.text}</Notice>}

      {showSettings && (
        <div className="card">
          <h3>{cfg.connected ? 'Connection settings' : 'Connect Meta'}</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '.86rem' }}>
            Paste a Meta access token with <b>ads_read</b> + <b>ads_management</b> and your ad account id. Get them from Meta Business → Business Settings → System Users (long-lived token) and Ad Accounts.
          </p>
          <div className="two-col">
            <div className="fld"><label>Access token {cfg.accessTokenSet && <span className="ok-text">✓ set</span>}</label>
              <input type="password" placeholder={cfg.accessTokenSet ? '•••• (enter a new token to change)' : 'EAAG…'} value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} autoComplete="off" />
            </div>
            <div className="fld"><label>Ad account id</label>
              <input placeholder="act_1234567890 or 1234567890" value={form.adAccountId} onChange={(e) => setForm({ ...form, adAccountId: e.target.value })} />
            </div>
          </div>
          <div className="save-bar"><button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save & connect'}</button></div>
        </div>
      )}

      {cfg.connected && (
        loadingC ? <p className="muted">Loading campaigns…</p> :
        campaigns.length === 0 && !msg ? <div className="empty">No campaigns in this ad account.</div> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Campaign</th><th>Status</th><th>Objective</th><th className="num">Daily budget</th><th className="num">Spend (7d)</th><th className="num">Impressions</th><th className="num">Clicks</th><th>Action</th></tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-strong">{c.name}</td>
                    <td><Pill color={c.status === 'ACTIVE' ? '#10b981' : '#6b7280'} small>{c.status}</Pill></td>
                    <td className="muted">{(c.objective || '').replace(/^OUTCOME_/, '')}</td>
                    <td className="num">{c.dailyBudget != null ? money(c.dailyBudget) : '—'}</td>
                    <td className="num">{money(c.spend)}</td>
                    <td className="num">{num(c.impressions)}</td>
                    <td className="num">{num(c.clicks)}</td>
                    <td>
                      <button className={c.status === 'ACTIVE' ? 'btn-ghost sm danger' : 'btn-primary sm'} disabled={busy} onClick={() => toggle(c)}>
                        {c.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
