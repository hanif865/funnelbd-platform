// Order status metadata + formatting helpers shared across admin pages.
export const STATUSES = [
  { key: 'new', label: 'New', color: '#2563eb' },
  { key: 'confirmed', label: 'Confirmed', color: '#7c3aed' },
  { key: 'shipped', label: 'Shipped', color: '#d97706' },
  { key: 'delivered', label: 'Delivered', color: '#059669' },
  { key: 'cancelled', label: 'Cancelled', color: '#dc2626' },
  { key: 'returned', label: 'Returned', color: '#e11d48' },
  { key: 'hold', label: 'On hold', color: '#64748b' },
];

export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

/** "30 Sep, 8:13 pm" */
export function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** "30 Sep 2026, 8:13 pm" */
export function fmtDateLong(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** 1060 → "1,060" */
export function num(n) {
  return Number(n ?? 0).toLocaleString('en-US');
}

/** 1060 → "৳1,060" */
export function money(n) {
  return '৳' + num(n);
}

/** Label for a custom checkout field key, falling back to the stored label. */
export function fieldLabel(order, key) {
  return order?.customFieldLabels?.[key] || (key === 'size' ? 'Size' : key === 'color' ? 'Color' : key);
}

/** Prebuilt landing templates (visual themes). Keys match the server's
 *  TEMPLATE_KEYS and the .fk-theme-<key> blocks in public/css/landing.css. */
export const LANDING_TEMPLATES = [
  { key: 'classic',  label: 'Classic',  primary: '#e0142b', button: '#05bd02' },
  { key: 'emerald',  label: 'Emerald',  primary: '#059669', button: '#10b981' },
  { key: 'royal',    label: 'Royal',    primary: '#7c3aed', button: '#f59e0b' },
  { key: 'sunset',   label: 'Sunset',   primary: '#ea580c', button: '#16a34a' },
  { key: 'ocean',    label: 'Ocean',    primary: '#0284c7', button: '#06b6d4' },
  { key: 'rose',     label: 'Rose',     primary: '#e11d48', button: '#db2777' },
  { key: 'gold',     label: 'Gold',     primary: '#111827', button: '#d4af37' },
  { key: 'teal',     label: 'Teal',     primary: '#0d9488', button: '#f97316' },
  { key: 'berry',    label: 'Berry',    primary: '#a21caf', button: '#22c55e' },
  { key: 'midnight', label: 'Midnight', primary: '#4338ca', button: '#22c55e' },
];

/** Landing designs (structure/layout). Keys match server LAYOUT_KEYS. */
export const LANDING_LAYOUTS = [
  { key: 'classic',   label: 'Checkout first', desc: 'Order form at the top (fast buyers)' },
  { key: 'spotlight', label: 'Content first',  desc: 'Product story & benefits, then the order form' },
];
