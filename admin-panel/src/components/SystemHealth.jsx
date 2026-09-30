import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Icon from './Icon.jsx';

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

/**
 * Connection-type errors are over once the database is connected again; they
 * stay in the list as history but must not read as an ongoing outage.
 */
const CONNECTION_KINDS = ['db_unreachable', 'db_timeout', 'auth_failed'];
export function isRecoveredConnectionError(e) {
  return CONNECTION_KINDS.includes(e.kind);
}

/** Top-of-page warning banner. Renders nothing when all is well. */
export function SystemBanner({ health, unreachable, unseen }) {
  let level = null;
  let text = '';

  if (unreachable) {
    level = 'critical';
    text = 'Cannot reach the server — check your internet connection and that the server is running.';
  } else if (health && health.db?.state !== 'connected') {
    level = 'critical';
    const dbErr = (health.errors || []).find((e) => e.source === 'db' || ['db_unreachable', 'auth_failed'].includes(e.kind));
    text = (dbErr?.title || 'No database connection') + ' — new orders are not being saved!';
  } else if (unseen.some((e) => e.severity === 'critical' && !isRecoveredConnectionError(e))) {
    // A critical problem that being connected doesn't fix (e.g. storage full).
    level = 'critical';
    text = unseen.find((e) => e.severity === 'critical' && !isRecoveredConnectionError(e)).title;
  } else if (unseen.some(isRecoveredConnectionError)) {
    // We got here, so the DB is connected NOW: the outage is over. Say so —
    // showing the raw "no connection" title would read as an ongoing problem.
    const e = unseen.find(isRecoveredConnectionError);
    const at = new Date(e.lastAt).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
    level = 'warning';
    text = `The database connection dropped briefly (${at})${e.count > 1 ? ` ×${e.count}` : ''} — it is connected again and everything is fine.`;
  } else if (health?.storage?.percent >= 80) {
    level = health.storage.percent >= 90 ? 'critical' : 'warning';
    text = `Database storage is ${health.storage.percent}% full (${health.storage.usedMb}MB of ${health.storage.limitMb}MB).`;
  } else if (unseen.length) {
    level = 'warning';
    text = `${unseen.length} new system ${unseen.length === 1 ? 'error' : 'errors'}.`;
  }

  if (!level) return null;
  return (
    <div className={'sys-banner ' + level} role="alert">
      <span><Icon name="alert" size={17} /> {text}</span>
      <Link to="/system">View details →</Link>
    </div>
  );
}
