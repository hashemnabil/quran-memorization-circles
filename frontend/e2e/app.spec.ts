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
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('status', { name: 'بدء التطبيق' })).not.toBeVisible();
      await expect(page.locator('h1').first()).toBeVisible();
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
