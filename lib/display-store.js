import { createHash, randomBytes } from 'node:crypto';
import { safeDisplayImage } from '../src/public-display-snapshot.js';

export const TTL = 48 * 60 * 60;
export const roomPattern = /^[A-Z2-9]{10}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
export const tokenHash = hash;
export const keyFor = room => 'strongman:display:' + room;
export function credentials() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  };
}
export async function redis(command) {
  const { url, token } = credentials();
  if (!url || !token) throw new Error('display-not-configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(command), signal: controller.signal
    });
    if (!response.ok) throw new Error('redis-unavailable');
    const body = await response.json();
    if (body.error) throw new Error('redis-unavailable');
    return body.result;
  } finally { clearTimeout(timer); }
}
export function newSession() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return {
    room: [...randomBytes(10)].map(n => alphabet[n % 32]).join(''),
    token: randomBytes(32).toString('hex')
  };
}
export function headers(request, response, methods, publicRead = false) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  response.setHeader('Access-Control-Allow-Methods', methods + ', OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  const origin = String(request.headers?.origin || '');
  const allowed = [process.env.ALLOWED_ORIGIN || 'https://jarekdymek.github.io',
    'https://' + request.headers?.host];
  if (publicRead) response.setHeader('Access-Control-Allow-Origin', '*');
  else if (allowed.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  return publicRead || !origin || allowed.includes(origin);
}
const text = (value, max = 200) => String(value ?? '').slice(0, max);
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
function rows(value) {
  if (!Array.isArray(value) || value.length > 100) throw new Error('invalid-snapshot');
  return value.map(row => ({
    id: text(row.id, 120), name: text(row.name), result: text(row.result, 50),
    place: text(row.place, 12), points: numeric(row.points), start: numeric(row.start)
  }));
}
export function cleanSnapshot(value) {
  if (!value || value.version !== 1 || !['live', 'summary', 'break', 'end'].includes(value.stage) ||
      !value.current || !Array.isArray(value.previous) || value.previous.length > 100) throw new Error('invalid-snapshot');
  return {
    version: 1, eventName: text(value.eventName), eventLocation: text(value.eventLocation),
    eventDate: text(value.eventDate, 30), eventCount: numeric(value.eventCount),
    stage: value.stage, activeId: text(value.activeId, 120),
    current: { number: numeric(value.current.number), name: text(value.current.name),
      completed: Boolean(value.current.completed), rows: rows(value.current.rows), results: rows(value.current.results) },
    previous: value.previous.map(entry => ({ number: numeric(entry.number), name: text(entry.name), rows: rows(entry.rows) })),
    overall: rows(value.overall),
    next: value.next ? { name: text(value.next.name), number: numeric(value.next.number) } : null
  };
}
export function cleanMedia(value) {
  if (!value || !value.photos || typeof value.photos !== 'object' || Object.keys(value.photos).length > 100) {
    throw new Error('invalid-media');
  }
  return { logo: safeDisplayImage(value.logo),
    photos: Object.fromEntries(Object.entries(value.photos).map(([id, photo]) => [text(id, 120), safeDisplayImage(photo)])) };
}
export function mediaVersion(media) { return hash(JSON.stringify(media)); }

export const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'token', ARGV[1], 'seq', '0')
redis.call('EXPIRE', KEYS[1], ARGV[2])
return 1`;
export const LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
return count`;
export const PUBLISH_SCRIPT = `
local token = redis.call('HGET', KEYS[1], 'token')
if not token then return -1 end
if token ~= ARGV[1] then return -2 end
local previous = tonumber(redis.call('HGET', KEYS[1], 'seq') or '0')
if tonumber(ARGV[2]) <= previous then return -3 end
if ARGV[3] ~= '' then redis.call('HSET', KEYS[1], 'snapshot', ARGV[3], 'revision', ARGV[2]) end
if ARGV[4] ~= '' then redis.call('HSET', KEYS[1], 'media', ARGV[4], 'mediaVersion', ARGV[5]) end
redis.call('HSET', KEYS[1], 'seq', ARGV[2], 'updatedAt', ARGV[6])
redis.call('EXPIRE', KEYS[1], ARGV[7])
return 1`;
export const READ_SCRIPT = `
local snapshot = redis.call('HGET', KEYS[1], 'snapshot')
if not snapshot then return nil end
local revision = redis.call('HGET', KEYS[1], 'revision')
local mediaVersion = redis.call('HGET', KEYS[1], 'mediaVersion') or ''
local media = ''
if mediaVersion ~= ARGV[2] then media = redis.call('HGET', KEYS[1], 'media') or '' end
if revision == ARGV[1] then snapshot = '' end
return {snapshot, revision, mediaVersion, media, redis.call('HGET', KEYS[1], 'updatedAt')}`;
export function rateKey(request) {
  const ip = String(request.headers?.['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  return 'strongman:display-create:' + hash(ip);
}

