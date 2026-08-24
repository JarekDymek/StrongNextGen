const DEFAULT_ALLOWED_ORIGIN = 'https://jarekdymek.github.io';
const DEFAULT_RECIPIENT = 'jarekdymek@gmail.com';
const MAX_BODY_BYTES = 100 * 1024;

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
  const from = process.env.SUBMISSION_FROM_EMAIL;
  if (!apiKey || !from) return response.status(503).json({ ok: false, error: 'delivery-not-configured' });

  const body = typeof request.body === 'string' ? safeJson(request.body) : request.body;
  if (!body || byteLength(JSON.stringify(body)) > MAX_BODY_BYTES || !validSubmission(body.submission)) {
    return response.status(400).json({ ok: false, error: 'invalid-submission' });
  }

  const name = body.submission.competitor.name;
  const filename = safeFilename(body.filename, name);
  const json = JSON.stringify(body.submission, null, 2);
  try {
    const mailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [process.env.SUBMISSION_TO_EMAIL || DEFAULT_RECIPIENT],
        subject: `ZGŁOSZENIE ZAWODNIKA — ${name}`,
        text: `Nowe zgłoszenie zawodnika: ${name}. Plik JSON znajduje się w załączniku.`,
        attachments: [{ filename, content: Buffer.from(json, 'utf8').toString('base64') }]
      })
    });
    if (!mailResponse.ok) return response.status(502).json({ ok: false, error: 'mail-provider-error' });
    return response.status(200).json({ ok: true });
  } catch {
    return response.status(502).json({ ok: false, error: 'mail-provider-error' });
  }
}

function validSubmission(value) {
  return value?.schemaVersion === 3 &&
    value?.type === 'competitor-submission' &&
    typeof value?.competitor?.name === 'string' &&
    value.competitor.name.length > 1 && value.competitor.name.length <= 120 &&
    typeof value?.contact?.phone === 'string' && /^\+?\d{7,15}$/.test(value.contact.phone) &&
    typeof value?.contact?.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.contact.email) &&
    !Object.hasOwn(value.competitor, 'categories') && !Object.hasOwn(value.competitor, 'category');
}

function safeFilename(value, name) {
  const candidate = String(value || `zawodnik_${name}.json`)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '_')
    .slice(0, 140);
  return candidate.endsWith('.json') ? candidate : `${candidate}.json`;
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}
