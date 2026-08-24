import assert from 'node:assert/strict';
import { consumeSharedSubmission, registerFileLaunchHandler, SHARED_SUBMISSION_CACHE, SHARED_SUBMISSION_PATH } from '../src/shared-import.js';

const entries = new Map();
const cacheStorage = {
  async open(name) {
    assert.equal(name, SHARED_SUBMISSION_CACHE);
    return {
      match: async key => entries.get(key) || null,
      delete: async key => entries.delete(key)
    };
  }
};
const baseUrl = 'https://example.test/StrongNextGen/';
const key = new URL(SHARED_SUBMISSION_PATH, baseUrl).href;
entries.set(key, new Response('{"schemaVersion":3}', { headers: { 'x-shared-filename': 'zawodnik_TEST.json' } }));
const shared = await consumeSharedSubmission({ cacheStorage, baseUrl });
assert.equal(shared.filename, 'zawodnik_TEST.json');
assert.equal(shared.text, '{"schemaVersion":3}');
assert.equal(entries.has(key), false, 'Odebrany plik nie może zostać ponownie zaimportowany po restarcie');
assert.equal(await consumeSharedSubmission({ cacheStorage, baseUrl }), null);

let consumer = null;
let opened = '';
assert.equal(registerFileLaunchHandler(async file => { opened = await file.text(); }, {
  setConsumer(callback) { consumer = callback; }
}), true);
await consumer({ files: [{ getFile: async () => new Blob(['launch']) }] });
assert.equal(opened, 'launch');

console.log('Shared import tests passed');
