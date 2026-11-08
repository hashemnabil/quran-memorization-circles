import { test, expect } from '@playwright/test';
import { gotoWithLocalUnlock } from './local-security-helpers';

test('honor roll shows ten students from different circles and refreshes the winner', async ({ page }) => {
  const user = { id: '00000000-0000-4000-8000-000000000091', username: 'honor-student', fullName: 'طالب لوحة الشرف', role: 'STUDENT', isActive: true, mustChangePassword: false };
  const student = { id: '00000000-0000-4000-8000-000000000092', fullName: user.fullName, code: 'ST-92', status: 'ACTIVE', memorizedParts: 0, surahAchievements: [] };
  let students = Array.from({ length: 10 }, (_, i) => ({ id: `honor-${i}`, rank: i + 1, fullName: `نجم المدرسة ${i + 1}`, circleName: `حلقة ${i + 1}`, teacherName: `الشيخ ${i + 1}`, points: 100 - i }));
  const fullRanking = Array.from({ length: 63 }, (_, i) => ({ id: `rank-${i}`, rank: i + 1, fullName: `طالب الترتيب ${i + 1}`, circleName: `حلقة ${i + 1}`, teacherName: `الشيخ ${i + 1}`, points: 62 - i }));
  await page.addInitScript(user => {
    localStorage.setItem('qc.onboarding.completed', '1'); localStorage.setItem('qc.accessToken', 'test-token'); localStorage.setItem('qc.offlineUser', JSON.stringify(user));
  }, user);
  await page.routeWebSocket('**/socket.io/**', socket => socket.close());
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/dashboard/honor-roll') return route.fulfill({ json: { updatedAt: new Date().toISOString(), students } });
    if (path === '/api/dashboard/honor-roll/circles') return route.fulfill({ json: [{ id: 'circle-1', name: 'حلقة 1' }] });
    if (path === '/api/dashboard/honor-roll/circle') return route.fulfill({ json: { updatedAt: new Date().toISOString(), students: students.filter(item => item.circleName === 'حلقة 1') } });
    if (path === '/api/dashboard/student-ranking') return route.fulfill({ json: { updatedAt: new Date().toISOString(), students: fullRanking } });
    if (path === '/api/students/me') return route.fulfill({ json: student });
    if (path === '/api/students/me/history') return route.fulfill({ json: { recitations: [], attendance: [], exams: [] } });
    if (path === '/api/profile-reviews/me') return route.fulfill({ json: { profile: student, kind: 'STUDENT', requests: [] } });
    if (path === '/api/settings/public') return route.fulfill({ json: { name: 'مدرسة الاختبار' } });
    if (path.endsWith('/unread-count')) return route.fulfill({ json: { count: 0 } });
    if (path === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
    if (path === '/api/sync-all/delta') return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } });
    if (['/api/notifications', '/api/preparations', '/api/sync-all'].includes(path)) return route.fulfill({ json: { data: [], meta: { hasNextPage: false } } });
    return route.fulfill({ json: [] });
  });
  await gotoWithLocalUnlock(page, '/');
  const board = page.getByRole('region', { name: 'لوحة شرف المدرسة', exact: true });
  await expect(board.locator('li[data-student-id]')).toHaveCount(10);
  const circleBoard = page.getByRole('region', { name: 'لوحة شرف الحلقة', exact: true });
  await expect(circleBoard.getByRole('list', { name: 'ترتيب لوحة شرف الحلقة' }).locator('li')).toHaveCount(1);
  await expect(circleBoard.getByText('حلقة 1', { exact: true }).first()).toBeVisible();
  await expect(board.getByRole('list', { name: 'ترتيب لوحة الشرف' }).locator('li').first().getByRole('img', { name: /ميدالية المركز/ })).toBeVisible();
  await expect(board.getByText('الشيخ: الشيخ 1', { exact: true })).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => board.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    const positions = await board.locator('li[data-student-id]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
    expect(positions.every((top, index) => index === 0 || top > positions[index - 1])).toBe(true);
    const first = board.locator('li[data-student-id]').first();
    const nameBox = await first.locator('h3').boundingBox();
    const teacherBox = await first.getByText('الشيخ: الشيخ 1', { exact: true }).boundingBox();
    const pointsBox = await first.locator('strong').boundingBox();
    expect(nameBox!.x).toBeGreaterThan(teacherBox!.x);
    expect(teacherBox!.x).toBeGreaterThan(pointsBox!.x);
  }
  students = [students[1], students[0], ...students.slice(2)].map((entry, i) => ({ ...entry, rank: i + 1, points: i === 0 ? 110 : entry.points }));
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(board.getByRole('list', { name: 'ترتيب لوحة الشرف' }).locator('li').first()).toHaveAttribute('data-student-id', 'honor-1');
  await expect(board.getByText(/^(110|١١٠)$/)).toBeVisible();
  await page.getByRole('link', { name: 'عرض جميع الطلاب', exact: true }).click();
  await expect(page).toHaveURL(/\/student-ranking$/);
  const allRanks = page.getByRole('list', { name: 'ترتيب جميع الطلاب' });
  await expect(allRanks.locator('li')).toHaveCount(50);
  await page.getByRole('button', { name: 'التالي', exact: true }).click();
  await expect(allRanks.locator('li')).toHaveCount(13);
  await expect(allRanks.locator('li').last()).toHaveAttribute('data-student-id', 'rank-62');
  await page.getByLabel('ابحث عن طالب أو شيخ أو حلقة').fill('طالب الترتيب 63');
  await expect(allRanks.locator('li')).toHaveCount(1);
  await expect(allRanks.getByRole('img', { name: /ميدالية المركز (63|٦٣)/ })).toBeVisible();
  await expect(page.locator('.sidebar-nav-active:visible')).toHaveCount(1);
  await expect(page.locator('.sidebar-nav-active:visible')).toHaveAttribute('aria-label', 'ترتيب الطلاب');
});
