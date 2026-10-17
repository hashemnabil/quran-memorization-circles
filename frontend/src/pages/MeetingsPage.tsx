import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, PageHeader, Textarea } from '@/components/ui';
import { IconCalendar, IconPlus, IconX } from '@/components/ui/Icons';

type MeetingSection = { id: string; title: string; details: string; presenter: string; department: string };
type Meeting = { id: string; title: string; date: string; weekday: string; attendees: string; notes: string; sections: MeetingSection[]; createdAt: string };
const STORAGE_KEY = 'indibat.meetings.v1';
const weekdays = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const emptySection = (): MeetingSection => ({ id: crypto.randomUUID(), title: '', details: '', presenter: '', department: '' });
const emptyMeeting = (): Meeting => ({ id: crypto.randomUUID(), title: '', date: new Date().toISOString().slice(0,10), weekday: weekdays[new Date().getDay()], attendees: '', notes: '', sections: [emptySection()], createdAt: new Date().toISOString() });
function readMeetings(): Meeting[] { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function download(name: string, content: string, type: string) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>(readMeetings);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings)); }, [meetings]);
  const filtered = useMemo(() => meetings.filter(m => (m.title + ' ' + m.date + ' ' + m.attendees).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date)), [meetings, search]);
  const save = () => {
    if (!editing?.title.trim() || !editing.date) return;
    const meeting = { ...editing, weekday: weekdays[new Date(editing.date + 'T12:00:00').getDay()] };
    setMeetings(current => [meeting, ...current.filter(m => m.id !== meeting.id)]);
    setEditing(null);
  };
  const exportMeeting = (m: Meeting) => download(`meeting-${m.date}.json`, JSON.stringify(m, null, 2), 'application/json;charset=utf-8');
  return <main className="space-y-5" dir="rtl">
    <PageHeader title="محاضر الاجتماعات" subtitle="سجل مستقل لكل اجتماع، محفوظ على هذا الجهاز ويعمل دون إنترنت." action={<Button icon={<IconPlus size={16}/>} onClick={()=>setEditing(emptyMeeting())}>إضافة اجتماع</Button>} />
    <div className="flex flex-wrap gap-2 print:hidden">
      <Input label="بحث في الاجتماعات" placeholder="عنوان الاجتماع أو التاريخ أو الحضور" value={search} onChange={e=>setSearch(e.target.value)} />
      <Button variant="secondary" onClick={()=>download('محاضر-الاجتماعات.json', JSON.stringify(meetings,null,2), 'application/json;charset=utf-8')}>تصدير كل الاجتماعات</Button>
      <Button variant="secondary" onClick={()=>window.print()}>طباعة / حفظ PDF</Button>
    </div>
    {editing && <Card title={meetings.some(m=>m.id===editing.id)?'تعديل الاجتماع':'اجتماع جديد'}>
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="عنوان الاجتماع" required value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/>
        <Input label="التاريخ" type="date" required value={editing.date} onChange={e=>setEditing({...editing,date:e.target.value,weekday:weekdays[new Date(e.target.value+'T12:00:00').getDay()]})}/>
        <Input label="اليوم" value={weekdays[new Date(editing.date+'T12:00:00').getDay()]} disabled />
        <Input label="الحاضرون" placeholder="افصل الأسماء بفاصلة" value={editing.attendees} onChange={e=>setEditing({...editing,attendees:e.target.value})}/>
      </div>
      <div className="my-4 space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-bold">أقسام الاجتماع ومحاوره</h3><Button size="sm" variant="secondary" onClick={()=>setEditing({...editing,sections:[...editing.sections,emptySection()]})}>إضافة قسم</Button></div>
        {editing.sections.map((s,i)=><div key={s.id} className="rounded-xl border border-slate-200 p-3 space-y-3">
          <div className="flex items-center justify-between"><strong>القسم {i+1}</strong><button type="button" aria-label="حذف القسم" className="text-red-600" onClick={()=>setEditing({...editing,sections:editing.sections.filter(x=>x.id!==s.id)})}><IconX size={17}/></button></div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="اسم القسم" value={s.title} onChange={e=>setEditing({...editing,sections:editing.sections.map(x=>x.id===s.id?{...x,title:e.target.value}:x)})}/>
            <Input label="المحاضر" value={s.presenter} onChange={e=>setEditing({...editing,sections:editing.sections.map(x=>x.id===s.id?{...x,presenter:e.target.value}:x)})}/>
            <Input label="القسم الذي شرح عنه" value={s.department} onChange={e=>setEditing({...editing,sections:editing.sections.map(x=>x.id===s.id?{...x,department:e.target.value}:x)})}/>
            <Textarea label="شرح وتفاصيل القسم" value={s.details} onChange={e=>setEditing({...editing,sections:editing.sections.map(x=>x.id===s.id?{...x,details:e.target.value}:x)})}/>
          </div>
        </div>)}
      </div>
      <Textarea label="ملاحظات الاجتماع" value={editing.notes} onChange={e=>setEditing({...editing,notes:e.target.value})}/>
      <div className="mt-4 flex gap-2"><Button onClick={save} disabled={!editing.title.trim()||!editing.date}>حفظ الاجتماع</Button><Button variant="secondary" onClick={()=>setEditing(null)}>إلغاء</Button></div>
    </Card>}
    {!filtered.length ? <Card><p className="py-8 text-center text-slate-500">لا توجد اجتماعات محفوظة. أضف اجتماعًا جديدًا للبدء.</p></Card> : filtered.map(m=><Card key={m.id} title={m.title}>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-500"><span className="inline-flex items-center gap-1"><IconCalendar size={15}/>{m.date} — {weekdays[new Date(m.date+'T12:00:00').getDay()]}</span><span>الحاضرون: {m.attendees||'—'}</span></div>
      {m.sections.map((s,i)=><section key={s.id} className="mb-3 rounded-lg bg-slate-50 p-3"><h3 className="font-bold">{i+1}. {s.title||'قسم بلا عنوان'}</h3><p className="mt-1 whitespace-pre-wrap text-sm">{s.details||'—'}</p><p className="mt-2 text-xs text-slate-500">المحاضر: {s.presenter||'—'} · القسم: {s.department||'—'}</p></section>)}
      {m.notes && <p className="mb-3 whitespace-pre-wrap text-sm"><strong>ملاحظات:</strong> {m.notes}</p>}
      <div className="flex flex-wrap gap-2 print:hidden"><Button size="sm" variant="secondary" onClick={()=>setEditing({...m,sections:m.sections.length?m.sections.map(s=>({...s})): [emptySection()]})}>تعديل</Button><Button size="sm" variant="secondary" onClick={()=>exportMeeting(m)}>تصدير الاجتماع</Button><Button size="sm" variant="secondary" onClick={()=>{setEditing({...emptyMeeting(),title:`نسخة من ${m.title}`,attendees:m.attendees,notes:m.notes,sections:m.sections.map(s=>({...s,id:crypto.randomUUID()}))});}}>نسخ اجتماع</Button><Button size="sm" variant="danger" onClick={()=>{if(window.confirm('حذف هذا الاجتماع؟'))setMeetings(current=>current.filter(x=>x.id!==m.id));}}>حذف</Button></div>
    </Card>)}
    <style>{'@media print { .print\\:hidden { display:none !important; } body { background:white !important; } }'}</style>
  </main>;
}
