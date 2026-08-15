import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
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
  Select,
  Textarea,
  cx,
  useConfirm,
} from '@/components/ui';
import { IconBook, IconPlus, IconTrash } from '@/components/ui/Icons';
import { EVALUATION_COLORS, EVALUATION_LABELS, RECITATION_TYPE_LABELS } from '@/lib/labels';
import { formatDateShort, todayInput } from '@/lib/format';
import type { Circle, PaginatedResponse, Recitation, Student } from '@/types';

interface SurahInfo {
  number: number;
  name: string;
  ayahs: number;
}

export default function RecitationsPage() {
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [circleId, setCircleId] = useState(searchParams.get('circleId') ?? '');
  const [studentId, setStudentId] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const canRecord = ['ADMIN', 'SUPERVISOR', 'TEACHER'].includes(user.role);

  const { data: circles } = useQuery({
    queryKey: ['circles', 'options'],
    queryFn: async () => (await api.get<Pick<Circle, 'id' | 'name' | 'code'>[]>('/circles/options')).data,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['recitations', { circleId, studentId, type, from, to, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<Recitation>>('/recitations', {
          params: {
            page,
            limit: 25,
            circleId: circleId || undefined,
            studentId: studentId || undefined,
            type: type || undefined,
            from: from || undefined,
            to: to || undefined,
          },
        })
      ).data,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/recitations/${id}`),
    onSuccess: () => {
      toast.success('تم حذف السجل');
      queryClient.invalidateQueries({ queryKey: ['recitations'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'حذف سجل التسميع',
      message: 'سيتم حذف هذا السجل من سجل الطالب.',
      confirmLabel: 'حذف',
    });
    if (ok) remove.mutate(id);
  };

  return (
    <>
      <PageHeader
        title="التسميع اليومي"
        subtitle="تسجيل ومتابعة الحفظ والمراجعة"
        action={
          canRecord && (
            <Button icon={<IconPlus size={17} />} onClick={() => setShowForm(true)}>
              تسجيل تسميع
            </Button>
          )
        }
      />

      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="الحلقة"
            value={circleId}
            onChange={(e) => {
              setCircleId(e.target.value);
              setStudentId('');
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
          <Select
            label="النوع"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الأنواع</option>
            {Object.entries(RECITATION_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Input label="من تاريخ" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="إلى تاريخ" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل سجلات التسميع" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState title="لا توجد سجلات تسميع" message="ابدأ بتسجيل تسميع الطلاب اليومي." icon={<IconBook size={24} />} />
        ) : (
          <>
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الطالب</th>
                    <th>الحلقة</th>
                    <th>النوع</th>
                    <th>المقطع</th>
                    <th>الصفحات</th>
                    <th>التقييم</th>
                    <th>المعلم</th>
                    {canRecord && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((rec) => (
                    <tr key={rec.id}>
                      <td className="numeric">{formatDateShort(rec.date)}</td>
                      <td>
                        <Link to={`/students/${rec.student?.id}`} className="font-semibold text-slate-700 hover:text-primary-700">
                          {rec.student?.fullName}
                        </Link>
                      </td>
                      <td className="text-xs text-slate-500">{rec.circle?.name}</td>
                      <td>
                        <Badge className="bg-slate-100 text-slate-600">{RECITATION_TYPE_LABELS[rec.type]}</Badge>
                      </td>
                      <td className="text-sm">
                        {rec.fromSurah} <span className="numeric text-slate-400">({rec.fromAyah})</span>
                        {' — '}
                        {rec.toSurah} <span className="numeric text-slate-400">({rec.toAyah})</span>
                      </td>
                      <td className="numeric">{rec.pagesCount ?? '—'}</td>
                      <td>
                        {rec.evaluation ? (
                          <Badge className={EVALUATION_COLORS[rec.evaluation]}>
                            {EVALUATION_LABELS[rec.evaluation]}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-xs text-slate-500">{rec.teacher?.user.fullName}</td>
                      {canRecord && (
                        <td>
                          {/* A teacher may only remove the entries they recorded themselves. */}
                          {(user.role !== 'TEACHER' || rec.teacher?.id === user.teacherId) && (
                            <button
                              onClick={() => handleDelete(rec.id)}
                              className="rounded-lg p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                              title="حذف"
                            >
                              <IconTrash size={15} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
          </>
        )}
      </Card>

      {showForm && <RecitationFormModal defaultCircleId={circleId} onClose={() => setShowForm(false)} />}
    </>
  );
}

function RecitationFormModal({ defaultCircleId, onClose }: { defaultCircleId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [circleId, setCircleId] = useState(defaultCircleId ?? '');
  const [form, setForm] = useState({
    studentId: '',
    date: todayInput(),
    type: 'MEMORIZATION',
    fromSurah: 'النبأ',
    fromAyah: 1,
    toSurah: 'النبأ',
    toAyah: 40,
    pagesCount: 1,
    evaluation: 'VERY_GOOD',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: circles } = useQuery({
    queryKey: ['circles', 'options'],
    queryFn: async () => (await api.get<Pick<Circle, 'id' | 'name' | 'code'>[]>('/circles/options')).data,
  });

  const { data: surahs } = useQuery({
    queryKey: ['recitations', 'surahs'],
    queryFn: async () => (await api.get<SurahInfo[]>('/recitations/surahs')).data,
    staleTime: Infinity,
  });

  const { data: students } = useQuery({
    queryKey: ['students', { circleId, limit: 200 }],
    queryFn: async () =>
      (await api.get<PaginatedResponse<Student>>('/students', { params: { circleId, limit: 200, status: 'ACTIVE' } })).data
        .data,
    enabled: !!circleId,
  });

  useEffect(() => {
    if (!circleId && circles?.length) setCircleId(circles[0].id);
  }, [circles, circleId]);

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/recitations', payload),
    onSuccess: () => {
      toast.success('تم تسجيل التسميع');
      queryClient.invalidateQueries({ queryKey: ['recitations'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const fromSurah = surahs?.find((s) => s.name === form.fromSurah);
  const toSurah = surahs?.find((s) => s.name === form.toSurah);

  const submit = () => {
    const next: Record<string, string> = {};
    if (!form.studentId) next.studentId = 'اختر الطالب';
    if (fromSurah && form.fromAyah > fromSurah.ayahs) next.fromAyah = `سورة ${fromSurah.name} بها ${fromSurah.ayahs} آية`;
    if (toSurah && form.toAyah > toSurah.ayahs) next.toAyah = `سورة ${toSurah.name} بها ${toSurah.ayahs} آية`;
    if (fromSurah && toSurah && fromSurah.number > toSurah.number) next.toSurah = 'نطاق غير صحيح';
    setErrors(next);
    if (Object.keys(next).length) return;

    create.mutate({ ...form, notes: form.notes || undefined });
  };

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal
      open
      onClose={onClose}
      title="تسجيل تسميع"
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
        <Select
          label="الحلقة"
          value={circleId}
          onChange={(e) => {
            setCircleId(e.target.value);
            set('studentId', '');
          }}
        >
          <option value="">اختر الحلقة</option>
          {circles?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select label="الطالب" required value={form.studentId} onChange={(e) => set('studentId', e.target.value)} error={errors.studentId}>
          <option value="">اختر الطالب</option>
          {students?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </Select>

        <Input label="التاريخ" type="date" required max={todayInput()} value={form.date} onChange={(e) => set('date', e.target.value)} />
        <Select label="نوع التسميع" value={form.type} onChange={(e) => set('type', e.target.value)}>
          {Object.entries(RECITATION_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>

        <Select label="من سورة" required value={form.fromSurah} onChange={(e) => set('fromSurah', e.target.value)}>
          {surahs?.map((s) => (
            <option key={s.number} value={s.name}>
              {s.number}. {s.name}
            </option>
          ))}
        </Select>
        <Input
          label="من آية"
          type="number"
          required
          min={1}
          max={fromSurah?.ayahs ?? 286}
          value={form.fromAyah}
          onChange={(e) => set('fromAyah', Number(e.target.value))}
          error={errors.fromAyah}
          hint={fromSurah ? `عدد آياتها ${fromSurah.ayahs}` : undefined}
        />

        <Select label="إلى سورة" required value={form.toSurah} onChange={(e) => set('toSurah', e.target.value)} error={errors.toSurah}>
          {surahs?.map((s) => (
            <option key={s.number} value={s.name}>
              {s.number}. {s.name}
            </option>
          ))}
        </Select>
        <Input
          label="إلى آية"
          type="number"
          required
          min={1}
          max={toSurah?.ayahs ?? 286}
          value={form.toAyah}
          onChange={(e) => set('toAyah', Number(e.target.value))}
          error={errors.toAyah}
          hint={toSurah ? `عدد آياتها ${toSurah.ayahs}` : undefined}
        />

        <Input
          label="عدد الصفحات"
          type="number"
          step="0.5"
          min={0}
          value={form.pagesCount}
          onChange={(e) => set('pagesCount', Number(e.target.value))}
        />
        {/* التسميع اليومي يُقيَّم بتقدير عام فقط — الدرجة الرقمية تخص الاختبارات. */}
        <Select label="التقييم" required value={form.evaluation} onChange={(e) => set('evaluation', e.target.value)}>
          {Object.entries(EVALUATION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        <Textarea label="ملاحظات" value={form.notes} onChange={(e) => set('notes', e.target.value)} className="sm:col-span-2" />
      </div>
    </Modal>
  );
}
