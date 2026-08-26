import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { PHONE_HINT, phoneError } from '@/lib/validation';
import { useAuthStore } from '@/store/auth';
import { useDebounce } from '@/hooks/useDebounce';
import { useBulkSelect } from '@/hooks/useBulkSelect';
import { BulkBar } from '@/components/BulkBar';
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
  Pagination,
  SearchInput,
  Select,
  Textarea,
  useConfirm,
} from '@/components/ui';
import { IconExchange, IconEye, IconGraduation, IconPlus, IconTrash } from '@/components/ui/Icons';
import {
  EVALUATION_COLORS,
  EVALUATION_LABELS,
  STUDENT_STATUS_COLORS,
  STUDENT_STATUS_LABELS,
  STUDENT_TRACK_LABELS,
} from '@/lib/labels';
import { calcAge, formatDateShort, formatParts } from '@/lib/format';
import type {
  Circle,
  Evaluation,
  PaginatedResponse,
  Student,
  StudentStatus,
  StudentTrack,
} from '@/types';

export default function StudentsPage() {
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [evaluation, setEvaluation] = useState('');
  const [circleId, setCircleId] = useState('');
  const [track, setTrack] = useState<StudentTrack | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [returning, setReturning] = useState<Student | null>(null);

  const debouncedSearch = useDebounce(search);
  // A teacher may register a student too — the backend pins them to the
  // teacher's own circle, so there is no way to reach another one.
  const canCreate = user.role === 'ADMIN' || user.role === 'SUPERVISOR' || user.role === 'TEACHER';

  const { data: circles } = useQuery({
    queryKey: ['circles', 'options'],
    queryFn: async () => (await api.get<Pick<Circle, 'id' | 'name' | 'code'>[]>('/circles/options')).data,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['students', { page, debouncedSearch, status, evaluation, circleId, track }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Student>>('/students', {
        params: {
          page,
          limit: 20,
          search: debouncedSearch || undefined,
          status: status || undefined,
          evaluation: evaluation || undefined,
          circleId: circleId || undefined,
          track: track || undefined,
        },
      });
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/students/${id}`),
    onSuccess: () => {
      toast.success('تم حذف الطالب');
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const removeMany = useMutation({
    mutationFn: (ids: string[]) => api.post('/students/bulk-delete', { ids }),
    onSuccess: (res) => {
      toast.success(res.data.message ?? 'تم الحذف');
      bulk.cancel();
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const rows = data?.data ?? [];
  // Off by default: the checkbox column appears only once "حذف جماعي" is pressed.
  const bulk = useBulkSelect(rows);
  const { selected } = bulk;

  const handleDelete = async (student: Student) => {
    const confirmed = await confirm({
      title: 'حذف الطالب',
      message: `سيتم حذف الطالب "${student.fullName}" من النظام (حذف ناعم يحفظ سجلاته). هل أنت متأكد؟`,
      confirmLabel: 'حذف',
    });
    if (confirmed) remove.mutate(student.id);
  };

  const resetFilters = () => {
    setSearch('');
    setStatus('');
    setEvaluation('');
    setCircleId('');
    setTrack('');
    setPage(1);
  };

  const hasFilters = search || status || evaluation || circleId || track;

  /**
   * The unified record — every student the school has ever had, across circles,
   * courses, the activity programme and suspensions — belongs to the people who
   * run the school. A teacher sees the students of their own circles and
   * nothing else, so the school-wide framing and its track filters are not
   * shown to them at all. (The API scopes the rows either way; this keeps the
   * screen from promising a view the teacher does not have.)
   */
  const isUnified = user.role === 'ADMIN' || user.role === 'SUPERVISOR';

  return (
    <>
      <PageHeader
        title={isUnified ? 'السجل الموحّد للطلاب' : 'طلاب حلقاتي'}
        subtitle={
          isUnified
            ? 'كل من دخل المدرسة: طلاب الحلقات والدورات وبرنامج النشاط والموقوفون'
            : 'طلاب الحلقات المسندة إليك'
        }
        action={
          <div className="flex flex-wrap gap-2">
            {user.role === 'ADMIN' && !bulk.active && (
              <Button variant="secondary" icon={<IconTrash size={16} />} onClick={bulk.enable}>
                حذف جماعي
              </Button>
            )}
            {canCreate && (
              <Button icon={<IconPlus size={17} />} onClick={() => setShowForm(true)}>
                تسجيل طالب
              </Button>
            )}
          </div>
        }
      />

      <Card className="mb-5">
        {/* The track chips are the unified record's main lens: one record set,
            filtered by which part of the school the student belongs to. They go
            with the unified record itself — a teacher has one track. */}
        {isUnified && (
          <div className="mb-4 flex flex-wrap gap-2">
            <TrackChip label="الكل" active={track === ''} onClick={() => { setTrack(''); setPage(1); }} />
            {(Object.keys(STUDENT_TRACK_LABELS) as StudentTrack[]).map((key) => (
              <TrackChip
                key={key}
                label={STUDENT_TRACK_LABELS[key]}
                active={track === key}
                onClick={() => { setTrack(key); setPage(1); }}
              />
            ))}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="بحث بالاسم أو رقم الطالب (ST-0004) أو رقم الهوية..."
            className="xl:col-span-2"
          />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحالات</option>
            {Object.entries(STUDENT_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={evaluation}
            onChange={(e) => {
              setEvaluation(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل التقييمات</option>
            {Object.entries(EVALUATION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={circleId}
            onChange={(e) => {
              setCircleId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحلقات</option>
            {circles?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        {hasFilters && (
          <button onClick={resetFilters} className="mt-3 text-xs font-bold text-primary-700 hover:underline">
            مسح عوامل التصفية
          </button>
        )}
      </Card>

      {bulk.active && (
        <BulkBar
          count={bulk.count}
          noun="طالب"
          allSelected={bulk.allSelected}
          onToggleAll={bulk.toggleAll}
          onCancel={bulk.cancel}
          deleting={removeMany.isPending}
          onDelete={async () => {
            const ok = await confirm({
              title: 'حذف الطلاب المحددين',
              message: `سيتم حذف ${bulk.count} طالب (حذف ناعم يحفظ سجلاتهم). هل أنت متأكد؟`,
              confirmLabel: 'حذف',
              variant: 'danger',
            });
            if (ok) removeMany.mutate(selected);
          }}
        />
      )}

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل قائمة الطلاب" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState
            title="لا يوجد طلاب"
            message={hasFilters ? 'لا توجد نتائج مطابقة لعوامل التصفية المحددة.' : 'لم يتم تسجيل أي طالب بعد.'}
            icon={<IconGraduation size={24} />}
          />
        ) : (
          <>
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    {bulk.active && (
                      <th className="w-10">
                        <input
                          type="checkbox"
                          checked={bulk.allSelected}
                          onChange={bulk.toggleAll}
                          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-400"
                          title="تحديد الكل"
                        />
                      </th>
                    )}
                    <th>الطالب</th>
                    <th>الحلقة</th>
                    <th>المعلم</th>
                    <th>ولي الأمر</th>
                    <th>الأجزاء</th>
                    <th>النقاط</th>
                    <th>التقييم</th>
                    <th>الحالة</th>
                    <th className="text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((student) => (
                    <tr key={student.id}>
                      {bulk.active && (
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.includes(student.id)}
                            onChange={() => bulk.toggle(student.id)}
                            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-400"
                          />
                        </td>
                      )}
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={student.fullName} src={student.photoUrl} size={34} preview />
                          <div className="min-w-0">
                            <Link
                              to={`/students/${student.id}`}
                              className="font-bold text-slate-800 hover:text-primary-700"
                            >
                              {student.fullName}
                            </Link>
                            <span className="numeric block text-[11px] text-slate-400">
                              {student.code} • {calcAge(student.birthDate)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {student.circle ? (
                          <Link to={`/circles/${student.circle.id}`} className="text-sm text-primary-700 hover:underline">
                            {student.circle.name}
                          </Link>
                        ) : student.status === 'ACTIVITY' ? (
                          <span className="text-xs text-amber-700">برنامج النشاط</span>
                        ) : (
                          <span className="text-xs text-slate-400">غير مسجل</span>
                        )}
                      </td>
                      <td className="text-sm text-slate-600">{student.teacherName ?? '—'}</td>
                      <td>
                        <span className="block text-sm text-slate-600">{student.parentName ?? '—'}</span>
                        <span className="numeric block text-[11px] text-slate-400" dir="ltr">
                          {student.parentPhone ?? ''}
                        </span>
                      </td>
                      <td className="numeric font-bold text-slate-700">{formatParts(student.memorizedParts)}</td>
                      <td>
                        <span className="numeric font-bold text-gold-700">
                          {Math.round((student.totalPoints ?? 0) * 100) / 100}
                        </span>
                      </td>
                      <td>
                        {student.evaluation ? (
                          <Badge className={EVALUATION_COLORS[student.evaluation]}>
                            {EVALUATION_LABELS[student.evaluation]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td>
                        <Badge className={STUDENT_STATUS_COLORS[student.status]}>
                          {STUDENT_STATUS_LABELS[student.status]}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            to={`/students/${student.id}`}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-primary-700"
                            title="عرض الملف"
                          >
                            <IconEye size={16} />
                          </Link>
                          {/* A student in the activity programme (or serving a
                              suspension) is outside every circle; this is how
                              the administration brings them back into one. */}
                          {user.role === 'ADMIN' &&
                            (student.status === 'ACTIVITY' || student.status === 'SUSPENDED') && (
                              <button
                                onClick={() => setReturning(student)}
                                className="rounded-lg p-2 text-emerald-600 transition hover:bg-emerald-50"
                                title="إعادة إلى حلقة"
                              >
                                <IconExchange size={16} />
                              </button>
                            )}
                          {user.role === 'ADMIN' && (
                            <button
                              onClick={() => handleDelete(student)}
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                              title="حذف"
                            >
                              <IconTrash size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      {showForm && <StudentFormModal circles={circles ?? []} onClose={() => setShowForm(false)} />}


      {returning && (

        <ReturnToCircleModal student={returning} onClose={() => setReturning(null)} />

      )}
    </>
  );
}

// --- create form ------------------------------------------------------------

function StudentFormModal({
  circles,
  onClose,
}: {
  circles: Pick<Circle, 'id' | 'name' | 'code'>[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    fullName: '',
    birthDate: '',
    nationalId: '',
    fatherNationalId: '',
    address: '',
    guardianName: '',
    guardianPhone: '',
    guardianRelation: 'الأب',
    circleId: '',
    parentId: '',
    memorizedParts: 0,
    currentSurah: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: parents } = useQuery({
    queryKey: ['parents', 'options'],
    queryFn: async () => (await api.get('/parents/options')).data,
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/students', payload),
    onSuccess: () => {
      toast.success('تم تسجيل الطالب بنجاح');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.fullName.trim()) nextErrors.fullName = 'اسم الطالب مطلوب';
    const guardianPhoneError = phoneError(form.guardianPhone);
    if (guardianPhoneError) nextErrors.guardianPhone = guardianPhoneError;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    // Empty strings would fail the API's UUID / date validation.
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value !== '' && value !== null),
    );
    create.mutate(payload);
  };

  const set = (key: string, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear the field's error as soon as the user starts correcting it.
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="تسجيل طالب جديد"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="الاسم الكامل"
          required
          value={form.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          error={errors.fullName}
          className="sm:col-span-2"
        />
        <Input label="تاريخ الميلاد" type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
        <Input label="رقم الهوية" value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} dir="ltr" />
        <Input
          label="رقم هوية الأب"
          value={form.fatherNationalId}
          onChange={(e) => set('fatherNationalId', e.target.value)}
          dir="ltr"
        />
        <Input label="العنوان" value={form.address} onChange={(e) => set('address', e.target.value)} />

        <Select label="الحلقة" value={form.circleId} onChange={(e) => set('circleId', e.target.value)}>
          <option value="">بدون حلقة</option>
          {circles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </Select>
        <Select label="حساب ولي الأمر" value={form.parentId} onChange={(e) => set('parentId', e.target.value)}>
          <option value="">بدون ربط</option>
          {parents?.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.user.fullName}
            </option>
          ))}
        </Select>

        <Input label="اسم ولي الأمر" value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} />
        <Input
          label="جوال ولي الأمر"
          value={form.guardianPhone}
          onChange={(e) => set('guardianPhone', e.target.value)}
          error={errors.guardianPhone}
          dir="ltr"
        />
        <Input label="صلة القرابة" value={form.guardianRelation} onChange={(e) => set('guardianRelation', e.target.value)} />
        <Input
          label="الأجزاء المحفوظة"
          type="number"
          min={0}
          max={30}
          value={form.memorizedParts}
          // Halves are legitimate: the total is ahzab / 2.
          step="0.5"
          onChange={(e) => set('memorizedParts', Number(e.target.value))}
        />
        <Input label="السورة الحالية" value={form.currentSurah} onChange={(e) => set('currentSurah', e.target.value)} />
        <Textarea
          label="ملاحظات"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          className="sm:col-span-2"
        />
      </div>
    </Modal>
  );
}

/** A filter pill for the unified profile's tracks. */
function TrackChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
        active
          ? 'border-primary-500 bg-primary-600 text-white'
          : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Brings a student back from the activity programme (or from a suspension) into
 * a circle.
 *
 * The circle is required for a student coming out of the activity programme —
 * they were taken out of theirs when they were transferred, so there is nothing
 * to go back to unless the administration names one. Everything else the return
 * involves (clearing the status, closing the open record, writing the
 * membership) happens server-side in one step.
 */
function ReturnToCircleModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [circleId, setCircleId] = useState('');
  const [note, setNote] = useState('');

  const { data: circles } = useQuery({
    queryKey: ['circles', 'options'],
    queryFn: async () => (await api.get<Pick<Circle, 'id' | 'name' | 'code'>[]>('/circles/options')).data,
  });

  const fromActivity = student.status === 'ACTIVITY';

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/suspensions/students/${student.id}/return`, {
        circleId: circleId || undefined,
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success(`تمت إعادة ${student.fullName} إلى الحلقات`);
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['suspensions'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="إعادة الطالب إلى حلقة"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={fromActivity && !circleId}
          >
            إعادة الطالب
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
        {fromActivity
          ? `${student.fullName} في برنامج النشاط ولا ينتمي لأي حلقة. اختر الحلقة التي سيلتحق بها، وستُرفع عنه صفة البرنامج ويعود طالباً منتظماً.`
          : `${student.fullName} موقوف حالياً. يمكن إنهاء الإيقاف وإبقاؤه في حلقته، أو نقله إلى حلقة أخرى.`}
      </p>

      <Select
        label={fromActivity ? 'الحلقة الجديدة' : 'الحلقة (اختياري)'}
        value={circleId}
        onChange={(e) => setCircleId(e.target.value)}
        required={fromActivity}
      >
        <option value="">{fromActivity ? 'اختر الحلقة' : 'الإبقاء على حلقته الحالية'}</option>
        {circles?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.code})
          </option>
        ))}
      </Select>

      <Textarea
        label="ملاحظة (اختياري)"
        className="mt-3"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="سبب الإعادة أو أي ملاحظة للسجل"
      />
    </Modal>
  );
}
