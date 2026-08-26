import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { PHONE_HINT, phoneError } from '@/lib/validation';
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
  Select,
  StatCard,
  Textarea,
} from '@/components/ui';
import { IconBook, IconCircleGroup, IconEdit, IconGraduation, IconUsers } from '@/components/ui/Icons';
import { COURSE_TYPE_COLORS, COURSE_TYPE_LABELS, EMPLOYMENT_LABELS } from '@/lib/labels';
import { calcAge, formatDate, formatDateShort } from '@/lib/format';
import type { Circle, TeacherProfile } from '@/types';

export default function TeacherDetailsPage() {
  const { id = '' } = useParams();
  const user = useAuthStore((s) => s.user)!;
  const [modal, setModal] = useState<'edit' | null>(null);

  const { data: teacher, isLoading, isError, refetch } = useQuery({
    queryKey: ['teachers', id],
    queryFn: async () => (await api.get<TeacherProfile>(`/teachers/${id}`)).data,
    enabled: !!id,
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !teacher) return <ErrorState message="تعذر تحميل بيانات المعلم" onRetry={() => refetch()} />;

  const isSelf = user.teacherId === teacher.id;
  const canEdit = user.role === 'ADMIN' || isSelf;

  const active = teacher.circleRoles?.filter((r) => !r.endedAt) ?? [];
  const past = teacher.circleRoles?.filter((r) => r.endedAt) ?? [];
  const courses = teacher.user?.coursesInstructed ?? [];

  return (
    <>
      <PageHeader
        title={teacher.user.fullName}
        breadcrumb={
          user.role !== 'TEACHER' ? (
            <Link to="/teachers" className="hover:text-primary-700">
              المعلمون
            </Link>
          ) : undefined
        }
        subtitle={`${teacher.qualification ?? 'معلم'} • ${EMPLOYMENT_LABELS[teacher.employmentType]}`}
        action={
          <>
            {canEdit && (
              <Button size="sm" variant="secondary" icon={<IconEdit size={15} />} onClick={() => setModal('edit')}>
                تعديل
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="الحلقات الحالية" value={active.length} icon={<IconCircleGroup size={22} />} />
        <StatCard label="عدد الطلاب" value={teacher.studentsCount ?? 0} icon={<IconGraduation size={22} />} tone="sky" />
        <StatCard
          label="الحالة"
          value={teacher.isActive ? 'نشط' : 'غير نشط'}
          icon={<IconUsers size={22} />}
          tone={teacher.isActive ? 'emerald' : 'slate'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="البيانات الشخصية">
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={teacher.user.fullName} src={teacher.user.avatarUrl} size={56} preview />
            <div className="min-w-0">
              <p className="truncate font-bold text-slate-800">{teacher.user.fullName}</p>
              <p className="truncate text-xs text-slate-400" dir="ltr">{teacher.user.email}</p>
            </div>
          </div>
          <Row label="الجوال" value={<span className="numeric" dir="ltr">{teacher.user.phone}</span>} />
          <Row label="رقم الهوية" value={<span className="numeric" dir="ltr">{teacher.nationalId}</span>} />
          <Row label="تاريخ الميلاد" value={formatDate(teacher.birthDate)} />
          <Row label="العمر" value={calcAge(teacher.birthDate)} />
          <Row label="العنوان" value={teacher.address} />
        </Card>

        <Card title="البيانات الوظيفية">
          <Row label="المؤهل" value={teacher.qualification} />
          <Row label="التخصص" value={teacher.specialization} />
          <Row label="نوع التعاقد" value={EMPLOYMENT_LABELS[teacher.employmentType]} />
          <Row label="تاريخ التعيين" value={formatDate(teacher.hireDate)} />
          {user.role === 'ADMIN' && teacher.salary != null && (
            <Row label="الراتب" value={<span className="numeric">{Number(teacher.salary).toLocaleString('en-US')}</span>} />
          )}
          <Row label="آخر دخول" value={formatDate(teacher.user.lastLoginAt)} />
          {teacher.notes && (
            <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-6 text-slate-600">
              {teacher.notes}
            </div>
          )}
        </Card>

        <Card title="الحلقات المسندة">
          {active.length ? (
            <ul className="space-y-2.5">
              {active.map((role) => (
                <li key={role.id}>
                  <Link
                    to={`/circles/${role.circle.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3.5 py-3 transition hover:border-primary-200 hover:bg-primary-50/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{role.circle.name}</p>
                      <p className="numeric text-[11px] text-slate-400">منذ {formatDateShort(role.startedAt)}</p>
                    </div>
                    <Badge
                      className={role.role === 'PRIMARY' ? 'bg-primary-100 text-primary-800' : 'bg-sky-100 text-sky-800'}
                    >
                      {role.role === 'PRIMARY' ? 'أساسي' : 'مساعد'}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="لا توجد حلقات مسندة" icon={<IconCircleGroup size={22} />} />
          )}
        </Card>

        {/* The courses track, alongside the circles above (spec item 10). */}
        <Card title="الدورات التعليمية">
          {courses.length ? (
            <ul className="space-y-2.5">
              {courses.map((course) => (
                <li key={course.id}>
                  <Link
                    to={`/courses/${course.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3.5 py-3 transition hover:border-primary-200 hover:bg-primary-50/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{course.name}</p>
                      <p className="numeric text-[11px] text-slate-400">
                        {course.code}
                        {course._count ? ` • ${course._count.enrollments} طالب` : ''}
                      </p>
                    </div>
                    <Badge className={COURSE_TYPE_COLORS[course.type]}>
                      {COURSE_TYPE_LABELS[course.type]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="لا يحاضر في أي دورة" icon={<IconBook size={22} />} />
          )}
        </Card>

        {past.length > 0 && (
          <Card title="سجل الإسناد السابق" className="lg:col-span-3" padded={false}>
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>الحلقة</th>
                    <th>الدور</th>
                    <th>من</th>
                    <th>إلى</th>
                    <th>ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {past.map((role) => (
                    <tr key={role.id}>
                      <td className="font-semibold text-slate-700">{role.circle.name}</td>
                      <td className="text-xs">{role.role === 'PRIMARY' ? 'معلم أساسي' : 'معلم مساعد'}</td>
                      <td className="numeric text-xs text-slate-500">{formatDateShort(role.startedAt)}</td>
                      <td className="numeric text-xs text-slate-500">{formatDateShort(role.endedAt)}</td>
                      <td className="text-xs text-slate-400">{(role as any).note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {modal === 'edit' && <EditTeacherModal teacher={teacher} onClose={() => setModal(null)} />}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 py-2.5 last:border-0">
      <span className="shrink-0 text-xs font-semibold text-slate-400">{label}</span>
      <span className="text-left text-sm font-medium text-slate-700">{value || '—'}</span>
    </div>
  );
}

function EditTeacherModal({ teacher, onClose }: { teacher: TeacherProfile; onClose: () => void }) {
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const isAdmin = user.role === 'ADMIN';

  const [form, setForm] = useState({
    fullName: teacher.user.fullName,
    phone: teacher.user.phone ?? '',
    email: teacher.user.email ?? '',
    address: teacher.address ?? '',
    qualification: teacher.qualification ?? '',
    specialization: teacher.specialization ?? '',
    memorizedParts: teacher.memorizedParts ?? 0,
    employmentType: teacher.employmentType,
    hireDate: teacher.hireDate?.slice(0, 10) ?? '',
    nationalId: teacher.nationalId ?? '',
    isActive: teacher.isActive,
    notes: teacher.notes ?? '',
  });

  const mutation = useMutation({
    mutationFn: () => {
      // The API restricts a teacher to their own contact fields.
      const payload: Record<string, unknown> = isAdmin
        ? form
        : {
            phone: form.phone,
            email: form.email,
            address: form.address,
            qualification: form.qualification,
            specialization: form.specialization,
          };
      return api.patch(`/teachers/${teacher.id}`, payload);
    },
    onSuccess: () => {
      toast.success('تم تحديث بيانات المعلم');
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: string, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear the field's error as soon as the user edits it again.
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  /** Validates the phone fields before the request goes out. */
  const submit = () => {
    const next: Record<string, string> = {};
    const phoneErr = phoneError(form.phone);
    if (phoneErr) next.phone = phoneErr;
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    mutation.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="تعديل بيانات المعلم"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            حفظ
          </Button>
        </>
      }
    >
      {!isAdmin && (
        <p className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-xs text-sky-800">
          يمكنك تعديل بيانات التواصل والمؤهل فقط. البيانات الوظيفية من صلاحية الإدارة.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="الاسم الكامل" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} disabled={!isAdmin} className="sm:col-span-2" />
        <Input label="الجوال" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} hint={PHONE_HINT} dir="ltr" />
        <Input label="البريد الإلكتروني" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} dir="ltr" />
        <Input label="المؤهل" value={form.qualification} onChange={(e) => set('qualification', e.target.value)} />
        <Input label="التخصص" value={form.specialization} onChange={(e) => set('specialization', e.target.value)} />
        <Input label="العنوان" value={form.address} onChange={(e) => set('address', e.target.value)} className="sm:col-span-2" />

        {isAdmin && (
          <>
            <Input label="رقم الهوية" value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} dir="ltr" />
            <Input
              label="الأجزاء المحفوظة"
              type="number"
              min={0}
              max={30}
              value={form.memorizedParts}
              onChange={(e) => set('memorizedParts', Number(e.target.value))}
            />
            <Select label="نوع التعاقد" value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
              {Object.entries(EMPLOYMENT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
            <Input label="تاريخ التعيين" type="date" value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
            <Select label="الحالة" value={String(form.isActive)} onChange={(e) => set('isActive', e.target.value === 'true')}>
              <option value="true">نشط</option>
              <option value="false">غير نشط</option>
            </Select>
            <Textarea label="ملاحظات" value={form.notes} onChange={(e) => set('notes', e.target.value)} className="sm:col-span-2" />
          </>
        )}
      </div>
    </Modal>
  );
}

