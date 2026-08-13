import assert from 'node:assert/strict';
import { normalizeSubmissionFile } from '../src/competitor-submission.js';

const photo = 'data:image/jpeg;base64,QUJDRA==';
const v1 = normalizeSubmissionFile({
  schemaVersion: 1,
  type: 'competitor-submission',
  competitor: {
    name: 'JAN TESTOWY',
    birthDate: '1990-01-01',
    residence: 'KRAKÓW',
    height: '190',
    weight: '130',
    notes: 'STARY OPIS',
    categories: ['Puchar Polski'],
    photo
  }
});
assert.equal(v1.ok, true);
assert.equal(v1.schemaVersion, 1);
assert.equal(v1.competitor.notes, 'STARY OPIS');
assert.equal(v1.competitor.countryCode, '');

const v2Document = {
  schemaVersion: 2,
  type: 'competitor-submission',
  formLocale: 'en',
  competitor: {
    name: 'JOHN SMITH',
    birthDate: '1990-01-01',
    residence: 'HAMBURG',
    countryCode: 'DE',
    height: '190',
    weight: '135',
    categories: ['Puchar Polski'],
    strengthRecords: { squatKg: 330, benchPressKg: 220, deadliftKg: 390 },
    career: {
      nationalBest: { level: 'NATIONAL_CHAMPIONSHIP', place: 1, year: 2025 },
      internationalBest: { level: 'EUROPEAN_CHAMPIONSHIP', place: 3, year: 2024 },
      titleCodes: ['NATIONAL_CHAMPION']
    },
    photo
  },
  declarations: {
    version: '2026-08-v1',
    locale: 'en',
    dataAndPhotoConfirmed: true,
    riskAccepted: true,
    mediaPermissionAccepted: false,
    privacyNoticeAcknowledged: true,
    acceptedAt: '2026-08-13T10:00:00.000Z'
  }
};
const v2 = normalizeSubmissionFile(v2Document);
assert.equal(v2.ok, true);
assert.equal(v2.schemaVersion, 2);
assert.equal(v2.competitor.countryCode, 'DE');
assert.equal(v2.competitor.strengthRecords.deadliftKg, 390);
assert.deepEqual(v2.competitor.career.titleCodes, ['NATIONAL_CHAMPION']);
assert.equal(v2.competitor.career.nationalResults.length, 1);
assert.equal(v2.competitor.career.internationalResults.length, 1);
assert.equal(v2.declarations.mediaPermissionAccepted, false);

const currentV2Document = structuredClone(v2Document);
currentV2Document.competitor.career = {
  nationalResults: [
    { level: 'NATIONAL_CHAMPIONSHIP', place: 1, year: 2025 },
    { level: 'NATIONAL_CUP', place: 2, year: 2024 }
  ],
  internationalResults: [
    { level: 'EUROPEAN_CHAMPIONSHIP', place: 3, year: 2024 },
    { level: 'WORLD_CHAMPIONSHIP', place: 5, year: 2023 }
  ]
};
delete currentV2Document.declarations.privacyNoticeAcknowledged;
currentV2Document.declarations.version = '2026-08-v2';
const currentV2 = normalizeSubmissionFile(currentV2Document);
assert.equal(currentV2.ok, true);
assert.equal(currentV2.competitor.career.nationalResults.length, 2);
assert.equal(currentV2.competitor.career.internationalResults.length, 2);
assert.equal('privacyNoticeAcknowledged' in currentV2.declarations, false);

assert.equal(normalizeSubmissionFile({ ...v2Document, schemaVersion: 3 }).ok, false);
assert.equal(normalizeSubmissionFile({ ...v2Document, competitor: { ...v2Document.competitor, countryCode: 'XX' } }).ok, false);
assert.equal(normalizeSubmissionFile({
  ...v2Document,
  competitor: { ...v2Document.competitor, strengthRecords: { deadliftKg: '-10' } }
}).ok, false);
assert.equal(normalizeSubmissionFile({
  ...v2Document,
  declarations: { ...v2Document.declarations, riskAccepted: false }
}).ok, false);
assert.equal(normalizeSubmissionFile({
  ...v2Document,
  competitor: { ...v2Document.competitor, career: { nationalBest: {}, internationalBest: null, titleCodes: [] } }
}).ok, true);
assert.equal(normalizeSubmissionFile({
  ...currentV2Document,
  competitor: { ...currentV2Document.competitor, career: { nationalResults: [{ level: 'NATIONAL_CUP', place: '', year: 2025 }] } }
}).ok, false);

console.log('Competitor submission tests passed');
