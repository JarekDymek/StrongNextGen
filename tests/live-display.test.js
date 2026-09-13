import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildPublicDisplaySnapshot, formatPublicResult } from '../src/public-display-snapshot.js';
import { createLivePublisher } from '../src/live-display-transport.js';
import { createPublishHandler } from '../api/display-publish.js';
import { createReadHandler } from '../api/display-state.js';
import { cleanSnapshot, cleanMedia, newSession, tokenHash, CREATE_SCRIPT, LIMIT_SCRIPT, PUBLISH_SCRIPT, READ_SCRIPT } from '../lib/display-store.js';
import { mergeDisplayState, selectScreen } from '../display/state.js';

const state = () => ({
  eventName: 'Puchar Strongman', eventDate: '2026-09-13', eventLocation: 'Arena',
  stage: 'scoring', currentEventIndex: 0, selectedEventIds: ['e1', 'e2'],
  selectedCompetitorIds: ['a', 'b'], startOrderIds: ['b', 'a'],
  events: [{ id: 'e1', name: 'Spacer farmera', type: 'low' }, { id: 'e2', name: 'Wyciskanie', type: 'high' }],
  competitors: [{ id: 'a', name: 'Jan Testowy', photo: 'data:image/png;base64,YQ==', contact: { email: 'private@example.com' }, notes: 'secret' },
    { id: 'b', name: 'Adam Testowy', photo: '' }],
  drafts: { e1: { a: '039', b: '15,24' } }, eventHistory: [], scores: {}, ui: { secret: 'hidden' }
});
const snapshot = () => buildPublicDisplaySnapshot(state(), { orderIds: ['b', 'a'] });
test('public result formatting preserves existing time/distance convention', () => {
  for (const [input, output] of [['039', '39 m'], ['015', '15 m'], ['005', '5 m'],
    ['15,24', '15,24 s'], ['15.24', '15,24 s'], ['DNF+39m', '39 m'], ['0', '0 s'], ['dnf', '0 s'], ['', '—'], ['oops', '—']]) {
    assert.equal(formatPublicResult(input), output);
  }
  assert.equal(formatPublicResult({ rawInput: '039', result: 'DNF+39m', isDist: true }), '39 m');
  assert.equal(formatPublicResult({ result: 'DNF+15m', isDist: true }), '15 m');
  assert.equal(formatPublicResult('15', 'high'), '15');
  assert.equal(formatPublicResult('1:05', 'low'), '65,00 s');
});
test('snapshot allowlist, real start order, photos and completed results', () => {
  const s = state(); const before = JSON.stringify(s);
  const result = buildPublicDisplaySnapshot(s, { orderIds: ['a', 'b'], activeId: 'a' });
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(result.current.rows.map(r => r.id), ['a', 'b']);
  assert.equal(result.current.rows[0].result, '39 m');
  assert.equal(result.media.photos.a, s.competitors[0].photo);
  assert.equal(result.media.logo, '../assets/logo-strong-man.png');
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.ok(!JSON.stringify(result).includes('private@'));
  s.logoData = 'data:image/png;base64,Yg==';
  s.eventHistory = [{ nr: 1, name: 'Spacer', type: 'low', results: [
    { id: 'a', result: 'DNF+39m', rawInput: '039', isDist: true, place: 2, points: '1.00' },
    { id: 'b', result: '15,24', rawInput: '15,24', place: 1, points: '2.00' }] }];
  s.scores = { a: 1, b: 2 };
  const complete = buildPublicDisplaySnapshot(s, { orderIds: ['b', 'a'] });
  assert.equal(complete.stage, 'summary');
  assert.equal(complete.current.results[0].result, '39 m');
  assert.equal(complete.overall[0].id, 'b');
  assert.equal(complete.next.name, 'Wyciskanie');
  assert.equal(complete.media.logo, s.logoData);
  s.stage = 'summary';
  assert.equal(buildPublicDisplaySnapshot(s).stage, 'end');
});
test('server removes unknown fields and unsafe image protocols', () => {
  const data = snapshot();
  assert.equal(cleanSnapshot({ ...data, token: 'secret' }).token, undefined);
  assert.equal(cleanMedia({ logo: 'javascript:alert(1)', photos: { a: 'data:text/html,evil' } }).logo, '');
  assert.equal(cleanMedia({ logo: '', photos: { a: 'data:text/html,evil' } }).photos.a, '');
  assert.throws(() => cleanSnapshot({ version: 1, stage: 'wrong' }));
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await pause(5); }
  throw new Error('timed out');
}
test('publisher is asynchronous, throttled, keeps newest state and retries after failure', async () => {
  const sends = []; const statuses = []; let value = 1; let rejectFirst;
  const publisher = createLivePublisher({
    intervalMs: 25,
    readSnapshot: () => ({ value, media: { logo: 'same', photos: {} } }),
    send: body => {
      sends.push({ ...body, at: Date.now() });
      if (sends.length === 1) return new Promise((resolve, reject) => { rejectFirst = reject; });
      return Promise.resolve();
    },
    onStatus: status => statuses.push(status)
  });
  try {
    assert.equal(sends.length, 0);
    await until(() => sends.length === 1);
    value = 2; publisher.notify(); value = 3; publisher.notify();
    await pause(30); assert.equal(sends.length, 1);
    rejectFirst(new Error('offline'));
    await until(() => sends.length >= 2);
    assert.equal(sends[1].snapshot.value, 3);
    assert.ok(statuses.some(status => !status.connected));
    await until(() => sends.length >= 3);
    assert.equal(sends[2].snapshot, undefined);
    assert.equal(sends[2].media, undefined);
    value = 4; publisher.notify();
    await until(() => sends.some(send => send.snapshot?.value === 4));
    const latest = sends.find(send => send.snapshot?.value === 4);
    assert.equal(latest.media, undefined);
    for (let i = 1; i < sends.length; i++) assert.ok(sends[i].at - sends[i - 1].at >= 23);
  } finally { publisher.stop(); }
});
test('snapshot builder failure stays inside publisher and recovers', async () => {
  let fail = true, sent = false;
  const publisher = createLivePublisher({ intervalMs: 10,
    readSnapshot() { if (fail) throw new Error('bad data'); return { media: {} }; },
    send: async () => { sent = true; }, onStatus() { throw new Error('UI failure'); }
  });
  try { await pause(20); assert.equal(sent, false); fail = false; await until(() => sent); }
  finally { publisher.stop(); }
});
test('lost acknowledgement cannot leave a stale server snapshot when the judge reverts a result', async () => {
  let value = 'A', serverValue, loseResponse = false, calls = 0;
  const publisher = createLivePublisher({ intervalMs: 15,
    readSnapshot: () => ({ value, media: { logo: value, photos: {} } }),
    send: async body => {
      calls++;
      if (body.snapshot) serverValue = body.snapshot.value;
      if (loseResponse) { loseResponse = false; value = 'A'; throw new Error('ACK lost'); }
    }
  });
  try {
    await until(() => serverValue === 'A');
    value = 'B'; loseResponse = true; publisher.notify();
    await until(() => calls >= 3 && serverValue === 'A');
    assert.equal(serverValue, value);
  } finally { publisher.stop(); }
});
function response() {
  return { headers: {}, code: 200, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
}
const request = (body, token = '') => ({ method: 'POST', headers: { origin: 'https://jarekdymek.github.io',
  host: 'strong-next-gen.vercel.app', authorization: token ? 'Bearer ' + token : '' }, body });
test('publish API requires token, sanitizes data, handles errors and sequence conflicts', async () => {
  const session = newSession(); assert.match(session.room, /^[A-Z2-9]{10}$/);
  let calls = 0, commandArgs, outcome = 1;
  const handler = createPublishHandler(async args => { calls++; commandArgs = args; return outcome; });
  let res = response();
  await handler(request({ room: session.room, seq: 1 }), res);
  assert.equal(res.code, 403); assert.equal(calls, 0);
  res = response();
  await handler(request({ room: session.room, seq: 1, snapshot: { ...snapshot(), private: 'secret' } }, session.token), res);
  assert.equal(res.code, 200);
  assert.equal(commandArgs[1], PUBLISH_SCRIPT);
  assert.equal(commandArgs[4], tokenHash(session.token));
  assert.ok(!commandArgs[6].includes('secret'));
  for (const [result, expected] of [[-1, 404], [-2, 403], [-3, 409]]) {
    outcome = result; res = response();
    await handler(request({ room: session.room, seq: 2 }, session.token), res);
    assert.equal(res.code, expected);
  }
  res = response();
  await handler(request({ room: session.room, seq: -1 }, session.token), res);
  assert.equal(res.code, 400);
  res = response();
  await createPublishHandler(async () => { throw new Error('timeout'); })(request({ room: session.room, seq: 3 }, session.token), res);
  assert.equal(res.code, 503);
  assert.equal(res.body.error, 'unavailable');
});
test('session creation uses collision protection, random private token and creation rate limit', async () => {
  let script;
  const handler = createPublishHandler(async args => { script = args[1]; return args[1] === LIMIT_SCRIPT ? 1 : 1; });
  const a = response(); await handler(request({ action: 'create' }), a);
  const b = response(); await handler(request({ action: 'create' }), b);
  assert.equal(a.code, 201); assert.equal(script, CREATE_SCRIPT);
  assert.notEqual(a.body.room, b.body.room); assert.notEqual(a.body.token, b.body.token);
  const limited = response();
  await createPublishHandler(async () => 11)(request({ action: 'create' }), limited);
  assert.equal(limited.code, 429);
});
test('read API never returns publish token and omits unchanged snapshot/media', async () => {
  const res = response();
  await createReadHandler(async args => {
    assert.equal(args[1], READ_SCRIPT);
    return [JSON.stringify(snapshot()), '1', 'hash', JSON.stringify(snapshot().media), 1234];
  })({ method: 'GET', headers: {}, query: { room: 'ABCDEF2345' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.token, undefined);
  assert.equal(res.headers['Cache-Control'], 'no-store, max-age=0');
  const heartbeat = response();
  await createReadHandler(async () => ['', '1', 'hash', '', 1250])({
    method: 'GET', headers: {}, query: { room: 'ABCDEF2345', revision: '1', mediaVersion: 'hash' }
  }, heartbeat);
  assert.equal(heartbeat.body.snapshot, undefined);
  assert.equal(heartbeat.body.media, undefined);
  const unavailable = response();
  await createReadHandler(async () => { throw new Error('offline'); })({
    method: 'GET', headers: {}, query: { room: 'ABCDEF2345' }
  }, unavailable);
  assert.equal(unavailable.code, 503);
});
test('receiver preserves last valid state and media on heartbeat or malformed update', () => {
  const initial = { snapshot: snapshot(), media: snapshot().media, revision: '1', mediaVersion: 'hash', updatedAt: 1000 };
  let last = mergeDisplayState(null, initial);
  last = mergeDisplayState(last, { revision: '1', mediaVersion: 'hash', updatedAt: 2000 });
  assert.equal(last.snapshot, initial.snapshot);
  assert.equal(last.media, initial.media);
  const previous = last;
  try { last = mergeDisplayState(last, { revision: '2', mediaVersion: 'changed', updatedAt: 3000 }); } catch {}
  assert.equal(last, previous);
});
test('summary, break rotation, long tables and final screen', () => {
  const s = snapshot(); s.stage = 'summary';
  assert.equal(selectScreen(s, 0).kind, 'results');
  assert.equal(selectScreen(s, 12000).kind, 'overall');
  assert.equal(selectScreen(s, 24000).kind, 'next');
  s.stage = 'break'; s.overall = Array.from({ length: 20 }, () => ({}));
  assert.equal(selectScreen(s, 23000).kind, 'overall');
  assert.equal(selectScreen(s, 24000).kind, 'next');
  s.stage = 'end';
  assert.equal(selectScreen(s, 99999).title, 'KLASYFIKACJA KOŃCOWA');
});
test('app persist smoke: Live failure cannot change local save success or enter global error handler', () => {
  const code = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const persist = code.slice(code.indexOf('function persist({'), code.indexOf('\nfunction persistAndRender'));
  let saved = false, reported = false;
  const context = { state: { selectedCompetitorIds: [], eventHistory: [] }, buildScores: () => ({}),
    saveState: () => { saved = true; }, persistenceFailureReported: false,
    notifyLiveDisplay: () => { throw new Error('display failure'); }, reportPersistenceFailure: () => { reported = true; } };
  assert.equal(vm.runInNewContext(persist + '\npersist()', context), true);
  assert.equal(saved, true); assert.equal(reported, false);
  assert.ok(!/\bawait\b/.test(persist));
  assert.match(code, /import\('\.\/live-display\.js'\)[\s\S]*?\.catch\(\(\) => \{\}\)/);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes('display-(publish|state)'));
});
