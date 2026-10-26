import { test, expect } from '@playwright/test';

// PARENT login is explicitly disabled by the existing server. Do not enable it here.
for (const role of ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE', 'SUPPORT', 'STUDENT']) {
  test(`${role}: prayer card, internal navigation, settings and sound preview`, async ({ page }, info) => {
    const user = { id: `prayer-test-${role}`, username: 'prayer-test', fullName: 'حساب اختبار', role, isActive: true, mustChangePassword: false };
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('WebSocket') && !message.text().includes('ERR_CONNECTION_REFUSED')) console.log(message.text()); });
    await page.routeWebSocket('**/socket.io/**', socket => socket.close());
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/login' || path === '/api/auth/refresh') return route.fulfill({ json: { user, accessToken: 'test-access', refreshToken: 'test-refresh' } });
      if (path === '/api/auth/me') return route.fulfill({ json: user });
      if (path === '/api/settings/public') return route.fulfill({ json: { name: 'مدرسة عبدالله بن عمر', logoUrl: '/brand-logo.png' } });
      if (path === '/api/announcements/active') return route.fulfill({ json: [] });
      if (path === '/api/profile-reviews/me') return route.fulfill({ json: { profile: {}, review: null, verified: true } });
      if (path === '/api/dashboard/overview') return route.fulfill({ json: { role, counts: {}, pending: {}, attendanceToday: { rate: 0 }, weeklyAttendance: [], evaluationBreakdown: [], recentActivity: [], circles: [], students: [], children: [], tickets: [], upcomingExams: [] } });
      if (path === '/api/students/me') return route.fulfill({ json: { id: user.id, fullName: user.fullName, status: 'ACTIVE', circle: null, totalPoints: 0, memorizedParts: 0 } });
      if (path === '/api/students/me/history') return route.fulfill({ json: { exams: [], attendance: [], recitations: [], behaviors: [] } });
      if (path.endsWith('unread-count')) return route.fulfill({ json: { count: 0 } });
      if (path.startsWith('/api/offline-sync/') || path.startsWith('/api/sync/')) return route.fulfill({ json: { data: [], changes: [], meta: { hasNextPage: false }, serverTime: new Date().toISOString() } });
      return route.fulfill({ json: { data: [], meta: { hasNextPage: false, total: 0 } } });
    });
    await page.goto('/login');
    await page.getByLabel('اسم المستخدم', { exact: true }).fill(user.username);
    await page.getByLabel('كلمة المرور', { exact: true }).fill('test-password-2026');
    await page.getByRole('button', { name: 'دخول', exact: true }).click();
    const card = page.getByRole('region', { name: 'مواقيت الصلاة — غزة' });
    await expect(card).toBeVisible(); await expect(card.locator('.prayer-slot')).toHaveCount(6);
    await expect(card.locator('.prayer-countdown')).toHaveText(/\d{2}:\d{2}:\d{2}/);
    if (role === 'ADMIN') await page.screenshot({ path: info.outputPath('prayer-home.png'), fullPage: true });
    await card.getByRole('link', { name: 'عرض جميع المواقيت' }).click();
    await expect(page).toHaveURL(/\/prayer-times$/); await expect(page.locator('.prayer-row')).toHaveCount(6);
    await page.getByRole('button', { name: '→ رجوع', exact: true }).click();
    await expect(page).toHaveURL(url => ['/', '/student'].includes(url.pathname));
    await card.getByRole('link', { name: 'إعدادات التذكير' }).click();
    await expect(page.getByRole('heading', { name: 'إعدادات تذكيرات الصلاة', exact: true })).toBeVisible();
    await page.getByLabel('تفعيل تذكيرات الصلاة', { exact: true }).check();
    await page.getByLabel('موعد تذكير الفجر').selectOption('10');
    await page.getByRole('button', { name: 'حفظ الإعدادات' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'حُفظت' })).toBeVisible();
    expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`qc.prayers.v1:${id}`)!).prayers.fajr.before, user.id)).toBe(10);
    await page.goto('/profile/settings/notifications/sound');
    await expect(page.getByRole('heading', { name: 'صوت الإشعارات', exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'إشراقة — صوت هادئ' }).check();
    await page.getByRole('button', { name: 'معاينة إشراقة — صوت هادئ' }).click();
    await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/sounds/calm.wav')))).toBe(true);
    await page.getByRole('button', { name: 'حفظ الاختيار' }).click();
    expect(await page.evaluate(id => localStorage.getItem(`qc.notification-sound.v1:${id}`), user.id)).toBe('calm');
    await page.getByRole('radio', { name: 'بدون صوت' }).check();
    await page.getByRole('button', { name: 'حفظ الاختيار' }).click();
    expect(await page.evaluate(id => localStorage.getItem(`qc.notification-sound.v1:${id}`), user.id)).toBe('silent');
    if (role === 'ADMIN') {
      await page.locator('input[type=file]').setInputFiles('public/sounds/clear.wav');
      await expect(page.getByRole('radio', { name: 'clear.wav', exact: true })).toBeChecked();
      await page.reload();
      await expect(page.getByRole('radio', { name: 'بدون صوت', exact: true })).toBeChecked();
      await expect(page.getByRole('radio', { name: 'clear.wav', exact: true })).toHaveCount(0);
      await page.locator('input[type=file]').setInputFiles('public/sounds/clear.wav');
      await expect(page.getByRole('radio', { name: 'clear.wav', exact: true })).toBeChecked();
      await page.getByRole('button', { name: 'حفظ الاختيار' }).click();
      await page.reload();
      await expect(page.getByRole('radio', { name: 'clear.wav', exact: true })).toBeChecked();
      expect(await page.evaluate(() => localStorage.getItem('qc.notification-sound.v1:other-account'))).toBeNull();
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
      // Bundled sounds and routes must survive a real network-offline reload.
      await page.context().setOffline(true);
      await page.goto('/prayer-times');
      await expect(page.getByRole('heading', { name: 'مواقيت الصلاة', exact: true })).toBeVisible();
      await expect(page.locator('.prayer-slot')).toHaveCount(6);
      const offlineSound = await page.evaluate(async () => { const cached = await caches.match('/sounds/calm.wav', { ignoreVary: true }); const response = await fetch('/sounds/calm.wav'); return { status: response.status, bytes: (await response.arrayBuffer()).byteLength, cachedStatus: cached?.status, controlled: !!navigator.serviceWorker.controller }; });
      expect(offlineSound).toMatchObject({ status: 200, cachedStatus: 200, controlled: true });
      expect(offlineSound.bytes).toBeGreaterThan(44);
      await expect(page.getByRole('status', { name: 'بدء التطبيق' })).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('prayer-offline.png'), fullPage: true });
    }
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
