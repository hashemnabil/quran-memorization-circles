import { useState } from 'react';
import { Card, EmptyState } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { attendanceRecordLabel, EVALUATION_LABELS } from '@/lib/labels';

type TimelineEntry = { id: string; at: string; kind: string; title: string; detail?: string; actor?: string; meta?: string };

const deliveryLabel: Record<string, string> = {
  QUEUED: 'بانتظار الإرسال', PROCESSING: 'جارٍ الإرسال', ACCEPTED: 'قبله مزوّد SMS',
  FAILED: 'فشل الإرسال', UNKNOWN: 'حالة الإرسال غير مؤكدة',
};

function entriesFor(history: any, examRequests: any[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const add = (items: any[] | undefined, kind: string, make: (item: any) => Omit<TimelineEntry, 'id' | 'kind'>) => {
    for (const item of items ?? []) entries.push({ id: `${kind}-${item.id}`, kind, ...make(item) });
  };
  add(history.summons, 'إنذار واستدعاء', item => ({ at: item.createdAt, title: item.title, detail: item.body,
    actor: item.issuedBy?.fullName, meta: [item.channel === 'SMS' ? 'SMS' : item.channel === 'BOTH' ? 'التطبيق وSMS' : item.channel === 'APP' ? 'التطبيق' : 'قناة غير مسجلة', item.smsStatus ? deliveryLabel[item.smsStatus] ?? item.smsStatus : ''].filter(Boolean).join(' · ') }));
  add(history.attendance, 'حضور', item => ({ at: item.date, title: `الحضور: ${attendanceRecordLabel(item)}`, detail: item.note }));
  add(history.recitations, 'تسميع', item => ({ at: item.date || item.createdAt, title: 'جلسة تسميع', detail: item.notes || item.note, meta: item.points == null ? undefined : `${item.points} نقطة` }));
  add(history.evaluations, 'تقييم', item => ({ at: item.createdAt, title: `تقييم: ${EVALUATION_LABELS[item.evaluation as keyof typeof EVALUATION_LABELS] ?? item.evaluation}`, detail: item.note, actor: item.author?.fullName }));
  add(history.exams, 'اختبار', item => ({ at: item.scheduledAt || item.createdAt, title: 'اختبار', meta: item.result || item.status }));
  add(examRequests, 'طلب اختبار', item => ({ at: item.createdAt, title: 'طلب اختبار', detail: item.reviewNote, meta: item.status }));
  add(history.suspensions, 'إيقاف', item => ({ at: item.createdAt, title: 'طلب إيقاف', detail: item.reason, actor: item.requestedBy?.fullName, meta: item.status }));
  add(history.memberships, 'حلقة', item => ({ at: item.startedAt, title: `التحاق بحلقة ${item.circle?.name ?? ''}`, detail: item.reason }));
  return entries.filter(item => Number.isFinite(Date.parse(item.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export default function StudentTimeline({ history, examRequests, preview = false }: { history: any; examRequests: any[]; preview?: boolean }) {
  const [filter, setFilter] = useState('الكل');
  const entries = entriesFor(history, examRequests);
  const kinds = ['الكل', ...new Set(entries.map(item => item.kind))];
  const visible = entries.filter(item => filter === 'الكل' || item.kind === filter).slice(0, preview ? 4 : 60);
  return <Card title={preview ? 'رحلة الطالب' : 'التسلسل الزمني للطالب'} subtitle={preview ? 'آخر الأحداث في ملف الطالب' : 'آخر الإجراءات والتقدم في مكان واحد'} className="mb-5">
    {!preview && <div className="mb-4 flex flex-wrap gap-2" aria-label="تصفية سجل الطالب">{kinds.map(kind => <button key={kind} type="button" onClick={() => setFilter(kind)} aria-pressed={filter === kind} className={`min-h-10 rounded-full border px-3 text-xs font-bold ${filter === kind ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>{kind}</button>)}</div>}
    {visible.length ? <ol className="border-r-2 border-emerald-100 pr-4">{visible.map(item => <li key={item.id} className="relative mb-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3 before:absolute before:-right-[23px] before:top-5 before:h-3 before:w-3 before:rounded-full before:bg-emerald-600">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><span className="text-[11px] font-bold text-emerald-700">{item.kind}</span><h3 className="text-sm font-bold text-slate-800">{item.title}</h3></div><time className="text-xs text-slate-500">{formatDateTime(item.at)}</time></div>
      {item.detail && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{item.detail}</p>}
      {(item.actor || item.meta) && <p className="mt-2 text-xs text-slate-500">{[item.actor, item.meta].filter(Boolean).join(' · ')}</p>}
    </li>)}</ol> : <EmptyState title="لا توجد أحداث في هذا القسم" />}
  </Card>;
}
