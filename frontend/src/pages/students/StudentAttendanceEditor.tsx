import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { notifyWriteSuccess } from '@/lib/write-feedback';
import { todayInput } from '@/lib/format';
import { ATTENDANCE_LABELS } from '@/lib/labels';
import { Button, Card, ErrorState, Input, Textarea, cx } from '@/components/ui';
import type { AttendanceRecord, AttendanceStatus, PaginatedResponse, Student } from '@/types';

export function StudentAttendanceEditor({ student }: { student: Student }) {
  const queryClient=useQueryClient();
  const [date,setDate]=useState(todayInput);
  const [status,setStatus]=useState<AttendanceStatus>('PRESENT');
  const [note,setNote]=useState('');
  const day=useQuery({
    queryKey:['attendance','student-day',student.id,date],enabled:!!date,
    queryFn:async()=>(await api.get<PaginatedResponse<AttendanceRecord>>('/attendance',{params:{studentId:student.id,from:date,to:date,limit:1}})).data,
  });
  const existing=day.data?.data[0];
  useEffect(()=>{setStatus(existing?.status??'PRESENT');setNote(existing?.note??'');},[date,existing?.id,existing?.status,existing?.note]);
  const save=useMutation({
    networkMode:'always',
    mutationFn:async():Promise<unknown>=>{
      if(!date||day.isPending||day.isError)throw new Error('اختر التاريخ وانتظر تحميل سجل اليوم');
      const entry={status,note:status==='EXCUSED'?note.trim()||undefined:undefined};
      if(existing)return api.patch('/attendance/'+existing.id,entry);
      if(!student.circleId)throw new Error('الطالب غير مرتبط بحلقة');
      return api.post('/attendance',{circleId:student.circleId,date,entries:[{studentId:student.id,...entry}]});
    },
    onSuccess:async result=>{
      notifyWriteSuccess(result,existing?'تم تعديل حضور الطالب':'تم تسجيل حضور الطالب');
      await Promise.all([queryClient.invalidateQueries({queryKey:['attendance']}),queryClient.invalidateQueries({queryKey:['students',student.id]}),queryClient.invalidateQueries({queryKey:['dashboard']})]);
    },
    onError:error=>toast.error(apiError(error,'تعذر حفظ الحضور؛ حاول مجدداً')),
  });
  return <Card title="تسجيل حضور يوم" subtitle="اختر اليوم والحالة ثم احفظ سجل الطالب.">
    <form onSubmit={event=>{event.preventDefault();save.mutate();}} className="space-y-4">
      <Input label="تاريخ الحضور" type="date" required max={todayInput()} value={date} disabled={save.isPending} onChange={event=>setDate(event.target.value)}/>
      {day.isError&&<ErrorState message="تعذر تحميل حضور اليوم" onRetry={()=>day.refetch()}/>}
      <fieldset disabled={day.isPending||day.isError||save.isPending||!date} className="space-y-3">
        <legend className="mb-2 text-sm font-bold">حالة الحضور</legend>
        <div className="flex flex-wrap gap-2">{(['PRESENT','EXCUSED','ABSENT'] as const).map(value=><button key={value} type="button" aria-pressed={status===value} onClick={()=>setStatus(value)} className={cx('min-h-11 rounded-xl border px-4 py-2 text-sm font-bold',status===value?'border-primary-600 bg-primary-50 text-primary-800':'border-slate-200 text-slate-600')}>{ATTENDANCE_LABELS[value]}</button>)}</div>
        {status==='EXCUSED'&&<Textarea label="سبب العذر" maxLength={300} rows={2} value={note} onChange={event=>setNote(event.target.value)}/>}
        <p role="status" className="text-xs text-slate-500">{day.isPending?'جارٍ تحميل سجل اليوم…':existing?'هذا اليوم مسجّل؛ سيُعدّل حضور هذا الطالب فقط.':'لا يوجد حضور مسجّل لهذا الطالب في اليوم المختار.'}</p>
        {!student.circleId&&!existing&&<p className="text-sm text-amber-700">اربط الطالب بحلقة لتسجيل حضور جديد.</p>}
        <Button type="submit" loading={save.isPending} disabled={!existing&&!student.circleId}>{existing?'حفظ تعديل الحضور':'حفظ حضور اليوم'}</Button>
      </fieldset>
    </form>
  </Card>;
}
