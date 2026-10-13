import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useFunnel } from '../funnel.jsx';
import { getImpersonate, setImpersonate } from '../api.js';
import { useSystemHealth, SystemBanner } from './SystemHealth.jsx';
import Icon from './Icon.jsx';

// Sidebar navigation, grouped. adminOnly items are hidden for staff
// (staff = order management only).
const NAV = [
  {
    section: 'Sales',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { to: '/orders', label: 'Orders', icon: 'orders' },
      { to: '/incomplete', label: 'Incomplete orders', icon: 'clock' },
    ],
  },
  {
    section: 'Store',
    items: [
      { to: '/funnels', label: 'Funnels', icon: 'funnel', adminOnly: true },
      { to: '/offers', label: 'Offers', icon: 'tag', adminOnly: true },
      { to: '/form-builder', label: 'Checkout form', icon: 'form', adminOnly: true },
      { to: '/delivery', label: 'Delivery', icon: 'truck', adminOnly: true },
      { to: '/page-editor', label: 'Landing page', icon: 'layout', adminOnly: true },
      { to: '/domains', label: 'Domains', icon: 'globe', adminOnly: true },
    ],
  },
  {
    section: 'System',
    items: [
      { to: '/tracking', label: 'Tracking', icon: 'chart', adminOnly: true },
      { to: '/settings', label: 'Settings', icon: 'settings', adminOnly: true },
      { to: '/system', label: 'System status', icon: 'pulse', badge: 'errors' },
    ],
  },
];

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function FunnelSwitcher() {
  const { funnels, funnelId, setFunnelId, isAdmin } = useFunnel();
  if (!isAdmin || funnels.length === 0) return null;
  return (
    <label className="funnel-switch" title="Which funnel the Store, Tracking and Settings pages edit">
      <Icon name="funnel" size={15} />
      <span className="funnel-switch-label">Editing</span>
      <select value={funnelId} onChange={(e) => setFunnelId(e.target.value)}>
        {funnels.map((f) => (
          <option key={f._id} value={f._id}>
            {f.name || f.slug}{f.active ? '' : ' (off)'}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Layout() {
  const { admin, logout } = useAuth();
  const sys = useSystemHealth();
  const dbDown = sys.unreachable || (sys.health && sys.health.db?.state !== 'connected');
  const badgeCount = sys.unseen.length + (dbDown ? 1 : 0);
  const isSuperadmin = admin?.role === 'superadmin';
  const isAdmin = admin?.role === 'admin' || isSuperadmin; // superadmin can do admin things
  const impersonating = isSuperadmin && getImpersonate();
  const impName = impersonating ? (localStorage.getItem('fbd_admin_impersonate_name') || 'a client account') : '';

  function exitImpersonation() {
    setImpersonate('');
    localStorage.removeItem('fbd_admin_impersonate_name');
    window.location.href = '/admin/accounts';
  }

  const nav = isSuperadmin
    ? [{ section: 'Platform', items: [{ to: '/accounts', label: 'Accounts', icon: 'users' }] }, ...NAV]
    : NAV;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-mark">F</div>
          <span>FunnelBD</span>
        </div>
        <nav>
          {nav.map((group) => {
            const items = group.items.filter((item) => !item.adminOnly || isAdmin);
            if (!items.length) return null;
            return (
              <div key={group.section}>
                <div className="nav-section">{group.section}</div>
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} className="nav-item" title={item.label}>
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    {item.badge === 'errors' && badgeCount > 0 && <span className="nav-badge">{badgeCount}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">FunnelBD admin</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">Admin panel</div>
          <FunnelSwitcher />
          <div className="user">
            <div className="avatar">{initials(admin?.name)}</div>
            <div className="user-meta">
              <div className="user-name">{admin?.name}</div>
              <div className="user-role">{admin?.role}</div>
            </div>
            <button className="btn-ghost sm" onClick={logout} title="Log out">
              <Icon name="logout" size={16} /> Log out
            </button>
          </div>
        </header>
        {impersonating && (
          <div className="impersonation-bar">
            <span><Icon name="users" size={14} /> Managing <b>{impName}</b> as super-admin</span>
            <button className="btn-ghost sm" onClick={exitImpersonation}>Exit to Accounts</button>
          </div>
        )}
        <SystemBanner {...sys} />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
