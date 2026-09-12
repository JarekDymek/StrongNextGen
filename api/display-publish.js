import { redis, headers, newSession, cleanSnapshot, cleanMedia, mediaVersion,
  tokenHash, keyFor, roomPattern, TTL, CREATE_SCRIPT, LIMIT_SCRIPT, PUBLISH_SCRIPT, rateKey } from '../lib/display-store.js';

export function createPublishHandler(command = redis) {
  return async function handler(request, response) {
    if (!headers(request, response, 'POST')) return response.status(403).json({ error: 'origin' });
    if (request.method === 'OPTIONS') return response.status(204).end();
    if (request.method !== 'POST') return response.status(405).json({ error: 'method' });
    try {
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      if (!body || Buffer.byteLength(JSON.stringify(body)) > 3 * 1024 * 1024) {
        return response.status(400).json({ error: 'invalid-body' });
      }
      if (body.action === 'create') {
        const count = await command(['EVAL', LIMIT_SCRIPT, 1, rateKey(request)]);
        if (count > 10) return response.status(429).json({ error: 'session-limit' });
        for (let attempt = 0; attempt < 3; attempt++) {
          const session = newSession();
          const created = await command(['EVAL', CREATE_SCRIPT, 1, keyFor(session.room), tokenHash(session.token), TTL]);
          if (created === 1) return response.status(201).json(session);
        }
        return response.status(503).json({ error: 'retry' });
      }
      const token = String(request.headers?.authorization || '').replace(/^Bearer /, '');
      if (!roomPattern.test(body.room) || !/^[a-f0-9]{64}$/.test(token)) {
        return response.status(403).json({ error: 'credentials' });
      }
      if (!Number.isSafeInteger(body.seq) || body.seq <= 0) return response.status(400).json({ error: 'sequence' });
      const snapshot = body.snapshot === undefined ? '' : JSON.stringify(cleanSnapshot(body.snapshot));
      const media = body.media === undefined ? null : cleanMedia(body.media);
      const result = await command(['EVAL', PUBLISH_SCRIPT, 1, keyFor(body.room), tokenHash(token),
        body.seq, snapshot, media ? JSON.stringify(media) : '', media ? mediaVersion(media) : '', Date.now(), TTL]);
      if (result === -1) return response.status(404).json({ error: 'expired' });
      if (result === -2) return response.status(403).json({ error: 'credentials' });
      if (result === -3) return response.status(409).json({ error: 'stale' });
      return response.status(200).json({ ok: true });
    } catch (error) {
      const invalid = error instanceof SyntaxError || ['invalid-snapshot', 'invalid-media'].includes(error.message);
      return response.status(invalid ? 400 : 503).json({ error: invalid ? 'invalid-body' : 'unavailable' });
    }
  };
}
export default createPublishHandler();

