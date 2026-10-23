import ThemeSelect from '@/components/ThemeSelect';
import { NativePushConnection } from '@/components/NativePush';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import { useRealtime } from '@/hooks/useRealtime';
import { navigationFor } from '@/config/navigation';
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/labels';
import { Avatar, Badge, cx, LoadingState } from '@/components/ui';
import AnnouncementBar from '@/components/AnnouncementBar';
import OfflineSystem from '@/components/OfflineSystem';
import DutyReminder from '@/components/DutyReminder';
import MobileNavigation from './MobileNavigation';
import { usePageScroll } from '@/hooks/usePageScroll';
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
  usePageScroll(user.id);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const accountMenu = useRef<HTMLDivElement>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ 'المتابعة اليومية': true, 'الطلاب والحلقات': true, 'ملفي الدراسي': true });
  const [navSearch, setNavSearch] = useState('');
  // The collapsed rail is a desktop-only preference, remembered between visits.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  useRealtime();
  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountMenu.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [menuOpen]);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
    setNavSearch('');
  }, [location.pathname]);

  useEffect(() => {
    const active = navigationFor(user.role).find(group => group.items.some(item =>
      item.to === location.pathname || item.to !== '/' && location.pathname.startsWith(`${item.to}/`)));
    if (active) setExpandedGroups(current => ({ ...current, [active.title]: true }));
  }, [location.pathname, user.role]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); };
  }, [drawerOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menuOpen]);

  const { data: settings } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: async () => (await api.get<SchoolSettings>('/settings/public')).data,
    staleTime: 10 * 60 * 1000,
  });

  const { data: unreadNotifications } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => (await api.get<{ count: number }>('/notifications/unread-count')).data.count,
  });

  const { data: unreadChat } = useQuery({
    queryKey: ['chat', 'unread'],
    queryFn: async () => (await api.get<{ count: number }>('/chat/unread-count')).data.count,
  });

  const { data: supportStats } = useQuery({
    queryKey: ['support', 'stats'],
    queryFn: async () => (await api.get('/support/stats')).data,
  });

  const badges: Record<string, number> = {
    notifications: unreadNotifications ?? 0,
    chat: unreadChat ?? 0,
    support:
      user.role === 'SUPPORT' || user.role === 'ADMIN'
        ? (supportStats?.OPEN ?? 0) + (supportStats?.IN_PROGRESS ?? 0)
        : 0,
  };

  const allGroups = navigationFor(user.role);
  const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').trim();
  const searchTerm = normalizeSearch(navSearch);
  const groups = allGroups.map(group => ({ ...group, items: group.items.filter(item => !searchTerm || normalizeSearch(group.title + ' ' + item.label).includes(searchTerm)) })).filter(group => group.items.length);
  const activeGroup = allGroups.find(group => group.items.some(item => item.to === location.pathname || item.to !== '/' && location.pathname.startsWith(item.to + '/')));
  const activeItem = activeGroup?.items.filter(item => item.to === location.pathname || item.to !== '/' && location.pathname.startsWith(item.to + '/')).sort((a,b) => b.to.length - a.to.length)[0];

  const handleLogout = async () => {
    try { await logout(); navigate('/login', { replace: true }); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر إكمال تسجيل الخروج'); }
  };

  /**
   * `rail` renders the icon-only variant. The mobile drawer always renders the
   * full sidebar regardless of the desktop collapse preference.
   */
  const renderSidebar = (rail: boolean) => (
    <div className="sidebar-shell flex h-full flex-col text-primary-50">
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

      {!rail && <div className="px-4 pt-4">
        <label className="block"><span className="sr-only">ابحث عن صفحة</span><input type="search" value={navSearch} onChange={event => setNavSearch(event.target.value)} placeholder="ابحث عن صفحة…" className="sidebar-search" /></label>
      </div>}
      <nav aria-label="أقسام التطبيق" className={cx('flex-1 overflow-y-auto overflow-x-hidden overscroll-contain py-4', rail ? 'px-2' : 'px-3')}>
        {groups.map((group) => (
          <div key={group.title} className="mb-3">
            {rail ? (
              <div className="mx-auto mb-2 h-px w-8 bg-white/10" aria-hidden />
            ) : group.title === 'الرئيسية' ? null : (
              <button
                type="button"
                className="mb-2 flex w-full items-center justify-between rounded-lg px-3 py-2 text-right text-[11px] font-bold tracking-wide text-primary-300/90 transition hover:bg-white/5 hover:text-white"
                onClick={() => setExpandedGroups((current) => ({ ...current, [group.title]: !current[group.title] }))}
                aria-expanded={!!searchTerm || !!expandedGroups[group.title]}
              >
                <span>{group.title}</span>
                {expandedGroups[group.title] ? <IconChevronLeft size={15} /> : <IconChevronRight size={15} />}
              </button>
            )}

            {(rail || !!searchTerm || group.title === 'الرئيسية' || expandedGroups[group.title]) && <ul className="space-y-0.5">
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
                          'sidebar-nav-item group relative flex items-center rounded-xl text-sm font-semibold transition',
                          rail ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5',
                          isActive
                            ? 'sidebar-nav-active text-white shadow-sm'
                            : 'text-primary-100/90 hover:bg-white/10 hover:text-white',
                        )
                      }
                    >
                      <span className={cx("sidebar-nav-icon relative grid shrink-0 place-items-center rounded-lg", rail ? "h-10 w-10" : "h-9 w-9")}>
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
            </ul>}
          </div>
        ))}
        {groups.length === 0 && !rail && <p role="status" className="px-3 py-6 text-center text-sm text-primary-200">لا توجد صفحات مطابقة</p>}
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
    <div className="app-shell flex min-h-screen bg-slate-50">
      <NativePushConnection />
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
          {renderSidebar(collapsed)}
        </div>
      </aside>

      {/* Mobile drawer — always the full sidebar. */}
      {drawerOpen && (
        <div role="dialog" aria-modal="true" aria-label="القائمة الجانبية" className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-72 max-w-[90vw] animate-slide-up">
            {renderSidebar(false)}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-topbar sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <div className="flex items-center gap-2 px-4 py-3.5 sm:gap-3 sm:px-6">
            <button type="button" className="app-icon-button" aria-label="الرجوع للصفحة السابقة"
              onClick={() => { if (window.history.state?.idx > 0) navigate(-1); else navigate(user.role === 'STUDENT' ? '/student' : '/'); }}>
              <IconChevronRight size={20} />
            </button>
            <button
              className="app-icon-button lg:hidden"
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
              <p className="truncate text-sm font-bold text-slate-700">{activeItem?.label ?? 'الرئيسية'}</p>
              <p className="truncate text-[11px] text-slate-500">{activeGroup?.title} · {ROLE_LABELS[user.role]}</p>
            </div>


            <NavLink
              to="/chat"
              className="app-icon-button relative"
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
              className="app-icon-button relative"
              aria-label="الإشعارات"
            >
              <IconBell size={20} />
              {badges.notifications > 0 && (
                <span className="numeric absolute -left-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {badges.notifications > 9 ? '9+' : badges.notifications}
                </span>
              )}
            </NavLink>

            <ThemeSelect />
            <div ref={accountMenu} className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="relative z-20 flex items-center gap-2 rounded-xl p-1 transition hover:bg-slate-100"
                aria-label="قائمة الحساب"
                aria-expanded={menuOpen}
              >
                <Avatar name={user.fullName} src={user.avatarUrl} size={34} />
              </button>

              {menuOpen && (
                <>
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

        <a href="#app-content" className="skip-to-content">الانتقال إلى المحتوى</a>
        <main id="app-content" tabIndex={-1} className="app-workspace min-w-0 flex-1 p-4 sm:p-7 lg:p-8">
          <OfflineSystem />
          <DutyReminder />
          <Suspense fallback={<LoadingState />}><Outlet /></Suspense>
        </main>

        <footer className="border-t border-slate-200 px-6 py-4 text-center text-[11px] text-slate-400">
          {settings?.name ?? 'نظام إدارة حلقات التحفيظ'}
          {settings?.academicYear ? ` — العام الدراسي ${settings.academicYear}` : ''}
          <Link to="/about" className="ms-3 inline-block py-2 hover:text-primary-700">معلومات عن البرنامج</Link>
        </footer>
      </div>
      <MobileNavigation role={user.role} onMenu={() => setDrawerOpen(true)} />
    </div>
  );
}
