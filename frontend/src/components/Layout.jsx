import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Tag, Receipt, Leaf, Pill, FlaskConical,
  ShoppingCart, User, LogOut, Package, BookOpen, DatabaseBackup,
} from 'lucide-react';

const adminNav = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { group: 'Codes & Registry' },
  { to: '/admin/herb-codes', icon: Tag, label: 'Herb Codes' },
  { to: '/admin/medicine-codes', icon: Tag, label: 'Medicine Codes' },
  { group: 'Raw Materials' },
  { to: '/admin/bills', icon: Receipt, label: 'Bills' },
  { to: '/admin/herbs', icon: Leaf, label: 'Herbs' },
  { group: 'Finished Goods' },
  { to: '/admin/medicines', icon: Pill, label: 'Medicines' },
  { to: '/admin/formula', icon: FlaskConical, label: 'Formula' },
  { to: '/admin/backup', icon: DatabaseBackup, label: 'Backup & Restore', adminOnly: true },
  { to: '/admin/profile', icon: User, label: 'Profile' },
];

const dealerNav = [
  { to: '/dealer', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/dealer/catalog', icon: BookOpen, label: 'Catalog' },
  { to: '/dealer/orders', icon: ShoppingCart, label: 'My Orders' },
  { to: '/dealer/profile', icon: User, label: 'Profile' },
];

export default function Layout({ children, portal = 'admin', fillHeight = false }) {
  const { user, logout, isAdmin, isViewer } = useAuth();
  const navigate = useNavigate();
  const nav = portal === 'dealer' ? dealerNav : adminNav;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleLabel = { ROLE_ADMIN: 'Admin', ROLE_VIEWER: 'Viewer', ROLE_DEALER: 'Dealer' };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-forest-950 text-white flex flex-col z-40">
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-saffron-500" />
            <div>
              <h1 className="font-display text-lg font-bold leading-tight">Uttam Laboratories</h1>
              <p className="text-xs text-white/50">Ayurvedic Inventory</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {nav.map((item, i) => {
            if (item.group) {
              return <p key={i} className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-white/40 font-medium">{item.group}</p>;
            }
            if (item.adminOnly && !isAdmin) return null;
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors mb-0.5 ${
                    isActive ? 'bg-forest-700 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-white/10">
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/70 hover:bg-white/5 hover:text-white w-full transition-colors">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 ml-64 flex flex-col h-screen overflow-hidden">
        <header className="shrink-0 z-30 bg-white/80 backdrop-blur-md border-b border-line px-8 py-4">
          <div className="flex items-center justify-between">
            <div />
            <div className="flex items-center gap-3">
              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-forest-100 text-forest-700">
                {roleLabel[user?.role] || 'User'}
              </span>
              <span className="text-sm font-medium text-ink">{user?.fullName}</span>
            </div>
          </div>
        </header>
        <main
          className={
            fillHeight
              ? 'flex-1 min-h-0 overflow-hidden px-8 py-6 flex flex-col'
              : 'flex-1 min-h-0 overflow-y-auto px-8 py-6'
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
