import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.TEST_URL || 'http://127.0.0.1:4174/';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifacts = path.resolve('output/playwright');
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: edgePath });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(new URL('formularz/', baseUrl).href, { waitUntil: 'networkidle' });

  assert.equal(await page.getByRole('heading', { name: 'Zgłoszenie zawodnika' }).isVisible(), true);
  assert.equal(await hasHorizontalOverflow(page), false);
  await page.locator('[name="name"]').fill('john smith');
  await page.locator('[name="birthDate"]').fill('1990-01-01');
  await page.locator('[name="residence"]').fill('hamburg');
  await page.locator('[name="countryCode"]').selectOption('DE');
  await page.locator('[name="height"]').fill('190');
  await page.locator('[name="weight"]').fill('135');
  await page.locator('[name="squatKg"]').fill('330');
  await page.locator('[name="deadliftKg"]').fill('390');
  await page.locator('[name="nationalLevel"]').selectOption('NATIONAL_CHAMPIONSHIP');
  await page.locator('[name="nationalPlace"]').fill('1');
  await page.locator('[name="nationalYear"]').fill('2025');
  await page.locator('[name="titleCodes"][value="NATIONAL_CHAMPION"]').check();
  await page.locator('[name="categories"][value="Puchar Polski"]').check();

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="600" height="600" fill="#ef4b23"/><rect x="600" width="600" height="600" fill="#245ee8"/></svg>');
  await page.locator('[data-photo-input]').setInputFiles({ name: 'landscape.svg', mimeType: 'image/svg+xml', buffer: svg });
  await page.locator('[data-cropper]').waitFor({ state: 'visible' });
  await page.locator('[data-crop-zoom]').evaluate(element => {
    element.value = '2';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const canvas = page.locator('[data-crop-canvas]');
  const box = await canvas.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await page.getByRole('button', { name: /EN/ }).click();
  assert.equal(await page.getByRole('heading', { name: 'Competitor submission' }).isVisible(), true);
  const retained = await page.evaluate(() => ({
    name: document.querySelector('[name="name"]').value,
    country: document.querySelector('[name="countryCode"]').value,
    zoom: document.querySelector('[data-crop-zoom]').value,
    title: document.querySelector('[name="titleCodes"][value="NATIONAL_CHAMPION"]').checked,
    photo: document.querySelector('[data-photo-input]').files.length
  }));
  assert.deepEqual(retained, { name: 'JOHN SMITH', country: 'DE', zoom: '2', title: true, photo: 1 });
  assert.equal(await page.getByText('Germany', { exact: true }).count(), 1);
  assert.equal(await page.locator('[name="nationalLevel"]').inputValue(), 'NATIONAL_CHAMPIONSHIP');
  await page.getByRole('button', { name: /PL/ }).click();
  assert.equal(await page.locator('[name="countryCode"] option:checked').textContent(), 'Niemcy');

  await page.getByText('Potwierdzenie danych i zdjęcia', { exact: true }).click();
  await page.locator('[name="dataAndPhotoConfirmed"]').check();
  await page.getByText('Informacja o przetwarzaniu danych osobowych', { exact: true }).click();
  await page.locator('[name="privacyNoticeAcknowledged"]').check();
  await page.getByRole('button', { name: 'Sprawdź i przygotuj plik' }).click();
  await page.locator('[data-form-status]').filter({ hasText: 'potwierdź dane' }).waitFor();
  await page.getByText('Oświadczenie zawodnika', { exact: true }).click();
  await page.locator('[name="riskAccepted"]').check();
  await page.getByRole('button', { name: 'Sprawdź i przygotuj plik' }).click();
  await page.locator('[data-result-panel]').waitFor({ state: 'visible' });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Pobierz plik zgłoszenia JSON' }).click();
  const download = await downloadPromise;
  const downloadPath = path.join(artifacts, 'competitor-submission-v2.json');
  await download.saveAs(downloadPath);
  const submission = JSON.parse(await fs.readFile(downloadPath, 'utf8'));
  assert.equal(submission.schemaVersion, 2);
  assert.equal(submission.formLocale, 'pl');
  assert.equal(submission.competitor.name, 'JOHN SMITH');
  assert.equal(submission.competitor.countryCode, 'DE');
  assert.equal(submission.competitor.strengthRecords.benchPressKg, null);
  assert.deepEqual(submission.competitor.career.titleCodes, ['NATIONAL_CHAMPION']);
  assert.equal(submission.declarations.riskAccepted, true);
  assert.equal(submission.declarations.mediaPermissionAccepted, false);
  assert.equal(submission.declarations.version, '2026-08-v1');
  assert.match(submission.competitor.photo, /^data:image\/jpeg;base64,/);
  const photoSize = await page.evaluate(async dataUrl => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, submission.competitor.photo);
  assert.deepEqual(photoSize, { width: 120, height: 120 });
  assert.deepEqual(pageErrors, []);
  await page.screenshot({ path: path.join(artifacts, 'form-phone.png'), fullPage: true });
  await context.close();

  for (const width of [360, 412]) {
    const mobile = await browser.newContext({ viewport: { width, height: 800 } });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(new URL('formularz/', baseUrl).href, { waitUntil: 'networkidle' });
    assert.equal(await hasHorizontalOverflow(mobilePage), false, `Formularz nie może wychodzić poza ekran ${width} px`);
    await mobile.close();
  }
} finally {
  await browser.close();
}

console.log('Form UI tests passed');

async function hasHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}
