import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixtures = JSON.parse(readFileSync('e2e/.accounts.json', 'utf8'));
async function login(page: Page, role: string) {
  await page.addInitScript(() => localStorage.setItem('qc.onboarding.completed', '1'));
  await page.goto('/login');
  await expect(page.getByRole('status', { name: 'بدء التطبيق' })).not.toBeVisible();
  await page.getByLabel('اسم المستخدم (رقم الطالب للطلاب)').fill(fixtures.accounts[role].username);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(fixtures.accounts[role].password);
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  if (role !== 'PARENT') await expect(page).not.toHaveURL(/\/login$/);
}
const destinations: Record<string, string[]> = {
  ADMIN: ['/students', '/circles', '/teachers', '/attendance', '/recitations', '/exams', '/courses', '/certificates-admin', '/users', '/settings'],
  SUPERVISOR: ['/students', '/circles', '/attendance', '/recitations', '/exams', '/reports'],
  TEACHER: ['/students', '/circles', '/attendance', '/recitations', '/exams', '/reports'],
  EXAM_COMMITTEE: ['/exams', '/notifications'], SUPPORT: ['/support', '/notifications'],
  STUDENT: ['/student', '/my-files', '/profile'],
};
for (const [role, paths] of Object.entries(destinations)) {
  test(`${role} renders its actual authorized screens through the live API`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => { if (response.url().includes('/api/') && response.status() >= 500) errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
    await login(page, role);
    for (const path of paths) {
      await page.goto(path);
      await expect(page).toHaveURL(url => url.pathname === path);
      await expect(page.getByRole('status', { name: 'بدء التطبيق' })).not.toBeVisible();
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.locator('main')).not.toContainText('تعذر تحميل');
    }
    expect(errors).toEqual([]);
  });
}
test('parent portal remains disabled and teaching accounts cannot visit user administration', async ({ page }) => {
  await login(page, 'PARENT');
  await expect(page.getByText('تم إيقاف بوابة ولي الأمر؛ يرجى استخدام حساب الطالب')).toBeVisible();
  await login(page, 'TEACHER');
  await page.goto('/users');
  await expect(page).toHaveURL(/\/forbidden$/);
});
test('student files render on a phone-sized viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'STUDENT'); await page.goto('/my-files');
  await expect(page.getByRole('heading', { name: 'ملفاتي', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
});
test('student can reload the cached shell and file screen in airplane mode and reconnect', async ({ page, context }) => {
  await login(page, 'STUDENT'); await page.goto('/my-files');
  await expect(page.getByRole('heading', { name: 'ملفاتي', exact: true })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Persistence is debounced; poll the snapshot transaction rather than a fixed sleep.
  await expect.poll(() => page.evaluate(async () => new Promise<boolean>((resolve) => {
    const request = indexedDB.open('quran-circles-query-cache', 1);
    request.onsuccess = () => {
      const db = request.result; if (!db.objectStoreNames.contains('snapshots')) { db.close(); resolve(false); return; }
      const read = db.transaction('snapshots').objectStore('snapshots').getAll();
      read.onsuccess = () => { db.close(); resolve(read.result.some((entry) => entry.state.queries.some((query) => query.queryKey[0] === 'student-files'))); };
    };
    request.onerror = () => resolve(false);
  }))).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('heading', { name: 'ملفاتي', exact: true })).toBeVisible();
  await expect(page.getByText('أنت غير متصل بالإنترنت.', { exact: false })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('أنت غير متصل بالإنترنت.', { exact: false })).not.toBeVisible();
});

async function readTeacherOutbox(page: Page): Promise<Array<{ id: string; attempts: number }>> {
  return page.evaluate(accountId => new Promise(resolve => {
    const open = indexedDB.open('quran-circles-offline', 1);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('outbox')) { db.close(); resolve([]); return; }
      const read = db.transaction('outbox').objectStore('outbox').index('accountId').getAll(accountId);
      read.onsuccess = () => { db.close(); resolve(read.result); };
      read.onerror = () => { db.close(); resolve([]); };
    };
    open.onerror = () => resolve([]);
  }), fixtures.accounts.TEACHER.id);
}

test('offline attendance survives a lost committed response and replays with the same operation ID', async ({ page, context }) => {
  test.setTimeout(75000);
  await login(page, 'TEACHER');
  await page.goto(`/attendance?circleId=${fixtures.circle.id}`);
  await expect(page.getByText(fixtures.student.fullName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'تعيين الكل غائب', exact: true }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'حفظ الكشف', exact: true }).first().click();
  await expect.poll(async () => (await readTeacherOutbox(page)).length).toBe(1);
  const originalId = (await readTeacherOutbox(page))[0].id;
  let committedResponse: any;
  let loseFirstResponse = true;
  await page.route('**/api/sync/push', async route => {
    if (!loseFirstResponse) { await route.continue(); return; }
    loseFirstResponse = false;
    const response = await route.fetch();
    committedResponse = await response.json();
    await route.abort('connectionreset');
  });
  await context.setOffline(false);
  await expect.poll(() => committedResponse?.results?.[0]?.status).toBe('applied');
  await expect.poll(async () => (await readTeacherOutbox(page))[0]?.attempts).toBeGreaterThan(0);
  expect((await readTeacherOutbox(page))[0].id).toBe(originalId);
  const replay = page.waitForResponse(response => response.url().endsWith('/api/sync/push') && response.ok());
  await page.reload();
  const replayResult = (await (await replay).json()).results[0];
  expect(replayResult.opId).toBe(originalId);
  expect(replayResult.replayed).toBe(true);
  await expect.poll(async () => (await readTeacherOutbox(page)).length).toBe(0);
  const token = await page.evaluate(() => localStorage.getItem('qc.accessToken'));
  const date = new Date().toISOString().slice(0, 10);
  const response = await page.request.get(`http://127.0.0.1:3000/api/attendance/sheet?circleId=${fixtures.circle.id}&date=${date}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.ok()).toBe(true);
  const sheet = await response.json();
  expect(sheet.students.filter((student: any) => student.id === fixtures.student.id)).toHaveLength(1);
  expect(sheet.students.find((student: any) => student.id === fixtures.student.id).attendance.status).toBe('ABSENT');
});

test('memorization and review can be saved offline and survive a page reload before reconnect', async ({ page, context }) => {
  test.setTimeout(75000);
  await login(page, 'TEACHER'); await page.goto('/recitations');
  // Wait for the durable core roster, not an arbitrary delay.
  await expect.poll(() => page.evaluate(async studentId => new Promise<boolean>(resolve => {
    const open = indexedDB.open('quran-circles-change-feed', 1);
    open.onsuccess = () => {
      const db = open.result; if (!db.objectStoreNames.contains('rows')) { db.close(); resolve(false); return; }
      const read = db.transaction('rows').objectStore('rows').getAll();
      read.onsuccess = () => { db.close(); resolve(read.result.some(row => row.id === studentId && !row.accountId.endsWith(':snapshot'))); };
    };
  }), fixtures.student.id)).toBe(true);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'تسجيل تسميع', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('الطالب', { exact: false }).selectOption(fixtures.student.id);
  await dialog.getByLabel('من سورة', { exact: false }).selectOption({ label: 'الفاتحة' });
  await dialog.getByLabel('إلى سورة', { exact: false }).selectOption({ label: 'الفاتحة' });
  await dialog.getByLabel('من آية', { exact: false }).fill('1');
  await dialog.getByLabel('إلى آية', { exact: false }).fill('7');
  await dialog.getByLabel('نوع التسميع').selectOption('MINOR_REVIEW');
  await dialog.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.getByTestId('queued-recitation')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('queued-recitation')).toHaveCount(1);
  const response = page.waitForResponse(response => response.url().endsWith('/api/sync/push') && response.ok());
  await context.setOffline(false);
  const result = (await (await response).json()).results[0];
  expect(result.status).toBe('applied'); expect(result.data.type).toBe('MINOR_REVIEW'); expect(result.data.points).toBe(7);
  await expect(page.getByTestId('queued-recitation')).toHaveCount(0);
});
