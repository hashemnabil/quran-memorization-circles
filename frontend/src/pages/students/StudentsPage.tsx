import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { listOfflineSnapshot } from '@/lib/offline/changeFeed';

import { useAuthStore } from '@/store/auth';
import { useDebounce } from '@/hooks/useDebounce';
import { useBulkSelect } from '@/hooks/useBulkSelect';
import { BulkBar } from '@/components/BulkBar';
import {
  Avatar,
  Badge,
  Button,
  Card,
  cx,
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
  const [importing, setImporting] = useState(false);

  const debouncedSearch = useDebounce(search);
  // A teacher may register a student too — the backend pins them to the
  // teacher's own circle, so there is no way to reach another one.
  const canCreate = user.role === 'ADMIN' || user.role === 'SUPERVISOR' || user.role === 'TEACHER';

  const { data: circles } = useQuery({
    queryKey: ['circles', 'options'],
    queryFn: async () => {
      try {
        return (await api.get<Pick<Circle, 'id' | 'name' | 'code'>[]>('/circles/options')).data;
      } catch (error) {
        if ((error as { response?: unknown } | null)?.response) throw error;
        const snapshot = queryClient.getQueryData<{
          accountId: string; complete: boolean;
          circles: Array<Pick<Circle, 'id' | 'name' | 'code'>>;
        }>(['offline', 'bootstrap', user.id]);
        if (snapshot?.complete && snapshot.accountId === user.id) {
          return snapshot.circles.map(({ id, name, code }) => ({ id, name, code }));
        }
        // Use the account-scoped IndexedDB replica if the app was reloaded offline
        // and the in-memory bootstrap query has not been restored.
        const local = await listOfflineSnapshot(user.id, 'circle');
        if (local.length) return local
          .filter((circle) => circle.deletedAt == null)
          .map((circle) => ({ id: circle.id, name: String(circle.name ?? ''), code: String(circle.code ?? '') }));
        throw error;
      }
    },
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['students', { page, debouncedSearch, status, evaluation, circleId, track }],
    queryFn: async () => {
      try {
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
      } catch (error) {
        const hasFilters = Boolean(debouncedSearch || status || evaluation || circleId || track);
        if ((error as { response?: unknown } | null)?.response || page !== 1 || hasFilters) throw error;
        const snapshot = queryClient.getQueryData<{
          accountId: string; complete: boolean;
          students: Array<{
            id: string; code: string; fullName: string; status: StudentStatus;
            evaluation?: Evaluation | null; memorizedParts: number;
            currentSurah?: string | null; currentPage?: number | null; circleId?: string | null;
            updatedAt?: string;
          }>;
        }>(['offline', 'bootstrap', user.id]);
        let cachedStudents = snapshot?.accountId === user.id ? snapshot.students : [];
        if (!cachedStudents.length) {
          // IndexedDB survives a reload; query cache does not. Never mix replicas
          // between accounts, and only use this path for the unfiltered first page.
          cachedStudents = await listOfflineSnapshot(user.id, 'student') as unknown as typeof cachedStudents;
        }
        if (!cachedStudents.length) throw error;
        const students = cachedStudents
          .filter((student) => (student as { deletedAt?: string | null }).deletedAt == null)
          .map((student) => ({
            ...student, gender: 'MALE' as const, totalPoints: 0,
            enrollmentDate: student.updatedAt ?? '', createdAt: student.updatedAt ?? '',
          })) as Student[];
        return { offlineSnapshot: true, data: students.slice(0, 20), meta: {
          total: students.length, page: 1, limit: 20,
          totalPages: Math.max(1, Math.ceil(students.length / 20)),
          hasNextPage: students.length > 20, hasPreviousPage: false,
        }};
      }
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

  const isOfflineSnapshot = Boolean((data as (PaginatedResponse<Student> & { offlineSnapshot?: boolean }) | undefined)?.offlineSnapshot);
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
              <>
                <Button variant="secondary" onClick={async () => {
                  try {
                    const response = await api.get('/students/import-template', { responseType: 'blob' });
                    const url = URL.createObjectURL(response.data);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'students-import-template.xlsx';
                    link.click();
                    URL.revokeObjectURL(url);
                  } catch (error) { toast.error(apiError(error)); }
                }}>تنزيل قالب Excel</Button>
                <Button variant="secondary" loading={importing} onClick={() => document.getElementById('students-excel-import')?.click()}>
                  استيراد Excel
                </Button>
                <input id="students-excel-import" type="file" accept=".xlsx,.xls" className="hidden" disabled={importing}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    const form = new FormData();
                    form.append('file', file);
                    setImporting(true);
                    try {
                      const response = await api.post('/students/import-excel', form, { headers: { 'Content-Type': 'multipart/form-data' } });
                      const result = response.data as { imported: number; failed: number; results: Array<{ row: number; fullName: string; error?: string }>; credentials: Array<{ fullName: string; code?: string; username: string; temporaryPassword: string }> };
                      if (result.credentials.length) {
                        const exportResponse = await api.post('/students/credentials-export', { credentials: result.credentials }, { responseType: 'blob' });
                        const url = URL.createObjectURL(exportResponse.data);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = 'student-login-credentials.xlsx';
                        link.click();
                        URL.revokeObjectURL(url);
                      }
                      queryClient.invalidateQueries({ queryKey: ['students'] });
                      queryClient.invalidateQueries({ queryKey: ['student-accounts'] });
                      if (result.failed) {
                        const errors = result.results.filter((row) => row.error).map((row) => `صف ${row.row} (${row.fullName}): ${row.error}`).join('\n');
                        toast.error(`تم استيراد ${result.imported} طالب، وتعذر استيراد ${result.failed}. ${errors}`, { duration: 10000 });
                      } else toast.success(`تم استيراد ${result.imported} طالب وإنشاء حساباتهم، وتم تنزيل ملف بيانات الدخول`);
                    } catch (error) { toast.error(apiError(error)); }
                    finally { setImporting(false); }
                  }} />
              </>
            )}
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

      {(isOfflineSnapshot || (isError && Boolean(data))) && (
        <Card className="mb-5 border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">{isOfflineSnapshot ? 'أنت تعرض نسخة محفوظة دون اتصال. قد تكون بعض التفاصيل غير متاحة أو غير محدّثة؛ تحقّق من اتصال الإنترنت قبل اتخاذ قرارات أو إجراء تعديلات.' : 'تعذّر تحديث الطلاب؛ تعرض البيانات المحفوظة وقد تكون غير محدّثة.'}</p>
        </Card>
      )}

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
            placeholder="بحث بالاسم أو رقم الطالب أو رقم الهوية..."
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
        ) : isError && !data ? (
          <ErrorState message="تعذر تحميل قائمة الطلاب" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState
            title="لا يوجد طلاب"
            message={hasFilters ? 'لا توجد نتائج مطابقة لعوامل التصفية المحددة.' : 'لم يتم تسجيل أي طالب بعد.'}
            icon={<IconGraduation size={24} />}
          />
        ) : (
          <>
            {!bulk.active && <div className="grid gap-3 p-3 sm:hidden" aria-label="بطاقات الطلاب">
              {data.data.map(student => <Link key={student.id} to={`/students/${student.id}`} className="student-summary-card">
                <div className="flex items-center gap-3">
                  <Avatar name={student.fullName} src={student.photoUrl} size={42} />
                  <div className="min-w-0 flex-1"><h3 className="font-bold text-slate-800">{student.fullName}</h3><p className="numeric mt-1 text-xs text-slate-500">{student.code}</p></div>
                  <Badge className={STUDENT_STATUS_COLORS[student.status]}>{STUDENT_STATUS_LABELS[student.status]}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
                  <div><p className="text-slate-500">الحلقة</p><p className="mt-1 font-semibold text-slate-700">{student.circle?.name || 'غير مسجل في حلقة'}</p></div>
                  <div><p className="text-slate-500">المعلّم</p><p className="mt-1 font-semibold text-slate-700">{student.teacherName || '—'}</p></div>
                </div>
                <p className="mt-4 text-xs font-bold text-primary-700">عرض ملف الطالب ←</p>
              </Link>)}
            </div>}
            <div className={cx('table-wrap border-0 shadow-none', !bulk.active && 'hidden sm:block')}>
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
                            <span className="numeric block text-[11px] text-slate-500" dir="ltr">
                              الهوية: {student.nationalId ?? '—'}
                            </span>
                            <span className="block text-[11px] text-slate-500">
                              الميلاد: {student.birthDate ? formatDateShort(student.birthDate) : '—'}
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
  const user = useAuthStore((s) => s.user)!;
  const canChooseTrack = user.role === 'ADMIN' || user.role === 'SUPERVISOR';
  const [registrationTrack, setRegistrationTrack] = useState<'CIRCLE' | 'COURSE' | 'ACTIVITY'>('CIRCLE');
  const [courseId, setCourseId] = useState('');
  const { data: courses } = useQuery({ queryKey: ['courses', 'student-registration'], queryFn: async () => (await api.get('/courses', { params: { limit: 100, isActive: true } })).data.data as Array<{ id: string; name: string; code: string; isActive: boolean }>, enabled: canChooseTrack });
  const [form, setForm] = useState({
    fullName: '',
    code: '',
    birthDate: '',
    nationalId: '',
    fatherNationalId: '',
    guardianName: '',
    guardianPhone: '',
    guardianRelation: 'الأب',
    createAccount: false,
    address: '',
    circleId: '',
    memorizedParts: 0,
    currentSurah: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/students', payload),
    onSuccess: (response) => {
      const student = response.data;
      const credentials = student?.accountCredentials;
      if (credentials?.username && credentials?.temporaryPassword) {
        toast.success(`${student?.synced === 0 ? 'حُفظ الطالب وطلب الحساب؛ التفعيل ينتظر المزامنة.' : 'تم تسجيل الطالب.'} اسم المستخدم: ${credentials.username} — كلمة المرور المؤقتة: ${credentials.temporaryPassword}`, { duration: 20000 });
      } else {
        toast.success(student?.synced === 0 ? 'تم حفظ الطالب على الجهاز؛ بانتظار إرساله للخادم' : 'تم تسجيل الطالب بنجاح');
      }
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['student-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (error) => {
      const message = apiError(error);
      setErrors({ submit: message });
      toast.error(message);
    },
  });

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (registrationTrack === 'CIRCLE' && !form.circleId) nextErrors.circleId = 'اختر حلقة التحفيظ';
    if (registrationTrack === 'COURSE' && !courseId) nextErrors.courseId = 'اختر الدورة';
    if (form.code && !/^\d{1,9}$/.test(form.code)) nextErrors.code = 'رقم الطالب أرقام فقط وبحد أقصى 9 أرقام';
    if (!form.fullName.trim()) nextErrors.fullName = 'اسم الطالب مطلوب';
    
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    // Empty strings would fail the API's UUID / date validation.
    const values = { ...form, registrationTrack, courseId: registrationTrack === 'COURSE' ? courseId : '', circleId: registrationTrack === 'CIRCLE' ? form.circleId : '' };
    const payload = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '' && value !== null && value !== undefined));
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
          {Object.values(errors).some(Boolean) && (
            <p role="alert" className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {Object.values(errors).filter(Boolean).join(' — ')}
            </p>
          )}
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
        {canChooseTrack && <div className="sm:col-span-2"><Select label="مسار تسجيل الطالب" value={registrationTrack} onChange={(e) => { setRegistrationTrack(e.target.value as 'CIRCLE' | 'COURSE' | 'ACTIVITY'); set('circleId', ''); setCourseId(''); set('code', ''); }}><option value="CIRCLE">التحفيظ</option><option value="COURSE">الدورات</option><option value="ACTIVITY">النشاط</option></Select></div>}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">رقم الطالب</label>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Input value={form.code || `${registrationTrack === 'COURSE' ? '2' : registrationTrack === 'ACTIVITY' ? '3' : '1'}${new Date().getFullYear()}xxxx`} onChange={(e) => set('code', e.target.value.replace(/\D/g, '').slice(0, 9))} error={errors.code} dir="ltr" />
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => set('code', `${registrationTrack === 'COURSE' ? '2' : registrationTrack === 'ACTIVITY' ? '3' : '1'}${new Date().getFullYear()}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`)}>توليد رقم</Button>
          </div>
          <p className="mt-1 text-xs text-slate-500">{registrationTrack === 'COURSE' ? 'رقم الدورات يبدأ بـ 2 ثم سنة التسجيل ثم 4 أرقام عشوائية، مثال: 220261234.' : registrationTrack === 'ACTIVITY' ? 'رقم النشاط يبدأ بـ 3 ثم سنة التسجيل ثم 4 أرقام عشوائية، مثال: 320261234.' : 'رقم التحفيظ يبدأ بـ 1 ثم سنة التسجيل ثم 4 أرقام عشوائية، وإذا تركته كما هو سيتم توليده تلقائياً عند التسجيل.'}</p>
        </div>
        <Input label="تاريخ الميلاد" type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
        <Input label="رقم الهوية (اختياري، لا يُستخدم لتسجيل الدخول)" value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} error={errors.nationalId} dir="ltr" />
        <Input label="اسم ولي الأمر" value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} />
        <Input label="رقم هوية ولي الأمر" value={form.fatherNationalId} onChange={(e) => set('fatherNationalId', e.target.value)} dir="ltr" />
        <Input label="رقم جوال ولي الأمر" value={form.guardianPhone} onChange={(e) => set('guardianPhone', e.target.value)} dir="ltr" />
        <Input label="صلة القرابة" value={form.guardianRelation} onChange={(e) => set('guardianRelation', e.target.value)} />
        <label className="sm:col-span-2 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <input type="checkbox" checked={form.createAccount} onChange={(e) => set('createAccount', e.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-400" />
          <span><span className="block text-sm font-bold text-slate-800">إنشاء حساب دخول للطالب</span><span className="mt-1 block text-xs leading-5 text-slate-500">فعّل الخيار لإنشاء اسم مستخدم يساوي رقم الطالب الذي يولّده النظام تلقائيًا، مع كلمة مرور مؤقتة. رقم الهوية اختياري ولا يُستخدم لتسجيل الدخول.</span></span>
        </label>
        <Input label="العنوان" value={form.address} onChange={(e) => set('address', e.target.value)} />

        {registrationTrack === 'CIRCLE' && <Select label="حلقة التحفيظ" required error={errors.circleId} value={form.circleId} onChange={(e) => set('circleId', e.target.value)}>
          <option value="">اختر حلقة التحفيظ</option>
          {circles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </Select>}
        {registrationTrack === 'COURSE' && <Select label="الدورة" required error={errors.courseId} value={courseId} onChange={(e) => { setCourseId(e.target.value); setErrors((previous) => ({ ...previous, courseId: '' })); }}><option value="">اختر الدورة</option>{(courses ?? []).filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}</Select>}
        {registrationTrack === 'CIRCLE' && <>
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
        </>}
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
