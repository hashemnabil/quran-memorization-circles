// Behavioural adapter checks against the real API module, with controlled transport/storage.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const never=new Promise(()=>{});
function fixture(options={}){
  const state={online:options.online??true,localSession:false,account:'account-a',network:[],reads:0,queued:0,cached:0};
  const error=options.error;
  const network=async config=>{state.network.push(config);if(options.network)return options.network(config);if(error)throw error;return {data:options.server??{data:[{id:'remote-1'},{id:'remote-2'}]},status:200,headers:{},config};};
  const api={defaults:{adapter:network},interceptors:{request:{use:()=>{}},response:{use:()=>{}}}};
  const db={meta:{get:async()=>({value:{name:'Old school'}}),bulkGet:async keys=>keys.map(key=>options.aliases?.[key]?{value:options.aliases[key]}:undefined),put:async()=>{if(options.cacheFails)throw Error('Disk full');}},responses:{get:async()=>options.cache?{data:options.cache}:undefined},queue:{where:()=>({equals:()=>({count:async()=>options.pending??0,toArray:async()=>options.operations??[],filter:()=>({first:async()=>undefined})})})}};
  const identity=()=>({id:state.account});
  const engine={configureOffline:()=>{},accountId:()=>state.account,settleLocalWrite:async local=>local,reconcileAfterNetworkWrite:async()=>{}};
  const deps={
    axios:{create:()=>api,getAdapter:()=>network,isAxiosError:value=>!!value?.isAxiosError,CanceledError:class extends Error{}},
    '@capacitor/core':{Capacitor:{isNativePlatform:()=>false}},
    '../config/branding':{schoolName:name=>name},
    './session-store':{createSessionStore:()=>({isLocal:()=>state.localSession,owner:()=>state.account})},
    './active-identity':{readActiveIdentity:identity},
    './offline-engine':engine,'./db':{db},
    './local-api':{responseKey:()=> 'cache-key',localRead:async()=>{state.reads++;return options.local;},localWrite:async()=>{state.queued++;return {id:'local',synced:0};},rememberRead:async()=>{state.cached++;if(options.cacheBlocks)await never;}},
    './offline-prefetch':{readPrefetched:async()=>undefined},
    './local-conversations':{localConversation:async()=>({id:'allowed'})},
  };
  deps.axios.default=deps.axios;
  const policy={exports:{}};
  const policyJs=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/lib/primary-write-policy.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
  vm.runInThisContext('(function(exports){'+policyJs+'\n})')(policy.exports);deps['./primary-write-policy']=policy.exports;
  let source=fs.readFileSync(path.resolve(__dirname,'../src/lib/api.ts'),'utf8').replaceAll('import.meta.env',"({VITE_API_URL:'https://primary.test/api'})");
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{
    navigator:{get onLine(){return state.online;}},localStorage:{},window:{dispatchEvent:()=>{}},FormData:class {},Blob:class {},URL,Event:class {},CustomEvent:class {},setTimeout,clearTimeout,console,
  })(id=>deps[id]||{},mod,mod.exports);
  return {state,request:config=>mod.exports.api.defaults.adapter({method:'get',...config})};
}
const tests=[];const test=(name,run)=>tests.push({name,run});
const transportError=()=>Object.assign(Error('Network unreachable'),{isAxiosError:true});
test('online reads use all primary rows, even with stale cache and pending sync',async()=>{
  const f=fixture({cache:{data:[{id:'stale'}]},local:{data:[]},pending:5});const result=await f.request({url:'/students'});
  assert.equal(result.data.data.length,2);assert.equal(result.data.data[0].id,'remote-1');assert.equal(f.state.reads,0);assert.equal(f.state.network.length,1);
});
test('a slow replica write never blocks the server read response',async()=>{
  const f=fixture({cacheBlocks:true});const result=await Promise.race([f.request({url:'/students'}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Read waited for replica')),100))]);assert.equal(result.data.data.length,2);assert.equal(f.state.cached,1);
});
test('public school settings come from primary while online, despite an older cache',async()=>{
  const f=fixture({server:{name:'New school'},cacheFails:true});const result=await f.request({url:'/settings/public'});assert.equal(result.data.name,'New school');
});
test('offline reads use local data and never contact the primary',async()=>{
  const f=fixture({online:false,local:{data:[{id:'offline-student'}]}});const result=await f.request({url:'/students'});assert.equal(result.data.data[0].id,'offline-student');assert.equal(f.state.network.length,0);
});
test('offline cache misses fail without waiting for an unreachable server',async()=>{
  const f=fixture({online:false});await assert.rejects(f.request({url:'/students'}));assert.equal(f.state.network.length,0);
});
test('unreachable primary falls back to saved data even if the browser reports online',async()=>{
  const f=fixture({error:transportError(),local:{data:[{id:'offline-student'}]}});const result=await f.request({url:'/students'});assert.equal(result.data.data[0].id,'offline-student');
});
test('authorization errors are never replaced with cached success',async()=>{
  for(const status of [401,403,404,500]){const f=fixture({error:Object.assign(Error('Rejected'),{isAxiosError:true,response:{status}}),local:{data:[{id:'private'}]}});await assert.rejects(f.request({url:'/students'}));assert.equal(f.state.reads,0);}
});
test('online writes use primary directly when no older queued operations exist',async()=>{
  const f=fixture({server:{id:'server-student'}});const result=await f.request({url:'/students',method:'post',data:{fullName:'New'}});assert.equal(result.data.id,'server-student');assert.equal(f.state.queued,0);assert.equal(f.state.network.length,1);
});
test('unrelated blocked offline work never diverts a normal online write',async()=>{
  const f=fixture({operations:[{entityId:'old-request',table:'examRequests',data:{studentId:'old-student'},error:'Rejected'}],server:{id:'new-student'}});
  const result=await f.request({url:'/students',method:'post',data:{fullName:'New'}});assert.equal(result.data.id,'new-student');assert.equal(f.state.queued,0);
});
test('an open form referencing an acknowledged offline create uses the canonical server ID',async()=>{
  const old='00000000-0000-4000-8000-000000000001';const canonical='00000000-0000-4000-8000-000000000002';
  const f=fixture({aliases:{['account-a:id:'+old]:canonical},server:{id:'recitation'}});
  await f.request({url:'/recitations',method:'post',data:JSON.stringify({studentId:old,entries:[{studentId:old}]})});
  const sent=JSON.parse(f.state.network[0].data);assert.equal(sent.studentId,canonical);assert.equal(sent.entries[0].studentId,canonical);assert.equal(f.state.queued,0);
});
test('offline writes are durably queued without trying the server',async()=>{
  const f=fixture({online:false});const result=await f.request({url:'/students',method:'post',data:{fullName:'New'}});assert.equal(result.data.synced,0);assert.equal(f.state.queued,1);assert.equal(f.state.network.length,0);
});
test('older offline operations keep dependency order without blocking reads',async()=>{
  const f=fixture({operations:[{entityId:'local',table:'students',data:{}}]});const result=await f.request({url:'/recitations',method:'post',data:{studentId:'local'}});assert.equal(result.data.synced,0);assert.equal(f.state.queued,1);
});
test('an ambiguous timed-out online write is not automatically duplicated in the offline queue',async()=>{
  const f=fixture({error:transportError()});await assert.rejects(f.request({url:'/students',method:'post',data:{fullName:'New'}}));assert.equal(f.state.network.length,1);assert.equal(f.state.queued,0);
});
test('a response belonging to a switched account is discarded before caching',async()=>{
  let finish;const f=fixture({network:()=>new Promise(resolve=>{finish=resolve;})});const waiting=f.request({url:'/students'});f.state.account='account-b';finish({data:{data:[{id:'private-a'}]}});await assert.rejects(waiting);assert.equal(f.state.cached,0);
});
test('queued receipts return while background delivery is still running',async()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../src/lib/offline-engine.ts'),'utf8');
  const start=source.indexOf('export async function settleLocalWrite(');const end=source.indexOf('export function update(',start);
  const js=ts.transpileModule(source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
  const mod={exports:{}};let attempted=0;
  vm.runInNewContext('(function(exports){'+js+'\n})',{navigator:{onLine:true},syncAll:()=>{attempted++;return never;}})(mod.exports);
  const receipt={id:'queued',synced:0};assert.equal(await mod.exports.settleLocalWrite(receipt),receipt);assert.equal(attempted,1);
});
(async()=>{for(const {name,run} of tests){await run();console.log('PASS '+name);}console.log(tests.length+' primary/offline checks passed');})().catch(error=>{console.error(error);process.exitCode=1;});
