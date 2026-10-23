import { NavLink } from 'react-router-dom';
import { IconDashboard, IconUser, IconMenu } from '@/components/ui/Icons';
import type { Role } from '@/types';

export default function MobileNavigation({ role, onMenu }: { role: Role; onMenu: () => void }) {
  const items = [
    { to: '/', label: role === 'STUDENT' ? 'الرئيسية' : 'الرئيسية', icon: <IconDashboard /> },
    { to: '/community', label: 'المنشورات', icon: <span aria-hidden="true" className="text-xl leading-none">▤</span> },
    { to: '/community/users/me', label: 'ملفي الشخصي', icon: <IconUser /> },
  ];
  return <nav aria-label="التنقل الرئيسي للجوال" className="mobile-navigation lg:hidden" dir="rtl">
    {items.map(item => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `mobile-navigation-item ${isActive ? 'mobile-navigation-active' : ''}`}>{item.icon}<span>{item.label}</span></NavLink>)}
    <button type="button" className="mobile-navigation-item" onClick={onMenu}><IconMenu /><span>المزيد</span></button>
  </nav>;
}
