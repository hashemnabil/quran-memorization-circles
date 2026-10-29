// Focused component checks; no server, account, or browser is required.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const student={id:'student-1',fullName:'Student One',circleId:'circle-1'};
function fixture(file,{state=[],day={data:{data:[]},isPending:false,isError:false},queries={}}={}){
  const calls=[];const mutations=[];let index=0;
  const api={get:async()=>({data:[]}),post:async(...args)=>{calls.push(['post',...args]);return {data:{}};},patch:async(...args)=>{calls.push(['patch',...args]);return {data:{}};}};
  const ui=new Proxy({},{get:(_,name)=>name==='cx'?(...values)=>values.filter(Boolean).join(' '):String(name)});
  const jsx=(type,props)=>({type,props:props||{}});
  const requireStub=id=>{
    if(id==='react')return {useState:initial=>[index<state.length?state[index++]:((index++,typeof initial==='function')?initial():initial),()=>{}],useEffect:()=>{},useMemo:compute=>compute()};
    if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(id==='@tanstack/react-query')return {useQuery:options=>queries[options.queryKey[1]]??day,useMutation:options=>{mutations.push(options);return {isPending:false,mutate:payload=>{void options.mutationFn(payload);}};},useQueryClient:()=>({invalidateQueries:async()=>{}})};
    if(id==='@/lib/exam-scoring'||id==='@/lib/combined-plan'){
      const scoring={exports:{}};const source=fs.readFileSync(path.resolve(__dirname,id==='@/lib/exam-scoring'?'../src/lib/exam-scoring.ts':'../src/lib/combined-plan.ts'),'utf8');
      const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
      vm.runInThisContext('(function(module,exports){'+js+'\n})')(scoring,scoring.exports);return scoring.exports;
    }
    if(id==='@/lib/api')return {api,apiError:String};
    if(id==='@/lib/format')return {todayInput:()=> '2026-10-29',formatDateShort:value=>value};
    if(id==='@/components/ui')return ui;
    if(id==='@/lib/labels')return {ATTENDANCE_LABELS:{PRESENT:'Present',EXCUSED:'Excused',ABSENT:'Absent'},RECITATION_TYPE_LABELS:{},EVALUATION_LABELS:{}};
    return {};
  };
  const mod={exports:{}};
  const source=fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInThisContext('(function(require,module,exports){'+js+'\n})')(requireStub,mod,mod.exports);
  return {exports:mod.exports,calls,mutations};
}
(async()=>{
  for(const status of ['PRESENT','EXCUSED','ABSENT']){
    const f=fixture('pages/students/StudentAttendanceEditor.tsx',{state:['2026-10-29',status,'reason']});
    f.exports.StudentAttendanceEditor({student});await f.mutations[0].mutationFn();
    const [method,url,payload]=f.calls[0];assert.equal(method,'post');assert.equal(url,'/attendance');assert.equal(payload.circleId,student.circleId);assert.equal(payload.entries.length,1);assert.equal(payload.entries[0].studentId,student.id);assert.equal(payload.entries[0].status,status);assert.equal(payload.entries[0].note,status==='EXCUSED'?'reason':undefined);
  }
  const correction=fixture('pages/students/StudentAttendanceEditor.tsx',{state:['2026-10-29','ABSENT','stale excuse'],day:{data:{data:[{id:'saved-record',status:'EXCUSED',note:'old'}]},isPending:false,isError:false}});
  correction.exports.StudentAttendanceEditor({student});await correction.mutations[0].mutationFn();assert.equal(correction.calls[0][0],'patch');assert.equal(correction.calls[0][1],'/attendance/saved-record');assert.equal(correction.calls[0][2].note,undefined);
  for(const day of [{isPending:true},{isError:true}]){
    const f=fixture('pages/students/StudentAttendanceEditor.tsx',{day});f.exports.StudentAttendanceEditor({student});await assert.rejects(f.mutations[0].mutationFn());assert.equal(f.calls.length,0);
  }
  const unassigned=fixture('pages/students/StudentAttendanceEditor.tsx');unassigned.exports.StudentAttendanceEditor({student:{...student,circleId:null}});await assert.rejects(unassigned.mutations[0].mutationFn());assert.equal(unassigned.calls.length,0);
  const recitation=fixture('pages/recitations/RecitationsPage.tsx',{day:{data:undefined}});
  const modal=recitation.exports.RecitationFormModal({student,onClose:()=>{}});
  // The fixed student is supplied directly to the shared form; its submit
  // action must save that ID without requiring the student selector.
  const walk=node=>Array.isArray(node)?node.flatMap(walk):node&&typeof node==='object'?[node,...walk(node.props?.children)]:[];
  const nodes=walk(modal);assert.ok(modal.props.title.includes(student.fullName));assert.ok(!nodes.some(node=>node.props?.label==='الطالب'));assert.ok(!nodes.some(node=>node.props?.label==='الحلقة'));
  const save=walk(modal.props.footer).find(node=>node.props?.children==='حفظ');save.props.onClick();assert.equal(recitation.calls[0][1],'/recitations');assert.equal(recitation.calls[0][2].studentId,student.id);
  const result=fixture('components/ExamResultDialog.tsx',{day:{data:{mistakePenalty:9,alertPenalty:9},isSuccess:true}});
  const published={id:'exam',status:'COMPLETED',score:94.5,notes:'Original notes',student,section:{id:'section',name:'Juz'},grading:{mistakes:2,alerts:3,tajweed:8,mistakePenalty:1,alertPenalty:0.5}};
  const dialog=result.exports.ExamResultDialog({exam:published,onClose:()=>{}});
  const fields=walk(dialog);assert.ok(dialog.props.title.includes('تعديل'));
  for(const [label,value] of [['عدد الأخطاء',2],['عدد التنبيهات',3],['علامة الأحكام من 10',8],['ملاحظات','Original notes']])assert.equal(fields.find(node=>node.props?.label===label).props.value,value);
  fields.find(node=>node.type==='form').props.onSubmit({preventDefault:()=>{}});
  assert.equal(result.calls[0][1],'/exams/exam/result');assert.equal(result.calls[0][2].score,94.5);assert.equal(result.calls[0][2].mistakePenalty,1);assert.equal(result.calls[0][2].notes,'Original notes');
  for(const [eligible,passed,requestStatus,count] of [[true,false,null,1],[false,false,null,0],[true,true,null,0],[true,false,'PENDING',0],[true,false,'SCHEDULED',0]]){
    const progression=fixture('pages/exams/ExamProgressionTable.tsx',{queries:{milestones:{data:[],isPending:false},'milestones-requests':{data:{data:requestStatus?[{id:'request',createdAt:'2026-10-29',status:requestStatus,section:{id:'h60',code:'HIZB-60'}}]:[]},isPending:false}}});
    const view=progression.exports.ExamProgressionTable({studentId:student.id,canRequest:true,canEditMilestones:true,exams:[],eligibility:{progression:[{id:'h60',code:'HIZB-60',eligible,isPassed:passed}]}});
    const buttons=walk(view).filter(node=>node.type==='Button'&&node.props.children==='طلب اختبار');assert.equal(buttons.length,count,`request visibility: ${eligible}/${passed}/${requestStatus}`);
    assert.equal(walk(view).filter(node=>node.type==='input').length,0,'editing fields must not expand inside table rows');
  }
  console.log('PASS: three attendance states, isolated correction, pending/error guards, missing circle, and fixed-student recitation');
})().catch(error=>{console.error(error);process.exitCode=1;});
