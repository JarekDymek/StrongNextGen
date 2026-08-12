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
const submission = createSubmission({
  name: '  jan   testowy ',
  birthDate: '1990-01-02',
  residence: ' nowy sącz ',
  height: '185',
  weight: '123,5',
  notes: '  mistrz   polski ',
  categories: ['Puchar Polski'],
  customCategories: 'pokazy'
}, photo, new Date('2026-08-10T10:00:00.000Z'));

assert.equal(submission.type, 'competitor-submission');
assert.equal(submission.competitor.name, 'JAN TESTOWY');
assert.equal(submission.competitor.residence, 'NOWY SĄCZ');
assert.equal(submission.competitor.weight, '123.5');
assert.equal(submission.competitor.notes, 'MISTRZ POLSKI');
assert.deepEqual(submission.competitor.categories, ['Puchar Polski', 'POKAZY']);
assert.equal('id' in submission.competitor, false);
assert.equal(submissionFilename('Michał Żółć'), 'zawodnik_MICHAL_ZOLC.json');
assert.throws(() => createSubmission({
  name: 'Jan Testowy',
  birthDate: '2026-02-30',
  residence: 'Łódź',
  height: '185',
  weight: '120',
  categories: []
}, photo));

console.log('Submission data tests passed');
