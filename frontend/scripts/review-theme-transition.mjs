import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { chromium } from 'playwright-core';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import ThemeSelect from '../src/components/ThemeSelect.tsx';

const component = renderToString(createElement(ThemeSelect));
const source = await readFile(new URL('../src/lib/theme-transition.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const themeStyles = css.slice(css.indexOf(':root { --surface:'), css.indexOf('.login-panel { position:', css.indexOf(':root { --surface:')));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent(`<!doctype html><html lang="ar" dir="rtl" data-theme="light"><meta charset="utf-8"><style>${themeStyles}
    *{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font-family:Tahoma,Arial,sans-serif}main{padding:24px 20px;min-height:100vh}h1{font-size:25px}p{line-height:1.9;font-size:14px}.card{margin:20px 0;padding:22px;border:1px solid var(--line);border-radius:22px;background:var(--surface)}h2{font-size:17px;margin:0 0 16px}.row{display:flex;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--line);font-size:13px}.muted{opacity:.68}.brand{color:#16855e;font-size:13px;font-weight:bold}[data-theme=dark]{--surface:#172720;--ink:#e4eee8;--canvas:#0d1813;--line:#30443a}
    </style><main><span class="brand">مدرسة عبدالله بن عمر</span><h1>الإعدادات</h1><p class="muted">مساحتك كما تحبها</p><section class="card"><h2>مظهر التطبيق</h2>${component}<p class="muted">اختر المظهر المناسب لك أو اتبع إعداد جهازك.</p></section><section class="card"><h2>الحساب والخصوصية</h2><div class="row"><span>الحماية المحلية</span><span>مفعّلة</span></div><div class="row"><span>الإشعارات</span><span>إدارة</span></div><div class="row"><span>العمل دون إنترنت</span><span>متاح</span></div></section></main></html>`);
  await page.evaluate(async moduleUrl => {
    const { transitionTheme } = await import(moduleUrl);
    window.themeRequests = [];
    document.querySelectorAll('.theme-option').forEach((button, index) => {
      button.addEventListener('click', () => {
        const theme = index === 1 ? 'dark' : 'light';
        window.themeRequests.push(transitionTheme(theme, button.querySelector('svg'), () => {
          document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme;
          document.querySelectorAll('.theme-option').forEach((option, optionIndex) => option.setAttribute('aria-pressed', String(optionIndex === index)));
        }));
      });
    });
  }, 'data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
  const snapshot = async (label, theme) => {
    const iconBounds = await page.getByRole('button', { name: label, exact: true }).locator('svg').boundingBox();
    await page.getByRole('button', { name: label, exact: true }).click();
    const expectedPseudo = theme === 'dark' ? '::view-transition-new(root)' : '::view-transition-old(root)';
    await page.waitForFunction(pseudo => document.documentElement.getAnimations({ subtree: true }).some(animation => animation.effect?.pseudoElement === pseudo && animation.playState === 'running'), expectedPseudo);
    const details = await page.evaluate(pseudo => {
      const animation = document.documentElement.getAnimations({ subtree: true }).find(animation => animation.effect?.pseudoElement === pseudo && animation.playState === 'running');
      animation.pause(); animation.currentTime = 240;
      return { pseudo: animation.effect.pseudoElement, frames: animation.effect.getKeyframes().map(frame => frame.clipPath) };
    }, expectedPseudo);
    assert.equal(details.pseudo, theme === 'dark' ? '::view-transition-new(root)' : '::view-transition-old(root)');
    assert.match(details.frames[theme === 'dark' ? 0 : 1], /^circle\(0px/);
    const expanded = details.frames[theme === 'dark' ? 1 : 0].match(/^circle\(([\d.]+)px at ([\d.]+)px ([\d.]+)px\)$/);
    assert.ok(expanded);
    const [, radius, x, y] = expanded.map(Number);
    assert.ok(Math.abs(x - (iconBounds.x + iconBounds.width / 2)) < .01);
    assert.ok(Math.abs(y - (iconBounds.y + iconBounds.height / 2)) < .01);
    for (const [cornerX, cornerY] of [[0,0],[390,0],[0,844],[390,844]]) assert.ok(Math.hypot(cornerX-x,cornerY-y) <= radius);
    await page.screenshot({ path: fileURLToPath(new URL(`../../docs/theme-transition-${theme}.png`, import.meta.url)) });
    await page.evaluate(() => { for (const animation of document.documentElement.getAnimations({ subtree: true })) animation.finish(); });
    await page.evaluate(() => Promise.all(window.themeRequests));
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  };
  await snapshot('ليلي', 'dark'); await snapshot('نهاري', 'light');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'ليلي', exact: true }).click();
  await page.evaluate(() => Promise.all(window.themeRequests));
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(await page.locator('html').getAttribute('data-theme-transition'), null);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('.theme-option');
    buttons[0].click(); buttons[1].click(); buttons[0].click();
  });
  await page.evaluate(() => Promise.all(window.themeRequests));
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await page.locator('html').getAttribute('data-theme-transition'), null);
  await page.getByRole('button', { name: 'ليلي', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.getAnimations({ subtree: true }).some(animation => animation.playState === 'running'));
  await page.evaluate(() => window.dispatchEvent(new Event('qc:lock-now')));
  await page.evaluate(() => Promise.all(window.themeRequests));
  assert.equal(await page.locator('html').getAttribute('data-theme-transition'), null);
  await page.evaluate(() => { document.startViewTransition = undefined; });
  await page.getByRole('button', { name: 'نهاري', exact: true }).click();
  await page.evaluate(() => Promise.all(window.themeRequests));
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await page.locator('html').getAttribute('data-theme-transition'), null);
  assert.deepEqual(errors, []);
  console.log('PASS: actual ThemeSelect markup; dark/reverse light reveals; viewport coverage; no overflow; reduced motion; rapid-click final choice; lock interruption; unsupported-browser fallback.');
} finally { await browser.close(); }
