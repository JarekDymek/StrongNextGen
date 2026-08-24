import assert from 'node:assert/strict';
import {
  consumeStorageWarnings,
  createStorageSnapshot,
  hasStorageWarning,
  loadCompetitorDatabase,
  loadSeasonDatabase,
  loadSavedState,
  saveCheckpoint,
  saveCompetitorDatabase,
  saveSeasonDatabase,
  saveState
} from '../src/storage.js';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};

const photo = `data:image/jpeg;base64,${'A'.repeat(12000)}`;
const state = {
  schemaVersion: 3,
  logoData: 'data:image/png;base64,LOGO',
  competitors: [{ id: 'a', name: 'A', photo }],
  seasonEvents: [{ id: 'season-1', ranking: [] }],
  ui: { resetOpen: true }
};

saveCompetitorDatabase(state.competitors);
saveSeasonDatabase({ baseRevision: 'test-v1', events: state.seasonEvents, maxCountedStarts: 4 });
saveState(state);
saveCheckpoint(state, 'Test');

assert.equal(loadCompetitorDatabase()[0].photo, photo, 'Trwała baza zachowuje pełne zdjęcie');
assert.equal(loadSeasonDatabase().events[0].id, 'season-1', 'Baza sezonu jest niezależna od stanu zawodów');
const savedState = loadSavedState();
assert.equal(savedState.competitors[0].photo, '', 'Stan roboczy nie powiela zdjęć z trwałej bazy');
assert.equal(savedState.logoData, state.logoData, 'Bieżący stan zachowuje niestandardowe logo');
assert.equal('ui' in savedState, false);

const checkpoints = JSON.parse(values.get('strongman-next.checkpoints.v1'));
assert.equal(checkpoints[0].snapshot.competitors[0].photo, '');
assert.equal('logoData' in checkpoints[0].snapshot, false, 'Punkt kontrolny nie powiela dużego logo');

const compact = createStorageSnapshot(state, { includeLogo: false });
assert.ok(JSON.stringify(compact).length < JSON.stringify(state).length / 2);

values.set('strongman-next.state.v1', '{uszkodzony');
const originalConsoleError = console.error;
console.error = () => {};
assert.equal(loadSavedState(), null);
console.error = originalConsoleError;
assert.equal(consumeStorageWarnings().length, 1);

values.set('strongman-next.competitor-database.v1', '{uszkodzona');
console.error = () => {};
assert.equal(loadCompetitorDatabase(), null);
console.error = originalConsoleError;
assert.equal(hasStorageWarning('bazy zawodników'), true);
assert.equal(consumeStorageWarnings().length, 1);

console.log('Storage tests passed');
