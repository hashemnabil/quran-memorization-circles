import { get } from './offline-engine';

const day = (date: any) => String(date || '').slice(0, 10);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export async function localDashboard(role: string) {
  const [students, circles, teachers, attendance, recitations, exams, requests] = await Promise.all(['students', 'circles', 'teachers', 'attendance', 'recitations', 'exams', 'examRequests'].map((table) => get(table as any)));
  const date = today(); const current = attendance.filter((row) => day(row.date) === date);
  const statuses = (rows: any[]) => Object.fromEntries(['PRESENT', 'ABSENT', 'EXCUSED'].map((status) => [status, rows.filter((row) => row.status === status).length]));
  const passed = exams.filter((row) => row.result === 'PASSED').length; const failed = exams.filter((row) => row.result === 'FAILED').length;
  const pending = requests.filter((row) => row.status === 'PENDING');
  const weeklyAttendance = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(`${date}T12:00:00+03:00`); d.setUTCDate(d.getUTCDate() - 13 + i); const key = d.toISOString().slice(0, 10);
    return { date: key, ...statuses(attendance.filter((row) => day(row.date) === key)) };
  });
  const circleRows = circles.map((circle) => ({ ...circle, studentCount: students.filter((student) => (student.circleId || student.circle?.id) === circle.id).length,
    students: students.filter((student) => (student.circleId || student.circle?.id) === circle.id).length,
    fillRate: circle.capacity ? Math.round(students.filter((student) => (student.circleId || student.circle?.id) === circle.id).length * 100 / circle.capacity) : 0,
    primaryTeacher: circle.teachers?.find((link: any) => link.role === 'PRIMARY')?.teacher?.user?.fullName,
    assistants: circle.teachers?.filter((link: any) => link.role === 'ASSISTANT').map((link: any) => link.teacher?.user?.fullName) || [],
    _count: { students: students.filter((student) => (student.circleId || student.circle?.id) === circle.id).length },
    attendanceToday: statuses(current.filter((row) => row.circleId === circle.id)) }));
  return { role, counts: { students: students.length, activeStudents: students.filter((row) => row.status === 'ACTIVE').length,
    suspendedStudents: students.filter((row) => row.status === 'SUSPENDED').length, circles: circles.length, activeCircles: circles.filter((row) => row.isActive).length,
    teachers: teachers.length, recitationsLast7Days: recitations.filter((row) => day(row.date) >= weeklyAttendance[7].date).length,
    pendingExamRequests: pending.length, waitingList: pending.length, scheduled: exams.filter((row) => row.status === 'SCHEDULED').length,
    passed, failed, passRate: passed + failed ? Math.round(passed * 100 / (passed + failed)) : 0 },
    pending: { examRequests: pending.length }, attendanceToday: statuses(current), weeklyAttendance,
    circles: circleRows, topCircles: [...circleRows].sort((a, b) => b.studentCount - a.studentCount).slice(0, 5),
    evaluationBreakdown: [...new Set(students.map((row) => row.evaluation).filter(Boolean))].map((evaluation) => ({ evaluation, count: students.filter((row) => row.evaluation === evaluation).length })),
    suspendedList: students.filter((row) => row.status === 'SUSPENDED'), nextExams: exams.filter((row) => row.status === 'SCHEDULED').slice(0, 8),
    upcomingExams: exams.filter((row) => row.status === 'SCHEDULED'), waitingListPreview: pending.slice(0, 8), activity: [] };
}
export async function localReport(params: Record<string, any>): Promise<any> {
  const type = params.type || 'attendance';
  const tables = ['students', 'circles', 'teachers', 'attendance', 'recitations', 'exams', 'courses'] as const;
  const arrays = await Promise.all(tables.map((table) => get(table)));
  const data = Object.fromEntries(tables.map((table, index) => [table, arrays[index]]));
  const filter = (rows: any[], dated = true) => rows.filter((row) => {
    const date = day(row.date || row.enrollmentDate || row.scheduledAt || row.createdAt);
    if (params.track === 'CIRCLE' && !(row.circleId || row.circle?.id)) return false;
    if (params.track === 'ACTIVITY' && row.status !== 'ACTIVITY') return false;
    if (params.track === 'COURSE' && !row.courses?.length && !row.courseEnrollments?.length) return false;
    if (params.teacherId && row.teacherId !== params.teacherId && !row.circle?.teachers?.some((link: any) => link.teacher?.id === params.teacherId)) return false;
    return (!params.studentId || row.studentId === params.studentId || row.id === params.studentId) &&
      (!params.circleId || (row.circleId || row.circle?.id) === params.circleId || type === 'circles' && row.id === params.circleId) &&
      (!params.status || row.status === params.status) && (!params.evaluation || row.evaluation === params.evaluation) &&
      (!params.search || JSON.stringify(row).toLocaleLowerCase().includes(String(params.search).toLocaleLowerCase())) &&
      (!dated || (!params.from || date >= params.from) && (!params.to || date <= params.to));
  });
  const studentName = (row: any) => data.students.find((student) => student.id === row.studentId)?.fullName || row.student?.fullName || '';
  const attendance = filter(data.attendance).map((row) => ({ الطالب: studentName(row), التاريخ: day(row.date), الحالة: row.status, ملاحظة: row.note || '' }));
  const recitations = filter(data.recitations).map((row) => ({ الطالب: studentName(row), التاريخ: day(row.date), النوع: row.type, من: `${row.fromSurah || ''} ${row.fromAyah || ''}`, إلى: `${row.toSurah || ''} ${row.toAyah || ''}`, الصفحات: row.pagesCount || 0, النقاط: row.points || 0 }));
  const exams = filter(data.exams).map((row) => ({ الطالب: studentName(row), التاريخ: day(row.scheduledAt), العلامة: row.score ?? '', النتيجة: row.result || '' }));
  if (type === 'student') return { type, student: data.students.find((row) => row.id === params.studentId), attendance, recitations, exams, stats: { attendance: attendance.length, recitations: recitations.length, exams: exams.length } };
  let rows: any[] = [];
  if (type === 'attendance') rows = attendance;
  if (type === 'recitations') rows = recitations;
  if (type === 'exams') rows = exams;
  if (type === 'students') rows = filter(data.students).map((row) => ({ الطالب: row.fullName, الرقم: row.code, الحلقة: row.circle?.name || '', الحالة: row.status, الجوال: row.phone || '' }));
  if (type === 'circles') rows = filter(data.circles, false).map((row) => ({ الحلقة: row.name, الطلاب: data.students.filter((student) => (student.circleId || student.circle?.id) === row.id).length, الحضور: data.attendance.filter((entry) => entry.circleId === row.id).length, التسميع: data.recitations.filter((entry) => entry.circleId === row.id).length }));
  if (type === 'courses') rows = data.courses.filter((row) => !params.courseId || row.id === params.courseId).map((row) => ({ الدورة: row.name, الرمز: row.code, النوع: row.type, الطلاب: row.students?.length || 0 }));
  if (type === 'courseStudents') rows = data.courses.filter((row) => row.id === params.courseId).flatMap((course) => (course.students || []).filter((row: any) => !params.search || row.fullName?.includes(params.search)).map((row: any) => ({ الطالب: row.fullName, الرقم: row.code, الدورة: course.name, الجوال: row.phone || '', تاريخ_التسجيل: day(row.enrolledAt), الحالة: row.isCurrent ? 'مسجل' : 'منتهٍ' })));
  if (type === 'courseAttendance') rows = data.courses.filter((row) => row.id === params.courseId).flatMap((course) => filter(course._offline?.attendance || []).map((row: any) => ({ الطالب: row.student?.fullName || studentName(row), الدورة: course.name, التاريخ: day(row.date), الحالة: row.status, ملاحظة: row.note || '' })));
  const stats: Record<string, number> = { total: rows.length };
  if (type === 'attendance') for (const [key, status] of [['present', 'PRESENT'], ['absent', 'ABSENT'], ['excused', 'EXCUSED']]) stats[key] = rows.filter((row) => row.الحالة === status).length;
  if (type === 'recitations') { stats.pages = rows.reduce((sum, row) => sum + Number(row.الصفحات), 0); stats.points = rows.reduce((sum, row) => sum + Number(row.النقاط), 0); }
  return { type, rows, stats };
}
