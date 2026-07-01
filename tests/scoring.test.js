import assert from 'node:assert/strict';
import { DEFAULT_COMPETITORS } from '../src/competitors.js';
import { buildFinalStartOrder, calculateEventPoints, parseResult, rankStandings } from '../src/scoring.js';

assert.equal(DEFAULT_COMPETITORS.length, 15);
assert.ok(DEFAULT_COMPETITORS.every(competitor => competitor.photo));

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
