/**
 * Authenticated app shell: a fixed sidebar with primary navigation, a topbar
 * showing the signed-in admin and a logout button, and an <Outlet/> for pages.
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/users', label: 'Users' },
  { to: '/subscriptions', label: 'Subscriptions' },
  { to: '/moi', label: 'Moi' },
  { to: '/finance', label: 'Finance' },
  { to: '/ai-usage', label: 'AI Usage' },
  { to: '/activity', label: 'OTP Activity' },
  { to: '/audit', label: 'Audit Log' },
  { to: '/config', label: 'Config' },
];

export function Layout() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__brand-name">MoiFlow</span>
          <span className="sidebar__brand-tag">Admin</span>
        </div>
        <nav className="sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="topbar__spacer" />
          <div className="topbar__account">
            <div className="topbar__identity">
              <span className="topbar__name">{admin?.name ?? 'Admin'}</span>
              <span className="topbar__role">{admin?.role ?? '—'}</span>
            </div>
            <button type="button" className="btn btn--ghost" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
