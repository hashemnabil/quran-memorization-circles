import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button, Card, ErrorState, Input, LoadingState, Modal, ProgressBar, Select, Textarea } from '@/components/ui';
import { IconBook, IconCheck } from '@/components/ui/Icons';

const UNITS = {VERSES: 'آيات', PAGES: 'صفحات', SURAHS: 'سور', JUZ: 'أجزاء', TASKS: 'مهام'};
const PERIODS = {WEEKLY: 'أسبوعية', MONTHLY: 'شهرية', GOAL: 'حسب الهدف'};
type Plan = {id: string; title: string; unit: keyof typeof UNITS; period: keyof typeof PERIODS; target: number; completed: number; dueAt: string | null; archived: boolean; logs: {id: string; amount: number; note: string; createdAt: string; recorderName: string}[]};
type Draft = {title: string; unit: keyof typeof UNITS; period: keyof typeof PERIODS; target: string; dueAt: string};
const EMPTY: Draft = {title: '', unit: 'PAGES', period: 'WEEKLY', target: '', dueAt: ''};

export default function MemorizationPlans({studentId}: {studentId: string}) {
  const role = useAuthStore(state => state.user?.role);
  const canManage = ['ADMIN', 'SUPERVISOR', 'TEACHER'].includes(role || '');
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<Plan | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [progress, setProgress] = useState<Plan | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [days, setDays] = useState('1');
  const rangeUnits = ['VERSES', 'PAGES', 'SURAHS', 'JUZ'];
  const hasRange = !!progress && rangeUnits.includes(progress.unit);
  const rangeCount = hasRange && Number.isInteger(Number(rangeStart)) && Number.isInteger(Number(rangeEnd)) && Number(rangeStart) > 0 && Number(rangeEnd) >= Number(rangeStart) ? Number(rangeEnd) - Number(rangeStart) + 1 : 0;
  const [requestId, setRequestId] = useState('');
  const [history, setHistory] = useState(false);
  const plans = useQuery({queryKey: ['students', studentId, 'plans'], queryFn: async () => {
    const {data} = await api.get<Plan[]>(`/students/${studentId}/plans`);
    if (!Array.isArray(data)) throw new Error('استجابة خطط الحفظ غير صالحة');
    return data;
  }});
  const refresh = () => { void queryClient.invalidateQueries({queryKey: ['students', studentId, 'plans']}); };
  const save = useMutation({
    mutationFn: async () => {
      const body = {...draft, target: Number(draft.target), dueAt: draft.dueAt || null};
      return editor === 'new' ? api.post(`/students/${studentId}/plans`, body) : api.patch(`/students/${studentId}/plans/${(editor as Plan).id}`, body);
    }, onSuccess: () => { setEditor(null); refresh(); toast.success('تم حفظ الخطة'); }, onError: error => toast.error(apiError(error)),
  });
  const addProgress = useMutation({
    mutationFn: () => api.post(`/students/${studentId}/plans/${progress!.id}/progress`, {amount: hasRange ? rangeCount : Number(amount), note: [hasRange ? `${UNITS[progress!.unit]} من ${rangeStart} إلى ${rangeEnd}` : '', `أيام الإنجاز: ${days}`, note].filter(Boolean).join(' | '), requestId}),
    onSuccess: response => { setProgress(null); refresh(); toast.success(response.data.completed >= response.data.target ? 'مبارك! أتممت الخطة بنجاح' : 'تم اعتماد الإنجاز'); },
    onError: error => toast.error(apiError(error)),
  });
  const archive = useMutation({
    mutationFn: (plan: Plan) => api.patch(`/students/${studentId}/plans/${plan.id}`, {...plan, archived: !plan.archived}),
    onSuccess: refresh, onError: error => toast.error(apiError(error)),
  });
  const openEditor = (plan: Plan | 'new') => { setEditor(plan); setDraft(plan === 'new' ? EMPTY : {title: plan.title, unit: plan.unit, period: plan.period, target: String(plan.target), dueAt: plan.dueAt?.slice(0,10) || ''}); };
  return <Card className="mb-5 memorization-plans" title="خطط الحفظ والمراجعة" subtitle="خطوات صغيرة، وإنجاز يزداد كل يوم" action={canManage && <Button size="sm" onClick={() => openEditor('new')} icon={<IconBook size={16}/>}>خطة جديدة</Button>}>
    {plans.isLoading ? <LoadingState rows={2}/> : plans.isError ? <ErrorState message="تعذر تحميل الخطط. تحقق من الاتصال بالخادم." onRetry={()=>void plans.refetch()}/> : <>
      <div className="mb-5 flex gap-2" role="group" aria-label="عرض الخطط"><Button variant={!history ? 'primary' : 'secondary'} size="sm" aria-pressed={!history} onClick={()=>setHistory(false)}>الخطط النشطة</Button><Button variant={history ? 'primary' : 'secondary'} size="sm" aria-pressed={history} onClick={()=>setHistory(true)}>سجل الخطط</Button></div>
      <div className="grid gap-4 xl:grid-cols-2">{plans.data?.filter(plan => history ? plan.archived || plan.completed >= plan.target : !plan.archived && plan.completed < plan.target).map(plan => {
        const percent = Math.min(100, Math.round(plan.completed / plan.target * 100));
        return <section key={plan.id} className={`plan-card ${percent === 100 ? 'plan-complete' : ''}`}>
          <div className="flex items-center gap-4"><div className="plan-ring" role="progressbar" aria-label={plan.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} style={{background: `conic-gradient(var(--emerald) ${percent}%, var(--sage) 0)`}}><span>{percent === 100 ? <IconCheck size={25}/> : `${percent}٪`}</span></div><div className="min-w-0"><h3 className="font-bold">{plan.title}</h3><p className="text-xs text-slate-500">{PERIODS[plan.period]}{plan.dueAt ? ` · حتى ${new Date(plan.dueAt).toLocaleDateString('ar')}` : ''}</p></div></div>
          <div className="my-4"><ProgressBar value={percent}/><p className="mt-2 text-xs text-slate-500">المنجز {plan.completed} من {plan.target} {UNITS[plan.unit]} · المتبقي {Math.max(0, plan.target - plan.completed)}</p></div>
          {canManage && <div className="flex flex-wrap gap-2">{!plan.archived && percent < 100 && <Button size="sm" onClick={()=>{setProgress(plan); setAmount(''); setNote(''); setRangeStart(''); setRangeEnd(''); setDays('1'); setRequestId(crypto.randomUUID());}}>تسجيل إنجاز</Button>}<Button size="sm" variant="secondary" onClick={()=>openEditor(plan)}>تعديل</Button><Button size="sm" variant="ghost" disabled={archive.isPending} onClick={()=>archive.mutate(plan)}>{plan.archived ? 'استعادة' : 'أرشفة'}</Button></div>}
          <details className="mt-4 border-t border-slate-100 pt-3"><summary className="cursor-pointer py-2 text-xs font-bold">سجل تحديثات الإنجاز ({plan.logs.length})</summary><div className="max-h-64 space-y-3 overflow-y-auto pt-3">{plan.logs.map(log=><div key={log.id} className="text-xs"><strong>+{log.amount} {UNITS[plan.unit]} · {log.recorderName}</strong><time className="block text-slate-500">{new Date(log.createdAt).toLocaleString('ar')}</time>{log.note && <p className="mt-1 whitespace-pre-wrap">{log.note}</p>}</div>)}{!plan.logs.length && <p className="text-xs text-slate-500">لا توجد تحديثات بعد.</p>}</div></details>
        </section>;
      })}</div>
      {!plans.data?.some(plan=>history ? plan.archived || plan.completed >= plan.target : !plan.archived && plan.completed < plan.target) && <p className="py-6 text-center text-sm text-slate-500">{history ? 'لا توجد خطط سابقة بعد.' : 'لا توجد خطط نشطة. يضع المسؤول عن الطالب خطة الحفظ المناسبة.'}</p>}
    </>}
    <Modal open={!!editor} onClose={()=>{if(!save.isPending)setEditor(null);}} title={editor === 'new' ? 'خطة حفظ جديدة' : 'تعديل الخطة'}>
      <form className="space-y-4" onSubmit={event=>{event.preventDefault(); save.mutate();}}><Input label="عنوان الخطة" required maxLength={160} value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/><div className="grid gap-4 sm:grid-cols-2"><Select label="المدة" value={draft.period} onChange={event=>setDraft({...draft,period:event.target.value as Draft['period']})}>{Object.entries(PERIODS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</Select><Select label="وحدة القياس" value={draft.unit} onChange={event=>setDraft({...draft,unit:event.target.value as Draft['unit']})}>{Object.entries(UNITS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</Select><Input label="الهدف" type="number" required min="0.01" max="1000000" step="any" value={draft.target} onChange={event=>setDraft({...draft,target:event.target.value})}/><Input label="تاريخ النهاية (اختياري)" type="date" value={draft.dueAt} onChange={event=>setDraft({...draft,dueAt:event.target.value})}/></div><Button type="submit" loading={save.isPending}>حفظ الخطة</Button></form>
    </Modal>
    <Modal open={!!progress} onClose={()=>{if(!addProgress.isPending)setProgress(null);}} title="تسجيل الإنجاز واعتماده">
      <form className="space-y-4" onSubmit={event=>{event.preventDefault(); addProgress.mutate();}}><p className="text-sm">{progress?.title} · المتبقي {progress ? progress.target-progress.completed : 0} {progress && UNITS[progress.unit]}</p>{hasRange ? <div className="grid grid-cols-2 gap-3"><Input label={`من ${UNITS[progress!.unit]} رقم`} type="number" min="1" step="1" required value={rangeStart} onChange={event=>setRangeStart(event.target.value)}/><Input label={`إلى ${UNITS[progress!.unit]} رقم`} type="number" min={rangeStart || "1"} step="1" required value={rangeEnd} onChange={event=>setRangeEnd(event.target.value)}/><p className="col-span-2 text-sm">الكمية المحسوبة: {rangeCount} {UNITS[progress!.unit]}</p></div> : <Input label="الكمية المنجزة" type="number" min="0.01" step="any" max={progress ? progress.target-progress.completed : undefined} required value={amount} onChange={event=>setAmount(event.target.value)}/>}<Input label="عدد أيام الإنجاز" type="number" min="1" step="1" required value={days} onChange={event=>setDays(event.target.value)}/><Textarea label="ملاحظة (اختياري)" maxLength={500} value={note} onChange={event=>setNote(event.target.value)}/><Button type="submit" loading={addProgress.isPending} disabled={(!hasRange && (!amount || Number(amount)<=0)) || (hasRange && (!rangeCount || rangeCount > (progress!.target-progress!.completed))) || !Number.isInteger(Number(days)) || Number(days)<1}>اعتماد الإنجاز</Button></form>
    </Modal>
  </Card>;
}
