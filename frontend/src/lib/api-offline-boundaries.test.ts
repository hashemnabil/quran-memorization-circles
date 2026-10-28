import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import axios from 'axios';
import { db } from './db';
const storage = () => { const items = new Map<string,string>();return {getItem:(key:string)=>items.get(key)??null,setItem:(key:string,value:string)=>items.set(key,String(value)),removeItem:(key:string)=>items.delete(key),clear:()=>items.clear()}; };
let online = true, calls = 0, currentPublic = {name:'School',mosqueName:'Mosque'};
Object.assign(globalThis,{window:Object.assign(new EventTarget(),{location:{pathname:'/login'}}),localStorage:storage(),sessionStorage:storage()});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{get onLine(){return online;}}});
let respond: (config: any) => Promise<any> = async config => {
  assert.equal(config.url,'/settings/public');
  assert(!config.headers.Authorization);
  return {data:currentPublic,status:200,statusText:'OK',headers:{},config};
};
axios.defaults.adapter = async config => { calls++;return respond(config); };
const {api,tokenStore}=await import('./api');
test('public school details survive a reload/offline login without exposing an account snapshot',async()=>{
 await api.get('/settings/public');assert.equal(calls,1);db.close();await db.open();
 online=false;localStorage.setItem('qc.offlineUser',JSON.stringify({id:'another-account',role:'STUDENT'}));
 const cached=await api.get('/settings/public');assert.equal(cached.data.name,'School');assert.equal(calls,1);
 assert.equal(cached.statusText,'Local');
});
test('cached public data renders before a background refresh and updates when the server changes it',async()=>{
 online=true;currentPublic={name:'Updated school',mosqueName:'Mosque'};
 const cached=await api.get('/settings/public');assert.equal(cached.data.name,'School');
 for(let attempt=0;attempt<30;attempt++){
  const row=(await db.meta.toArray()).find(item=>item.key.startsWith('public:school-settings:'));
  if(row?.value.name==='Updated school')break;
  await new Promise(resolve=>setTimeout(resolve,5));
 }
 online=false;assert.equal((await api.get('/settings/public')).data.name,'Updated school');assert.equal(calls,2);
});
test('first offline use does not fabricate public school data',async()=>{
 await db.meta.clear();online=false;await assert.rejects(api.get('/settings/public'),/يلزم الاتصال/);
 assert.equal(calls,2);
});

test('online media reads retain pending edits and honor a pending change outside the report date range',async()=>{
 const account='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
 localStorage.setItem('qc.offlineUser',JSON.stringify({id:account,role:'SUPERVISOR',fullName:'Staff'}));
 await tokenStore.set('access','refresh',account);
 const original={id,type:'DESIGN',title:'Server original',description:'Details',activityDate:'2026-10-28T00:00:00.000Z',workUrl:null};
 respond=async config=>({data:[original],status:200,statusText:'OK',headers:{},config});
 online=true;await api.get('/media-activities');online=false;
 const pending=await api.patch('/media-activities/'+id,{...original,title:'Local edit',activityDate:'2026-10-29'});
 assert.equal(pending.data.synced,0);
 online=true;const visible=await api.get('/media-activities');assert.equal(visible.data[0].title,'Local edit');assert.equal(visible.data[0].synced,0);
 const report=await api.get('/media-activities',{params:{from:'2026-10-28',to:'2026-10-28'}});assert.equal(report.data.length,0);
 online=false;await db.queue.clear();
});

test('a local course link continues reading its acknowledged server record after identifier replacement',async()=>{
 const account='11111111-1111-4111-8111-111111111111',local='33333333-3333-4333-8333-333333333333',canonical='44444444-4444-4444-8444-444444444444';
 await db.meta.put({key:`${account}:id:${local}`,value:canonical});
 await db.courses.put({id:canonical,accountId:account,synced:1,updatedAt:new Date().toISOString(),name:'Canonical course',students:[]});
 online=false;const response=await api.get('/courses/'+local);
 assert.equal(response.data.id,canonical);assert.equal(response.config.url,'/courses/'+canonical);
 await db.courses.update([account,canonical],{synced:0,enrollmentPending:true});
 online=true;const before=calls;const pending=await api.get('/courses/'+local);
 assert.equal(pending.data.synced,0);assert.equal(pending.data.enrollmentPending,true);assert.equal(calls,before);
});
