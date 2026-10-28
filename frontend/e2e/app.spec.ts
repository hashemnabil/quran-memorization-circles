import { gotoWithLocalUnlock, unlockLocalGate } from './local-security-helpers';
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixtures = JSON.parse(readFileSync('e2e/.accounts.json', 'utf8'));
async function login(page: Page, role: string) {
  await page.addInitScript(() => localStorage.setItem('qc.onboarding.completed', '1'));
  await gotoWithLocalUnlock(page,'/login');
  await expect(page.getByRole('status', { name: 'بدء التطبيق' })).not.toBeVisible();
  await page.getByLabel('اسم المستخدم', { exact: true }).fill(fixtures.accounts[role].username);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(fixtures.accounts[role].password);
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
  await expect(page.getByText('غير متصل', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('متصل', { exact: true })).toBeVisible();
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
