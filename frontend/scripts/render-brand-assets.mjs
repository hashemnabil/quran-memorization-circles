// Render the school's public logo into native/PWA sizes without changing its artwork.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logo = `data:image/png;base64,${fs.readFileSync(path.join(root, 'public/brand-logo.png')).toString('base64')}`;
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });
let count = 0;
async function render(destination, width, height, kind = 'icon') {
  const size = kind === 'splash' ? Math.round(Math.min(width, height) * .3) : Math.round(Math.min(width, height) * (kind === 'foreground' ? .6 : .84));
  const transparent = kind === 'foreground';
  await page.setViewportSize({ width, height });
  await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;}body{display:grid;place-items:center;background:${transparent ? 'transparent' : '#186346'};}img{width:${size}px;height:${size}px;object-fit:contain;}</style><img src="${logo}" />`);
  await page.locator('img').evaluate(image => image.decode());
  await page.screenshot({ path: destination, omitBackground: transparent }); count++;
}
function walk(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(file => file.isDirectory() ? walk(path.join(folder, file.name)) : [path.join(folder, file.name)]);
}
try {
  for (const file of walk(path.join(root, 'android/app/src/main/res')).filter(file => /(?:ic_launcher(?:_round|_foreground)?|splash)\.png$/.test(file))) {
    const bytes = fs.readFileSync(file);
    await render(file, bytes.readUInt32BE(16), bytes.readUInt32BE(20), file.endsWith('splash.png') ? 'splash' : file.endsWith('ic_launcher_foreground.png') ? 'foreground' : 'icon');
  }
  await render(path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), 1024, 1024);
  for (const file of walk(path.join(root, 'ios/App/App/Assets.xcassets/Splash.imageset')).filter(file => file.endsWith('.png'))) {
    const bytes = fs.readFileSync(file); await render(file, bytes.readUInt32BE(16), bytes.readUInt32BE(20), 'splash');
  }
  fs.mkdirSync(path.join(root, 'public/icons'), { recursive: true });
  await render(path.join(root, 'public/icons/icon-192.png'), 192, 192);
  await render(path.join(root, 'public/icons/icon-512.png'), 512, 512);
  console.log(`Rendered ${count} native/PWA brand assets.`);
} finally { await browser.close(); }
