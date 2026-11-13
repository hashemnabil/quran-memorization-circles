import { test, expect } from '@playwright/test';
import { fillLoginCredentials, gotoWithLocalUnlock, unlockLocalGate } from './local-security-helpers';
import { resolveRules } from '../src/lib/learning-rules';
import { SURAHS } from '../src/lib/quran-surahs';
test('Mushaf uses selectable words, two-tap errors, undo and encrypted draft restoration on mobile', async ({ page }) => {
    test.setTimeout(90000);
    const user = { id: '00000000-0000-4000-8000-000000000151', username: 'mushaf-test', fullName: 'معلم المصحف', role: 'ADMIN', isActive: true, mustChangePassword: false };
    const circle = { id: '00000000-0000-4000-8000-000000000152', name: 'حلقة المصحف', code: 'M-1' };
    const student = { id: '00000000-0000-4000-8000-000000000153', fullName: 'طالب المصحف', code: 'MS-1', circleId: circle.id, status: 'ACTIVE' };
    const rules = resolveRules({ revision: '00000000-0000-4000-8000-000000000154' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('qc.onboarding.completed', '1'));
    await page.routeWebSocket('**/socket.io/**', s => s.close());
    await page.route('**/api/**', route => { const url = new URL(route.request().url()), p = url.pathname; if (p === '/api/auth/login')
        return route.fulfill({ json: { user, accessToken: 'test-token', refreshToken: 'test-refresh' } }); if (p === '/api/auth/me')
        return route.fulfill({ json: user }); if (p === '/api/settings/public')
        return route.fulfill({ json: { name: 'مدرسة المصحف' } }); if (p === '/api/circles/options')
        return route.fulfill({ json: [circle] }); if (p === '/api/students')
        return route.fulfill({ json: { data: [student], meta: { total: 1, hasNextPage: false } } }); if (p === '/api/recitations/surahs')
        return route.fulfill({ json: SURAHS }); if (p === '/api/recitations/learning-settings')
        return route.fulfill({ json: rules }); if (p === '/api/recitations/grading-settings')
        return route.fulfill({ json: rules }); if (p === '/api/recitations/history')
        return route.fulfill({ json: { data: [], meta: { total: 0, totalPages: 1, hasNextPage: false } } }); if (p === '/api/sync-all/watermark')
        return route.fulfill({ json: { cursor: '0' } }); if (p === '/api/sync-all/delta')
        return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } }); if (p === '/api/sync-all')
        return route.fulfill({ json: { data: [], meta: { hasNextPage: false } } }); if (p.endsWith('/unread-count'))
        return route.fulfill({ json: { count: 0 } }); if (p === '/api/dashboard/overview')
        return route.fulfill({ json: { role: 'ADMIN', counts: {}, pending: {}, weeklyAttendance: [], attendanceToday: {}, evaluationBreakdown: [], activity: [] } }); return route.fulfill({ json: [] }); });
    await gotoWithLocalUnlock(page, '/login');
    await fillLoginCredentials(page, user.username, 'Mushaf Test Password 27');
    await page.getByRole('button', { name: 'دخول', exact: true }).click();
    await unlockLocalGate(page);
    await gotoWithLocalUnlock(page, '/recitations');
    await page.getByRole('button', { name: 'تسجيل تسميع', exact: true }).click();
    await page.getByRole('dialog', {name:'تسجيل تسميع',exact:true}).getByRole('combobox',{name:/الطالب/}).selectOption(student.id);
    await page.getByRole('button', { name: /الأخطاء على المصحف/ }).click();
    const reader = page.getByRole('dialog', { name: 'الأخطاء على المصحف', exact: true });
    await expect(reader.locator('.mushaf-paper')).toBeVisible();
    await expect(reader.locator('img,canvas')).toHaveCount(0);
    await expect.poll(() => reader.locator('.mushaf-paper').evaluate(n => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    const first = reader.locator('button.mushaf-word.in-range').first();
    await first.click();
    await page.getByRole('button', { name: /^خطأ في كلمة/ }).click();
    await expect(reader.locator('.marked-mistake')).toHaveCount(1);
    await page.getByRole('button', { name: 'تراجع', exact: true }).click();
    await expect(reader.locator('.marked-mistake')).toHaveCount(0);
    await first.click();
    await page.getByRole('button', { name: /^تنبيه/ }).click();
    await page.getByRole('button', { name: 'إنهاء والعودة للتسميع', exact: true }).click();
    const warningCounter = page.getByRole('group', { name: 'عدد التنبيهات', exact: true });
    const mistakeCounter = page.getByRole('group', { name: 'عدد الأخطاء', exact: true });
    await expect(warningCounter.locator('output')).toHaveText('1');
    await expect(mistakeCounter.locator('output')).toHaveText('0');
    await warningCounter.getByRole('button', { name: 'زيادة عدد التنبيهات' }).click();
    await expect(warningCounter.locator('output')).toHaveText('2');
    await warningCounter.getByRole('button', { name: 'إنقاص عدد التنبيهات' }).click();
    await expect(warningCounter.locator('output')).toHaveText('1');
    await page.reload();
    await unlockLocalGate(page);
    await page.getByRole('button', { name: 'تسجيل تسميع', exact: true }).click();
    await expect(page.getByRole('group', { name: 'عدد التنبيهات', exact: true }).locator('output')).toHaveText('1');
    await page.getByRole('button', { name: /الأخطاء على المصحف/ }).click();
    await expect(page.locator('.marked-warning')).toHaveCount(1);
});

test('standalone mushaf is available from navigation for students and supports page browsing', async ({ page }) => {
  const user = { id: '00000000-0000-4000-8000-000000000161', username: 'reader', fullName: 'قارئ المصحف', role: 'STUDENT', isActive: true, mustChangePassword: false };
  await page.addInitScript(u => {
    localStorage.setItem('qc.onboarding.completed', '1');
    localStorage.setItem('qc.accessToken', 'reader-token');
    localStorage.setItem('qc.offlineUser', JSON.stringify(u));
  }, user);
  await page.routeWebSocket('**/socket.io/**', socket => socket.close());
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/settings/public') return route.fulfill({ json: { name: 'مدرسة المصحف' } });
    if (path.endsWith('/unread-count')) return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: [] });
  });
  await gotoWithLocalUnlock(page, '/mushaf');
  const reader = page.getByRole('dialog', { name: 'المصحف الشريف' });
  await expect(reader).toBeVisible();
  await expect(reader.getByRole('article', { name: 'صفحة 1' })).toBeVisible();
  await expect(reader.getByRole('button', { name: 'تفاصيل الأخطاء' })).toHaveCount(0);
  await reader.getByRole('button', { name: 'التالية' }).click();
  await expect(reader.getByRole('article', { name: 'صفحة 2' })).toBeVisible();
  await page.reload();
  await unlockLocalGate(page);
  const restored = page.getByRole('dialog', { name: 'المصحف الشريف' });
  await expect(restored.getByRole('article', { name: 'صفحة 2' })).toBeVisible();
  await restored.getByRole('button', { name: 'العودة للرئيسية' }).click();
  await expect(page).toHaveURL(url => url.pathname === '/');
});
