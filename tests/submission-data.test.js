import assert from 'node:assert/strict';
import {
  createSubmission,
  normalizeSubmissionCategories,
  normalizePositiveNumber,
  normalizeUpperText,
  submissionFilename
} from '../formularz/submission-data.js';

assert.equal(normalizeUpperText('  michał   żółć '), 'MICHAŁ ŻÓŁĆ');
assert.equal(normalizePositiveNumber('123,5'), '123.5');
assert.equal(normalizePositiveNumber('123abc'), '');
assert.equal(normalizePositiveNumber('-10'), '');
assert.equal(normalizePositiveNumber('1e3'), '');
assert.deepEqual(
  normalizeSubmissionCategories(['Puchar Polski', 'Inny'], ' pokazy, POKAZY, legenda, inny, , '),
  ['Puchar Polski', 'Inny', 'POKAZY']
);
assert.deepEqual(normalizeSubmissionCategories(['Aktywny   Zawodnik'], ''), ['Inny']);
assert.deepEqual(normalizeSubmissionCategories([], 'Aktywny   Zawodnik, Legenda'), []);

const photo = 'data:image/jpeg;base64,QUJDRA==';
const now = new Date('2026-08-13T10:00:00.000Z');
const values = {
  formLocale: 'en',
  name: '  john   smith ',
  birthDate: '1990-01-02',
  residence: ' hamburg ',
  countryCode: 'de',
  height: '190',
  weight: '135,5',
  categories: ['Puchar Polski'],
  customCategories: 'pokazy',
  strengthRecords: { squatKg: '330', benchPressKg: '', deadliftKg: '390.5' },
  career: {
    nationalBest: { level: 'NATIONAL_CHAMPIONSHIP', place: '1', year: '2025', eventName: ' german cup ' },
    internationalBest: { level: 'EUROPEAN_CHAMPIONSHIP', place: '3', year: '2024', eventName: '' },
    titleCodes: ['NATIONAL_CHAMPION', 'NATIONAL_CHAMPION', 'UNKNOWN']
  },
  declarations: {
    dataAndPhotoConfirmed: true,
    riskAccepted: true,
    mediaPermissionAccepted: false,
    privacyNoticeAcknowledged: true
  }
};
const submission = createSubmission(values, photo, now);

assert.equal(submission.schemaVersion, 2);
assert.equal(submission.type, 'competitor-submission');
assert.equal(submission.formLocale, 'en');
assert.equal(submission.competitor.name, 'JOHN SMITH');
assert.equal(submission.competitor.residence, 'HAMBURG');
assert.equal(submission.competitor.countryCode, 'DE');
assert.equal(submission.competitor.weight, '135.5');
assert.equal(submission.competitor.strengthRecords.squatKg, 330);
assert.equal(submission.competitor.strengthRecords.benchPressKg, null);
assert.equal(submission.competitor.strengthRecords.deadliftKg, 390.5);
assert.equal(submission.competitor.career.nationalBest.eventName, 'GERMAN CUP');
assert.deepEqual(submission.competitor.career.titleCodes, ['NATIONAL_CHAMPION']);
assert.deepEqual(submission.competitor.categories, ['Puchar Polski', 'POKAZY']);
assert.equal('notes' in submission.competitor, false);
assert.equal('id' in submission.competitor, false);
assert.equal(submission.declarations.version, '2026-08-v1');
assert.equal(submission.declarations.locale, 'en');
assert.equal(submission.declarations.mediaPermissionAccepted, false);
assert.equal(submission.declarations.acceptedAt, now.toISOString());
assert.equal(submissionFilename('Michał Żółć'), 'zawodnik_MICHAL_ZOLC.json');

assert.throws(() => createSubmission({ ...values, countryCode: 'XX' }, photo, now), /invalidRequired/);
assert.throws(() => createSubmission({ ...values, birthDate: '2026-02-30' }, photo, now), /invalidRequired/);
assert.throws(() => createSubmission({ ...values, strengthRecords: { deadliftKg: '-10' } }, photo, now), /invalidStrength/);
assert.throws(() => createSubmission({
  ...values,
  career: { ...values.career, nationalBest: { level: 'NATIONAL_CHAMPIONSHIP', place: '', year: '2025' } }
}, photo, now), /invalidCareer/);
assert.throws(() => createSubmission({
  ...values,
  declarations: { ...values.declarations, riskAccepted: false }
}, photo, now), /invalidDeclarations/);

console.log('Submission data tests passed');
