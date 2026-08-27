from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, pattern, replacement, flags=re.S):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    new, n = re.subn(pattern, replacement, text, count=1, flags=flags)
    if n != 1:
        raise SystemExit(f'Could not patch {path}: pattern matched {n} times')
    p.write_text(new, encoding='utf-8')

# 1) Prisma schema: keep the existing section anchor for compatibility, while
# storing the teacher's three manual request values explicitly.
replace_once(
    'backend/prisma/schema.prisma',
    r'(model ExamRequest \{\n.*?\n  note\s+String\?\n)',
    r'''\1  requestedHizb     Int?\n  requestedJuz      Int?\n  requestedCombined Int?\n'''
)

# 2) DTO: sectionIds remains accepted for old clients, but the new request form
# sends the three optional manual values instead.
replace_once(
    'backend/src/exams/dto/exam.dto.ts',
    r'export class CreateExamRequestDto \{.*?\n\}',
    '''export class CreateExamRequestDto {\n  @ApiProperty()\n  @IsUUID('4', { message: 'معرّف الطالب غير صالح' })\n  studentId: string;\n\n  @ApiPropertyOptional({ type: [String], description: 'للتوافق مع الطلبات القديمة' })\n  @IsOptional()\n  @IsArray()\n  @ArrayMaxSize(30)\n  @IsUUID('4', { each: true, message: 'أحد معرّفات المقررات غير صالح' })\n  sectionIds?: string[];\n\n  @ApiPropertyOptional({ description: 'رقم الحزب المطلوب، اختياري' })\n  @IsOptional()\n  @Type(() => Number)\n  @IsInt({ message: 'رقم الحزب غير صالح' })\n  @Min(1)\n  @Max(60)\n  requestedHizb?: number;\n\n  @ApiPropertyOptional({ description: 'رقم الجزء المطلوب، اختياري' })\n  @IsOptional()\n  @Type(() => Number)\n  @IsInt({ message: 'رقم الجزء غير صالح' })\n  @Min(1)\n  @Max(30)\n  requestedJuz?: number;\n\n  @ApiPropertyOptional({ description: 'رقم المجتمعة، اختياري' })\n  @IsOptional()\n  @Type(() => Number)\n  @IsInt({ message: 'رقم المجتمعة غير صالح' })\n  @Min(1)\n  @Max(60)\n  requestedCombined?: number;\n\n  @ApiPropertyOptional()\n  @IsOptional()\n  @IsString()\n  @MaxLength(1000)\n  note?: string;\n}'''
)

# 3) Backend request creation: accept either the legacy sectionIds payload or
# the new manual fields. At least one manual field must be supplied for a new
# style request. The first matching hizb is retained as the legacy anchor so
# existing scheduling/result code continues to work without rewriting history.
replace_once(
    'backend/src/exams/exams.service.ts',
    r'  async requestExam\(actor: AuthUser, dto: CreateExamRequestDto\) \{.*?\n  \}\n\n  // ={10,}\n  // التسميات',
    '''  async requestExam(actor: AuthUser, dto: CreateExamRequestDto) {\n    const student = await this.acl.assertStudentWriteAccess(actor, dto.studentId);\n    this.validateStudentStatus(student);\n\n    const hasManual = [dto.requestedHizb, dto.requestedJuz, dto.requestedCombined].some(\n      (value) => value != null,\n    );\n\n    let sections: any[];\n    let label: string;\n\n    if (hasManual) {\n      const activeSections = await this.prisma.examSection.findMany({\n        where: { isActive: true, kind: 'HIZB' },\n        orderBy: { order: 'asc' },\n      });\n\n      if (!activeSections.length) {\n        throw new BadRequestException('لا توجد أحزاب اختبار مفعلة حالياً');\n      }\n\n      const anchorOrder = dto.requestedHizb\n        ?? (dto.requestedJuz ? (dto.requestedJuz - 1) * 2 + 1 : activeSections[0].order);\n      const primary = activeSections.find((section) => section.order === anchorOrder) ?? activeSections[0];\n      sections = [primary];\n\n      const parts: string[] = [];\n      if (dto.requestedHizb != null) parts.push(`حزب ${dto.requestedHizb}`);\n      if (dto.requestedJuz != null) parts.push(`جزء ${dto.requestedJuz}`);\n      if (dto.requestedCombined != null) parts.push(`مجتمعة ${dto.requestedCombined}`);\n      label = parts.join(' + ');\n    } else {\n      const sectionIds = [...new Set(dto.sectionIds ?? [])];\n      if (sectionIds.length === 0) {\n        throw new BadRequestException('يجب تحديد حزب أو جزء أو مجتمعة واحد على الأقل');\n      }\n      sections = await this.fetchActiveSections(sectionIds);\n      await this.validateAllSectionsEligibility(dto.studentId, sections);\n      label = this.sectionsLabel(sections);\n    }\n\n    const primary = sections[0];\n    const teacherId = await this.resolveTeacherId(actor, student.circleId);\n\n    const request = await this.prisma.examRequest.create({\n      data: {\n        studentId: dto.studentId,\n        sectionId: primary.id,\n        teacherId,\n        note: dto.note,\n        requestedHizb: dto.requestedHizb,\n        requestedJuz: dto.requestedJuz,\n        requestedCombined: dto.requestedCombined,\n        sections: {\n          create: hasManual ? [] : sections.map((section) => ({ sectionId: section.id })),\n        },\n      },\n      include: REQUEST_INCLUDE,\n    });\n\n    await this.notifications.notifyRoles([Role.EXAM_COMMITTEE, Role.ADMIN], {\n      type: NotificationType.EXAM_REQUEST,\n      title: 'طلب اختبار جديد',\n      body: `طلب اختبار الطالب ${student.fullName} في ${label}`,\n      link: `/exams/requests/${request.id}`,\n    });\n\n    await this.activity.log({\n      userId: actor.id,\n      action: 'EXAM_REQUEST',\n      summary: `طلب اختبار الطالب ${student.fullName} في ${label}`,\n      entityType: 'ExamRequest',\n      entityId: request.id,\n    });\n\n    return request;\n  }\n\n  // ==========================================================================\n  // التسميات'''
)

# Make requestLabel prefer the manual values when present.
replace_once(
    'backend/src/exams/exams.service.ts',
    r'  private requestLabel\(request: \{.*?\n  \}\n',
    '''  private requestLabel(request: any) {\n    const manual: string[] = [];\n    if (request.requestedHizb != null) manual.push(`حزب ${request.requestedHizb}`);\n    if (request.requestedJuz != null) manual.push(`جزء ${request.requestedJuz}`);\n    if (request.requestedCombined != null) manual.push(`مجتمعة ${request.requestedCombined}`);\n    if (manual.length) return manual.join(' + ');\n\n    const all = request.sections?.length\n      ? request.sections.map((x: any) => x.section)\n      : [request.section];\n    return describeSections(all);\n  }\n'''
)

# 4) Frontend: replace the old progression/section picker with three optional
# numeric inputs and an optional note.
replace_once(
    'frontend/src/pages/students/StudentDetailsPage.tsx',
    r'function ExamRequestModal\(\{ student, onClose \}: \{ student: Student; onClose: \(\) => void \}\) \{.*?\n\}\n\nfunction EditStudentModal',
    '''function ExamRequestModal({ student, onClose }: { student: Student; onClose: () => void }) {\n  const queryClient = useQueryClient();\n  const [hizb, setHizb] = useState('');\n  const [juz, setJuz] = useState('');\n  const [combined, setCombined] = useState('');\n  const [note, setNote] = useState('');\n\n  const mutation = useMutation({\n    mutationFn: () =>\n      api.post('/exams/requests', {\n        studentId: student.id,\n        requestedHizb: hizb ? Number(hizb) : undefined,\n        requestedJuz: juz ? Number(juz) : undefined,\n        requestedCombined: combined ? Number(combined) : undefined,\n        note: note.trim() || undefined,\n      }),\n    onSuccess: () => {\n      toast.success('تم إرسال طلب الاختبار إلى لجنة الاختبارات');\n      queryClient.invalidateQueries({ queryKey: ['exams'] });\n      onClose();\n    },\n    onError: (error) => toast.error(apiError(error)),\n  });\n\n  const hasValue = Boolean(hizb || juz || combined);\n\n  return (\n    <Modal\n      open\n      onClose={onClose}\n      title="طلب اختبار"\n      size="sm"\n      footer={\n        <>\n          <Button variant="secondary" onClick={onClose}>\n            إلغاء\n          </Button>\n          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!hasValue}>\n            تقديم طلب\n          </Button>\n        </>\n      }\n    >\n      <div className="space-y-3">\n        <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">\n          اختر ما تريد طلب اختباره. يمكنك تعبئة خانة واحدة فقط أو أكثر من خانة، ولا يلزم تعبئة الجميع.\n        </p>\n\n        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">\n          <Input\n            label="حزب"\n            type="number"\n            min={1}\n            max={60}\n            value={hizb}\n            onChange={(e) => setHizb(e.target.value)}\n            placeholder="رقم الحزب"\n          />\n          <Input\n            label="جزء"\n            type="number"\n            min={1}\n            max={30}\n            value={juz}\n            onChange={(e) => setJuz(e.target.value)}\n            placeholder="رقم الجزء"\n          />\n          <Input\n            label="مجتمعة"\n            type="number"\n            min={1}\n            max={60}\n            value={combined}\n            onChange={(e) => setCombined(e.target.value)}\n            placeholder="الرقم"\n          />\n        </div>\n\n        <Textarea\n          label="ملاحظة (اختياري)"\n          rows={4}\n          value={note}\n          onChange={(e) => setNote(e.target.value)}\n          placeholder="أي ملاحظة تريد إرسالها للجنة الاختبارات"\n        />\n      </div>\n    </Modal>\n  );\n}\n\nfunction EditStudentModal'''
)

# 5) Frontend types.
replace_once(
    'frontend/src/types/index.ts',
    r'(export interface ExamRequest \{\n  id: string;\n  status: ExamRequestStatus;\n)',
    r'''\1  requestedHizb?: number | null;\n  requestedJuz?: number | null;\n  requestedCombined?: number | null;\n'''
)

# 6) Requests list: show the three manual values instead of the old section badges.
replace_once(
    'frontend/src/pages/exams/ExamsPage.tsx',
    r'<SectionBadges primary=\{req\.section\} sections=\{req\.sections\} />',
    r'<ManualRequestSummary request={req} />'
)

# Insert the small request summary component before ScheduleModal.
replace_once(
    'frontend/src/pages/exams/ExamsPage.tsx',
    r'(\nfunction ScheduleModal\(\{ request, onClose \}: \{ request: ExamRequest; onClose: \(\) => void \}\) \{)',
    '''\nfunction ManualRequestSummary({ request }: { request: ExamRequest }) {\n  const items = [\n    request.requestedHizb != null ? `حزب: ${request.requestedHizb}` : null,\n    request.requestedJuz != null ? `جزء: ${request.requestedJuz}` : null,\n    request.requestedCombined != null ? `مجتمعة: ${request.requestedCombined}` : null,\n  ].filter(Boolean);\n\n  if (!items.length) {\n    return <SectionBadges primary={request.section} sections={request.sections} />;\n  }\n\n  return (\n    <div className="space-y-1 text-xs text-slate-600">\n      {items.map((item) => (\n        <div key={item} className="font-semibold">{item}</div>\n      ))}\n      {request.note && <div className="mt-1 text-[11px] text-slate-400">ملاحظة: {request.note}</div>}\n    </div>\n  );\n}\n\1'''
)

# 7) Migration.
mig = ROOT / 'backend/prisma/migrations/20260828090000_manual_exam_request_fields'
mig.mkdir(parents=True, exist_ok=True)
(mig / 'migration.sql').write_text(
    'ALTER TABLE "exam_requests" ADD COLUMN "requestedHizb" INTEGER;\n'
    'ALTER TABLE "exam_requests" ADD COLUMN "requestedJuz" INTEGER;\n'
    'ALTER TABLE "exam_requests" ADD COLUMN "requestedCombined" INTEGER;\n',
    encoding='utf-8',
)

print('manual exam request patch applied')
