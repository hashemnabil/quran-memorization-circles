import type { ReactNode } from 'react';
import type { Role } from '@/types';
import {
  IconAward,
  IconBook,
  IconCalendar,
  IconChat,
  IconCircleGroup,
  IconClipboard,
  IconDashboard,
  IconExchange,
  IconGraduation,
  IconLifeBuoy,
  IconPause,
  IconSettings,
  IconUser,
  IconUsers,
} from '@/components/ui/Icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: Role[];
  /** key of the badge counter to display, if any */
  badge?: 'notifications' | 'chat' | 'support';
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

const ALL: Role[] = ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE', 'PARENT', 'SUPPORT'];

/**
 * The single source of truth for the sidebar. Each entry declares which roles
 * may see it; the backend enforces the same boundaries independently.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'الرئيسية',
    items: [
      { to: '/', label: 'لوحة المعلومات', icon: <IconDashboard size={19} />, roles: ALL },
    ],
  },
  {
    title: 'إدارة الحلقات',
    items: [
      {
        to: '/circles',
        label: 'الحلقات',
        icon: <IconCircleGroup size={19} />,
        roles: ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE'],
      },
      {
        to: '/students',
        label: 'الطلاب',
        icon: <IconGraduation size={19} />,
        roles: ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE'],
      },
      {
        to: '/teachers',
        label: 'المعلمون',
        icon: <IconUsers size={19} />,
        roles: ['ADMIN', 'SUPERVISOR', 'EXAM_COMMITTEE'],
      },
      { to: '/parents', label: 'أولياء الأمور', icon: <IconUser size={19} />, roles: ['ADMIN'] },
    ],
  },
  {
    title: 'المتابعة اليومية',
    items: [
      {
        to: '/attendance',
        label: 'الحضور والغياب',
        icon: <IconClipboard size={19} />,
        roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'],
      },
      {
        to: '/recitations',
        label: 'التسميع اليومي',
        icon: <IconBook size={19} />,
        roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'],
      },
    ],
  },
  {
    title: 'الطلبات والاختبارات',
    items: [
      {
        to: '/exams',
        label: 'الاختبارات',
        icon: <IconAward size={19} />,
        roles: ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE'],
      },
      {
        to: '/transfers',
        label: 'طلبات النقل',
        icon: <IconExchange size={19} />,
        roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'],
      },
      {
        to: '/suspensions',
        label: 'إيقاف الطلاب',
        icon: <IconPause size={19} />,
        roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'],
      },
    ],
  },
  {
    title: 'أبنائي',
    items: [
      { to: '/parent/children', label: 'متابعة الأبناء', icon: <IconGraduation size={19} />, roles: ['PARENT'] },
    ],
  },
  {
    title: 'التواصل',
    items: [
      { to: '/chat', label: 'المحادثات', icon: <IconChat size={19} />, roles: ALL, badge: 'chat' },
      {
        to: '/notifications',
        label: 'الإشعارات',
        icon: <IconCalendar size={19} />,
        roles: ALL,
        badge: 'notifications',
      },
      { to: '/support', label: 'الدعم الفني', icon: <IconLifeBuoy size={19} />, roles: ALL, badge: 'support' },
    ],
  },
  {
    title: 'النظام',
    items: [
      { to: '/users', label: 'المستخدمون', icon: <IconUsers size={19} />, roles: ['ADMIN'] },
      { to: '/settings', label: 'إعدادات المدرسة', icon: <IconSettings size={19} />, roles: ['ADMIN'] },
      { to: '/profile', label: 'الملف الشخصي', icon: <IconUser size={19} />, roles: ALL },
    ],
  },
];

export function navigationFor(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}
