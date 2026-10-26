import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const account = '00000000-0000-4000-8000-000000000001';
const circleId = '00000000-0000-4000-8000-000000000002';
const user = { id: account, username: 'offline-test', fullName: 'مدير الاختبار', role: 'ADMIN', isActive: true, mustChangePassword: false };
const schoolName = 'مدرسة عبدالله بن عمر لتحفيظ القرآن الكريم والسنة النبوية';
// These existing domain tests exercise returning users. First-visit behavior
// is covered separately in introduction.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qc.onboarding.completed', '1'));
});
const fixtures: Record<string, any[]> = {
  students: [{ id: '00000000-0000-4000-8000-000000000003', fullName: 'طالب أوفلاين', code: 'ST-1', status: 'ACTIVE', gender: 'MALE', circleId, circle: { id: circleId, name: 'حلقة الأوفلاين' }, memorizedParts: 1, totalPoints: 0, createdAt: '2026-10-15T00:00:00Z' }],
  circles: [{ id: circleId, name: 'حلقة الأوفلاين', code: 'C-1', isActive: true, capacity: 20, studentsCount: 1, teachers: [], scheduleDays: [], students: [] }],
  teachers: [{ id: '00000000-0000-4000-8000-000000000004', isActive: true, user: { id: 'teacher-user', fullName: 'معلم أوفلاين', isActive: true }, circleRoles: [] }],
  dutyTeachers: [{ id: '00000000-0000-4000-8000-000000000005', fullName: 'محفظ النظام' }],
};

for (const rejected of [false, true]) {
  test(`password login survives real browser process restarts offline; reconnect ${rejected ? 'rejects revoked authorization without losing edits' : 'validates authorization and syncs once'}`, async ({}, info) => {
    test.setTimeout(120000);
    // Chromium's IndexedDB backing-store path exceeds Windows' path limit under
    // the repository's long test-results path. Keep this disposable profile short.
    const profile = await mkdtemp(join(tmpdir(), 'qc-offline-'));
    const origin = String(info.project.use.baseURL);
    const password = 'Local Browser Passphrase 27';
    let context: BrowserContext | undefined; let logins = 0; let posts = 0; let allowLogin = true; let offlineMode = false;
    let serverRows: any[] = [];
    const start = async (offline: boolean) => {
      offlineMode = offline;
      context = await chromium.launchPersistentContext(profile, { ...info.project.use.launchOptions, headless: true, offline, baseURL: origin, channel: info.project.use.channel, viewport: { width: 1280, height: 900 } });
      await context.addInitScript(() => localStorage.setItem('qc.onboarding.completed', '1'));
      await context.route('**/api/**', route => {
        if (offlineMode) return route.abort('internetdisconnected');
        const url = new URL(route.request().url()); const path = url.pathname;
        if (path === '/api/auth/login') {
          const input = route.request().postDataJSON();
          if (!allowLogin || input.username !== user.username || input.password !== password) return route.fulfill({ status: 401, json: { message: 'الحساب غير متاح' } });
          logins++; return route.fulfill({ json: { user, accessToken: `restart-access-${logins}`, refreshToken: `restart-refresh-${logins}` } });
        }
        if (path === '/api/auth/me') return route.fulfill({ status: allowLogin ? 200 : 401, json: allowLogin ? user : { message: 'الحساب غير متاح' } });
        if (path === '/api/settings/public' || path === '/api/settings') return route.fulfill({ json: { name: schoolName } });
        if (path === '/api/announcements/active') return route.fulfill({ json: [] });
        if (path === '/api/dashboard/overview') return route.fulfill({ json: { role: 'ADMIN', counts: {}, pending: {}, weeklyAttendance: [], attendanceToday: { present: 0, absent: 0, excused: 0 }, evaluationBreakdown: [], activity: [] } });
        if (path === '/api/circles/options') return route.fulfill({ json: fixtures.circles });
        if (path === '/api/attendance/sheet') return route.fulfill({ json: { circle: fixtures.circles[0], date: url.searchParams.get('date'), canSubmit: true, students: fixtures.students.map(student => ({ ...student, attendance: serverRows.find(row => row.studentId === student.id) || null })) } });
        if (path === '/api/notifications/recipients') return route.fulfill({ json: { users: [user], circles: fixtures.circles, studentsWithoutAccounts: [] } });
        if (path === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
        if (path === '/api/sync-all/delta') return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } });
        if (path === '/api/sync-all') {
          if (route.request().method() === 'POST') {
            if (!allowLogin || logins < 2 || route.request().headers().authorization !== `Bearer restart-access-${logins}`) return route.fulfill({ status: 401, json: { message: 'Server validation required' } });
            posts++; const operations = route.request().postDataJSON().operations;
            serverRows = operations.flatMap((op: any) => op.data.entries.map((entry: any) => ({ ...entry, id: `row-${entry.studentId}`, circleId: op.data.circleId, date: op.data.date, updatedAt: new Date().toISOString() })));
            return route.fulfill({ json: { outcomes: operations.map((op: any) => ({ opId: op.opId, status: 'applied', data: { rows: serverRows } })) } });
          }
          return route.fulfill({ json: { data: fixtures[url.searchParams.get('table') || ''] || [], meta: { hasNextPage: false } } });
        }
        return route.fulfill({ json: { data: [], meta: { hasNextPage: false, total: 0, totalPages: 1 } } });
      });
      const page = await context.newPage();
      for (const other of context.pages()) if (other !== page) await other.close();
      return page;
    };
    const signIn = async (page: Awaited<ReturnType<typeof start>>) => {
      await page.goto(`${origin}/login`);
      await page.getByLabel('اسم المستخدم', { exact: true }).fill(user.username);
      await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'دخول', exact: true }).click();
      await expect(page).not.toHaveURL(/\/login$/);
    };
    const queue = (page: Awaited<ReturnType<typeof start>>) => page.evaluate(() => new Promise<any[]>(resolve => {
      const open = indexedDB.open('halaqatFull'); open.onsuccess = () => { const database = open.result; const read = database.transaction('queue').objectStore('queue').getAll(); read.onsuccess = () => { database.close(); resolve(read.result); }; };
    }));
    try {
      let page = await start(false); await signIn(page);
      await page.goto(`${origin}/attendance?circleId=${circleId}`);
      await expect(page.getByText(fixtures.students[0].fullName, { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(account => new Promise<boolean>(resolve => {
        const open = indexedDB.open('halaqatFull'); open.onsuccess = () => { const database = open.result; const read = database.transaction('meta').objectStore('meta').get(`${account}:downloadedAt`); read.onsuccess = () => { database.close(); resolve(Boolean(read.result?.__sealedLocal)); }; };
      }), account)).toBe(true);
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      // Ordinary logout must preserve the encrypted verifier and local work.
      await page.goto(`${origin}/profile`);
      await page.locator('main').getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      await context!.close(); context = undefined;

      page = await start(true); await signIn(page);
      expect(logins).toBe(1); // No API login was possible in the restarted process.
      await page.goto(`${origin}/attendance?circleId=${circleId}`);
      await expect(page.getByText(fixtures.students[0].fullName, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'تعيين الكل غائب', exact: true }).click();
      await page.getByRole('button', { name: 'حفظ الكشف', exact: true }).first().click();
      await expect.poll(async () => (await queue(page)).length).toBe(1);
      const pending = (await queue(page))[0]; expect(pending.__sealedLocal).toBeTruthy(); expect(JSON.stringify(pending)).not.toContain(fixtures.students[0].fullName);
      await page.goto(`${origin}/profile`);
      await page.locator('main').getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      expect((await queue(page))[0].opId).toBe(pending.opId);
      await context!.close(); context = undefined;

      page = await start(true); await signIn(page);
      expect((await queue(page))[0].opId).toBe(pending.opId);
      allowLogin = !rejected;
      offlineMode = false;
      await context!.setOffline(false);
      if (rejected) {
        await expect(page).toHaveURL(/\/login$/); expect(posts).toBe(0);
        expect((await queue(page))[0].opId).toBe(pending.opId);
        offlineMode = true; await context!.setOffline(true); await signIn(page);
        expect((await queue(page))[0].opId).toBe(pending.opId);
      } else {
        await expect.poll(async () => (await queue(page)).length, { timeout: 20000 }).toBe(0);
        expect(logins).toBe(2); expect(posts).toBe(1); expect(serverRows[0].status).toBe('ABSENT');
        // Let the online attendance screen hydrate from the refreshed local cache
        // before testing a second offline navigation after synchronization.
        await page.goto(`${origin}/attendance?circleId=${circleId}`);
        await expect(page.getByText(fixtures.students[0].fullName, { exact: true })).toBeVisible({ timeout: 15000 });
        offlineMode = true; await context!.setOffline(true);
        await page.reload();
        // A fully recorded local sheet deliberately replaces its editable roster
        // with the completion view; it must survive this second offline launch.
        await expect(page.getByRole('heading', { name: 'تم حفظ كشف الحضور لهذا اليوم' })).toBeVisible({ timeout: 15000 });
      }
    } finally { await context?.close(); await rm(profile, { recursive: true, force: true }); }
  });
}

test('student first password change preserves offline login with the new password', async ({ page, context }) => {
  const identity = { ...user, role: 'STUDENT', mustChangePassword: true };
  const student = { ...fixtures.students[0], selfAccountId: account };
  const initialPassword = 'Temporary Student Password 27';
  const newPassword = 'My New Student Password 42';
  let serverPassword = initialPassword; let logins = 0; let offlineMode = false;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => {
    if (offlineMode) return route.abort('internetdisconnected');
    const url = new URL(route.request().url()); const path = url.pathname;
    if (path === '/api/auth/login') {
      if (route.request().postDataJSON().password !== serverPassword) return route.fulfill({ status: 401, json: {} });
      logins++; return route.fulfill({ json: { user: identity, accessToken: 'student-access', refreshToken: 'student-refresh' } });
    }
    if (path === '/api/auth/change-password') {
      const input = route.request().postDataJSON();
      if (input.currentPassword !== serverPassword) return route.fulfill({ status: 400, json: {} });
      serverPassword = input.newPassword; identity.mustChangePassword = false;
      return route.fulfill({ json: { success: true } });
    }
    if (path === '/api/auth/me') return route.fulfill({ json: identity });
    if (path === '/api/announcements/active' || path === '/api/chat/conversations') return route.fulfill({ json: [] });
    if (path === '/api/settings/public') return route.fulfill({ json: { name: schoolName } });
    if (path === '/api/students/me') return route.fulfill({ json: student });
    if (path === '/api/students/me/history') return route.fulfill({ json: { exams: [], recitations: [], attendance: [] } });
    if (path === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
    if (path === '/api/sync-all/delta') return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } });
    if (path === '/api/sync-all') return route.fulfill({ json: { data: url.searchParams.get('table') === 'students' ? [student] : fixtures[url.searchParams.get('table') || ''] || [], meta: { hasNextPage: false } } });
    return route.fulfill({ json: { data: [], meta: { hasNextPage: false, total: 0 } } });
  });
  await page.goto('/login');
  await page.getByLabel('اسم المستخدم', { exact: true }).fill(user.username);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(initialPassword);
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await page.getByLabel(/^كلمة المرور المؤقتة/).fill(initialPassword);
  await expect.poll(() => page.evaluate(account => new Promise<boolean>(resolve => {
    const open = indexedDB.open('halaqatFull'); open.onsuccess = () => { const database = open.result; const read = database.transaction('students').objectStore('students').getAll(); read.onsuccess = () => { database.close(); resolve(read.result.some(row => row.accountId === account && row.__sealedLocal)); }; };
  }), account)).toBe(true);
  await page.getByLabel(/^كلمة المرور الجديدة/).fill(newPassword);
  await page.getByLabel(/^تأكيد كلمة المرور الجديدة/).fill(newPassword);
  await page.getByRole('button', { name: 'حفظ كلمة المرور', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  offlineMode = true; await context.setOffline(true);
  await page.getByLabel('اسم المستخدم', { exact: true }).fill(user.username);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/' || url.pathname === '/student');
  // Offline login is successful when routing leaves the login screen; the student home
  // layout can render different headings while its cached records hydrate.
  await expect(page.getByLabel('كلمة المرور', { exact: true })).toHaveCount(0);
  expect(logins).toBe(1); expect(errors).toEqual([]);
});

test('public deletion entry identifies the school and production CSP blocks injected inline scripts', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { name: schoolName } }));
  await page.goto('/account-deletion');
  await expect(page.getByRole('heading', { name: 'طلب حذف الحساب والبيانات' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'تسجيل الدخول للتحقق من هويتي' })).toBeVisible();
  const executed = await page.evaluate(() => {
    const script = document.createElement('script'); script.textContent = 'window.__injectedSecurityTest = true'; document.head.appendChild(script);
    return Boolean((window as any).__injectedSecurityTest);
  });
  expect(executed).toBe(false);
});

for (const width of [1280, 390]) {
  test(`student header, notification destination and services open on first click at ${width}px`, async ({ page, context }) => {
    const identity = { ...user, role: 'STUDENT' };
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const notification = { id: '00000000-0000-4000-8000-000000000009', title: 'مراجعة بياناتك', type: 'SYSTEM', link: '/verify-profile', isRead: false, createdAt: new Date().toISOString() };
    const review = { id: fixtures.students[0].id, kind: 'STUDENT', profile: { ...fixtures.students[0], selfAccountId: account }, requests: [] };
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(identity => {
      localStorage.setItem('qc.accessToken', 'test-token');
      localStorage.setItem('qc.offlineUser', JSON.stringify(identity));
    }, identity);
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: identity });
      if (url.pathname === '/api/settings/public') return route.fulfill({ json: { name: 'Test' } });
      if (url.pathname === '/api/profile-reviews/me') return route.fulfill({ json: review });
      if (url.pathname === '/api/notifications') return route.fulfill({ json: { data: [notification], unreadCount: 1, meta: { hasNextPage: false } } });
      if (url.pathname.endsWith('/unread-count')) return route.fulfill({ json: { count: 1 } });
      if (url.pathname.includes('/announcements') || url.pathname === '/api/chat/conversations') return route.fulfill({ json: [] });
      if (url.pathname === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
      if (url.pathname === '/api/sync-all/delta') return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } });
      if (url.pathname === '/api/sync-all') {
        if (route.request().method() === 'POST') return route.fulfill({ json: { outcomes: route.request().postDataJSON().operations.map((op: any) => ({ opId: op.opId, status: 'applied', data: { ...notification, isRead: true } })) } });
        const table = url.searchParams.get('table');
        return route.fulfill({ json: { data: table === 'notifications' ? [notification] : table === 'students' ? [review.profile] : [], meta: { hasNextPage: false } } });
      }
      return route.fulfill({ json: { data: [], meta: { page: 1, total: 0, totalPages: 1, hasNextPage: false } } });
    });
    await page.goto('/profile');
    await expect(page.getByRole('button', { name: 'قائمة الحساب', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'قائمة الحساب', exact: true }).click();
    await page.getByRole('link', { name: 'الإشعارات', exact: true }).first().click();
    await expect(page).toHaveURL(/\/notifications$/);
    await page.getByRole('button', { name: /مراجعة بياناتك/ }).click();
    await expect(page).toHaveURL(/\/verify-profile$/);
    await page.getByRole('button', { name: 'تعديل بياناتي', exact: true }).click();
    await expect(page.getByRole('button', { name: 'إرسال للتحقق', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'قائمة الحساب', exact: true }).click();
    await page.getByRole('link', { name: 'المحادثات', exact: true }).first().click();
    await expect(page).toHaveURL(/\/chat$/);
    // Cache the support screen, then exercise a real sidebar link while offline.
    await page.goto('/support');
    await expect(page.locator('main h1').first()).toBeVisible();
    await context.setOffline(true);
    if (width < 1024) await page.getByRole('button', { name: 'فتح القائمة', exact: true }).click();
    const sidebar = page.getByRole('navigation', { name: 'أقسام التطبيق', exact: true }).filter({ visible: true });
    const communication = sidebar.getByRole('button', { name: /التواصل/ });
    if (await communication.getAttribute('aria-expanded') === 'false') await communication.click();
    await sidebar.getByRole('link', { name: 'الإشعارات', exact: true }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByRole('heading', { name: 'الإشعارات', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('notification links open their exact exam and request records offline, including completed requests', async ({ page, context }) => {
  const student = fixtures.students[0];
  const exam = { id: '20000000-0000-4000-8000-000000000001', status: 'COMPLETED', student, scheduledAt: '2026-10-15T10:00:00Z', score: 95, result: 'PASSED', section: { name: 'Test section' } };
  const request = { id: '20000000-0000-4000-8000-000000000002', status: 'APPROVED', student, createdAt: '2026-10-15T10:00:00Z', section: exam.section, teacher: { user: { fullName: 'Teacher' } } };
  const transfer = { id: '20000000-0000-4000-8000-000000000003', status: 'REJECTED', kind: 'STUDENT_TRANSFER', student, reason: 'Transfer reason', decisionNote: 'Transfer rejected', requestedBy: user };
  const suspension = { id: '20000000-0000-4000-8000-000000000004', status: 'REJECTED', student, reason: 'Suspension reason', decisionNote: 'Suspension rejected', requestedBy: user };
  const records: Record<string, any> = { [`/exams/${exam.id}`]: exam, [`/exams/requests/${request.id}`]: request, [`/transfers/${transfer.id}`]: transfer, [`/suspensions/${suspension.id}`]: suspension };
  const notifications = Object.keys(records).map((link, index) => ({ id: `30000000-0000-4000-8000-00000000000${index}`, title: `Notice ${index}`, type: 'SYSTEM', link, isRead: false, createdAt: '2026-10-15T00:00:00Z' }));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(identity => {
    localStorage.setItem('qc.accessToken', 'test-token'); localStorage.setItem('qc.offlineUser', JSON.stringify(identity));
  }, user);
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url()); const path = url.pathname.replace(/^\/api/, '');
    if (path === '/auth/me') return route.fulfill({ json: user });
    if (path === '/settings/public') return route.fulfill({ json: { name: 'Test' } });
    if (path.endsWith('/unread-count')) return route.fulfill({ json: { count: 4 } });
    if (records[path]) return route.fulfill({ json: records[path] });
    if (['/announcements/active', '/chat/conversations', '/suspensions/active', '/users/directory'].includes(path)) return route.fulfill({ json: [] });
    if (path === '/exams/stats') return route.fulfill({ json: { pendingRequests: 0, scheduled: 0, completed: 1, passed: 1, failed: 0, passRate: 100 } });
    if (path === '/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
    if (path === '/sync-all/delta') return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } });
    const data = path === '/notifications' ? notifications : path === '/transfers' ? [transfer] : path === '/suspensions' ? [suspension] : [];
    if (path === '/sync-all') {
      const table = url.searchParams.get('table');
      const rows = table === 'exams' ? [exam] : table === 'examRequests' ? [request] : table === 'notifications' ? notifications : [];
      return route.fulfill({ json: { data: rows, meta: { hasNextPage: false } } });
    }
    return route.fulfill({ json: { data, meta: { page: 1, total: data.length, totalPages: 1, hasNextPage: false } } });
  });
  await page.goto('/notifications');
  await expect.poll(() => page.evaluate(account => new Promise(resolve => {
    const open = indexedDB.open('halaqatFull'); open.onsuccess = () => {
      const database = open.result; const read = database.transaction('meta').objectStore('meta').get(`${account}:sectionsDownloadedAt`);
      read.onsuccess = () => { resolve(Boolean(read.result)); database.close(); };
    };
  }), account)).toBe(true);
  await context.setOffline(true);
  for (const notice of notifications) {
    await page.getByRole('button', { name: new RegExp(notice.title) }).click();
    await expect(page).toHaveURL(url => url.pathname === notice.link);
    const details = page.getByRole('definition');
    await expect(details.filter({ hasText: student.fullName })).toBeVisible();
    if (notice.link.startsWith('/transfers/')) await expect(details.filter({ hasText: 'Transfer rejected' })).toBeVisible();
    if (notice.link.startsWith('/suspensions/')) await expect(details.filter({ hasText: 'Suspension rejected' })).toBeVisible();
    await page.locator('header').getByRole('link', { name: 'الإشعارات', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: 'تعليم الكل كمقروء', exact: true })).toHaveCount(0);
  await page.locator('li').filter({ has: page.getByRole('button', { name: /Notice 0/ }) }).getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(page.getByRole('button', { name: /Notice 0/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('exam committee tabs work without offering forbidden student files or reports', async ({ page }) => {
  const identity = { ...user, role: 'EXAM_COMMITTEE' };
  const student = fixtures.students[0];
  const request = { id: '40000000-0000-4000-8000-000000000001', status: 'PENDING', student, section: { name: 'Exam section' }, createdAt: '2026-10-15T00:00:00Z', teacher: { user: { fullName: 'Teacher' } } };
  const exam = { ...request, id: '40000000-0000-4000-8000-000000000002', status: 'SCHEDULED', scheduledAt: '2026-10-15T10:00:00Z' };
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(identity => { localStorage.setItem('qc.accessToken', 'test-token'); localStorage.setItem('qc.offlineUser', JSON.stringify(identity)); }, identity);
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: identity });
    if (url.pathname === '/api/settings/public') return route.fulfill({ json: { name: 'Test' } });
    if (url.pathname === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
    if (url.pathname === '/api/sync-all/delta') return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } });
    if (url.pathname.endsWith('/unread-count')) return route.fulfill({ json: { count: 0 } });
    if (url.pathname.includes('/announcements')) return route.fulfill({ json: [] });
    let data: any[] = [];
    if (url.pathname === '/api/exams/requests') data = [request];
    if (url.pathname === '/api/exams') data = url.searchParams.get('status') === 'COMPLETED' ? [] : [exam];
    if (url.pathname === '/api/exams/stats') return route.fulfill({ json: { pendingRequests: 1, scheduled: 1, completed: 0, passed: 0, failed: 0, passRate: 0 } });
    if (url.pathname === '/api/sync-all') {
      const table = url.searchParams.get('table'); data = table === 'exams' ? [exam] : table === 'examRequests' ? [request] : [];
    }
    return route.fulfill({ json: { data, meta: { page: 1, total: data.length, totalPages: 1, hasNextPage: false } } });
  });
  await page.goto('/exams');
  await expect(page.getByRole('cell', { name: student.fullName, exact: false })).toBeVisible();
  await expect(page.locator(`a[href="/students/${student.id}"]`)).toHaveCount(0);
  await expect(page.locator('a[href="/documents/exams"]')).toHaveCount(0);
  await page.getByRole('button', { name: /الاختبارات المجدولة/ }).click();
  await expect(page.getByRole('cell', { name: student.fullName, exact: false })).toBeVisible();
  await expect(page.locator(`a[href="/students/${student.id}"]`)).toHaveCount(0);
  await page.getByRole('button', { name: 'سجل الاختبارات', exact: true }).click();
  await expect(page.getByText('لا توجد اختبارات في السجل', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('administrator creates a user and student account, resets password offline and syncs on reconnect', async ({ page, context }) => {
  const received: any[] = [];
  await page.addInitScript(identity => {
    localStorage.setItem('qc.accessToken', 'test-token');
    localStorage.setItem('qc.offlineUser', JSON.stringify(identity));
  }, user);
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: user });
    if (url.pathname === '/api/settings/public') return route.fulfill({ json: { name: 'Test' } });
    if (url.pathname === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
    if (url.pathname === '/api/sync-all/delta') return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } });
    if (url.pathname === '/api/sync-all') {
      if (route.request().method() === 'POST') {
        const operations = route.request().postDataJSON().operations; received.push(...operations);
        return route.fulfill({ json: { outcomes: operations.map((op: any) => ({ opId: op.opId, status: 'applied', data: op.table === 'users'
          ? { id: op.entityId, username: op.data.username, fullName: op.data.fullName, role: op.data.role, isActive: true }
          : { id: op.entityId, studentId: op.entityId, username: '120261234', fullName: 'طالب أوفلاين', code: '120261234', isActive: true, mustChangePassword: true } })) } });
      }
      return route.fulfill({ json: { data: url.searchParams.get('table') === 'students' ? [{ ...fixtures.students[0], code: '120261234' }] : [], meta: { hasNextPage: false } } });
    }
    if (url.pathname === '/api/students/accounts') return route.fulfill({ json: [] });
    if (url.pathname === '/api/students') return route.fulfill({ json: { data: [{ ...fixtures.students[0], code: '120261234' }], meta: { hasNextPage: false } } });
    if (url.pathname.endsWith('/unread-count')) return route.fulfill({ json: { count: 0 } });
    if (url.pathname.includes('/announcements')) return route.fulfill({ json: [] });
    if (url.pathname === '/api/users/stats') return route.fulfill({ json: { total: 0, active: 0, inactive: 0, byRole: [] } });
    return route.fulfill({ json: { data: [], meta: { page: 1, total: 0, totalPages: 1, hasNextPage: false } } });
  });
  await page.goto('/student-accounts');
  await expect.poll(() => page.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('halaqatFull'); open.onsuccess = () => {
      const database = open.result;
      const request = database.transaction('meta').objectStore('meta').get('00000000-0000-4000-8000-000000000001:downloadedAt');
      request.onsuccess = () => { resolve(Boolean(request.result)); database.close(); };
    };
  }))).toBe(true);
  await context.setOffline(true);
  await page.getByRole('combobox').first().selectOption(fixtures.students[0].id);
  await page.getByRole('button', { name: 'إنشاء حساب طالب', exact: true }).click();
  await expect(page.getByText('تم إنشاء الحساب؛ كلمة المرور المؤقتة ظاهرة في الجدول')).toBeVisible();
  // Password reset now requires an explicit student selection; the temporary password is shown in the accounts table instead of a modal.
  await page.evaluate(() => { window.history.pushState({}, '', '/users'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('button', { name: 'إضافة مستخدم', exact: true }).click();
  await page.getByLabel('الاسم الكامل').fill('موظف بدون نت');
  await page.getByLabel('اسم المستخدم').fill('offlinestaff');
  await page.getByLabel('كلمة المرور', { exact: false }).fill('OfflinePassword123');
  await page.getByRole('combobox', { name: 'الدور *' }).selectOption('TEACHER');
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'موظف بدون نت' })).toBeVisible();
  expect(received).toHaveLength(0);
  await context.setOffline(false);
  await expect.poll(() => received.length).toBe(2);
  expect(received.map(op => `${op.table}:${op.action}`)).toEqual(['studentAccounts:create', 'users:create']);
  await expect(page.getByRole('cell', { name: 'بانتظار المزامنة', exact: true })).toHaveCount(0);
});

test('cached account renders before a slow session check, then honors server revocation', async ({ page }) => {
  await page.addInitScript(identity => {
    localStorage.setItem('qc.accessToken', 'slow-check-token');
    localStorage.setItem('qc.offlineUser', JSON.stringify(identity));
  }, user);
  let verification: import('@playwright/test').Route | undefined;
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') { verification = route; return; }
    if (url.pathname === '/api/circles/options') return route.fulfill({ json: fixtures.circles });
    if (url.pathname === '/api/settings/public') return route.fulfill({ json: { name: schoolName } });
    if (url.pathname === '/api/students') return route.fulfill({ json: { data: fixtures.students, meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } });
    if (url.pathname === '/api/announcements/active') return route.fulfill({ json: [] });
    return route.fulfill({ json: { data: [], count: 0, meta: { hasNextPage: false, total: 0 } } });
  });
  await page.goto('/students');
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.locator('main')).toContainText('طالب أوفلاين');
  await expect.poll(() => Boolean(verification)).toBe(true);
  // No successful /auth/me response was necessary to render the existing account.
  await verification!.fulfill({ status: 401, json: { message: 'الحساب موقوف' } });
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('طالب أوفلاين', { exact: true })).toHaveCount(0);
});

test('personal settings retain appearance and replay the introduction without resetting completion', async ({ page, context }) => {
  await page.addInitScript(identity => {
    localStorage.setItem('qc.accessToken', 'settings-test-token');
    localStorage.setItem('qc.offlineUser', JSON.stringify(identity));
  }, user);
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/settings/public') return route.fulfill({ json: { name: schoolName } });
    if (path === '/api/announcements/active') return route.fulfill({ json: [] });
    return route.fulfill({ json: { data: [], count: 0, meta: { hasNextPage: false } } });
  });
  await page.goto('/profile');
  await expect(page.getByRole('combobox', { name: 'مظهر التطبيق' })).toHaveCount(0);
  await page.getByRole('link', { name: 'إعدادات الحساب', exact: true }).click();
  await page.getByRole('combobox', { name: 'مظهر التطبيق' }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await context.setOffline(true);
  await page.getByRole('link', { name: 'إعادة مشاهدة شرح التطبيق' }).click();
  await expect(page.getByRole('heading', { name: 'مرحباً بك في مدرسة عبدالله بن عمر' })).toBeVisible();
  await page.getByRole('button', { name: 'تخطي', exact: true }).click();
  await expect(page).toHaveURL(/\/profile\/settings$/);
  await expect(page.getByRole('combobox', { name: 'مظهر التطبيق' })).toHaveValue('dark');
  expect(await page.evaluate(() => localStorage.getItem('qc.onboarding.completed'))).toBe('1');
});

test('returning website visitor opens login without repeating onboarding', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { name: schoolName } }));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: schoolName, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'بدء التطبيق', exact: true })).toHaveCount(0);
  await expect(page.getByRole('main', { name: 'التعريف بالتطبيق', exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('qc.onboarding.completed'))).toBe('1');
  await page.screenshot({ path: 'test-results/login-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/login-mobile.png', animations: 'disabled' });
});

test('public privacy page and support dialog work with keyboard focus contained and restored', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { name: 'School' } }));
  await page.goto('/login');
  await page.getByRole('link', { name: 'معلومات عن البرنامج', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'قسم الإدارة', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/about-program-desktop.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: 'سياسة الخصوصية', exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'البيانات والخصوصية', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'التواصل مع الدعم الفني', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'التواصل مع الدعم الفني', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  const trigger = page.getByRole('button', { name: 'الدعم الفني', exact: true });
  await trigger.click();
  const close = dialog.getByRole('button', { name: 'إغلاق', exact: true });
  // Wait for the dialog's animation-frame autofocus before keyboard traversal.
  // Manually focusing here races that autofocus and can reset the wrapped focus.
  await expect(close).toBeFocused(); await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'إرسال الطلب', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await expect(dialog).toHaveCount(0);
});

test('local Arabic font files and brand assets are cached before an offline login reload', async ({ page, context }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { name: schoolName } }));
  await page.goto('/login');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter(key => key.startsWith('quran-circles-shell-')).length)).toBeGreaterThan(0);
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).filter(key => key.startsWith('quran-circles-shell-')).map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat());
  expect(cached.filter(url => url.endsWith('.woff2')).length).toBe(4);
  expect(cached.some(url => url.endsWith('/brand-logo.png'))).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('heading', { name: schoolName, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => { await document.fonts.load('16px Tajawal', 'العربية'); return document.fonts.check('16px Tajawal', 'العربية'); })).toBe(true);
});

test('unexpected screen errors offer recovery without clearing the saved account', async ({ page }) => {
  await page.addInitScript(identity => { localStorage.setItem('qc.accessToken', 'test-token'); localStorage.setItem('qc.offlineUser', JSON.stringify(identity)); }, user);
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: url.pathname === '/api/auth/me' ? user : url.pathname === '/api/announcements/active' ? { unexpected: true } : { name: 'School', data: [], meta: { total: 0, totalPages: 1 } } });
  });
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'تعذر عرض الصفحة', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'إعادة فتح الصفحة', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qc.offlineUser') || 'null')?.id)).toBe(account);
});

test('native launch shows school branding and introduces the app once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('qc.nativeIntroductionTest')) {
      localStorage.removeItem('qc.onboarding.completed');
      sessionStorage.setItem('qc.nativeIntroductionTest', '1');
    }
    (window as any).androidBridge = {};
    new MutationObserver(() => {
      const splash = document.querySelector('[role="status"][aria-label] .launch-logo')?.parentElement;
      if (splash) (window as any).__nativeSplashText = splash.textContent?.trim();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.route('**/api/**', route => route.fulfill({ json: { name: 'حلقات التحفيظ' } }));
  await page.goto('/login');
  const splash = page.getByRole('status', { name: 'بدء التطبيق', exact: true });
  await expect(page.getByRole('heading', { name: 'مرحباً بك في مدرسة عبدالله بن عمر' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__nativeSplashText)).toContain('مدرسة عبدالله بن عمر');
  await page.evaluate(() => Promise.all(Array.from(document.images).map(image => image.decode().catch(() => undefined))));
  await page.screenshot({ path: 'test-results/native-intro.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'متابعة', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'تابع حلقاتك القرآنية' })).toBeVisible();
  await page.screenshot({ path: 'test-results/native-intro-2.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'عرض الخطوة 5' }).click();
  await page.getByRole('button', { name: 'ابدأ الآن', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  await page.reload();
  await expect(splash).not.toBeVisible();
  await expect(page.getByRole('main', { name: 'التعريف بالتطبيق', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
});

test('password recovery collects account identity and queues a request offline', async ({ page, context }) => {
  const requests: any[] = [];
  await page.route('**/api/**', route => {
    if (new URL(route.request().url()).pathname === '/api/support/public') { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { number: 30 } }); }
    return route.fulfill({ json: { name: schoolName } });
  });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/login');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'طلب تغيير كلمة المرور', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'طلب تغيير كلمة المرور', exact: true });
  await dialog.getByLabel('الاسم الكامل').fill('طالب التجربة');
  await dialog.getByLabel(/^رقم الطالب/).fill('ST-25');
  await dialog.getByLabel(/^رقم الهوية/).fill('123456789');
  await dialog.getByLabel(/^اسم المستخدم/).fill('student25');
  await dialog.getByLabel('رقم واتساب للتواصل').fill('0591234567');
  await page.screenshot({ path: 'test-results/password-request-mobile.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: 'إرسال الطلب للإدارة' }).click();
  await expect(dialog.getByRole('status')).toContainText('حُفظ الطلب');
  const stored = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('quran-circles-pending-support'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const rows = await new Promise<any[]>((resolve, reject) => { const request = database.transaction('pendingSupport').objectStore('pendingSupport').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    database.close(); return rows;
  });
  expect(stored).toHaveLength(1); expect(stored[0].description).toContain('student25'); expect(stored[0].requestId).toBeTruthy();
  await context.setOffline(false); await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].requestId).toBe(stored[0].requestId);
  expect(await page.evaluate(() => localStorage.getItem('qc.accessToken'))).toBe(null);
});

test('online reads use the server and persist the fresh record for the next offline visit', async ({ page, context }) => {
  let name = 'اسم من الخادم'; let reads = 0; let disconnected = false;
  const password = 'Connection Transition Password 27';
  await page.route('**/api/**', route => {
    if (disconnected) return route.abort('internetdisconnected');
    const url = new URL(route.request().url()); const path = url.pathname;
    if (path === '/api/auth/login') return route.fulfill({ json: { user, accessToken: 'test-token', refreshToken: 'test-refresh' } });
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/announcements/active') return route.fulfill({ json: [] });
    if (path === '/api/circles/options') return route.fulfill({ json: [] });
    if (path === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
    if (path === '/api/students') { reads++; return route.fulfill({ json: { data: [{ ...fixtures.students[0], fullName: name }], meta: { hasNextPage: false, total: 1 } } }); }
    if (path === '/api/sync-all') return route.fulfill({ json: { data: url.searchParams.get('table') === 'students' ? [{ ...fixtures.students[0], fullName: 'نسخة محلية قديمة' }] : [], meta: { hasNextPage: false } } });
    return route.fulfill({ json: { data: [], meta: { hasNextPage: false } } });
  });
  await page.goto('/login');
  await page.getByLabel('اسم المستخدم', { exact: true }).fill(user.username);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await page.goto('/students'); await expect(page.getByText(name, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect.poll(() => page.evaluate(account => new Promise(resolve => { const request = indexedDB.open('halaqatFull'); request.onsuccess = () => { const db = request.result; const read = db.transaction('meta').objectStore('meta').get(`${account}:downloadedAt`); read.onsuccess = () => { resolve(Boolean(read.result)); db.close(); }; }; }), account)).toBe(true);
  name = 'تعديل جديد على الخادم'; const before = reads;
  await page.reload(); await expect(page.getByText(name, { exact: true }).filter({ visible: true })).toBeVisible(); expect(reads).toBeGreaterThan(before);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  disconnected = true; await context.setOffline(true); await page.reload(); await expect(page.getByText(name, { exact: true }).filter({ visible: true })).toBeVisible();
  // Enter a real password-unlocked local session with no server tokens. An
  // ordinary online-manager refetch alone still reads locally in this mode.
  await page.goto('/profile');
  await page.locator('main').getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('اسم المستخدم', { exact: true }).fill(user.username);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await page.goto('/students'); await expect(page.getByText(name, { exact: true }).filter({ visible: true })).toBeVisible();
  // Reconnect while staying on the same screen: fresh server data must replace
  // the local result without a reload, navigation or manual sync button.
  name = 'بيانات أحدث بعد عودة الاتصال'; const offlineReads = reads;
  disconnected = false; await context.setOffline(false);
  await expect(page.getByText(name, { exact: true }).filter({ visible: true })).toBeVisible();
  expect(reads).toBeGreaterThan(offlineReads);
  disconnected = true; await context.setOffline(true);
  await expect(page.getByText(name, { exact: true }).filter({ visible: true })).toBeVisible();
});

test('all recipient accounts, educational staff and circle students remain selectable after an offline reload', async ({ page, context }) => {
  const students = Array.from({ length: 125 }, (_, index) => ({ id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`, fullName: `طالب القائمة ${index}`, username: `student${index}`, role: 'STUDENT', circleId: index === 0 || index === 124 ? circleId : 'other-circle' }));
  const directory = { users: [...students, { id: fixtures.teachers[0].id, fullName: 'محفظ القائمة', username: 'teacher', role: 'TEACHER' }, { id: 'supervisor', fullName: 'مشرف القائمة', username: 'supervisor', role: 'SUPERVISOR' }, { id: 'examiner', fullName: 'عضو اللجنة', username: 'examiner', role: 'EXAM_COMMITTEE' }], circles: [{ id: circleId, name: 'حلقة الإشعار' }], studentsWithoutAccounts: [{ id: 'no-login', fullName: 'طالب دون حساب', circleId }] };
  await page.addInitScript(identity => { localStorage.setItem('qc.accessToken', 'test-token'); localStorage.setItem('qc.offlineUser', JSON.stringify(identity)); }, user);
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/auth/me' ? user : path === '/api/notifications/recipients' ? directory : path === '/api/announcements/active' ? [] : path === '/api/sync-all/watermark' ? { cursor: '0' } : { data: [], meta: { hasNextPage: false } } });
  });
  await page.goto('/admin/notifications');
  await page.getByLabel('الفئة', { exact: true }).selectOption('STUDENT');
  await page.getByLabel('المستلمون', { exact: true }).selectOption('SELECTED');
  await expect(page.getByRole('checkbox', { name: /^طالب القائمة 124 / })).toBeVisible();
  await page.getByLabel('الفئة', { exact: true }).selectOption('STAFF');
  for (const name of ['محفظ القائمة', 'مشرف القائمة', 'عضو اللجنة']) await expect(page.getByRole('checkbox', { name: new RegExp('^' + name) })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^طالب القائمة 124 / })).toHaveCount(0);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true); await page.reload();
  await page.getByLabel('الفئة', { exact: true }).selectOption('CIRCLE');
  await page.getByLabel(/^الحلقة/).selectOption(circleId);
  await page.getByLabel('المستلمون', { exact: true }).selectOption('SELECTED');
  await expect(page.getByRole('checkbox', { name: /^طالب القائمة 124 / })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^طالب القائمة 1 / })).toHaveCount(0);
  await page.getByText('طلاب دون حساب دخول: 1', { exact: true }).click();
  await expect(page.getByText('طالب دون حساب — لا يوجد حساب دخول')).toBeVisible();
  await page.getByRole('button', { name: 'تحديد كل الفئة', exact: true }).click();
  await page.getByLabel(/^عنوان الإشعار/).fill('إشعار الحلقة');
  await page.getByLabel(/^نص الإشعار/).fill('موعد الحلقة القادم');
  await page.getByRole('button', { name: 'إرسال الإشعار', exact: true }).click();
  await expect(page.getByText(/تم حفظ الإشعار/)).toBeVisible();
  const payload = await page.evaluate(() => new Promise<any>(resolve => {
    const open = indexedDB.open('halaqatFull'); open.onsuccess = () => { const database = open.result; const read = database.transaction('queue').objectStore('queue').getAll(); read.onsuccess = () => { database.close(); resolve(read.result.find(row => row.action === 'broadcast').data); }; };
  }));
  expect(payload.audience).toBe('CIRCLE'); expect(payload.circleId).toBe(circleId);
  expect(payload.userIds).toEqual([students[0].id, students[124].id]);
});

test('activity archive opens records older than the former 100-record limit and filters them after an offline reload', async ({ page, context }) => {
  const records = Array.from({ length: 125 }, (_, index) => ({ id: `history-${index}`, summary: index === 0 ? 'أول نشاط محفوظ في المدرسة' : `نشاط محفوظ ${index}`, createdAt: new Date(Date.UTC(2001, 0, 1) + index * 1000).toISOString(), user: { fullName: 'مدير السجل' } }));
  await page.addInitScript(identity => { localStorage.setItem('qc.accessToken', 'test-token'); localStorage.setItem('qc.offlineUser', JSON.stringify(identity)); }, user);
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/dashboard/activity') {
      const rows = records.filter(row => row.summary.includes(url.searchParams.get('search') || '')).sort((a, b) => a.createdAt.localeCompare(b.createdAt) * (url.searchParams.get('sortOrder') === 'asc' ? 1 : -1));
      const limit = Number(url.searchParams.get('limit') || 200), page = Number(url.searchParams.get('page') || 1);
      return route.fulfill({ json: { data: rows.slice((page - 1) * limit, page * limit), meta: { total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)), hasNextPage: page * limit < rows.length } } });
    }
    return route.fulfill({ json: path === '/api/announcements/active' ? [] : path === '/api/notifications/recipients' ? { users: [], circles: [], studentsWithoutAccounts: [] } : path === '/api/sync-all/watermark' ? { cursor: '0' } : { data: [], meta: { hasNextPage: false } } });
  });
  await page.goto('/admin/activity');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(page.getByText('أول نشاط محفوظ في المدرسة', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(account => new Promise<number>(resolve => {
    const open = indexedDB.open('halaqatFull'); open.onsuccess = () => { const database = open.result; const read = database.transaction('meta').objectStore('meta').get(`${account}:prefetch:/dashboard/activity`); read.onsuccess = () => { database.close(); resolve(read.result?.value?.rows?.length || 0); }; };
  }), account)).toBe(125);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true); await page.reload();
  await page.getByLabel('ترتيب النشاطات').selectOption('asc');
  await expect(page.getByText('أول نشاط محفوظ في المدرسة', { exact: true })).toBeVisible();
  await page.getByLabel('البحث في النشاط أو اسم المستخدم').fill('أول نشاط');
  await expect(page.getByText('نشاط محفوظ 1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('أول نشاط محفوظ في المدرسة', { exact: true })).toBeVisible();
});

test('admin broadcast targets selected accounts and stays durable offline', async ({ page, context }) => {
  const recipients = [{ id: fixtures.students[0].id, fullName: 'طالب التجربة', username: 'student25', role: 'STUDENT', isActive: true }, { id: fixtures.teachers[0].id, fullName: 'محفظ التجربة', username: 'teacher25', role: 'TEACHER', isActive: true }];
  await page.addInitScript(identity => { localStorage.setItem('qc.accessToken', 'test-token'); localStorage.setItem('qc.offlineUser', JSON.stringify(identity)); }, user);
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/notifications/recipients') return route.fulfill({ json: { users: recipients, circles: [], studentsWithoutAccounts: [] } });
    if (path === '/api/announcements/active') return route.fulfill({ json: [] });
    if (path === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
    return route.fulfill({ json: { data: [], meta: { hasNextPage: false } } });
  });
  await page.goto('/admin/notifications');
  await expect(page.getByRole('heading', { name: 'إرسال الإشعارات' })).toBeVisible();
  await page.getByLabel(/^عنوان الإشعار/).fill('موعد اللقاء');
  await page.getByLabel(/^نص الإشعار/).fill('نلتقي غدًا بعد العصر.');
  await page.getByLabel('الفئة', { exact: true }).selectOption('STUDENT');
  await page.getByLabel('المستلمون', { exact: true }).selectOption('SELECTED');
  await page.getByLabel('طالب التجربة').check();
  await expect(page.getByText('محفظ التجربة', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/admin-broadcast-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/admin-broadcast-mobile.png', animations: 'disabled' });
  await context.setOffline(true); await page.getByRole('button', { name: 'إرسال الإشعار', exact: true }).click();
  await expect(page.getByText(/تم حفظ الإشعار/)).toBeVisible();
  const operations = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('halaqatFull'); request.onsuccess = () => resolve(request.result); });
    const rows = await new Promise<any[]>(resolve => { const request = database.transaction('queue').objectStore('queue').getAll(); request.onsuccess = () => resolve(request.result); }); database.close(); return rows;
  });
  const operation = operations.find(row => row.action === 'broadcast'); expect(operation.data.userIds).toEqual([recipients[0].id]);
});

test('student save explains missing fields, confirms online creation and works offline on mobile', async ({ page, context }) => {
  let release!: () => void;
  const acknowledgement = new Promise<void>(resolve => { release = resolve; });
  const students: any[] = [];
  await page.addInitScript(identity => {
    localStorage.setItem('qc.onboarding.completed', '1');
    localStorage.setItem('qc.accessToken', 'test-token');
    localStorage.setItem('qc.offlineUser', JSON.stringify(identity));
  }, user);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: user });
    if (url.pathname === '/api/circles/options') return route.fulfill({ json: fixtures.circles });
    if (url.pathname === '/api/students') return route.fulfill({ json: { data: students, meta: { total: students.length, page: 1, totalPages: 1, hasNextPage: false } } });
    if (url.pathname === '/api/courses') return route.fulfill({ json: { data: [], meta: { hasNextPage: false } } });
    if (url.pathname === '/api/sync-all' && route.request().method() === 'POST') {
      await acknowledgement;
      const operations = route.request().postDataJSON().operations;
      const outcomes = operations.map((op: any) => {
        const row = { ...fixtures.students[0], ...op.data, id: '00000000-0000-4000-8000-000000000099', code: '120261234' };
        students.push(row); return { opId: op.opId, status: 'applied', data: row };
      });
      return route.fulfill({ json: { outcomes } });
    }
    return route.fulfill({ status: 403, json: { message: 'Initial bootstrap not ready' } });
  });
  await page.goto('/students');
  await page.getByRole('button', { name: 'تسجيل طالب', exact: true }).click();
  await page.getByLabel('الاسم الكامل').fill('طالب متصل جديد');
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('اختر حلقة التحفيظ');
  await page.getByLabel(/^حلقة التحفيظ/).selectOption(circleId);
  const sending = page.waitForRequest(request => request.url().endsWith('/api/sync-all') && request.method() === 'POST');
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await sending;
  try { await expect(page.getByRole('heading', { name: 'تسجيل طالب جديد' })).toBeVisible(); }
  finally { release(); }
  await expect(page.getByRole('heading', { name: 'تسجيل طالب جديد' })).not.toBeVisible();
  await expect(page.getByText('طالب متصل جديد', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('طالب متصل جديد', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'تسجيل طالب', exact: true }).click();
  await page.getByLabel('الاسم الكامل').fill('طالب محفوظ على الجوال');
  await page.getByLabel(/^حلقة التحفيظ/).selectOption(circleId);
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'تسجيل طالب جديد' })).not.toBeVisible();
  await expect(page.getByText('طالب محفوظ على الجوال', { exact: true }).filter({ visible: true })).toBeVisible();
});
test('student edits remain pending offline and online until administrative approval', async ({ page, context }) => {
  const identity = { ...user, role: 'STUDENT' };
  let student = { ...fixtures.students[0], selfAccountId: account, fullName: 'طالب الاستبيان', nationalId: '123456789', fatherNationalId: '987654321', birthDate: '2010-01-01', address: 'العنوان القديم', guardianName: 'ولي الأمر', guardianPhone: '0591234567', guardianRelation: 'الأب' };
  const reviews: any[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(identity => {
    localStorage.setItem('qc.onboarding.completed', '1');
    localStorage.setItem('qc.accessToken', 'test-token');
    localStorage.setItem('qc.offlineUser', JSON.stringify(identity));
  }, identity);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: identity });
    if (url.pathname === '/api/profile-reviews/me') return route.fulfill({ json: { id: student.id, kind: 'STUDENT', profile: student, requests: reviews } });
    if (url.pathname === '/api/students/me') return route.fulfill({ json: student });
    if (url.pathname === '/api/students/me/history') return route.fulfill({ json: { exams: [{ id: 'scheduled-exam', status: 'SCHEDULED', scheduledAt: '2030-01-01T10:00:00Z', location: 'قاعة الاختبار التجريبية', section: { name: 'الحزب الأول' } }] } });
    if (url.pathname === '/api/preparations') return route.fulfill({ json: { data: [{ id: 'prep-one', fromSurah: 'البقرة', fromAyah: 1, toSurah: 'البقرة', toAyah: 5, note: 'تحضير محفوظ للطالب' }], meta: { hasNextPage: false } } });
    if (url.pathname === '/api/settings/public') return route.fulfill({ json: { name: 'حلقات التحفيظ' } });
    if (url.pathname === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
    if (url.pathname === '/api/sync-all/delta') return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } });
    if (url.pathname === '/api/sync-all') {
      if (route.request().method() === 'POST') {
        const outcomes = route.request().postDataJSON().operations.map((op: any) => {
          expect(op.table).toBe('profileReviews'); expect(op.action).toBe('create');
          const review = { id: op.entityId, kind: 'STUDENT', requesterId: account, patch: op.data.patch, base: student, status: 'PENDING', createdAt: new Date().toISOString() }; reviews.push(review); return { opId: op.opId, status: 'applied', data: review };
        });
        return route.fulfill({ json: { outcomes } });
      }
      return route.fulfill({ json: { data: url.searchParams.get('table') === 'students' ? [student] : url.searchParams.get('table') === 'profileReviews' ? reviews : [], ...(url.searchParams.get('table') === 'profileReviews' ? { references: { '/profile-reviews/me': { id: student.id, kind: 'STUDENT', profile: student, requests: reviews } } } : {}), meta: { hasNextPage: false } } });
    }
    return route.fulfill({ status: 403, json: { message: 'Not used' } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'التحضير المطلوب' })).toBeVisible();
  await expect(page.getByText('تحضير محفوظ للطالب')).toBeVisible();
  await expect(page.getByText('قاعة الاختبار التجريبية', { exact: false })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 450));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  await page.getByRole('button', { name: 'قائمة الحساب', exact: true }).click();
  await page.getByRole('link', { name: 'الملف الشخصي', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole('button', { name: 'الرجوع للصفحة السابقة', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  await expect(page.getByRole('status', { name: 'بدء التطبيق', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'تعديل بياناتي', exact: true }).click();
  await expect(page.getByLabel('الجنس', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('رقم الطالب', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('جوال الطالب', { exact: true })).toHaveCount(0);
  await context.setOffline(true);
  await page.getByLabel(/^رقم هوية الطالب/).fill('123456780');
  await page.getByLabel(/^رقم هوية ولي الأمر/).fill('987654320');
  await page.getByLabel(/^العنوان/).fill('Proposed offline address');
  await page.getByRole('button', { name: 'إرسال للتحقق', exact: true }).click();
  await expect(page.getByText('الطلب محفوظ على الجهاز بانتظار الإرسال', { exact: true })).toBeVisible();
  expect(student.nationalId).toBe('123456789'); expect(student.address).not.toBe('Proposed offline address');
  await expect(page.getByText('Proposed offline address', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect.poll(() => reviews.length).toBe(1);
  await expect(page.getByText('طلبك بانتظار مراجعة الإدارة', { exact: true })).toBeVisible();
  expect(student.nationalId).toBe('123456789'); expect(reviews[0].patch.nationalId).toBe('123456780');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
  await context.setOffline(true); await page.reload();
  await expect(page.getByText('Proposed offline address', { exact: true })).toBeVisible();
  await expect(page.getByText('تحضير محفوظ للطالب')).toBeVisible();
  await page.screenshot({ path: 'test-results/student-review-pending.png', fullPage: true });
});

test('administration queues approval and reasoned rejection offline without applying profile changes early', async ({ page, context }) => {
  const reviews = [
    { id: '10000000-0000-4000-8000-000000000001', kind: 'TEACHER', requesterId: 'teacher', status: 'PENDING', base: { fullName: 'محفظ التحقق', address: 'قبل' }, patch: { address: 'عنوان المحفظ المقترح' }, createdAt: '2026-10-15T00:00:00Z' },
    { id: '10000000-0000-4000-8000-000000000002', kind: 'STUDENT', requesterId: 'student', status: 'PENDING', base: { fullName: 'طالب التحقق', address: 'قبل' }, patch: { address: 'عنوان الطالب المقترح' }, createdAt: '2026-10-15T00:00:00Z' },
  ];
  const decisions: any[] = []; let teacherAddress = 'قبل';
  await page.addInitScript(identity => { localStorage.setItem('qc.onboarding.completed', '1'); localStorage.setItem('qc.accessToken', 'test-token'); localStorage.setItem('qc.offlineUser', JSON.stringify(identity)); }, user);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: user });
    if (url.pathname === '/api/profile-reviews') return route.fulfill({ json: { data: reviews.filter(row => !url.searchParams.get('kind') || row.kind === url.searchParams.get('kind')), meta: { hasNextPage: false } } });
    if (url.pathname === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
    if (url.pathname === '/api/sync-all/delta') return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } });
    if (url.pathname === '/api/sync-all') {
      if (route.request().method() === 'POST') {
        const outcomes = route.request().postDataJSON().operations.map((op: any) => {
          expect(op.table).toBe('profileReviews'); expect(op.action).toBe('decision'); decisions.push(op);
          const review = reviews.find(row => row.id === op.entityId)!; review.status = op.data.status;
          if (review.kind === 'TEACHER' && op.data.status === 'APPROVED') teacherAddress = review.patch.address;
          return { opId: op.opId, status: 'applied', data: { ...review, reason: op.data.reason } };
        });
        return route.fulfill({ json: { outcomes } });
      }
      return route.fulfill({ json: { data: url.searchParams.get('table') === 'profileReviews' ? reviews : [], meta: { hasNextPage: false } } });
    }
    if (url.pathname.includes('/announcements')) return route.fulfill({ json: [] });
    if (url.pathname.endsWith('/unread-count')) return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: { data: [], meta: { hasNextPage: false } } });
  });
  await page.goto('/profile-reviews/teachers');
  await expect(page.getByRole('heading', { name: 'تحقق من بيانات المحفظ', exact: true })).toBeVisible();
  await expect(page.getByText('عنوان المحفظ المقترح', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => new Promise(resolve => { const open = indexedDB.open('halaqatFull'); open.onsuccess = () => { const database = open.result; const request = database.transaction('meta').objectStore('meta').get('00000000-0000-4000-8000-000000000001:downloadedAt'); request.onsuccess = () => { resolve(!!request.result); database.close(); }; }; }))).toBe(true);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'تأكيد واعتماد', exact: true }).click();
  await expect(page.getByText(/القرار بانتظار المزامنة/)).toBeVisible();
  expect(teacherAddress).toBe('قبل'); expect(decisions).toHaveLength(0);
  await page.evaluate(() => { history.pushState({}, '', '/profile-reviews/students'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByText('عنوان الطالب المقترح', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'رفض الطلب', exact: true })).toBeDisabled();
  await page.getByLabel('سبب الرفض / ملاحظة').fill('يرجى تصحيح العنوان');
  await page.getByRole('button', { name: 'رفض الطلب', exact: true }).click();
  await expect(page.getByText(/القرار بانتظار المزامنة/)).toBeVisible();
  await context.setOffline(false);
  await expect.poll(() => decisions.length).toBe(2);
  expect(teacherAddress).toBe('عنوان المحفظ المقترح');
  expect(decisions.find(op => op.data.status === 'REJECTED').data.reason).toBe('يرجى تصحيح العنوان');
});

test('cold offline navigation opens downloaded core screens and searches locally', async ({ page, context }) => {
  const syncRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\/(sync-all|offline-sync|sync)(\/|\?|$)/.test(request.url())) syncRequests.push(request.url());
  });
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
    if (url.pathname === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
    if (url.pathname === '/api/sync-all/delta') return route.fulfill({ json: { tables: {}, changedEntities: [], cursor: '0', hasMore: false } });
    if (url.pathname === '/api/sync-all') return route.fulfill({ json: { data: fixtures[url.searchParams.get('table') || ''] || [], meta: { hasNextPage: false } } });
    if (url.pathname === '/api/settings/public') return route.fulfill({ json: { name: 'اختبار الأوفلاين' } });
    if (url.pathname.endsWith('/unread-count')) return route.fulfill({ json: { count: 0 } });
    if (url.pathname.includes('/announcements')) return route.fulfill({ json: [] });
    if (url.pathname === '/api/support') return route.fulfill({ json: { data: [], meta: { total: 0, totalPages: 1, hasNextPage: false, page: 1, limit: 20 } } });
    if (url.pathname === '/api/support/stats') return route.fulfill({ json: { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0, assignedToMe: 0 } });
    return route.fulfill({ status: 403, json: { message: 'Unused in this offline test' } });
  });
  // Opening the app must prepare offline data without visiting settings or pressing a button.
  await page.goto('/');
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('halaqatFull');
    request.onsuccess = () => { const db = request.result; const read = db.transaction('meta').objectStore('meta').get('00000000-0000-4000-8000-000000000001:downloadedAt'); read.onsuccess = () => { resolve(Boolean(read.result)); db.close(); }; };
  }))).toBe(true);
  await page.clock.install();
  const syncCount = syncRequests.length;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.clock.fastForward('06:00');
  expect(syncRequests.length).toBe(syncCount);
  await page.clock.resume();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
  await context.setOffline(true);
  for (const path of ['/students', '/circles', '/teachers', '/attendance', '/recitations', '/reports', '/media-schedule', '/teacher-duties', '/support', '/settings/offline', '/']) {
    await page.goto(path);
    await expect(page.locator('main h1').first(), `${path}: ${errors.join('; ')}`).toBeVisible();
    await expect(page.locator('main')).not.toContainText('تعذر تحميل');
  }
  await page.goto('/students');
  await expect(page.locator('main')).toContainText('طالب أوفلاين');
  await page.goto('/media-schedule');
  await page.getByLabel('شو بدنا نعمل؟').fill('تصوير نشاط دون نت');
  await page.getByLabel('الفكرة').fill('فكرة إعلامية');
  await page.getByLabel('المحتوى').fill('محتوى تجريبي');
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.locator('table')).toContainText('تصوير نشاط دون نت');
  await page.reload();
  await expect(page.locator('table')).toContainText('تصوير نشاط دون نت');
  await page.getByRole('button', { name: 'تعديل', exact: true }).click();
  await page.getByLabel('شو بدنا نعمل؟').fill('تعديل دون نت');
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.locator('table')).toContainText('تعديل دون نت');
  const mediaExport = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تصدير Excel' }).click();
  expect((await mediaExport).suggestedFilename()).toBe('media-schedule.xlsx');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(page.locator('table')).not.toContainText('تعديل دون نت');
  await page.goto('/teacher-duties');
  await page.getByLabel('محفظ النظام', { exact: true }).check();
  await page.getByRole('button', { name: 'حفظ التعيين' }).click();
  await expect(page.locator('table')).toContainText('محفظ النظام');
  const dutyExport = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تصدير Excel' }).click();
  expect((await dutyExport).suggestedFilename()).toBe('teacher-duties.xlsx');
  await page.goto('/students');
  const search = page.getByPlaceholder('بحث بالاسم أو رقم الطالب أو رقم الهوية...');
  await search.fill('اسم غير موجود');
  await expect(page.locator('main')).not.toContainText('طالب أوفلاين');
  await search.fill('طالب أوفلاين');
  await expect(page.locator('main')).toContainText('طالب أوفلاين');
  // A roster refresh while editing must not reset an absence selection to present.
  await page.goto(`/attendance?circleId=${circleId}`);
  await expect(page.getByText('طالب أوفلاين', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'تعيين الكل غائب', exact: true }).click();
  await page.evaluate(({ account, studentId }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('halaqatFull');
    request.onsuccess = () => {
      const database = request.result;
      const tx = database.transaction('students', 'readwrite');
      const store = tx.objectStore('students');
      const read = store.get([account, studentId]);
      read.onsuccess = () => store.put({ ...read.result, fullName: 'طالب بعد التحديث' });
      tx.oncomplete = () => { database.close(); window.dispatchEvent(new Event('halaqat:changed')); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  }), { account, studentId: fixtures.students[0].id });
  await expect(page.getByText('طالب بعد التحديث', { exact: true })).toBeVisible();
  const row = page.locator('li').filter({ has: page.getByText('طالب بعد التحديث', { exact: true }) });
  await expect(row.locator('button[aria-pressed="true"]')).toContainText('غياب');
  await page.goto('/');
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.getByRole('status', { name: 'بدء التطبيق', exact: true })).not.toBeVisible();
  await page.screenshot({ path: 'test-results/design-desktop.png', fullPage: true, animations: 'disabled' });
  const sidebar = page.locator('aside nav');
  while (await sidebar.getByRole('button', { expanded: false }).count()) await sidebar.getByRole('button', { expanded: false }).first().click();
  await sidebar.evaluate(element => { element.scrollTop = 150; });
  const sidebarOffset = await sidebar.evaluate(element => element.scrollTop);
  expect(sidebarOffset).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'قائمة الحساب', exact: true }).click();
  expect(await sidebar.evaluate(element => element.scrollTop)).toBe(sidebarOffset);
  await page.getByRole('button', { name: 'قائمة الحساب', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/design-mobile.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'فتح القائمة', exact: true }).click();
  await expect(page.getByRole('button', { name: 'إغلاق القائمة', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/design-mobile-menu.png', animations: 'disabled' });
  expect(errors).toEqual([]);
});
