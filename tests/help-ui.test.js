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

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const competitors = ['Adam Wądołowski', 'Bartłomiej Bąbol', 'Bartosz Postój', 'Jakub Szczechowski'];
  for (const name of competitors) {
    await page.locator('.selection-item', { hasText: name }).locator('[data-action="toggle-competitor"]').click();
    await page.waitForTimeout(380);
  }

  const eventIds = ['event-kule', 'event-martwy-ciag-powtorzenia', 'event-schody', 'event-spacer-farmera-140-kg-2-x-20-m', 'event-przeciaganie-auta'];
  for (const id of eventIds) {
    await page.locator(`[data-action="toggle-event"][data-id="${id}"]`).click();
    await page.waitForTimeout(380);
  }

  await page.locator('[data-action="go-draw"]').click();
  await page.getByRole('button', { name: 'Losuj kolejność' }).click();
  await page.getByRole('button', { name: 'Losuj ponownie' }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Start zawodów' }).click();

  let state = await readState(page);
  const [athleteA, athleteB, athleteC, athleteD] = state.startOrderIds;
  await enterResults(page, {
    [athleteA]: '50', [athleteB]: '45', [athleteC]: '40', [athleteD]: '35'
  });
  await page.locator('[data-action="finalize-event"]').click();
  await page.locator('[data-action="next-event"]').click();

  const interruptedOrder = await resultOrder(page);
  await page.locator(`[data-result="${interruptedOrder[0]}"]`).fill('8');
  const checkpointCountBefore = await checkpointCount(page);

  await openHelp(page);
  await page.screenshot({ path: path.join(artifacts, 'help-topics-phone.png') });
  await page.getByRole('button', { name: /Błędny wynik poprzedniej konkurencji/ }).click();
  assert.equal(await checkpointCount(page), checkpointCountBefore + 1);
  await page.getByRole('button', { name: 'Przejdź do poprawy wyniku' }).click();
  await page.getByText('Kule', { exact: true }).first().waitFor();

  await page.locator(`[data-result="${athleteA}"]`).fill('30');
  await page.locator('[data-action="finalize-event"]').click();
  await page.getByRole('button', { name: 'Wróć do przerwanej konkurencji' }).click();
  await page.getByRole('button', { name: 'Zakończ Pomoc' }).click();

  state = await readState(page);
  assert.equal(state.currentEventIndex, 1);
  assert.equal(await page.locator(`[data-result="${interruptedOrder[0]}"]`).inputValue(), '8');
  assert.deepEqual(await resultOrder(page), interruptedOrder);
  assert.deepEqual(state.eventOrderOverrides[state.selectedEventIds[1]], interruptedOrder);
  assert.equal(state.eventHistory.length, 1);
  assert.equal(state.eventHistory[0].results.find(row => row.id === athleteA).rawInput, '30');
  await page.reload({ waitUntil: 'networkidle' });
  state = await readState(page);
  assert.equal(state.stage, 'scoring');
  assert.equal(state.currentEventIndex, 1);
  assert.equal(await page.locator(`[data-result="${interruptedOrder[0]}"]`).inputValue(), '8');
  assert.deepEqual(await resultOrder(page), interruptedOrder);

  await enterResults(page, {
    [athleteA]: '12', [athleteB]: '10', [athleteC]: '8', [athleteD]: '6'
  });
  await page.locator('[data-action="finalize-event"]').click();
  await page.locator('[data-action="next-event"]').click();

  const planBefore = (await readState(page)).selectedEventIds;
  await openHelp(page);
  await page.getByRole('button', { name: /Błędny wynik poprzedniej konkurencji/ }).click();
  await page.getByRole('button', { name: 'Przejdź do poprawy wyniku' }).click();
  await page.getByRole('button', { name: 'Anuluj procedurę' }).click();
  state = await readState(page);
  assert.equal(state.currentEventIndex, 2);
  assert.equal(state.eventHistory.length, 2);

  await openHelp(page);
  await page.getByRole('button', { name: /Zmiana kolejności konkurencji/ }).click();
  await page.getByRole('button', { name: 'Otwórz bezpieczną zmianę planu' }).click();
  await page.locator('details[data-section="events"]').waitFor();
  assert.equal(await page.locator('.event-row.is-workflow-locked').count(), 3);
  assert.equal(await page.locator(`[data-action="toggle-event"][data-id="${planBefore[0]}"]`).isDisabled(), true);
  assert.equal(await page.locator(`[data-action="move-event"][data-id="${planBefore[1]}"][data-direction="1"]`).isDisabled(), true);

  await page.locator(`[data-action="move-event"][data-id="${planBefore[4]}"][data-direction="-1"]`).click();
  await page.getByRole('button', { name: 'Zatwierdź nowy plan i wróć' }).click();
  await page.getByRole('button', { name: 'Zakończ Pomoc' }).click();

  state = await readState(page);
  assert.deepEqual(state.selectedEventIds.slice(0, 3), planBefore.slice(0, 3));
  assert.deepEqual(state.selectedEventIds.slice(3), [planBefore[4], planBefore[3]]);
  assert.equal(state.currentEventIndex, 2);
  assert.equal(state.stage, 'scoring');
  assert.equal(state.eventHistory.length, 2);
  await assertNoOverflow(page);
  await page.screenshot({ path: path.join(artifacts, 'help-workflow-phone.png'), fullPage: true });

  await page.setViewportSize({ width: 820, height: 1180 });
  await openHelp(page);
  await page.getByPlaceholder('Np. zły wynik, pogoda, inne urządzenie').fill('pogoda');
  assert.equal(await page.locator('.help-topic').count(), 1);
  await assertNoOverflow(page);
  await page.screenshot({ path: path.join(artifacts, 'help-topics-ipad.png') });

  assert.deepEqual(pageErrors, []);
  console.log('Help UI tests passed');
} finally {
  await browser.close();
}

async function openHelp(targetPage) {
  await targetPage.getByRole('button', { name: 'Menu aplikacji' }).click();
  await targetPage.getByRole('button', { name: 'Pomoc awaryjna' }).click();
  await targetPage.getByRole('heading', { name: 'Pomoc podczas zawodów' }).waitFor();
}

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

async function checkpointCount(targetPage) {
  return targetPage.evaluate(() => JSON.parse(localStorage.getItem('strongman-next.checkpoints.v1') || '[]').length);
}

async function assertNoOverflow(targetPage) {
  assert.equal(await targetPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
}
