import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Role } from '@prisma/client';
import { ExamsService } from './exams.service';
const actor:any={id:'admin',role:Role.ADMIN};
function fixture(count=1){let deleted:any;let updated=0;let access=0;const tx={exam:{findUnique:async()=>({id:'exam',studentId:'student',requestId:'request'}),deleteMany:async(args:any)=>{deleted=args;return {count};}},examRequest:{updateMany:async()=>{updated++;return {count:1};}}};const service=new ExamsService({$transaction:async(run:any)=>run(tx)} as any,{assertStudentWriteAccess:async()=>{access++;}} as any,{log:async()=>{}} as any,{} as any);return {service,deleted:()=>deleted,updated:()=>updated,access:()=>access};}
test('deleting an ungraded appointment atomically excludes grades and returns its scheduled request to pending',async()=>{
 const f=fixture();assert.deepEqual(await f.service.removeUngraded(actor,'exam'),{deleted:true,id:'exam'});
 assert.deepEqual(f.deleted().where,{id:'exam',status:{in:['SCHEDULED','CANCELLED']},score:null,result:null,gradedAt:null});assert.equal(f.updated(),1);assert.equal(f.access(),1);
});
test('a concurrent grade or completed exam prevents deletion and leaves its request and progress untouched',async()=>{
 const f=fixture(0);await assert.rejects(f.service.removeUngraded(actor,'exam'),/لا يُحذف/);assert.equal(f.updated(),0);
});
test('student and parent roles cannot invoke appointment deletion',async()=>{
 const f=fixture();for(const role of [Role.STUDENT,Role.PARENT])await assert.rejects(f.service.removeUngraded({...actor,role},'exam'));assert.equal(f.access(),0);assert.equal(f.deleted(),undefined);
});
