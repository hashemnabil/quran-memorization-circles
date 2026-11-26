import { NavLink, useLocation } from 'react-router-dom';
import { IconDashboard, IconSettings, IconUser, IconPost, IconSchool } from '@/components/ui/Icons';

export default function MobileNavigation() {
  const { pathname } = useLocation();
  const items = [
    { to: '/', label: 'الرئيسية', icon: <IconDashboard /> },
    { to: '/community', label: 'المنشورات', icon: <IconPost /> },
    { to: '/community/school', label: 'المدرسة', icon: <IconSchool /> },
    { to: '/profile', label: 'ملفي الشخصي', icon: <IconUser /> },
    { to: '/profile/settings', label: 'الإعدادات', icon: <IconSettings /> },
  ];
  const activeIndex = items.findIndex(item => item.to === '/'
    ? pathname === '/'
    : item.to === '/community'
      ? ['/community', '/community/posts', '/community/stories'].includes(pathname)
      : item.to === '/profile'
        ? pathname === '/profile'
        : pathname === item.to || pathname.startsWith(`${item.to}/`));
  return <nav aria-label="التنقل الرئيسي للجوال" className="mobile-navigation mobile-navigation-sliding grid lg:hidden" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 0, paddingInline: '8px' }} dir="rtl">
    <span aria-hidden="true" className="mobile-navigation-pill" style={{ insetInlineStart: `calc(8px + (100% - 16px) * ${Math.max(0, activeIndex)} / 5)`, opacity: activeIndex < 0 ? 0 : 1 }} />
    {items.map((item, index) => <NavLink key={item.to} to={item.to} end={item.to === '/' || item.to === '/profile'} aria-current={activeIndex === index ? 'page' : undefined} className={`mobile-navigation-item mobile-navigation-sliding-item min-w-0 px-0.5 text-center ${activeIndex === index ? 'mobile-navigation-active' : ''}`}><span className="mobile-navigation-icon" aria-hidden="true">{item.icon}</span><span className="block w-full truncate text-[10px] sm:text-xs">{item.label}</span></NavLink>)}
  </nav>;
}
