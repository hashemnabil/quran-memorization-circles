import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, Input, Modal, Textarea, Select } from '@/components/ui';
import { calculateExamGrade } from '@/lib/exam-scoring';
import type { Exam } from '@/types';

export function ExamResultDialog({exam,onClose}:{exam:Exam;onClose:()=>void}) {
  const client=useQueryClient();
  const settings=useQuery({queryKey:['exam-grading-settings'],queryFn:async()=> (await api.get<{mistakePenalty:number;alertPenalty:number}>('/exams/grading-settings')).data});
  const penalties=settings.data??{mistakePenalty:1,alertPenalty:0.5}; const [mode,setMode]=useState('calculated');
  const [draft,setDraft]=useState({mistakes:0,alerts:0,mistakePenalty:1,alertPenalty:0.5,tajweed:10});
  const [manual,setManual]=useState(''); const [notes,setNotes]=useState(''); const [sectionScores,setSectionScores]=useState<Record<string,string>>({});
  const sections=exam.sections?.length?exam.sections.map(row=>row.section):[exam.section]; const grouped=sections.length>1&&!exam.combinedStage;
  let calculated:ReturnType<typeof calculateExamGrade>|undefined;
  try{calculated=calculateExamGrade({...draft,...penalties});}catch{ /* Invalid input is shown below, never submitted. */ }
  const manualScores=sections.map(section=>({sectionId:section.id,score:sectionScores[section.id]===''||sectionScores[section.id]===undefined?NaN:Number(sectionScores[section.id])}));
  const score=mode==='calculated'?calculated?.score:grouped?manualScores.reduce((sum,row)=>sum+row.score,0)/manualScores.length:manual===''?NaN:Number(manual);
  const valid=score!==undefined&&Number.isFinite(score)&&score>=0&&score<=100&&(mode==='calculated'||!grouped||manualScores.every(row=>row.score>=0&&row.score<=100));
  const save=useMutation({mutationFn:()=>api.patch(`/exams/${exam.id}/result`,{score:Math.round((score||0)*100)/100,notes:notes||undefined,...(mode==='calculated'?{...draft,...penalties}:{sectionScores:grouped?manualScores:undefined})}),onSuccess:()=>{toast.success('تم حفظ النتيجة');void client.invalidateQueries();onClose();},onError:error=>toast.error(apiError(error))});
  return <Modal open onClose={onClose} title={`رصد نتيجة ${exam.student.fullName}`} size="lg"><form className="space-y-4" onSubmit={e=>{e.preventDefault();if(valid)save.mutate();}}><Select label="طريقة الرصد" value={mode} onChange={e=>setMode(e.target.value)}><option value="calculated">الأخطاء والتنبيهات والأحكام</option><option value="manual">إدخال درجة مسجلة سابقًا</option></Select>
    {mode==='calculated'?<><div className="grid grid-cols-2 gap-3">{([{key:'mistakes',label:'عدد الأخطاء',max:500,step:1},{key:'alerts',label:'عدد التنبيهات',max:500,step:1},{key:'tajweed',label:'علامة الأحكام من 10',max:10,step:0.25}] as const).map(field=><Input key={field.key} label={field.label} type="number" min={0} max={field.max} step={field.step} value={draft[field.key]} onChange={e=>setDraft(row=>({...row,[field.key]:e.target.value===''?NaN:Number(e.target.value)}))} required/>)}</div><p className="text-sm text-slate-600">خصم الخطأ: {penalties.mistakePenalty} · خصم التنبيه: {penalties.alertPenalty}</p><div className="flex gap-3"><Button type="button" variant="secondary" onClick={()=>setDraft(row=>({...row,mistakes:Math.min(500,row.mistakes+1)}))}>خطأ +</Button><Button type="button" variant="secondary" onClick={()=>setDraft(row=>({...row,alerts:Math.min(500,row.alerts+1)}))}>تنبيه +</Button></div><p className="text-sm">التسميع: {calculated?.recitation??'—'} / 90 · الأحكام: {calculated?.tajweed??'—'} / 10</p></>:grouped?sections.map(section=><Input key={section.id} label={section.name} type="number" min={0} max={100} step="0.01" required value={sectionScores[section.id]??''} onChange={e=>setSectionScores(row=>({...row,[section.id]:e.target.value}))}/>):<Input label="الدرجة من 100" type="number" min={0} max={100} step="0.01" value={manual} onChange={e=>setManual(e.target.value)} required/>}
    <Card><p className="text-xl font-bold">النتيجة: {valid?`${Math.round((score||0)*100)/100} / 100`:'—'}</p><p className={valid&&(score||0)>=80?'text-emerald-700':'text-red-700'}>{valid?((score||0)>=80?'مجتاز':'غير مجتاز — يمكن للمحفظ تقديم محاولة جديدة'):'أكمل قيم العلامة'}</p><p className="text-xs text-slate-500">الاجتياز من 80</p></Card><Textarea label="ملاحظات" value={notes} onChange={e=>setNotes(e.target.value)}/><Button type="submit" loading={save.isPending} disabled={!valid||(mode==='calculated'&&settings.isLoading)}>حفظ النتيجة</Button></form></Modal>;
}
