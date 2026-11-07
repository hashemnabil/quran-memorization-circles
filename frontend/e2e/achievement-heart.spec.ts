import { test, expect } from '@playwright/test';
import { gotoWithLocalUnlock } from './local-security-helpers';

for (const [stage, colour] of [['MEMORIZED','#f4cf58'], ['REVIEWED','#c94747'], ['CONSOLIDATED','#258263']] as const) {
  test(`native Quran heart renders ${stage} without image or canvas`, async ({ page }) => {
    const user = { id: '00000000-0000-4000-8000-000000000071', username: 'heart-preview', fullName: 'مشرف الإنجازات', role: 'ADMIN', isActive: true, mustChangePassword: false };
    const student = { id: '00000000-0000-4000-8000-000000000072', fullName: 'طالب القلب القرآني', code: 'ST-72', status: 'ACTIVE', memorizedParts: 1, totalPoints: 0, circle: { name: 'حلقة الاختبار' }, surahAchievements: [{ surah: 'الفاتحة', stage, memorizedAt: '2026-11-01T00:00:00Z' }] };
    await page.addInitScript(({ user }) => {
      localStorage.setItem('qc.onboarding.completed', '1');
      localStorage.setItem('qc.accessToken', 'test-token');
      localStorage.setItem('qc.offlineUser', JSON.stringify(user));
      HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    }, { user });
    await page.routeWebSocket('**/socket.io/**', socket => socket.close());
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/me') return route.fulfill({ json: user });
      if (path === '/api/students/' + student.id) return route.fulfill({ json: student });
      if (path === '/api/settings/public') return route.fulfill({ json: { name: 'مدرسة الاختبار' } });
      if (path === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
      if (path === '/api/sync-all/delta') return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } });
      if (path === '/api/sync-all') return route.fulfill({ json: { data: [], meta: { hasNextPage: false } } });
      if (path.endsWith('/unread-count')) return route.fulfill({ json: { count: 0 } });
      return route.fulfill({ json: [] });
    });
    await gotoWithLocalUnlock(page, '/students/achievements/' + student.id);
    const artwork = page.getByRole('img', { name: /قلبي القرآني: 1 سورة/ });
    await artwork.scrollIntoViewIfNeeded();
    await expect(artwork).toBeVisible();
    await expect(artwork.locator('g[data-surah]')).toHaveCount(114);
    await expect(artwork.locator('g[data-surah="الفاتحة"] path')).toHaveAttribute('fill', colour);
    await expect(artwork.locator('g[data-surah="البقرة"] path')).toHaveAttribute('fill', '#fffefb');
    const figure = page.locator('figure').filter({ has: artwork });
    await expect(figure.locator('img, canvas, image')).toHaveCount(0);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => artwork.evaluate(node => node.getBoundingClientRect().width)).toBeLessThanOrEqual(662);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
