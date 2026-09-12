import { redis, headers, keyFor, roomPattern, READ_SCRIPT } from '../lib/display-store.js';

export function createReadHandler(command = redis) {
  return async function handler(request, response) {
    headers(request, response, 'GET', true);
    if (request.method === 'OPTIONS') return response.status(204).end();
    if (request.method !== 'GET') return response.status(405).json({ error: 'method' });
    if (!roomPattern.test(request.query?.room)) return response.status(400).json({ error: 'room' });
    try {
      const result = await command(['EVAL', READ_SCRIPT, 1, keyFor(request.query.room),
        String(request.query.revision || ''), String(request.query.mediaVersion || '')]);
      if (!result) return response.status(404).json({ error: 'waiting' });
      const [snapshot, revision, mediaVersion, media, updatedAt] = result;
      return response.status(200).json({
        revision, mediaVersion, updatedAt: Number(updatedAt),
        ...(snapshot ? { snapshot: JSON.parse(snapshot) } : {}),
        ...(media ? { media: JSON.parse(media) } : {})
      });
    } catch {
      return response.status(503).json({ error: 'unavailable' });
    }
  };
}
export default createReadHandler();

