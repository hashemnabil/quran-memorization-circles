import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, PageHeader, Textarea } from '@/components/ui';
import { IconPlus, IconX } from '@/components/ui/Icons';

type Committee = { id:string; number:string; date:string; weekday:string; location:string; members:string; notes:string; createdAt:string };
type Mark = { id:string; student:string; hizbJuz:string; judgments:number; recitation:number; mistakes:number; alerts:number; note:string; date:string; score:number; committeeId:string };
const COMMITTEES_KEY='indibat.committees.v1';
const MARKS_KEY='indibat.committee-marks.v1';
const weekdays=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const load=<T,>(key:string):T[]=>{try{const x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch{return []}};
const dl=(name:string,text:string)=>{const u=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)};
export default function CommitteesPage(){
 const [committees,setCommittees]=useState<Committee[]>(()=>load(COMMITTEES_KEY));
 const [marks,setMarks]=useState<Mark[]>(()=>load(MARKS_KEY));
 const [editing,setEditing]=useState<Committee|null>(null);
 const [active,setActive]=useState<Committee|null>(null);
 const [student,setStudent]=useState(''); const [scope,setScope]=useState(''); const [judgments,setJudgments]=useState('10'); const [recitation,setRecitation]=useState('90'); const [mistakes,setMistakes]=useState('0'); const [alerts,setAlerts]=useState('0'); const [note,setNote]=useState('');
 const [mistakePenalty,setMistakePenalty]=useState('1'); const [alertPenalty,setAlertPenalty]=useState('0.5'); const [threshold,setThreshold]=useState('80');
 useEffect(()=>localStorage.setItem(COMMITTEES_KEY,JSON.stringify(committees)),[committees]);
 useEffect(()=>localStorage.setItem(MARKS_KEY,JSON.stringify(marks)),[marks]);
 const total=useMemo(()=>Math.max(0,Math.min(10,Number(judgments)||0))+Math.max(0,Math.min(90,Number(recitation)||0))-Math.max(0,Number(mistakes)||0)*Math.max(0,Number(mistakePenalty)||0)-Math.max(0,Number(alerts)||0)*Math.max(0,Number(alertPenalty)||0),[judgments,recitation,mistakes,alerts,mistakePenalty,alertPenalty]);
 const saveCommittee=()=>{if(!editing?.number.trim()||!editing.date)return;const c={...editing,weekday:weekdays[new Date(editing.date+'T12:00:00').getDay()]};setCommittees(xs=>[c,...xs.filter(x=>x.id!==c.id)]);setEditing(null)};
 const saveMark=()=>{if(!active||!student.trim())return;setMarks(xs=>[{id:crypto.randomUUID(),student:student.trim(),hizbJuz:scope.trim(),judgments:Number(judgments)||0,recitation:Number(recitation)||0,mistakes:Number(mistakes)||0,alerts:Number(alerts)||0,note,date:new Date().toISOString(),score:Math.round(total*100)/100,committeeId:active.id},...xs]);setStudent('');setScope('');setJudgments('10');setRecitation('90');setMistakes('0');setAlerts('0');setNote('')};
 const activeMarks=marks.filter(m=>m.committeeId===active?.id);
 return <main dir="rtl" className="space-y-5">
 <PageHeader title="لجان الاختبارات" subtitle="إنشاء اللجان، حفظ بياناتها، ورصد الدرجات والأخطاء والتنبيهات محليًا دون إنترنت." action={<Button icon={<IconPlus size={16}/>} onClick={()=>setEditing({id:crypto.randomUUID(),number:String(committees.length+1),date:new Date().toISOString().slice(0,10),weekday:weekdays[new Date().getDay()],location:'',members:'',notes:'',createdAt:new Date().toISOString()})}>إنشاء لجنة</Button>}/>
 <div className="grid gap-3 sm:grid-cols-3">
 <Card><Input label="خصم الخطأ" type="number" min="0" value={mistakePenalty} onChange={e=>setMistakePenalty(e.target.value)}/></Card>
 <Card><Input label="خصم التنبيه" type="number" min="0" value={alertPenalty} onChange={e=>setAlertPenalty(e.target.value)}/></Card>
 <Card><Input label="حد الاجتياز من 100" type="number" min="0" max="100" value={threshold} onChange={e=>setThreshold(e.target.value)}/></Card>
 </div>
 {editing&&<Card title="بيانات اللجنة"><div className="grid gap-3 md:grid-cols-2">
 <Input label="رقم اللجنة" required value={editing.number} onChange={e=>setEditing({...editing,number:e.target.value})}/>
 <Input label="التاريخ" type="date" required value={editing.date} onChange={e=>setEditing({...editing,date:e.target.value,weekday:weekdays[new Date(e.target.value+'T12:00:00').getDay()]})}/>
 <Input label="اليوم" disabled value={weekdays[new Date(editing.date+'T12:00:00').getDay()]}/>
 <Input label="المكان" value={editing.location} onChange={e=>setEditing({...editing,location:e.target.value})}/>
 <Textarea label="أعضاء اللجنة" value={editing.members} onChange={e=>setEditing({...editing,members:e.target.value})}/>
 <Textarea label="ملاحظات" value={editing.notes} onChange={e=>setEditing({...editing,notes:e.target.value})}/>
 </div><div className="mt-3 flex gap-2"><Button onClick={saveCommittee} disabled={!editing.number.trim()||!editing.date}>حفظ اللجنة</Button><Button variant="secondary" onClick={()=>setEditing(null)}>إلغاء</Button></div></Card>}
 {active&&<Card title={`رصد اللجنة رقم ${active.number}`}>
 <p className="mb-3 text-sm text-slate-500">{active.date} · {active.location||'المكان غير محدد'} · {active.members||'الأعضاء غير محددين'}</p>
 <div className="grid gap-3 md:grid-cols-2">
 <Input label="اسم الطالب" required value={student} onChange={e=>setStudent(e.target.value)}/><Input label="الحزب / الجزء / المجمّعة" value={scope} onChange={e=>setScope(e.target.value)}/>
 <Input label="الأحكام من 10" type="number" min="0" max="10" value={judgments} onChange={e=>setJudgments(e.target.value)}/><Input label="التسميع من 90" type="number" min="0" max="90" value={recitation} onChange={e=>setRecitation(e.target.value)}/>
 <Input label="عدد الأخطاء" type="number" min="0" value={mistakes} onChange={e=>setMistakes(e.target.value)}/><Input label="عدد التنبيهات" type="number" min="0" value={alerts} onChange={e=>setAlerts(e.target.value)}/>
 <Textarea label="ملاحظات الرصد" value={note} onChange={e=>setNote(e.target.value)}/>
 </div>
 <div className="my-4 rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-600">العلامة بعد الخصومات</p><p className="text-3xl font-extrabold">{total.toFixed(2)} / 100</p><p className={total>=Number(threshold)?'font-bold text-emerald-700':'font-bold text-red-700'}>{total>=Number(threshold)?'مجتاز':'غير مجتاز'} (حد الاجتياز {threshold})</p></div>
 <div className="flex gap-2"><Button onClick={saveMark} disabled={!student.trim()}>حفظ الرصد</Button><Button variant="secondary" onClick={()=>dl(`لجنة-${active.number}-الرصد.json`,JSON.stringify(activeMarks,null,2))}>تصدير رصد اللجنة</Button><Button variant="secondary" onClick={()=>setActive(null)}>إغلاق الرصد</Button></div>
 <div className="mt-4 overflow-x-auto"><table className="table"><thead><tr><th>الطالب</th><th>المطلوب</th><th>الأحكام</th><th>التسميع</th><th>الأخطاء</th><th>التنبيهات</th><th>النتيجة</th><th>الحالة</th></tr></thead><tbody>{activeMarks.map(m=>{const score=Math.max(0,m.judgments+m.recitation-m.mistakes*Number(mistakePenalty)-m.alerts*Number(alertPenalty));return <tr key={m.id}><td>{m.student}</td><td>{m.hizbJuz||'—'}</td><td>{m.judgments}/10</td><td>{m.recitation}/90</td><td>{m.mistakes}</td><td>{m.alerts}</td><td>{score.toFixed(2)}</td><td>{score>=Number(threshold)?'مجتاز':'غير مجتاز'}</td></tr>})}</tbody></table></div>
 </Card>}
 <div className="grid gap-3 md:grid-cols-2">{[...committees].sort((a,b)=>b.date.localeCompare(a.date)).map(c=><Card key={c.id} title={`لجنة رقم ${c.number}`}><p className="text-sm text-slate-600">{c.date} — {weekdays[new Date(c.date+'T12:00:00').getDay()]}</p><p className="mt-1 text-sm">المكان: {c.location||'—'}</p><p className="mt-1 text-sm">الأعضاء: {c.members||'—'}</p><p className="mt-1 text-sm">عدد الرصد: {marks.filter(m=>m.committeeId===c.id).length}</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={()=>setActive(c)}>فتح اللجنة والرصد</Button><Button size="sm" variant="secondary" onClick={()=>setEditing({...c})}>تعديل</Button><Button size="sm" variant="secondary" onClick={()=>dl(`اللجنة-${c.number}.json`,JSON.stringify({committee:c,marks:marks.filter(m=>m.committeeId===c.id)},null,2))}>تصدير</Button><Button size="sm" variant="danger" onClick={()=>{if(window.confirm('حذف اللجنة؟'))setCommittees(xs=>xs.filter(x=>x.id!==c.id))}}><IconX size={14}/> حذف</Button></div></Card>)}</div>
 {!committees.length&&<Card><p className="py-8 text-center text-slate-500">لا توجد لجان محفوظة بعد. أنشئ أول لجنة للبدء.</p></Card>}
 <Button variant="secondary" onClick={()=>dl('أرشيف-اللجان.json',JSON.stringify({committees,marks},null,2))}>تصدير أرشيف جميع اللجان</Button>
 </main>
}
