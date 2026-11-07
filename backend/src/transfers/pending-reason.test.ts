import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TransfersService } from './transfers.service';
import { SuspensionsService } from '../suspensions/suspensions.service';
import { Role } from '@prisma/client';
const actor={id:'owner',role:Role.TEACHER} as any;
for(const domain of ['transferRequest','suspensionRequest'] as const){
 function fixture(owner='owner',status='PENDING',count=1){
  let mutation:any;const row={id:'request',studentId:'student',requestedById:owner,status,kind:'STUDENT_TRANSFER',reason:'Original'};
  const prisma:any={[domain]:{findUnique:async()=>row,updateMany:async(query:any)=>{mutation=query;return {count};}}};
  const acl={assertStudentWriteAccess:async()=>({id:'student'})};
  const service:any=domain==='transferRequest'?new TransfersService(prisma,acl as any,{} as any,{} as any):new SuspensionsService(prisma,acl as any,{} as any,{} as any);
  service.findOne=async()=>({...row,reason:'Edited'});
  return {service,mutation:()=>mutation};
 }
 test(`${domain}: pending reason compares the original reason and decision status atomically`,async()=>{
  const f=fixture();await f.service.updatePendingReason(actor,'request',{reason:'Edited',previousReason:'Original'});
  assert.deepEqual(f.mutation().where,{id:'request',status:'PENDING',reason:'Original'});assert.deepEqual(f.mutation().data,{reason:'Edited'});
 });
 test(`${domain}: another owner, an approved request and a concurrent change cannot be overwritten`,async()=>{
  const stranger=fixture('another');await assert.rejects(stranger.service.updatePendingReason(actor,'request',{reason:'Edited',previousReason:'Original'}));assert.equal(stranger.mutation(),undefined);
  const decided=fixture('owner','APPROVED');await assert.rejects(decided.service.updatePendingReason(actor,'request',{reason:'Edited',previousReason:'Original'}));assert.equal(decided.mutation(),undefined);
  const changed=fixture('owner','PENDING',0);await assert.rejects(changed.service.updatePendingReason(actor,'request',{reason:'Edited',previousReason:'Original'}),/تغيّر الطلب/);
 });
}
