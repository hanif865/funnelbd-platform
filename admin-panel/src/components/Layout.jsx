import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
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
      { to: '/offers', label: 'Offers', icon: 'tag', adminOnly: true },
      { to: '/form-builder', label: 'Checkout form', icon: 'form', adminOnly: true },
      { to: '/delivery', label: 'Delivery', icon: 'truck', adminOnly: true },
      { to: '/page-editor', label: 'Landing page', icon: 'layout', adminOnly: true },
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

export default function Layout() {
  const { admin, logout } = useAuth();
  const sys = useSystemHealth();
  const dbDown = sys.unreachable || (sys.health && sys.health.db?.state !== 'connected');
  const badgeCount = sys.unseen.length + (dbDown ? 1 : 0);
  const isAdmin = admin?.role === 'admin';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-mark">F</div>
          <span>FunnelBD</span>
        </div>
        <nav>
          {NAV.map((group) => {
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
        <SystemBanner {...sys} />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
