import assert from 'node:assert/strict';
import { DEFAULT_SEASON } from '../src/season-data.js';
import { buildSeasonHtml } from '../src/season-export.js';
import { calculateSeasonStandings, normalizeSeasonEvent, seasonPointsForPosition } from '../src/season.js';

assert.equal(DEFAULT_SEASON.events.length, 10);
assert.deepEqual([1, 2, 3, 4, 5].map(seasonPointsForPosition), [5, 4, 3, 2, 1]);
assert.equal(seasonPointsForPosition(6), 0);

const standings = calculateSeasonStandings(DEFAULT_SEASON.events, 4);
assert.equal(standings.length, 15);
assert.deepEqual(standings.slice(0, 3).map(row => [row.rank, row.name, row.countedPoints]), [
  [1, 'Paweł Piskorz', 19],
  [2, 'Łukasz Kieliszkowski', 18],
  [2, 'Rafał Sojc', 18],
]);
assert.equal(standings[0].starts, 6);
assert.equal(standings[0].allPoints, 23);
assert.equal(standings[0].rejectedPoints, 4);

const tieEvent = normalizeSeasonEvent({
  date: '15.08.2026',
  location: 'Testowo',
  ranking: [
    { position: 1, name: 'A' },
    { position: 2, name: 'B' },
    { position: 2, name: 'C' },
    { position: 4, name: 'D' },
    { position: 5, name: 'E' },
  ],
});
assert.equal(tieEvent.date, '2026-08-15');
assert.deepEqual(tieEvent.ranking.map(row => row.seasonPoints), [5, 4, 4, 2, 1]);

const publicHtml = buildSeasonHtml({
  season: 2026,
  seriesName: 'Puchar Polski <Strongman>',
  maxCountedStarts: 4,
  events: DEFAULT_SEASON.events,
  standings,
  exportedAt: '2026-08-05T12:00:00Z',
});
assert.match(publicHtml, /^<!doctype html>/);
assert.match(publicHtml, /Puchar Polski &lt;Strongman&gt;/);
assert.match(publicHtml, /Paweł Piskorz/);
assert.match(publicHtml, /is-rejected/);
assert.match(publicHtml, /Wyniki poszczególnych imprez/);
assert.doesNotMatch(publicHtml, /<script/i);

console.log('Season tests passed');
