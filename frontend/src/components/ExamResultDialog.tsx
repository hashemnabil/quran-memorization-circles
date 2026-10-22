import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, Input, Modal, Textarea, Select } from '@/components/ui';
import { calculateExamGrade } from '@/lib/exam-scoring';
import type { Exam } from '@/types';

export function ExamResultDialog({exam,onClose}:{exam:Exam;onClose:()=>void}) {
  const client=useQueryClient(); const [mode,setMode]=useState('calculated');
  const [draft,setDraft]=useState({mistakes:0,alerts:0,mistakePenalty:1,alertPenalty:0.5,tajweed:10});
  const [manual,setManual]=useState(''); const [notes,setNotes]=useState(''); const [sectionScores,setSectionScores]=useState<Record<string,string>>({});
  const sections=exam.sections?.length?exam.sections.map(row=>row.section):[exam.section]; const grouped=sections.length>1&&!exam.combinedStage;
  let calculated:ReturnType<typeof calculateExamGrade>|undefined;
  try{calculated=calculateExamGrade(draft);}catch{ /* Invalid input is shown below, never submitted. */ }
  const manualScores=sections.map(section=>({sectionId:section.id,score:sectionScores[section.id]===''||sectionScores[section.id]===undefined?NaN:Number(sectionScores[section.id])}));
  const score=mode==='calculated'?calculated?.score:grouped?manualScores.reduce((sum,row)=>sum+row.score,0)/manualScores.length:manual===''?NaN:Number(manual);
  const valid=score!==undefined&&Number.isFinite(score)&&score>=0&&score<=100&&(mode==='calculated'||!grouped||manualScores.every(row=>row.score>=0&&row.score<=100));
  const save=useMutation({mutationFn:()=>api.patch(`/exams/${exam.id}/result`,{score:Math.round((score||0)*100)/100,notes:notes||undefined,...(mode==='calculated'?draft:{sectionScores:grouped?manualScores:undefined})}),onSuccess:()=>{toast.success('طھظ… ط­ظپط¸ ط§ظ„ظ†طھظٹط¬ط©');void client.invalidateQueries();onClose();},onError:error=>toast.error(apiError(error))});
  return <Modal open onClose={onClose} title={`ط±طµط¯ ظ†طھظٹط¬ط© ${exam.student.fullName}`} size="lg"><form className="space-y-4" onSubmit={e=>{e.preventDefault();if(valid)save.mutate();}}><Select label="ط·ط±ظٹظ‚ط© ط§ظ„ط±طµط¯" value={mode} onChange={e=>setMode(e.target.value)}><option value="calculated">ط§ظ„ط£ط®ط·ط§ط، ظˆط§ظ„طھظ†ط¨ظٹظ‡ط§طھ ظˆط§ظ„ط£ط­ظƒط§ظ…</option><option value="manual">ط¥ط¯ط®ط§ظ„ ط¯ط±ط¬ط© ظ…ط³ط¬ظ„ط© ط³ط§ط¨ظ‚ظ‹ط§</option></Select>
    {mode==='calculated'?<><div className="grid grid-cols-2 gap-3">{([{key:'mistakes',label:'ط¹ط¯ط¯ ط§ظ„ط£ط®ط·ط§ط،',max:500,step:1},{key:'alerts',label:'ط¹ط¯ط¯ ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ',max:500,step:1},{key:'mistakePenalty',label:'ط®طµظ… ط§ظ„ط®ط·ط£',max:90,step:0.25},{key:'alertPenalty',label:'ط®طµظ… ط§ظ„طھظ†ط¨ظٹظ‡',max:90,step:0.25},{key:'tajweed',label:'ط¹ظ„ط§ظ…ط© ط§ظ„ط£ط­ظƒط§ظ… ظ…ظ† 10',max:10,step:0.25}] as const).map(field=><Input key={field.key} label={field.label} type="number" min={0} max={field.max} step={field.step} value={draft[field.key]} onChange={e=>setDraft(row=>({...row,[field.key]:e.target.value===''?NaN:Number(e.target.value)}))} required/>)}</div><div className="flex gap-3"><Button type="button" variant="secondary" onClick={()=>setDraft(row=>({...row,mistakes:Math.min(500,row.mistakes+1)}))}>ط®ط·ط£ +</Button><Button type="button" variant="secondary" onClick={()=>setDraft(row=>({...row,alerts:Math.min(500,row.alerts+1)}))}>طھظ†ط¨ظٹظ‡ +</Button></div><p className="text-sm">ط§ظ„طھط³ظ…ظٹط¹: {calculated?.recitation??'â€”'} / 90 آ· ط§ظ„ط£ط­ظƒط§ظ…: {calculated?.tajweed??'â€”'} / 10</p></>:grouped?sections.map(section=><Input key={section.id} label={section.name} type="number" min={0} max={100} step="0.01" required value={sectionScores[section.id]??''} onChange={e=>setSectionScores(row=>({...row,[section.id]:e.target.value}))}/>):<Input label="ط§ظ„ط¯ط±ط¬ط© ظ…ظ† 100" type="number" min={0} max={100} step="0.01" value={manual} onChange={e=>setManual(e.target.value)} required/>}
    <Card><p className="text-xl font-bold">ط§ظ„ظ†طھظٹط¬ط©: {valid?`${Math.round((score||0)*100)/100} / 100`:'â€”'}</p><p className={valid&&(score||0)>=80?'text-emerald-700':'text-red-700'}>{valid?((score||0)>=80?'ظ…ط¬طھط§ط²':'ط؛ظٹط± ظ…ط¬طھط§ط² â€” ظٹظ…ظƒظ† ظ„ظ„ظ…ط­ظپط¸ طھظ‚ط¯ظٹظ… ظ…ط­ط§ظˆظ„ط© ط¬ط¯ظٹط¯ط©'):'ط£ظƒظ…ظ„ ظ‚ظٹظ… ط§ظ„ط¹ظ„ط§ظ…ط©'}</p><p className="text-xs text-slate-500">ط§ظ„ط§ط¬طھظٹط§ط² ظ…ظ† 80</p></Card><Textarea label="ظ…ظ„ط§ط­ط¸ط§طھ" value={notes} onChange={e=>setNotes(e.target.value)}/><Button type="submit" loading={save.isPending} disabled={!valid}>ط­ظپط¸ ط§ظ„ظ†طھظٹط¬ط©</Button></form></Modal>;
}

