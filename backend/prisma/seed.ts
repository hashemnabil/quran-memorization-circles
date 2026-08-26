/**
 * Demo data for the Quran Memorization Circles system.
 *
 * Running it repeatedly is safe: the script clears the tables it owns before
 * inserting, so `npm run seed` always produces the same predictable dataset.
 */
import 'dotenv/config';
import {
  AttendanceStatus,
  CircleTeacherRole,
  ConversationType,
  CourseType,
  EmploymentType,
  Evaluation,
  ExamRequestStatus,
  ExamResult,
  ExamSectionKind,
  ExamStatus,
  NotificationType,
  PrismaClient,
  RecitationType,
  RequestStatus,
  Role,
  StudentStatus,
  SuspensionAction,
  TicketPriority,
  TicketStatus,
  TransferKind,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'Pass@1234';
const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

// --- helpers ---------------------------------------------------------------

const dateOnly = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateOnly(d);
};
const daysAhead = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const pick = <T>(arr: T[], i: number): T => arr[i % arr.length];

/**
 * The school's grading scale — mirrors `src/common/grading.ts`.
 * 90+ ممتاز · 80+ جيد جداً · 70+ جيد · 60+ مقبول · أقل غير مرضٍ
 */
function evaluationFromScore(score: number): Evaluation {
  if (score >= 90) return Evaluation.EXCELLENT;
  if (score >= 80) return Evaluation.VERY_GOOD;
  if (score >= 70) return Evaluation.GOOD;
  if (score >= 60) return Evaluation.ACCEPTABLE;
  return Evaluation.UNSATISFACTORY;
}

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Ayah count for a range, mirroring `src/common/quran.ts`.
 *
 * Duplicated rather than imported because `tsconfig.seed.json` does not include
 * `src/`; the seed has always kept its own copy of the shared helpers.
 */
const SURAH_AYAHS: Record<string, number> = {
  'الفاتحة': 7, 'البقرة': 286, 'الملك': 30, 'القلم': 52, 'الحاقة': 52,
  'النبأ': 40, 'النازعات': 46, 'عبس': 42, 'التكوير': 29, 'المطففين': 36,
  'الانشقاق': 25, 'البروج': 22, 'الأعلى': 19, 'الغاشية': 26, 'البلد': 20,
  'الشمس': 15, 'الشرح': 8, 'التين': 8, 'البينة': 8, 'الزلزلة': 8,
  'الهمزة': 9, 'الفيل': 5, 'الناس': 6, 'الفلق': 5, 'الإخلاص': 4,
  'المسد': 5, 'النصر': 3, 'الكافرون': 6,
};

function countVerses(fromSurah: string, fromAyah: number, toSurah: string, toAyah: number) {
  if (fromSurah === toSurah) return Math.max(0, toAyah - fromAyah + 1);
  // Cross-surah demo ranges are short, so the tail of the first surah plus the
  // head of the last is a close enough count for seed data.
  const firstTail = Math.max(0, (SURAH_AYAHS[fromSurah] ?? toAyah) - fromAyah + 1);
  return firstTail + Math.max(0, toAyah);
}

/** Deterministic-ish weighted pick so the demo attendance looks realistic. */
function attendanceStatus(): AttendanceStatus {
  const r = Math.random();
  if (r < 0.84) return AttendanceStatus.PRESENT;
  if (r < 0.93) return AttendanceStatus.ABSENT;
  return AttendanceStatus.EXCUSED;
}

/**
 * The examination programme: 60 ahzab and nothing else, in no binding order.
 * A juz' is two ahzab, derived wherever a screen counts in ajza'.
 */
const HIZB_SECTIONS = Array.from({ length: 60 }, (_, i) => {
  const hizb = i + 1;
  return {
    code: `HIZB-${String(hizb).padStart(2, '0')}`,
    name: `الحزب ${hizb}`,
    order: hizb,
    kind: ExamSectionKind.HIZB,
    pagesCount: 10,
    minScore: 60,
    isRequired: true,
    description: `اختبار حفظ وإتقان الحزب ${hizb} (من الجزء ${Math.ceil(hizb / 2)})`,
  };
});

const EXAM_SECTIONS = HIZB_SECTIONS;

const SURAH_RANGES = [
  { from: 'النبأ', fromAyah: 1, to: 'النبأ', toAyah: 40, pages: 2 },
  { from: 'النازعات', fromAyah: 1, to: 'النازعات', toAyah: 46, pages: 2 },
  { from: 'عبس', fromAyah: 1, to: 'التكوير', toAyah: 29, pages: 2 },
  { from: 'المطففين', fromAyah: 1, to: 'الانشقاق', toAyah: 25, pages: 2 },
  { from: 'البروج', fromAyah: 1, to: 'الأعلى', toAyah: 19, pages: 1.5 },
  { from: 'الغاشية', fromAyah: 1, to: 'البلد', toAyah: 20, pages: 1.5 },
  { from: 'الشمس', fromAyah: 1, to: 'الشرح', toAyah: 8, pages: 1 },
  { from: 'التين', fromAyah: 1, to: 'البينة', toAyah: 8, pages: 1.5 },
  { from: 'الزلزلة', fromAyah: 1, to: 'الهمزة', toAyah: 9, pages: 1 },
  { from: 'الفيل', fromAyah: 1, to: 'الناس', toAyah: 6, pages: 1.5 },
  { from: 'الملك', fromAyah: 1, to: 'الملك', toAyah: 30, pages: 2 },
  { from: 'القلم', fromAyah: 1, to: 'الحاقة', toAyah: 52, pages: 3 },
];

const FIRST_NAMES = [
  'عبدالله', 'محمد', 'أحمد', 'يوسف', 'إبراهيم', 'عمر', 'خالد', 'زياد', 'أنس', 'معاذ',
  'حمزة', 'سلمان', 'بلال', 'طارق', 'ياسين', 'مصعب', 'أسامة', 'عثمان', 'سعد', 'راشد',
];
const FAMILY_NAMES = [
  'الأنصاري', 'القحطاني', 'الحربي', 'الشمري', 'العتيبي', 'الزهراني', 'الغامدي',
  'المطيري', 'الدوسري', 'البقمي', 'السبيعي', 'الخالدي',
];

// ---------------------------------------------------------------------------

async function clean() {
  console.log('› تنظيف البيانات السابقة...');
  // Order matters: children first.
  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.conversationMember.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.ticketMessage.deleteMany(),
    prisma.supportTicket.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.staffAttendance.deleteMany(),
    prisma.courseAttendance.deleteMany(),
    prisma.courseEnrollment.deleteMany(),
    prisma.course.deleteMany(),
    prisma.preparationAssignment.deleteMany(),
    prisma.surahCompletion.deleteMany(),
    prisma.examSectionOnExam.deleteMany(),
    prisma.examRequestSection.deleteMany(),
    prisma.exam.deleteMany(),
    prisma.examRequest.deleteMany(),
    prisma.examSection.deleteMany(),
    prisma.suspensionRequest.deleteMany(),
    prisma.transferRequest.deleteMany(),
    prisma.recitation.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.studentNote.deleteMany(),
    prisma.studentEvaluation.deleteMany(),
    prisma.circleMembership.deleteMany(),
    prisma.student.deleteMany(),
    prisma.circleTeacher.deleteMany(),
    prisma.circle.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.teacherProfile.deleteMany(),
    prisma.parentProfile.deleteMany(),
    prisma.user.deleteMany(),
    prisma.schoolSettings.deleteMany(),
  ]);
}

async function main() {
  console.log('\n=== تهيئة البيانات التجريبية ===\n');
  await clean();

  const passwordHash = await bcrypt.hash(PASSWORD, ROUNDS);

  // --- settings ------------------------------------------------------------
  console.log('› إعدادات المدرسة');
  await prisma.schoolSettings.create({
    data: {
      id: 'default',
      name: 'مدرسة النور لتحفيظ القرآن الكريم',
      mosqueName: 'جامع النور',
      phone: '0555123456',
      email: 'info@alnoor-quran.sa',
      address: 'حي النزهة - شارع الملك عبدالعزيز',
      about:
        'مدرسة قرآنية تُعنى بتحفيظ كتاب الله وتعليم أحكام التجويد، تضم مجموعة من الحلقات المتخصصة بإشراف نخبة من المعلمين.',
      facebook: 'https://facebook.com/alnoor.quran',
      twitter: 'https://twitter.com/alnoor_quran',
      instagram: 'https://instagram.com/alnoor.quran',
      youtube: 'https://youtube.com/@alnoorquran',
      whatsapp: '0555123456',
      website: 'https://alnoor-quran.sa',
      academicYear: '1447 هـ',
    },
  });

  // --- exam sections -------------------------------------------------------
  console.log(`› مقررات الاختبارات (${HIZB_SECTIONS.length} حزباً)`);
  await prisma.examSection.createMany({ data: EXAM_SECTIONS });
  // Every section is a hizb now, and any of them may be requested at any time.
  const sections = await prisma.examSection.findMany({ orderBy: { order: 'asc' } });

  // --- users ---------------------------------------------------------------
  console.log('› المستخدمون');

  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@alnoor-quran.sa',
      passwordHash,
      fullName: 'الشيخ عبدالرحمن السالم',
      role: Role.ADMIN,
      phone: '0555000001',
      jobTitle: 'مدير المدرسة',
    },
  });

  const supervisors = await Promise.all(
    [
      { login: 'supervisor1', fullName: 'الأستاذ ماجد الشهري', phone: '0555000011' },
      { login: 'supervisor2', fullName: 'الأستاذ فهد العنزي', phone: '0555000012' },
    ].map((s) =>
      prisma.user.create({
        data: {
          username: s.login,
          email: `${s.login}@alnoor-quran.sa`,
          passwordHash,
          fullName: s.fullName,
          role: Role.SUPERVISOR,
          phone: s.phone,
          jobTitle: 'مشرف حلقات',
          specialization: 'إشراف تربوي',
            },
      }),
    ),
  );

  const committee = await Promise.all(
    [
      { login: 'committee1', fullName: 'الشيخ سعيد الحارثي', phone: '0555000021' },
      { login: 'committee2', fullName: 'الشيخ نايف الرشيد', phone: '0555000022' },
    ].map((c) =>
      prisma.user.create({
        data: {
          username: c.login,
          email: `${c.login}@alnoor-quran.sa`,
          passwordHash,
          fullName: c.fullName,
          role: Role.EXAM_COMMITTEE,
          phone: c.phone,
          jobTitle: 'عضو لجنة الاختبارات',
          specialization: 'القراءات والتجويد',
            },
      }),
    ),
  );

  const support = await prisma.user.create({
    data: {
      username: 'support',
      email: 'support@alnoor-quran.sa',
      passwordHash,
      fullName: 'م. وليد التقني',
      role: Role.SUPPORT,
      phone: '0555000031',
      jobTitle: 'الدعم الفني',
    },
  });

  // --- teachers ------------------------------------------------------------
  console.log('› المعلمون');
  const teacherSeed = [
    { login: 'teacher1', fullName: 'الأستاذ محمد العمري', parts: 30, qual: 'بكالوريوس الشريعة' },
    { login: 'teacher2', fullName: 'الأستاذ سالم الجهني', parts: 30, qual: 'إجازة في القراءات' },
    { login: 'teacher3', fullName: 'الأستاذ بدر القرني', parts: 25, qual: 'بكالوريوس اللغة العربية' },
    { login: 'teacher4', fullName: 'الأستاذ تركي الحمد', parts: 20, qual: 'دبلوم تحفيظ' },
    { login: 'teacher5', fullName: 'الأستاذ ناصر المالكي', parts: 30, qual: 'ماجستير الدراسات القرآنية' },
    { login: 'teacher6', fullName: 'الأستاذ حسن الأحمدي', parts: 15, qual: 'دبلوم تحفيظ' },
    { login: 'teacher7', fullName: 'الأستاذ عادل الثبيتي', parts: 22, qual: 'بكالوريوس الشريعة' },
  ];

  const teachers = [];
  for (let i = 0; i < teacherSeed.length; i++) {
    const t = teacherSeed[i];
    const teacher = await prisma.teacherProfile.create({
      data: {
        nationalId: `10${String(1000000 + i)}`,
        birthDate: new Date(1985 + (i % 10), i % 12, 10 + (i % 15)),
        address: 'الرياض - حي النزهة',
        qualification: t.qual,
        specialization: 'تحفيظ وتجويد',
        memorizedParts: t.parts,
        employmentType: i % 3 === 0 ? EmploymentType.FULL_TIME : EmploymentType.PART_TIME,
        hireDate: new Date(2019 + (i % 5), i % 12, 1),
        salary: i % 3 === 0 ? 6500 : 3200,
        user: {
          create: {
            username: t.login,
            email: `${t.login}@alnoor-quran.sa`,
            passwordHash,
            fullName: t.fullName,
            role: Role.TEACHER,
            phone: `05551001${String(i).padStart(2, '0')}`,
            jobTitle: 'معلم تحفيظ',
            specialization: 'تحفيظ وتجويد',
                },
        },
      },
      include: { user: true },
    });
    teachers.push(teacher);
  }

  // --- circles -------------------------------------------------------------
  console.log('› الحلقات');
  const circleSeed = [
    { name: 'حلقة الفرقان', level: 'متقدم', days: ['SUNDAY', 'TUESDAY', 'THURSDAY'], start: '16:30', end: '18:00' },
    { name: 'حلقة النور', level: 'متوسط', days: ['SATURDAY', 'MONDAY', 'WEDNESDAY'], start: '16:30', end: '18:00' },
    { name: 'حلقة الهدى', level: 'مبتدئ', days: ['SUNDAY', 'TUESDAY', 'THURSDAY'], start: '17:00', end: '18:30' },
    { name: 'حلقة السكينة', level: 'متوسط', days: ['SATURDAY', 'MONDAY', 'WEDNESDAY'], start: '17:00', end: '18:30' },
    { name: 'حلقة الإتقان', level: 'متقدم', days: ['SUNDAY', 'TUESDAY', 'THURSDAY'], start: '19:30', end: '21:00' },
    { name: 'حلقة البيان', level: 'مبتدئ', days: ['SATURDAY', 'MONDAY', 'WEDNESDAY'], start: '19:30', end: '21:00' },
  ];

  const circles = [];
  for (let i = 0; i < circleSeed.length; i++) {
    const c = circleSeed[i];
    const circle = await prisma.circle.create({
      data: {
        name: c.name,
        code: `C-${String(i + 1).padStart(3, '0')}`,
        description: `حلقة ${c.level} لتحفيظ القرآن الكريم`,
        location: `القاعة ${i + 1}`,
        level: c.level,
        capacity: 20,
        scheduleDays: c.days,
        startTime: c.start,
        endTime: c.end,
        supervisorId: pick(supervisors, i).id,
      },
    });
    circles.push(circle);

    // Primary teacher for every circle, plus an assistant on the first three.
    await prisma.circleTeacher.create({
      data: { circleId: circle.id, teacherId: teachers[i].id, role: CircleTeacherRole.PRIMARY },
    });
    if (i < 3) {
      await prisma.circleTeacher.create({
        data: {
          circleId: circle.id,
          teacherId: teachers[6].id,
          role: CircleTeacherRole.ASSISTANT,
          note: 'معلم مساعد متنقل',
        },
      });
    }
  }

  // --- parents & students --------------------------------------------------
  console.log('› أولياء الأمور والطلاب');
  const evaluations = [
    Evaluation.EXCELLENT,
    Evaluation.VERY_GOOD,
    Evaluation.GOOD,
    Evaluation.ACCEPTABLE,
    Evaluation.UNSATISFACTORY,
  ];

  const parents = [];
  for (let i = 0; i < 12; i++) {
    const parent = await prisma.parentProfile.create({
      data: {
        nationalId: `20${String(2000000 + i)}`,
        phone: `05552002${String(i).padStart(2, '0')}`,
        address: 'الرياض - حي النزهة',
        occupation: pick(['موظف حكومي', 'معلم', 'مهندس', 'تاجر', 'طبيب'], i),
        user: {
          create: {
            username: `parent${i + 1}`,
            email: `parent${i + 1}@alnoor-quran.sa`,
            passwordHash,
            fullName: `${pick(FIRST_NAMES, i + 3)} ${pick(FAMILY_NAMES, i)}`,
            role: Role.PARENT,
            phone: `05552002${String(i).padStart(2, '0')}`,
                },
        },
      },
      include: { user: true },
    });
    parents.push(parent);
  }

  const students = [];
  let studentIndex = 0;
  for (let c = 0; c < circles.length; c++) {
    const count = randInt(9, 13);
    for (let s = 0; s < count; s++) {
      studentIndex++;
      const parent = parents[studentIndex % parents.length];
      const student = await prisma.student.create({
        data: {
          code: `ST-${String(studentIndex).padStart(4, '0')}`,
          fullName: `${pick(FIRST_NAMES, studentIndex)} ${parent.user.fullName.split(' ')[0]} ${pick(
            FAMILY_NAMES,
            studentIndex,
          )}`,
          birthDate: new Date(2010 + (studentIndex % 6), studentIndex % 12, 1 + (studentIndex % 27)),
          nationalId: `30${String(3000000 + studentIndex)}`,
          fatherNationalId: parent.nationalId,
          address: 'الرياض - حي النزهة',
          parentId: parent.id,
          guardianName: parent.user.fullName,
          guardianPhone: parent.phone,
          guardianRelation: 'الأب',
          circleId: circles[c].id,
          enrollmentDate: daysAgo(120 - studentIndex),
          evaluation: pick(evaluations, studentIndex),
          evaluationNote: 'تقييم أولي بناءً على أداء الأسابيع الماضية',
          evaluatedAt: daysAgo(10),
          memorizedParts: randInt(0, 3),
          currentSurah: pick(['النبأ', 'عبس', 'الملك', 'الأعلى', 'البلد'], studentIndex),
        },
      });
      students.push(student);

      await prisma.circleMembership.create({
        data: { studentId: student.id, circleId: circles[c].id, startedAt: student.enrollmentDate, reason: 'تسجيل جديد' },
      });
      await prisma.studentEvaluation.create({
        data: {
          studentId: student.id,
          evaluation: student.evaluation!,
          note: 'تقييم أولي',
          authorId: teachers[c].userId,
          createdAt: daysAgo(10),
        },
      });
    }
  }
  console.log(`  ${students.length} طالب في ${circles.length} حلقات`);

  // --- attendance ----------------------------------------------------------
  console.log('› سجلات الحضور (آخر 21 يوماً)');
  const attendanceRows: any[] = [];
  for (let d = 21; d >= 1; d--) {
    const date = daysAgo(d);
    // Friday is a day off.
    if (date.getUTCDay() === 5) continue;
    for (const student of students) {
      const status = attendanceStatus();
      attendanceRows.push({
        studentId: student.id,
        circleId: student.circleId!,
        date,
        status,
        note: status === AttendanceStatus.EXCUSED ? 'عذر من ولي الأمر' : null,
        recordedById: admin.id,
      });
    }
  }
  // Chunked to stay well inside parameter limits.
  for (let i = 0; i < attendanceRows.length; i += 1000) {
    await prisma.attendance.createMany({ data: attendanceRows.slice(i, i + 1000) });
  }
  console.log(`  ${attendanceRows.length} سجل حضور`);

  // --- recitations ---------------------------------------------------------
  console.log('› سجلات التسميع');
  const teacherByCircle = new Map(circles.map((c, i) => [c.id, teachers[i].id]));
  const recitationRows: any[] = [];
  for (let d = 20; d >= 1; d -= 2) {
    const date = daysAgo(d);
    if (date.getUTCDay() === 5) continue;
    for (const student of students) {
      if (Math.random() > 0.65) continue;
      const range = pick(SURAH_RANGES, randInt(0, SURAH_RANGES.length - 1));
      // Daily recitation carries an evaluation only — no numeric mark. The
      // points below are the separate scoring system: one per ayah, minus one
      // per mistake and a quarter per warning.
      const grade = randInt(60, 100);
      const verses = countVerses(range.from, range.fromAyah, range.to, range.toAyah);
      const mistakes = grade >= 95 ? 0 : randInt(0, 4);
      const warnings = grade >= 95 ? randInt(0, 1) : randInt(0, 6);
      const points = Math.max(0, Math.round((verses - mistakes - warnings * 0.25) * 100) / 100);
      recitationRows.push({
        studentId: student.id,
        circleId: student.circleId!,
        teacherId: teacherByCircle.get(student.circleId!)!,
        date,
        type: Math.random() > 0.35 ? RecitationType.MEMORIZATION : RecitationType.MINOR_REVIEW,
        fromSurah: range.from,
        fromAyah: range.fromAyah,
        toSurah: range.to,
        toAyah: range.toAyah,
        pagesCount: range.pages,
        versesCount: verses,
        mistakes,
        warnings,
        points,
        evaluation:
          grade >= 95
            ? Evaluation.EXCELLENT
            : grade >= 85
              ? Evaluation.VERY_GOOD
              : grade >= 75
                ? Evaluation.GOOD
                : Evaluation.ACCEPTABLE,
        notes: grade >= 95 ? 'أداء ممتاز وإتقان جيد' : null,
      });
    }
  }
  for (let i = 0; i < recitationRows.length; i += 1000) {
    await prisma.recitation.createMany({ data: recitationRows.slice(i, i + 1000) });
  }
  console.log(`  ${recitationRows.length} سجل تسميع`);

  // --- points balances -----------------------------------------------------
  // `students.totalPoints` is a cache of the recitation + surah sums, so it is
  // filled from the rows just inserted rather than guessed at.
  console.log('› أرصدة النقاط');
  const pointsByStudent = new Map<string, number>();
  for (const row of recitationRows) {
    pointsByStudent.set(row.studentId, (pointsByStudent.get(row.studentId) ?? 0) + row.points);
  }

  // A handful of finished surahs, worth a bonus each.
  const COMPLETED_SURAHS = ['الفاتحة', 'الناس', 'الفلق', 'الإخلاص', 'المسد', 'النصر', 'الكافرون'];
  const surahRows: any[] = [];
  for (const student of students) {
    const howMany = randInt(0, 5);
    for (let i = 0; i < howMany; i++) {
      const surah = COMPLETED_SURAHS[i];
      surahRows.push({
        studentId: student.id,
        surah,
        points: 10,
        completedAt: daysAgo(randInt(5, 60)),
        recordedById: admin.id,
      });
      pointsByStudent.set(student.id, (pointsByStudent.get(student.id) ?? 0) + 10);
    }
  }
  if (surahRows.length) await prisma.surahCompletion.createMany({ data: surahRows });

  for (const [studentId, total] of pointsByStudent) {
    await prisma.student.update({
      where: { id: studentId },
      data: { totalPoints: Math.round(total * 100) / 100 },
    });
  }
  console.log(`  ${surahRows.length} سورة مكتملة، ${pointsByStudent.size} رصيد نقاط`);

  // --- exams ---------------------------------------------------------------
  console.log('› الاختبارات وطلباتها');
  // Two ahzab to hang the sample exams on. Nothing about the programme makes
  // these first -- a circle may sit them in any order at all.
  const hizb1 = sections[0]; // الحزب 1
  const hizb2 = sections[1]; // الحزب 2

  // A third of the students have already passed the first hizb.
  const passedStudents = students.filter((_, i) => i % 3 === 0);
  for (const student of passedStudents) {
    const request = await prisma.examRequest.create({
      data: {
        studentId: student.id,
        sectionId: hizb1.id,
        teacherId: teacherByCircle.get(student.circleId!)!,
        status: ExamRequestStatus.COMPLETED,
        reviewedById: committee[0].id,
        reviewedAt: daysAgo(30),
        createdAt: daysAgo(35),
        sections: { create: [{ sectionId: hizb1.id }] },
      },
    });
    const score = randInt(65, 100);
    await prisma.exam.create({
      data: {
        requestId: request.id,
        studentId: student.id,
        sectionId: hizb1.id,
        examinerId: pick(committee, 0).id,
        scheduledAt: daysAgo(25),
        location: 'قاعة الاختبارات',
        status: ExamStatus.COMPLETED,
        score,
        evaluation: evaluationFromScore(score),
        // Optional on purpose: half of the demo results skip the mistake count.
        mistakes: score >= 90 ? null : randInt(1, 8),
        result: ExamResult.PASSED,
        gradedById: committee[0].id,
        gradedAt: daysAgo(25),
        notes: 'اجتاز الاختبار بنجاح',
        sections: { create: [{ sectionId: hizb1.id }] },
      },
    });
    await prisma.student.update({
      where: { id: student.id },
      data: { memorizedParts: 1 },
    });
  }

  // A few failed attempts, so the "failed" path is represented too.
  for (const student of students.filter((_, i) => i % 11 === 5)) {
    const request = await prisma.examRequest.create({
      data: {
        studentId: student.id,
        sectionId: hizb1.id,
        teacherId: teacherByCircle.get(student.circleId!)!,
        status: ExamRequestStatus.COMPLETED,
        reviewedById: committee[1].id,
        reviewedAt: daysAgo(20),
        createdAt: daysAgo(24),
        sections: { create: [{ sectionId: hizb1.id }] },
      },
    });
    const failScore = randInt(35, 58);
    await prisma.exam.create({
      data: {
        requestId: request.id,
        studentId: student.id,
        sectionId: hizb1.id,
        examinerId: committee[1].id,
        scheduledAt: daysAgo(18),
        location: 'قاعة الاختبارات',
        status: ExamStatus.COMPLETED,
        score: failScore,
        evaluation: evaluationFromScore(failScore),
        mistakes: randInt(9, 20),
        result: ExamResult.FAILED,
        gradedById: committee[1].id,
        gradedAt: daysAgo(18),
        notes: 'يحتاج إلى مزيد من المراجعة قبل إعادة الاختبار',
        sections: { create: [{ sectionId: hizb1.id }] },
      },
    });
  }

  // Waiting list: students who passed the first hizb now request the second.
  for (const student of passedStudents.slice(0, 6)) {
    await prisma.examRequest.create({
      data: {
        studentId: student.id,
        sectionId: hizb2.id,
        teacherId: teacherByCircle.get(student.circleId!)!,
        status: ExamRequestStatus.PENDING,
        note: 'الطالب جاهز للاختبار بإذن الله',
        createdAt: daysAgo(randInt(1, 6)),
        sections: { create: [{ sectionId: hizb2.id }] },
      },
    });
  }

  // Scheduled upcoming exams.
  for (let i = 0; i < 5; i++) {
    const student = passedStudents[6 + i];
    if (!student) break;
    const request = await prisma.examRequest.create({
      data: {
        studentId: student.id,
        sectionId: hizb2.id,
        teacherId: teacherByCircle.get(student.circleId!)!,
        status: ExamRequestStatus.SCHEDULED,
        reviewedById: committee[0].id,
        reviewedAt: daysAgo(3),
        createdAt: daysAgo(7),
        sections: { create: [{ sectionId: hizb2.id }] },
      },
    });
    await prisma.exam.create({
      data: {
        requestId: request.id,
        studentId: student.id,
        sectionId: hizb2.id,
        examinerId: pick(committee, i).id,
        scheduledAt: daysAhead(3 + i * 2),
        location: 'قاعة الاختبارات',
        status: ExamStatus.SCHEDULED,
        sections: { create: [{ sectionId: hizb2.id }] },
      },
    });
  }

  // --- transfers -----------------------------------------------------------
  console.log('› طلبات النقل والتبادل');
  await prisma.transferRequest.create({
    data: {
      kind: TransferKind.STUDENT_TRANSFER,
      studentId: students[2].id,
      fromCircleId: students[2].circleId,
      toCircleId: circles[3].id,
      reason: 'رغبة ولي الأمر بتغيير موعد الحلقة لظروف الدراسة',
      requestedById: teachers[0].userId,
      createdAt: daysAgo(2),
    },
  });
  await prisma.transferRequest.create({
    data: {
      kind: TransferKind.TEACHER_TRANSFER,
      teacherAId: teachers[5].id,
      fromCircleId: circles[5].id,
      toCircleId: circles[4].id,
      reason: 'قرب مكان السكن ومناسبة التوقيت',
      requestedById: teachers[5].userId,
      createdAt: daysAgo(1),
    },
  });
  await prisma.transferRequest.create({
    data: {
      kind: TransferKind.STUDENT_TRANSFER,
      studentId: students[8].id,
      fromCircleId: students[8].circleId,
      toCircleId: circles[1].id,
      reason: 'مستوى الطالب يتناسب مع الحلقة المتوسطة',
      requestedById: teachers[0].userId,
      status: RequestStatus.APPROVED,
      decidedById: admin.id,
      decidedAt: daysAgo(9),
      decisionNote: 'تمت الموافقة',
      effectiveAt: daysAgo(9),
      createdAt: daysAgo(12),
    },
  });

  // --- suspensions ---------------------------------------------------------
  console.log('› طلبات الإيقاف');
  await prisma.suspensionRequest.create({
    data: {
      studentId: students[5].id,
      reason: 'غياب متكرر دون عذر خلال الأسابيع الماضية',
      durationDays: 14,
      startDate: daysAgo(0),
      endDate: dateOnly(daysAhead(14)),
      requestedById: teachers[0].userId,
      createdAt: daysAgo(1),
    },
  });

  const suspendedStudent = students[15];
  await prisma.suspensionRequest.create({
    data: {
      studentId: suspendedStudent.id,
      reason: 'عدم الالتزام بالواجبات وتكرار عدم التحضير',
      durationDays: 21,
      startDate: daysAgo(5),
      endDate: dateOnly(daysAhead(16)),
      status: RequestStatus.APPROVED,
      requestedById: teachers[1].userId,
      decidedById: admin.id,
      decidedAt: daysAgo(5),
      decisionNote: 'تمت الموافقة مع إشعار ولي الأمر',
      createdAt: daysAgo(6),
    },
  });
  await prisma.student.update({
    where: { id: suspendedStudent.id },
    data: { status: StudentStatus.SUSPENDED },
  });

  // --- support tickets -----------------------------------------------------
  console.log('› طلبات الدعم الفني');
  const ticket1 = await prisma.supportTicket.create({
    data: {
      subject: 'لا أستطيع تسجيل الحضور',
      description: 'عند محاولة حفظ كشف الحضور تظهر رسالة خطأ، أرجو المساعدة.',
      category: 'مشكلة تقنية',
      priority: TicketPriority.HIGH,
      createdById: teachers[2].userId,
      status: TicketStatus.IN_PROGRESS,
      assignedToId: support.id,
      createdAt: daysAgo(3),
    },
  });
  await prisma.ticketMessage.createMany({
    data: [
      {
        ticketId: ticket1.id,
        senderId: teachers[2].userId,
        body: 'عند محاولة حفظ كشف الحضور تظهر رسالة خطأ، أرجو المساعدة.',
        createdAt: daysAgo(3),
      },
      {
        ticketId: ticket1.id,
        senderId: support.id,
        body: 'وعليكم السلام، تم استلام طلبك ونعمل على المشكلة، يرجى تجربة تحديث الصفحة.',
        createdAt: daysAgo(2),
      },
    ],
  });

  const ticket2 = await prisma.supportTicket.create({
    data: {
      subject: 'طلب تعديل بيانات ابني',
      description: 'أرجو تحديث رقم الجوال المسجل لدى الحلقة.',
      category: 'استفسار',
      priority: TicketPriority.NORMAL,
      createdById: parents[0].userId,
      createdAt: daysAgo(1),
    },
  });
  await prisma.ticketMessage.create({
    data: {
      ticketId: ticket2.id,
      senderId: parents[0].userId,
      body: 'أرجو تحديث رقم الجوال المسجل لدى الحلقة.',
      createdAt: daysAgo(1),
    },
  });

  // --- chat ----------------------------------------------------------------
  console.log('› المحادثات');
  const groupConversation = await prisma.conversation.create({
    data: {
      type: ConversationType.GROUP,
      title: 'مجموعة معلمي المدرسة',
      description: 'التنسيق العام بين معلمي الحلقات',
      createdById: admin.id,
      lastMessageAt: daysAgo(0),
      members: {
        create: [
          { userId: admin.id, isAdmin: true },
          ...teachers.map((t) => ({ userId: t.userId })),
          ...supervisors.map((s) => ({ userId: s.id })),
        ],
      },
    },
  });
  await prisma.message.createMany({
    data: [
      {
        conversationId: groupConversation.id,
        senderId: admin.id,
        body: 'السلام عليكم ورحمة الله، تذكير باجتماع المعلمين يوم الأحد بعد صلاة المغرب.',
        createdAt: daysAgo(1),
      },
      {
        conversationId: groupConversation.id,
        senderId: teachers[0].userId,
        body: 'وعليكم السلام، بإذن الله سنحضر.',
        createdAt: daysAgo(1),
      },
      {
        conversationId: groupConversation.id,
        senderId: teachers[1].userId,
        body: 'جزاكم الله خيراً، هل سيتم مناقشة جدول الاختبارات؟',
        createdAt: new Date(),
      },
    ],
  });

  const directConversation = await prisma.conversation.create({
    data: {
      type: ConversationType.DIRECT,
      createdById: parents[0].userId,
      lastMessageAt: daysAgo(0),
      members: {
        create: [{ userId: parents[0].userId }, { userId: teachers[0].userId }],
      },
    },
  });
  await prisma.message.createMany({
    data: [
      {
        conversationId: directConversation.id,
        senderId: parents[0].userId,
        body: 'السلام عليكم أستاذ، كيف مستوى ابني في الحلقة؟',
        createdAt: daysAgo(1),
      },
      {
        conversationId: directConversation.id,
        senderId: teachers[0].userId,
        body: 'وعليكم السلام ورحمة الله، ما شاء الله مستواه جيد ويحتاج مراجعة أكثر للأجزاء السابقة.',
        createdAt: new Date(),
      },
    ],
  });

  // --- notifications -------------------------------------------------------
  console.log('› الإشعارات');
  await prisma.notification.createMany({
    data: [
      {
        userId: admin.id,
        type: NotificationType.TRANSFER_REQUEST,
        title: 'طلب نقل طالب جديد',
        body: 'يوجد طلب نقل بانتظار المراجعة',
        link: '/transfers',
      },
      {
        userId: admin.id,
        type: NotificationType.SUSPENSION_REQUEST,
        title: 'طلب إيقاف طالب',
        body: 'يوجد طلب إيقاف بانتظار القرار',
        link: '/suspensions',
      },
      {
        userId: committee[0].id,
        type: NotificationType.EXAM_REQUEST,
        title: 'طلبات اختبار جديدة',
        body: '6 طلبات في قائمة الانتظار',
        link: '/exams/requests',
      },
      {
        userId: teachers[0].userId,
        type: NotificationType.ANNOUNCEMENT,
        title: 'اجتماع المعلمين',
        body: 'اجتماع المعلمين يوم الأحد بعد صلاة المغرب',
        link: '/chat',
      },
      {
        userId: parents[0].userId,
        type: NotificationType.EXAM_SCHEDULED,
        title: 'موعد اختبار قادم',
        body: 'تم تحديد موعد اختبار لابنكم',
        link: '/parent/children',
      },
      {
        userId: support.id,
        type: NotificationType.SUPPORT_TICKET,
        title: 'طلب دعم فني جديد',
        body: 'طلب جديد بانتظار المعالجة',
        link: '/support',
      },
    ],
  });

  // --- courses -------------------------------------------------------------
  console.log('› الدورات التعليمية');
  const courseSeed = [
    {
      name: 'دورة أحكام التجويد للمبتدئين',
      code: 'TJW-0001',
      type: CourseType.TAJWEED,
      instructor: teachers[0].userId,
      days: ['SUNDAY', 'TUESDAY'],
      start: '17:00',
      end: '18:30',
      startedAgo: 20,
      endsIn: 40,
    },
    {
      name: 'دورة التجويد المتقدمة',
      code: 'TJW-0002',
      type: CourseType.TAJWEED,
      instructor: teachers[4].userId,
      days: ['MONDAY', 'WEDNESDAY'],
      start: '18:00',
      end: '19:30',
      startedAgo: 10,
      endsIn: 50,
    },
    {
      name: 'دورة الفقه الميسر',
      code: 'SHR-0001',
      type: CourseType.SHARIA,
      instructor: supervisors[0].id,
      days: ['SATURDAY'],
      start: '19:00',
      end: '20:30',
      startedAgo: 15,
      endsIn: 45,
    },
    {
      name: 'دورة السيرة النبوية',
      code: 'SHR-0002',
      type: CourseType.SHARIA,
      instructor: committee[0].id,
      days: ['THURSDAY'],
      start: '16:30',
      end: '18:00',
      startedAgo: 5,
      endsIn: 60,
    },
  ];

  const courses = [];
  for (const c of courseSeed) {
    const course = await prisma.course.create({
      data: {
        name: c.name,
        code: c.code,
        type: c.type,
        description: `${c.name} — دورة تعليمية مستقلة عن حلقات التحفيظ`,
        instructorId: c.instructor,
        location: 'قاعة الدروس',
        startDate: daysAgo(c.startedAgo),
        endDate: daysAhead(c.endsIn),
        scheduleDays: c.days,
        startTime: c.start,
        endTime: c.end,
        capacity: 25,
      },
    });
    courses.push(course);
  }

  // Enrolments deliberately overlap: some circle students also attend a course,
  // and a few students attend courses only. That overlap is exactly what the
  // unified student profile exists to show in one place.
  const courseEnrollments: any[] = [];
  students.forEach((student, i) => {
    if (i % 4 !== 0) return;
    courseEnrollments.push({ courseId: courses[i % courses.length].id, studentId: student.id });
  });

  for (let i = 0; i < 6; i++) {
    const student = await prisma.student.create({
      data: {
        code: `ST-${String(9000 + i)}`,
        fullName: `${pick(FIRST_NAMES, i + 3)} ${pick(FAMILY_NAMES, i + 5)}`,
        birthDate: new Date(2011 + (i % 4), i % 12, 5 + (i % 20)),
        nationalId: `20${String(2000000 + i)}`,
        // No circle at all: these students are on the courses track only.
        circleId: null,
        guardianName: `والد ${pick(FIRST_NAMES, i + 3)}`,
        guardianPhone: `05553000${String(i).padStart(2, '0')}`,
        guardianRelation: 'الأب',
        notes: 'مسجّل في الدورات التعليمية فقط',
      },
    });
    courseEnrollments.push({ courseId: courses[i % courses.length].id, studentId: student.id });
  }

  await prisma.courseEnrollment.createMany({ data: courseEnrollments });

  // Course attendance is its own register and never mixes with the circles'.
  const courseAttendanceRows: any[] = [];
  for (const course of courses) {
    const enrolled = courseEnrollments.filter((e) => e.courseId === course.id);
    for (let d = 14; d >= 1; d -= 7) {
      const date = daysAgo(d);
      for (const e of enrolled) {
        const status = attendanceStatus();
        courseAttendanceRows.push({
          courseId: course.id,
          studentId: e.studentId,
          date,
          status,
          note: status === AttendanceStatus.EXCUSED ? 'عذر من ولي الأمر' : null,
          recordedById: admin.id,
        });
      }
    }
  }
  if (courseAttendanceRows.length) {
    await prisma.courseAttendance.createMany({ data: courseAttendanceRows });
  }
  console.log(
    `  ${courses.length} دورة، ${courseEnrollments.length} تسجيل، ${courseAttendanceRows.length} سجل حضور`,
  );

  // --- activity programme --------------------------------------------------
  // Two students moved out of their circle but kept on the books.
  console.log('› برنامج النشاط');
  const activityStudents = students.filter((_, i) => i % 17 === 3).slice(0, 2);
  for (const student of activityStudents) {
    await prisma.suspensionRequest.create({
      data: {
        studentId: student.id,
        reason: 'الطالب لا يقرأ بعد ويحتاج تهيئة قبل الالتحاق بحلقة التحفيظ',
        status: RequestStatus.APPROVED,
        action: SuspensionAction.ACTIVITY_PROGRAM,
        requestedById: teachers[0].userId,
        decidedById: admin.id,
        decidedAt: daysAgo(9),
        decisionNote: 'يُحوَّل إلى برنامج النشاط لحين جاهزيته',
      },
    });
    await prisma.circleMembership.updateMany({
      where: { studentId: student.id, endedAt: null },
      data: { endedAt: daysAgo(9), reason: 'التحويل إلى برنامج النشاط' },
    });
    await prisma.student.update({
      where: { id: student.id },
      data: { status: StudentStatus.ACTIVITY, circleId: null },
    });
  }
  console.log(`  ${activityStudents.length} طالب في برنامج النشاط`);

  // --- staff attendance ----------------------------------------------------
  console.log('› حضور الكادر');
  const staffIds = [
    admin.id,
    ...supervisors.map((u) => u.id),
    ...committee.map((u) => u.id),
    support.id,
    ...teachers.map((t) => t.userId),
  ];
  const staffAttendanceRows: any[] = [];
  for (let d = 10; d >= 1; d--) {
    const date = daysAgo(d);
    if (date.getUTCDay() === 5) continue;
    for (const userId of staffIds) {
      const status = attendanceStatus();
      staffAttendanceRows.push({
        userId,
        date,
        status,
        note: status === AttendanceStatus.EXCUSED ? 'إجازة مصرّح بها' : null,
        recordedById: admin.id,
      });
    }
  }
  await prisma.staffAttendance.createMany({ data: staffAttendanceRows });
  console.log(`  ${staffAttendanceRows.length} سجل حضور للكادر`);

  // --- preparation assignments ---------------------------------------------
  console.log('› تكاليف التحضير');
  const preparationRows: any[] = [];
  students
    .filter((student, i) => i % 5 === 0 && student.circleId)
    .forEach((student, i) => {
      const range = pick(SURAH_RANGES, i);
      preparationRows.push({
        studentId: student.id,
        teacherId: teacherByCircle.get(student.circleId!)!,
        fromSurah: range.from,
        fromAyah: range.fromAyah,
        toSurah: range.to,
        toAyah: range.toAyah,
        note: 'يُرجى التحضير الجيد قبل الحصة القادمة',
        dueDate: daysAhead(randInt(1, 5)),
        completedAt: i % 3 === 0 ? daysAgo(1) : null,
      });
    });
  if (preparationRows.length) {
    await prisma.preparationAssignment.createMany({ data: preparationRows });
  }
  console.log(`  ${preparationRows.length} تكليف تحضير`);

  // --- announcements -------------------------------------------------------
  console.log('› الإعلانات');
  await prisma.announcement.createMany({
    data: [
      {
        title: 'افتتاح دورة أحكام التجويد للمبتدئين',
        body: 'يسر إدارة المدرسة الإعلان عن افتتاح دورة أحكام التجويد للمبتدئين، والتسجيل متاح الآن.',
        link: '/courses',
        audience: [],
        createdById: admin.id,
        publishedAt: daysAgo(3),
        expiresAt: daysAhead(30),
      },
      {
        title: 'افتتاح حلقة تحفيظ جديدة',
        body: 'تم افتتاح حلقة جديدة للمرحلة المتوسطة، ويمكن تسجيل الطلاب من صفحة الحلقات.',
        link: '/circles',
        audience: [Role.ADMIN, Role.SUPERVISOR, Role.TEACHER],
        createdById: admin.id,
        publishedAt: daysAgo(6),
      },
      {
        title: 'اجتماع أولياء الأمور',
        body: 'اجتماع أولياء الأمور يوم الخميس القادم بعد صلاة المغرب في مصلى الجامع.',
        link: '/parent/children',
        audience: [Role.PARENT],
        createdById: admin.id,
        publishedAt: daysAgo(1),
        expiresAt: daysAhead(10),
      },
    ],
  });

  // --- activity log --------------------------------------------------------
  await prisma.activityLog.createMany({
    data: [
      { userId: admin.id, action: 'SYSTEM_SEED', summary: 'تهيئة النظام بالبيانات التجريبية' },
      { userId: admin.id, action: 'CIRCLE_CREATE', summary: 'إنشاء 6 حلقات تحفيظ', entityType: 'Circle' },
      { userId: admin.id, action: 'TEACHER_CREATE', summary: 'إضافة 7 معلمين', entityType: 'Teacher' },
      { userId: admin.id, action: 'STUDENT_CREATE', summary: `تسجيل ${students.length} طالباً`, entityType: 'Student' },
    ],
  });

  // --- summary -------------------------------------------------------------
  console.log('\n=== تمت التهيئة بنجاح ===\n');
  // Login is by username now; the e-mail is optional contact information.
  console.table([
    { الدور: 'مدير عام', 'اسم المستخدم': 'admin', 'كلمة المرور': PASSWORD },
    { الدور: 'مشرف', 'اسم المستخدم': 'supervisor1', 'كلمة المرور': PASSWORD },
    { الدور: 'معلم', 'اسم المستخدم': 'teacher1', 'كلمة المرور': PASSWORD },
    { الدور: 'لجنة اختبارات', 'اسم المستخدم': 'committee1', 'كلمة المرور': PASSWORD },
    { الدور: 'ولي أمر', 'اسم المستخدم': 'parent1', 'كلمة المرور': PASSWORD },
    { الدور: 'دعم فني', 'اسم المستخدم': 'support', 'كلمة المرور': PASSWORD },
  ]);
}

main()
  .catch((e) => {
    console.error('فشل في تهيئة البيانات:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
