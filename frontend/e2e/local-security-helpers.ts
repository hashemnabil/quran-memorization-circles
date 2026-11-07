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
  await page.waitForFunction(() => {
    if (document.querySelector('.login-screen button[type="submit"]:disabled')) return false;
    const screen = document.querySelector('.security-screen');
    return screen ? !!screen.querySelector('form') : !!document.querySelector('.login-screen, .app-topbar');
  });
  const panel = page.locator('.security-panel');
  if (!await panel.isVisible()) return;

  // React can replace the entire form during session hydration. Only retry
  // while the security panel still exists; do not consume the whole test
  // timeout waiting on a locator that was detached.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!await panel.isVisible()) return;
    try {
      const fields = panel.locator('input[type="password"]');
      const count = await fields.count();
      for (let index = 0; index < count; index++) {
        if (!await panel.isVisible()) return;
        await fields.nth(index).fill(TEST_LOCAL_PIN, { timeout: 2500 });
      }
      if (!await panel.isVisible()) return;
      const submit = panel.locator('button[type="submit"]');
      if (await submit.count()) {
        await submit.click({ timeout: 2500 });
      }
      await expect(page.locator('[data-security-blocked]')).toHaveCount(0);
      return;
    } catch (error) {
      if (!await panel.isVisible()) return;
      if (attempt === 3) throw error;
    }
  }
}

export async function gotoWithLocalUnlock(page: Page, url: string) {
  await page.addInitScript(() => localStorage.setItem('qc.onboarding.completed', '1'));
  const response = await page.goto(url);
  await unlockLocalGate(page);
  return response;
}
