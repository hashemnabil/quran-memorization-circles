import { test, expect, type Page } from '@playwright/test';
import { gotoWithLocalUnlock, unlockLocalGate } from './local-security-helpers';
const account = '00000000-0000-4000-8000-000000000001';
const circle = { id: '00000000-0000-4000-8000-000000000002', name: 'حلقة الاختبار', code: 'C1' };
const student = { id: '00000000-0000-4000-8000-000000000003', selfAccountId: account, userId: account, fullName: 'طالب الاختبار', circleId: circle.id, circle };
const conversationId = '00000000-0000-4000-8000-000000000004';
const school = 'مدرسة عبدالله بن عمر لتعليم القران الكريم والسنة النبوية';
async function setup(page: Page, role = 'STUDENT') {
  const user = { id: account, role, fullName: role === 'TEACHER' ? 'محفظ الاختبار' : 'طالب الاختبار', username: 'personal-test', isActive: true, mustChangePassword: false };
  const requests: any[] = [];
  const conversation = { id: conversationId, title: 'إدارة المدرسة', type: 'DIRECT', canPost: true, members: [], unreadCount: 0, createdAt: new Date().toISOString() };
  await page.addInitScript(identity => { localStorage.setItem('qc.accessToken', 'test-token'); localStorage.setItem('qc.offlineUser', JSON.stringify(identity)); localStorage.setItem('qc.onboarding.completed', '1'); }, user);
  await page.routeWebSocket('**/socket.io/**', socket => socket.close());
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/settings/public' || path === '/api/settings') return route.fulfill({ json: { name: school } });
    if (path === '/api/announcements/active') return route.fulfill({ json: [] });
    if (path === '/api/students/me') return route.fulfill({ json: student });
    if (path === '/api/attendance/absence-permissions') return route.fulfill({ json: requests });
    if (path === '/api/chat/conversations') return route.fulfill({ json: [conversation] });
    if (path === '/api/chat/conversations/' + conversationId) return route.fulfill({ json: conversation });
    if (path === '/api/chat/conversations/' + conversationId + '/messages') return route.fulfill({ json: { data: [{ id: 'server-message', conversationId, body: 'مرحباً بك في مراسلات المدرسة', sender: { id: 'admin', fullName: 'الإدارة' }, createdAt: new Date().toISOString() }], meta: { hasNextPage: false } } });
    if (path === '/api/chat/conversations/' + conversationId + '/read') return route.fulfill({ json: { success: true } });
    if (path.endsWith('/unread-count')) return route.fulfill({ json: { count: 0 } });
    if (path === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
    if (path === '/api/sync-all/delta') return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } });
    if (path === '/api/sync-all') {
      if (route.request().method() === 'POST') {
        const outcomes = route.request().postDataJSON().operations.map((operation: any) => {
          expect(operation.table).toBe('absencePermissions');
          const request = { ...operation.data, id: operation.entityId, requesterId: account, status: 'PENDING', synced: 1 };
          requests.push(request); return { opId: operation.opId, status: 'applied', data: request };
        });
        return route.fulfill({ json: { outcomes } });
      }
      const table = url.searchParams.get('table');
      return route.fulfill({ json: { data: table === 'students' ? [student] : table === 'circles' ? [circle] : table === 'absencePermissions' ? requests : table === 'chatConversations' ? [conversation] : [], meta: { hasNextPage: false } } });
    }
    return route.fulfill({ json: { data: [], meta: { hasNextPage: false, total: 0 } } });
  });
  return { requests, user };
}
for (const role of ['STUDENT', 'TEACHER']) test(`${role} requests only their own date range, keeps it offline and submits it on reconnect`, async ({ page, context }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { requests } = await setup(page, role);
  await gotoWithLocalUnlock(page, '/absence-permissions');
  await expect(page).toHaveURL(/\/absence-permissions$/);
  await expect(page.getByRole('heading', { name: 'طلب إذن لنفسي' })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect.poll(() => page.evaluate(accountId => new Promise<boolean>(resolve => {
    const open = indexedDB.open('halaqatFull'); open.onsuccess = () => { const database = open.result; const read = database.transaction('meta').objectStore('meta').get(accountId + ':downloadedAt'); read.onsuccess = () => { database.close(); resolve(Boolean(read.result)); }; };
  }), account)).toBe(true);
  await context.setOffline(true);
  await page.getByRole('textbox', { name: 'من تاريخ', exact: true }).fill('2030-01-03');
  await page.getByRole('textbox', { name: 'إلى تاريخ', exact: true }).fill('2030-01-05');
  await page.getByRole('textbox', { name: 'سبب الغياب', exact: true }).fill('موعد طبي لثلاثة أيام');
  await expect(page.getByLabel('ملاحظة (اختياري)')).not.toHaveAttribute('required');
  await page.getByRole('button', { name: 'إرسال طلب الإذن', exact: true }).click();
  await expect(page.getByText('محفوظ على الجهاز · بانتظار الإرسال', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.reload(); await unlockLocalGate(page);
  await expect(page.getByText('السبب: موعد طبي لثلاثة أيام', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].requesterId).toBe(account);
  expect(requests[0].studentId).toBe(role === 'STUDENT' ? student.id : null);
  expect(requests[0].durationMinutes).toBe(3);
  await expect(page.getByText('بانتظار موافقة الإدارة', { exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'بدء التطبيق', exact: true })).not.toBeVisible();
  await page.screenshot({ path: info.outputPath('personal-leave.png'), fullPage: true });
});
test('the message composer follows the visual keyboard viewport and restores bottom navigation', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await gotoWithLocalUnlock(page, '/chat/' + conversationId);
  await expect(page.getByText('مرحباً بك في مراسلات المدرسة', { exact: true })).toBeVisible();
  const composer = page.getByPlaceholder('اكتب رسالتك...');
  await composer.fill('رسالة رسمية إلى إدارة المدرسة');
  await composer.focus();
  await page.evaluate(() => { Object.defineProperty(window.visualViewport!, 'height', { configurable: true, value: 420 }); window.visualViewport!.dispatchEvent(new Event('resize')); });
  await expect.poll(async () => (await composer.boundingBox())!.y + (await composer.boundingBox())!.height).toBeLessThanOrEqual(420);
  const send = page.getByRole('button', { name: 'إرسال', exact: true });
  await expect.poll(async () => (await send.boundingBox())!.y + (await send.boundingBox())!.height).toBeLessThanOrEqual(420);
  await expect.poll(async () => {
    const field = (await composer.boundingBox())!, pane = (await page.locator('.chat-conversation').boundingBox())!;
    return field.y + field.height <= pane.y + pane.height;
  }).toBe(true);
  await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي للجوال' })).not.toBeVisible();
  await expect(composer).toHaveValue('رسالة رسمية إلى إدارة المدرسة');
  await page.screenshot({ path: info.outputPath('chat-keyboard.png') });
  await page.evaluate(() => { delete (window.visualViewport as any).height; window.visualViewport!.dispatchEvent(new Event('resize')); });
  await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي للجوال' })).toBeVisible();
});
test('school branding, the donation entry and mosque image render locally', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('qc.onboarding.completed', '1'));
  await page.route('**/api/**', route => route.fulfill({ json: { name: 'مدرسة عبدالله بن عمر لتعلم القرآن الكريم والسنة النبوية' } }));
  await gotoWithLocalUnlock(page, '/login');
  await expect(page.getByRole('heading', { name: school, exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'بدء التطبيق', exact: true })).not.toBeVisible();
  await expect(page.locator('.login-panel').getByRole('link', { name: 'المساهمة والتبرع', exact: true })).toBeVisible();
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    // Viewport changes trigger responsive layout and resize handlers. Observe
    // the resulting layout rather than sampling during the resize transition.
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath('login-donation.png'), fullPage: true });
  const image = await page.request.get('/prayer-mosque.jpg');
  expect(image.ok()).toBe(true); expect(image.headers()['content-type']).toContain('image/jpeg');
});
test('the prayer card displays the mosque and keeps its asset available offline', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await gotoWithLocalUnlock(page, '/prayer-times');
  await expect(page.getByRole('status', { name: 'بدء التطبيق', exact: true })).not.toBeVisible();
  const card = page.getByRole('region', { name: 'مواقيت الصلاة — غزة' });
  await expect(card.locator('.prayer-slot')).toHaveCount(6);
  await expect.poll(() => card.locator('.prayer-mosque').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => page.evaluate(async () => !!await caches.match('/prayer-mosque.jpg'))).toBe(true);
  await page.screenshot({ path: info.outputPath('prayer-mosque.png'), fullPage: true });
  await context.setOffline(true);
  expect(await page.evaluate(async () => (await fetch('/prayer-mosque.jpg')).ok)).toBe(true);
  expect(await page.evaluate(async () => {
    const response = await fetch('/sounds/adhan.ogg');
    const bytes = new Uint8Array(await response.arrayBuffer());
    return response.ok && String.fromCharCode(...bytes.slice(0, 4)) === 'OggS' && bytes.length > 1000000;
  })).toBe(true);
});
test('shared interface stays usable on narrow screens, desktop and dark mode', async ({ page }, info) => {
  await setup(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await gotoWithLocalUnlock(page, '/absence-permissions');
    await expect(page.locator('.page-heading h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width < 1024) {
      const navigation = page.getByRole('navigation', { name: 'التنقل الرئيسي للجوال' });
      await expect(navigation.locator('svg')).toHaveCount(5);
      for (const item of await navigation.locator('a, button').all()) {
        const bounds = await item.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
      }
    }
    await page.screenshot({ path: info.outputPath(`interface-${width}.png`), fullPage: true });
  }
  await page.evaluate(() => {
    localStorage.setItem('qc.theme', 'dark');
    window.dispatchEvent(new CustomEvent('qc:theme', { detail: 'dark' }));
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.page-heading h1')).toBeVisible();
  await page.screenshot({ path: info.outputPath('interface-dark.png'), fullPage: true });
});

test('bundled adhan preview plays and stops from the prayer settings', async ({ page }) => {
  await setup(page);
  await gotoWithLocalUnlock(page, '/prayer-times/reminders');
  await expect(page.getByRole('status', { name: 'بدء التطبيق', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'معاينة الأذان', exact: true }).click();
  await expect(page.getByRole('button', { name: 'إيقاف المعاينة', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'إيقاف المعاينة', exact: true }).click();
  await expect(page.getByRole('button', { name: 'معاينة الأذان', exact: true })).toBeVisible();
});
