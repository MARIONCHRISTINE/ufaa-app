import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3, CheckCircle2, CloudUpload, Database, FileText, Gauge, Home, Hourglass, ListChecks, LogOut, Menu,
  SlidersHorizontal, UsersRound, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { initials, ROLE_LABELS } from '../lib/format';
import ThemeToggle from './ThemeToggle';

const OFFICER_NAV = [
  { section: 'Navigation' },
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/claimed', label: 'Claimed Assets', icon: CheckCircle2 },
  { to: '/unclaimed', label: 'Unclaimed Assets', icon: Hourglass },
  { to: '/upload', label: 'Data Upload', icon: CloudUpload, badge: 'flagged' },
  { to: '/letters', label: 'Letters Issued', icon: FileText },
];

const ADMIN_NAV = [
  { section: 'Admin Panel' },
  { to: '/admin', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/admin/users', label: 'User Management', icon: UsersRound },
  { to: '/admin/logs', label: 'Activity Logs', icon: ListChecks },
  { to: '/admin/data', label: 'Data Management', icon: Database },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { section: 'System' },
  { to: '/admin/settings', label: 'Settings', icon: SlidersHorizontal },
];

export function BrandHeader({ onMenu, menuOpen }) {
  return (
    <header className="no-print relative z-40 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-gradient-to-br from-airtel to-airtel-dark px-4 py-4 text-white shadow-[0_4px_22px_rgba(204,0,0,0.32)] md:px-9">
      <div className="flex items-center gap-4">
        {onMenu && (
          <button
            onClick={onMenu}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/25 bg-white/15 hover:bg-white/25 md:hidden"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        )}
        <div className="brand-pulse flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-[2.5px] border-white/45 bg-white/20 text-[1.6rem] font-black shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
          U
        </div>
        <div>
          <h1 className="text-[1.35rem] font-extrabold leading-tight tracking-[-0.3px]">UFAA Portal</h1>
          <p className="mt-0.5 text-[0.72rem] font-medium uppercase tracking-[0.9px] text-white/85">Unclaimed Financial Assets Authority</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden h-[42px] w-px bg-gradient-to-b from-transparent via-white/40 to-transparent lg:block" />
        <div className="hidden flex-col items-end gap-1 sm:flex">
          <div className="flex items-center justify-center rounded-[10px] bg-white px-3.5 py-[5px] shadow-[0_3px_10px_rgba(0,0,0,0.18)] transition hover:-translate-y-px">
            <img src="/logo.png" alt="Airtel logo" className="h-8 w-auto object-contain" />
          </div>
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.8px] text-white/85">Airtel Internal Compliance Portal</span>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="no-print z-40 shrink-0 bg-gradient-to-br from-airtel to-airtel-dark px-6 py-3.5 text-center text-[0.78rem] tracking-[0.3px] text-white/90 shadow-[0_-3px_14px_rgba(204,0,0,0.18)]">
      <p>&copy; {new Date().getFullYear()} Unclaimed Financial Assets Authority (UFAA) — All Rights Reserved.</p>
      <p className="mt-0.5 text-[0.7rem] text-white/70">Compliance Module &nbsp;|&nbsp; Internal Use Only</p>
    </footer>
  );
}

export default function Shell({ admin = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = admin ? ADMIN_NAV : OFFICER_NAV;
  const [flaggedCount, setFlaggedCount] = useState(0);

  // Files an admin flagged back to this officer show as a count on the Data Upload link.
  useEffect(() => {
    if (admin) return undefined;
    const check = () => api('/drafts/flagged').then((r) => setFlaggedCount(r.flagged.length)).catch(() => {});
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [admin]);

  const doLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <BrandHeader onMenu={() => setOpen((o) => !o)} menuOpen={open} />
      <div className="relative flex min-h-0 flex-1">
        {open && <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}
        <aside
          className={`no-print absolute inset-y-0 left-0 z-30 flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-surface py-5 shadow-[2px_0_10px_rgba(0,0,0,0.02)] transition-transform md:static md:translate-x-0 ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav className="flex flex-1 flex-col gap-1">
            {items.map((item, i) =>
              item.section ? (
                <div key={i} className={`mb-2 px-6 text-[0.75rem] font-bold uppercase tracking-[1.5px] text-slate-400 ${i ? 'mt-4' : ''}`}>
                  {item.section}
                </div>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-4 border-l-4 px-6 py-3 text-[0.95rem] transition ${
                      isActive
                        ? 'border-airtel bg-red-50 font-semibold text-airtel'
                        : 'border-transparent font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                    }`
                  }
                >
                  <item.icon className="h-[1.1rem] w-5" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge === 'flagged' && flaggedCount > 0 && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[0.7rem] font-bold text-white" title={`${flaggedCount} file(s) flagged for your review`}>
                      {flaggedCount}
                    </span>
                  )}
                </NavLink>
              ),
            )}
          </nav>
          <div className="mt-4 flex flex-col gap-1 border-t border-slate-200 pb-2 pt-3">
            <div className="mx-2 mb-1.5 flex items-center gap-3 rounded-xl border border-red-600/10 bg-red-600/[0.06] px-4 py-2.5">
              <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-airtel to-airtel-dark text-[0.95rem] font-extrabold tracking-[-0.5px] text-white shadow-[0_3px_8px_rgba(204,0,0,0.25)]">
                {initials(user?.fullname || user?.username)}
              </div>
              <div className="min-w-0">
                <div className="max-w-[140px] truncate text-[0.82rem] font-bold text-slate-900">{user?.username}</div>
                <div className="mt-px text-[0.68rem] font-medium uppercase tracking-[0.5px] text-airtel">
                  {ROLE_LABELS[user?.role] || 'Compliance Officer'}
                </div>
              </div>
            </div>
            <ThemeToggle variant="sidebar" />
            <button
              onClick={doLogout}
              className="flex items-center gap-4 border-l-4 border-transparent px-6 py-3 text-left text-[0.95rem] font-medium text-slate-400 transition hover:bg-red-50 hover:text-airtel"
            >
              <LogOut className="h-[1.1rem] w-5" /> Logout
            </button>
          </div>
        </aside>
        <main className={`min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-8 ${admin ? 'admin-portal' : ''}`}>
          <Outlet />
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
