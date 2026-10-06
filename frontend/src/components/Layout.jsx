import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Tag, Receipt, Leaf, Pill, FlaskConical,
  ShoppingCart, User, LogOut, Package, BookOpen, DatabaseBackup,
  Eye, Edit3, Trash2, Printer, ChevronDown, ChevronRight,
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
  {
    to: '/admin/formula',
    icon: FlaskConical,
    label: 'Formula',
    subClasses: [
      { to: '/admin/formula?tab=edit', icon: Edit3, label: 'Add / Edit Formula', tab: 'edit' },
      { to: '/admin/formula?tab=view', icon: Eye, label: 'View Formula', tab: 'view' },
      { to: '/admin/formula?tab=print', icon: Printer, label: 'Print Formula', tab: 'print' },
      { to: '/admin/formula?tab=delete', icon: Trash2, label: 'Delete Formula', tab: 'delete' },
    ],
  },
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
  const location = useLocation();
  const [expandedMenus, setExpandedMenus] = useState({ '/admin/formula': true });
  const nav = portal === 'dealer' ? dealerNav : adminNav;

  const toggleMenu = (to) => {
    setExpandedMenus(prev => ({
      ...prev,
      [to]: prev[to] !== undefined ? !prev[to] : false,
    }));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleLabel = { ROLE_ADMIN: 'Admin', ROLE_VIEWER: 'Viewer', ROLE_DEALER: 'Dealer' };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-forest-950 text-white flex flex-col z-40">
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="Uttam Laboratories"
              className="w-11 h-11 rounded-full object-cover shadow-sm ring-1 ring-amber-400/40 shrink-0"
            />
            <div>
              <h1 className="font-display text-base font-bold leading-tight">Uttam Laboratories</h1>
              <p className="text-xs text-white/60">Ayurvedic Inventory</p>
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

            if (item.subClasses) {
              const isParentPath = location.pathname.startsWith(item.to);
              const isExpanded = expandedMenus[item.to] ?? true;
              const searchParams = new URLSearchParams(location.search);
              const tabParam = searchParams.get('tab');
              const currentTab = ['view', 'edit', 'print', 'delete'].includes(tabParam)
                ? tabParam
                : (tabParam === 'define' ? 'edit' : (tabParam === 'generate' ? 'print' : 'view'));

              return (
                <div key={item.to} className="mb-0.5">
                  <div
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      isParentPath
                        ? 'bg-forest-900/90 text-white font-medium border border-forest-700/40'
                        : 'text-white/70 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <NavLink
                      to={item.to}
                      className="flex items-center gap-3 min-w-0 flex-1"
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleMenu(item.to);
                      }}
                      className="p-1 -mr-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer"
                      title={isExpanded ? 'Collapse sub classes' : 'Expand sub classes'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-1 mb-1.5 ml-4 pl-3 border-l border-white/20 space-y-0.5">
                      {item.subClasses.map((sub) => {
                        const isSubActive = isParentPath && currentTab === sub.tab;
                        const SubIcon = sub.icon;
                        return (
                          <NavLink
                            key={sub.to}
                            to={sub.to}
                            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                              isSubActive
                                ? 'bg-forest-700 text-white font-medium shadow-xs'
                                : 'text-white/70 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            {SubIcon && <SubIcon className="w-3.5 h-3.5 shrink-0 opacity-80" />}
                            <span className="truncate">{sub.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

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
