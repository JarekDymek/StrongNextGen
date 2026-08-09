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
await page.getByRole('button', { name: 'Usuń zdjęcie' }).click();
await page.getByRole('button', { name: 'Zapisz zawodnika' }).click();
assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1')).find(item => item.id === id).photo, saved.competitor.id), '');

await page.getByRole('button', { name: 'Dodaj zawodnika', exact: true }).click();
await page.locator('[data-form="competitor-editor"] [name="name"]').fill('  jan   testowy  ');
await page.getByRole('button', { name: 'Zapisz zawodnika' }).click();
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
await browser.close();

console.log('UI tests passed');
