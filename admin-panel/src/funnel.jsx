// Multi-funnel context. Loads the funnel list once (admin only), tracks which
// funnel the admin is editing (persisted in localStorage), and hands pages a
// scoped `api` that injects ?funnel=<id> so every catalog/settings call targets
// the selected funnel. Staff (non-admin) never load funnels.
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';

const KEY = 'fbd_admin_funnel';
const FunnelCtx = createContext(null);

export function FunnelProvider({ children }) {
  const { admin } = useAuth();
  const isAdmin = admin?.role === 'admin';
  const [funnels, setFunnels] = useState([]);
  const [funnelId, setFunnelIdState] = useState(() => localStorage.getItem(KEY) || '');
  const [loading, setLoading] = useState(true);

  const setFunnelId = useCallback((id) => {
    setFunnelIdState(id || '');
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  }, []);

  const reload = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return; }
    try {
      const d = await api('/funnels');
      const list = d.funnels || [];
      setFunnels(list);
      const ids = list.map((f) => String(f._id));
      setFunnelIdState((cur) => {
        if (cur && ids.includes(cur)) return cur;
        const def = d.defaultId && ids.includes(String(d.defaultId)) ? String(d.defaultId) : ids[0] || '';
        if (def) localStorage.setItem(KEY, def);
        return def;
      });
    } catch {
      /* staff or transient error — leave funnel context empty */
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { reload(); }, [reload]);

  const current = useMemo(
    () => funnels.find((f) => String(f._id) === String(funnelId)) || null,
    [funnels, funnelId]
  );

  // Resolve a funnel name from an order/lead's productId (for list columns).
  const nameOf = useMemo(() => {
    const byId = new Map(funnels.map((f) => [String(f._id), f.name || f.slug]));
    return (id) => (id ? byId.get(String(id)) || '' : '');
  }, [funnels]);

  const value = useMemo(
    () => ({ funnels, funnelId, current, setFunnelId, reload, loading, isAdmin, nameOf, multi: funnels.length > 1 }),
    [funnels, funnelId, current, setFunnelId, reload, loading, isAdmin, nameOf]
  );
  return <FunnelCtx.Provider value={value}>{children}</FunnelCtx.Provider>;
}

export function useFunnel() {
  return (
    useContext(FunnelCtx) || {
      funnels: [], funnelId: '', current: null,
      setFunnelId: () => {}, reload: () => {}, loading: false, isAdmin: false,
      nameOf: () => '', multi: false,
    }
  );
}

/**
 * A scoped `api` bound to the selected funnel. Use it exactly like `api`:
 *   const fapi = useFunnelApi();
 *   const d = await fapi('/offers');
 * It appends ?funnel=<id>; `load` callbacks that depend on it re-run on switch.
 */
export function useFunnelApi() {
  const { funnelId } = useFunnel();
  return useCallback(
    (path, opts = {}) =>
      api(path, { ...opts, params: { ...(opts.params || {}), funnel: funnelId || undefined } }),
    [funnelId]
  );
}

/**
 * Standalone funnel picker for analytics / list pages (Dashboard, Orders,
 * Incomplete). Unlike the top-bar editing switcher, it offers an "All funnels"
 * option and keeps its own per-page value. Hidden when there's a single funnel.
 *   const [funnel, setFunnel] = useState('');   // '' = all
 *   <FunnelFilter value={funnel} onChange={setFunnel} />
 */
export function FunnelFilter({ value, onChange }) {
  const { funnels } = useFunnel();
  if (funnels.length <= 1) return null;
  return (
    <select className="funnel-filter" value={value} onChange={(e) => onChange(e.target.value)} title="Filter by funnel">
      <option value="">All funnels</option>
      {funnels.map((f) => (
        <option key={f._id} value={f._id}>{f.name || f.slug}</option>
      ))}
    </select>
  );
}
