import assert from 'node:assert/strict';
import { DEFAULT_SEASON } from '../src/season-data.js';
import { buildSeasonHtml } from '../src/season-export.js';
import { calculateSeasonStandings, mergeCanonicalSeasonEvents, mergeSeasonEvents, normalizeSeasonEvent, seasonPointsForPosition } from '../src/season.js';

assert.equal(DEFAULT_SEASON.updatedThrough, '2026-08-09');
assert.equal(DEFAULT_SEASON.events.length, 11);
assert.equal(DEFAULT_SEASON.season, 2026);
assert.equal(DEFAULT_SEASON.maxCountedStarts, 4);
assert.equal(new Set(DEFAULT_SEASON.events.map(event => event.id)).size, 11);
assert.equal(new Set(DEFAULT_SEASON.events.map(event => event.number)).size, 11);
assert.equal(DEFAULT_SEASON.events.every(event => /^\d{4}-\d{2}-\d{2}$/.test(event.date)), true);
assert.deepEqual(DEFAULT_SEASON.events.map(event => event.date), [...DEFAULT_SEASON.events.map(event => event.date)].sort());
const busko = DEFAULT_SEASON.events.find(event => event.id === 'season-2026-07');
const buskoMarcin = busko.ranking.find(row => row.competitorId === 'competitor-marcin-stankiewicz');
assert.deepEqual([buskoMarcin.position, buskoMarcin.seasonPoints], [3, 3]);
const kleczew = DEFAULT_SEASON.events.find(event => event.id === 'season-2026-08');
assert.deepEqual([kleczew.date, kleczew.name], ['2026-07-25', 'Kleczew · 25.07.2026']);
const skalbmierzEvents = DEFAULT_SEASON.events.filter(event => event.date === '2026-08-09' && event.location === 'Skalbmierz');
assert.equal(skalbmierzEvents.length, 1);
const skalbmierz = skalbmierzEvents[0];
assert.equal(skalbmierz.id, 'season-2026-11');
assert.deepEqual(skalbmierz.ranking.map(row => [row.position, row.name, row.competitionPoints]), [
  [1, 'Marcin Stankiewicz', 25],
  [2, 'Tomasz Lademann', 23.5],
  [3, 'Bartosz Postój', 19.5],
  [4, 'Michał Sajdak', 15],
  [5, 'Michał Maruszewski', 7],
]);
assert.equal(skalbmierz.competitions.length, 6);
assert.equal(skalbmierz.competitions.flatMap(event => event.results).length, 30);
assert.equal(skalbmierz.competitions[1].results[0].result, '41.');
assert.equal(skalbmierz.competitions[4].results[4].result, '212.54');
assert.deepEqual([1, 2, 3, 4, 5].map(seasonPointsForPosition), [5, 4, 3, 2, 1]);
assert.equal(seasonPointsForPosition(6), 0);

const standings = calculateSeasonStandings(DEFAULT_SEASON.events, 4);
assert.equal(standings.length, 16);
assert.deepEqual(standings.slice(0, 5).map(row => [row.rank, row.name, row.countedPoints]), [
  [1, 'Paweł Piskorz', 19],
  [2, 'Łukasz Kieliszkowski', 18],
  [2, 'Rafał Sojc', 18],
  [4, 'Marcin Stankiewicz', 16],
  [5, 'Jakub Szczechowski', 14],
]);
assert.deepEqual(
  standings.map(row => ({
    competitorId: row.competitorId,
    name: row.name,
    starts: row.starts,
    results: row.results,
    countedEventIds: row.countedEventIds,
    allPoints: row.allPoints,
    countedPoints: row.countedPoints,
    rejectedPoints: row.rejectedPoints,
    rank: row.rank
  })),
  DEFAULT_SEASON.standings
);
assert.equal(standings[0].starts, 6);
assert.equal(standings[0].allPoints, 23);
assert.equal(standings[0].rejectedPoints, 4);
assert.deepEqual(
  standings.find(row => row.name === 'Michał Sajdak'),
  {
    competitorId: 'competitor-michal-sajdak-1786279130885-bf0b79',
    name: 'Michał Sajdak',
    results: [{
      eventId: 'season-2026-11', eventNumber: 11, date: '2026-08-09', location: 'Skalbmierz', position: 4, points: 2,
    }],
    starts: 1,
    countedEventIds: ['season-2026-11'],
    allPoints: 2,
    countedPoints: 2,
    rejectedPoints: 0,
    rank: 14,
  },
);

const migratedEvents = mergeSeasonEvents(DEFAULT_SEASON.events, DEFAULT_SEASON.events.slice(0, 10));
assert.equal(migratedEvents.length, 11);
assert.equal(migratedEvents.filter(event => event.id === 'season-2026-11').length, 1);
const importedSkalbmierz = { ...skalbmierz, sourceFile: 'Nowszy plik podsumowania' };
const mergedDuplicate = mergeSeasonEvents(DEFAULT_SEASON.events, [importedSkalbmierz]);
assert.equal(mergedDuplicate.length, 11);
assert.equal(mergedDuplicate.at(-1).sourceFile, 'Nowszy plik podsumowania');

const staleBase = DEFAULT_SEASON.events.map(event => event.number === 11
  ? { ...event, ranking: [{ position: 1, name: 'Błędny zapis lokalny' }] }
  : event);
const futureEvent = normalizeSeasonEvent({
  id: 'season-2026-12',
  number: 12,
  date: '2026-08-16',
  location: 'Przyszła impreza',
  ranking: [{ position: 1, name: 'Nowy zawodnik' }]
});
const canonicalMigration = mergeCanonicalSeasonEvents(DEFAULT_SEASON.events, [...staleBase, futureEvent]);
assert.equal(canonicalMigration.length, 12);
assert.equal(canonicalMigration.find(event => event.id === 'season-2026-11').ranking[0].name, 'Marcin Stankiewicz');
assert.equal(canonicalMigration.find(event => event.id === 'season-2026-12').location, 'Przyszła impreza');

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
assert.equal(normalizeSeasonEvent({ date: '2026-02-30', location: 'Testowo', ranking: [] }), null);

const publicHtml = buildSeasonHtml({
  season: 2026,
  seriesName: 'Puchar Polski <Strongman>',
  maxCountedStarts: 4,
  events: DEFAULT_SEASON.events,
  standings: standings.map(row => ({
    ...row,
    contact: { phone: '+48111222333', email: 'private@example.com' }
  })),
  exportedAt: '2026-08-05T12:00:00Z',
});
assert.match(publicHtml, /^<!doctype html>/);
assert.match(publicHtml, /Puchar Polski &lt;Strongman&gt;/);
assert.match(publicHtml, /Paweł Piskorz/);
assert.match(publicHtml, /is-rejected/);
assert.match(publicHtml, /Wyniki poszczególnych imprez/);
assert.doesNotMatch(publicHtml, /<script/i);
assert.doesNotMatch(publicHtml, /private@example\.com|\+48111222333/);

console.log('Season tests passed');
