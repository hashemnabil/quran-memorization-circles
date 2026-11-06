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
  // A hydrated app header can exist underneath the security overlay. Do not
  // mistake its presence for an unlocked app.
  const panel = page.locator('.security-panel');
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.waitForFunction(() => {
      const gate = document.querySelector('.security-panel');
      if (gate) return Boolean(gate.querySelector('form'));
      if (location.pathname === '/login') return Boolean(document.querySelector('.login-screen'));
      return Boolean(document.querySelector('.app-topbar')) &&
        !document.querySelector('[data-security-blocked]') &&
        document.documentElement.dataset.appLocked !== '1';
    }, undefined, { timeout: 20000 });

    if (!await panel.isVisible()) {
      if (new URL(page.url()).pathname !== '/login') {
        await expect(page.locator('.app-topbar')).toBeVisible();
        await expect(page.locator('[data-security-blocked]')).toHaveCount(0);
      }
      return;
    }

    try {
      const fields = panel.locator('input[type="password"]');
      const count = await fields.count();
      for (let index = 0; index < count; index++) {
        await fields.nth(index).fill(TEST_LOCAL_PIN, { timeout: 4000 });
      }
      await panel.locator('button[type="submit"]').click({ timeout: 4000 });
      await expect(page.locator('[data-security-blocked]')).toHaveCount(0, { timeout: 12000 });
      if (new URL(page.url()).pathname !== '/login') await expect(page.locator('.app-topbar')).toBeVisible();
      return;
    } catch (error) {
      if (!await panel.isVisible()) continue;
      if (attempt === 5) throw error;
    }
  }
}

export async function gotoWithLocalUnlock(page: Page, url: string) {
  await page.addInitScript(() => localStorage.setItem('qc.onboarding.completed', '1'));
  const response = await page.goto(url);
  await unlockLocalGate(page);
  return response;
}
