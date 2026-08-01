import assert from 'node:assert/strict';
import { advanceToNextNonFinalEvent, buildNextStartOrder, rewindLastEvent } from '../src/competition-rules.js';
import { mergeCompetitorRecords, normalizeImportedCompetitor } from '../src/competitor-data.js';
import { normalizeStateIdentifiers } from '../src/state-migration.js';

const previousEvent = {
  orderIds: ['c', 'a', 'b', 'd'],
  results: [
    { id: 'a', points: '2.50' },
    { id: 'b', points: '2.50' },
    { id: 'c', points: '1.00' },
    { id: 'd', points: '4.00' }
  ]
};
assert.deepEqual(buildNextStartOrder(['a', 'b', 'c', 'd'], previousEvent, ['a', 'b', 'c', 'd']), ['c', 'a', 'b', 'd']);

const reversedTie = {
  orderIds: ['b', 'a'],
  results: [{ id: 'a', points: '1.50' }, { id: 'b', points: '1.50' }]
};
assert.deepEqual(buildNextStartOrder(['a', 'b'], reversedTie, ['a', 'b']), ['b', 'a']);

const state = {
  selectedCompetitorIds: ['a', 'b', 'c', 'd'],
  selectedEventIds: ['e1', 'e2', 'e3', 'e4'],
  startOrderIds: ['a', 'b', 'c', 'd'],
  currentEventIndex: 1,
  stage: 'scoring',
  eventHistory: [
    { orderIds: ['a', 'b', 'c', 'd'], results: [] },
    { ...previousEvent, orderIds: ['d', 'a', 'b', 'c'] }
  ]
};
const advanced = advanceToNextNonFinalEvent(state);
assert.equal(advanced.currentEventIndex, 2);
assert.deepEqual(advanced.startOrderIds, ['c', 'a', 'b', 'd']);
assert.deepEqual(advanced.initialStartOrderIds, ['a', 'b', 'c', 'd']);
assert.equal(buildNextStartOrder(state.selectedCompetitorIds, previousEvent, advanced.startOrderIds)[1], 'a');

const beforeFinal = { ...state, currentEventIndex: 2, eventHistory: [...state.eventHistory, previousEvent] };
assert.equal(advanceToNextNonFinalEvent(beforeFinal), null);

const rewound = rewindLastEvent({ ...advanced, eventHistory: [...state.eventHistory, previousEvent] });
assert.equal(rewound.currentEventIndex, 2);
assert.deepEqual(rewound.startOrderIds, previousEvent.orderIds);

const normalized = normalizeImportedCompetitor({
  fullName: 'Anna Testowa',
  dateOfBirth: '1990-01-02',
  city: 'Malbork',
  heightCm: 180,
  weightKg: 90,
  achievements: 'Mistrzyni',
  icon: 'data:image/png;base64,abc',
  division: 'Strong Women'
});
assert.equal(normalized.name, 'Anna Testowa');
assert.equal(normalized.notes, 'Mistrzyni');
assert.equal(normalized.photo, 'data:image/png;base64,abc');
assert.deepEqual(normalized.categories, ['Strong Women']);

const merge = mergeCompetitorRecords([
  { id: 'fixed', name: 'Anna Testowa', residence: 'Gdańsk', photo: 'old-photo', notes: 'Stary opis' }
], [
  { name: 'ANNA TESTOWA', residence: 'Malbork', photo: '', achievements: 'Nowy opis' },
  { id: 2, name: 'Beata Nowa', city: 'Tczew' }
]);
assert.equal(merge.added, 1);
assert.equal(merge.updated, 1);
assert.equal(merge.competitors.find(item => item.id === 'fixed').residence, 'Malbork');
assert.equal(merge.competitors.find(item => item.id === 'fixed').photo, 'old-photo');
assert.equal(merge.competitors.find(item => item.id === 'fixed').notes, 'Nowy opis');

const migrated = normalizeStateIdentifiers({
  competitors: [{ id: 1, name: 'Adam' }],
  events: [{ id: 7, name: 'Kule' }],
  selectedCompetitorIds: [1],
  selectedEventIds: [7],
  startOrderIds: [1],
  eventHistory: [{ eventId: 7, orderIds: [1], results: [{ id: 1, points: '1.00' }] }]
});
assert.equal(migrated.competitors[0].id, '1');
assert.equal(migrated.events[0].id, '7');
assert.deepEqual(migrated.selectedCompetitorIds, ['1']);
assert.equal(migrated.eventHistory[0].results[0].id, '1');

console.log('Runtime tests passed');
