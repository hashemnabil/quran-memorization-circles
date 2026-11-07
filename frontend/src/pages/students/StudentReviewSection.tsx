import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateShort } from '@/lib/format';
import { EVALUATION_COLORS, EVALUATION_LABELS, RECITATION_TYPE_LABELS } from '@/lib/labels';
import { RecitationFormModal } from '@/pages/recitations/RecitationsPage';
import type { PaginatedResponse, Recitation, RecitationType, Student } from '@/types';

export function StudentReviewSection({ student, canManage, mode }: { student: Student; canManage: boolean; mode: 'review' | 'consolidation' }) {
  const isReview = mode === 'review';
  const title = isReview ? 'المراجعة' : 'التثبيت';
  const allowedTypes: RecitationType[] = isReview ? ['MINOR_REVIEW', 'MAJOR_REVIEW'] : ['CONSOLIDATION'];
  const [type, setType] = useState<RecitationType>(allowedTypes[0]);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState<RecitationType | null>(null);
  const records = useQuery({
    queryKey: ['recitations', { studentId: student.id, type, page, limit: 20 }],
    queryFn: async () => (await api.get<PaginatedResponse<Recitation>>('/recitations', {
      params: { studentId: student.id, type, page, limit: 20 },
    })).data,
  });
  const achievements = student.surahAchievements ?? [];
  const completed = achievements.filter(item => isReview ? item.reviewedAt : item.consolidatedAt);
  return <div className="space-y-5">
    <Card title={title} subtitle="متابعة السور المكتملة بتقدير ممتاز وسجل جلسات الطالب" action={canManage && <Button size="sm" onClick={() => setAdding(type)}>{isReview ? 'إضافة مراجعة' : 'إضافة تثبيت'}</Button>}>
      <div className={isReview ? 'rounded-xl bg-red-50 p-4 text-red-800' : 'rounded-xl bg-emerald-50 p-4 text-emerald-800'}><p className="text-sm">{isReview ? 'سور تمت مراجعتها بممتاز' : 'سور تم تثبيتها بممتاز'}</p><strong className="text-2xl">{completed.length}</strong></div>
      <p className="mt-4 text-sm leading-7 text-slate-500">{isReview ? 'تكتمل المراجعة بتغطية جميع آيات السورة بممتاز بعد حفظها، فيتحول لونها في القلب إلى الأحمر.' : 'يكتمل التثبيت بتغطية جميع آيات السورة بممتاز بعد مراجعتها، فيتحول لونها في القلب إلى الأخضر.'}</p>
      {achievements.length > 0 && <div className="table-wrap mt-4"><table className="table">
        <thead><tr><th>السورة</th><th>{title} بممتاز</th></tr></thead>
        <tbody>{achievements.map(item => { const at = isReview ? item.reviewedAt : item.consolidatedAt; return <tr key={item.surah}><td>{item.surah}</td><td className={at ? (isReview ? 'text-red-700' : 'text-emerald-700') : 'text-slate-400'}>{at ? formatDateShort(at) : 'بانتظار الإكمال'}</td></tr>; })}</tbody>
      </table></div>}
    </Card>
    <Card title={'سجل ' + title} action={isReview && <Select aria-label="نوع المراجعة" value={type} onChange={event => { setType(event.target.value as RecitationType); setPage(1); }}>
      {allowedTypes.map(value => <option key={value} value={value}>{RECITATION_TYPE_LABELS[value]}</option>)}
    </Select>}>
      {records.isLoading ? <LoadingState rows={3} /> : records.isError ? <ErrorState message={'تعذر تحميل سجل ' + title} onRetry={() => void records.refetch()} /> : records.data?.data.length ? <>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>التاريخ</th><th>النوع</th><th>المدى</th><th>الشيخ</th><th>التقدير</th><th>الأخطاء</th><th>التنبيهات</th></tr></thead>
          <tbody>{records.data.data.map(record => <tr key={record.id}>
            <td>{formatDateShort(record.date)}</td><td>{RECITATION_TYPE_LABELS[record.type]}</td><td>{record.fromSurah} ({record.fromAyah}) — {record.toSurah} ({record.toAyah})</td><td>{record.teacher?.user.fullName ?? '—'}</td>
            <td>{record.evaluation ? <Badge className={EVALUATION_COLORS[record.evaluation]}>{EVALUATION_LABELS[record.evaluation]}</Badge> : '—'}</td><td>{record.mistakes ?? 0}</td><td>{record.warnings ?? 0}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="mt-4 flex items-center justify-between gap-3"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>السابق</Button><span className="text-sm text-slate-500">صفحة {page} من {records.data.meta.totalPages}</span><Button variant="secondary" size="sm" disabled={!records.data.meta.hasNextPage} onClick={() => setPage(value => value + 1)}>التالي</Button></div>
      </> : <EmptyState title="لا توجد جلسات مسجلة من هذا النوع" />}
    </Card>
    {adding && <RecitationFormModal student={student} defaultType={adding} allowedTypes={allowedTypes} onClose={() => setAdding(null)} />}
  </div>;
}
