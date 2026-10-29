import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Input,Button,Card,LoadingState,ErrorState } from '@/components/ui';
import { ExamProgressionTable } from './ExamProgressionTable';
import type {Student,Exam,ExamEligibility,PaginatedResponse} from '@/types';

export default function CombinedTab({canRequest}:{canRequest:boolean}) {
  const [search,setSearch]=useState('');
  const [student,setStudent]=useState<Student>();
  const canEdit=useAuthStore(state=>state.user?.role==='ADMIN');
  const students=useQuery({
    queryKey:['students','combined',search],enabled:search.trim().length>0&&!student,
    queryFn:async()=>(await api.get<PaginatedResponse<Student>>('/students',{params:{search,limit:10}})).data,
  });
  const data=useQuery({
    queryKey:['exams','combined',student?.id],enabled:!!student,
    queryFn:async()=>{
      const exams:Exam[]=[];
      for(let page=1;;page++){
        const part=(await api.get<PaginatedResponse<Exam>>('/exams',{params:{studentId:student!.id,limit:200,page}})).data;
        exams.push(...part.data);if(!part.meta?.hasNextPage)break;
      }
      const eligibility=(await api.get<ExamEligibility>(`/exams/eligibility/${student!.id}`)).data;
      return {exams,eligibility};
    },
  });
  return <div className="space-y-4">
    <Card title="المجمّعة — داخلي وخارجي">
      <p className="text-sm">اطلب اختبار المجمّعة بعد اجتياز الأجزاء المطلوبة والمجمّعة السابقة. الاجتياز من ٨٠. تعديل الحالة والعلامة والتاريخ والممتحن متاح للإدارة فقط.</p>
      {student?<div className="mt-3 flex items-center justify-between"><strong>{student.fullName}</strong><Button variant="secondary" onClick={()=>setStudent(undefined)}>اختيار طالب آخر</Button></div>:<>
        <Input label="بحث الطالب للمجمّعة" value={search} onChange={event=>setSearch(event.target.value)}/>
        {students.isFetching&&<LoadingState/>}
        {students.isError&&<ErrorState message="تعذر البحث عن الطلاب" onRetry={()=>students.refetch()}/>}
        {students.data?.data.map(row=><button type="button" key={row.id} className="block min-h-11 w-full border-b p-2 text-start" onClick={()=>setStudent(row)}>{row.fullName} · {row.code}</button>)}
      </>}
    </Card>
    {student&&(data.isError?<ErrorState message="تعذر تحميل تسلسل المجمّعة" onRetry={()=>data.refetch()}/>:<ExamProgressionTable key={student.id} studentId={student.id} eligibility={data.data?.eligibility} exams={data.data?.exams??[]} loading={data.isPending} canRequest={canRequest} canEditMilestones={canEdit} onlyCombined/>)}
  </div>;
}
