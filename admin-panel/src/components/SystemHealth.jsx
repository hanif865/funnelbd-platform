import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const SEEN_KEY = 'fbd_errors_seen_at';
const POLL_MS = 60 * 1000;
const SEEN_EVENT = 'fbd-errors-seen';

export function getSeenAt() {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Mark all current errors as seen (clears banner + badge everywhere). */
export function markErrorsSeen() {
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/**
 * Polls /system/health (token-only endpoint, works while the DB is down).
 * Returns { health, unreachable, unseen, refresh }.
 */
export function useSystemHealth() {
  const [health, setHealth] = useState(null);
  const [unreachable, setUnreachable] = useState(false);
  const [seenAt, setSeenAt] = useState(getSeenAt());

  const refresh = useCallback(async () => {
    try {
      const data = await api('/system/health');
      setHealth(data);
      setUnreachable(false);
    } catch (e) {
      // 401 is handled by the auth flow; anything else = server unreachable.
      if (e.status !== 401) setUnreachable(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    const onSeen = () => setSeenAt(getSeenAt());
    window.addEventListener('focus', onFocus);
    window.addEventListener(SEEN_EVENT, onSeen);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(SEEN_EVENT, onSeen);
    };
  }, [refresh]);

  const unseen = (health?.errors || []).filter((e) => new Date(e.lastAt).getTime() > seenAt);
  return { health, unreachable, unseen, refresh };
}

/** Top-of-page warning banner. Renders nothing when all is well. */
export function SystemBanner({ health, unreachable, unseen }) {
  let level = null;
  let text = '';

  if (unreachable) {
    level = 'critical';
    text = 'সার্ভারে পৌঁছানো যাচ্ছে না — ইন্টারনেট সংযোগ বা সার্ভার চালু আছে কিনা দেখুন।';
  } else if (health && health.db?.state !== 'connected') {
    level = 'critical';
    const dbErr = (health.errors || []).find((e) => e.source === 'db' || ['db_unreachable', 'auth_failed'].includes(e.kind));
    text = (dbErr?.title || 'ডেটাবেসের সাথে সংযোগ নেই') + ' — নতুন অর্ডার সেভ হচ্ছে না!';
  } else if (unseen.some((e) => e.severity === 'critical')) {
    level = 'critical';
    text = unseen.find((e) => e.severity === 'critical').title;
  } else if (health?.storage?.percent >= 80) {
    level = health.storage.percent >= 90 ? 'critical' : 'warning';
    text = `ডেটাবেসের স্টোরেজ ${health.storage.percent}% ভরে গেছে (${health.storage.usedMb}MB / ${health.storage.limitMb}MB)।`;
  } else if (unseen.length) {
    level = 'warning';
    text = `${unseen.length}টি নতুন সিস্টেম ত্রুটি হয়েছে।`;
  }

  if (!level) return null;
  return (
    <div className={'sys-banner ' + level} role="alert">
      <span>{level === 'critical' ? '⛔' : '⚠️'} {text}</span>
      <Link to="/system">বিস্তারিত দেখুন →</Link>
    </div>
  );
}
