import { test, expect } from '@playwright/test';
import { gotoWithLocalUnlock } from './local-security-helpers';

test('own community profile supports avatar upload without cover editing', async ({ page }) => {
  const user = { id: '00000000-0000-4000-8000-000000000061', username: 'photo-owner', fullName: 'صاحب الملف', role: 'ADMIN', isActive: true, mustChangePassword: false };
  const other = '00000000-0000-4000-8000-000000000062';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
  let avatarUrl: string | null = null;
  await page.addInitScript(user => {
    localStorage.setItem('qc.onboarding.completed', '1'); localStorage.setItem('qc.accessToken', 'test-token'); localStorage.setItem('qc.offlineUser', JSON.stringify(user));
  }, user);
  await page.routeWebSocket('**/socket.io/**', socket => socket.close());
  await page.route('**/uploads/avatars/own.jpg', route => route.fulfill({ body: png, contentType: 'image/png' }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { ...user, avatarUrl } });
    if (path === '/api/auth/profile' && route.request().method() === 'PATCH') { avatarUrl = route.request().postDataJSON().avatarUrl; return route.fulfill({ json: { ...user, avatarUrl } }); }
    if (path === '/api/uploads/avatar') return route.fulfill({ json: { url: '/uploads/avatars/own.jpg' } });
    if (path.startsWith('/api/community/users/')) return route.fulfill({ json: { ...user, id: path.endsWith(other) ? other : user.id, avatarUrl } });
    if (path === '/api/community/school' || path === '/api/settings/public') return route.fulfill({ json: { name: 'مدرسة الاختبار' } });
    if (path === '/api/community/school/follow') return route.fulfill({ json: { following: false, count: 0 } });
    if (path.endsWith('/unread-count')) return route.fulfill({ json: { count: 0 } });
    if (path === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
    if (path === '/api/sync-all/delta') return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } });
    if (path === '/api/sync-all') return route.fulfill({ json: { data: [], meta: { hasNextPage: false } } });
    return route.fulfill({ json: [] });
  });
  await gotoWithLocalUnlock(page, '/community/users/me');
  await expect(page.getByRole('button', { name: 'تغيير الصورة الشخصية', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تغيير الغلاف', exact: true })).toHaveCount(0);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'تغيير الصورة الشخصية', exact: true }).click();
  await (await chooser).setFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('dialog', { name: 'تحديد الصورة الشخصية' })).toBeVisible();
  await page.getByRole('button', { name: 'حفظ الصورة', exact: true }).click();
  await expect.poll(() => avatarUrl).toBe('/uploads/avatars/own.jpg');
  await gotoWithLocalUnlock(page, '/community/users/' + other);
  await expect(page.getByRole('button', { name: 'تغيير الصورة الشخصية', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'تغيير الغلاف', exact: true })).toHaveCount(0);
});
