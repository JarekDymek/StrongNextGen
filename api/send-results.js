import { createHash } from 'node:crypto';
import { verifyContactEmail } from './contact-proof.js';

const DEFAULT_ALLOWED_ORIGIN = 'https://jarekdymek.github.io';
const MAX_BODY_BYTES = 700 * 1024;
const MAX_RECIPIENTS = 50;

export default async function handler(request, response) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  const origin = String(request.headers.origin || '');
  response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'POST') return response.status(405).json({ ok: false });
  if (origin !== allowedOrigin) return response.status(403).json({ ok: false });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESULTS_FROM_EMAIL;
  const signingSecret = process.env.RESULTS_SIGNING_SECRET;
  if (!apiKey || !from || !signingSecret) {
    return response.status(503).json({ ok: false, error: 'results-delivery-not-configured' });
  }

  const body = typeof request.body === 'string' ? safeJson(request.body) : request.body;
  const serialized = body ? JSON.stringify(body) : '';
  if (!body || byteLength(serialized) > MAX_BODY_BYTES || !validEvent(body.event) || !validHtml(body.html)) {
    return response.status(400).json({ ok: false, error: 'invalid-results' });
  }
  const recipients = normalizeRecipients(body.recipients, signingSecret);
  if (!recipients.length || recipients.length > MAX_RECIPIENTS || recipients.length !== body.recipients.length) {
    return response.status(400).json({ ok: false, error: 'invalid-recipients' });
  }

  const subject = `WYNIKI ZAWODÓW — ${body.event.name}`.slice(0, 180);
  const payload = recipients.map(email => ({
    from,
    to: [email],
    subject,
    html: body.html,
    text: `Wyniki zawodów ${body.event.name}. Pełne podsumowanie znajduje się w treści wiadomości.`
  }));
  const idempotencyKey = `results/${createHash('sha256').update(serialized).digest('hex').slice(0, 48)}`;
  try {
    const mailResponse = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey
      },
      body: JSON.stringify(payload)
    });
    if (!mailResponse.ok) return response.status(502).json({ ok: false, error: 'mail-provider-error' });
    return response.status(200).json({ ok: true, sent: recipients.length });
  } catch {
    return response.status(502).json({ ok: false, error: 'mail-provider-error' });
  }
}

function normalizeRecipients(value, secret) {
  if (!Array.isArray(value)) return [];
  const unique = new Map();
  value.forEach(item => {
    const email = String(item?.email || '').trim().toLowerCase();
    if (!verifyContactEmail(email, item?.deliveryProof, secret)) return;
    unique.set(email, email);
  });
  return [...unique.values()];
}

function validEvent(value) {
  return value && typeof value === 'object' &&
    typeof value.name === 'string' && value.name.trim().length >= 2 && value.name.length <= 160 &&
    typeof value.location === 'string' && value.location.length <= 120 &&
    (!value.date || /^\d{4}-\d{2}-\d{2}$/.test(value.date));
}

function validHtml(value) {
  return typeof value === 'string' && value.length >= 100 && value.length <= 650 * 1024 &&
    /^<!doctype html>/i.test(value.trim()) &&
    !/<(?:script|iframe|object|embed)\b|\son\w+\s*=|javascript:/i.test(value);
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}
