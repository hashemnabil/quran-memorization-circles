import { NavLink } from 'react-router-dom';
import { IconDashboard, IconUser, IconMenu } from '@/components/ui/Icons';
import type { Role } from '@/types';

export default function MobileNavigation({ role, onMenu }: { role: Role; onMenu: () => void }) {
  const items = [
    { to: '/', label: role === 'STUDENT' ? 'الرئيسية' : 'الرئيسية', icon: <IconDashboard /> },
    { to: '/community', label: 'المنشورات', icon: <span aria-hidden="true" className="text-xl leading-none">▤</span> },
    { to: '/community/school', label: 'المدرسة', icon: <span aria-hidden="true" className="text-xl leading-none">🏫</span> },
    { to: '/community/users/me', label: 'ملفي', icon: <IconUser /> },
  ];
  return <nav aria-label="التنقل الرئيسي للجوال" className="mobile-navigation lg:hidden" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '5px', paddingInline: '8px' }} dir="rtl">
    {items.map(item => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `mobile-navigation-item min-w-0 overflow-hidden px-0.5 text-center ${isActive ? 'mobile-navigation-active' : ''}`}>{item.icon}<span className="block w-full truncate text-[10px] sm:text-xs">{item.label}</span></NavLink>)}
    <button type="button" className="mobile-navigation-item min-w-0 overflow-hidden px-0.5" onClick={onMenu}><IconMenu /><span>المزيد</span></button>
  </nav>;
}
