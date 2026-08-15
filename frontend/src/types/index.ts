export type Role = 'ADMIN' | 'SUPERVISOR' | 'TEACHER' | 'EXAM_COMMITTEE' | 'PARENT' | 'SUPPORT';

export type Evaluation = 'EXCELLENT' | 'VERY_GOOD' | 'GOOD' | 'ACCEPTABLE' | 'UNSATISFACTORY';
export type StudentStatus = 'ACTIVE' | 'SUSPENDED' | 'GRADUATED' | 'WITHDRAWN';
/** حاضر / غياب بدون عذر / غياب بعذر */
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED';
export type RecitationType = 'MEMORIZATION' | 'MINOR_REVIEW' | 'MAJOR_REVIEW' | 'TAJWEED';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type TransferKind =
  | 'STUDENT_TRANSFER'
  | 'TEACHER_TRANSFER'
  | 'TEACHER_SWAP'
  | 'ASSISTANT_ADD'
  | 'ASSISTANT_REMOVE';
export type ExamRequestStatus = 'PENDING' | 'SCHEDULED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
export type ExamStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'ABSENT';
export type ExamResult = 'PASSED' | 'FAILED';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'VOLUNTEER';

export interface AuthUser {
  id: string;
  /** Login identity — replaces the old username. */
  email: string;
  fullName: string;
  role: Role;
  avatarUrl?: string | null;
  isActive: boolean;
  teacherId?: string | null;
  parentId?: string | null;
  phone?: string | null;
  /** True while the account still uses a password the management set. */
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  teacherProfile?: TeacherProfile | null;
  parentProfile?: ParentProfile | null;
  supervisedCircles?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface UserRecord {
  id: string;
  fullName: string;
  role: Role;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface TeacherProfile {
  id: string;
  userId: string;
  nationalId?: string | null;
  birthDate?: string | null;
  address?: string | null;
  qualification?: string | null;
  specialization?: string | null;
  memorizedParts?: number | null;
  employmentType: EmploymentType;
  hireDate?: string | null;
  salary?: string | number | null;
  notes?: string | null;
  isActive: boolean;
  user: {
    id: string;
    fullName: string;
    email: string;
    phone?: string | null;
    avatarUrl?: string | null;
    isActive: boolean;
    lastLoginAt?: string | null;
  };
  circleRoles: {
    id: string;
    role: 'PRIMARY' | 'ASSISTANT';
    startedAt: string;
    endedAt?: string | null;
    circle: { id: string; name: string; code: string; isActive?: boolean };
  }[];
  studentsCount?: number;
}

export interface ParentProfile {
  id: string;
  userId: string;
  nationalId?: string | null;
  phone?: string | null;
  altPhone?: string | null;
  address?: string | null;
  occupation?: string | null;
  user: { id: string; fullName: string; email: string; phone?: string | null; isActive: boolean };
  students?: { id: string; code: string; fullName: string; status: StudentStatus; circle?: { id: string; name: string } | null }[];
}

export interface CircleTeacherLink {
  linkId: string;
  id: string;
  isActive: boolean;
  startedAt: string;
  user: { id: string; fullName: string; phone?: string | null; avatarUrl?: string | null };
}

export interface Circle {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  location?: string | null;
  level?: string | null;
  capacity: number;
  scheduleDays: string[];
  startTime?: string | null;
  endTime?: string | null;
  isActive: boolean;
  supervisorId?: string | null;
  supervisor?: { id: string; fullName: string; phone?: string | null; email?: string | null } | null;
  primaryTeacher?: CircleTeacherLink | null;
  assistantTeachers: CircleTeacherLink[];
  studentsCount: number;
  students?: StudentSummary[];
  stats?: {
    attendanceToday: { status: AttendanceStatus; count: number }[];
    recitationsThisWeek: number;
    activeStudents: number;
    suspendedStudents: number;
  };
}

export interface StudentSummary {
  id: string;
  code: string;
  fullName: string;
  status: StudentStatus;
  evaluation?: Evaluation | null;
  memorizedParts: number;
  guardianPhone?: string | null;
}

export interface Student {
  id: string;
  code: string;
  fullName: string;
  birthDate?: string | null;
  gender: 'MALE' | 'FEMALE';
  nationalId?: string | null;
  fatherNationalId?: string | null;
  address?: string | null;
  phone?: string | null;
  status: StudentStatus;
  evaluation?: Evaluation | null;
  evaluationNote?: string | null;
  evaluatedAt?: string | null;
  memorizedParts: number;
  currentSurah?: string | null;
  currentPage?: number | null;
  notes?: string | null;
  enrollmentDate: string;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianRelation?: string | null;
  parentId?: string | null;
  circleId?: string | null;
  circle?: {
    id: string;
    name: string;
    code: string;
    supervisor?: { id: string; fullName: string } | null;
  } | null;
  parentProfile?: { id: string; phone?: string | null; user: { id: string; fullName: string } } | null;
  teacherName?: string | null;
  teacherId?: string | null;
  supervisorName?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  createdAt: string;
  lastRecitation?: Recitation | null;
  activeSuspension?: (Suspension & { remainingDays: number }) | null;
  notes_list?: StudentNote[];
  attendanceSummary?: {
    total: number;
    present: number;
    absent: number;
    excused: number;
    late: number;
    attendanceRate: number;
  };
  examSummary?: { passed: number; failed: number; lastPassedSection: string | null };
}

export interface StudentNote {
  id: string;
  body: string;
  isPrivate: boolean;
  createdAt: string;
  author: { id: string; fullName: string; role: Role };
}

export interface AttendanceRecord {
  id: string;
  date: string;
  status: AttendanceStatus;
  note?: string | null;
  student: { id: string; code: string; fullName: string };
  circle: { id: string; name: string; code: string };
  recordedBy?: { id: string; fullName: string };
}

export interface AttendanceSheet {
  circle: { id: string; name: string; code: string; scheduleDays: string[]; startTime?: string | null };
  date: string;
  alreadyRecorded: boolean;
  /** False once the day has been submitted, unless the viewer may correct it. */
  canSubmit: boolean;
  submittedAt?: string | null;
  submittedBy?: { id: string; fullName: string } | null;
  students: {
    id: string;
    code: string;
    fullName: string;
    status: StudentStatus;
    evaluation?: Evaluation | null;
    attendance: {
      studentId: string;
      status: AttendanceStatus;
      note?: string | null;
    } | null;
  }[];
}

export interface Recitation {
  id: string;
  date: string;
  type: RecitationType;
  fromSurah: string;
  fromAyah: number;
  toSurah: string;
  toAyah: number;
  pagesCount?: number | null;
  /** التسميع اليومي يُقيَّم بتقدير عام فقط — لا درجة ولا عدد أخطاء. */
  evaluation?: Evaluation | null;
  notes?: string | null;
  student?: { id: string; code: string; fullName: string };
  circle?: { id: string; name: string; code: string };
  teacher?: { id: string; user: { id: string; fullName: string } };
}

export interface TransferRequest {
  id: string;
  kind: TransferKind;
  status: RequestStatus;
  reason?: string | null;
  decisionNote?: string | null;
  decidedAt?: string | null;
  effectiveAt?: string | null;
  createdAt: string;
  student?: { id: string; code: string; fullName: string } | null;
  fromCircle?: { id: string; name: string; code: string } | null;
  toCircle?: { id: string; name: string; code: string } | null;
  requestedBy: { id: string; fullName: string; role: Role };
  decidedBy?: { id: string; fullName: string; role: Role } | null;
  teacherA?: { id: string; user: { id: string; fullName: string } } | null;
  teacherB?: { id: string; user: { id: string; fullName: string } } | null;
}

export interface Suspension {
  id: string;
  studentId: string;
  reason: string;
  durationDays: number;
  startDate: string;
  endDate: string;
  status: RequestStatus;
  decisionNote?: string | null;
  decidedAt?: string | null;
  returnedAt?: string | null;
  returnedNote?: string | null;
  createdAt: string;
  remainingDays: number;
  isActive: boolean;
  student: {
    id: string;
    code: string;
    fullName: string;
    status: StudentStatus;
    guardianPhone?: string | null;
    circle?: { id: string; name: string; code: string } | null;
  };
  requestedBy: { id: string; fullName: string; role: Role };
  decidedBy?: { id: string; fullName: string; role: Role } | null;
}

export interface ExamSection {
  id: string;
  name: string;
  code: string;
  order: number;
  minScore: number;
  pagesCount?: number | null;
  isRequired: boolean;
  description?: string | null;
}

export interface ExamEligibility {
  passedCount: number;
  totalSections: number;
  /** The first section that can be requested right now, if any. */
  nextSection: (ExamSection & { eligible: boolean }) | null;
  /** The section the student is already waiting on — blocks any new request. */
  pendingSection: { id: string; name: string; order: number } | null;
  /** True only when every required section has been passed. */
  isComplete: boolean;
  progression: (ExamSection & {
    isPassed: boolean;
    hasOpenRequest: boolean;
    eligible: boolean;
    reason: string | null;
    score: number | null;
  })[];
}

export interface ExamRequest {
  id: string;
  status: ExamRequestStatus;
  note?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  student: {
    id: string;
    code: string;
    fullName: string;
    memorizedParts: number;
    circle?: { id: string; name: string; code: string } | null;
  };
  section: ExamSection;
  teacher: { id: string; user: { id: string; fullName: string } };
  reviewedBy?: { id: string; fullName: string } | null;
  exam?: { id: string; scheduledAt: string; status: ExamStatus; result?: ExamResult | null; score?: number | null } | null;
}

export interface Exam {
  id: string;
  scheduledAt: string;
  location?: string | null;
  status: ExamStatus;
  score?: number | null;
  /** يُشتق تلقائياً من الدرجة حسب سلّم التقديرات — لا يُختار يدوياً. */
  evaluation?: Evaluation | null;
  /** اختياري — يمكن رصد الدرجة والملاحظات دون عدّ الأخطاء. */
  mistakes?: number | null;
  result?: ExamResult | null;
  notes?: string | null;
  gradedAt?: string | null;
  student: {
    id: string;
    code: string;
    fullName: string;
    memorizedParts: number;
    circle?: { id: string; name: string; code: string } | null;
  };
  section: ExamSection;
  examiner?: { id: string; fullName: string } | null;
  gradedBy?: { id: string; fullName: string } | null;
  request?: { id: string; teacher?: { user: { id: string; fullName: string } } } | null;
}

export interface SupportTicket {
  id: string;
  number: number;
  subject: string;
  description: string;
  category?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string; role: Role; avatarUrl?: string | null };
  assignedTo?: { id: string; fullName: string; role: Role } | null;
  messages?: TicketMessage[];
  _count?: { messages: number };
}

export interface TicketMessage {
  id: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  sender: { id: string; fullName: string; role: Role; avatarUrl?: string | null };
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ChatMember {
  id: string;
  isAdmin: boolean;
  lastReadAt?: string | null;
  user: { id: string; fullName: string; role: Role; avatarUrl?: string | null };
}

export interface Conversation {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string;
  description?: string | null;
  avatarUrl?: string | null;
  otherUser?: { id: string; fullName: string; role: Role; avatarUrl?: string | null } | null;
  isOnline: boolean;
  members: ChatMember[];
  memberCount: number;
  lastMessage?: ChatMessage | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  /** Group is archived — history readable, no new messages. */
  isClosed: boolean;
  /** Only group admins may post. */
  adminOnly: boolean;
  /** Whether the current user is an admin of this group. */
  isAdmin: boolean;
  /** Whether the current user may send a message right now. */
  canPost: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  body: string;
  attachmentUrl?: string | null;
  editedAt?: string | null;
  createdAt: string;
  sender: { id: string; fullName: string; role: Role; avatarUrl?: string | null };
}

export interface SchoolSettings {
  id: string;
  name: string;
  mosqueName?: string | null;
  logoUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  about?: string | null;
  facebook?: string | null;
  twitter?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  telegram?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  academicYear?: string | null;
}

export interface ActivityEntry {
  id: string;
  action: string;
  summary: string;
  entityType?: string | null;
  createdAt: string;
  user?: { id: string; fullName: string; role: Role } | null;
}
