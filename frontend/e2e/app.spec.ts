import { gotoWithLocalUnlock, unlockLocalGate, fillLoginCredentials } from './local-security-helpers';
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixtures = JSON.parse(readFileSync('e2e/.accounts.json', 'utf8'));
async function login(page: Page, role: string) {
  await page.addInitScript(() => localStorage.setItem('qc.onboarding.completed', '1'));
  await gotoWithLocalUnlock(page,'/login');
  await expect(page.getByRole('status', { name: 'بدء التطبيق' })).not.toBeVisible();
  await fillLoginCredentials(page, fixtures.accounts[role].username, fixtures.accounts[role].password);
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
    await unlockLocalGate(page);
  if (role !== 'PARENT') await expect(page).not.toHaveURL(/\/login$/);
}
const destinations: Record<string, string[]> = {
  ADMIN: ['/profile-reviews/students', '/profile-reviews/teachers', '/student-accounts', '/students', '/circles', '/teachers', '/supervisors', '/staff', '/staff/attendance', '/attendance', '/recitations', '/exams', '/courses', '/certificates-admin', '/users', '/settings', '/media-schedule', '/media-activities', '/announcements', '/teacher-duties', '/transfers', '/suspensions'],
  SUPERVISOR: ['/students', '/circles', '/teachers', '/staff', '/staff/attendance', '/attendance', '/recitations', '/exams', '/courses', '/media-activities', '/teacher-duties', '/transfers', '/suspensions'],
  TEACHER: ['/students', '/circles', '/attendance', '/recitations', '/exams', '/courses', '/teacher-duties', '/transfers', '/suspensions', '/verify-profile'],
  EXAM_COMMITTEE: ['/exams'], SUPPORT: [],
  STUDENT: ['/student', '/my-files', '/verify-profile'],
};
const reports = ['attendance', 'recitations', 'exams', 'student', 'circles', 'students', 'memorization-students', 'activity-students', 'suspended-students', 'course-students', 'courses', 'course-attendance'];
for (const [role, paths] of Object.entries(destinations)) {
  test(`${role} renders its actual authorized screens through the live API`, async ({ page }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => { if (response.url().includes('/api/') && response.status() >= 500) errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
    await login(page, role);
    const initialSidebar = page.getByRole('navigation', { name: 'أقسام التطبيق', exact: true });
    while (await initialSidebar.getByRole('button', { expanded: false }).count()) await initialSidebar.getByRole('button', { expanded: false }).first().click();
    const visiblePaths = await initialSidebar.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')!));
    const allPaths = [...new Set([...paths, ...visiblePaths, ...(role === 'ADMIN' ? reports.map(report => `/documents/${report}`) : []), '/notifications', '/chat', '/support', '/profile'])];
    for (const path of allPaths) {
      const sidebar = page.getByRole('navigation', { name: 'أقسام التطبيق', exact: true });
      while (await sidebar.getByRole('button', { expanded: false }).count()) await sidebar.getByRole('button', { expanded: false }).first().click();
      const link = sidebar.locator(`a[href="${path}"]`);
      if (await link.count()) await link.click();
      else await gotoWithLocalUnlock(page,path);
      await expect(page, `Role ${role} failed navigation to ${path}`).toHaveURL(url => url.pathname === path || (role === 'STUDENT' && url.pathname === '/student' && path !== '/student'));
      await expect(page.getByRole('status', { name: 'بدء التطبيق' })).not.toBeVisible();
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.locator('main')).not.toContainText('تعذر تحميل');
    }
    // Check the account menu from a known authorized page rather than the last
    // visited destination (which may render with a different page shell).
    await gotoWithLocalUnlock(page,role === 'STUDENT' ? '/student' : role === 'SUPPORT' ? '/support' : '/profile');
    await expect(page.getByRole('button', { name: 'قائمة الحساب', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'قائمة الحساب', exact: true }).click();
    await page.locator('header').getByRole('link', { name: 'الإشعارات', exact: true }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    expect(errors).toEqual([]);
  });
}
test('student contact picker offers assigned teachers, supervisor and administrators online and offline', async ({ page, context }) => {
  await login(page, 'STUDENT'); await gotoWithLocalUnlock(page,'/chat');
  await page.getByRole('button', { name: 'محادثة جديدة', exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const role of ['ADMIN', 'TEACHER', 'SUPERVISOR']) await expect(dialog.getByRole('button', { name: new RegExp(`Browser ${role}`) })).toBeVisible();
  for (const role of ['STUDENT', 'SUPPORT', 'EXAM_COMMITTEE']) await expect(dialog.getByRole('button', { name: new RegExp(`Browser ${role}`) })).toHaveCount(0);
  await expect.poll(() => page.evaluate(account => new Promise(resolve => {
    const open = indexedDB.open('halaqatFull'); open.onsuccess = () => {
      const database = open.result; const read = database.transaction('meta').objectStore('meta').get(`${account}:chatContactPolicyV1`);
      read.onsuccess = () => { resolve(Boolean(read.result)); database.close(); };
    };
  }), fixtures.accounts.STUDENT.id)).toBe(true);
  await context.setOffline(true);
  await dialog.getByPlaceholder('ابحث عن مستخدم...').fill('Browser TEACHER');
  await expect(dialog.getByRole('button', { name: /Browser TEACHER/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Browser ADMIN/ })).toHaveCount(0);
});

test('parent portal remains disabled and teaching accounts cannot visit user administration', async ({ page }) => {
  await login(page, 'PARENT');
  await expect(page.getByText('تم إيقاف بوابة ولي الأمر؛ يرجى استخدام حساب الطالب')).toBeVisible();
  await login(page, 'TEACHER');
  await gotoWithLocalUnlock(page,'/users');
  await expect(page).toHaveURL(/\/forbidden$/);
});
test('student files render on a phone-sized viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'STUDENT'); await gotoWithLocalUnlock(page,'/my-files');
  await expect(page.getByRole('heading', { name: 'ملفاتي', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
});
test('student can reload the cached shell and file screen in airplane mode and reconnect', async ({ page, context }) => {
  await login(page, 'STUDENT'); await gotoWithLocalUnlock(page,'/my-files');
  await expect(page.getByRole('heading', { name: 'ملفاتي', exact: true })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // The account query snapshot is encrypted in the primary database.
  await expect.poll(() => page.evaluate(account => new Promise<boolean>((resolve) => {
    const request = indexedDB.open('halaqatFull');
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction('meta').objectStore('meta').get(account + ':querySnapshot');
      read.onsuccess = () => { database.close(); resolve(Boolean(read.result?.__sealedLocal)); };
    };
    request.onerror = () => resolve(false);
  }), fixtures.accounts.STUDENT.id)).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('heading', { name: 'ملفاتي', exact: true })).toBeVisible();
  await expect(page.getByText('العمل بالنسخة المحلية', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('متصل بالإنترنت', { exact: true })).toBeVisible();
  await expect(page.getByText('غير متصل', { exact: true })).not.toBeVisible();
});

async function readTeacherOutbox(page: Page): Promise<Array<{ id: number; opId: string }>> {
  return page.evaluate(accountId => new Promise(resolve => {
    const open = indexedDB.open('halaqatFull');
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('queue')) { db.close(); resolve([]); return; }
      const read = db.transaction('queue').objectStore('queue').index('accountId').getAll(accountId);
      read.onsuccess = () => { db.close(); resolve(read.result.filter(item => item.table === 'attendance')); };
      read.onerror = () => { db.close(); resolve([]); };
    };
    open.onerror = () => resolve([]);
  }), fixtures.accounts.TEACHER.id);
}

test('offline attendance survives a lost committed response and replays with the same operation ID', async ({ page, context }) => {
  test.setTimeout(75000);
  await login(page, 'TEACHER');
  await gotoWithLocalUnlock(page,`/attendance?circleId=${fixtures.circle.id}`);
  await expect(page.getByText(fixtures.student.fullName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'تعيين الكل غائب', exact: true }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'حفظ الكشف', exact: true }).first().click();
  await expect.poll(async () => (await readTeacherOutbox(page)).length).toBe(1);
  const originalId = (await readTeacherOutbox(page))[0].opId;
  let committedResponse: any;
  let loseFirstResponse = true;
  await page.route('**/api/sync-all', async route => {
    if (!loseFirstResponse) { await route.continue(); return; }
    loseFirstResponse = false;
    const response = await route.fetch();
    committedResponse = await response.json();
    await route.abort('connectionreset');
  });
  const lostResponse = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/sync-all') && request.method() === 'POST');
  await context.setOffline(false);
  await expect.poll(() => committedResponse?.outcomes?.[0]?.status).toBe('applied');
  // A committed server write with a lost response must stay queued for replay.
  // Observe the failed response before checking durability; do not inspect the
  // retired attendance-only queue or rely on a transport-specific retry counter.
  await lostResponse;
  expect(committedResponse.outcomes[0].opId).toBe(originalId);
  await expect.poll(async () => (await readTeacherOutbox(page)).map(item => item.opId)).toEqual([originalId]);
  const replay = page.waitForResponse(response => response.url().endsWith('/api/sync-all') && response.request().method() === 'POST' && response.ok());
  await page.reload();
  const replayResult = (await (await replay).json()).outcomes[0];
  expect(replayResult.opId).toBe(originalId);
  // The persisted receipt returns the original record IDs, timestamps and data.
  expect(replayResult).toEqual(committedResponse.outcomes[0]);
  await expect.poll(async () => (await readTeacherOutbox(page)).length).toBe(0);
  const token = await page.evaluate(() => {
    if (localStorage.getItem('qc.accessToken') || localStorage.getItem('qc.refreshToken')) throw new Error('Legacy plaintext credentials remain');
    return JSON.parse(sessionStorage.getItem('server-session-v2') || 'null')?.accessToken;
  });
  const date = new Date().toISOString().slice(0, 10);
  const response = await page.request.get(`http://127.0.0.1:3000/api/attendance/sheet?circleId=${fixtures.circle.id}&date=${date}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.ok()).toBe(true);
  const sheet = await response.json();
  expect(sheet.students.filter((student: any) => student.id === fixtures.student.id)).toHaveLength(1);
  expect(sheet.students.find((student: any) => student.id === fixtures.student.id).attendance.status).toBe('ABSENT');
});


test('community composer works across mobile sizes and themes and retains encrypted drafts',async({page})=>{
  await login(page,'ADMIN');
  await gotoWithLocalUnlock(page,'/community/stories/new');
  const body='Story mobile '+Date.now();
  await page.getByLabel('نص القصة',{exact:true}).fill(body);
  await page.getByRole('button',{name:'خلفية #183153',exact:true}).click();
  await page.getByRole('button',{name:'معاينة قبل النشر',exact:true}).click();
  for(const width of [360,390,430])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:844});
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    await expect(page.getByRole('heading',{name:'إنشاء قصة',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'نشر',exact:true})).toBeVisible();
    await expect.poll(async () => {
      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        editor: document.querySelector<HTMLElement>('.community-composer') ? {width:document.querySelector<HTMLElement>('.community-composer')!.clientWidth,scroll:document.querySelector<HTMLElement>('.community-composer')!.scrollWidth} : null,
        offenders: [...document.querySelectorAll<HTMLElement>('body *')]
          .filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && (rect.right > window.innerWidth + 1 || rect.left < -1);
          })
          .slice(0, 12)
          .map(element => ({
            tag: element.tagName,
            className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
            bounds: [Math.round(element.getBoundingClientRect().left), Math.round(element.getBoundingClientRect().right)],
          })),
      }));
      if (layout.document > layout.viewport + 1) console.log('MOBILE_OVERFLOW_DIAGNOSTIC', JSON.stringify({ width, theme, ...layout }));
      return layout.document <= layout.viewport + 1 && (!layout.editor || layout.editor.scroll <= layout.editor.width+1);
    }).toBe(true);
    await expect(page.getByRole('region',{name:'معاينة'})).toContainText(body);
  }
  await expect.poll(()=>page.evaluate(account=>new Promise(resolve=>{
    const open=indexedDB.open('halaqatFull');open.onsuccess=()=>{const database=open.result;const read=database.transaction('meta').objectStore('meta').get(account+':community-draft:story');read.onsuccess=()=>{resolve(Boolean(read.result));database.close();};};
  }),fixtures.accounts.ADMIN.id)).toBe(true);
  await page.reload();await unlockLocalGate(page);
  await expect(page.getByLabel('نص القصة',{exact:true})).toHaveValue(body);
  await page.getByRole('button',{name:'نشر',exact:true}).click();
  await expect(page).toHaveURL(/\/community\/posts$/);
  await page.getByRole('button',{name:/Browser ADMIN/}).first().click();
  await expect(page.getByRole('dialog',{name:'عرض الستوري'})).toContainText(body);
});

test('selected post composer inserts real mentions and publishes with an explicit audience',async({page})=>{
  await login(page,'ADMIN');await page.setViewportSize({width:390,height:844});
  await gotoWithLocalUnlock(page,'/community/posts/new');
  await page.getByLabel('الجمهور',{exact:true}).selectOption('SELECTED');
  await page.getByLabel('البحث عن حسابات الجمهور').fill(fixtures.accounts.STUDENT.username);
  await page.getByRole('checkbox',{name:new RegExp('Browser STUDENT')}).check();
  await page.getByLabel('نص المنشور',{exact:true}).fill('Hello @'+fixtures.accounts.STUDENT.username);
  await page.getByRole('option',{name:new RegExp('Browser STUDENT')}).click();
  await page.getByRole('button',{name:'معاينة قبل النشر',exact:true}).click();
  await expect(page.getByRole('region',{name:'معاينة'}).getByRole('link')).toHaveAttribute('href','/community/users/'+fixtures.accounts.STUDENT.id);
  let published=0;page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/community/posts')published++;});
  await page.route('**/api/community/capabilities',route=>route.fulfill({json:{privateAudienceVersion:0}}));
  await page.getByRole('button',{name:'نشر',exact:true}).click();
  await expect(page.getByText('الخادم يحتاج تحديث دعم الجمهور الخاص؛ بقي منشورك محفوظاً',{exact:true})).toBeVisible();
  expect(published).toBe(0);await expect(page).toHaveURL(/\/community\/posts\/new$/);
  await page.unroute('**/api/community/capabilities');
  await page.getByRole('button',{name:'نشر',exact:true}).click();
  await expect(page).toHaveURL(/\/community\/posts$/);
  const post=page.locator('.community-post').filter({hasText:'Hello @'+fixtures.accounts.STUDENT.username}).first();
  await expect(post).toContainText('أشخاص محددون');
  await expect(post.getByRole('link',{name:'@'+fixtures.accounts.STUDENT.username,exact:true})).toHaveAttribute('href','/community/users/'+fixtures.accounts.STUDENT.id);
});


test('mobile account and chat pages keep navigation and conversation controls usable in both themes',async({page})=>{
  test.setTimeout(180000);await login(page,'ADMIN');
  for(const width of [360,430])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:844});
    await page.evaluate(value=>{localStorage.setItem('qc.theme',value);window.dispatchEvent(new CustomEvent('qc:theme',{detail:value}));},theme);
    for(const path of ['/community/users/me','/profile/settings','/chat']){
      await gotoWithLocalUnlock(page,path);
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
      if(path==='/profile/settings')await expect(page.getByText('إصدار التطبيق',{exact:false})).toBeVisible();
      if(path==='/chat'){
        const create=page.getByRole('button',{name:'محادثة جديدة',exact:true});await expect(create).toBeVisible();await create.click();
        const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:/Browser TEACHER/}).click();
        await expect(page).toHaveURL(/\/chat\/[0-9a-f-]+$/);
        await expect(page.locator('.chat-conversation-list')).not.toBeVisible();
        await expect(page.locator('.chat-composer textarea')).toBeVisible();
        const box=await page.locator('.chat-composer').boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(845);
      }
    }
  }
});


test('native-style settings use grouped rows, search, real details and a persistent dark switch',async({page},info)=>{
  await page.addInitScript(()=>localStorage.setItem('qc.theme','light'));
  await login(page,'ADMIN');await page.setViewportSize({width:390,height:844});
  await gotoWithLocalUnlock(page,'/profile/settings');
  await expect(page.getByRole('heading',{name:'الإعدادات',exact:true})).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(page.locator('.settings-group')).toHaveCount(5);
  await expect(page.getByRole('switch',{name:'الوضع الليلي'})).toHaveAttribute('aria-checked','false');
  await page.screenshot({path:info.outputPath('settings-light.png'),fullPage:true});
  await page.getByRole('switch',{name:'الوضع الليلي'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.reload();await unlockLocalGate(page);
  await expect(page.getByRole('switch',{name:'الوضع الليلي'})).toHaveAttribute('aria-checked','true');
  await page.screenshot({path:info.outputPath('settings-dark.png'),fullPage:true});
  await page.getByRole('textbox',{name:'البحث في الإعدادات'}).fill('كلمة المرور');
  await expect(page.locator('.settings-group')).toHaveCount(1);
  await page.getByRole('link',{name:'كلمة المرور',exact:true}).click();
  await expect(page.getByLabel('كلمة المرور الحالية',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'العودة للإعدادات'}).click();
  await page.getByRole('link',{name:'رمز الأمان',exact:true}).click();
  await expect(page.locator('input[type=password]').first()).toBeVisible();
  for(const width of [360,430]){await page.setViewportSize({width,height:844});await gotoWithLocalUnlock(page,'/profile/settings');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
  for(const path of ['/community/posts/new','/community/stories/new','/chat']){await gotoWithLocalUnlock(page,path);await expect(page.locator('input[type=file]')).toHaveCount(0);}
});
