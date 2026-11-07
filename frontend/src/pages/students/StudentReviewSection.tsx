import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateShort } from '@/lib/format';
import { EVALUATION_COLORS, EVALUATION_LABELS, RECITATION_TYPE_LABELS } from '@/lib/labels';
import { RecitationFormModal } from '@/pages/recitations/RecitationsPage';
import type { PaginatedResponse, Recitation, RecitationType, Student } from '@/types';

export function StudentReviewSection({ student, canManage }: { student: Student; canManage: boolean }) {
  const [type, setType] = useState<RecitationType>('MINOR_REVIEW');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState<RecitationType | null>(null);
  const records = useQuery({
    queryKey: ['recitations', { studentId: student.id, type, page, limit: 20 }],
    queryFn: async () => (await api.get<PaginatedResponse<Recitation>>('/recitations', {
      params: { studentId: student.id, type, page, limit: 20 },
    })).data,
  });
  const achievements = student.surahAchievements ?? [];
  const reviewed = achievements.filter(item => item.reviewedAt);
  const consolidated = achievements.filter(item => item.consolidatedAt);
  return <div className="space-y-5">
    <Card title="المراجعة والتثبيت" subtitle="متابعة السور المكتملة بتقدير ممتاز وسجل جلسات الطالب" action={canManage && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setAdding('MINOR_REVIEW')}>إضافة مراجعة</Button>
      <Button size="sm" onClick={() => setAdding('CONSOLIDATION')}>إضافة تثبيت</Button>
    </div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-red-50 p-4 text-red-800"><p className="text-sm">سور تمت مراجعتها بممتاز</p><strong className="text-2xl">{reviewed.length}</strong></div>
        <div className="rounded-xl bg-emerald-50 p-4 text-emerald-800"><p className="text-sm">سور تم تثبيتها بممتاز</p><strong className="text-2xl">{consolidated.length}</strong></div>
      </div>
      <p className="mt-4 text-sm leading-7 text-slate-500">بعد إكمال حفظ السورة بممتاز، تكتمل المراجعة بتغطية جميع آياتها بممتاز فيتحول لونها في القلب إلى الأحمر، ثم تتحول إلى الأخضر بعد إكمال التثبيت بممتاز.</p>
      {achievements.length > 0 && <div className="table-wrap mt-4"><table className="table">
        <thead><tr><th>السورة</th><th>المراجعة بممتاز</th><th>التثبيت بممتاز</th></tr></thead>
        <tbody>{achievements.map(item => <tr key={item.surah}><td>{item.surah}</td><td className={item.reviewedAt ? 'text-red-700' : 'text-slate-400'}>{item.reviewedAt ? formatDateShort(item.reviewedAt) : 'بانتظار إكمال المراجعة'}</td><td className={item.consolidatedAt ? 'text-emerald-700' : 'text-slate-400'}>{item.consolidatedAt ? formatDateShort(item.consolidatedAt) : 'بانتظار إكمال التثبيت'}</td></tr>)}</tbody>
      </table></div>}
    </Card>
    <Card title="سجل المراجعة والتثبيت" action={<Select aria-label="نوع الجلسة" value={type} onChange={event => { setType(event.target.value as RecitationType); setPage(1); }}>
      {(['MINOR_REVIEW', 'MAJOR_REVIEW', 'CONSOLIDATION'] as const).map(value => <option key={value} value={value}>{RECITATION_TYPE_LABELS[value]}</option>)}
    </Select>}>
      {records.isLoading ? <LoadingState rows={3} /> : records.isError ? <ErrorState message="تعذر تحميل سجل المراجعة والتثبيت" onRetry={() => void records.refetch()} /> : records.data?.data.length ? <>
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
    {adding && <RecitationFormModal student={student} defaultType={adding} onClose={() => setAdding(null)} />}
  </div>;
}
