import type { ReactNode } from 'react';
import type { Role } from '@/types';
import {
  IconAward,
  IconBell,
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
    // Everything that makes up a circle: the circle itself and the people in it.
    // The exam committee is absent by design — it works from the exam queue only.
    title: 'إدارة الحلقات',
    items: [
      {
        to: '/circles',
        label: 'الحلقات',
        icon: <IconCircleGroup size={19} />,
        roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'],
      },
      {
        to: '/students',
        label: 'الطلاب',
        icon: <IconGraduation size={19} />,
        roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'],
      },
      {
        to: '/teachers',
        label: 'المعلمون',
        icon: <IconUsers size={19} />,
        roles: ['ADMIN', 'SUPERVISOR'],
      },
      {
        to: '/supervisors',
        label: 'المشرفون',
        icon: <IconUsers size={19} />,
        roles: ['ADMIN'],
      },
      { to: '/parents', label: 'أولياء الأمور', icon: <IconUser size={19} />, roles: ['ADMIN'] },
    ],
  },
  {
    title: 'الدورات التعليمية',
    items: [
      {
        to: '/courses',
        label: 'الدورات',
        icon: <IconBook size={19} />,
        roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'],
      },
    ],
  },
  {
    title: 'الكادر',
    items: [
      {
        to: '/staff',
        label: 'دليل الكادر',
        icon: <IconUsers size={19} />,
        roles: ['ADMIN', 'SUPERVISOR'],
      },
      {
        to: '/staff/attendance',
        label: 'حضور الكادر',
        icon: <IconClipboard size={19} />,
        roles: ['ADMIN', 'SUPERVISOR'],
      },
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
      { to: '/announcements', label: 'الإعلانات', icon: <IconBell size={19} />, roles: ['ADMIN'] },
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

// --- who may open which page ------------------------------------------------

/** Every declared destination, longest path first so `/staff/attendance` wins over `/staff`. */
const ROUTES = NAV_GROUPS.flatMap((g) => g.items)
  .map((item) => ({ path: item.to, roles: item.roles }))
  .sort((a, b) => b.path.length - a.path.length);

/**
 * The roles allowed to open a path, or `null` when the path is not one of the
 * declared destinations.
 *
 * `null` means "not known here", not "open to everyone" — callers decide what
 * to do with that, and they deliberately choose the lenient reading, because a
 * deep link like `/exams/requests/<id>` is reachable by whoever can reach
 * `/exams` and this table only lists the tops of those trees.
 */
export function rolesForPath(path?: string | null): Role[] | null {
  if (!path || !path.startsWith('/')) return null;
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const match = ROUTES.find((r) => clean === r.path || (r.path !== '/' && clean.startsWith(`${r.path}/`)));
  return match ? match.roles : null;
}

/**
 * Whether this role can actually open an internal path.
 *
 * The announcement bar asks before offering the link: an announcement about a
 * new course points at `/courses`, which a parent has no route for, and
 * following it lands them on «لا تملك صلاحية الوصول» — a dead end handed to
 * them by the school's own notice.
 */
export function canOpenPath(role: Role, path?: string | null): boolean {
  const roles = rolesForPath(path);
  return roles === null ? true : roles.includes(role);
}

/** Which of the targeted roles would hit the forbidden page on this link. */
export function rolesWithoutAccess(path: string | undefined | null, audience: Role[]): Role[] {
  const roles = rolesForPath(path);
  if (!roles) return [];
  const targeted = audience.length ? audience : ALL;
  return targeted.filter((r) => !roles.includes(r));
}
