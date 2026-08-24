import assert from 'node:assert/strict';
import {
  canShareSubmission,
  createSendController,
  createShareFallbackFile,
  createSubmissionFile,
  sendSubmission,
  shareSubmission,
  submissionJson
} from '../formularz/delivery.js';

const submission = {
  schemaVersion: 3,
  type: 'competitor-submission',
  contact: { phone: '+48123456789', email: 'test@example.com' },
  competitor: { name: 'JAN TESTOWY' }
};

assert.equal(JSON.parse(submissionJson(submission)).contact.email, 'test@example.com');
class TestFile extends Blob {
  constructor(parts, name, options) {
    super(parts, options);
    this.name = name;
  }
}
const file = createSubmissionFile(submission, 'zawodnik_JAN_TESTOWY.json', TestFile);
assert.equal(file.name, 'zawodnik_JAN_TESTOWY.json');
assert.equal(file.type, 'application/json;charset=utf-8');
const fallbackFile = createShareFallbackFile(submission, file.name, TestFile);
assert.equal(fallbackFile.name, 'zawodnik_JAN_TESTOWY.json.txt');
assert.equal(fallbackFile.type, 'text/plain;charset=utf-8');
assert.deepEqual(JSON.parse(await fallbackFile.text()), submission);

let request = null;
await sendSubmission({
  endpoint: 'https://example.test/send',
  submission,
  filename: file.name,
  fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true };
  }
});
assert.equal(request.url, 'https://example.test/send');
assert.deepEqual(JSON.parse(request.options.body).submission, submission);
assert.equal(JSON.parse(request.options.body).filename, file.name);

await assert.rejects(() => sendSubmission({
  endpoint: 'https://example.test/send',
  submission,
  filename: file.name,
  fetchImpl: async () => { throw new Error('network'); }
}), /sendFailed/);
await assert.rejects(() => sendSubmission({ endpoint: '', submission, filename: file.name }), /sendUnavailable/);

let calls = 0;
let release;
const pending = new Promise(resolve => { release = resolve; });
const controller = createSendController(async () => {
  calls += 1;
  await pending;
  return true;
});
const first = controller.run({});
const second = controller.run({});
assert.equal(first, second);
assert.equal(controller.isBusy(), true);
await Promise.resolve();
assert.equal(calls, 1);
release();
await first;
assert.equal(controller.isBusy(), false);

let shared = null;
const navigatorMock = {
  canShare: ({ files }) => files[0] === file,
  share: async payload => { shared = payload; }
};
assert.equal(canShareSubmission(navigatorMock, file), true);
assert.equal(await shareSubmission(navigatorMock, file, 'JAN TESTOWY', fallbackFile), 'json');
assert.equal(shared.files[0], file);
assert.equal(shared.title, 'JAN TESTOWY');

let fallbackCalls = 0;
const fallbackNavigator = {
  canShare: ({ files }) => files[0] === file || files[0] === fallbackFile,
  share: async ({ files }) => {
    fallbackCalls += 1;
    if (files[0] === file) throw new TypeError('application/json is not shareable');
    shared = { files };
  }
};
assert.equal(await shareSubmission(fallbackNavigator, file, 'JAN TESTOWY', fallbackFile), 'text');
assert.equal(fallbackCalls, 2);
assert.equal(shared.files[0], fallbackFile);

let cancellationCalls = 0;
const cancelledNavigator = {
  canShare: () => true,
  share: async () => {
    cancellationCalls += 1;
    const error = new Error('cancelled');
    error.name = 'AbortError';
    throw error;
  }
};
await assert.rejects(() => shareSubmission(cancelledNavigator, file, 'JAN TESTOWY', fallbackFile), { name: 'AbortError' });
assert.equal(cancellationCalls, 1, 'Anulowanie panelu udostępniania nie może otwierać go ponownie');

console.log('Submission delivery tests passed');
