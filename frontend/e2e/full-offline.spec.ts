import { test, expect } from '@playwright/test';
const account = '00000000-0000-4000-8000-000000000001';
const circleId = '00000000-0000-4000-8000-000000000002';
const user = { id: account, username: 'offline-test', fullName: 'مدير الاختبار', role: 'ADMIN', isActive: true, mustChangePassword: false };
const fixtures: Record<string, any[]> = {
  students: [{ id: '00000000-0000-4000-8000-000000000003', fullName: 'طالب أوفلاين', code: 'ST-1', status: 'ACTIVE', gender: 'MALE', circleId, circle: { id: circleId, name: 'حلقة الأوفلاين' }, memorizedParts: 1, totalPoints: 0, createdAt: '2026-10-15T00:00:00Z' }],
  circles: [{ id: circleId, name: 'حلقة الأوفلاين', code: 'C-1', isActive: true, capacity: 20, studentsCount: 1, teachers: [], scheduleDays: [], students: [] }],
  teachers: [{ id: '00000000-0000-4000-8000-000000000004', isActive: true, user: { id: 'teacher-user', fullName: 'معلم أوفلاين', isActive: true }, circleRoles: [] }],
};
test('cold offline navigation opens downloaded core screens and searches locally', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((identity) => {
    localStorage.setItem('qc.onboarding.completed', '1');
    localStorage.setItem('qc.accessToken', 'test-token');
    localStorage.setItem('qc.offlineUser', JSON.stringify(identity));
  }, user);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: user });
    if (url.pathname === '/api/sync-all') return route.fulfill({ json: { data: fixtures[url.searchParams.get('table') || ''] || [], meta: { hasNextPage: false } } });
    if (url.pathname === '/api/settings/public') return route.fulfill({ json: { name: 'اختبار الأوفلاين' } });
    if (url.pathname.endsWith('/unread-count')) return route.fulfill({ json: { count: 0 } });
    if (url.pathname.includes('/announcements')) return route.fulfill({ json: [] });
    return route.fulfill({ status: 403, json: { message: 'Unused in this offline test' } });
  });
  await page.goto('/settings/offline');
  await expect(page.getByRole('heading', { name: 'إدارة البيانات المحلية' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('halaqatFull');
    request.onsuccess = () => { const db = request.result; const read = db.transaction('meta').objectStore('meta').get('00000000-0000-4000-8000-000000000001:downloadedAt'); read.onsuccess = () => { resolve(Boolean(read.result)); db.close(); }; };
  }))).toBe(true);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
  await context.setOffline(true);
  for (const path of ['/students', '/circles', '/teachers', '/attendance', '/recitations', '/reports', '/settings/offline', '/']) {
    await page.goto(path);
    await expect(page.locator('main h1').first(), `${path}: ${errors.join('; ')}`).toBeVisible();
    await expect(page.locator('main')).not.toContainText('تعذر تحميل');
  }
  await page.goto('/students');
  await expect(page.locator('main')).toContainText('طالب أوفلاين');
  const search = page.getByPlaceholder('بحث بالاسم أو رقم الطالب أو رقم الهوية...');
  await search.fill('اسم غير موجود');
  await expect(page.locator('main')).not.toContainText('طالب أوفلاين');
  await search.fill('طالب أوفلاين');
  await expect(page.locator('main')).toContainText('طالب أوفلاين');
  expect(errors).toEqual([]);
});
