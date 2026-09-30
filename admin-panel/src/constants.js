// Order status metadata shared across admin pages.
export const STATUSES = [
  { key: 'new', label: 'নতুন', color: '#3b82f6' },
  { key: 'confirmed', label: 'কনফার্মড', color: '#8b5cf6' },
  { key: 'shipped', label: 'কুরিয়ারে', color: '#f59e0b' },
  { key: 'delivered', label: 'ডেলিভারড', color: '#10b981' },
  { key: 'cancelled', label: 'ক্যানসেল', color: '#ef4444' },
  { key: 'returned', label: 'রিটার্ন', color: '#f43f5e' },
  { key: 'hold', label: 'হোল্ড', color: '#6b7280' },
];

export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

export function bnDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('bn-BD', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
