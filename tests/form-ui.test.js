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
  await page.locator('[name="phone"]').fill('+49 151 234-56-789');
  await page.locator('[name="email"]').fill('John.Smith@Example.com');
  await page.locator('[name="squatKg"]').fill('330');
  await page.locator('[name="deadliftKg"]').fill('390');
  const firstNational = page.locator('[data-career-list="national"] [data-career-entry]').first();
  await firstNational.locator('[data-career-field="level"]').selectOption('NATIONAL_CHAMPIONSHIP');
  await firstNational.locator('[data-career-field="place"]').fill('1');
  await firstNational.locator('[data-career-field="year"]').fill('2025');
  await page.locator('[data-add-career="national"]').click();
  const secondNational = page.locator('[data-career-list="national"] [data-career-entry]').nth(1);
  await secondNational.locator('[data-career-field="level"]').selectOption('NATIONAL_CUP');
  await secondNational.locator('[data-career-field="place"]').fill('2');
  await secondNational.locator('[data-career-field="year"]').fill('2024');
  await page.locator('[data-add-career="national"]').click();
  assert.equal(await page.locator('[data-career-list="national"] [data-career-entry]').count(), 3);
  await page.locator('[data-career-list="national"] [data-career-entry]').last().locator('[data-remove-career]').click();
  assert.equal(await page.locator('[data-career-list="national"] [data-career-entry]').count(), 2);

  const firstInternational = page.locator('[data-career-list="international"] [data-career-entry]').first();
  await firstInternational.locator('[data-career-field="level"]').selectOption('EUROPEAN_CHAMPIONSHIP');
  await firstInternational.locator('[data-career-field="place"]').fill('3');
  await firstInternational.locator('[data-career-field="year"]').fill('2024');
  await page.locator('[data-add-career="international"]').click();
  const secondInternational = page.locator('[data-career-list="international"] [data-career-entry]').nth(1);
  await secondInternational.locator('[data-career-field="level"]').selectOption('WORLD_CHAMPIONSHIP');
  await secondInternational.locator('[data-career-field="place"]').fill('5');
  await secondInternational.locator('[data-career-field="year"]').fill('2023');
  assert.equal(await page.locator('[name="categories"]').count(), 0);

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
    nationalCount: document.querySelectorAll('[data-career-list="national"] [data-career-entry]').length,
    secondNationalLevel: document.querySelectorAll('[data-career-list="national"] [data-career-entry]')[1].querySelector('[data-career-field="level"]').value,
    internationalCount: document.querySelectorAll('[data-career-list="international"] [data-career-entry]').length,
    secondInternationalLevel: document.querySelectorAll('[data-career-list="international"] [data-career-entry]')[1].querySelector('[data-career-field="level"]').value,
    photo: document.querySelector('[data-photo-input]').files.length
  }));
  assert.deepEqual(retained, {
    name: 'JOHN SMITH',
    country: 'DE',
    zoom: '2',
    nationalCount: 2,
    secondNationalLevel: 'NATIONAL_CUP',
    internationalCount: 2,
    secondInternationalLevel: 'WORLD_CHAMPIONSHIP',
    photo: 1
  });
  assert.equal(await page.getByText('Germany', { exact: true }).count(), 1);
  assert.equal(await firstNational.locator('[data-career-field="level"]').inputValue(), 'NATIONAL_CHAMPIONSHIP');
  await page.getByRole('button', { name: /PL/ }).click();
  assert.equal(await page.locator('[name="countryCode"] option:checked').textContent(), 'Niemcy');

  await page.getByText('Potwierdzenie danych i zdjęcia', { exact: true }).click();
  await page.locator('[name="dataAndPhotoConfirmed"]').check();
  await page.getByText('Informacja o przetwarzaniu danych kontaktowych', { exact: true }).click();
  await page.locator('[name="contactDataNoticeAcknowledged"]').check();
  assert.equal(await page.getByText('Tytuły Strongman', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Informacja o przetwarzaniu danych osobowych', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Sprawdź i przygotuj plik' }).click();
  await page.locator('[data-form-status]').filter({ hasText: 'potwierdź poprawność danych' }).waitFor();
  await page.getByText('Oświadczenie zawodnika', { exact: true }).click();
  await page.locator('[name="riskAccepted"]').check();
  await page.getByRole('button', { name: 'Sprawdź i przygotuj plik' }).click();
  await page.locator('[data-result-panel]').waitFor({ state: 'visible' });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Pobierz plik JSON' }).click();
  const download = await downloadPromise;
  assert.equal(await page.locator('[data-send]').isDisabled(), true, 'Bez skonfigurowanego endpointu wysyłka nie może udawać aktywnej');
  await page.locator('[data-delivery-status]').filter({ hasText: 'Automatyczna wysyłka nie jest jeszcze aktywna' }).waitFor();
  const downloadPath = path.join(artifacts, 'competitor-submission-v3.json');
  await download.saveAs(downloadPath);
  const submission = JSON.parse(await fs.readFile(downloadPath, 'utf8'));
  assert.equal(submission.schemaVersion, 3);
  assert.equal(submission.formLocale, 'pl');
  assert.equal(submission.competitor.name, 'JOHN SMITH');
  assert.equal(submission.competitor.countryCode, 'DE');
  assert.equal('categories' in submission.competitor, false);
  assert.equal('category' in submission.competitor, false);
  assert.deepEqual(submission.contact, { phone: '+4915123456789', email: 'john.smith@example.com' });
  assert.equal(submission.competitor.strengthRecords.benchPressKg, null);
  assert.equal(submission.competitor.career.nationalResults.length, 2);
  assert.equal(submission.competitor.career.nationalResults[1].level, 'NATIONAL_CUP');
  assert.equal(submission.competitor.career.internationalResults.length, 2);
  assert.equal(submission.competitor.career.internationalResults[1].level, 'WORLD_CHAMPIONSHIP');
  assert.equal('titleCodes' in submission.competitor.career, false);
  assert.equal(submission.declarations.riskAccepted, true);
  assert.equal(submission.declarations.mediaPermissionAccepted, false);
  assert.equal(submission.declarations.version, '2026-08-v3');
  assert.equal(submission.declarations.contactDataNoticeAcknowledged, true);
  assert.equal('privacyNoticeAcknowledged' in submission.declarations, false);
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
