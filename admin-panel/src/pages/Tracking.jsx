import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { fmtDate } from '../constants.js';
import { Pill, Notice } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export default function Tracking() {
  const [tab, setTab] = useState('settings');
  return (
    <div>
      <div className="page-head">
        <h1>Tracking</h1>
        <div className="tabs">
          <button className={'tab' + (tab === 'settings' ? ' active' : '')} onClick={() => setTab('settings')}>Settings</button>
          <button className={'tab' + (tab === 'events' ? ' active' : '')} onClick={() => setTab('events')}>Event log</button>
        </div>
      </div>
      {tab === 'settings' ? <Settings /> : <EventLog />}
    </div>
  );
}

// ─── Settings ───────────────────────────────────────────────
function Settings() {
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/tracking').then((d) => setCfg(d.tracking)).catch((e) => setMsg({ type: 'err', text: e.message }));
  }, []);

  function upd(platform, patch) {
    setCfg((c) => ({ ...c, [platform]: { ...c[platform], ...patch } }));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const d = await api('/tracking', { method: 'PUT', body: cfg });
      setCfg(d.tracking);
      setMsg({ type: 'ok', text: 'Saved.' });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <p className="muted">Loading…</p>;

  return (
    <div className="track-settings">
      <p className="muted" style={{ marginTop: 0 }}>
        The Pixel ID is public (it goes into the page), but tokens/secrets stay on the server and are masked here.
        Leave a token blank to keep the existing one.
      </p>

      {/* Facebook */}
      <PlatformCard title="Facebook" icon="facebook" enabled={cfg.facebook.enabled}
        onToggle={(v) => upd('facebook', { enabled: v })}>
        <Field label="Pixel ID" value={cfg.facebook.pixelId} onChange={(v) => upd('facebook', { pixelId: v })} placeholder="123456789012345" />
        <Secret label="Conversions API Access Token" set={cfg.facebook.accessTokenSet}
          onChange={(v) => upd('facebook', { accessToken: v })} />
        <Field label="Test Event Code (optional)" value={cfg.facebook.testEventCode} onChange={(v) => upd('facebook', { testEventCode: v })} placeholder="TEST12345" />
      </PlatformCard>

      {/* Google */}
      <PlatformCard title="Google (GA4 + Ads)" icon="google" enabled={cfg.google.enabled}
        onToggle={(v) => upd('google', { enabled: v })}>
        <Field label="GA4 Measurement ID" value={cfg.google.measurementId} onChange={(v) => upd('google', { measurementId: v })} placeholder="G-XXXXXXXXXX" />
        <Secret label="Measurement Protocol API Secret" set={cfg.google.apiSecretSet}
          onChange={(v) => upd('google', { apiSecret: v })} />
        <Field label="Google Ads Conversion ID (optional)" value={cfg.google.adsConversionId} onChange={(v) => upd('google', { adsConversionId: v })} placeholder="AW-XXXXXXXXX" />
        <Field label="Google Ads Conversion Label (optional)" value={cfg.google.adsConversionLabel} onChange={(v) => upd('google', { adsConversionLabel: v })} placeholder="abcdEFGhij" />
      </PlatformCard>

      {/* TikTok */}
      <PlatformCard title="TikTok" icon="tiktok" enabled={cfg.tiktok.enabled}
        onToggle={(v) => upd('tiktok', { enabled: v })}>
        <Field label="Pixel ID" value={cfg.tiktok.pixelId} onChange={(v) => upd('tiktok', { pixelId: v })} placeholder="CXXXXXXXXXXXXXXXXX" />
        <Secret label="Events API Access Token" set={cfg.tiktok.accessTokenSet}
          onChange={(v) => upd('tiktok', { accessToken: v })} />
        <Field label="Test Event Code (optional)" value={cfg.tiktok.testEventCode} onChange={(v) => upd('tiktok', { testEventCode: v })} placeholder="TEST12345" />
      </PlatformCard>

      <div className="save-bar">
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {msg && <Notice type={msg.type}>{msg.text}</Notice>}
      </div>
    </div>
  );
}

function PlatformCard({ title, enabled, onToggle, children }) {
  return (
    <div className="card track-card">
      <div className="track-card-head">
        <h3>{title}</h3>
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          <span>{enabled ? 'On' : 'Off'}</span>
        </label>
      </div>
      <div className={enabled ? '' : 'dimmed'}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div className="fld">
      <label>{label}</label>
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Secret({ label, set, onChange }) {
  return (
    <div className="fld">
      <label>{label} {set && <span className="ok-text">✓ configured</span>}</label>
      <input type="password" placeholder={set ? '•••• (enter a new token to change)' : 'Paste token'}
        onChange={(e) => onChange(e.target.value)} autoComplete="off" />
    </div>
  );
}

// ─── Event Log ──────────────────────────────────────────────
function EventLog() {
  const [data, setData] = useState({ events: [], statusCounts: {} });
  const [filters, setFilters] = useState({ platform: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/tracking/events', { params: { ...filters, limit: 100 } });
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const { events, statusCounts } = data;

  return (
    <div>
      <div className="log-toolbar">
        <select value={filters.platform} onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value }))}>
          <option value="">All platforms</option>
          <option value="facebook">Facebook</option>
          <option value="google">Google</option>
          <option value="tiktok">TikTok</option>
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          <option value="success">success</option>
          <option value="failed">failed</option>
        </select>
        <span className="counts">
          {statusCounts.success || 0} success · {statusCounts.failed || 0} failed
        </span>
        <button className="btn-ghost" onClick={load}><Icon name="refresh" size={15} /> Refresh</button>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="muted">No server-side events yet. Try placing a test order.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Time</th><th>Platform</th><th>Event</th><th>Status</th><th className="num">Attempts</th><th>Details</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e._id}>
                  <td className="muted">{fmtDate(e.createdAt)}</td>
                  <td>{e.platform}</td>
                  <td>{e.eventName}</td>
                  <td>
                    <Pill color={e.status === 'success' ? '#10b981' : '#ef4444'}>{e.status}</Pill>
                    {e.error && <div className="err-small">{e.error}</div>}
                  </td>
                  <td className="num">{e.attempts}</td>
                  <td><button className="btn-ghost sm" onClick={() => setOpen(e)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="modal" onClick={() => setOpen(null)}>
          <div className="modal-box" onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-head">
              <h3>{open.platform} · {open.eventName} · {open.eventId}</h3>
              <button className="btn-ghost" onClick={() => setOpen(null)}><Icon name="x" size={16} /></button>
            </div>
            <h4>Payload</h4>
            <pre>{JSON.stringify(open.payload, null, 2)}</pre>
            <h4>Response</h4>
            <pre>{JSON.stringify(open.response, null, 2)}</pre>
            {open.error && <><h4>Error</h4><pre className="err">{open.error}</pre></>}
          </div>
        </div>
      )}
    </div>
  );
}
