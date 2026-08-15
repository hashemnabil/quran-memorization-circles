import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ProgressBar,
  StatCard,
  Tabs,
  cx,
} from '@/components/ui';
import { IconAward, IconBook, IconClipboard, IconGraduation } from '@/components/ui/Icons';
import {
  ATTENDANCE_COLORS,
  ATTENDANCE_LABELS,
  EVALUATION_COLORS,
  EVALUATION_LABELS,
  EXAM_STATUS_COLORS,
  EXAM_STATUS_LABELS,
  RECITATION_TYPE_LABELS,
} from '@/lib/labels';
import { formatDateShort, formatDateTime, timeAgo } from '@/lib/format';

export default function ParentChildDetailsPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState('attendance');

  const { data: children } = useQuery({
    queryKey: ['parents', 'my-children'],
    queryFn: async () => (await api.get('/parents/my-children')).data,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['parents', 'child', id],
    queryFn: async () => (await api.get(`/parents/my-children/${id}`)).data,
    enabled: !!id,
  });

  const child = children?.find((c: any) => c.id === id);

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !data) return <ErrorState message="تعذر تحميل بيانات الطالب" onRetry={() => refetch()} />;

  const passed = data.exams?.filter((e: any) => e.result === 'PASSED').length ?? 0;

  return (
    <>
      <PageHeader
        title={child?.fullName ?? 'ملف الطالب'}
        breadcrumb={
          <Link to="/parent/children" className="hover:text-primary-700">
            متابعة الأبناء
          </Link>
        }
        subtitle={child ? `${child.circle?.name ?? 'غير مسجل'} — المعلم: ${child.teacherName ?? '—'}` : undefined}
      />

      {child && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="نسبة الحضور"
            value={`${child.attendance.rate}%`}
            icon={<IconClipboard size={22} />}
            tone={child.attendance.rate >= 80 ? 'emerald' : child.attendance.rate >= 60 ? 'amber' : 'red'}
          />
          <StatCard label="مرات الغياب" value={child.attendance.absent} icon={<IconClipboard size={22} />} tone="red" />
          <StatCard label="الأجزاء المحفوظة" value={child.memorizedParts} icon={<IconBook size={22} />} hint="من 30 جزءاً" />
          <StatCard label="الاختبارات المجتازة" value={passed} icon={<IconAward size={22} />} tone="purple" />
        </div>
      )}

      {child && (
        <Card className="mb-5" title="المستوى والتقييم">
          <div className="mb-4">
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-slate-400">تقدم الحفظ</span>
              <span className="numeric font-bold text-slate-700">{child.memorizedParts} / 30</span>
            </div>
            <ProgressBar value={child.memorizedParts} max={30} showLabel />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {child.evaluation && (
              <span className="flex items-center gap-2">
                <span className="text-xs text-slate-400">التقييم:</span>
                <Badge className={EVALUATION_COLORS[child.evaluation as keyof typeof EVALUATION_COLORS]}>
                  {EVALUATION_LABELS[child.evaluation as keyof typeof EVALUATION_LABELS]}
                </Badge>
              </span>
            )}
            {child.currentSurah && (
              <span className="text-xs text-slate-500">
                السورة الحالية: <span className="font-bold text-slate-700">{child.currentSurah}</span>
              </span>
            )}
          </div>
          {child.evaluationNote && (
            <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs leading-6 text-slate-600">
              {child.evaluationNote}
            </p>
          )}
        </Card>
      )}

      <Tabs
        tabs={[
          { key: 'attendance', label: 'الحضور', badge: data.attendance?.length },
          { key: 'recitations', label: 'التسميع', badge: data.recitations?.length },
          { key: 'exams', label: 'الاختبارات', badge: data.exams?.length },
          { key: 'notes', label: 'الملاحظات', badge: data.notes?.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'attendance' && (
        <Card padded={false}>
          {data.attendance?.length ? (
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الحالة</th>
                    <th>سبب العذر</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attendance.map((rec: any) => (
                    <tr key={rec.id}>
                      <td className="numeric">{formatDateShort(rec.date)}</td>
                      <td>
                        <Badge className={ATTENDANCE_COLORS[rec.status as keyof typeof ATTENDANCE_COLORS]}>
                          {ATTENDANCE_LABELS[rec.status as keyof typeof ATTENDANCE_LABELS]}
                        </Badge>
                      </td>
                      <td className="text-xs text-slate-500">{rec.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="لا توجد سجلات حضور" icon={<IconClipboard size={24} />} />
          )}
        </Card>
      )}

      {tab === 'recitations' && (
        <Card padded={false}>
          {data.recitations?.length ? (
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>النوع</th>
                    <th>المقطع</th>
                    <th>الصفحات</th>
                    <th>التقييم</th>
                    <th>المعلم</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recitations.map((rec: any) => (
                    <tr key={rec.id}>
                      <td className="numeric">{formatDateShort(rec.date)}</td>
                      <td>
                        <Badge className="bg-slate-100 text-slate-600">
                          {RECITATION_TYPE_LABELS[rec.type as keyof typeof RECITATION_TYPE_LABELS]}
                        </Badge>
                      </td>
                      <td className="text-sm">
                        {rec.fromSurah} <span className="numeric text-slate-400">({rec.fromAyah})</span> — {rec.toSurah}{' '}
                        <span className="numeric text-slate-400">({rec.toAyah})</span>
                      </td>
                      <td className="numeric">{rec.pagesCount ?? '—'}</td>
                      <td>
                        {rec.evaluation ? (
                          <Badge className={EVALUATION_COLORS[rec.evaluation as keyof typeof EVALUATION_COLORS]}>
                            {EVALUATION_LABELS[rec.evaluation as keyof typeof EVALUATION_LABELS]}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-xs text-slate-500">{rec.teacher?.user?.fullName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="لا توجد سجلات تسميع" icon={<IconBook size={24} />} />
          )}
        </Card>
      )}

      {tab === 'exams' && (
        <Card padded={false}>
          {data.exams?.length ? (
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>المقرر</th>
                    <th>الموعد</th>
                    <th>الحالة</th>
                    <th>الدرجة</th>
                    <th>النتيجة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.exams.map((exam: any) => (
                    <tr key={exam.id}>
                      <td className="font-semibold text-slate-700">{exam.section.name}</td>
                      <td className="text-xs text-slate-500">{formatDateTime(exam.scheduledAt)}</td>
                      <td>
                        <Badge className={EXAM_STATUS_COLORS[exam.status as keyof typeof EXAM_STATUS_COLORS]}>
                          {EXAM_STATUS_LABELS[exam.status as keyof typeof EXAM_STATUS_LABELS]}
                        </Badge>
                      </td>
                      <td className="numeric font-bold">{exam.score ?? '—'}</td>
                      <td>
                        {exam.result ? (
                          <Badge className={exam.result === 'PASSED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                            {exam.result === 'PASSED' ? 'ناجح' : 'لم يجتز'}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="لا توجد اختبارات" icon={<IconAward size={24} />} />
          )}
        </Card>
      )}

      {tab === 'notes' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="ملاحظات المعلمين" padded={false}>
            {data.notes?.length ? (
              <ul className="divide-y divide-slate-100">
                {data.notes.map((note: any) => (
                  <li key={note.id} className="px-5 py-4">
                    <p className="text-sm leading-6 text-slate-700">{note.body}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {note.author.fullName} — {timeAgo(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="لا توجد ملاحظات" icon={<IconClipboard size={24} />} />
            )}
          </Card>

          <Card title="سجل التقييمات" padded={false}>
            {data.evaluations?.length ? (
              <ul className="divide-y divide-slate-100">
                {data.evaluations.map((ev: any) => (
                  <li key={ev.id} className="flex items-start justify-between gap-3 px-5 py-4">
                    <div>
                      <Badge className={EVALUATION_COLORS[ev.evaluation as keyof typeof EVALUATION_COLORS]}>
                        {EVALUATION_LABELS[ev.evaluation as keyof typeof EVALUATION_LABELS]}
                      </Badge>
                      {ev.note && <p className="mt-1.5 text-xs text-slate-500">{ev.note}</p>}
                    </div>
                    <div className="text-left text-[11px] text-slate-400">
                      <p>{ev.author?.fullName}</p>
                      <p className="numeric">{formatDateShort(ev.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="لا توجد تقييمات" icon={<IconGraduation size={24} />} />
            )}
          </Card>
        </div>
      )}
    </>
  );
}
