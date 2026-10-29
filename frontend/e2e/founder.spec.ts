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
  const picker = page.getByLabel('غلاف الملف الشخصي', { exact: true });
  await expect(picker.getByRole('option', { name: 'المسجد الأخضر', exact: true })).toHaveCount(1);
  await picker.selectOption('asset-one');
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
  await page.getByLabel('اختر صوتاً من المكتبة', { exact: true }).selectOption('adhan-sample');
  const preview = page.getByRole('button', { name: 'معاينة الصوت', exact: true });
  await expect(preview).toBeEnabled(); await preview.click();
  await expect.poll(() => page.evaluate(() => (window as any).__playedCuratedAudio)).toBe(true);
  await page.getByRole('button', { name: 'إيقاف', exact: true }).click();
});

test('only founder sees additional-founder creation and confirms their identity separately', async ({ page }) => {
  await setup(page, [], 'FOUNDER');
  const requests: any[] = [];
  await page.route('**/api/founder/accounts', route => { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { id: 'new-owner', username: 'second.owner', role: 'FOUNDER', mustChangePassword: true } }); });
  await gotoWithLocalUnlock(page, '/founder/users');
  await page.getByRole('button', { name: 'إضافة مؤسس آخر', exact: true }).click();
  await page.getByLabel('اسم مستخدم المؤسس الجديد', { exact: true }).fill('second.owner');
  await page.getByLabel('اسم المؤسس الجديد', { exact: true }).fill('مؤسس ثانٍ');
  await page.getByLabel('كلمة المرور المؤقتة للمؤسس الجديد', { exact: true }).fill('Temporary-password123');
  await page.getByLabel('كلمة مرور حسابك لتأكيد الإضافة', { exact: true }).fill('Current-owner-password');
  await page.getByRole('button', { name: 'إنشاء حساب المؤسس', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].username).toBe('second.owner');
  expect(requests[0].currentPassword).toBe('Current-owner-password');
  expect(requests[0]).not.toHaveProperty('role');
  await expect(page.getByRole('dialog', { name: 'إضافة حساب مؤسس جديد' })).not.toBeVisible();
});

test('founder can update their own name through identity-confirmed account settings', async ({ page }) => {
  const { user } = await setup(page, [], 'FOUNDER');
  const requests: any[] = [];
  await page.route('**/api/founder/accounts/me', route => { const body = route.request().postDataJSON(); requests.push(body); return route.fulfill({ json: { ...user, fullName: body.fullName } }); });
  await gotoWithLocalUnlock(page, '/founder/users');
  await page.getByRole('button', { name: 'تعديل حسابي كمؤسس', exact: true }).click();
  await page.getByLabel('اسمي في حساب المؤسس', { exact: true }).fill('اسم المؤسس المحدّث');
  await page.getByLabel('كلمة مروري لتأكيد تعديل حسابي', { exact: true }).fill('Confirmed-owner-password');
  await page.getByRole('button', { name: 'حفظ بيانات حسابي', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].fullName).toBe('اسم المؤسس المحدّث');
  expect(requests[0]).not.toHaveProperty('id'); expect(requests[0]).not.toHaveProperty('role');
  await expect(page.getByRole('dialog', { name: 'تعديل بيانات حساب المؤسس' })).not.toBeVisible();
});
