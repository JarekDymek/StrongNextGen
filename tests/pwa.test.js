import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.TEST_URL || 'http://127.0.0.1:4174/';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ headless: true, executablePath: edgePath });
const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

try {
try {
  const response = await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.equal(response?.ok(), true, 'Strona główna musi odpowiadać w trybie produkcyjnym');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true, 'Service worker musi kontrolować aplikację');

  const manifest = await page.evaluate(async () => {
    const response = await fetch(new URL('manifest.json', document.baseURI));
    return response.json();
  });
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.icons.some(icon => icon.sizes === '192x192'), true);
  assert.equal(manifest.icons.some(icon => icon.sizes === '512x512'), true);
  const release = await page.evaluate(async () => (await fetch(new URL('version.json', document.baseURI))).json());
  assert.equal(release.version, '1.0.0');

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('h1').waitFor();
  assert.equal(await page.locator('h1').textContent(), 'Nowe zawody Strong Man');
  assert.equal(await hasHorizontalOverflow(page), false, 'Aplikacja offline nie może wychodzić poza ekran 320 px');
  await context.setOffline(false);

  const formPage = await context.newPage();
  const formResponse = await formPage.goto(new URL('formularz/', baseUrl).href, { waitUntil: 'networkidle' });
  assert.equal(formResponse?.ok(), true, 'Oddzielny formularz musi być dostępny');
  assert.equal(await formPage.getByRole('heading', { name: 'Zgłoszenie zawodnika' }).isVisible(), true);
  assert.equal(await hasHorizontalOverflow(formPage), false, 'Formularz nie może wychodzić poza ekran 320 px');
  await formPage.close();

  assert.deepEqual(pageErrors, []);
} finally {
  await context.close();
}

  const damagedContext = await browser.newContext();
  try {
    await damagedContext.addInitScript(() => {
      localStorage.setItem('strongman-next.competitor-database.v1', '{uszkodzona');
    });
    const damagedPage = await damagedContext.newPage();
    await damagedPage.goto(baseUrl, { waitUntil: 'networkidle' });
    await damagedPage.locator('.toast').filter({ hasText: 'bazy zawodników' }).waitFor();
    assert.equal(
      await damagedPage.evaluate(() => localStorage.getItem('strongman-next.competitor-database.v1')),
      '{uszkodzona',
      'Uszkodzona baza nie może zostać automatycznie nadpisana przy starcie'
    );
  } finally {
    await damagedContext.close();
  }
} finally {
  await browser.close();
}

console.log('PWA tests passed');

async function hasHorizontalOverflow(targetPage) {
  return targetPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}
