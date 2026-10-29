// Standalone unit checks: run with node src/exams/combined-milestone.test.cjs.
// Load the real service with infrastructure stubs; no database or Nest server is needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const enums = Object.fromEntries(['Role','ExamStatus','ExamRequestStatus','ExamResult','Evaluation','NotificationType'].map(name=>[name,new Proxy({}, {get:(_,key)=>key})]));
enums.Prisma={DbNull:'DB_NULL'};
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
    if(id==='./combined-plan'||id==='../common/grading'||id==='./ensure-exam-programme'||id==='./exam-scoring'||id==='../common/quran')return load(path.resolve(path.dirname(file),id+'.ts'));
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
  service.getCachedSections=async()=>[];
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
test('locked section codes resolve to a real section ID before saving',async()=>{
  const f=fixture();let lookup;let saved;
  f.prisma.student={findFirst:async()=>({id:'student'})};
  f.prisma.examSection.findFirst=async args=>{lookup=args;return {id:'real-juz-28',name:'Juz 28',minScore:80};};
  f.prisma.$transaction=async work=>work({examMilestoneRecord:{upsert:async args=>{saved=args;return {id:'record',section:{name:'Juz 28'}};}}});
  f.service.updateStudentMemorization=async()=>{};
  await f.service.updateMilestoneRecord(actor,'student','JUZ-28',{status:'NOT_REQUESTED'});
  assert.equal(lookup.where.OR[1].code,'JUZ-28');assert.equal(saved.create.sectionId,'real-juz-28');assert.equal(saved.where.studentId_sectionId.sectionId,'real-juz-28');
});
test('milestone save URLs include a section code even without an eligibility row',async()=>{
  const {examMilestonePath}=load(path.resolve(__dirname,'../../../frontend/src/lib/exam-milestone-path.ts'));
  assert.equal(examMilestonePath('student','JUZ-28'),'/exams/milestones/student/JUZ-28');
  assert.equal(examMilestonePath('student',stage),'/exams/combined-milestones/student/'+stage);
  assert.throws(()=>examMilestonePath('student',''));assert.throws(()=>examMilestonePath(undefined,'JUZ-28'));
});
test('legacy programme repair adds missing juz, reactivates retired rows and preserves IDs and grades',async()=>{
  const {ensureExamProgramme,examProgramme}=load(path.join(__dirname,'ensure-exam-programme.ts'));
  const rows=Array.from({length:60},(_,i)=>({id:'hizb-'+(i+1),code:`HIZB-${String(i+1).padStart(2,'0')}`,name:'Hizb '+(i+1),order:i+1,kind:'HIZB',isActive:true,isRequired:true,gradeSentinel:97}));
  rows.push({id:'retired-juz-26',code:'JUZ-26',name:'الجزء 26',order:1001,kind:'JUZ',isActive:false,isRequired:false,gradeSentinel:88});
  rows.push({id:'custom',code:'CUSTOM',name:'Custom exam',order:61,kind:'JUZ',isActive:true,isRequired:false,gradeSentinel:77});
  let writes=0;
  const section={findMany:async()=>rows.map(row=>({...row})),
    update:async({where,data})=>{const row=rows.find(row=>row.id===where.id);if(data.order!=null)assert.ok(!rows.some(other=>other.id!==row.id&&other.order===data.order),'unique order collision');Object.assign(row,data);writes++;return row;},
    create:async({data})=>{assert.ok(!rows.some(row=>row.order===data.order||row.code===data.code||row.name===data.name),'unique constraint collision');const row={id:'new-'+data.code,...data};rows.push(row);writes++;return row;},
  };
  const prisma={$transaction:async work=>work({$queryRaw:async()=>[],examSection:section})};
  assert.equal(await ensureExamProgramme(prisma),true);
  assert.equal(rows.length,91);
  for(const item of examProgramme){const row=rows.find(row=>row.code===item.code);assert.equal(row.order,item.order);assert.equal(row.isActive,true);assert.equal(row.isRequired,true);}
  assert.equal(rows.find(row=>row.code==='JUZ-26').id,'retired-juz-26');assert.equal(rows.find(row=>row.id==='retired-juz-26').gradeSentinel,88);
  assert.equal(rows.find(row=>row.id==='hizb-60').gradeSentinel,97);assert.equal(rows.find(row=>row.id==='custom').gradeSentinel,77);
  const before=writes;assert.equal(await ensureExamProgramme(prisma),false);assert.equal(writes,before,'retry must not rewrite records');
});
function resultFixture(status='COMPLETED'){
  const previous={id:'published-exam',status,studentId:'student',student:{fullName:'Student'},section:{id:'section',name:'Juz',order:1},sections:[],combinedStage:stage,score:85,grading:{mistakes:3,alerts:2,tajweed:8,mistakePenalty:2,alertPenalty:1},scheduledAt:new Date(),notes:'Original note'};
  const f=fixture(previous);f.prisma.exam.findUnique=async()=>previous;
  f.service.updateStudentMemorization=async()=>{};f.service.sendResultNotifications=async()=>{};
  return f;
}
test('admin corrects a published result using original penalties and persists its breakdown',async()=>{
  const f=resultFixture();const saved=await f.service.recordResult(actor,'published-exam',{score:0,mistakes:2,alerts:2,tajweed:8,mistakePenalty:90,alertPenalty:90,notes:'Corrected'});
  assert.equal(saved.score,92);assert.equal(saved.grading.mistakes,2);assert.equal(saved.grading.alerts,2);assert.equal(saved.grading.tajweed,8);assert.equal(saved.grading.mistakePenalty,2);assert.equal(saved.result,'PASSED');assert.equal(f.calls.logs[0].action,'EXAM_RESULT_CORRECTION');assert.ok(f.calls.logs[0].summary.includes('85'));
});
test('committee may grade a scheduled exam but cannot change a published result',async()=>{
  const committee={id:'committee-user',role:'EXAM_COMMITTEE'};const published=resultFixture();
  await assert.rejects(published.service.recordResult(committee,'published-exam',{score:90}));assert.equal(published.calls.updates.length,0);
  const initial=resultFixture('SCHEDULED');await initial.service.recordResult(committee,'published-exam',{score:90});assert.equal(initial.calls.updates[0].score,90);
});
test('manual result correction clears an obsolete calculated breakdown and updates pass/fail',async()=>{
  const f=resultFixture();const saved=await f.service.recordResult(actor,'published-exam',{score:70});
  assert.equal(saved.score,70);assert.equal(saved.result,'FAILED');assert.equal(saved.grading,'DB_NULL');
});
test('a cancelled exam cannot be graded even by the administrator',async()=>{
  const f=resultFixture('CANCELLED');await assert.rejects(f.service.recordResult(actor,'published-exam',{score:90}));assert.equal(f.calls.updates.length,0);
});
(async()=>{for(const {name,run} of tests){await run();console.log('PASS '+name);}console.log(tests.length+' checks passed');})().catch(error=>{console.error(error);process.exitCode=1;});
