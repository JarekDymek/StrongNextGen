import assert from 'node:assert/strict';
import {
  competitorMatchesCategory,
  getCompetitorCategories,
  mergeCompetitorCollections,
  normalizeCompetitorKey,
  normalizeCompetitorRecord,
  mergeCompetitorDetails,
  remapCompetitionStateCompetitorIds,
  upsertCompetitorRecord
} from '../src/competitor-data.js';
import { clearSavedState, loadCompetitorDatabase, saveCompetitorDatabase, saveState } from '../src/storage.js';

const michal = normalizeCompetitorRecord({
  id: 'competitor-michal-sajdak-1786279130885-bf0b79',
  name: 'MICHAŁ SAJDAK',
  category: 'PUCHAR POLSKI',
  categories: '["PUCHAR POLSKI"]',
  birthDate: '1985-04-02',
  residence: 'TARNÓW',
  height: '185',
  weight: '123',
  notes: '',
  photo: '',
  dataWarnings: []
});

assert.equal(michal.id, 'competitor-michal-sajdak-1786279130885-bf0b79');
assert.deepEqual(michal.categories, ['Puchar Polski']);
assert.deepEqual(normalizeCompetitorRecord({ id: 'legacy', name: 'Legacy', dataWarnings: '[]' }).dataWarnings, []);
assert.equal(normalizeCompetitorKey('  MICHAŁ   SAJDAK '), normalizeCompetitorKey('michał sajdak'));
assert.equal(normalizeCompetitorRecord({ id: 'huge-photo', name: 'Duże Zdjęcie', photo: `data:image/jpeg;base64,${'A'.repeat(700000)}` }).photo, '');
assert.equal(normalizeCompetitorRecord({ id: 'svg-photo', name: 'Aktywny Obraz', photo: 'data:image/svg+xml;base64,PHN2Zy8+' }).photo, '');

const added = upsertCompetitorRecord([], michal, { mode: 'preferIncoming' });
assert.equal(added.added, true);
assert.equal(added.competitor.id, michal.id);

const duplicate = upsertCompetitorRecord(added.records, {
  id: 'temporary-other-id',
  name: '  Michał   Sajdak  ',
  notes: 'Debiutant'
}, { mode: 'preferIncoming' });
assert.equal(duplicate.records.length, 1);
assert.equal(duplicate.competitor.id, michal.id);
assert.equal(duplicate.aliases.get('temporary-other-id'), michal.id);

const fullDatabaseRecord = { ...michal, photo: 'data:image/jpeg;base64,AAAA', notes: 'Pełny opis' };
const recovered = mergeCompetitorCollections([fullDatabaseRecord], [{
  id: michal.id,
  name: michal.name,
  category: 'puchar polski',
  photo: '',
  notes: ''
}], { mode: 'fillMissing' });
assert.equal(recovered.records[0].photo, fullDatabaseRecord.photo);
assert.equal(recovered.records[0].notes, 'Pełny opis');

const missingRecovered = mergeCompetitorCollections([], [michal], { mode: 'fillMissing' });
assert.equal(missingRecovered.records[0].id, michal.id);
assert.equal(missingRecovered.records[0].residence, 'TARNÓW');

const staleStateCategories = mergeCompetitorCollections([{
  ...michal,
  category: 'Puchar Polski',
  categories: ['Puchar Polski']
}], [{
  ...michal,
  category: 'Puchar Polski',
  categories: ['Puchar Polski', 'Legenda']
}], { mode: 'fillMissing', categoriesMode: 'fillMissing' });
assert.deepEqual(staleStateCategories.records[0].categories, ['Puchar Polski']);

const remapped = remapCompetitionStateCompetitorIds({
  selectedCompetitorIds: ['temporary-other-id'],
  startOrderIds: ['temporary-other-id'],
  eventHistory: [{
    orderIds: ['temporary-other-id'],
    results: [{ id: 'temporary-other-id', result: '22.59', place: 3, points: '3.00' }]
  }],
  drafts: { event1: { 'temporary-other-id': '22.59' } },
  scores: { 'temporary-other-id': 3 }
}, duplicate.aliases);
assert.deepEqual(remapped.selectedCompetitorIds, [michal.id]);
assert.deepEqual(remapped.eventHistory[0].orderIds, [michal.id]);
assert.equal(remapped.eventHistory[0].results[0].points, '3.00');
assert.equal(remapped.drafts.event1[michal.id], '22.59');

const multiCategory = normalizeCompetitorRecord({
  id: 'multi',
  name: 'Jan Testowy',
  category: ' puchar polski ',
  categories: ['LEGENDA', 'Puchar   Polski', 'Tyberian Team']
});
assert.deepEqual(getCompetitorCategories(multiCategory), ['Puchar Polski', 'Legenda', 'Tyberian Team']);
assert.equal(competitorMatchesCategory(multiCategory, 'pUcHaR PoLsKi'), true);
assert.equal(competitorMatchesCategory(multiCategory, 'Legenda'), true);
assert.equal(competitorMatchesCategory(multiCategory, 'Tyberian Team'), true);
assert.equal(competitorMatchesCategory(multiCategory, 'uncategorized'), false);
assert.equal(competitorMatchesCategory({ name: 'Bez Kategorii' }, 'uncategorized'), true);

const migratedCategories = normalizeCompetitorRecord({
  id: 'migration',
  name: 'Migracja Kategorii',
  category: '  AKTYWNY   ZAWODNIK ',
  categories: ['Aktywny zawodnik', 'Aktywny Zawodnik', 'Inny', 'Bez kategorii']
});
assert.equal(migratedCategories.category, 'Inny');
assert.deepEqual(migratedCategories.categories, ['Inny']);

const categoriesReplaced = mergeCompetitorDetails({
  id: 'replace',
  name: 'Edycja Testowa',
  category: 'Puchar Polski',
  categories: ['Puchar Polski', 'Legenda', 'POKAZY']
}, {
  id: 'replace',
  name: 'Edycja Testowa',
  category: 'Puchar Polski',
  categories: ['Puchar Polski']
}, { mode: 'preferIncoming', categoriesMode: 'replace' });
assert.deepEqual(categoriesReplaced.categories, ['Puchar Polski']);
assert.equal(categoriesReplaced.category, 'Puchar Polski');

const categoriesCleared = mergeCompetitorDetails(categoriesReplaced, {
  id: 'replace',
  name: 'Edycja Testowa',
  category: '',
  categories: []
}, { mode: 'preferIncoming', categoriesMode: 'replace' });
assert.deepEqual(categoriesCleared.categories, []);
assert.equal(categoriesCleared.category, '');

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};
saveCompetitorDatabase([michal]);
saveState({ schemaVersion: 3, competitors: [michal] });
clearSavedState();
assert.equal(loadCompetitorDatabase()[0].id, michal.id, 'Reset stanu zawodów nie może usuwać trwałej bazy');

console.log('Competitor data tests passed');
