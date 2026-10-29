import { test, expect, type Page } from '@playwright/test';
import { gotoWithLocalUnlock } from './local-security-helpers';
const id = '00000000-0000-4000-8000-000000000031';
const popup = (changes: Record<string, unknown> = {}) => ({ id, title: 'إعلان الاختبار العام', body: 'التسجيل للفصل الجديد', audience: [], isActive: true, publishedAt: '2020-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', popup: { placement: 'BOTH', repeat: 'ONCE_DEVICE', state: 'PUBLISHED', priority: 1, requireAck: false, important: false, buttonText: '', imageAssetId: '' }, ...changes });
async function setup(page: Page, rows: any[], role?: string) {
  const user = { id: '00000000-0000-4000-8000-000000000032', username: 'founder-test', fullName: 'حساب الاختبار', role, isActive: true, mustChangePassword: false };
  await page.addInitScript(({ user, role }) => { localStorage.setItem('qc.onboarding.completed', '1'); if (role) { localStorage.setItem('qc.accessToken', 'test-token'); localStorage.setItem('qc.offlineUser', JSON.stringify(user)); } }, { user, role });
  await page.routeWebSocket('**/socket.io/**', socket => socket.close());
  const events: any[] = [], saves: any[] = [];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return role ? route.fulfill({ json: user }) : route.fulfill({ status: 401, json: {} });
    if (path.includes('/auth/refresh')) return route.fulfill({ status: 401, json: {} });
    if (path === '/api/settings/public') return route.fulfill({ json: { name: 'مدرسة الاختبار' } });
    if (path === '/api/popup-announcements/public' || path === '/api/popup-announcements/active') return route.fulfill({ json: rows });
    if (path.endsWith('/event') || path.endsWith('/public-event')) { events.push(route.request().postDataJSON()); return route.fulfill({ json: { saved: true } }); }
    if (path === '/api/popup-announcements/save') { saves.push(route.request().postDataJSON()); return route.fulfill({ json: {} }); }
    if (path === '/api/founder/overview') return route.fulfill({ json: { users: 10, students: 5, teachers: 2, supervisors: 1, circles: 3, courses: 1 } });
    if (path === '/api/founder/audit' || path === '/api/popup-announcements/manage' || path === '/api/founder-assets' || path === '/api/founder-assets/choices' || path === '/api/announcements/active') return route.fulfill({ json: [] });
    return route.fulfill({ json: { data: [], meta: { hasNextPage: false }, count: 0 } });
  });
  return { events, saves, user };
}
test('public popup records actual display, closes without blocking login and does not repeat after reload', async ({ page }) => {
  const { events } = await setup(page, [popup()]);
  await gotoWithLocalUnlock(page, '/login');
  await expect(page.getByRole('dialog', { name: 'إعلان الاختبار العام' })).toBeVisible();
  await expect.poll(() => events.filter(event => event.kind === 'VIEW').length).toBe(1);
  await page.getByRole('button', { name: 'إغلاق والمتابعة' }).click();
  await expect(page.getByLabel('اسم المستخدم', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'إعلان الاختبار العام' })).not.toBeVisible();
});
test('expired and role-private announcements cannot render on login even in a malformed public response', async ({ page }) => {
  await setup(page, [popup({ expiresAt: '2020-01-02' }), popup({ id: 'private', title: 'رسالة المحفظين الخاصة', audience: ['TEACHER'] })]);
  await gotoWithLocalUnlock(page, '/login');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  await expect(page.getByText('رسالة المحفظين الخاصة')).not.toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('founder uploads the original file as multipart data', async ({ page }) => {
  await setup(page, [], 'FOUNDER');
  let upload: { contentType: string; body: Buffer | null } | undefined;
  await page.route('**/api/founder-assets', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] });
    upload = { contentType: route.request().headers()['content-type'], body: route.request().postDataBuffer() };
    return route.fulfill({ json: { id: 'uploaded', title: 'Test background', kind: 'CHAT_BACKGROUND' } });
  });
  await gotoWithLocalUnlock(page, '/founder');
  await page.getByRole('button', { name: 'مكتبة الموارد', exact: true }).click();
  await page.getByLabel('عنوان المورد').fill('Test background');
  const bytes = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]);
  await page.locator('input[type="file"]').setInputFiles({ name: 'background.jpeg', mimeType: 'image/jpeg', buffer: bytes });
  await page.getByLabel('كلمة المرور لتأكيد العملية').fill('test-only-password');
  await page.getByRole('button', { name: 'إضافة للمكتبة', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'أُضيف المورد' })).toBeVisible();
  expect(upload?.contentType).toMatch(/^multipart\/form-data;.*boundary=/);
  expect(upload?.body?.includes(bytes)).toBe(true);
  expect(upload?.body?.toString()).toContain('filename="background.jpeg"');
  expect(upload?.body?.toString()).toContain('name="title"');
});

test('administrator cannot open founder interface', async ({ page }) => {
  await setup(page, [], 'ADMIN');
  await gotoWithLocalUnlock(page, '/founder');
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole('heading', { name: 'لوحة المؤسس' })).not.toBeVisible();
});
test('founder can preview without publishing and sees no device image upload outside library', async ({ page }, info) => {
  const { saves } = await setup(page, [], 'FOUNDER');
  await gotoWithLocalUnlock(page, '/founder');
  await expect(page.getByRole('heading', { name: 'لوحة المؤسس', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'الإعلانات العامة', exact: true }).click();
  await page.getByLabel('العنوان', { exact: true }).fill('معاينة الإعلان فقط');
  await page.getByRole('button', { name: 'معاينة الإعلان', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'معاينة — لم يُنشر الإعلان' })).toBeVisible();
  await page.getByRole('button', { name: 'الوضع الداكن', exact: true }).click();
  await page.screenshot({ path: info.outputPath('popup-mobile-preview.png') });
  expect(saves).toHaveLength(0);
});

test('offline reading confirmation survives reload and is synchronized after reconnect', async ({ page, context }) => {
  const row = popup(); row.popup.repeat = 'UNTIL_ACK'; row.popup.requireAck = true;
  const { events, user } = await setup(page, [row], 'TEACHER');
  await gotoWithLocalUnlock(page, '/prayer-times');
  await expect(page.getByRole('dialog', { name: row.title })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => page.evaluate(async () => !!await caches.match('/'))).toBe(true);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'اطلعت', exact: true }).click();
  await expect(page.getByRole('dialog', { name: row.title })).not.toBeVisible();
  expect(await page.evaluate(key => !!localStorage.getItem(key), `qc.popup.acks.${user.id}`)).toBe(true);
  await page.reload();
  await expect(page.getByRole('dialog', { name: row.title })).not.toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => events.some(event => event.kind === 'ACK')).toBe(true);
});

test('background picker contains only founder catalog choices without an image upload control', async ({ page }) => {
  await setup(page, [], 'TEACHER');
  await page.route('**/api/founder-assets', route => route.fulfill({ json: [{ id: 'asset-one', title: 'المسجد الأخضر', kind: 'PROFILE_COVER', mime: 'image/png' }] }));
  await gotoWithLocalUnlock(page, '/profile');
  // The background picker is now a compact plus button opening a gallery dialog.
  await page.getByRole('button', { name: 'غلاف الملف الشخصي', exact: true }).click();
  const gallery = page.getByRole('dialog', { name: 'اختيار غلاف الملف الشخصي' });
  await expect(gallery.getByRole('button', { name: 'المسجد الأخضر' })).toBeVisible();
  await gallery.getByRole('button', { name: 'المسجد الأخضر' }).click();
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.includes('PROFILE_COVER') && localStorage.getItem(key) === 'asset-one'))).toBe(true);
});

test('founder audio selection plays the cached recording from the web sound library', async ({ page }) => {
  await setup(page, [], 'TEACHER');
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { const source = this.src; return play.call(this).then(() => { (window as any).__playedCuratedAudio = source.startsWith('blob:'); }); };
  });
  await page.route('**/api/founder-assets', route => route.fulfill({ json: [{ id: 'adhan-sample', title: 'أذان المكتبة', kind: 'ADHAN_SOUND', mime: 'audio/ogg' }] }));
  await page.route('**/api/founder-assets/adhan-sample/content', route => route.fulfill({ path: 'public/sounds/adhan.ogg', contentType: 'audio/ogg' }));
  await gotoWithLocalUnlock(page, '/prayer-times/reminders');
  // The adhan library is integrated into the recording selector.
  const recording = page.getByRole('combobox', { name: 'تسجيل الأذان' });
  await expect(recording.getByRole('option', { name: 'أذان المكتبة' })).toBeVisible();
  await recording.selectOption('library:adhan-sample');
  await expect(recording).toHaveValue('library:adhan-sample');
  const preview = page.getByRole('button', { name: 'معاينة الأذان', exact: true });
  await expect(preview).toBeEnabled(); await preview.click();
  await expect(page.getByRole('button', { name: 'إيقاف المعاينة', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'إيقاف المعاينة', exact: true }).click();
});
