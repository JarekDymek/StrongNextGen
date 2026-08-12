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
const unexpectedConsoleErrors = [];
let expectImportError = false;
page.on('pageerror', error => pageErrors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !expectImportError) unexpectedConsoleErrors.push(message.text());
});
page.on('dialog', dialog => dialog.accept());

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await assertNoOverflow(page);
  assert.equal(await page.locator('[data-action="go-draw"]').isDisabled(), true);

  const competitorNames = ['Adam Wądołowski', 'Bartłomiej Bąbol', 'Bartosz Postój', 'Jakub Szczechowski'];
  const firstCompetitor = page.locator('.selection-item', { hasText: competitorNames[0] }).locator('[data-action="toggle-competitor"]');
  await firstCompetitor.dblclick();
  await page.waitForTimeout(400);
  let state = await readState(page);
  assert.equal(state.selectedCompetitorIds.length, 1, 'Podwójne dotknięcie nie może natychmiast cofnąć wyboru');
  assert.equal(await page.locator('[data-action="go-draw"]').isDisabled(), true);

  for (const name of competitorNames.slice(1)) {
    await page.locator('.selection-item', { hasText: name }).locator('[data-action="toggle-competitor"]').click();
    await page.waitForTimeout(380);
  }

  for (const id of ['event-kule', 'event-martwy-ciag-powtorzenia', 'event-schody']) {
    await page.locator(`[data-action="toggle-event"][data-id="${id}"]`).click();
    await page.waitForTimeout(380);
  }
  state = await readState(page);
  assert.equal(state.selectedCompetitorIds.length, 4);
  assert.equal(state.selectedEventIds.length, 3);

  await page.locator('[data-action="go-draw"]').click();
  await page.getByRole('button', { name: 'Losuj kolejność' }).click();
  await page.getByRole('button', { name: 'Losuj ponownie' }).waitFor({ timeout: 10000 });
  state = await readState(page);
  assert.equal(state.drawUsed, true);
  assert.equal(new Set(state.startOrderIds).size, 4);
  const [athleteA, athleteB, athleteC, athleteD] = state.startOrderIds;
  const database = await readDatabase(page);
  const names = new Map(database.map(competitor => [competitor.id, competitor.name]));

  await page.getByRole('button', { name: 'Start zawodów' }).click();
  await page.locator('[data-result]').first().waitFor();
  await enterResults(page, {
    [athleteA]: '50',
    [athleteB]: '50',
    [athleteC]: '60',
    [athleteD]: '0'
  });
  await page.locator('[data-action="finalize-event"]').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('strongman-next.state.v1')).eventHistory.length === 1);
  state = await readState(page);
  assert.deepEqual(state.eventHistory[0].orderIds, [athleteA, athleteB, athleteC, athleteD]);
  assert.equal(state.eventHistory[0].results.find(row => row.id === athleteA).points, '3.50');
  assert.equal(state.eventHistory[0].results.find(row => row.id === athleteB).points, '3.50');

  await page.locator('[data-action="next-event"]').click();
  await page.locator(`[data-result="${athleteD}"]`).waitFor();
  assert.deepEqual(await resultOrder(page), [athleteD, athleteC, athleteA, athleteB]);

  await page.locator(`[data-result="${athleteA}"]`).fill('12');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator(`[data-result="${athleteA}"]`).inputValue(), '12', 'Szkic wyniku musi przetrwać odświeżenie');

  await enterResults(page, {
    [athleteA]: '12abc',
    [athleteB]: '10',
    [athleteC]: '8',
    [athleteD]: '6'
  });
  await page.locator('[data-action="finalize-event"]').click();
  await page.getByText('Niektóre wyniki mają błędny format').waitFor();
  assert.equal((await readState(page)).eventHistory.length, 1);
  await page.locator(`[data-result="${athleteA}"]`).fill('12');
  await page.locator('[data-action="finalize-event"]').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('strongman-next.state.v1')).eventHistory.length === 2);

  await page.locator('[data-action="undo-event"]').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('strongman-next.state.v1')).eventHistory.length === 1);
  await page.locator(`[data-result="${athleteD}"]`).fill('7');
  await page.locator('[data-action="finalize-event"]').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('strongman-next.state.v1')).eventHistory.length === 2);

  await page.locator('[data-action="next-event"]').click();
  await page.getByText('Konkurencja finałowa', { exact: true }).first().waitFor();
  assert.deepEqual(await resultOrder(page), [athleteD, athleteC, athleteB, athleteA]);
  await enterResults(page, {
    [athleteA]: '45',
    [athleteB]: '40',
    [athleteC]: '50',
    [athleteD]: '55'
  });
  await page.locator('[data-action="finalize-event"]').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('strongman-next.state.v1')).eventHistory.length === 3);
  await page.locator('[data-action="next-event"]').click();
  await page.locator('.standings').waitFor();

  state = await readState(page);
  assert.equal(state.scores[athleteA], state.scores[athleteB]);
  const firstStanding = page.locator('.standing-card').first();
  assert.match(await firstStanding.textContent(), new RegExp(names.get(athleteB), 'i'));
  assert.match(await firstStanding.textContent(), /ostatniej wspólnej konkurencji/i);
  await assertNoOverflow(page);
  await page.screenshot({ path: path.join(artifacts, 'final-audit-phone-summary.png'), fullPage: true });

  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-action="export-state"]').click();
  const download = await downloadPromise;
  const statePath = path.join(artifacts, 'final-audit-state.json');
  await download.saveAs(statePath);
  const exported = JSON.parse(await fs.readFile(statePath, 'utf8'));
  assert.equal(exported.eventHistory.length, 3);
  assert.equal(exported.competitors.find(item => item.id === athleteA).photo.startsWith('data:image/'), true);

  await page.locator('[data-stage="setup"]').click();
  const safety = page.locator('details[data-section="safety"]');
  if (!(await safety.getAttribute('open'))) await safety.locator('summary').click();
  await page.locator('[data-action="open-reset"]').click();
  await page.locator('[data-reset-input]').fill('RESET');
  await page.locator('[data-action="confirm-reset"]').click();
  state = await readState(page);
  assert.equal(state.selectedCompetitorIds.length, 0);
  assert.equal((await readDatabase(page)).length >= 20, true, 'Reset nie może usunąć trwałej bazy');

  const restoredSafety = page.locator('details[data-section="safety"]');
  if (!(await restoredSafety.getAttribute('open'))) await restoredSafety.locator('summary').click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('[data-action="import-state"]').click();
  await (await chooserPromise).setFiles(statePath);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('strongman-next.state.v1')).eventHistory.length === 3);
  state = await readState(page);
  assert.deepEqual(state.selectedCompetitorIds, exported.selectedCompetitorIds);
  assert.deepEqual(state.eventHistory.map(event => event.results), exported.eventHistory.map(event => event.results));

  await page.setViewportSize({ width: 844, height: 390 });
  await assertNoOverflow(page);
  await page.screenshot({ path: path.join(artifacts, 'final-audit-phone-landscape.png') });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.locator('[data-stage="setup"]').click();
  expectImportError = true;
  const brokenChooserPromise = page.waitForEvent('filechooser');
  await page.locator('[data-action="import-competitors"]').click();
  await (await brokenChooserPromise).setFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{not-json') });
  await page.locator('.toast').filter({ hasText: 'Nie udało się odczytać bazy zawodników' }).waitFor();
  expectImportError = false;

  const safetyAfterImport = page.locator('details[data-section="safety"]');
  if (!(await safetyAfterImport.getAttribute('open'))) await safetyAfterImport.locator('summary').click();

  const invalidState = {
    schemaVersion: 3,
    eventName: { invalid: true },
    competitors: [null, { name: '' }],
    events: [null],
    selectedCompetitorIds: 'invalid',
    selectedEventIds: 'invalid',
    startOrderIds: [null, ''],
    eventHistory: [{ eventId: 'broken', results: 'invalid' }],
    drafts: { broken: 'invalid' },
    stage: 'scoring',
    currentEventIndex: 'invalid',
    logoData: 'javascript:alert(1)'
  };
  const invalidChooserPromise = page.waitForEvent('filechooser');
  await page.locator('[data-action="import-state"]').click();
  await (await invalidChooserPromise).setFiles({ name: 'invalid-state.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalidState)) });
  await page.waitForTimeout(250);
  assert.equal(await page.locator('h1').textContent(), 'Nowe zawody Strong Man');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(unexpectedConsoleErrors, []);
} finally {
  await context.close();
  await browser.close();
}

console.log('Regression tests passed');

async function enterResults(targetPage, values) {
  for (const [id, value] of Object.entries(values)) {
    await targetPage.locator(`[data-result="${id}"]`).fill(value);
  }
  const lastId = Object.keys(values).at(-1);
  await targetPage.locator(`[data-result="${lastId}"]`).locator('xpath=following-sibling::button').click();
  await targetPage.locator('[data-action="finalize-event"]').waitFor();
}

async function resultOrder(targetPage) {
  return targetPage.locator('[data-result]').evaluateAll(inputs => inputs.map(input => input.dataset.result));
}

async function readState(targetPage) {
  return targetPage.evaluate(() => JSON.parse(localStorage.getItem('strongman-next.state.v1')));
}

async function readDatabase(targetPage) {
  return targetPage.evaluate(() => JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1')));
}

async function assertNoOverflow(targetPage) {
  assert.equal(await targetPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
}
