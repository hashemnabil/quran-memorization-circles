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
  await page.getByRole('combobox').selectOption(fixtures.students[0].id);
  await page.getByRole('button', { name: 'إنشاء حساب طالب', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'الحساب وكلمة المرور' })).toBeVisible();
  await page.getByRole('button', { name: 'تم، إغلاق', exact: true }).click();
  await page.getByRole('button', { name: 'إعادة تعيين كلمة السر', exact: true }).click();
  await page.getByRole('button', { name: 'تم، إغلاق', exact: true }).click();
  await page.evaluate(() => { window.history.pushState({}, '', '/users'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('button', { name: 'إضافة مستخدم', exact: true }).click();
  await page.getByLabel('الاسم الكامل').fill('موظف بدون نت');
  await page.getByLabel('اسم المستخدم').fill('offlinestaff');
  await page.getByLabel('كلمة المرور', { exact: false }).fill('OfflinePassword123');
  await page.getByLabel('الدور').selectOption('TEACHER');
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'موظف بدون نت' })).toBeVisible();
  expect(received).toHaveLength(0);
  await context.setOffline(false);
  await expect.poll(() => received.length).toBe(3);
  expect(received.map(op => `${op.table}:${op.action}`)).toEqual(['studentAccounts:create', 'studentAccounts:reset-password', 'users:create']);
  await expect(page.getByRole('cell', { name: 'بانتظار المزامنة', exact: true })).toHaveCount(0);
});

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
  await expect(page.getByText('طالب متصل جديد', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('طالب متصل جديد', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'تسجيل طالب', exact: true }).click();
  await page.getByLabel('الاسم الكامل').fill('طالب محفوظ على الجوال');
  await page.getByLabel(/^حلقة التحفيظ/).selectOption(circleId);
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'تسجيل طالب جديد' })).not.toBeVisible();
  await expect(page.getByText('طالب محفوظ على الجوال', { exact: true })).toBeVisible();
});
test('student questionnaire saves online, edits offline and automatically updates the server after reconnect', async ({ page, context }) => {
  const identity = { ...user, role: 'STUDENT' };
  let student = { ...fixtures.students[0], selfAccountId: account, fullName: 'طالب الاستبيان', nationalId: '123456789', fatherNationalId: '987654321', birthDate: '2010-01-01', address: 'العنوان القديم', guardianName: 'ولي الأمر', guardianPhone: '0591234567', guardianRelation: 'الأب' };
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
    if (url.pathname === '/api/students/me/history') return route.fulfill({ json: { exams: [{ id: 'scheduled-exam', status: 'SCHEDULED', scheduledAt: '2030-01-01T10:00:00Z', location: 'قاعة الاختبار التجريبية', section: { name: 'الحزب الأول' } }] } });
    if (url.pathname === '/api/preparations') return route.fulfill({ json: { data: [{ id: 'prep-one', fromSurah: 'البقرة', fromAyah: 1, toSurah: 'البقرة', toAyah: 5, note: 'تحضير محفوظ للطالب' }], meta: { hasNextPage: false } } });
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
  await page.getByLabel(/^رقم هوية الطالب/).fill('123456780');
  await page.getByLabel(/^رقم هوية ولي الأمر/).fill('987654320');
  await page.getByLabel(/^العنوان/).fill('عنوان متصل جديد');
  await page.getByRole('button', { name: 'حفظ بياناتي', exact: true }).click();
  await expect(page.getByRole('button', { name: 'تعديل بياناتي', exact: true })).toBeVisible();
  expect(student.address).toBe('عنوان متصل جديد');
  expect(student.nationalId).toBe('123456780');
  expect(student.fatherNationalId).toBe('987654320');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('status', { name: 'بدء التطبيق', exact: true })).not.toBeVisible();
  await expect(page.getByText('غير متصل', { exact: true })).toBeVisible();
  await expect(page.getByText('تحضير محفوظ للطالب')).toBeVisible();
  await expect(page.getByText('قاعة الاختبار التجريبية', { exact: false })).toBeVisible();
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
