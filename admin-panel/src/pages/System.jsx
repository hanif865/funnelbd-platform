import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { getSeenAt, markErrorsSeen, isRecoveredConnectionError } from '../components/SystemHealth.jsx';

const DB_STATE = {
  connected: { label: 'Connected', cls: 'ok' },
  connecting: { label: 'Connecting…', cls: 'warning' },
  disconnected: { label: 'Disconnected', cls: 'critical' },
};
const SEVERITY = {
  critical: { label: 'Critical', cls: 'critical' },
  error: { label: 'Error', cls: 'error' },
  warning: { label: 'Warning', cls: 'warning' },
};

const fmt = (d) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/**
 * System Status: database connection, storage usage and recent server/DB
 * errors in plain English with what to do. Works while the DB is down (the
 * health endpoint needs no database).
 */
export default function System() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  const [seenAt, setSeenAt] = useState(getSeenAt());

  async function load() {
    try {
      setData(await api('/system/health'));
      setErr('');
    } catch (e) {
      setErr(e.status ? e.message : 'Cannot reach the server.');
    }
  }
  useEffect(() => {
    load();
  }, []);

  function markSeen() {
    markErrorsSeen();
    setSeenAt(getSeenAt());
  }

  const db = data?.db;
  const dbInfo = DB_STATE[db?.state] || DB_STATE.connecting;
  const storage = data?.storage;
  const errors = data?.errors || [];

  return (
    <div>
      <div className="page-head">
        <h1>System status</h1>
        <div className="head-tools">
          <button className="btn-ghost" onClick={load}>Refresh</button>
          {errors.length > 0 && <button className="btn-outline" onClick={markSeen}>Mark all seen</button>}
        </div>
      </div>

      {err && <p className="err">{err}</p>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Database connection</div>
          <div className={'stat-value sys-' + dbInfo.cls}>{dbInfo.label}</div>
          <div className="stat-sub">
            {db ? `${db.state === 'connected' ? 'Up' : 'Down'} since ${fmt(db.since)}` : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Database storage (approx.)</div>
          {storage ? (
            <>
              <div className={'stat-value ' + (storage.percent >= 90 ? 'sys-critical' : storage.percent >= 80 ? 'sys-warning' : '')}>
                {storage.percent}%
              </div>
              <div className="sys-meter">
                <span style={{ width: Math.min(100, storage.percent) + '%' }} className={storage.percent >= 90 ? 'critical' : storage.percent >= 80 ? 'warning' : 'ok'} />
              </div>
              <div className="stat-sub">{storage.usedMb}MB / {storage.limitMb}MB</div>
            </>
          ) : (
            <div className="stat-sub">Unavailable (needs a database connection)</div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-label">Errors in the last 7 days</div>
          <div className="stat-value">{errors.length}</div>
          <div className="stat-sub">Repeated identical errors are shown once (×count)</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Recent errors</h3>
        {!data && !err && <p className="muted">Loading…</p>}
        {data && errors.length === 0 && <p className="ok-text">✓ No errors — everything is running fine.</p>}
        <div className="sys-list">
          {errors.map((e) => {
            const sev = SEVERITY[e.severity] || SEVERITY.error;
            const isNew = new Date(e.lastAt).getTime() > seenAt;
            const id = String(e._id);
            // Connection errors are history once the DB is connected again.
            const recovered = db?.state === 'connected' && isRecoveredConnectionError(e);
            return (
              <div key={id} className={'sys-item ' + (recovered ? 'recovered' : sev.cls) + (isNew ? ' new' : '')}>
                <div className="sys-item-head" onClick={() => setOpen(open === id ? null : id)}>
                  {recovered
                    ? <span className="pill sys-pill ok">✓ Resolved</span>
                    : <span className={'pill sys-pill ' + sev.cls}>{sev.label}</span>}
                  <strong>{e.title}</strong>
                  {e.count > 1 && <span className="muted"> ×{e.count}</span>}
                  {isNew && <span className="sys-new">New</span>}
                  <span className="muted sys-time">{fmt(e.lastAt)}</span>
                </div>
                <div className="sys-hint">
                  {recovered
                    ? 'The connection dropped briefly and the app reconnected on its own — nothing to do. If it happens many times a day, consider upgrading the Atlas plan.'
                    : '→ ' + e.hint}
                </div>
                {open === id ? (
                  <pre className="sys-tech">
                    {`First seen: ${fmt(e.createdAt)}\nLast seen: ${fmt(e.lastAt)}\nSource: ${e.source}${e.path ? ' · ' + e.path : ''} · ${e.process}\n${e.code != null ? 'Code: ' + e.code + '\n' : ''}Message: ${e.message}`}
                  </pre>
                ) : (
                  <button className="btn-ghost sm" onClick={() => setOpen(id)}>Technical details</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
