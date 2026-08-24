import assert from 'node:assert/strict';
import { signContactEmail } from '../api/contact-proof.js';
import handler from '../api/send-results.js';

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; }
  };
}

const secret = 'test-signing-secret';
const html = '<!doctype html><html><body>' + 'Wyniki '.repeat(30) + '</body></html>';
const body = {
  event: { name: 'PUCHAR POLSKI', location: 'TESTOWO', date: '2026-08-24' },
  recipients: [{ email: 'athlete@example.com', deliveryProof: signContactEmail('athlete@example.com', secret) }],
  html
};
const previous = {
  key: process.env.RESEND_API_KEY,
  from: process.env.RESULTS_FROM_EMAIL,
  secret: process.env.RESULTS_SIGNING_SECRET
};
const previousFetch = globalThis.fetch;
try {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.RESULTS_FROM_EMAIL = 'Strongman <wyniki@example.com>';
  process.env.RESULTS_SIGNING_SECRET = secret;
  let providerRequest = null;
  globalThis.fetch = async (url, options) => {
    providerRequest = { url, options };
    return { ok: true };
  };
  const response = responseMock();
  await handler({ method: 'POST', headers: { origin: 'https://jarekdymek.github.io' }, body }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.sent, 1);
  assert.equal(providerRequest.url, 'https://api.resend.com/emails/batch');
  const messages = JSON.parse(providerRequest.options.body);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].to, ['athlete@example.com']);
  assert.equal(messages[0].html, html);

  const forged = responseMock();
  await handler({
    method: 'POST',
    headers: { origin: 'https://jarekdymek.github.io' },
    body: { ...body, recipients: [{ email: 'victim@example.com', deliveryProof: body.recipients[0].deliveryProof }] }
  }, forged);
  assert.equal(forged.statusCode, 400);
  assert.equal(forged.body.error, 'invalid-recipients');
} finally {
  globalThis.fetch = previousFetch;
  restore('RESEND_API_KEY', previous.key);
  restore('RESULTS_FROM_EMAIL', previous.from);
  restore('RESULTS_SIGNING_SECRET', previous.secret);
}

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

console.log('Results API tests passed');
