import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { getSeenAt, markErrorsSeen } from '../components/SystemHealth.jsx';

const DB_STATE = {
  connected: { label: 'সংযুক্ত', cls: 'ok' },
  connecting: { label: 'সংযোগ হচ্ছে…', cls: 'warning' },
  disconnected: { label: 'সংযোগ নেই', cls: 'critical' },
};
const SEVERITY = {
  critical: { label: 'জরুরি', cls: 'critical' },
  error: { label: 'ত্রুটি', cls: 'error' },
  warning: { label: 'সতর্কতা', cls: 'warning' },
};

const fmt = (d) => (d ? new Date(d).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/**
 * System Status: database connection, storage usage and recent server/DB
 * errors in plain Bangla with what to do. Works while the DB is down (the
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
      setErr(e.status ? e.message : 'সার্ভারে পৌঁছানো যাচ্ছে না।');
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
        <h1>সিস্টেম স্ট্যাটাস</h1>
        <div className="head-tools">
          <button className="btn-ghost" onClick={load}>রিফ্রেশ</button>
          {errors.length > 0 && <button className="btn-outline" onClick={markSeen}>সব দেখা হয়েছে</button>}
        </div>
      </div>

      {err && <p className="err">{err}</p>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">ডেটাবেস সংযোগ</div>
          <div className={'stat-value sys-' + dbInfo.cls}>{dbInfo.label}</div>
          <div className="stat-sub">
            {db ? `${db.state === 'connected' ? 'চালু আছে' : 'বন্ধ আছে'} ${fmt(db.since)} থেকে` : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">ডেটাবেস স্টোরেজ (আনুমানিক)</div>
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
            <div className="stat-sub">জানা যাচ্ছে না (ডেটাবেস সংযোগ দরকার)</div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-label">গত ৭ দিনের ত্রুটি</div>
          <div className="stat-value">{errors.length}</div>
          <div className="stat-sub">একই ত্রুটি বারবার হলে একবারই দেখানো হয় (×সংখ্যা)</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>সাম্প্রতিক ত্রুটি</h3>
        {!data && !err && <p className="muted">লোড হচ্ছে…</p>}
        {data && errors.length === 0 && <p className="ok-text">✅ কোনো ত্রুটি নেই — সব ঠিকঠাক চলছে।</p>}
        <div className="sys-list">
          {errors.map((e) => {
            const sev = SEVERITY[e.severity] || SEVERITY.error;
            const isNew = new Date(e.lastAt).getTime() > seenAt;
            const id = String(e._id);
            return (
              <div key={id} className={'sys-item ' + sev.cls + (isNew ? ' new' : '')}>
                <div className="sys-item-head" onClick={() => setOpen(open === id ? null : id)}>
                  <span className={'pill sys-pill ' + sev.cls}>{sev.label}</span>
                  <strong>{e.title}</strong>
                  {e.count > 1 && <span className="muted"> ×{e.count}</span>}
                  {isNew && <span className="sys-new">নতুন</span>}
                  <span className="muted sys-time">{fmt(e.lastAt)}</span>
                </div>
                <div className="sys-hint">👉 {e.hint}</div>
                {open === id ? (
                  <pre className="sys-tech">
                    {`সময় (প্রথম): ${fmt(e.createdAt)}\nসময় (শেষ): ${fmt(e.lastAt)}\nজায়গা: ${e.source}${e.path ? ' · ' + e.path : ''} · ${e.process}\n${e.code != null ? 'কোড: ' + e.code + '\n' : ''}মেসেজ: ${e.message}`}
                  </pre>
                ) : (
                  <button className="btn-ghost sm" onClick={() => setOpen(id)}>টেকনিক্যাল বিস্তারিত</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
