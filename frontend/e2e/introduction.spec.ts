import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/settings/public', route => route.fulfill({ json: { name: 'مدرسة عبدالله بن عمر لتحفيظ القرآن الكريم' } }));
});

test('first website visit shows five slides, supports previous, completes once and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'مرحباً بك في مدرسة عبدالله بن عمر' })).toBeVisible();
  await expect(page.getByRole('button', { name: /عرض الخطوة/ })).toHaveCount(5);
  await page.getByRole('button', { name: 'متابعة' }).click();
  await expect(page.getByRole('heading', { name: 'تابع حلقاتك القرآنية' })).toBeVisible();
  await page.getByRole('button', { name: 'السابق' }).click();
  await expect(page.getByRole('heading', { name: 'مرحباً بك في مدرسة عبدالله بن عمر' })).toBeVisible();
  await page.getByRole('button', { name: 'عرض الخطوة 5' }).click();
  await expect(page.getByRole('heading', { name: 'ابدأ رحلتك مع القرآن' })).toBeVisible();
  await page.getByRole('button', { name: 'ابدأ الآن', exact: true }).click();
  await expect(page.getByRole('main', { name: 'التعريف بالتطبيق' })).not.toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('qc.onboarding.completed'))).toBe('1');
  await page.reload();
  await expect(page.getByRole('main', { name: 'التعريف بالتطبيق' })).not.toBeVisible();
  await expect(page.getByRole('combobox', { name: 'مظهر التطبيق' })).toHaveCount(0);
});

test('skipping the introduction survives reload and is available without internet', async ({ page, context }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'تخطي', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'تخطي', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('qc.onboarding.completed'))).toBe('1');
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('main', { name: 'التعريف بالتطبيق' })).not.toBeVisible();
});

test('Arabic swipe advances a slide without completing the introduction', async ({ page }) => {
  await page.goto('/login');
  const main = page.getByRole('main', { name: 'التعريف بالتطبيق' });
  await expect(main).toBeVisible();
  await main.evaluate(element => {
    const start = new Touch({ identifier: 1, target: element, clientX: 80, clientY: 250 });
    const end = new Touch({ identifier: 1, target: element, clientX: 220, clientY: 255 });
    element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start] }));
    element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [end] }));
  });
  await expect(page.getByRole('heading', { name: 'تابع حلقاتك القرآنية' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('qc.onboarding.completed'))).toBeNull();
});

test('privacy policy is accessible on a first visit without introduction', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('main', { name: 'التعريف بالتطبيق' })).not.toBeVisible();
  await expect(page.getByRole('heading').first()).toBeVisible();
});
