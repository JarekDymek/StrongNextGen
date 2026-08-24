import assert from 'node:assert/strict';
import handler from '../api/send-submission.js';

const submission = {
  schemaVersion: 3,
  type: 'competitor-submission',
  contact: { phone: '+48123456789', email: 'test@example.com' },
  competitor: { name: 'JAN TESTOWY', photo: 'data:image/jpeg;base64,QUJDRA==' }
};

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

const forbidden = responseMock();
await handler({ method: 'POST', headers: { origin: 'https://attacker.example' }, body: { submission } }, forbidden);
assert.equal(forbidden.statusCode, 403);

const previousEnv = {
  key: process.env.RESEND_API_KEY,
  from: process.env.SUBMISSION_FROM_EMAIL,
  to: process.env.SUBMISSION_TO_EMAIL,
  signing: process.env.RESULTS_SIGNING_SECRET
};
const previousFetch = globalThis.fetch;
try {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.SUBMISSION_FROM_EMAIL = 'Strongman <noreply@example.com>';
  process.env.RESULTS_SIGNING_SECRET = 'test-signing-secret';
  delete process.env.SUBMISSION_TO_EMAIL;
  let providerRequest = null;
  globalThis.fetch = async (url, options) => {
    providerRequest = { url, options };
    return { ok: true };
  };
  const response = responseMock();
  await handler({
    method: 'POST',
    headers: { origin: 'https://jarekdymek.github.io' },
    body: { submission, filename: 'zawodnik_JAN_TESTOWY.json' }
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(providerRequest.url, 'https://api.resend.com/emails');
  const mail = JSON.parse(providerRequest.options.body);
  assert.deepEqual(mail.to, ['jarekdymek@gmail.com']);
  assert.equal(mail.subject, 'ZGŁOSZENIE ZAWODNIKA — JAN TESTOWY');
  assert.equal(mail.attachments[0].filename, 'zawodnik_JAN_TESTOWY.json');
  const delivered = JSON.parse(Buffer.from(mail.attachments[0].content, 'base64').toString('utf8'));
  assert.deepEqual({ ...delivered, contact: { phone: delivered.contact.phone, email: delivered.contact.email } }, submission);
  assert.match(delivered.contact.deliveryProof, /^v1:[a-f0-9]{64}$/);
} finally {
  globalThis.fetch = previousFetch;
  restoreEnv('RESEND_API_KEY', previousEnv.key);
  restoreEnv('SUBMISSION_FROM_EMAIL', previousEnv.from);
  restoreEnv('SUBMISSION_TO_EMAIL', previousEnv.to);
  restoreEnv('RESULTS_SIGNING_SECRET', previousEnv.signing);
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

console.log('Submission API tests passed');
