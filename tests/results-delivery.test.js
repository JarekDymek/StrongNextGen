import assert from 'node:assert/strict';
import { buildResultsMailto, collectResultsRecipients, sendResultsSummary } from '../src/results-delivery.js';

const proof = `v1:${'a'.repeat(64)}`;
const recipients = collectResultsRecipients([
  { contact: { email: 'A@Example.com', deliveryProof: proof } },
  { contact: { email: 'a@example.com' } },
  { contact: { email: 'b@example.com' } },
  { contact: { email: 'bad' } }
]);
assert.deepEqual(recipients.all, [
  { email: 'a@example.com', deliveryProof: proof },
  { email: 'b@example.com', deliveryProof: '' }
]);
assert.equal(recipients.verified.length, 1, 'Duplikat e-maila nie może usuwać prawidłowego podpisu dostawy');

let request = null;
const sent = await sendResultsSummary({
  endpoint: 'https://example.test/send-results',
  event: { name: 'Test' },
  recipients: [{ email: 'a@example.com', deliveryProof: proof }],
  html: '<!doctype html><html><body>' + 'x'.repeat(100) + '</body></html>',
  fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ ok: true, sent: 1 }) };
  }
});
assert.equal(sent.sent, 1);
assert.equal(request.url, 'https://example.test/send-results');
assert.equal(JSON.parse(request.options.body).recipients[0].email, 'a@example.com');

const mailto = buildResultsMailto({
  emails: ['a@example.com', 'a@example.com', 'b@example.com'],
  eventName: 'Puchar Polski',
  standings: [{ rank: 1, name: 'JAN TESTOWY', points: 5 }]
});
assert.match(decodeURIComponent(mailto), /bcc=a@example\.com,b@example\.com/);
assert.match(decodeURIComponent(mailto), /1\. JAN TESTOWY — 5\.00 pkt/);

console.log('Results delivery tests passed');
