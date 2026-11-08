import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import { Button, Input, Select, Modal, LoadingState } from '@/components/ui';
import { resolveRules, type LearningRules, type ErrorType } from '@/lib/learning-rules';
import toast from 'react-hot-toast';
export function LearningSettingsModal({ onClose }: {
    onClose: () => void;
}) {
    const [showAudit, setShowAudit] = useState(false);
    const [auditPage, setAuditPage] = useState(1);
    const audit = useQuery({ queryKey: ['learning-points-audit', auditPage], enabled: showAudit, queryFn: async () => (await api.get<{
            id: string;
            fullName: string;
            source: string;
            before_points: number;
            after_points: number;
            createdAt: string;
        }[]>('/recitations/points-audit', { params: { page: auditPage, limit: 25 } })).data });
    const qc = useQueryClient();
    const [circleId, setCircleId] = useState('');
    const [draft, setDraft] = useState<LearningRules>();
    const circles = useQuery({ queryKey: ['circles', 'options'], queryFn: async () => (await api.get<{
            id: string;
            name: string;
        }[]>('/circles/options')).data });
    const query = useQuery({ queryKey: ['recitations', 'learning-settings', circleId], queryFn: async () => (await api.get<LearningRules>('/recitations/learning-settings', { params: { circleId: circleId || undefined } })).data });
    useEffect(() => { setDraft(undefined); }, [circleId]);
    const value = draft ?? query.data;
    const update = (patch: Partial<LearningRules>) => setDraft({ ...resolveRules(value), ...patch });
    const save = useMutation({ mutationFn: () => api.patch('/recitations/learning-settings', value, { params: { circleId: circleId || undefined } }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['recitations'] }); toast.success('حُفظت القواعد؛ السجلات السابقة تحتفظ بتقييمها'); onClose(); }, onError: e => toast.error(apiError(e)) });
    const type = (index: number, patch: Partial<ErrorType>) => update({ types: value!.types.map((t, i) => i === index ? { ...t, ...patch } : t) });
    return <Modal open size="lg" title="قواعد التسميع والحضور والنقاط" onClose={onClose} footer={<Button onClick={() => save.mutate()} loading={save.isPending} disabled={!value || query.isError}>حفظ القواعد</Button>}>
 <Button size="sm" variant="secondary" onClick={() => setShowAudit(!showAudit)}>سجل حركات النقاط</Button>{showAudit && <section className="my-4 rounded-xl border p-3"><h3 className="mb-2 font-bold">حركات النقاط · صفحة {auditPage}</h3>{audit.isLoading ? <LoadingState /> : audit.isError ? <p role="alert">تعذر تحميل سجل النقاط</p> : <div className="max-h-64 overflow-auto"><table className="table text-xs"><thead><tr><th>الطالب</th><th>المصدر</th><th>قبل</th><th>بعد</th><th>التاريخ</th></tr></thead><tbody>{audit.data?.map(r => <tr key={r.id}><td>{r.fullName}</td><td>{{ attendance: 'الحضور', recitations: 'التسميع', surah_completions: 'إنجاز سورة' }[r.source] ?? r.source}</td><td>{r.before_points}</td><td>{r.after_points}</td><td>{new Date(r.createdAt).toLocaleDateString('ar')}</td></tr>)}</tbody></table></div>}<div className="mt-2 flex gap-2"><Button size="sm" variant="secondary" disabled={auditPage <= 1} onClick={() => setAuditPage(p => p - 1)}>السابق</Button><Button size="sm" variant="secondary" disabled={!audit.data || audit.data.length < 25} onClick={() => setAuditPage(p => p + 1)}>التالي</Button></div></section>}
 <Select label="نطاق القواعد" value={circleId} onChange={e => setCircleId(e.target.value)}><option value="">المدرسة كاملة</option>{circles.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select><p className="my-3 text-sm text-slate-500">كل تسميع يحفظ نسخة قواعده. تعديل القواعد يطبق على السجلات الجديدة فقط. قواعد الحلقة تتقدم على قواعد المدرسة.</p>
 {query.isLoading ? <LoadingState /> : !value ? <p role="alert">تعذر تحميل القواعد</p> : <div className="space-y-5">
 <div className="grid grid-cols-2 gap-3"><Select label="أساس التقييم" value={value.base} onChange={e => update({ base: e.target.value as LearningRules['base'] })}><option value="verses">نقطة لكل آية</option><option value="fixed">درجة ثابتة</option></Select><Input label="الدرجة الأساسية الثابتة" type="number" min={1} max={6236} value={value.baseMark} onChange={e => update({ baseMark: Number(e.target.value) })}/>{([['mistakePenalty', 'خصم الخطأ اليدوي'], ['warningPenalty', 'خصم التنبيه اليدوي'], ['tajweedPenalty', 'خصم الحكم اليدوي'], ['excellent', 'ممتاز من ٪'], ['veryGood', 'جيد جدًا من ٪'], ['good', 'جيد من ٪'], ['acceptable', 'مقبول من ٪']] as const).map(([key, label]) => <Input key={key} label={label} type="number" min={0} max={100} step="0.25" value={value[key]} onChange={e => update({ [key]: Number(e.target.value) })}/>)}</div>
 <h3 className="font-bold">أنواع الأخطاء والتنبيهات والأحكام</h3>{value.types.map((t, i) => <div key={t.id} className="grid gap-3 rounded-xl border bg-slate-50 p-3 sm:grid-cols-2"><Input label="اسم النوع" value={t.label} onChange={e => type(i, { label: e.target.value })}/><Select label="الفئة" value={t.category} onChange={e => type(i, { category: e.target.value as ErrorType['category'] })}><option value="mistake">خطأ</option><option value="warning">تنبيه</option><option value="tajweed">أحكام وتجويد</option></Select><Input label="الخصم" type="number" min={0} max={100} step="0.25" value={t.penalty} onChange={e => type(i, { penalty: Number(e.target.value) })}/><Select label="طريقة التسجيل" value={t.mode} onChange={e => type(i, { mode: e.target.value as ErrorType['mode'] })}><option value="both">العداد والمصحف</option><option value="mushaf">المصحف</option><option value="counter">العداد</option></Select><label className="flex items-center gap-2"><input type="checkbox" checked={t.enabled} onChange={e => type(i, { enabled: e.target.checked })}/>مفعّل</label><label className="flex items-center gap-2"><input type="checkbox" checked={t.freeFirst} onChange={e => type(i, { freeFirst: e.target.checked })}/>أول مرة دون خصم، ثم الخصم لكل تكرار</label><Button size="sm" variant="secondary" onClick={() => update({ types: value.types.filter(x => x.id !== t.id) })}>حذف النوع من القواعد الجديدة</Button></div>)}
 <Button size="sm" variant="secondary" onClick={() => update({ types: [...value.types, { id: crypto.randomUUID(), label: 'نوع جديد', category: 'mistake', penalty: 1, enabled: true, mode: 'both', freeFirst: false }] })}>إضافة نوع خطأ أو حكم</Button>
 <h3 className="font-bold">نقاط حالات الحضور</h3>{value.attendance.map((s, i) => <div key={s.id} className="grid grid-cols-2 gap-3 rounded-xl border p-3"><Input label="الحالة" value={s.label} onChange={e => update({ attendance: value.attendance.map((a, n) => n === i ? { ...a, label: e.target.value } : a) })}/><Input label="النقاط (السالب خصم)" type="number" min={-1000} max={1000} step="0.25" value={s.points} onChange={e => update({ attendance: value.attendance.map((a, n) => n === i ? { ...a, points: Number(e.target.value) } : a) })}/><label><input type="checkbox" checked={s.enabled} onChange={e => update({ attendance: value.attendance.map((a, n) => n === i ? { ...a, enabled: e.target.checked } : a) })}/> مفعّل</label></div>)}<Button variant="secondary" size="sm" onClick={() => update({ attendance: [...value.attendance, { id: crypto.randomUUID(), label: 'حالة إضافية', points: 0, enabled: true }] })}>إضافة حالة حضور</Button>
 <h3 className="font-bold">معادلة لوحة الشرف</h3><p className="text-sm">النقاط = التسميع × وزنه + الحضور × وزنه + الإنجاز × وزنه. يطبق وزن السجل عند حفظه.</p><div className="grid gap-3 sm:grid-cols-3">{([['recitation', 'وزن التسميع'], ['attendance', 'وزن الحضور'], ['achievement', 'وزن الإنجاز']] as const).map(([key, label]) => <Input key={key} label={label} type="number" min={0} max={10} step="0.25" value={value.weights[key]} onChange={e => update({ weights: { ...value.weights, [key]: Number(e.target.value) } })}/>)}</div>
 </div>}</Modal>;
}
