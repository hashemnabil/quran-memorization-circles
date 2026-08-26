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
import { formatDate, formatDateShort, todayInput } from '@/lib/format';
import type { Circle, PaginatedResponse, Recitation, RecitationDayDetail, RecitationDaySummary, Student } from '@/types';

interface SurahInfo {
  number: number;
  name: string;
  ayahs: number;
}

/**
 * The daily recitation log, read by day → circle → student.
 *
 * A flat table of every recitation ever answers "list the rows"; the school
 * asks "what happened in the circles yesterday?". So this mirrors the
 * attendance record exactly: the day expands into its circles, and a circle
 * expands into the students who recited in it — with each student's own
 * sessions underneath, since one child may recite more than once in a day.
 */
export default function RecitationsPage() {
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [circleId, setCircleId] = useState(searchParams.get('circleId') ?? '');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [openCircle, setOpenCircle] = useState<{ date: string; circleId: string } | null>(null);

  const canRecord = ['ADMIN', 'SUPERVISOR', 'TEACHER'].includes(user.role);

  const { data: circles } = useQuery({
    queryKey: ['circles', 'options'],
    queryFn: async () => (await api.get<Pick<Circle, 'id' | 'name' | 'code'>[]>('/circles/options')).data,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['recitations', 'history', { circleId, type, from, to, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<RecitationDaySummary>>('/recitations/history', {
          params: {
            page,
            limit: 15,
            circleId: circleId || undefined,
            type: type || undefined,
            from: from || undefined,
            to: to || undefined,
          },
        })
      ).data,
  });

  const { data: detail, isFetching: loadingDetail } = useQuery({
    queryKey: ['recitations', 'history', openCircle?.date, openCircle?.circleId],
    queryFn: async () =>
      (await api.get<RecitationDayDetail>(`/recitations/history/${openCircle!.date}/${openCircle!.circleId}`))
        .data,
    enabled: !!openCircle,
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
      message: 'سيتم حذف هذا السجل من سجل الطالب، وتُخصم نقاطه من رصيده.',
      confirmLabel: 'حذف',
    });
    if (ok) remove.mutate(id);
  };

  const days = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="التسميع اليومي"
        subtitle="سجل الحفظ والمراجعة — حسب اليوم ثم الحلقة ثم الطالب"
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
          <Input
            label="من تاريخ"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            label="إلى تاريخ"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </Card>

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل سجلات التسميع" onRetry={() => refetch()} />
        ) : days.length === 0 ? (
          <EmptyState
            title="لا توجد سجلات تسميع"
            message="بمجرد تسجيل تسميع، يظهر يومه هنا."
            icon={<IconBook size={24} />}
          />
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {days.map((day) => {
                const expanded = openDay === day.date;
                return (
                  <div key={day.date}>
                    {/* Level 1 — the day */}
                    <button
                      type="button"
                      onClick={() => {
                        setOpenDay(expanded ? null : day.date);
                        setOpenCircle(null);
                      }}
                      className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-right transition hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cx(
                            'grid h-9 w-9 shrink-0 place-items-center rounded-xl transition',
                            expanded ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          <IconBook size={17} />
                        </span>
                        <div>
                          <p className="font-bold text-slate-800">تسميع {formatDate(day.date)}</p>
                          <p className="numeric text-xs text-slate-400">
                            {day.circlesCount} حلقة — {day.students} طالب — {day.sessions} جلسة
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 text-xs">
                        <span className="numeric text-slate-500">{day.pages} صفحة</span>
                        <Badge className="bg-gold-100 text-gold-800">
                          <span className="numeric">{day.points}</span> نقطة
                        </Badge>
                      </div>
                    </button>

                    {/* Level 2 — the circles of that day */}
                    {expanded && (
                      <div className="bg-slate-50/60 px-5 pb-4">
                        <ul className="space-y-2">
                          {day.circles.map((row) => {
                            const isOpen =
                              openCircle?.date === day.date && openCircle?.circleId === row.circle.id;
                            return (
                              <li
                                key={row.circle.id}
                                className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenCircle(
                                      isOpen ? null : { date: day.date, circleId: row.circle.id },
                                    )
                                  }
                                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-right transition hover:bg-slate-50"
                                >
                                  <div>
                                    <p className="font-semibold text-slate-700">{row.circle.name}</p>
                                    <p className="numeric text-[11px] text-slate-400">
                                      {row.students} طالب — {row.sessions} جلسة
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2.5 text-xs">
                                    <span className="numeric text-red-600">{row.mistakes}</span>
                                    <span className="text-slate-300">/</span>
                                    <span className="numeric text-amber-600">{row.warnings}</span>
                                    <Badge className="bg-gold-100 text-gold-800">
                                      <span className="numeric">{row.points}</span>
                                    </Badge>
                                  </div>
                                </button>

                                {/* Level 3 — the students of that circle */}
                                {isOpen && (
                                  <div className="border-t border-slate-100 px-4 py-3">
                                    {loadingDetail ? (
                                      <LoadingState rows={3} />
                                    ) : (
                                      <ul className="space-y-2.5">
                                        {(detail?.students ?? []).map((entry) => (
                                          <li key={entry.student.id}>
                                            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                              <Link
                                                to={`/students/${entry.student.id}`}
                                                className="text-sm font-semibold text-slate-700 hover:text-primary-700"
                                              >
                                                {entry.student.fullName}
                                                <span className="numeric mr-2 text-[11px] text-slate-400">
                                                  {entry.student.code}
                                                </span>
                                              </Link>
                                              <Badge className="bg-gold-100 text-gold-800">
                                                <span className="numeric">{entry.points}</span> نقطة
                                              </Badge>
                                            </div>

                                            <ul className="space-y-1">
                                              {entry.records.map((rec) => (
                                                <li
                                                  key={rec.id}
                                                  className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                                                >
                                                  <Badge className="bg-slate-200 text-slate-700">
                                                    {RECITATION_TYPE_LABELS[rec.type]}
                                                  </Badge>
                                                  <span className="text-slate-700">
                                                    {rec.fromSurah}{' '}
                                                    <span className="numeric text-slate-400">
                                                      ({rec.fromAyah})
                                                    </span>
                                                    {' — '}
                                                    {rec.toSurah}{' '}
                                                    <span className="numeric text-slate-400">
                                                      ({rec.toAyah})
                                                    </span>
                                                  </span>
                                                  <span className="numeric text-slate-400">
                                                    {rec.versesCount ?? 0} آية
                                                  </span>
                                                  <span className="numeric text-red-600">
                                                    {rec.mistakes ?? 0} خطأ
                                                  </span>
                                                  <span className="numeric text-amber-600">
                                                    {rec.warnings ?? 0} تنبيه
                                                  </span>
                                                  {rec.evaluation && (
                                                    <Badge className={EVALUATION_COLORS[rec.evaluation]}>
                                                      {EVALUATION_LABELS[rec.evaluation]}
                                                    </Badge>
                                                  )}
                                                  <span className="mr-auto flex items-center gap-2 text-[11px] text-slate-400">
                                                    {rec.teacher?.user.fullName}
                                                    {canRecord &&
                                                      (user.role !== 'TEACHER' ||
                                                        rec.teacher?.id === user.teacherId) && (
                                                        <button
                                                          onClick={() => handleDelete(rec.id)}
                                                          className="rounded p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                                                          title="حذف"
                                                        >
                                                          <IconTrash size={14} />
                                                        </button>
                                                      )}
                                                  </span>
                                                </li>
                                              ))}
                                            </ul>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {data && (
              <Pagination
                page={data.meta.page}
                totalPages={data.meta.totalPages}
                total={data.meta.total}
                onChange={setPage}
              />
            )}
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
    mistakes: 0,
    warnings: 0,
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

  /**
   * Live mirror of the server's scoring rule: one point per ayah, minus one per
   * mistake and a quarter per warning, never below zero. Showing the result as
   * the teacher types is the whole point of the feature — otherwise the number
   * only appears after saving.
   */
  const versesCount = (() => {
    if (!fromSurah || !toSurah) return 0;
    if (fromSurah.number === toSurah.number) {
      return Math.max(0, form.toAyah - form.fromAyah + 1);
    }
    if (fromSurah.number > toSurah.number) return 0;
    let total = Math.max(0, fromSurah.ayahs - form.fromAyah + 1);
    for (const s of surahs ?? []) {
      if (s.number > fromSurah.number && s.number < toSurah.number) total += s.ayahs;
    }
    return total + Math.max(0, Math.min(form.toAyah, toSurah.ayahs));
  })();

  const earnedPoints =
    Math.round(
      Math.max(0, versesCount - form.mistakes - form.warnings * 0.25) * 100,
    ) / 100;

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
        <Input
          label="عدد الأخطاء"
          type="number"
          min={0}
          value={form.mistakes}
          onChange={(e) => set('mistakes', Number(e.target.value))}
          hint="يُخصم عن كل خطأ نقطة واحدة"
        />
        <Input
          label="عدد التنبيهات"
          type="number"
          min={0}
          value={form.warnings}
          onChange={(e) => set('warnings', Number(e.target.value))}
          hint="يُخصم عن كل تنبيه ربع نقطة"
        />

        <div className="sm:col-span-2 rounded-xl bg-gold-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-gold-900">النقاط المكتسبة</span>
            <span className="numeric text-2xl font-extrabold text-gold-700">{earnedPoints}</span>
          </div>
          <p className="numeric mt-1 text-xs text-gold-800/80">
            {versesCount} آية − {form.mistakes} خطأ − ({form.warnings} × 0.25) تنبيه
          </p>
        </div>

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
