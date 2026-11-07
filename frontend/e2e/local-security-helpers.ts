import { expect, type Page } from '@playwright/test';
export const TEST_LOCAL_PIN = '936285';

export async function fillLoginCredentials(page: Page, username: string, password: string) {
  await page.getByLabel('اسم المستخدم', { exact: true }).fill(username);
  await page.getByRole('button', { name: 'التالي: كلمة المرور', exact: true }).click();
  await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
}

// The local security screen can disappear while the app finishes restoring a
// session, and its form can be replaced after PIN entry. Avoid waiting for a
// detached field or clicking a submit button that no longer exists.
export async function unlockLocalGate(page: Page) {
  const panel = page.locator('.security-panel');
  // Account restoration is asynchronous. Wait for the real gate to settle;
  // a mounted topbar can be hidden/inert beneath the security screen.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.waitForFunction(() => {
      const gate = document.querySelector('.security-panel');
      if (gate) return !!gate.querySelector('form');
      if (document.documentElement.dataset.appLocked === '1') return false;
      if (document.querySelector('[data-security-blocked]')) return false;
      return !!document.querySelector('.login-screen') ||
        !!document.querySelector('.app-topbar') ||
        !!document.querySelector('main');
    }, undefined, { timeout: 30000 });

    if (!await panel.isVisible()) {
      // Don't return merely because the underlying layout exists.
      await expect(page.locator('[data-security-blocked]')).toHaveCount(0);
      return;
    }
    const fields = panel.locator('input[type="password"], input[inputmode="numeric"]');
    const count = await fields.count();
    if (!count) continue;
    for (let index = 0; index < count; index++) {
      await fields.nth(index).fill(TEST_LOCAL_PIN);
    }
    await panel.locator('button[type="submit"]').click();
    // Verification intentionally animates for 1.25s. Only continue when
    // the overlay is actually gone and the protected subtree is interactive.
    try {
      await expect(page.locator('[data-security-blocked]')).toHaveCount(0, { timeout: 15000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.appLocked !== '1')).toBe(true);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

/** Wait for asynchronous password verification and encrypted local setup before
 * checking authenticated UI. The unlock helper alone also accepts /login. */
export async function waitForAuthenticatedPage(page: Page) {
  await expect(page).not.toHaveURL(/\/login(?:[?#].*)?$/, { timeout: 30000 });
  await unlockLocalGate(page);
  await expect(page.locator('.login-screen')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('[data-security-blocked]')).toHaveCount(0);
}

export async function gotoWithLocalUnlock(page: Page, url: string) {
  await page.addInitScript(() => localStorage.setItem('qc.onboarding.completed', '1'));
  const response = await page.goto(url);
  await unlockLocalGate(page);
  return response;
}
