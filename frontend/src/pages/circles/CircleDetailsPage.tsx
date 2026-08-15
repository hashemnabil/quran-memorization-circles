import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  ProgressBar,
  Select,
  StatCard,
  Tabs,
  Textarea,
  cx,
  useConfirm,
} from '@/components/ui';
import {
  IconBook,
  IconCircleGroup,
  IconClipboard,
  IconEdit,
  IconGraduation,
  IconPlus,
  IconTrash,
  IconUsers,
} from '@/components/ui/Icons';
import {
  DAY_LABELS,
  EVALUATION_COLORS,
  EVALUATION_LABELS,
  STUDENT_STATUS_COLORS,
  STUDENT_STATUS_LABELS,
  WEEK_DAYS,
} from '@/lib/labels';
import { formatDateShort, formatTime } from '@/lib/format';
import type { Circle, PaginatedResponse, TeacherProfile, UserRecord } from '@/types';

export default function CircleDetailsPage() {
  const { id = '' } = useParams();
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [tab, setTab] = useState('students');
  const [modal, setModal] = useState<'edit' | 'assistant' | 'primary' | null>(null);

  const isAdmin = user.role === 'ADMIN';
  const canManageTeachers = isAdmin || user.role === 'SUPERVISOR';

  const { data: circle, isLoading, isError, refetch } = useQuery({
    queryKey: ['circles', id],
    queryFn: async () => (await api.get<Circle>(`/circles/${id}`)).data,
    enabled: !!id,
  });

  const { data: attendanceSummary } = useQuery({
    queryKey: ['attendance', 'circle-summary', id],
    queryFn: async () => (await api.get(`/attendance/circle/${id}/summary`)).data,
    enabled: !!id && tab === 'attendance',
  });

  const { data: history } = useQuery({
    queryKey: ['circles', id, 'history'],
    queryFn: async () => (await api.get(`/circles/${id}/history`)).data,
    enabled: !!id && tab === 'history',
  });

  const removeTeacher = useMutation({
    mutationFn: (teacherId: string) => api.delete(`/circles/${id}/teachers/${teacherId}`),
    onSuccess: () => {
      toast.success('تم إنهاء إسناد المعلم');
      queryClient.invalidateQueries({ queryKey: ['circles', id] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  if (isLoading) return <LoadingState rows={6} />;
  if (isError || !circle) return <ErrorState message="تعذر تحميل بيانات الحلقة" onRetry={() => refetch()} />;

  const handleRemoveTeacher = async (teacherId: string, name: string) => {
    const ok = await confirm({
      title: 'إزالة المعلم',
      message: `سيتم إنهاء إسناد "${name}" لهذه الحلقة، مع الاحتفاظ بالسجل.`,
      confirmLabel: 'إزالة',
    });
    if (ok) removeTeacher.mutate(teacherId);
  };

  return (
    <>
      <PageHeader
        title={circle.name}
        breadcrumb={
          <Link to="/circles" className="hover:text-primary-700">
            الحلقات
          </Link>
        }
        subtitle={`${circle.code}${circle.level ? ` • ${circle.level}` : ''}${circle.location ? ` • ${circle.location}` : ''}`}
        action={
          <>
            <Link to={`/attendance?circleId=${circle.id}`} className="btn-secondary btn-sm">
              تسجيل الحضور
            </Link>
            <Link to={`/recitations?circleId=${circle.id}`} className="btn-secondary btn-sm">
              التسميع
            </Link>
            {(isAdmin || user.role === 'SUPERVISOR') && (
              <Button size="sm" variant="secondary" icon={<IconEdit size={15} />} onClick={() => setModal('edit')}>
                تعديل
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="عدد الطلاب" value={circle.studentsCount} icon={<IconGraduation size={22} />} hint={`السعة ${circle.capacity}`} />
        <StatCard label="الطلاب المنتظمون" value={circle.stats?.activeStudents ?? 0} icon={<IconUsers size={22} />} tone="emerald" />
        <StatCard label="الموقوفون" value={circle.stats?.suspendedStudents ?? 0} icon={<IconClipboard size={22} />} tone="red" />
        <StatCard label="تسميع هذا الأسبوع" value={circle.stats?.recitationsThisWeek ?? 0} icon={<IconBook size={22} />} tone="sky" />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card title="معلومات الحلقة">
          <dl className="space-y-2.5 text-sm">
            <Row label="المشرف" value={circle.supervisor?.fullName} />
            <Row label="جوال المشرف" value={<span className="numeric" dir="ltr">{circle.supervisor?.phone}</span>} />
            <Row label="الموعد" value={`${formatTime(circle.startTime)} — ${formatTime(circle.endTime)}`} />
            <Row label="الأيام" value={circle.scheduleDays?.map((d) => DAY_LABELS[d] ?? d).join('، ')} />
            <Row
              label="الحالة"
              value={
                <Badge className={circle.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}>
                  {circle.isActive ? 'مفعّلة' : 'موقوفة'}
                </Badge>
              }
            />
          </dl>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-slate-400">نسبة الامتلاء</span>
              <span className="numeric font-bold text-slate-700">
                {circle.studentsCount} / {circle.capacity}
              </span>
            </div>
            <ProgressBar value={circle.studentsCount} max={circle.capacity} showLabel />
          </div>
        </Card>

        <Card
          title="طاقم التدريس"
          className="lg:col-span-2"
          action={
            canManageTeachers && (
              <div className="flex gap-2">
                {isAdmin && (
                  <Button size="sm" variant="secondary" onClick={() => setModal('primary')}>
                    تعيين المعلم الأساسي
                  </Button>
                )}
                <Button size="sm" icon={<IconPlus size={15} />} onClick={() => setModal('assistant')}>
                  معلم مساعد
                </Button>
              </div>
            )
          }
        >
          <div className="space-y-3">
            {circle.primaryTeacher ? (
              <TeacherRow
                name={circle.primaryTeacher.user.fullName}
                phone={circle.primaryTeacher.user.phone}
                teacherId={circle.primaryTeacher.id}
                role="المعلم الأساسي"
                roleClass="bg-primary-100 text-primary-800"
                since={circle.primaryTeacher.startedAt}
                onRemove={
                  canManageTeachers
                    ? () => handleRemoveTeacher(circle.primaryTeacher!.id, circle.primaryTeacher!.user.fullName)
                    : undefined
                }
              />
            ) : (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
                لم يتم تعيين معلم أساسي لهذه الحلقة بعد.
              </p>
            )}

            {circle.assistantTeachers?.map((assistant) => (
              <TeacherRow
                key={assistant.linkId}
                name={assistant.user.fullName}
                phone={assistant.user.phone}
                teacherId={assistant.id}
                role="معلم مساعد"
                roleClass="bg-sky-100 text-sky-800"
                since={assistant.startedAt}
                onRemove={canManageTeachers ? () => handleRemoveTeacher(assistant.id, assistant.user.fullName) : undefined}
              />
            ))}

            {!circle.assistantTeachers?.length && circle.primaryTeacher && (
              <p className="text-xs text-slate-400">لا يوجد معلمون مساعدون.</p>
            )}
          </div>
        </Card>
      </div>

      <Tabs
        tabs={[
          { key: 'students', label: 'الطلاب', badge: circle.studentsCount },
          { key: 'attendance', label: 'ملخص الحضور' },
          { key: 'history', label: 'سجل الحركة' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'students' && (
        <Card padded={false}>
          {circle.students?.length ? (
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>الرقم</th>
                    <th>الأجزاء</th>
                    <th>التقييم</th>
                    <th>جوال ولي الأمر</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {circle.students.map((student) => (
                    <tr key={student.id}>
                      <td>
                        <Link to={`/students/${student.id}`} className="font-bold text-slate-800 hover:text-primary-700">
                          {student.fullName}
                        </Link>
                      </td>
                      <td className="numeric text-xs text-slate-500">{student.code}</td>
                      <td className="numeric font-bold">{student.memorizedParts}</td>
                      <td>
                        {student.evaluation ? (
                          <Badge className={EVALUATION_COLORS[student.evaluation]}>
                            {EVALUATION_LABELS[student.evaluation]}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="numeric text-xs text-slate-500" dir="ltr">
                        {student.guardianPhone ?? '—'}
                      </td>
                      <td>
                        <Badge className={STUDENT_STATUS_COLORS[student.status]}>
                          {STUDENT_STATUS_LABELS[student.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="لا يوجد طلاب في هذه الحلقة" icon={<IconGraduation size={24} />} />
          )}
        </Card>
      )}

      {tab === 'attendance' && (
        <Card title="ملخص حضور الطلاب" padded={false}>
          {attendanceSummary?.length ? (
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>حاضر</th>
                    <th>بعذر</th>
                    <th>بدون عذر</th>
                    <th>النسبة</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceSummary.map((row: any) => (
                    <tr key={row.id}>
                      <td>
                        <Link to={`/students/${row.id}`} className="font-semibold text-slate-700 hover:text-primary-700">
                          {row.fullName}
                        </Link>
                      </td>
                      <td className="numeric text-emerald-700">{row.present}</td>
                      <td className="numeric text-amber-700">{row.excused}</td>
                      <td className="numeric text-red-700">{row.absent}</td>
                      <td className="w-40">
                        <ProgressBar
                          value={row.attendanceRate}
                          tone={row.attendanceRate >= 80 ? 'emerald' : row.attendanceRate >= 60 ? 'amber' : 'red'}
                          showLabel
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="لا توجد بيانات حضور" icon={<IconClipboard size={24} />} />
          )}
        </Card>
      )}

      {tab === 'history' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="حركة المعلمين" padded={false}>
            {history?.teachers?.length ? (
              <ul className="divide-y divide-slate-100">
                {history.teachers.map((entry: any) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{entry.teacher.user.fullName}</p>
                      <p className="text-xs text-slate-400">
                        {entry.role === 'PRIMARY' ? 'معلم أساسي' : 'معلم مساعد'}
                        {entry.note ? ` — ${entry.note}` : ''}
                      </p>
                    </div>
                    <div className="numeric text-left text-[11px] text-slate-500">
                      <p>{formatDateShort(entry.startedAt)}</p>
                      <p>{entry.endedAt ? formatDateShort(entry.endedAt) : 'حتى الآن'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="لا يوجد سجل" />
            )}
          </Card>

          <Card title="حركة الطلاب" padded={false}>
            {history?.students?.length ? (
              <ul className="divide-y divide-slate-100">
                {history.students.map((entry: any) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <Link to={`/students/${entry.student.id}`} className="text-sm font-semibold text-slate-700 hover:text-primary-700">
                        {entry.student.fullName}
                      </Link>
                      <p className="text-xs text-slate-400">{entry.reason ?? '—'}</p>
                    </div>
                    <div className="numeric text-left text-[11px] text-slate-500">
                      <p>{formatDateShort(entry.startedAt)}</p>
                      <p>{entry.endedAt ? formatDateShort(entry.endedAt) : 'حتى الآن'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="لا يوجد سجل" />
            )}
          </Card>
        </div>
      )}

      {modal === 'edit' && <EditCircleModal circle={circle} onClose={() => setModal(null)} />}
      {modal === 'assistant' && <AssignTeacherModal circleId={id} mode="assistant" onClose={() => setModal(null)} />}
      {modal === 'primary' && <AssignTeacherModal circleId={id} mode="primary" onClose={() => setModal(null)} />}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-left font-medium text-slate-700">{value || '—'}</dd>
    </div>
  );
}

function TeacherRow({
  name,
  phone,
  teacherId,
  role,
  roleClass,
  since,
  onRemove,
}: {
  name: string;
  phone?: string | null;
  teacherId: string;
  role: string;
  roleClass: string;
  since: string;
  onRemove?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 px-4 py-3">
      <Avatar name={name} size={38} />
      <div className="min-w-0 flex-1">
        <Link to={`/teachers/${teacherId}`} className="block truncate font-bold text-slate-800 hover:text-primary-700">
          {name}
        </Link>
        <p className="numeric text-[11px] text-slate-400" dir="ltr">
          {phone ?? ''}
        </p>
      </div>
      <Badge className={roleClass}>{role}</Badge>
      <span className="numeric hidden text-[11px] text-slate-400 sm:block">منذ {formatDateShort(since)}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="rounded-lg p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
          title="إزالة من الحلقة"
        >
          <IconTrash size={15} />
        </button>
      )}
    </div>
  );
}

function AssignTeacherModal({
  circleId,
  mode,
  onClose,
}: {
  circleId: string;
  mode: 'primary' | 'assistant';
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [teacherId, setTeacherId] = useState('');
  const [note, setNote] = useState('');

  const { data: teachers } = useQuery({
    queryKey: ['teachers', { limit: 200 }],
    queryFn: async () =>
      (await api.get<PaginatedResponse<TeacherProfile>>('/teachers', { params: { limit: 200, isActive: true } })).data.data,
  });

  const mutation = useMutation({
    mutationFn: () =>
      mode === 'primary'
        ? api.patch(`/circles/${circleId}/primary-teacher`, { teacherId, note: note || undefined })
        : api.post(`/circles/${circleId}/assistants`, { teacherId, note: note || undefined }),
    onSuccess: () => {
      toast.success(mode === 'primary' ? 'تم تعيين المعلم الأساسي' : 'تمت إضافة المعلم المساعد');
      queryClient.invalidateQueries({ queryKey: ['circles', circleId] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'primary' ? 'تعيين المعلم الأساسي' : 'إضافة معلم مساعد'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!teacherId}>
            حفظ
          </Button>
        </>
      }
    >
      {mode === 'primary' && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          سيتم إنهاء إسناد المعلم الأساسي الحالي مع حفظ السجل.
        </p>
      )}
      <Select label="المعلم" required value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
        <option value="">اختر المعلم</option>
        {teachers?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.user.fullName}
            {t.circleRoles?.filter((r) => !r.endedAt).length
              ? ` — ${t.circleRoles.filter((r) => !r.endedAt)[0].circle.name}`
              : ' — بدون حلقة'}
          </option>
        ))}
      </Select>
      <Textarea label="ملاحظة (اختياري)" className="mt-3" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}

function EditCircleModal({ circle, onClose }: { circle: Circle; onClose: () => void }) {
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const isAdmin = user.role === 'ADMIN';

  const [form, setForm] = useState({
    name: circle.name,
    level: circle.level ?? '',
    location: circle.location ?? '',
    capacity: circle.capacity,
    startTime: circle.startTime ?? '',
    endTime: circle.endTime ?? '',
    description: circle.description ?? '',
    isActive: circle.isActive,
    supervisorId: circle.supervisorId ?? '',
  });
  const [days, setDays] = useState<string[]>(circle.scheduleDays ?? []);

  const { data: supervisors } = useQuery({
    queryKey: ['users', { role: 'SUPERVISOR' }],
    queryFn: async () =>
      (await api.get<PaginatedResponse<UserRecord>>('/users', { params: { role: 'SUPERVISOR', limit: 100 } })).data.data,
    enabled: isAdmin,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: form.name,
        level: form.level,
        location: form.location,
        capacity: form.capacity,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        description: form.description,
        isActive: form.isActive,
        scheduleDays: days,
      };
      // Only the admin may reassign supervision.
      if (isAdmin) payload.supervisorId = form.supervisorId || null;
      return api.patch(`/circles/${circle.id}`, payload);
    },
    onSuccess: () => {
      toast.success('تم تحديث بيانات الحلقة');
      queryClient.invalidateQueries({ queryKey: ['circles'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));
  const toggleDay = (day: string) => setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day]));

  return (
    <Modal
      open
      onClose={onClose}
      title="تعديل بيانات الحلقة"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="اسم الحلقة" value={form.name} onChange={(e) => set('name', e.target.value)} />
        <Input label="المستوى" value={form.level} onChange={(e) => set('level', e.target.value)} />
        <Input label="المكان" value={form.location} onChange={(e) => set('location', e.target.value)} />
        <Input
          label="السعة"
          type="number"
          min={1}
          value={form.capacity}
          onChange={(e) => set('capacity', Number(e.target.value))}
        />
        <Input label="وقت البداية" type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
        <Input label="وقت النهاية" type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />

        {isAdmin && (
          <Select label="المشرف" value={form.supervisorId} onChange={(e) => set('supervisorId', e.target.value)}>
            <option value="">بدون مشرف</option>
            {supervisors?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </Select>
        )}

        <Select label="الحالة" value={String(form.isActive)} onChange={(e) => set('isActive', e.target.value === 'true')}>
          <option value="true">مفعّلة</option>
          <option value="false">موقوفة</option>
        </Select>

        <div className="sm:col-span-2">
          <span className="label">أيام الحلقة</span>
          <div className="flex flex-wrap gap-2">
            {WEEK_DAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                className={cx(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
                  days.includes(day.value)
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        <Textarea label="الوصف" value={form.description} onChange={(e) => set('description', e.target.value)} className="sm:col-span-2" />
      </div>
    </Modal>
  );
}
