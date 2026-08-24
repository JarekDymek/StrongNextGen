import assert from 'node:assert/strict';
import {
  createSubmission,
  normalizeEmail,
  normalizePhone,
  normalizePositiveNumber,
  normalizeUpperText,
  submissionFilename
} from '../formularz/submission-data.js';

assert.equal(normalizeUpperText('  michał   żółć '), 'MICHAŁ ŻÓŁĆ');
assert.equal(normalizePositiveNumber('123,5'), '123.5');
assert.equal(normalizePositiveNumber('123abc'), '');
assert.equal(normalizePositiveNumber('-10'), '');
assert.equal(normalizePositiveNumber('1e3'), '');
assert.equal(normalizePhone('+48 123-456-789'), '+48123456789');
assert.equal(normalizePhone('0046 60 245 26 47'), '+46602452647');
assert.equal(normalizePhone('12abc'), '');
assert.equal(normalizeEmail(' Athlete@Example.COM '), 'athlete@example.com');
assert.equal(normalizeEmail('brak-adresu'), '');

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
  contact: { phone: '+49 151 234-56-789', email: 'John.Smith@Example.com' },
  strengthRecords: { squatKg: '330', benchPressKg: '', deadliftKg: '390.5' },
  career: {
    nationalResults: [
      { level: 'NATIONAL_CHAMPIONSHIP', place: '1', year: '2025', eventName: ' german cup ' },
      { level: 'NATIONAL_CUP', place: '2', year: '2024', eventName: '' }
    ],
    internationalResults: [
      { level: 'EUROPEAN_CHAMPIONSHIP', place: '3', year: '2024', eventName: '' }
    ]
  },
  declarations: {
    dataAndPhotoConfirmed: true,
    riskAccepted: true,
    mediaPermissionAccepted: false,
    contactDataNoticeAcknowledged: true
  }
};
const submission = createSubmission(values, photo, now);

assert.equal(submission.schemaVersion, 3);
assert.equal(submission.type, 'competitor-submission');
assert.equal(submission.formLocale, 'en');
assert.equal(submission.competitor.name, 'JOHN SMITH');
assert.equal(submission.competitor.residence, 'HAMBURG');
assert.equal(submission.competitor.countryCode, 'DE');
assert.equal(submission.competitor.weight, '135.5');
assert.deepEqual(submission.contact, { phone: '+4915123456789', email: 'john.smith@example.com' });
assert.equal(submission.competitor.strengthRecords.squatKg, 330);
assert.equal(submission.competitor.strengthRecords.benchPressKg, null);
assert.equal(submission.competitor.strengthRecords.deadliftKg, 390.5);
assert.equal(submission.competitor.career.nationalResults[0].eventName, 'GERMAN CUP');
assert.equal(submission.competitor.career.nationalResults.length, 2);
assert.equal(submission.competitor.career.internationalResults.length, 1);
assert.equal('titleCodes' in submission.competitor.career, false);
assert.equal('categories' in submission.competitor, false);
assert.equal('category' in submission.competitor, false);
assert.equal('notes' in submission.competitor, false);
assert.equal('id' in submission.competitor, false);
assert.equal(submission.declarations.version, '2026-08-v3');
assert.equal(submission.declarations.locale, 'en');
assert.equal(submission.declarations.mediaPermissionAccepted, false);
assert.equal(submission.declarations.contactDataNoticeAcknowledged, true);
assert.equal('privacyNoticeAcknowledged' in submission.declarations, false);
assert.equal(submission.declarations.acceptedAt, now.toISOString());
assert.equal(submissionFilename('Michał Żółć'), 'zawodnik_MICHAL_ZOLC.json');

assert.throws(() => createSubmission({ ...values, countryCode: 'XX' }, photo, now), /invalidRequired/);
assert.throws(() => createSubmission({ ...values, contact: { phone: 'abc', email: 'bad' } }, photo, now), /invalidContact/);
assert.throws(() => createSubmission({ ...values, birthDate: '2026-02-30' }, photo, now), /invalidRequired/);
assert.throws(() => createSubmission({ ...values, strengthRecords: { deadliftKg: '-10' } }, photo, now), /invalidStrength/);
assert.throws(() => createSubmission({
  ...values,
  career: { ...values.career, nationalResults: [{ level: 'NATIONAL_CHAMPIONSHIP', place: '', year: '2025' }] }
}, photo, now), /invalidCareer/);
assert.throws(() => createSubmission({
  ...values,
  declarations: { ...values.declarations, riskAccepted: false }
}, photo, now), /invalidDeclarations/);
assert.throws(() => createSubmission({
  ...values,
  declarations: { ...values.declarations, contactDataNoticeAcknowledged: false }
}, photo, now), /invalidDeclarations/);

console.log('Submission data tests passed');
