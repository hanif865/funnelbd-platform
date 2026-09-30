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
