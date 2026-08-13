import assert from 'node:assert/strict';
import {
  countryDisplayName,
  isCompleteCareerBest,
  normalizeCareer,
  normalizeCountryCode,
  normalizeStrengthRecords
} from '../src/competitor-profile-data.js';

assert.equal(normalizeCountryCode(' de '), 'DE');
assert.equal(normalizeCountryCode('XX'), '');
assert.equal(countryDisplayName('PL', 'pl'), 'Polska');
assert.equal(countryDisplayName('DE', 'pl'), 'Niemcy');
assert.equal(countryDisplayName('DE', 'en'), 'Germany');

assert.deepEqual(normalizeStrengthRecords({ squatKg: '330', benchPressKg: '', deadliftKg: -1 }), {
  squatKg: 330,
  benchPressKg: null,
  deadliftKg: null
});

const career = normalizeCareer({
  nationalBest: { level: 'NATIONAL_CHAMPIONSHIP', place: 1, year: 2025 },
  internationalBest: { level: 'EUROPEAN_CHAMPIONSHIP', place: 3, year: 2024 },
  titleCodes: ['NATIONAL_CHAMPION', 'NATIONAL_CHAMPION', 'INVALID']
});
assert.equal(isCompleteCareerBest(career.nationalBest), true);
assert.deepEqual(career.titleCodes, ['NATIONAL_CHAMPION']);
assert.equal(isCompleteCareerBest(normalizeCareer({ nationalBest: { level: 'NATIONAL_CHAMPIONSHIP', year: 2025 } }).nationalBest), false);

console.log('Competitor profile data tests passed');
