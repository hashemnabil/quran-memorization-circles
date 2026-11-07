import { chromium } from '../node_modules/playwright-core/index.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const origin=process.env.REVIEW_ORIGIN||'http://127.0.0.1:5174';
const output=name=>fileURLToPath(new URL('../../docs/'+name,import.meta.url));
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 localStorage.setItem('qc.onboarding.completed','1');window.__plays=0;window.__peak=0;const players=new Set();const original=HTMLMediaElement.prototype.play;
 HTMLMediaElement.prototype.play=function(...args){window.__plays++;players.add(this);const result=original.apply(this,args);void result.then(()=>{window.__peak=Math.max(window.__peak,[...players].filter(player=>!player.paused&&!player.ended).length);}).catch(()=>{});return result;};
});
const user={id:'11111111-1111-4111-8111-111111111111',username:'review',fullName:'حساب الفحص',role:'ADMIN',isActive:true,mustChangePassword:false};
await page.routeWebSocket('**/socket.io/**',socket=>socket.close());
await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;let data={data:[],meta:{hasNextPage:false,total:0}};
 if(path==='/api/auth/login'||path==='/api/auth/refresh')data={user,accessToken:'test-access',refreshToken:'test-refresh'};
 if(path==='/api/auth/me')data=user;
 if(path==='/api/settings/public'||path==='/api/settings')data={name:'مدرسة عبدالله بن عمر لتحفيظ القرآن الكريم'};
 if(path==='/api/announcements/active'||path==='/api/chat/conversations')data=[];
 if(path==='/api/dashboard/overview')data={role:'ADMIN',counts:{},pending:{},attendanceToday:{rate:0},weeklyAttendance:[],evaluationBreakdown:[],recentActivity:[],circles:[],students:[],children:[],tickets:[],upcomingExams:[]};
 if(path.endsWith('unread-count'))data={count:0};if(path==='/api/sync-all/watermark')data={cursor:'0'};if(path==='/api/sync-all/delta')data={cursor:'0',tables:{},changedEntities:[],hasMore:false};
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
async function unlock(){await page.waitForFunction(()=>{const screen=document.querySelector('.security-screen');return screen?!!screen.querySelector('form'):!!document.querySelector('.app-topbar');});if(!await page.locator('.security-panel').isVisible())return;const fields=page.locator('.security-panel input[type=password]');for(let index=0;index<await fields.count();index++)await fields.nth(index).fill('936285');await page.locator('.security-panel button[type=submit]').click();await page.locator('[data-security-blocked]').waitFor({state:'detached'});}
async function saved(){await page.getByRole('button',{name:'حفظ الاختيار',exact:true}).click();await page.getByRole('status').filter({hasText:'حُفظ اختيارك'}).waitFor();}
const prefs=()=>page.evaluate(id=>JSON.parse(localStorage.getItem('qc.notification-preferences.v2:'+id)),user.id);
try {
 await page.goto(origin+'/login');await page.getByRole('status',{name:'بدء التطبيق'}).waitFor();await page.waitForTimeout(300);await page.screenshot({path:output('silent-launch-preview.png')});await page.getByRole('status',{name:'بدء التطبيق'}).waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.__plays),0);
 await page.getByLabel('اسم المستخدم',{exact:true}).fill(user.username);await page.getByLabel('كلمة المرور',{exact:true}).fill('School Browser Test 27');await page.getByRole('button',{name:'دخول',exact:true}).click();await unlock();
 await page.goto(origin+'/profile/settings/notifications/sound');await unlock();await page.getByRole('heading',{name:'صوت الإشعارات',exact:true}).waitFor();
 assert.equal(await page.getByRole('radio').count(),10);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);assert.equal(await page.evaluate(()=>window.__plays),0);
 await page.getByRole('radio',{name:'صوت المدرسة',exact:true}).check();assert.equal(await page.evaluate(()=>window.__plays),0);
 await page.getByRole('button',{name:'تشغيل صوت المدرسة',exact:true}).click();await page.waitForFunction(()=>window.__plays===1);
 await page.getByRole('button',{name:'تشغيل سكينة',exact:true}).click();await page.waitForFunction(()=>window.__plays===2);assert(await page.evaluate(()=>window.__peak<=1));
 assert(await page.getByRole('radio',{name:'صوت المدرسة',exact:true}).isChecked());
 await page.getByRole('checkbox',{name:/الاهتزاز/}).check();await saved();assert.equal((await prefs()).sound,'school');assert.equal((await prefs()).vibrate,true);
 await page.reload();await unlock();assert(await page.getByRole('radio',{name:'صوت المدرسة',exact:true}).isChecked());assert(await page.getByRole('checkbox',{name:/الاهتزاز/}).isChecked());assert.equal(await page.evaluate(()=>window.__plays),0);
 await page.getByRole('button',{name:'استعادة صوت الجهاز',exact:true}).click();await page.getByRole('status').filter({hasText:'حُفظ اختيارك'}).waitFor();assert.equal((await prefs()).sound,'default');assert.equal((await prefs()).vibrate,true);
 await page.getByRole('radio',{name:'صامت',exact:true}).check();await saved();assert.equal((await prefs()).sound,'silent');assert.equal((await prefs()).vibrate,true);
 await page.locator('input[type=file]').setInputFiles({name:'نغمتي.wav',mimeType:'audio/wav',buffer:readFileSync(new URL('../public/sounds/school.wav',import.meta.url))});await page.getByRole('radio',{name:'نغمتي.wav',exact:true}).waitFor();await saved();assert.equal((await prefs()).sound,'custom');assert.equal(await page.evaluate(()=>window.__plays),0);
 const encrypted=await page.evaluate(id=>new Promise(resolve=>{const request=indexedDB.open('qc-notification-audio');request.onsuccess=()=>{const db=request.result;const get=db.transaction('files').objectStore('files').get(id+':general');get.onsuccess=()=>{resolve(get.result);db.close();};};}),user.id);
 assert.equal(encrypted.__localCipher,1);assert(!JSON.stringify(encrypted).includes('نغمتي'));
 await page.reload();await unlock();assert(await page.getByRole('radio',{name:'نغمتي.wav',exact:true}).isChecked());assert.equal(await page.evaluate(()=>window.__plays),0);
 await context.setOffline(true);await page.getByRole('button',{name:'تشغيل نغمتي.wav',exact:true}).click();await page.waitForFunction(()=>window.__plays===1);await page.getByRole('button',{name:'إيقاف نغمتي.wav',exact:true}).click();await context.setOffline(false);
 await page.screenshot({path:output('notification-sounds-mobile-preview.png'),fullPage:true});assert.deepEqual(errors,[]);
 await page.goto(origin+'/brand-concepts/index.html');assert.equal(await page.locator('audio').count(),3);assert.equal(await page.locator('audio[src*="audio-logo"]').count(),0);await page.screenshot({path:output('brand-concepts-preview.png'),fullPage:true});
 console.log('PASS: silent animated launch; 10 sound choices; explicit exclusive previews; independent vibration; default reset; silent notifications; encrypted import; persistence after reload; offline file preview; no audio logo.');
} finally {await browser.close();}
