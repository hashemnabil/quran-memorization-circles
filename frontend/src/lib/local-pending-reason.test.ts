import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach,test } from 'node:test';
import { db } from './db';
import { configureOffline } from './offline-engine';
import { localRead,localWrite } from './local-api';
const account='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
let actor={id:account,role:'TEACHER'};
Object.assign(globalThis,{window:new EventTarget(),localStorage:{getItem:()=>JSON.stringify(actor)}});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false}});
beforeEach(async()=>{actor={id:account,role:'TEACHER'};for(const table of db.tables)await table.clear();configureOffline(async()=>{throw new Error('offline');},()=>actor.id);});
for(const domain of ['transfers','suspensions'] as const){
 test(`${domain}: pending reason edits persist without approving or moving the student`,async()=>{
  await db.table(domain).put({id,accountId:account,synced:1,updatedAt:new Date().toISOString(),kind:'STUDENT_TRANSFER',status:'PENDING',reason:'Original',requestedById:account});
  const draft=await localWrite('patch',`/${domain}/${id}`,{reason:'Edited',previousReason:'Original'});
  assert.equal(draft.status,'PENDING');assert.equal(draft.synced,0);db.close();await db.open();
  assert.equal((await localRead(`/${domain}/${id}`)).reason,'Edited');assert.equal((await db.queue.toArray())[0].data.previousReason,'Original');
  await db.table(domain).update([account,id],{status:'APPROVED'});await assert.rejects(localWrite('patch',`/${domain}/${id}`,{reason:'Again'}));
 });
 test(`${domain}: requester cannot edit another account request or decision fields`,async()=>{
  await db.table(domain).put({id,accountId:account,synced:1,updatedAt:new Date().toISOString(),kind:'STUDENT_TRANSFER',status:'PENDING',reason:'Original',requestedById:'another'});
  await assert.rejects(localWrite('patch',`/${domain}/${id}`,{reason:'Forbidden'}));
  await db.table(domain).update([account,id],{requestedById:account});
  await assert.rejects(localWrite('patch',`/${domain}/${id}`,{reason:'Bad',status:'APPROVED'}));assert.equal(await db.queue.count(),0);
 });
}
