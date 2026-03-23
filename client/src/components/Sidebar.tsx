import { Link, NavLink } from 'react-router-dom';
import { Zap, BookOpen, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { LogoMark } from './Logo';

const navItems = [
  { to: '/app', label: 'Generator', icon: Zap, end: true, prefetch: 'generator' as const },
  { to: '/app/library', label: 'Library', icon: BookOpen, end: false, prefetch: 'library' as const },
  { to: '/app/settings', label: 'Settings', icon: Settings, end: false, prefetch: 'settings' as const },
];

const routePrefetchers = {
  home: () => import('../pages/Home'),
  generator: () => import('../pages/Generator'),
  library: () => import('../pages/Library'),
  settings: () => import('../pages/Settings'),
};

function prefetchRoute(route: keyof typeof routePrefetchers) {
  void routePrefetchers[route]();
}

export default function Sidebar() {
  const { logout } = useAuth();

  return (
    <aside className="order-2 md:order-1 md:w-16 bg-white border-t md:border-t-0 md:border-r border-black/10 flex md:flex-col items-center justify-around md:justify-start py-2 md:py-4 px-2 gap-1.5 md:gap-2 shrink-0">
      {/* Logo */}
      <Link
        to="/"
        title="Go to Home"
        onMouseEnter={() => prefetchRoute('home')}
        onFocus={() => prefetchRoute('home')}
        className="hidden md:flex mb-4 shrink-0 w-12 h-12 rounded-2xl border border-black/10 bg-[#f3f3f6] items-center justify-center hover:bg-[#ececf2] transition-colors"
      >
        <LogoMark size={30} />
      </Link>

      {/* Nav links */}
      {navItems.map(({ to, label, icon: Icon, end, prefetch }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          title={label}
          onMouseEnter={() => prefetchRoute(prefetch)}
          onFocus={() => prefetchRoute(prefetch)}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-xl transition-all duration-150 group relative ${
              isActive
                ? 'bg-violet-50 text-violet-700 border border-violet-200'
                : 'text-[#717182] hover:text-[#09090b] hover:bg-[#f3f3f5]'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={20} className={isActive ? 'text-violet-700' : ''} />
              {/* Tooltip */}
              <span className="hidden md:block absolute left-full ml-2 px-2 py-1 bg-white border border-black/10 text-[#52525b] text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-sm">
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}

      <div className="md:mt-auto">
        <button
          type="button"
          title="Logout"
          onClick={() => {
            void logout();
          }}
          className="flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-xl text-[#717182] hover:text-[#09090b] hover:bg-[#f3f3f5] transition-all duration-150"
        >
          <LogOut size={20} />
        </button>
      </div>
    </aside>
  );
}
