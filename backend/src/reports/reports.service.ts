import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { AuthUser } from '../common/decorators';

export type ReportType = 'attendance' | 'recitations' | 'exams' | 'student' | 'circles' | 'students' | 'courses' | 'courseStudents' | 'courseAttendance';
const DATE = (s?: string) => {
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('صيغة التاريخ غير صحيحة');
  return d;
};
const formatDateValue = (value: unknown): unknown => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }
  return value;
};
const sheet = (rows: Record<string, unknown>[]) => XLSX.utils.json_to_sheet((rows.length ? rows : [{ 'لا توجد بيانات': '' }]).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, formatDateValue(value)]))));
const arabicAttendance: Record<string, string> = { PRESENT: 'حاضر', ABSENT: 'غائب', EXCUSED: 'غائب بعذر' };

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly acl: AccessControlService) {}

  async getReport(user: AuthUser, type: ReportType, q: Record<string, string>) {
    if (!['attendance','recitations','exams','student','circles','students','courses','courseStudents','courseAttendance'].includes(type)) throw new BadRequestException('نوع التقرير غير معروف');
    if (user.role !== Role.ADMIN && user.role !== Role.SUPERVISOR && user.role !== Role.TEACHER) {
      throw new BadRequestException('لا تملك صلاحية عرض التقارير');
    }
    const from = DATE(q.from), to = DATE(q.to);
    const allowed = await this.acl.accessibleCircleIds(user);
    if (q.circleId) await this.acl.assertCircleAccess(user, q.circleId);
    const studentScope = await this.acl.studentScope(user);
    const circleFilter = q.circleId ? { circleId: q.circleId } : allowed === null ? {} : { circleId: { in: allowed } };
    const studentFilter: Prisma.StudentWhereInput = {
      ...studentScope, deletedAt: null,
      ...(q.studentId ? { id: q.studentId } : {}),
      ...(q.circleId ? { circleId: q.circleId } : {}),
    };
    if (q.studentId) await this.acl.assertStudentAccess(user, q.studentId);

    if (type === 'students') {
      const rows = await this.prisma.student.findMany({
        where: {
          ...studentScope,
          deletedAt: null,
          ...(q.status ? { status: q.status as any } : {}),
          ...(q.evaluation ? { evaluation: q.evaluation as any } : {}),
          ...(q.circleId ? { circleId: q.circleId } : {}),
          ...(q.search ? { OR: [
            { fullName: { contains: q.search, mode: 'insensitive' } },
            { code: { contains: q.search, mode: 'insensitive' } },
            { nationalId: { contains: q.search } },
            { guardianName: { contains: q.search, mode: 'insensitive' } },
            { guardianPhone: { contains: q.search } },
          ] } : {}),
        },
        include: {
          circle: { select: { name: true, teachers: { where: { endedAt: null }, include: { teacher: { include: { user: { select: { fullName: true } } } } } } } },
          parentProfile: { include: { user: { select: { fullName: true } } } },
        },
        orderBy: { fullName: 'asc' },
        take: 10000,
      });
      const statusLabels: Record<string, string> = { ACTIVE: 'منتظم', SUSPENDED: 'موقوف', ACTIVITY: 'محوّل لبرنامج النشاط', GRADUATED: 'متخرج', WITHDRAWN: 'منسحب' };
      const evaluationLabels: Record<string, string> = { EXCELLENT: 'ممتاز', VERY_GOOD: 'جيد جداً', GOOD: 'جيد', ACCEPTABLE: 'مقبول', UNSATISFACTORY: 'غير مرضٍ' };
      const output = rows.map(r => ({
        'الطالب': r.fullName,
        'رقم الطالب': r.code,
        'رقم الهوية': r.nationalId ?? '',
        'تاريخ الميلاد': r.birthDate ?? '',
        'الحلقة': r.circle?.name ?? (r.status === 'ACTIVITY' ? 'برنامج النشاط' : 'غير مسجل'),
        'المعلم': r.circle?.teachers.map(t => t.teacher.user.fullName).join('، ') ?? '',
        'ولي الأمر': r.guardianName ?? r.parentProfile?.user.fullName ?? '',
        'هاتف ولي الأمر': r.guardianPhone ?? r.parentProfile?.phone ?? '',
        'الأجزاء': r.memorizedParts,
        'النقاط': Math.round(r.totalPoints * 100) / 100,
        'التقييم': r.evaluation ? evaluationLabels[r.evaluation] ?? r.evaluation : '',
        'الحالة': statusLabels[r.status] ?? r.status,
      }));
      return { type, rows: output, stats: { total: output.length, active: rows.filter(r => r.status === 'ACTIVE').length, suspended: rows.filter(r => r.status === 'SUSPENDED').length, activity: rows.filter(r => r.status === 'ACTIVITY').length } };
    }

    if (type === 'attendance') {
      const rows = await this.prisma.attendance.findMany({
        where: { ...circleFilter, ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}), student: studentFilter },
        include: { student: { select: { id: true, code: true, fullName: true } }, circle: { select: { name: true } } },
        orderBy: [{ date: 'desc' }, { student: { fullName: 'asc' } }], take: 10000,
      });
      return { type, rows: rows.map(r => ({ 'التاريخ': r.date, 'معرّف الطالب': r.student.id, 'رقم الطالب': r.student.code, 'الطالب': r.student.fullName, 'الحلقة': r.circle.name, 'الحالة': arabicAttendance[r.status] ?? r.status, 'ملاحظات': r.note ?? '' })), stats: { total: rows.length, present: rows.filter(r=>r.status==='PRESENT').length, absent: rows.filter(r=>r.status==='ABSENT').length, excused: rows.filter(r=>r.status==='EXCUSED').length } };
    }
    if (type === 'recitations') {
      const rows = await this.prisma.recitation.findMany({
        where: { deletedAt: null, student: studentFilter, ...circleFilter, ...(q.teacherId ? { teacherId: q.teacherId } : {}), ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
        include: { student: { select: { id: true, code: true, fullName: true } }, circle: { select: { name: true } }, teacher: { include: { user: { select: { fullName: true } } } } },
        orderBy: { date: 'desc' }, take: 10000,
      });
      return { type, rows: rows.map(r=>({ 'التاريخ':r.date, 'معرّف الطالب':r.student.id, 'رقم الطالب':r.student.code, 'الطالب':r.student.fullName, 'الحلقة':r.circle.name, 'المعلم':r.teacher.user.fullName, 'نوع التسميع':r.type, 'من سورة وآية':`${r.fromSurah}:${r.fromAyah}`, 'إلى سورة وآية':`${r.toSurah}:${r.toAyah}`, 'عدد الصفحات':r.pagesCount ?? 0, 'عدد الآيات':r.versesCount ?? 0, 'الأخطاء':r.mistakes, 'التنبيهات':r.warnings, 'النقاط':r.points, 'التقييم':r.evaluation ?? '' })), stats:{ total:rows.length, pages:rows.reduce((n,r)=>n+(r.pagesCount??0),0), points:rows.reduce((n,r)=>n+r.points,0), students:new Set(rows.map(r=>r.studentId)).size } };
    }
    if (type === 'exams') {
      const rows = await this.prisma.exam.findMany({
        where: { student: studentFilter, ...(from || to ? { scheduledAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
        include: { student: { select: { id:true, code:true, fullName:true, circleId:true } }, section: { select:{ name:true, code:true } }, examiner: { select:{ fullName:true } } },
        orderBy:{ scheduledAt:'desc' }, take:10000,
      });
      const scoped = rows.filter(r => allowed === null || (r.student.circleId && allowed.includes(r.student.circleId)));
      return { type, rows: scoped.map(r=>({ 'تاريخ الاختبار':r.scheduledAt, 'معرّف الطالب':r.student.id, 'رقم الطالب':r.student.code, 'الطالب':r.student.fullName, 'المقرر':r.section.name, 'الممتحن':r.examiner?.fullName??'', 'حالة الاختبار':r.status, 'العلامة':r.score ?? '', 'النتيجة':r.result==='PASSED'?'ناجح':r.result==='FAILED'?'راسب':r.result ?? '', 'التقييم':r.evaluation ?? '' })), stats:{ total:scoped.length, passed:scoped.filter(r=>r.result==='PASSED').length, failed:scoped.filter(r=>r.result==='FAILED').length, average:scoped.filter(r=>r.score!==null).length ? Math.round(scoped.filter(r=>r.score!==null).reduce((n,r)=>n+(r.score??0),0)/scoped.filter(r=>r.score!==null).length) : 0 } };
    }
    if (type === 'student') {
      if (!q.studentId) throw new BadRequestException('اختر الطالب أولاً لعرض ملفه الشامل');
      const student = await this.prisma.student.findFirst({ where: { id:q.studentId, ...studentScope, deletedAt:null }, include:{ circle:{select:{name:true}}, attendance:{where:allowed===null?{}:{circleId:{in:allowed}},orderBy:{date:'desc'},include:{circle:{select:{name:true}}},take:10000}, recitations:{where:{deletedAt:null,...(allowed===null?{}:{circleId:{in:allowed}})},orderBy:{date:'desc'},include:{circle:{select:{name:true}},teacher:{include:{user:{select:{fullName:true}}}}},take:10000}, exams:{orderBy:{scheduledAt:'desc'},include:{section:{select:{name:true}},examiner:{select:{fullName:true}}},take:10000} } });
      if (!student) throw new BadRequestException('الطالب غير موجود أو لا تملك صلاحية الوصول إليه');
      return { type, student:{'معرّف الطالب':student.id,'رقم الطالب':student.code,'اسم الطالب':student.fullName,'الجنس':student.gender==='MALE'?'ذكر':student.gender==='FEMALE'?'أنثى':student.gender,'الحالة':student.status,'الحلقة':student.circle?.name??'','تاريخ التسجيل':student.enrollmentDate,'هاتف الطالب':student.phone??'','ولي الأمر':student.guardianName??'','هاتف ولي الأمر':student.guardianPhone??'','الأجزاء المحفوظة':student.memorizedParts,'مجموع النقاط':student.totalPoints}, attendance:student.attendance.map(a=>({date:a.date,circle:a.circle.name,status:arabicAttendance[a.status]??a.status,note:a.note??''})), recitations:student.recitations.map(r=>({date:r.date,circle:r.circle.name,teacher:r.teacher.user.fullName,type:r.type,from:`${r.fromSurah}:${r.fromAyah}`,to:`${r.toSurah}:${r.toAyah}`,pages:r.pagesCount??0,verses:r.versesCount??0,points:r.points,evaluation:r.evaluation??''})), exams:student.exams.map(e=>({date:e.scheduledAt,section:e.section.name,examiner:e.examiner?.fullName??'',status:e.status,score:e.score??'',result:e.result??'',evaluation:e.evaluation??''})), stats:{attendance:student.attendance.length,recitations:student.recitations.length,exams:student.exams.length,points:student.totalPoints} };
    }
    const courseScope: Prisma.CourseWhereInput = { deletedAt: null, ...(user.role === Role.TEACHER ? { instructorId: user.id } : {}), ...(q.courseId ? { id: q.courseId } : {}) };
    if (['courses', 'courseStudents', 'courseAttendance'].includes(type)) {
      if (type === 'courses') {
        const courses = await this.prisma.course.findMany({ where: courseScope, include: { instructor: { select: { fullName: true } }, _count: { select: { enrollments: true, attendance: true } } }, orderBy: { name: 'asc' }, take: 5000 });
        const rows = courses.map(c => ({ 'الدورة': c.name, 'رمز الدورة': c.code, 'النوع': c.type === 'SHARIA' ? 'شرعية' : 'تجويد', 'المحاضر': c.instructor?.fullName ?? c.instructorName ?? '', 'الموقع': c.location ?? '', 'تاريخ البداية': c.startDate ?? '', 'تاريخ النهاية': c.endDate ?? '', 'عدد المسجلين': c._count.enrollments, 'سجلات الحضور': c._count.attendance, 'مفعّلة': c.isActive ? 'نعم' : 'لا' }));
        return { type, rows, stats: { total: rows.length, students: courses.reduce((n,c)=>n+c._count.enrollments,0), attendance: courses.reduce((n,c)=>n+c._count.attendance,0) } };
      }
      if (!q.courseId) throw new BadRequestException('اختر الدورة أولاً');
      const course = await this.prisma.course.findFirst({ where: courseScope, select: { id: true, name: true } });
      if (!course) throw new BadRequestException('الدورة غير موجودة أو لا تملك صلاحية الوصول إليها');
      if (type === 'courseStudents') {
        const enrollments = await this.prisma.courseEnrollment.findMany({ where: { courseId: course.id, student: { deletedAt: null } }, include: { student: { select: { code: true, fullName: true, nationalId: true, birthDate: true, phone: true, status: true, guardianName: true, guardianPhone: true } } }, orderBy: { student: { fullName: 'asc' } }, take: 10000 });
        const rows = enrollments.map(e => ({ 'الدورة': course.name, 'اسم الطالب': e.student.fullName, 'رقم الطالب': e.student.code, 'رقم الهوية': e.student.nationalId ?? '', 'تاريخ الميلاد': e.student.birthDate ?? '', 'الهاتف': e.student.phone ?? '', 'ولي الأمر': e.student.guardianName ?? '', 'هاتف ولي الأمر': e.student.guardianPhone ?? '', 'الحالة': e.student.status, 'تاريخ التسجيل بالدورة': e.enrolledAt, 'تاريخ الانسحاب': e.endedAt ?? '', 'التسجيل الحالي': e.endedAt ? 'لا' : 'نعم' }));
        return { type, rows, stats: { total: rows.length, active: enrollments.filter(e=>!e.endedAt).length } };
      }
      const records = await this.prisma.courseAttendance.findMany({ where: { courseId: course.id, student: { deletedAt: null }, ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) }, include: { student: { select: { code: true, fullName: true } }, course: { select: { name: true } } }, orderBy: [{ date: 'desc' }, { student: { fullName: 'asc' } }], take: 10000 });
      const rows = records.map(a => ({ 'التاريخ': a.date, 'الدورة': a.course.name, 'رقم الطالب': a.student.code, 'الطالب': a.student.fullName, 'الحالة': arabicAttendance[a.status] ?? a.status, 'ملاحظات': a.note ?? '' }));
      return { type, rows, stats: { total: rows.length, present: records.filter(a=>a.status==='PRESENT').length, absent: records.filter(a=>a.status==='ABSENT').length, excused: records.filter(a=>a.status==='EXCUSED').length } };
    }

    const circles = await this.prisma.circle.findMany({ where:{deletedAt:null,...(allowed===null?{}:{id:{in:allowed}}),...(q.circleId?{id:q.circleId}:{})}, include:{_count:{select:{students:true,attendance:true,recitations:true}},teachers:{where:{endedAt:null},include:{teacher:{include:{user:{select:{fullName:true}}}}}}},orderBy:{name:'asc'},take:5000 });
    return { type, rows:circles.map(c=>({'الحلقة':c.name,'رمز الحلقة':c.code,'عدد الطلاب':c._count.students,'سجلات الحضور':c._count.attendance,'سجلات التسميع':c._count.recitations,'المعلمون':c.teachers.map(t=>t.teacher.user.fullName).join('، '),'السعة الاستيعابية':c.capacity,'مفعّلة':c.isActive?'نعم':'لا'})), stats:{circles:circles.length,students:circles.reduce((n,c)=>n+c._count.students,0),attendance:circles.reduce((n,c)=>n+c._count.attendance,0),recitations:circles.reduce((n,c)=>n+c._count.recitations,0)} };
  }

  async exportXlsx(user: AuthUser, type: ReportType, q: Record<string,string>) {
    const data = await this.getReport(user,type,q) as any;
    const wb = XLSX.utils.book_new();
    if (type === 'student') {
      XLSX.utils.book_append_sheet(wb, sheet([data.student]), 'بيانات الطالب');
      XLSX.utils.book_append_sheet(wb, sheet(data.attendance), 'الحضور');
      XLSX.utils.book_append_sheet(wb, sheet(data.recitations), 'التسميع');
      XLSX.utils.book_append_sheet(wb, sheet(data.exams), 'الاختبارات');
    } else {
      XLSX.utils.book_append_sheet(wb, sheet(data.rows), ({attendance:'الحضور والغياب',recitations:'التسميع اليومي',exams:'الاختبارات',circles:'إحصائيات الحلقات',students:'سجل الطلاب',courses:'حلقات_الدورات',courseStudents:'طلاب_الدورات',courseAttendance:'حضور_وغياب_الدورات'} as Record<string,string>)[type] ?? 'التقرير');
    }
    return { buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'}), filename:`${({attendance:'تقرير_الحضور_والغياب',recitations:'تقرير_التسميع_اليومي',exams:'تقرير_الاختبارات',student:'الملف_الشامل_للطالب',circles:'إحصائيات_الحلقات',students:'سجل_الطلاب',courses:'حلقات_الدورات',courseStudents:'طلاب_الدورات',courseAttendance:'حضور_وغياب_الدورات'} as Record<string,string>)[type] ?? 'تقرير'}_${new Date().toISOString().slice(0,10)}.xlsx` };
  }
}
