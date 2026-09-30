import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { bnDate } from '../constants.js';

export default function Tracking() {
  const [tab, setTab] = useState('settings');
  return (
    <div>
      <div className="page-head">
        <h1>ট্র্যাকিং</h1>
        <div className="tabs">
          <button className={'tab' + (tab === 'settings' ? ' active' : '')} onClick={() => setTab('settings')}>সেটিংস</button>
          <button className={'tab' + (tab === 'events' ? ' active' : '')} onClick={() => setTab('events')}>ইভেন্ট লগ</button>
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
      setMsg({ type: 'ok', text: 'সেভ হয়েছে।' });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <p className="muted">লোড হচ্ছে…</p>;

  return (
    <div className="track-settings">
      <p className="muted" style={{ marginTop: 0 }}>
        Pixel ID পাবলিক (পেজে যায়), কিন্তু টোকেন/সিক্রেট শুধু সার্ভারে থাকে ও এখানে মাস্ক করা।
        টোকেন না বদলালে ফাঁকা রাখো — আগেরটাই থাকবে।
      </p>

      {/* Facebook */}
      <PlatformCard title="Facebook" icon="📘" enabled={cfg.facebook.enabled}
        onToggle={(v) => upd('facebook', { enabled: v })}>
        <Field label="Pixel ID" value={cfg.facebook.pixelId} onChange={(v) => upd('facebook', { pixelId: v })} placeholder="123456789012345" />
        <Secret label="Conversions API Access Token" set={cfg.facebook.accessTokenSet}
          onChange={(v) => upd('facebook', { accessToken: v })} />
        <Field label="Test Event Code (ঐচ্ছিক)" value={cfg.facebook.testEventCode} onChange={(v) => upd('facebook', { testEventCode: v })} placeholder="TEST12345" />
      </PlatformCard>

      {/* Google */}
      <PlatformCard title="Google (GA4 + Ads)" icon="🟡" enabled={cfg.google.enabled}
        onToggle={(v) => upd('google', { enabled: v })}>
        <Field label="GA4 Measurement ID" value={cfg.google.measurementId} onChange={(v) => upd('google', { measurementId: v })} placeholder="G-XXXXXXXXXX" />
        <Secret label="Measurement Protocol API Secret" set={cfg.google.apiSecretSet}
          onChange={(v) => upd('google', { apiSecret: v })} />
        <Field label="Google Ads Conversion ID (ঐচ্ছিক)" value={cfg.google.adsConversionId} onChange={(v) => upd('google', { adsConversionId: v })} placeholder="AW-XXXXXXXXX" />
        <Field label="Google Ads Conversion Label (ঐচ্ছিক)" value={cfg.google.adsConversionLabel} onChange={(v) => upd('google', { adsConversionLabel: v })} placeholder="abcdEFGhij" />
      </PlatformCard>

      {/* TikTok */}
      <PlatformCard title="TikTok" icon="⚫" enabled={cfg.tiktok.enabled}
        onToggle={(v) => upd('tiktok', { enabled: v })}>
        <Field label="Pixel ID" value={cfg.tiktok.pixelId} onChange={(v) => upd('tiktok', { pixelId: v })} placeholder="CXXXXXXXXXXXXXXXXX" />
        <Secret label="Events API Access Token" set={cfg.tiktok.accessTokenSet}
          onChange={(v) => upd('tiktok', { accessToken: v })} />
        <Field label="Test Event Code (ঐচ্ছিক)" value={cfg.tiktok.testEventCode} onChange={(v) => upd('tiktok', { testEventCode: v })} placeholder="TEST12345" />
      </PlatformCard>

      <div className="save-bar">
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'সেভ হচ্ছে…' : 'সেভ করুন'}</button>
        {msg && <span className={msg.type === 'ok' ? 'ok-text' : 'err'}>{msg.text}</span>}
      </div>
    </div>
  );
}

function PlatformCard({ title, icon, enabled, onToggle, children }) {
  return (
    <div className="card track-card">
      <div className="track-card-head">
        <h3>{icon} {title}</h3>
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          <span>{enabled ? 'চালু' : 'বন্ধ'}</span>
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
      <label>{label} {set && <span className="ok-text">✓ কনফিগার করা</span>}</label>
      <input type="password" placeholder={set ? '•••• (বদলাতে নতুন টোকেন দিন)' : 'টোকেন পেস্ট করুন'}
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
          <option value="">সব প্ল্যাটফর্ম</option>
          <option value="facebook">Facebook</option>
          <option value="google">Google</option>
          <option value="tiktok">TikTok</option>
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">সব স্ট্যাটাস</option>
          <option value="success">success</option>
          <option value="failed">failed</option>
        </select>
        <span className="counts">
          ✅ {statusCounts.success || 0} · ❌ {statusCounts.failed || 0}
        </span>
        <button className="btn-ghost" onClick={load}>↻ রিফ্রেশ</button>
      </div>

      {loading ? (
        <p className="muted">লোড হচ্ছে…</p>
      ) : events.length === 0 ? (
        <p className="muted">এখনো কোনো সার্ভার-সাইড ইভেন্ট যায়নি। একটা টেস্ট অর্ডার করুন।</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>সময়</th><th>প্ল্যাটফর্ম</th><th>ইভেন্ট</th><th>স্ট্যাটাস</th><th>attempts</th><th>বিস্তারিত</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e._id}>
                  <td className="muted">{bnDate(e.createdAt)}</td>
                  <td>{e.platform}</td>
                  <td>{e.eventName}</td>
                  <td>
                    <span className="pill" style={{ background: e.status === 'success' ? '#10b981' : '#ef4444' }}>
                      {e.status}
                    </span>
                    {e.error && <div className="err-small">{e.error}</div>}
                  </td>
                  <td>{e.attempts}</td>
                  <td><button className="btn-ghost sm" onClick={() => setOpen(e)}>দেখুন</button></td>
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
              <button className="btn-ghost" onClick={() => setOpen(null)}>✕</button>
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
