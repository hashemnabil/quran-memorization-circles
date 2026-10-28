import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoursesService } from './courses.service';
import { Role } from '@prisma/client';
const actor={id:'manager',role:Role.SUPERVISOR} as any;
function fixture(capacity:number,count:number,already=false){
 const events:string[]=[];let inserts=0;
 const tx={
  $queryRaw:async(strings:TemplateStringsArray,...values:any[])=>{assert.match(strings.join('?'),/FOR UPDATE/);assert.equal(values[0],'course');events.push('lock');},
  course:{findFirst:async()=>{events.push('capacity');return {id:'course',name:'Course',capacity,_count:{enrollments:count}};}},
  student:{findMany:async()=>[{id:'student',fullName:'Student',parentProfile:null}]},
  courseEnrollment:{findMany:async()=>already?[{studentId:'student',endedAt:null}]:[],create:async()=>{events.push('insert');inserts++;},updateMany:async()=>({count:1})},
 };
 const service=new CoursesService({$transaction:async(run:any)=>run(tx)} as any,{log:async()=>{}} as any,{notify:async()=>{}} as any);
 return {service,events,inserts:()=>inserts};
}
test('capacity is checked under the course lock before any enrollment is created',async()=>{
 const {service,events,inserts}=fixture(1,0);await service.enroll(actor,'course',{studentIds:['student','student']});
 assert.deepEqual(events,['lock','capacity','insert']);assert.equal(inserts(),1);
});
test('a full course rejects enrollment without writing and an existing enrollment is not duplicated',async()=>{
 const full=fixture(1,1);await assert.rejects(full.service.enroll(actor,'course',{studentIds:['student']}),/سعة الدورة/);assert.equal(full.inserts(),0);
 const existing=fixture(1,1,true);const result=await existing.service.enroll(actor,'course',{studentIds:['student']});assert.equal(result.enrolled,0);assert.equal(existing.inserts(),0);
});
