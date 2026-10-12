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
      { to: '/', label: 'الرئيسية', icon: <IconDashboard size={19} />, roles: ALL },
    ],
  },
  {
    title: 'شؤون إدارية',
    items: [
      { to: '/circles', label: 'الحلقات', icon: <IconCircleGroup size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/courses', label: 'الدورات', icon: <IconBook size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/media-activities', label: 'سجل الإعلام', icon: <IconClipboard size={19} />, roles: ['ADMIN', 'SUPERVISOR'] },
      { to: '/staff/attendance', label: 'حضور الكادر', icon: <IconClipboard size={19} />, roles: ['ADMIN', 'SUPERVISOR'] },
      { to: '/staff', label: 'دليل الكادر', icon: <IconUsers size={19} />, roles: ['ADMIN', 'SUPERVISOR'] },
      { to: '/teachers', label: 'المعلمين', icon: <IconUsers size={19} />, roles: ['ADMIN', 'SUPERVISOR'] },
      { to: '/supervisors', label: 'المشرفين', icon: <IconUsers size={19} />, roles: ['ADMIN'] },
    ],
  },
  {
    title: 'شؤون الطلبة',
    items: [
      { to: '/students', label: 'الطلاب', icon: <IconGraduation size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/attendance', label: 'الحضور والغياب', icon: <IconClipboard size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/recitations', label: 'التسميع اليومي', icon: <IconBook size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/student-accounts', label: 'حسابات الطلاب', icon: <IconUsers size={19} />, roles: ['ADMIN'] },
      { to: '/exams', label: 'الاختبارات والنتائج', icon: <IconAward size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE'] },
      { to: '/transfers', label: 'نقل الطالب', icon: <IconExchange size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/suspensions', label: 'فصل الطالب', icon: <IconPause size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
    ],
  },
  {
    title: 'المستندات',
    items: [
      { to: '/reports?type=attendance', label: 'تقرير الحضور والغياب', icon: <IconClipboard size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/reports?type=recitations', label: 'تقرير التسميع اليومي', icon: <IconBook size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/reports?type=exams', label: 'تقرير الاختبارات والنتائج', icon: <IconAward size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE'] },
      { to: '/reports?type=student', label: 'الملف الشامل للطالب', icon: <IconGraduation size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/reports?type=circles', label: 'إحصائية الحلقات والمحفظين', icon: <IconCircleGroup size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/reports?type=students', label: 'سجل الطلاب', icon: <IconUsers size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/reports?type=students&status=ACTIVE', label: 'سجل طلاب التحفيظ', icon: <IconBook size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/reports?type=students&status=ACTIVITY', label: 'سجل طلاب النشاط', icon: <IconUsers size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/reports?type=students&status=SUSPENDED', label: 'سجل طلاب المفصولين', icon: <IconPause size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/reports?type=courseStudents', label: 'سجل طلاب الدورات', icon: <IconUsers size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/reports?type=courses', label: 'حلقات الدورات', icon: <IconBook size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/reports?type=courseAttendance', label: 'حضور وغياب الدورات', icon: <IconClipboard size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/certificates-admin', label: 'الشهادات', icon: <IconAward size={19} />, roles: ['ADMIN'] },
      { to: '/student', label: 'ملفي الدراسي', icon: <IconGraduation size={19} />, roles: ['STUDENT'] },
      { to: '/my-files', label: 'ملفاتي', icon: <IconClipboard size={19} />, roles: ['STUDENT'] },
    ],
  },
  {
    title: 'التواصل',
    items: [
      { to: '/chat', label: 'المحادثات', icon: <IconChat size={19} />, roles: ALL, badge: 'chat' },
      { to: '/notifications', label: 'الإشعارات', icon: <IconCalendar size={19} />, roles: ALL, badge: 'notifications' },
      { to: '/support', label: 'الدعم الفني', icon: <IconLifeBuoy size={19} />, roles: ALL, badge: 'support' },
    ],
  },
  {
    title: 'نظام المدرسة',
    items: [
      { to: '/users', label: 'المستخدمون', icon: <IconUsers size={19} />, roles: ['ADMIN'] },
      { to: '/announcements', label: 'الإعلانات', icon: <IconBell size={19} />, roles: ['ADMIN'] },
      { to: '/settings', label: 'إعدادات المدرسة', icon: <IconSettings size={19} />, roles: ['ADMIN'] },
    ],
  },
  {
    title: 'الملف الشخصي',
    items: [
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
