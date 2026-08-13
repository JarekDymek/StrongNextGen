import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DEFAULT_SEASON } from '../src/season-data.js';

const source = JSON.parse(await fs.readFile(new URL('../data/KGpo11.json', import.meta.url), 'utf8'));
const report = await fs.readFile(new URL('../data/KGpo11.html', import.meta.url), 'utf8');
assert.deepEqual(DEFAULT_SEASON, source, 'Runtime season data must exactly match data/KGpo11.json');
assert.equal(source.events.length, 11);
assert.equal(source.events.find(event => event.id === 'season-2026-07').ranking.find(row => row.name === 'Marcin Stankiewicz').position, 3);
assert.equal(source.events.find(event => event.id === 'season-2026-08').date, '2026-07-25');
assert.equal(source.standings.find(row => row.name === 'Marcin Stankiewicz').countedPoints, 16);
assert.match(report, /Kleczew/);
assert.match(report, /25\.07\.2026/);
assert.match(report, /Marcin Stankiewicz/);

console.log('Season source data tests passed');
