import type { ReactNode } from 'react';
import { canVisitStudentRoute } from '@/lib/student-route-policy';
import type { Role } from '@/types';
import {
  IconCamera,
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
  IconHeart,
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

const ALL: Role[] = ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE', 'PARENT', 'SUPPORT', 'STUDENT'];

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
      { to: '/meetings', label: 'الاجتماعات', icon: <IconCalendar size={19} />, roles: ['ADMIN'] },
      { to: '/admin/notifications', label: 'إرسال الإشعارات', icon: <IconBell size={19} />, roles: ['ADMIN'] },
      { to: '/admin/activity', label: 'سجل النشاط', icon: <IconCalendar size={19} />, roles: ['ADMIN'] },
      { to: '/admin/password-requests', label: 'طلبات تغيير كلمة المرور', icon: <IconUser size={19} />, roles: ['ADMIN'] },
      { to: '/profile-reviews/teachers', label: 'تحقق من بيانات المحفظ', icon: <IconUser size={19} />, roles: ['ADMIN'] },
      { to: '/teacher-duties', label: 'جدول انضباط المحفّظين', icon: <IconCalendar size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/circles', label: 'الحلقات', icon: <IconCircleGroup size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/courses', label: 'الدورات', icon: <IconBook size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/staff/attendance', label: 'حضور الكادر', icon: <IconClipboard size={19} />, roles: ['ADMIN', 'SUPERVISOR'] },
      { to: '/staff', label: 'دليل الكادر', icon: <IconUsers size={19} />, roles: ['ADMIN', 'SUPERVISOR'] },
      { to: '/teachers', label: 'المعلمين', icon: <IconGraduation size={19} />, roles: ['ADMIN', 'SUPERVISOR'] },
      { to: '/supervisors', label: 'المشرفين', icon: <IconUsers size={19} />, roles: ['ADMIN'] },
    ],
  },
  {
    title: 'الإعلام',
    items: [
      { to: '/media-schedule', label: 'جدول الإعلام', icon: <IconCamera size={19} />, roles: ['ADMIN'] },
      { to: '/media-activities', label: 'سجل الإعلام', icon: <IconCamera size={19} />, roles: ['ADMIN', 'SUPERVISOR'] },
      { to: '/announcements', label: 'الإعلانات', icon: <IconBell size={19} />, roles: ['ADMIN'] },
    ],
  },
  {
    title: 'شؤون الطلبة',
    items: [
      { to: '/profile-reviews/students', label: 'تحقق من بيانات الطالب', icon: <IconUser size={19} />, roles: ['ADMIN'] },
      { to: '/students', label: 'الطلاب', icon: <IconGraduation size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/attendance', label: 'الحضور والغياب', icon: <IconClipboard size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER'] },
      { to: '/absence-permissions', label: 'طلبات إذن الغياب', icon: <IconCalendar size={19} />, roles: ['ADMIN', 'SUPERVISOR', 'TEACHER', 'STUDENT'] },
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
      { to: '/documents/attendance', label: 'تقرير الحضور والغياب', icon: <IconClipboard size={19} />, roles: ['ADMIN'] },
      { to: '/documents/recitations', label: 'تقرير التسميع اليومي', icon: <IconBook size={19} />, roles: ['ADMIN'] },
      { to: '/documents/exams', label: 'تقرير الاختبارات والنتائج', icon: <IconAward size={19} />, roles: ['ADMIN'] },
      { to: '/documents/student', label: 'الملف الشامل للطالب', icon: <IconGraduation size={19} />, roles: ['ADMIN'] },
      { to: '/documents/circles', label: 'إحصائية الحلقات والمحفظين', icon: <IconCircleGroup size={19} />, roles: ['ADMIN'] },
      { to: '/documents/students', label: 'سجل الطلاب', icon: <IconUsers size={19} />, roles: ['ADMIN'] },
      { to: '/documents/memorization-students', label: 'سجل طلاب التحفيظ', icon: <IconBook size={19} />, roles: ['ADMIN'] },
      { to: '/documents/activity-students', label: 'سجل طلاب النشاط', icon: <IconUsers size={19} />, roles: ['ADMIN'] },
      { to: '/documents/suspended-students', label: 'سجل طلاب المفصولين', icon: <IconPause size={19} />, roles: ['ADMIN'] },
      { to: '/documents/course-students', label: 'سجل طلاب الدورات', icon: <IconUsers size={19} />, roles: ['ADMIN'] },
      { to: '/documents/courses', label: 'حلقات الدورات', icon: <IconBook size={19} />, roles: ['ADMIN'] },
      { to: '/documents/course-attendance', label: 'حضور وغياب الدورات', icon: <IconClipboard size={19} />, roles: ['ADMIN'] },
      { to: '/certificates-admin', label: 'الشهادات', icon: <IconAward size={19} />, roles: ['ADMIN'] },
      { to: '/student', label: 'ملفي الدراسي', icon: <IconGraduation size={19} />, roles: ['STUDENT'] },
      { to: '/my-files', label: 'ملفاتي', icon: <IconClipboard size={19} />, roles: ['STUDENT'] },
    ],
  },
  {
    title: 'التواصل',
    items: [
      { to: '/chat', label: 'المحادثات', icon: <IconChat size={19} />, roles: ALL, badge: 'chat' },
      { to: '/notifications', label: 'الإشعارات', icon: <IconBell size={19} />, roles: ALL, badge: 'notifications' },
      { to: '/support', label: 'الدعم الفني', icon: <IconLifeBuoy size={19} />, roles: ALL, badge: 'support' },
    ],
  },
  {
    title: 'نظام المدرسة',
    items: [
      { to: '/users', label: 'المستخدمون', icon: <IconUsers size={19} />, roles: ['ADMIN'] },
      { to: '/settings', label: 'إعدادات المدرسة', icon: <IconSettings size={19} />, roles: ['ADMIN'] },
    ],
  },
  {
    title: 'الملف الشخصي',
    items: [
      { to: '/about', label: 'عن التطبيق', icon: <IconBook size={14} />, roles: ALL },
      { to: '/verify-profile', label: 'تحقق من بياناتي', icon: <IconUser size={19} />, roles: ['TEACHER', 'STUDENT'] },
      { to: '/profile', label: 'الملف الشخصي', icon: <IconUser size={19} />, roles: ALL },
    ],
  },
];
NAV_GROUPS.push({ title: 'المشاركة', items: [{ to: '/donations', label: 'التبرعات', icon: <IconHeart size={19} />, roles: ALL }] });
const SECTION_PATHS = [
  ['الرئيسية', ['/']],
  ['المتابعة اليومية', ['/attendance','/recitations','/exams','/absence-permissions','/teacher-duties','/staff/attendance']],
  ['الطلاب والحلقات', ['/students','/circles','/courses','/student-accounts','/transfers','/suspensions']],
  ['ملفي الدراسي', ['/student','/my-files']],
  ['التقارير والشهادات', ['/documents/attendance','/documents/recitations','/documents/exams','/documents/student','/documents/circles','/certificates-admin','/documents/students','/documents/memorization-students','/documents/activity-students','/documents/suspended-students','/documents/course-students','/documents/courses','/documents/course-attendance']],
  ['التواصل', ['/notifications','/chat','/support']],
  ['الكادر والإدارة', ['/teachers','/supervisors','/staff','/meetings','/profile-reviews/students','/profile-reviews/teachers','/admin/password-requests','/admin/notifications','/admin/activity']],
  ['الإعلام والمشاركة', ['/announcements','/media-schedule','/media-activities','/donations']],
  ['الإعدادات والحساب', ['/users','/settings','/profile','/verify-profile','/about']],
] as const;

export function navigationFor(role: Role): NavGroup[] {
  const items = new Map(NAV_GROUPS.flatMap(group => group.items).map(item => [item.to, item]));
  return SECTION_PATHS.map(([title, paths]) => ({ title, items: paths.flatMap(path => {
    const item = items.get(path);
    return item && item.roles.includes(role) ? [item] : [];
  }) })).filter(group => group.items.length > 0);
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
  if (role === 'STUDENT') return !!path && canVisitStudentRoute(path.split(/[?#]/)[0].replace(/\/+$/, '') || '/');
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
