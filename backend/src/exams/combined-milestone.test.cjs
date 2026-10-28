// Standalone unit checks: run with node src/exams/combined-milestone.test.cjs.
// Load the real service with infrastructure stubs; no database or Nest server is needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const enums = Object.fromEntries(['Role','ExamStatus','ExamRequestStatus','ExamResult','Evaluation','NotificationType'].map(name=>[name,new Proxy({}, {get:(_,key)=>key})]));
class HttpError extends Error {}
const nest = new Proxy({Logger:class {}, Injectable:()=>target=>target}, {get:(obj,key)=>obj[key]||HttpError});
const cache = new Map();
function load(file) {
  if(cache.has(file))return cache.get(file);
  const mod={exports:{}};cache.set(file,mod.exports);
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true}}).outputText;
  const localRequire=id=>{
    if(id==='@nestjs/common')return nest;
    if(id==='@prisma/client')return enums;
    if(id==='./combined-plan'||id==='../common/grading')return load(path.resolve(path.dirname(file),id+'.ts'));
    return {};
  };
  vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file})(localRequire,mod,mod.exports);
  cache.set(file,mod.exports);return mod.exports;
}
const {ExamsService}=load(path.join(__dirname,'exams.service.ts'));
const {combinedPlan}=load(path.join(__dirname,'combined-plan.ts'));
const stage=combinedPlan()[0].code;
const actor={id:'admin',role:'ADMIN'};
function fixture(previous=null,active=[]) {
  const calls={creates:[],updates:[],requests:[],requestUpdates:[],logs:[],access:0};
  const tx={
    $queryRaw:async()=>[{locked:1}],
    exam:{findFirst:async()=>previous,findMany:async()=>previous?[previous]:[],create:async({data})=>{calls.creates.push(data);return {id:'manual-exam',...data};},update:async({data})=>{calls.updates.push(data);return {...previous,...data};}},
    examRequest:{findMany:async()=>active,updateMany:async arg=>{calls.requestUpdates.push(arg);return {count:active.length};},create:async arg=>{calls.requests.push(arg.data);return arg.data;}},
  };
  const prisma={...tx,$transaction:async work=>work(tx),examSection:{findFirst:async()=>({id:'juz-anchor'})},examMilestoneRecord:{findMany:async()=>[]}};
  const service=new ExamsService(prisma,{assertStudentWriteAccess:async()=>{calls.access++;return {id:'student',circleId:'circle'};},assertStudentAccess:async()=>{}},{log:async row=>calls.logs.push(row)},{});
  service.resolveTeacherId=async()=> 'teacher';
  return {service,calls,prisma};
}
const tests=[];
const test=(name,run)=>tests.push({name,run});
test('all non-admin roles are rejected before database access',async()=>{
  const f=fixture();for(const role of ['TEACHER','SUPERVISOR','EXAM_COMMITTEE','STUDENT','PARENT'])await assert.rejects(f.service.updateCombinedMilestone({...actor,role},'student',stage,{status:'COMPLETED',score:90}));
  assert.equal(f.calls.access,0);assert.equal(f.calls.creates.length,0);
});
test('invalid combined stages cannot write arbitrary exams',async()=>{
  const f=fixture();await assert.rejects(f.service.updateCombinedMilestone(actor,'student','not-a-stage',{status:'COMPLETED'}));assert.equal(f.calls.access,0);
});
test('admin completion persists score, result and examiner without awarding a juz milestone',async()=>{
  const f=fixture();const result=await f.service.updateCombinedMilestone(actor,'student',stage,{status:'COMPLETED',score:79,examDate:'2026-10-29',requestedAt:'2026-10-28',examinerName:'Examiner'});
  assert.equal(result.combinedStage,stage);assert.equal(result.status,'COMPLETED');assert.equal(result.result,'FAILED');assert.equal(result.score,79);
  assert.equal(result.grading.adminCombinedMilestone.examinerName,'Examiner');assert.equal(f.calls.logs.length,1);assert.equal(f.calls.requests.length,0);
  assert.equal((await f.service.milestoneRecords(actor,'student')).length,0);
});
test('reset to requested clears the grade and frees the linked request for scheduling',async()=>{
  const f=fixture({id:'exam',requestId:'request',studentId:'student',combinedStage:stage,scheduledAt:new Date(),score:95,grading:{mistakes:2}},[{id:'request'}]);
  const saved=await f.service.updateCombinedMilestone(actor,'student',stage,{status:'REQUESTED'});
  assert.equal(saved.score,null);assert.equal(saved.result,null);assert.equal(saved.gradedAt,null);assert.equal(saved.status,'CANCELLED');assert.equal(saved.requestId,null);
  assert.equal(saved.grading.mistakes,2);assert.equal(f.calls.requestUpdates[0].data.status,'PENDING');assert.equal(f.calls.requests.length,0);
});
test('a manual requested state creates a real reviewable request when none exists',async()=>{
  const f=fixture();await f.service.updateCombinedMilestone(actor,'student',stage,{status:'REQUESTED',requestedAt:'2026-10-29'});
  assert.equal(f.calls.requests.length,1);assert.equal(f.calls.requests[0].combinedStage,stage);assert.equal(f.calls.requests[0].teacherId,'teacher');
});
test('scheduled and reset states keep existing request status consistent',async()=>{
  for(const [status,requestStatus,examStatus] of [['SCHEDULED','SCHEDULED','SCHEDULED'],['NOT_REQUESTED','CANCELLED','CANCELLED']]){
    const f=fixture(null,[{id:'request'}]);const exam=await f.service.updateCombinedMilestone(actor,'student',stage,{status});
    assert.equal(f.calls.requestUpdates[0].data.status,requestStatus);assert.equal(exam.status,examStatus);assert.equal(exam.requestId,status==='SCHEDULED'?'request':null);
  }
});
test('combined request notes cannot be changed by the requesting teacher',async()=>{
  const f=fixture();f.prisma.examRequest.findUnique=async()=>({id:'request',teacherId:'teacher',status:'PENDING',combinedStage:stage});
  await assert.rejects(f.service.updateRequestNote({id:'teacher-account',teacherId:'teacher',role:'TEACHER'},'request',{note:'change'}));
});
test('milestone reads expose the manual combined state and examiner',async()=>{
  const f=fixture({id:'exam',studentId:'student',sectionId:'anchor',combinedStage:stage,score:90,result:'PASSED',grading:{adminCombinedMilestone:{status:'COMPLETED',examinerName:'Examiner'}}});
  const rows=await f.service.milestoneRecords(actor,'student');assert.equal(rows[0].section.code,stage);assert.equal(rows[0].examinerName,'Examiner');assert.equal(rows[0].score,90);
});
test('a corrected failed prerequisite blocks the next combined stage despite an older pass',async()=>{
  const f=fixture();const next=combinedPlan()[1];
  f.prisma.exam.findMany=async()=>[
    {id:'corrected',combinedStage:stage,status:'COMPLETED',result:'FAILED'},
    {id:'old-pass',combinedStage:stage,status:'COMPLETED',result:'PASSED'},
  ];
  f.prisma.examMilestoneRecord.findMany=async()=>[28,29,30].map(juz=>({section:{code:`JUZ-${juz}`}}));
  await assert.rejects(f.service.combinedSections('student',next.code),/السابقة/);
});
test('a manually scheduled combined exam prevents a duplicate request',async()=>{
  const f=fixture();f.prisma.exam.findMany=async()=>[{id:'scheduled',combinedStage:stage,status:'SCHEDULED'}];
  await assert.rejects(f.service.combinedSections('student',stage),/مجدول/);
});
(async()=>{for(const {name,run} of tests){await run();console.log('PASS '+name);}console.log(tests.length+' checks passed');})().catch(error=>{console.error(error);process.exitCode=1;});
