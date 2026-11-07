import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const suites=[
 {name:'frontend',cwd:'frontend',loader:['--import','./scripts/register-test-loader.mjs'],files:[
  'offline-engine','local-api','db-migration','offline-prefetch','offline-login','queued-credentials','security-session','local-encryption','app-lock','back-navigation','communication-offline','offline-access-policy','pending-avatar','read-refresh','pending-student-photos','local-support','local-conversations','local-media','local-course-enrollment','local-pending-reason','api-offline-boundaries',
 ].map(name=>`src/lib/${name}.test.ts`).concat(['src/lib/notification-audio.test.mjs','src/lib/audio-logo-samples.test.mjs'])},
 {name:'backend',cwd:'backend',loader:['-r','ts-node/register'],files:[
  'src/offline-sync/sync-all.service.test.ts','src/schedules/schedules.service.test.ts','src/certificates/certificates.service.test.ts','src/exams/exam-reminders.service.test.ts','src/attendance/absence-alerts.test.ts','src/notifications/notification-flows.test.ts','src/push/push.test.ts','src/exams/exam-deletion.test.ts','src/chat/offline-message.test.ts','src/support/offline-support.test.ts','src/media-activities/media-activities.test.ts','src/courses/course-enrollment.test.ts','src/transfers/pending-reason.test.ts','src/auth/jwt.strategy.test.ts','src/uploads/uploads.service.test.ts',
 ]},
];
async function verify(suite){
 const started=Date.now();
 const result=await new Promise(resolve=>{
  const child=spawn(process.execPath,[...suite.loader,'--test','--test-concurrency=4','--test-reporter=tap',...suite.files],{cwd:path.join(root,suite.cwd),env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true});
  let stdout='',stderr='',timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill();},120000);
  child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
  child.on('error',error=>{clearTimeout(timer);resolve({stdout,stderr:stderr+'\n'+error.message,code:null,timedOut});});
  child.on('close',code=>{clearTimeout(timer);resolve({stdout,stderr,code,timedOut});});
 });
 const count=label=>Number([...result.stdout.matchAll(new RegExp(`^# ${label} (\\d+)\\s*$`,'gm'))].at(-1)?.[1]||0);
 const tests=count('tests'),pass=count('pass'),fail=count('fail'),skipped=count('skipped'),cancelled=count('cancelled');
 const passed=result.code===0&&!result.timedOut&&tests>0&&fail===0&&cancelled===0&&pass+skipped===tests;
 await writeFile(path.join(root,`docs/offline-verification-${suite.name}.log`),result.stdout+'\n'+result.stderr);
 const summary={name:suite.name,passed,tests,pass,fail,skipped,cancelled,exitCode:result.code,timedOut:result.timedOut,durationMs:Date.now()-started,files:suite.files.map(file=>suite.cwd+'/'+file),scope:'unit/mocked integration; no production database or physical Android device'};
 console.log(JSON.stringify(summary));return summary;
}
const startedAt=new Date().toISOString();
const results=await Promise.all(suites.map(verify));
await writeFile(path.join(root,'docs/offline-verification-latest.json'),JSON.stringify({startedAt,passed:results.every(result=>result.passed),suites:results},null,2)+'\n');
if(results.some(result=>!result.passed))process.exitCode=1;
