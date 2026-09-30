import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

// Sidebar items. Phase 1 ships Orders; the rest are placeholders shown
// disabled so the eventual IA is visible.
// adminOnly items are hidden for staff (staff = order management only).
const NAV = [
  { to: '/dashboard', label: 'ড্যাশবোর্ড', icon: '📊', ready: true },
  { to: '/orders', label: 'অর্ডার', icon: '📦', ready: true },
  { to: '/incomplete', label: 'অসম্পূর্ণ অর্ডার', icon: '⏳', ready: true },
  { to: '/offers', label: 'প্রোডাক্ট ও অফার', icon: '🛍️', ready: true, adminOnly: true },
  { to: '/form-builder', label: 'ফর্ম বিল্ডার', icon: '📝', ready: true, adminOnly: true },
  { to: '/delivery', label: 'ডেলিভারি', icon: '🚚', ready: true, adminOnly: true },
  { to: '/page-editor', label: 'ল্যান্ডিং পেজ', icon: '🎨', ready: true, adminOnly: true },
  { to: '/tracking', label: 'ট্র্যাকিং', icon: '📈', ready: true, adminOnly: true },
  { to: '/settings', label: 'সেটিংস', icon: '⚙️', ready: true, adminOnly: true },
];

export default function Layout() {
  const { admin, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">FunnelBD</div>
        <nav>
          {NAV.filter((item) => !item.adminOnly || admin?.role === 'admin').map((item) =>
            item.ready ? (
              <NavLink key={item.to} to={item.to} className="nav-item">
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ) : (
              <span key={item.to} className="nav-item disabled" title="শীঘ্রই আসছে">
                <span className="nav-icon">{item.icon}</span>
                {item.label}
                <span className="soon">শীঘ্রই</span>
              </span>
            )
          )}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div />
          <div className="user">
            <span>{admin?.name} · {admin?.role}</span>
            <button className="btn-ghost" onClick={logout}>লগআউট</button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
