import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.TEST_URL || 'http://127.0.0.1:4174/';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ headless: true, executablePath: edgePath });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on('dialog', dialog => dialog.accept());

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('[data-stage="season"]').click();
  await page.getByRole('button', { name: 'Dodaj zawody' }).click();

  const form = page.locator('[data-form="season-event"]');
  await form.locator('[name="date"]').fill('2026-08-09');
  await form.locator('[name="location"]').fill('Testowo');
  const names = await page.evaluate(() => JSON.parse(localStorage.getItem('strongman-next.competitor-database.v1')).slice(0, 5).map(item => item.name));
  for (let index = 0; index < names.length; index++) {
    await form.locator(`[name="position-${index}"]`).fill(String(index + 1));
    await form.locator(`[name="competitor-${index}"]`).fill(names[index]);
  }
  await form.getByRole('button', { name: 'Zapisz zawody' }).click();
  await page.getByText('Testowo · 09.08.2026', { exact: false }).waitFor();
  assert.equal(await page.locator('.season-event-card').count(), 11);

  await page.locator('[data-stage="setup"]').click();
  const safety = page.locator('details[data-section="safety"]');
  if (!(await safety.getAttribute('open'))) await safety.locator('summary').click();
  await page.locator('[data-action="open-reset"]').click();
  await page.locator('[data-reset-input]').fill('RESET');
  await page.locator('[data-action="confirm-reset"]').click();

  await page.locator('[data-stage="season"]').click();
  await page.getByText('Testowo · 09.08.2026', { exact: false }).waitFor();
  assert.equal(await page.locator('.season-event-card').count(), 11);
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('strongman-next.season-database.v1')));
  assert.equal(persisted.events.length, 11);
  console.log('Season persistence tests passed');
} finally {
  await browser.close();
}
