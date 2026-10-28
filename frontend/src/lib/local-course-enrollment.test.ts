import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { db } from './db';
import { configureOffline, syncAll } from './offline-engine';
import { localRead, localWrite, rememberRead } from './local-api';
const account='11111111-1111-4111-8111-111111111111', course='22222222-2222-4222-8222-222222222222', student='33333333-3333-4333-8333-333333333333';
let role='SUPERVISOR', online=false;
Object.assign(globalThis,{window:new EventTarget(),localStorage:{getItem:()=>JSON.stringify({id:account,role})}});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{get onLine(){return online;}}});
beforeEach(async()=>{online=false;role='SUPERVISOR';for(const table of db.tables)await table.clear();configureOffline(async()=>{throw new Error('offline');},()=>account);await rememberRead('/courses/'+course,{}, {id:course,name:'Course',capacity:1,students:[]});await rememberRead('/students',{}, {data:[{id:student,fullName:'Student',code:'S1'}]});});
test('enrollment and termination update the local roster immediately and persist as pending requests',async()=>{
 const enrolled=await localWrite('post',`/courses/${course}/students`,{studentIds:[student,student]});
 assert.equal(enrolled.synced,0);assert.equal(enrolled.students.length,1);assert.equal(enrolled.students[0].pending,true);
 db.close();await db.open();assert.equal((await localRead('/courses/'+course)).students[0].isCurrent,true);
 const ended=await localWrite('delete',`/courses/${course}/students/${student}`,undefined);
 assert.equal(ended.students[0].isCurrent,false);assert.equal(ended.synced,0);assert.equal(await db.queue.count(),2);
});
test('capacity rejection retains the pending enrollment and does not fabricate server approval',async()=>{
 await localWrite('post',`/courses/${course}/students`,{studentIds:[student]});online=true;
 configureOffline(async(_method,_path,payload)=>({outcomes:[{opId:payload.operations[0].opId,status:'rejected',message:'سعة الدورة لا تتسع لهذا العدد'}]}),()=>account);
 await assert.rejects(syncAll(),/سعة الدورة/);assert.equal(await db.queue.count(),1);assert.equal((await localRead('/courses/'+course)).synced,0);
 assert.match((await db.queue.toArray())[0].error!,/سعة الدورة/);
});
test('teachers cannot queue enrollment and uncached students are not invented',async()=>{
 role='TEACHER';await assert.rejects(localWrite('post',`/courses/${course}/students`,{studentIds:[student]}));
 role='SUPERVISOR';await assert.rejects(localWrite('post',`/courses/${course}/students`,{studentIds:['44444444-4444-4444-8444-444444444444']}));
 assert.equal(await db.queue.count(),0);
});
