import { useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api,apiError } from '@/lib/api';
import { combinedPlan } from '@/lib/combined-plan';
import { Input,Button,Card,Badge,LoadingState,ErrorState } from '@/components/ui';
import type {Student,Exam} from '@/types';
export default function CombinedTab({canRequest}:{canRequest:boolean}) {
  const client=useQueryClient();const [search,setSearch]=useState('');const [student,setStudent]=useState<Student>();
  const students=useQuery({queryKey:['students','combined',search],enabled:canRequest&&search.trim().length>0&&!student,queryFn:async()=>(await api.get<any>('/students',{params:{search,limit:10}})).data});
  const data=useQuery({queryKey:['exams','combined',student?.id],enabled:!!student,queryFn:async()=>{
    const exams:Exam[]=[];for(let page=1;;page++){const part=(await api.get<any>('/exams',{params:{studentId:student!.id,limit:200,page}})).data;exams.push(...part.data);if(!part.meta?.hasNextPage)break;}
    const [records,requests,sections]=await Promise.all([api.get<any[]>(`/exams/milestones/${student!.id}`),api.get<any>('/exams/requests',{params:{studentId:student!.id,limit:200}}),api.get<any[]>('/exams/sections')]);return {exams,records:records.data,requests:requests.data.data,sections:sections.data};
  }});
  const passed=new Set([...(data.data?.records||[]).filter(row=>row.result==='PASSED').map(row=>row.section.code),...(data.data?.exams||[]).filter(row=>row.result==='PASSED'&&!row.combinedStage).map(row=>row.section.code)]);
  const request=useMutation({mutationFn:(stage:ReturnType<typeof combinedPlan>[number])=>api.post('/exams/requests',{studentId:student!.id,combinedStage:stage.code,sectionIds:(data.data?.sections||[]).filter(row=>{const match=/^JUZ-(\d+)$/.exec(row.code);return match&&Number(match[1])>=stage.fromJuz&&Number(match[1])<=stage.toJuz;}).map(row=>row.id)}),onSuccess:()=>{toast.success('طھظ… ط­ظپط¸ ط·ظ„ط¨ ط§ظ„ظ…ط¬طھظ…ط¹ط©');void client.invalidateQueries({queryKey:['exams']});},onError:error=>toast.error(apiError(error))});
  return <div className="space-y-4"><Card title="ظ…ط¬طھظ…ط¹ط© â€” ط¯ط§ط®ظ„ظٹ ظˆط®ط§ط±ط¬ظٹ"><p className="text-sm">ط­ط²ط¨طŒ ط­ط²ط¨طŒ ط¬ط²ط،. ط¨ط¹ط¯ ظ£ ط£ط¬ط²ط§ط،: ظ…ط¬طھظ…ط¹ط© ط¯ط§ط®ظ„ظٹ ط«ظ… ط®ط§ط±ط¬ظٹطŒ ظˆط¨ط¹ط¯ ظ¥: ط¯ط§ط®ظ„ظٹ ط«ظ… ط®ط§ط±ط¬ظٹ. ط¹ظ†ط¯ ظƒظ„ ط¹ط´ط±ط© ط£ط¬ط²ط§ط، ظ…ط±ط­ظ„طھط§ظ† ط¯ط§ط®ظ„ظٹطھط§ظ†. ط§ظ„ط§ط¬طھظٹط§ط² ظ…ظ† ظ¨ظ .</p>{student?<div className="mt-3 flex items-center justify-between"><strong>{student.fullName}</strong><Button variant="secondary" onClick={()=>setStudent(undefined)}>ط§ط®طھظٹط§ط± ط·ط§ظ„ط¨ ط¢ط®ط±</Button></div>:<><Input label="ط¨ط­ط« ط§ظ„ط·ط§ظ„ط¨ ظ„ظ„ظ…ط¬طھظ…ط¹ط©" value={search} onChange={e=>setSearch(e.target.value)}/>{students.data?.data.map((row:Student)=><button key={row.id} className="block min-h-11 w-full border-b p-2 text-start" onClick={()=>setStudent(row)}>{row.fullName} آ· {row.code}</button>)}</>}</Card>
    {data.isLoading?<LoadingState/>:data.isError?<ErrorState message="طھط¹ط°ط± طھط­ظ…ظٹظ„ طھط³ظ„ط³ظ„ ط§ظ„ظ…ط¬طھظ…ط¹ط©" onRetry={()=>data.refetch()}/>:student&&combinedPlan().map(stage=>{
      const attempts=data.data?.exams.filter(row=>row.combinedStage===stage.code)||[];const successful=attempts.some(row=>row.result==='PASSED');const open=data.data?.requests.some((row:any)=>row.combinedStage===stage.code&&['PENDING','SCHEDULED'].includes(row.status));const eligible=Array.from({length:stage.toJuz-stage.fromJuz+1},(_,i)=>`JUZ-${String(stage.fromJuz+i).padStart(2,'0')}`).every(code=>passed.has(code))&&(!stage.prerequisite||data.data?.exams.some(row=>row.combinedStage===stage.prerequisite&&row.result==='PASSED'));
      return <Card key={stage.code} title={stage.label}><div className="flex flex-wrap items-center gap-3"><Badge>{successful?'ظ…ط¬طھط§ط²':open?'ط·ظ„ط¨ ظ‚ظٹط¯ ط§ظ„ط¥ط¬ط±ط§ط،':attempts.length?'ط؛ظٹط± ظ…ط¬طھط§ط²':'ظ„ظ… ظٹط®طھط¨ط±'}</Badge><span className="text-sm">ط§ظ„ظ…ط­ط§ظˆظ„ط§طھ: {attempts.length} {attempts.length?`آ· ط¢ط®ط± ط¹ظ„ط§ظ…ط©: ${attempts[attempts.length-1].score??'â€”'}`:''}</span>{canRequest&&!successful&&!open&&<Button loading={request.isPending} disabled={!eligible} onClick={()=>request.mutate(stage)}>{attempts.length?'ط·ظ„ط¨ ظ…ط­ط§ظˆظ„ط© ط¬ط¯ظٹط¯ط©':'ط·ظ„ط¨ ط§ط®طھط¨ط§ط±'}</Button>}{!eligible&&!successful&&!open&&<span className="text-xs text-slate-500">ظٹط¬ط¨ ط§ط¬طھظٹط§ط² ط§ظ„ط£ط¬ط²ط§ط، ط§ظ„ظ…ط·ظ„ظˆط¨ط© ظˆط§ظ„ظ…ط¬طھظ…ط¹ط© ط§ظ„ط³ط§ط¨ظ‚ط©</span>}</div></Card>;
    })}
  </div>;
}

