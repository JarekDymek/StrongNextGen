import { createHmac, timingSafeEqual } from 'node:crypto';

export function signContactEmail(email, secret) {
  const normalized = normalizeEmail(email);
  if (!normalized || !secret) return '';
  const digest = createHmac('sha256', secret).update(normalized).digest('hex');
  return `v1:${digest}`;
}

export function verifyContactEmail(email, proof, secret) {
  const expected = signContactEmail(email, secret);
  const actual = String(proof || '');
  if (!expected || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '';
}
