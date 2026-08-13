import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.TEST_URL || 'http://127.0.0.1:4174/';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifacts = path.resolve('output/playwright');
await fs.mkdir(artifacts, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: edgePath });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('dialog', dialog => dialog.accept());
await page.goto(baseUrl, { waitUntil: 'networkidle' });

assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
await page.getByRole('button', { name: 'Dodaj zawodnika', exact: true }).click();
const form = page.locator('[data-form="competitor-editor"]');
await form.locator('[name="name"]').fill('JAN TESTOWY');
await form.locator('[name="birthDate"]').fill('1990-01-02');
await form.locator('[name="residence"]').fill('KRAKOW');
await form.locator('[name="height"]').fill('190');
await form.locator('[name="weight"]').fill('130');
await form.locator('[name="notes"]').fill('Test trwałego rekordu');
await form.getByText('Puchar Polski', { exact: true }).click();
await form.getByText('Legenda', { exact: true }).click();

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="none"/><circle cx="300" cy="300" r="250" fill="#ef4b23"/></svg>');
await form.locator('[data-competitor-photo]').setInputFiles({ name: 'portret.svg', mimeType: 'image/svg+xml', buffer: svg });
await page.locator('[data-photo-status]').filter({ hasText: 'Gotowe:' }).waitFor();
await form.getByRole('button', { name: 'Zapisz zawodnika' }).click();
await page.locator('[data-form="competitor-editor"]').waitFor({ state: 'detached' });
await page.getByText('JAN TESTOWY', { exact: true }).first().waitFor();

const saved = await page.evaluate(() => {
  const database = JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1'));
  const state = JSON.parse(localStorage.getItem('strongman-next.state.v1'));
  const competitor = database.find(item => item.name === 'JAN TESTOWY');
  return { competitor, selected: state.selectedCompetitorIds.includes(competitor.id) };
});
assert.equal(saved.selected, true);
assert.equal(saved.competitor.photo.startsWith('data:image/jpeg;base64,'), true);
assert.ok(saved.competitor.photo.length < 16000);
assert.deepEqual(saved.competitor.categories, ['Puchar Polski', 'Legenda']);

const photoInfo = await page.evaluate(async photo => {
  const image = new Image();
  image.src = photo;
  await image.decode();
  const base64 = photo.split(',')[1];
  return { width: image.naturalWidth, height: image.naturalHeight, bytes: Math.floor(base64.length * 3 / 4) };
}, saved.competitor.photo);
assert.deepEqual({ width: photoInfo.width, height: photoInfo.height }, { width: 90, height: 120 });
assert.ok(photoInfo.bytes <= 10 * 1024);

const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: 'Eksport listy' }).click();
const download = await downloadPromise;
const exportPath = path.join(artifacts, 'competitors-export.json');
await download.saveAs(exportPath);
const exported = JSON.parse(await fs.readFile(exportPath, 'utf8'));
assert.equal(exported.find(item => item.id === saved.competitor.id)?.photo, saved.competitor.photo);

await page.reload({ waitUntil: 'networkidle' });
await page.getByText('JAN TESTOWY', { exact: true }).first().waitFor();
await page.getByPlaceholder('Wpisz fragment imienia lub nazwiska').fill('testowy');
await page.getByRole('button', { name: 'Legenda', exact: true }).click();
assert.equal(await page.locator(`[data-competitor-id="${saved.competitor.id}"]`).isVisible(), true);
await page.getByRole('button', { name: 'Tyberian Team', exact: true }).click();
assert.equal(await page.locator(`[data-competitor-id="${saved.competitor.id}"]`).isVisible(), false);
await page.getByRole('button', { name: 'Wszyscy', exact: true }).click();

await page.getByPlaceholder('Wpisz fragment imienia lub nazwiska').fill('testowy');
const testRow = page.locator(`[data-competitor-id="${saved.competitor.id}"]`);
await testRow.getByRole('button', { name: 'Edytuj' }).click();
let editor = page.locator('[data-form="competitor-editor"]');
await editor.getByLabel('Legenda').uncheck();
await editor.locator('[name="categoriesCustom"]').fill('POKAZY, pokazy, legenda');
await page.getByRole('button', { name: 'Usuń zdjęcie' }).click();
await page.getByRole('button', { name: 'Zapisz zawodnika' }).click();
await page.locator('[data-form="competitor-editor"]').waitFor({ state: 'detached' });
let editedRecord = await page.evaluate(id => JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1')).find(item => item.id === id), saved.competitor.id);
assert.equal(editedRecord.photo, '');
assert.deepEqual(editedRecord.categories, ['Puchar Polski', 'POKAZY']);

await testRow.getByRole('button', { name: 'Edytuj' }).click();
editor = page.locator('[data-form="competitor-editor"]');
assert.equal(await editor.getByLabel('Legenda').isChecked(), false);
assert.equal(await editor.locator('[name="categoriesCustom"]').inputValue(), 'POKAZY');
await editor.getByLabel('Puchar Polski').uncheck();
await editor.locator('[name="categoriesCustom"]').fill('NOWA GRUPA');
await editor.getByRole('button', { name: 'Zapisz zawodnika' }).click();
await page.locator('[data-form="competitor-editor"]').waitFor({ state: 'detached' });
editedRecord = await page.evaluate(id => JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1')).find(item => item.id === id), saved.competitor.id);
assert.deepEqual(editedRecord.categories, ['NOWA GRUPA']);

await testRow.getByRole('button', { name: 'Edytuj' }).click();
editor = page.locator('[data-form="competitor-editor"]');
await editor.waitFor();
const customCategoriesInput = editor.locator('[name="categoriesCustom"]');
await customCategoriesInput.waitFor();
await customCategoriesInput.fill('');
await page.waitForFunction(() => document.querySelector('[name="categoriesCustom"]')?.value === '');
assert.equal(await editor.locator('[name="categoriesCustom"]').inputValue(), '');
await editor.getByRole('button', { name: 'Zapisz zawodnika' }).click();
await page.locator('[data-form="competitor-editor"]').waitFor({ state: 'detached' });
await page.waitForFunction(id => {
  const record = JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1')).find(item => item.id === id);
  return record?.categories?.length === 0;
}, saved.competitor.id);
editedRecord = await page.evaluate(id => JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1')).find(item => item.id === id), saved.competitor.id);
assert.deepEqual(editedRecord.categories, []);
assert.equal(editedRecord.category, '');

const clearedDownloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: 'Eksport listy' }).click();
const clearedDownload = await clearedDownloadPromise;
const clearedExportPath = path.join(artifacts, 'competitors-cleared-categories.json');
await clearedDownload.saveAs(clearedExportPath);
const clearedExport = JSON.parse(await fs.readFile(clearedExportPath, 'utf8'));
assert.deepEqual(clearedExport.find(item => item.id === saved.competitor.id).categories, []);

await testRow.getByRole('button', { name: 'Edytuj' }).click();
await page.locator('[data-form="competitor-editor"]').getByLabel('Legenda').check();
await page.getByRole('button', { name: 'Zapisz zawodnika' }).click();
await page.locator('[data-form="competitor-editor"]').waitFor({ state: 'detached' });
const clearedImportChooser = page.waitForEvent('filechooser');
await page.getByRole('button', { name: 'Import zawodników' }).click();
await (await clearedImportChooser).setFiles(clearedExportPath);
await page.waitForFunction(id => {
  const record = JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1')).find(item => item.id === id);
  return record && record.categories.length === 0;
}, saved.competitor.id);

await page.reload({ waitUntil: 'networkidle' });
editedRecord = await page.evaluate(id => JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1')).find(item => item.id === id), saved.competitor.id);
assert.deepEqual(editedRecord.categories, []);

await page.evaluate(id => {
  const database = JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1'));
  const state = JSON.parse(localStorage.getItem('strongman-next.state.v1'));
  [database, state.competitors].forEach(records => {
    const record = records.find(item => item.id === id);
    record.category = '  AKTYWNY   ZAWODNIK ';
    record.categories = ['Aktywny zawodnik', 'AKTYWNY ZAWODNIK', 'Inny'];
  });
  localStorage.setItem('strongman-next.competitor-database.v1', JSON.stringify(database));
  localStorage.setItem('strongman-next.state.v1', JSON.stringify(state));
}, saved.competitor.id);
await page.reload({ waitUntil: 'networkidle' });
const migratedRecord = await page.evaluate(id => JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1')).find(item => item.id === id), saved.competitor.id);
assert.equal(migratedRecord.category, 'Inny');
assert.deepEqual(migratedRecord.categories, ['Inny']);
assert.equal(JSON.stringify(migratedRecord).toLocaleLowerCase('pl').includes('aktywny zawodnik'), false);
await page.getByPlaceholder('Wpisz fragment imienia lub nazwiska').fill('testowy');
await page.getByRole('button', { name: 'Inny', exact: true }).click();
assert.equal(await page.locator(`[data-competitor-id="${saved.competitor.id}"]`).isVisible(), true);

await page.getByRole('button', { name: 'Dodaj zawodnika', exact: true }).click();
await page.locator('[data-form="competitor-editor"] [name="name"]').fill('  jan   testowy  ');
await page.getByRole('button', { name: 'Zapisz zawodnika' }).click();
await page.locator('[data-form="competitor-editor"]').waitFor({ state: 'detached' });
const duplicateCount = await page.evaluate(() => JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1')).filter(item => item.name.toLocaleLowerCase('pl').replace(/\s+/g, ' ') === 'jan testowy').length);
assert.equal(duplicateCount, 1);

await page.getByRole('button', { name: 'Dodaj zawodnika', exact: true }).click();
await page.locator('[data-form="competitor-editor"] [name="name"]').fill('BLEDNY PLIK TEST');
await page.locator('[data-competitor-photo]').setInputFiles({ name: 'nie-obraz.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
await page.locator('[data-photo-status]').filter({ hasText: 'nie jest obrazem' }).waitFor();
assert.equal(await page.locator('[data-form="competitor-editor"] [name="name"]').inputValue(), 'BLEDNY PLIK TEST');
await page.getByRole('button', { name: 'Anuluj' }).click();

const baseJpeg = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 40;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ef4b23';
  context.fillRect(0, 0, 80, 40);
  return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
});
const exifPayload = Buffer.from([
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
  0x01, 0x00,
  0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00
]);
const jpegBytes = Buffer.from(baseJpeg, 'base64');
const orientedJpeg = Buffer.concat([jpegBytes.subarray(0, 2), Buffer.from([0xff, 0xe1, 0x00, 0x22]), exifPayload, jpegBytes.subarray(2)]);
await page.getByRole('button', { name: 'Dodaj zawodnika', exact: true }).click();
await page.locator('[data-form="competitor-editor"] [name="name"]').fill('ORIENTATION TEST');
await page.locator('[data-competitor-photo]').setInputFiles({ name: 'orientation-6.jpg', mimeType: 'image/jpeg', buffer: orientedJpeg });
await page.locator('[data-photo-status]').filter({ hasText: 'Gotowe: 40 x 80 px' }).waitFor();
await page.getByRole('button', { name: 'Anuluj' }).click();

const formContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const formPage = await formContext.newPage();
const formErrors = [];
formPage.on('pageerror', error => formErrors.push(error.message));
await formPage.goto(new URL('formularz/', baseUrl).href, { waitUntil: 'networkidle' });
assert.equal(await formPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
await formPage.getByLabel('Imię i nazwisko').fill('  piotr   żółć ');
await formPage.getByLabel('Data urodzenia').fill('1992-03-04');
await formPage.getByLabel('Miejscowość zamieszkania').fill(' nowy   sącz ');
await formPage.getByLabel('Reprezentowany kraj').selectOption('PL');
await formPage.getByLabel('Wzrost (cm)').fill('186');
await formPage.getByLabel('Waga (kg)').fill('124.5');
await formPage.getByLabel('Przysiad — rekord życiowy').fill('300');
await formPage.getByLabel('Martwy ciąg — rekord życiowy').fill('360');
await formPage.locator('[name="nationalLevel"]').selectOption('NATIONAL_CHAMPIONSHIP');
await formPage.locator('[name="nationalPlace"]').fill('1');
await formPage.locator('[name="nationalYear"]').fill('2025');
await formPage.locator('[name="titleCodes"][value="NATIONAL_CHAMPION"]').check();
await formPage.getByLabel('Puchar Polski').check();
await formPage.getByLabel('Inne kategorie, oddzielone przecinkami').fill('pokazy, legenda, POKAZY');
await formPage.locator('[data-photo-input]').setInputFiles({ name: 'duze-zdjecie.svg', mimeType: 'image/svg+xml', buffer: svg });
await formPage.locator('[data-photo-status]').filter({ hasText: 'Kadr gotowy' }).waitFor();
await formPage.getByText('Potwierdzenie danych i zdjęcia', { exact: true }).click();
await formPage.getByLabel(/Potwierdzam poprawność danych/).check();
await formPage.getByText('Oświadczenie zawodnika', { exact: true }).click();
await formPage.getByLabel(/Zapoznałem się z oświadczeniem/).check();
await formPage.getByText('Informacja o przetwarzaniu danych osobowych', { exact: true }).click();
await formPage.getByLabel(/Potwierdzam zapoznanie się z informacją/).check();
await formPage.getByRole('button', { name: 'Sprawdź i przygotuj plik' }).click();
await formPage.locator('[data-result-panel]').waitFor({ state: 'visible' });
assert.equal(await formPage.getByLabel('Imię i nazwisko').inputValue(), 'PIOTR ŻÓŁĆ');
assert.equal(await formPage.getByLabel('Miejscowość zamieszkania').inputValue(), 'NOWY SĄCZ');

const submissionDownloadPromise = formPage.waitForEvent('download');
await formPage.getByRole('button', { name: 'Pobierz plik zgłoszenia JSON' }).click();
const submissionDownload = await submissionDownloadPromise;
assert.equal(submissionDownload.suggestedFilename(), 'zawodnik_PIOTR_ZOLC.json');
const submissionPath = path.join(artifacts, 'zawodnik_PIOTR_ZOLC.json');
await submissionDownload.saveAs(submissionPath);
const submissionJson = JSON.parse(await fs.readFile(submissionPath, 'utf8'));
assert.equal(submissionJson.schemaVersion, 2);
assert.equal(submissionJson.type, 'competitor-submission');
assert.equal('id' in submissionJson.competitor, false);
assert.equal(submissionJson.competitor.name, 'PIOTR ŻÓŁĆ');
assert.equal(submissionJson.competitor.weight, '124.5');
assert.equal(submissionJson.competitor.countryCode, 'PL');
assert.equal(submissionJson.competitor.strengthRecords.deadliftKg, 360);
assert.deepEqual(submissionJson.competitor.career.titleCodes, ['NATIONAL_CHAMPION']);
assert.deepEqual(submissionJson.competitor.categories, ['Puchar Polski', 'POKAZY']);
assert.equal(submissionJson.competitor.photo.startsWith('data:image/jpeg;base64,'), true);
assert.ok(Buffer.from(submissionJson.competitor.photo.split(',')[1], 'base64').length <= 10 * 1024);
await formPage.screenshot({ path: path.join(artifacts, 'external-form-phone.png'), fullPage: true });
assert.deepEqual(formErrors, []);
await formContext.close();
await page.getByPlaceholder('Wpisz fragment imienia lub nazwiska').fill('');
await page.getByRole('button', { name: 'Wszyscy', exact: true }).click();

async function importCompetitorSubmission(payload) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import zawodników' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'zawodnik_PIOTR_ZOLC.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload))
  });
  await page.locator('.submission-modal').waitFor();
  const action = page.locator('.submission-modal .success-button');
  const actionLabel = await action.textContent();
  await action.click();
  return actionLabel.trim();
}

assert.equal(await importCompetitorSubmission(submissionJson), 'Dodaj nowego zawodnika');
const submittedRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1')).find(item => item.name === 'PIOTR ŻÓŁĆ'));
assert.ok(submittedRecord?.id);
assert.deepEqual(submittedRecord.categories, ['Puchar Polski', 'POKAZY']);
assert.equal(submittedRecord.countryCode, 'PL');
assert.equal(submittedRecord.strengthRecords.deadliftKg, 360);
assert.deepEqual(submittedRecord.career.titleCodes, ['NATIONAL_CHAMPION']);
assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('strongman-next.state.v1')).selectedCompetitorIds.includes(id), submittedRecord.id), false);
await page.locator(`[data-competitor-id="${submittedRecord.id}"] [data-action="open-competitor-profile"]`).last().click();
await page.locator('.profile-modal').getByText('Polska', { exact: true }).waitFor();
await page.locator('.profile-modal').getByText('Martwy ciąg', { exact: true }).waitFor();
await page.locator('.profile-modal').getByText('360 kg', { exact: true }).waitFor();
await page.locator('.profile-modal').getByText('Mistrz kraju', { exact: true }).waitFor();
await page.locator('.profile-modal').getByRole('button', { name: 'Zamknij', exact: true }).click();

const updatedSubmission = structuredClone(submissionJson);
updatedSubmission.competitor.notes = 'NOWE OSIĄGNIĘCIE';
updatedSubmission.competitor.categories = ['Inny'];
assert.equal(await importCompetitorSubmission(updatedSubmission), 'Aktualizuj istniejącego');
assert.equal(await importCompetitorSubmission(updatedSubmission), 'Aktualizuj istniejącego');
const updatedSubmissionInfo = await page.evaluate(id => {
  const database = JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1'));
  return { count: database.filter(item => item.name === 'PIOTR ŻÓŁĆ').length, record: database.find(item => item.id === id) };
}, submittedRecord.id);
assert.equal(updatedSubmissionInfo.count, 1);
assert.equal(updatedSubmissionInfo.record.id, submittedRecord.id);
assert.equal(updatedSubmissionInfo.record.notes, 'NOWE OSIĄGNIĘCIE');
assert.deepEqual(updatedSubmissionInfo.record.categories, ['Inny']);
assert.equal(updatedSubmissionInfo.record.countryCode, 'PL');
assert.equal(updatedSubmissionInfo.record.strengthRecords.deadliftKg, 360);
assert.deepEqual(updatedSubmissionInfo.record.career.titleCodes, ['NATIONAL_CHAMPION']);

const michalId = 'competitor-michal-sajdak-1786279130885-bf0b79';
const importedState = {
  schemaVersion: 2,
  appVersion: '0.2.7',
  competitors: [{
    id: michalId,
    name: 'MICHAŁ SAJDAK',
    category: 'PUCHAR POLSKI',
    categories: ['PUCHAR POLSKI'],
    birthDate: '1985-04-02',
    residence: 'TARNÓW',
    height: '185',
    weight: '123',
    notes: '',
    photo: '',
    dataWarnings: []
  }],
  selectedCompetitorIds: [michalId],
  selectedEventIds: [],
  startOrderIds: [michalId],
  stage: 'setup',
  eventHistory: [{ orderIds: [michalId], results: [{ id: michalId, result: '22.59', place: 3, points: '3.00' }] }],
  drafts: { event1: { [michalId]: '22.59' } },
  scores: { [michalId]: 3 }
};

async function importTournamentState() {
  const safety = page.locator('details[data-section="safety"]');
  if (!(await safety.getAttribute('open'))) await safety.locator('summary').click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importuj stan z pliku' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'michal-state.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(importedState)) });
  await page.waitForFunction(id => {
    const database = JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1') || '[]');
    return database.some(item => item.id === id);
  }, michalId);
}

await importTournamentState();
await importTournamentState();
const recoveredInfo = await page.evaluate(id => {
  const database = JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1'));
  const state = JSON.parse(localStorage.getItem('strongman-next.state.v1'));
  return {
    count: database.filter(item => item.id === id).length,
    competitor: database.find(item => item.id === id),
    result: state.eventHistory[0].results.find(item => item.id === id),
    draft: state.drafts.event1[id]
  };
}, michalId);
assert.equal(recoveredInfo.count, 1);
assert.equal(recoveredInfo.competitor.residence, 'TARNÓW');
assert.equal(recoveredInfo.result.points, '3.00');
assert.equal(recoveredInfo.draft, '22.59');

const michalDownloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: 'Eksport listy' }).click();
const michalDownload = await michalDownloadPromise;
const michalExportPath = path.join(artifacts, 'competitors-recovered-export.json');
await michalDownload.saveAs(michalExportPath);
const recoveredExport = JSON.parse(await fs.readFile(michalExportPath, 'utf8'));
assert.equal(recoveredExport.filter(item => item.id === michalId).length, 1);
assert.equal(recoveredExport.find(item => item.id === michalId).birthDate, '1985-04-02');

await page.reload({ waitUntil: 'networkidle' });
assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1')).filter(item => item.id === id).length, michalId), 1);

await page.screenshot({ path: path.join(artifacts, 'phone-setup.png'), fullPage: true });
await page.screenshot({ path: path.join(artifacts, 'phone-viewport.png') });
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
assert.deepEqual(pageErrors, []);
await context.close();

const tablet = await browser.newContext({ viewport: { width: 810, height: 1080 }, deviceScaleFactor: 1 });
const tabletPage = await tablet.newPage();
await tabletPage.goto(baseUrl, { waitUntil: 'networkidle' });
await tabletPage.getByRole('button', { name: 'Dodaj zawodnika', exact: true }).click();
assert.equal(await tabletPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
const modalBox = await tabletPage.locator('.competitor-editor-modal').boundingBox();
assert.ok(modalBox && modalBox.x >= 0 && modalBox.x + modalBox.width <= 810);
await tabletPage.screenshot({ path: path.join(artifacts, 'ipad-editor.png'), fullPage: true });
await tabletPage.screenshot({ path: path.join(artifacts, 'ipad-editor-viewport.png') });
await tablet.close();

const seasonMigration = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const seasonPage = await seasonMigration.newPage();
await seasonPage.goto(baseUrl, { waitUntil: 'networkidle' });
await seasonPage.locator('[data-action="go-stage"][data-stage="season"]').click();
await seasonPage.waitForFunction(() => Boolean(localStorage.getItem('strongman-next.state.v1')));
await seasonPage.evaluate(() => {
  const state = JSON.parse(localStorage.getItem('strongman-next.state.v1'));
  state.baseRevision = 'help-workflows-v1-2026-08-12';
  state.seasonEvents = state.seasonEvents.map(event => event.id === 'season-2026-11'
    ? { ...event, ranking: [{ position: 1, name: 'BŁĘDNY ZAPIS LOKALNY' }] }
    : event);
  state.seasonEvents.push({
    id: 'season-2026-12',
    number: 12,
    date: '2026-08-16',
    location: 'Impreza użytkownika',
    name: 'Impreza użytkownika · 16.08.2026',
    ranking: [{ position: 1, name: 'NOWY ZAWODNIK' }]
  });
  localStorage.setItem('strongman-next.state.v1', JSON.stringify(state));
});
await seasonPage.reload({ waitUntil: 'networkidle' });
const migratedSeason = await seasonPage.evaluate(() => JSON.parse(localStorage.getItem('strongman-next.state.v1')));
assert.equal(migratedSeason.seasonEvents.length, 12);
assert.equal(migratedSeason.seasonEvents.filter(event => event.id === 'season-2026-11').length, 1);
assert.equal(migratedSeason.seasonEvents.find(event => event.id === 'season-2026-11').ranking[0].name, 'Marcin Stankiewicz');
assert.equal(migratedSeason.seasonEvents.find(event => event.id === 'season-2026-12').location, 'Impreza użytkownika');
await seasonPage.locator('[data-action="go-stage"][data-stage="season"]').click();
await seasonPage.getByText('11. Skalbmierz · 09.08.2026', { exact: false }).waitFor();
assert.equal(await seasonPage.locator('.season-event-card').count(), 12);
await seasonMigration.close();

await browser.close();

console.log('UI tests passed');
