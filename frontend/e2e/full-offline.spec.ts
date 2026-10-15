import { test, expect } from '@playwright/test';
const account = '00000000-0000-4000-8000-000000000001';
const circleId = '00000000-0000-4000-8000-000000000002';
const user = { id: account, username: 'offline-test', fullName: 'مدير الاختبار', role: 'ADMIN', isActive: true, mustChangePassword: false };
const fixtures: Record<string, any[]> = {
  students: [{ id: '00000000-0000-4000-8000-000000000003', fullName: 'طالب أوفلاين', code: 'ST-1', status: 'ACTIVE', gender: 'MALE', circleId, circle: { id: circleId, name: 'حلقة الأوفلاين' }, memorizedParts: 1, totalPoints: 0, createdAt: '2026-10-15T00:00:00Z' }],
  circles: [{ id: circleId, name: 'حلقة الأوفلاين', code: 'C-1', isActive: true, capacity: 20, studentsCount: 1, teachers: [], scheduleDays: [], students: [] }],
  teachers: [{ id: '00000000-0000-4000-8000-000000000004', isActive: true, user: { id: 'teacher-user', fullName: 'معلم أوفلاين', isActive: true }, circleRoles: [] }],
  dutyTeachers: [{ id: '00000000-0000-4000-8000-000000000005', fullName: 'محفظ النظام' }],
};

test('website login opens immediately without native splash or onboarding', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { name: 'حلقات التحفيظ' } }));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'بدء التطبيق', exact: true })).toHaveCount(0);
  await expect(page.getByRole('main', { name: 'التعريف بالتطبيق', exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('qc.onboarding.completed'))).toBe(null);
  await page.screenshot({ path: 'test-results/login-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/login-mobile.png', animations: 'disabled' });
});

test('native launch shows only a logo and introduces the app once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { (window as any).androidBridge = {}; });
  await page.route('**/api/**', route => route.fulfill({ json: { name: 'حلقات التحفيظ' } }));
  await page.goto('/login');
  const splash = page.getByRole('status', { name: 'بدء التطبيق', exact: true });
  await expect(splash).toBeVisible();
  await expect(splash).toHaveText('');
  await splash.screenshot({ path: 'test-results/native-logo.png', animations: 'disabled' });
  await expect(page.getByRole('heading', { name: 'حلقتك بين يديك' })).toBeVisible();
  await page.screenshot({ path: 'test-results/native-intro.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'متابعة', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'يومك أكثر تنظيمًا' })).toBeVisible();
  await page.getByRole('button', { name: 'متابعة', exact: true }).click();
  await page.getByRole('button', { name: 'ابدأ الآن', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  await page.reload();
  await expect(splash).not.toBeVisible();
  await expect(page.getByRole('main', { name: 'التعريف بالتطبيق', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
});

test('online student creation waits for acknowledgement and remains visible before offline bootstrap completes', async ({ page }) => {
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
  await page.getByLabel('حلقة التحفيظ', { exact: true }).selectOption(circleId);
  const sending = page.waitForRequest(request => request.url().endsWith('/api/sync-all') && request.method() === 'POST');
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await sending;
  try { await expect(page.getByRole('heading', { name: 'تسجيل طالب جديد' })).toBeVisible(); }
  finally { release(); }
  await expect(page.getByRole('heading', { name: 'تسجيل طالب جديد' })).not.toBeVisible();
  await expect(page.getByText('طالب متصل جديد', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('طالب متصل جديد', { exact: true })).toBeVisible();
});
test('student questionnaire saves online, edits offline and automatically updates the server after reconnect', async ({ page, context }) => {
  const identity = { ...user, role: 'STUDENT' };
  let student = { ...fixtures.students[0], selfAccountId: account, fullName: 'طالب الاستبيان', birthDate: '2010-01-01', address: 'العنوان القديم', guardianName: 'ولي الأمر', guardianPhone: '0591234567', guardianRelation: 'الأب' };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(identity => {
    localStorage.setItem('qc.onboarding.completed', '1');
    localStorage.setItem('qc.accessToken', 'test-token');
    localStorage.setItem('qc.offlineUser', JSON.stringify(identity));
  }, identity);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: identity });
    if (url.pathname === '/api/students/me') return route.fulfill({ json: student });
    if (url.pathname === '/api/students/me/history') return route.fulfill({ json: {} });
    if (url.pathname === '/api/settings/public') return route.fulfill({ json: { name: 'حلقات التحفيظ' } });
    if (url.pathname === '/api/sync-all/watermark') return route.fulfill({ json: { cursor: '0' } });
    if (url.pathname === '/api/sync-all/delta') return route.fulfill({ json: { cursor: '0', tables: {}, changedEntities: [], hasMore: false } });
    if (url.pathname === '/api/sync-all') {
      if (route.request().method() === 'POST') {
        const outcomes = route.request().postDataJSON().operations.map((op: any) => {
          expect(op.action).toBe('questionnaire'); expect(op.entityId).toBe(student.id);
          student = { ...student, ...op.data }; return { opId: op.opId, status: 'applied', data: student };
        });
        return route.fulfill({ json: { outcomes } });
      }
      return route.fulfill({ json: { data: url.searchParams.get('table') === 'students' ? [student] : [], meta: { hasNextPage: false } } });
    }
    return route.fulfill({ status: 403, json: { message: 'Not used' } });
  });
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'بدء التطبيق', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'تعديل بياناتي', exact: true }).click();
  await expect(page.getByLabel('الجنس', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('رقم الطالب', { exact: true })).toHaveCount(0);
  await page.getByLabel(/^العنوان/).fill('عنوان متصل جديد');
  await page.getByRole('button', { name: 'حفظ بياناتي', exact: true }).click();
  await expect(page.getByRole('button', { name: 'تعديل بياناتي', exact: true })).toBeVisible();
  expect(student.address).toBe('عنوان متصل جديد');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('status', { name: 'بدء التطبيق', exact: true })).not.toBeVisible();
  await expect(page.getByText('غير متصل', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'تعديل بياناتي', exact: true }).click();
  await expect(page.getByLabel(/^العنوان/)).toHaveValue('عنوان متصل جديد');
  await page.getByLabel(/^العنوان/).fill('عنوان محفوظ بدون نت');
  await page.getByRole('button', { name: 'حفظ بياناتي', exact: true }).click();
  await expect(page.getByRole('button', { name: 'تعديل بياناتي', exact: true })).toBeVisible();
  expect(student.address).toBe('عنوان متصل جديد');
  await page.screenshot({ path: 'test-results/student-mobile-questionnaire.png', animations: 'disabled' });
  await context.setOffline(false);
  await expect(page.getByText('متصل', { exact: true })).toBeVisible();
  await expect(page.getByText('غير متصل', { exact: true })).not.toBeVisible();
  await expect.poll(() => student.address).toBe('عنوان محفوظ بدون نت');
  await page.getByRole('button', { name: 'تعديل بياناتي', exact: true }).click();
  await expect(page.getByLabel(/^العنوان/)).toHaveValue('عنوان محفوظ بدون نت');
  await page.screenshot({ path: 'test-results/student-mobile-form.png', fullPage: true, animations: 'disabled' });
});

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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/design-mobile.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'فتح القائمة', exact: true }).click();
  await expect(page.getByRole('button', { name: 'إغلاق القائمة', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/design-mobile-menu.png', animations: 'disabled' });
  expect(errors).toEqual([]);
});
