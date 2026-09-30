import { STATUS_MAP } from '../constants.js';

/**
 * Soft-tinted pill. Pass any CSS colour; the tint/border are derived from it
 * in CSS via the --c custom property.
 */
export function Pill({ color = '#64748b', small = false, children, title }) {
  return (
    <span className={'pill' + (small ? ' sm' : '')} style={{ '--c': color }} title={title}>
      {children}
    </span>
  );
}

/** Order status pill (New / Confirmed / Shipped …). */
export function StatusPill({ status, small }) {
  const st = STATUS_MAP[status] || { label: status || '—', color: '#64748b' };
  return <Pill color={st.color} small={small}>{st.label}</Pill>;
}

/** Centered empty/loading state inside a card. */
export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

/** Inline notice line: ok (green) or error (red). */
export function Notice({ type = 'ok', children }) {
  if (!children) return null;
  return <p className={type === 'ok' ? 'ok-text' : 'err'} role="status">{children}</p>;
}
