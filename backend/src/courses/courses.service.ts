import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(type?: 'SHARIA' | 'TAJWEED') {
    return this.prisma.$queryRawUnsafe(
      `SELECT c.*, COALESCE(json_agg(json_build_object('id', cc.id, 'name', cc.name, 'code', cc.code, 'capacity', cc.capacity)) FILTER (WHERE cc.id IS NOT NULL), '[]') AS circles
       FROM courses c LEFT JOIN course_circles cc ON cc.course_id = c.id
       ${type ? `WHERE c.type = '${type}'` : ''}
       GROUP BY c.id ORDER BY c.created_at DESC`,
    );
  }

  async createCourse(name: string, type: 'SHARIA' | 'TAJWEED', description?: string) {
    if (!name?.trim()) throw new BadRequestException('اسم الدورة مطلوب');
    if (!['SHARIA', 'TAJWEED'].includes(type)) throw new BadRequestException('نوع الدورة غير صالح');
    return this.prisma.$queryRawUnsafe(
      `INSERT INTO courses (id,name,type,description) VALUES (gen_random_uuid()::text,$1,$2,$3) RETURNING *`,
      name.trim(), type, description ?? null,
    );
  }

  async createCircle(courseId: string, name: string, code: string, capacity = 25) {
    const course = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM courses WHERE id=$1`, courseId);
    if (!course.length) throw new NotFoundException('الدورة غير موجودة');
    return this.prisma.$queryRawUnsafe(
      `INSERT INTO course_circles (id,course_id,name,code,capacity) VALUES (gen_random_uuid()::text,$1,$2,$3,$4) RETURNING *`,
      courseId, name.trim(), code.trim(), capacity,
    );
  }

  async enrollStudent(courseCircleId: string, studentId: string) {
    const circle = await this.prisma.$queryRawUnsafe<any[]>(`SELECT course_id, capacity, (SELECT count(*) FROM course_enrollments e WHERE e.course_circle_id=$1 AND e.status='ACTIVE') AS current_count FROM course_circles WHERE id=$1 AND is_active=true`, courseCircleId);
    if (!circle.length) throw new NotFoundException('حلقة الدورة غير موجودة');
    if (Number(circle[0].current_count) >= Number(circle[0].capacity)) throw new BadRequestException('حلقة الدورة مكتملة العدد');
    const student = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM students WHERE id=$1 AND deleted_at IS NULL`, studentId);
    if (!student.length) throw new NotFoundException('الطالب غير موجود');
    return this.prisma.$queryRawUnsafe(
      `INSERT INTO course_enrollments (id,course_id,course_circle_id,student_id) VALUES (gen_random_uuid()::text,$1,$2,$3) RETURNING *`,
      circle[0].course_id, courseCircleId, studentId,
    );
  }

  async completeEnrollment(enrollmentId: string, note?: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE course_enrollments SET status='COMPLETED', completed_at=CURRENT_TIMESTAMP, completion_note=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='ACTIVE' RETURNING *`,
      enrollmentId, note ?? null,
    );
    if (!rows.length) throw new NotFoundException('سجل اشتراك الدورة غير موجود أو مكتمل مسبقاً');
    return rows[0];
  }

  async studentRecord(studentId: string) {
    return this.prisma.$queryRawUnsafe(
      `SELECT e.*, c.name AS course_name, c.type AS course_type, cc.name AS circle_name, cc.code AS circle_code
       FROM course_enrollments e JOIN courses c ON c.id=e.course_id JOIN course_circles cc ON cc.id=e.course_circle_id
       WHERE e.student_id=$1 ORDER BY e.enrolled_at DESC`,
      studentId,
    );
  }

  async teacherCourses(teacherId: string) {
    return this.prisma.$queryRawUnsafe(
      `SELECT ct.*, cc.name AS circle_name, cc.code AS circle_code, c.id AS course_id, c.name AS course_name, c.type AS course_type
       FROM course_teachers ct JOIN course_circles cc ON cc.id=ct.course_circle_id JOIN courses c ON c.id=cc.course_id
       WHERE ct.teacher_id=$1 ORDER BY ct.started_at DESC`,
      teacherId,
    );
  }
}
