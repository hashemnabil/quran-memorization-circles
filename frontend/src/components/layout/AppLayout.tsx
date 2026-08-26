import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useRealtime } from '@/hooks/useRealtime';
import { navigationFor } from '@/config/navigation';
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/labels';
import { Avatar, Badge, cx } from '@/components/ui';
import AnnouncementBar from '@/components/AnnouncementBar';
import {
  IconBell,
  IconChat,
  IconChevronLeft,
  IconChevronRight,
  IconLogout,
  IconMenu,
  IconMosque,
  IconSettings,
  IconUser,
  IconX,
} from '@/components/ui/Icons';
import type { SchoolSettings } from '@/types';

const COLLAPSE_KEY = 'qc.sidebarCollapsed';

export default function AppLayout() {
  const user = useAuthStore((s) => s.user)!;
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // The collapsed rail is a desktop-only preference, remembered between visits.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  useRealtime();

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  const { data: settings } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: async () => (await api.get<SchoolSettings>('/settings/public')).data,
    staleTime: 10 * 60 * 1000,
  });

  const { data: unreadNotifications } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => (await api.get<{ count: number }>('/notifications/unread-count')).data.count,
    refetchInterval: 60000,
  });

  const { data: unreadChat } = useQuery({
    queryKey: ['chat', 'unread'],
    queryFn: async () => (await api.get<{ count: number }>('/chat/unread-count')).data.count,
    refetchInterval: 60000,
  });

  const { data: supportStats } = useQuery({
    queryKey: ['support', 'stats'],
    queryFn: async () => (await api.get('/support/stats')).data,
    refetchInterval: 120000,
  });

  const badges: Record<string, number> = {
    notifications: unreadNotifications ?? 0,
    chat: unreadChat ?? 0,
    support:
      user.role === 'SUPPORT' || user.role === 'ADMIN'
        ? (supportStats?.OPEN ?? 0) + (supportStats?.IN_PROGRESS ?? 0)
        : 0,
  };

  const groups = navigationFor(user.role);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  /**
   * `rail` renders the icon-only variant. The mobile drawer always renders the
   * full sidebar regardless of the desktop collapse preference.
   */
  const Sidebar = ({ rail }: { rail: boolean }) => (
    <div className="flex h-full flex-col bg-primary-900 text-primary-50">
      <div
        className={cx(
          'flex items-center gap-3 border-b border-white/10 py-5',
          rail ? 'justify-center px-3' : 'px-5',
        )}
      >
        {settings?.logoUrl ? (
          <img
            src={settings.logoUrl}
            alt={settings.name ?? 'شعار المدرسة'}
            className={cx(
              'h-11 shrink-0 object-contain',
              rail ? 'w-11' : 'w-auto max-w-[7.5rem]',
            )}
          />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-gold-300">
            <IconMosque size={23} />
          </span>
        )}

        {!rail && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold leading-tight">
                {settings?.name ?? 'حلقات التحفيظ'}
              </p>
              {settings?.mosqueName && (
                <p className="truncate text-[11px] text-primary-200">{settings.mosqueName}</p>
              )}
            </div>
            <button
              className="rounded-lg p-1.5 text-primary-200 hover:bg-white/10 lg:hidden"
              onClick={() => setDrawerOpen(false)}
              aria-label="إغلاق القائمة"
            >
              <IconX size={18} />
            </button>
          </>
        )}
      </div>

      <nav className={cx('flex-1 overflow-y-auto overflow-x-hidden py-4', rail ? 'px-2' : 'px-3')}>
        {groups.map((group) => (
          <div key={group.title} className="mb-5">
            {rail ? (
              <div className="mx-auto mb-2 h-px w-8 bg-white/10" aria-hidden />
            ) : (
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-primary-300/80">
                {group.title}
              </p>
            )}

            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const count = item.badge ? badges[item.badge] : 0;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      title={rail ? item.label : undefined}
                      aria-label={item.label}
                      className={({ isActive }) =>
                        cx(
                          'group relative flex items-center rounded-xl text-sm font-semibold transition',
                          rail ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5',
                          isActive
                            ? 'bg-white/15 text-white shadow-sm'
                            : 'text-primary-100/90 hover:bg-white/10 hover:text-white',
                        )
                      }
                    >
                      <span className="relative shrink-0 opacity-90">
                        {item.icon}
                        {/* Collapsed rail has no room for a label, so the count becomes a dot. */}
                        {rail && count > 0 && (
                          <span className="absolute -left-2.5 -top-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-gold-400 px-1 text-[9px] font-extrabold text-primary-950 ring-2 ring-primary-900">
                            {count > 9 ? '9+' : count}
                          </span>
                        )}
                      </span>

                      {!rail && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {count > 0 && (
                            <span className="numeric rounded-full bg-gold-400 px-1.5 py-0.5 text-[10px] font-extrabold text-primary-950">
                              {count > 99 ? '99+' : count}
                            </span>
                          )}
                        </>
                      )}

                      {/* Hover tooltip, shown only in the collapsed rail. */}
                      {rail && (
                        <span className="pointer-events-none absolute right-full top-1/2 z-50 mr-2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg group-hover:block">
                          {item.label}
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cx('border-t border-white/10', rail ? 'p-2' : 'p-3')}>
        <button
          onClick={handleLogout}
          title={rail ? 'تسجيل الخروج' : undefined}
          className={cx(
            'group relative flex w-full items-center rounded-xl text-sm font-semibold text-primary-100 transition hover:bg-red-500/20 hover:text-white',
            rail ? 'justify-center py-3' : 'gap-3 px-3 py-2.5',
          )}
        >
          <IconLogout size={19} />
          {!rail && 'تسجيل الخروج'}
          {rail && (
            <span className="pointer-events-none absolute right-full top-1/2 z-50 mr-2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg group-hover:block">
              تسجيل الخروج
            </span>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar — width animates between the full panel and the icon rail. */}
      <aside
        className={cx(
          'hidden shrink-0 transition-[width] duration-200 lg:block',
          collapsed ? 'w-20' : 'w-72',
        )}
      >
        <div
          className={cx(
            'fixed inset-y-0 right-0 transition-[width] duration-200',
            collapsed ? 'w-20' : 'w-72',
          )}
        >
          <Sidebar rail={collapsed} />
        </div>
      </aside>

      {/* Mobile drawer — always the full sidebar. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-72 animate-slide-up">
            <Sidebar rail={false} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
            <button
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="فتح القائمة"
            >
              <IconMenu size={20} />
            </button>

            {/* Collapse toggle (desktop only). */}
            <button
              className="hidden rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 lg:block"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
              aria-expanded={!collapsed}
              title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
            >
              {collapsed ? <IconChevronLeft size={20} /> : <IconChevronRight size={20} />}
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-700">مرحباً، {user.fullName}</p>
              <p className="text-[11px] text-slate-400">{ROLE_LABELS[user.role]}</p>
            </div>

            <NavLink
              to="/chat"
              className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
              aria-label="المحادثات"
            >
              <IconChat size={20} />
              {badges.chat > 0 && (
                <span className="numeric absolute -left-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {badges.chat > 9 ? '9+' : badges.chat}
                </span>
              )}
            </NavLink>

            <NavLink
              to="/notifications"
              className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
              aria-label="الإشعارات"
            >
              <IconBell size={20} />
              {badges.notifications > 0 && (
                <span className="numeric absolute -left-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {badges.notifications > 9 ? '9+' : badges.notifications}
                </span>
              )}
            </NavLink>

            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl p-1 transition hover:bg-slate-100"
                aria-label="قائمة الحساب"
              >
                <Avatar name={user.fullName} src={user.avatarUrl} size={34} />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute left-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-card-hover animate-fade-in">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="truncate text-sm font-bold text-slate-800">{user.fullName}</p>
                      <p className="truncate text-xs text-slate-400" dir="ltr">
                        {user.email}
                      </p>
                      <Badge className={cx('mt-2', ROLE_COLORS[user.role])}>{ROLE_LABELS[user.role]}</Badge>
                    </div>
                    <NavLink
                      to="/profile"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50"
                    >
                      <IconUser size={17} /> الملف الشخصي
                    </NavLink>
                    {user.role === 'ADMIN' && (
                      <NavLink
                        to="/settings"
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50"
                      >
                        <IconSettings size={17} /> إعدادات المدرسة
                      </NavLink>
                    )}
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50"
                    >
                      <IconLogout size={17} /> تسجيل الخروج
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Sits directly under the header so it is seen on every page. */}
        <AnnouncementBar />

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>

        <footer className="border-t border-slate-200 px-6 py-4 text-center text-[11px] text-slate-400">
          {settings?.name ?? 'نظام إدارة حلقات التحفيظ'}
          {settings?.academicYear ? ` — العام الدراسي ${settings.academicYear}` : ''}
        </footer>
      </div>
    </div>
  );
}
