import { expect, type Page } from '@playwright/test';
export const TEST_LOCAL_PIN = '936285';
export async function unlockLocalGate(page: Page) {
  await page.waitForFunction(() => {
    if (document.querySelector('.login-screen button[type="submit"]:disabled')) return false;
    const screen = document.querySelector('.security-screen');
    return screen ? !!screen.querySelector('form') : !!document.querySelector('.login-screen, .app-topbar');
  });
  const panel = page.locator('.security-panel');
  if (!await panel.isVisible()) return;
  const fields = panel.locator('input[type="password"]');
  for (let index = 0; index < await fields.count(); index++) await fields.nth(index).fill(TEST_LOCAL_PIN);
  await panel.locator('button[type="submit"]').click();
  await expect(page.locator('[data-security-blocked]')).toHaveCount(0);
}
export async function gotoWithLocalUnlock(page: Page, url: string) {
  await page.addInitScript(() => localStorage.setItem('qc.onboarding.completed', '1'));
  const response = await page.goto(url);
  await unlockLocalGate(page);
  return response;
}
