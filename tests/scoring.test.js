import assert from 'node:assert/strict';
import { DEFAULT_COMPETITORS } from '../src/competitors.js';
import { buildFinalStartOrder, buildNextStartOrder, calculateEventPoints, parseResult, rankStandings } from '../src/scoring.js';

assert.equal(DEFAULT_COMPETITORS.length, 20);
assert.equal(DEFAULT_COMPETITORS.filter(competitor => competitor.categories?.includes('Puchar Polski')).length, 16);
assert.ok(DEFAULT_COMPETITORS.filter(competitor => competitor.photo).length >= 19);
assert.ok(DEFAULT_COMPETITORS.some(competitor => competitor.name === 'Przemysław Marczewski'));

assert.equal(parseResult('1:10.50', 'low').val, 70.5);
assert.equal(parseResult('018.5', 'low').isDist, true);
assert.equal(parseResult('0', 'high').dnf, true);
assert.equal(parseResult('abc', 'high').error, true);

const lowEvent = calculateEventPoints([
  { id: 'a', name: 'Adam', result: '55' },
  { id: 'b', name: 'Bartek', result: '51' },
  { id: 'c', name: 'Celina', result: '0' }
], 3, 'low');

assert.equal(lowEvent.error, false);
assert.equal(lowEvent.results[0].name, 'Bartek');
assert.equal(lowEvent.results[0].points, '3.00');
assert.equal(lowEvent.results[2].points, '0.00');

const tiedHigh = calculateEventPoints([
  { id: 'a', name: 'Adam', result: '10' },
  { id: 'b', name: 'Bartek', result: '10' },
  { id: 'c', name: 'Celina', result: '8' }
], 3, 'high');

assert.equal(tiedHigh.results[0].points, '2.50');
assert.equal(tiedHigh.results[1].points, '2.50');
assert.equal(tiedHigh.results[2].points, '1.00');

const nextOrderAfterTie = buildNextStartOrder(
  ['a', 'b', 'c', 'd'],
  {
    orderIds: ['d', 'b', 'a', 'c'],
    results: [
      { id: 'a', points: '3.50' },
      { id: 'b', points: '3.50' },
      { id: 'c', points: '2.00' },
      { id: 'd', points: '1.00' }
    ]
  },
  ['a', 'b', 'c', 'd']
);

assert.deepEqual(nextOrderAfterTie, ['d', 'c', 'b', 'a']);

const nextOrderAfterThreeWayDnf = buildNextStartOrder(
  ['a', 'b', 'c', 'd'],
  {
    orderIds: ['c', 'a', 'd', 'b'],
    results: [
      { id: 'a', points: '0.00' },
      { id: 'b', points: '4.00' },
      { id: 'c', points: '0.00' },
      { id: 'd', points: '0.00' }
    ]
  }
);

assert.deepEqual(nextOrderAfterThreeWayDnf, ['c', 'a', 'd', 'b']);

const nextOrderIgnoresResultArrayOrder = buildNextStartOrder(
  ['anna', 'bartek', 'celina', 'darek'],
  JSON.parse(JSON.stringify({
    orderIds: ['darek', 'celina', 'anna', 'bartek'],
    results: [
      { id: 'bartek', points: '2.00' },
      { id: 'anna', points: '2.00' },
      { id: 'darek', points: '2.00' },
      { id: 'celina', points: '2.00' }
    ]
  })),
  ['anna', 'bartek', 'celina', 'darek']
);

assert.deepEqual(nextOrderIgnoresResultArrayOrder, ['darek', 'celina', 'anna', 'bartek']);

const nextOrderFromLegacyState = buildNextStartOrder(
  ['a', 'b', 'c'],
  {
    results: [
      { id: 'a', points: '2.50' },
      { id: 'b', points: '2.50' },
      { id: 'c', points: '1.00' }
    ]
  },
  ['b', 'a', 'c']
);

assert.deepEqual(nextOrderFromLegacyState, ['c', 'b', 'a']);

const standings = rankStandings(
  [{ id: 'a', name: 'Adam' }, { id: 'b', name: 'Bartek' }],
  { a: 10, b: 10 },
  [{ nr: 1, name: 'Kule', results: [
    { id: 'a', place: 2, points: '1.00' },
    { id: 'b', place: 1, points: '2.00' }
  ] }]
);

assert.equal(standings[0].id, 'b');
assert.equal(standings[0].tieStatus, 'Wygrywa remis');
assert.match(standings[0].tieReason, /więcej 1\. miejsc/);

const standingsBySecondPlaces = rankStandings(
  [{ id: 'a', name: 'Adam' }, { id: 'b', name: 'Bartek' }, { id: 'c', name: 'Celina' }],
  { a: 10, b: 10, c: 1 },
  [
    { nr: 1, name: 'Belka', type: 'high', results: [
      { id: 'c', place: 1, points: '3.00', result: '12' },
      { id: 'a', place: 2, points: '2.00', result: '10' },
      { id: 'b', place: 3, points: '1.00', result: '8' }
    ] },
    { nr: 2, name: 'Kule', type: 'high', results: [
      { id: 'c', place: 1, points: '3.00', result: '12' },
      { id: 'a', place: 2, points: '2.00', result: '10' },
      { id: 'b', place: 3, points: '1.00', result: '8' }
    ] }
  ]
);

assert.equal(standingsBySecondPlaces[0].id, 'a');
assert.match(standingsBySecondPlaces[0].tieReason, /więcej 2\. miejsc/);

const standingsByLastEvent = rankStandings(
  [{ id: 'a', name: 'Adam' }, { id: 'b', name: 'Bartek' }],
  { a: 10, b: 10 },
  [
    { nr: 1, name: 'Belka', type: 'high', results: [
      { id: 'a', place: 1, points: '2.00', result: '11' },
      { id: 'b', place: 2, points: '1.00', result: '8' }
    ] },
    { nr: 2, name: 'Kule', type: 'high', results: [
      { id: 'b', place: 1, points: '2.00', result: '10' },
      { id: 'a', place: 2, points: '1.00', result: '9' }
    ] }
  ]
);

assert.equal(standingsByLastEvent[0].id, 'b');
assert.match(standingsByLastEvent[0].tieReason, /ostatniej wspólnej konkurencji/);

const finalOrder = buildFinalStartOrder(
  [
    { id: 'a', name: 'Adam' },
    { id: 'b', name: 'Bartek' },
    { id: 'c', name: 'Celina' },
    { id: 'd', name: 'Darek' }
  ],
  { a: 10, b: 20, c: 30, d: 40 },
  [],
  3
);

assert.deepEqual(finalOrder.map(row => row.id), ['b', 'c', 'd']);
console.log('Scoring tests passed');
