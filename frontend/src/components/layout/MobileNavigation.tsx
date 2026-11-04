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
  return <nav aria-label="التنقل الرئيسي للجوال" className="mobile-navigation lg:hidden" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '5px', paddingInline: '8px' }} dir="rtl">
    {items.map(item => <NavLink key={item.to} to={item.to} end className={() => {
      const active = item.to === '/'
        ? pathname === '/'
        : item.to === '/community'
          ? ['/community', '/community/posts', '/community/stories'].includes(pathname)
          : item.to === '/profile'
            ? pathname === '/profile'
            : pathname === item.to || pathname.startsWith(`${item.to}/`);
      return `mobile-navigation-item min-w-0 overflow-hidden px-0.5 text-center ${active ? 'mobile-navigation-active' : ''}`;
    }}>{item.icon}<span className="block w-full truncate text-[10px] sm:text-xs">{item.label}</span></NavLink>)}
  </nav>;
}
