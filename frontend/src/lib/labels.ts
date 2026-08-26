import type {
  AttendanceStatus,
  Evaluation,
  ExamRequestStatus,
  ExamStatus,
  RecitationType,
  RequestStatus,
  Role,
  StudentStatus,
  TicketPriority,
  TicketStatus,
  TransferKind,
  EmploymentType,
  SuspensionAction,
  CourseType,
  ExamSectionKind,
  StudentTrack,
} from '@/types';

/** Every enum the API returns, paired with its Arabic label and badge colours. */

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'مدير عام',
  SUPERVISOR: 'مشرف',
  TEACHER: 'معلم',
  EXAM_COMMITTEE: 'لجنة الاختبارات',
  PARENT: 'ولي أمر',
  SUPPORT: 'دعم فني',
};

export const ROLE_COLORS: Record<Role, string> = {
  ADMIN: 'bg-primary-100 text-primary-800',
  SUPERVISOR: 'bg-indigo-100 text-indigo-800',
  TEACHER: 'bg-sky-100 text-sky-800',
  EXAM_COMMITTEE: 'bg-gold-100 text-gold-800',
  PARENT: 'bg-purple-100 text-purple-800',
  SUPPORT: 'bg-slate-200 text-slate-700',
};

export const EVALUATION_LABELS: Record<Evaluation, string> = {
  EXCELLENT: 'ممتاز',
  VERY_GOOD: 'جيد جداً',
  GOOD: 'جيد',
  ACCEPTABLE: 'مقبول',
  UNSATISFACTORY: 'غير مرضٍ',
};

export const EVALUATION_COLORS: Record<Evaluation, string> = {
  EXCELLENT: 'bg-emerald-100 text-emerald-800',
  VERY_GOOD: 'bg-teal-100 text-teal-800',
  GOOD: 'bg-sky-100 text-sky-800',
  ACCEPTABLE: 'bg-amber-100 text-amber-800',
  UNSATISFACTORY: 'bg-red-100 text-red-800',
};

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'منتظم',
  SUSPENDED: 'موقوف',
  ACTIVITY: 'محوّل لبرنامج النشاط',
  GRADUATED: 'متخرج',
  WITHDRAWN: 'منسحب',
};

export const STUDENT_STATUS_COLORS: Record<StudentStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  SUSPENDED: 'bg-red-100 text-red-800',
  ACTIVITY: 'bg-amber-100 text-amber-800',
  GRADUATED: 'bg-primary-100 text-primary-800',
  WITHDRAWN: 'bg-slate-200 text-slate-600',
};

export const SUSPENSION_ACTION_LABELS: Record<SuspensionAction, string> = {
  ACTIVITY_PROGRAM: 'التحويل إلى برنامج النشاط',
  SUSPEND: 'إيقاف مؤقت',
  PERMANENT: 'إيقاف نهائي',
};

export const SUSPENSION_ACTION_COLORS: Record<SuspensionAction, string> = {
  ACTIVITY_PROGRAM: 'bg-amber-100 text-amber-800',
  SUSPEND: 'bg-red-100 text-red-800',
  PERMANENT: 'bg-slate-800 text-white',
};

export const COURSE_TYPE_LABELS: Record<CourseType, string> = {
  SHARIA: 'دورات شرعية',
  TAJWEED: 'أحكام التجويد',
};

export const COURSE_TYPE_COLORS: Record<CourseType, string> = {
  SHARIA: 'bg-indigo-100 text-indigo-800',
  TAJWEED: 'bg-teal-100 text-teal-800',
};

export const EXAM_SECTION_KIND_LABELS: Record<ExamSectionKind, string> = {
  JUZ: 'جزء',
  HIZB: 'حزب',
};

export const STUDENT_TRACK_LABELS: Record<StudentTrack, string> = {
  CIRCLE: 'حلقات التحفيظ',
  COURSE: 'الدورات التعليمية',
  ACTIVITY: 'برنامج النشاط',
  SUSPENDED: 'الموقوفون',
};

/** Weekday codes as stored on circles and courses. */
export const WEEKDAY_LABELS: Record<string, string> = {
  SATURDAY: 'السبت',
  SUNDAY: 'الأحد',
  MONDAY: 'الاثنين',
  TUESDAY: 'الثلاثاء',
  WEDNESDAY: 'الأربعاء',
  THURSDAY: 'الخميس',
  FRIDAY: 'الجمعة',
};

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'حاضر',
  EXCUSED: 'غياب بعذر',
  ABSENT: 'غياب بدون عذر',
};

/** Short forms for tight spots such as table cells and chart legends. */
export const ATTENDANCE_SHORT: Record<AttendanceStatus, string> = {
  PRESENT: 'حاضر',
  EXCUSED: 'بعذر',
  ABSENT: 'بدون عذر',
};

export const ATTENDANCE_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-800',
  EXCUSED: 'bg-amber-100 text-amber-800',
  ABSENT: 'bg-red-100 text-red-800',
};

/** Solid variants used by the attendance picker buttons. */
export const ATTENDANCE_ACTIVE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-600 text-white border-emerald-600',
  EXCUSED: 'bg-amber-500 text-white border-amber-500',
  ABSENT: 'bg-red-600 text-white border-red-600',
};

/** The order the three states are offered in, from best to worst. */
export const ATTENDANCE_ORDER: AttendanceStatus[] = ['PRESENT', 'EXCUSED', 'ABSENT'];

export const RECITATION_TYPE_LABELS: Record<RecitationType, string> = {
  MEMORIZATION: 'حفظ جديد',
  MINOR_REVIEW: 'مراجعة صغرى',
  MAJOR_REVIEW: 'مراجعة كبرى',
  TAJWEED: 'تجويد',
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: 'قيد المراجعة',
  APPROVED: 'مقبول',
  REJECTED: 'مرفوض',
  CANCELLED: 'ملغى',
};

export const REQUEST_STATUS_COLORS: Record<RequestStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
};

export const TRANSFER_KIND_LABELS: Record<TransferKind, string> = {
  STUDENT_TRANSFER: 'نقل طالب',
  TEACHER_TRANSFER: 'نقل معلم',
  TEACHER_SWAP: 'تبادل معلمين',
  ASSISTANT_ADD: 'إضافة معلم مساعد',
  ASSISTANT_REMOVE: 'إزالة معلم مساعد',
};

export const EXAM_REQUEST_STATUS_LABELS: Record<ExamRequestStatus, string> = {
  PENDING: 'في قائمة الانتظار',
  SCHEDULED: 'تمت الجدولة',
  REJECTED: 'مرفوض',
  CANCELLED: 'ملغى',
  COMPLETED: 'مكتمل',
};

export const EXAM_REQUEST_STATUS_COLORS: Record<ExamRequestStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  SCHEDULED: 'bg-sky-100 text-sky-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
};

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  SCHEDULED: 'مجدول',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغى',
  ABSENT: 'غائب',
};

export const EXAM_STATUS_COLORS: Record<ExamStatus, string> = {
  SCHEDULED: 'bg-sky-100 text-sky-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
  ABSENT: 'bg-red-100 text-red-800',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'مفتوح',
  IN_PROGRESS: 'قيد المعالجة',
  RESOLVED: 'تم الحل',
  CLOSED: 'مغلق',
};

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-sky-100 text-sky-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800',
  CLOSED: 'bg-slate-200 text-slate-600',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'منخفضة',
  NORMAL: 'عادية',
  HIGH: 'عالية',
  URGENT: 'عاجلة',
};

export const TICKET_PRIORITY_COLORS: Record<TicketPriority, string> = {
  LOW: 'bg-slate-200 text-slate-600',
  NORMAL: 'bg-sky-100 text-sky-800',
  HIGH: 'bg-amber-100 text-amber-800',
  URGENT: 'bg-red-100 text-red-800',
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'متفرغ',
  PART_TIME: 'غير متفرغ',
  VOLUNTEER: 'متطوع',
};

/**
 * The school's grading scale, mirroring `backend/src/common/grading.ts`.
 * The stored evaluation always comes from the server; this is only used to
 * preview the grade while the examiner is still typing the score.
 *
 *   90–100 ممتاز · 80–89 جيد جداً · 70–79 جيد · 60–69 مقبول · أقل من 60 غير مرضٍ
 */
export function scoreEvaluation(score: number): Evaluation {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 80) return 'VERY_GOOD';
  if (score >= 70) return 'GOOD';
  if (score >= 60) return 'ACCEPTABLE';
  return 'UNSATISFACTORY';
}

export const WEEK_DAYS: { value: string; label: string }[] = [
  { value: 'SATURDAY', label: 'السبت' },
  { value: 'SUNDAY', label: 'الأحد' },
  { value: 'MONDAY', label: 'الإثنين' },
  { value: 'TUESDAY', label: 'الثلاثاء' },
  { value: 'WEDNESDAY', label: 'الأربعاء' },
  { value: 'THURSDAY', label: 'الخميس' },
  { value: 'FRIDAY', label: 'الجمعة' },
];

export const DAY_LABELS: Record<string, string> = Object.fromEntries(
  WEEK_DAYS.map((d) => [d.value, d.label]),
);

export const NOTIFICATION_ICONS: Record<string, string> = {
  TRANSFER_REQUEST: '🔄',
  TRANSFER_DECISION: '✅',
  SUSPENSION_REQUEST: '⏸️',
  SUSPENSION_DECISION: '📌',
  EXAM_REQUEST: '📝',
  EXAM_SCHEDULED: '📅',
  EXAM_RESULT: '🏅',
  SUPPORT_TICKET: '🛠️',
  SUPPORT_REPLY: '💬',
  CHAT_MESSAGE: '✉️',
  ATTENDANCE: '📋',
  ANNOUNCEMENT: '📢',
  SYSTEM: 'ℹ️',
};

/**
 * Who raised a support ticket.
 *
 * A ticket opened from the login screen has no account behind it — that is the
 * whole point of the feature — so it carries contact details instead of a user.
 * Reading `createdBy.fullName` blindly used to crash the support dashboard for
 * the support role, taking the entire page with it.
 */
export function ticketRequesterName(ticket: {
  createdBy?: { fullName: string } | null;
  contactName?: string | null;
}): string {
  return ticket.createdBy?.fullName ?? ticket.contactName ?? 'زائر غير مسجّل';
}

/** True for a ticket that came from the login screen. */
export function isGuestTicket(ticket: { createdBy?: { fullName: string } | null }): boolean {
  return !ticket.createdBy;
}

/**
 * Names every hizb an exam covers, not just its primary section.
 *
 * Mirrors `describeSections` on the server so a screen and the notification it
 * produced say the same thing. Accepts either the join rows the API returns or
 * a plain list of sections.
 */
export function describeExamSections(
  primary: { name: string; order?: number } | null | undefined,
  sections?: { section: { name: string; order: number } }[] | null,
): string {
  const all = sections?.length
    ? sections.map((s) => s.section)
    : primary
      ? [{ name: primary.name, order: primary.order ?? 0 }]
      : [];
  if (!all.length) return '—';
  if (all.length === 1) return all[0].name;

  const sorted = [...all].sort((a, b) => a.order - b.order);
  const contiguous = sorted.every((s, i) => i === 0 || s.order === sorted[i - 1].order + 1);
  if (contiguous) {
    const first = sorted[0].name.replace(/^\S+\s*/, '');
    const last = sorted[sorted.length - 1].name.replace(/^\S+\s*/, '');
    return `الأحزاب ${first} إلى ${last} (${sorted.length} أحزاب)`;
  }
  return sorted.map((s) => s.name).join('، ');
}
