import assert from 'node:assert/strict';

class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

globalThis.Storage = FakeStorage;
globalThis.localStorage = new FakeStorage();
globalThis.sessionStorage = new FakeStorage();
localStorage.setItem('strongman-next.state.v1', JSON.stringify({
  schemaVersion: 1,
  eventName: 'Legacy Strong Man',
  competitors: [{ id: 1, name: 'Adam Test', residence: 'Gdańsk', photo: 'x' }],
  selectedCompetitorIds: ['1']
}));
localStorage.setItem('strongman-next.checkpoints.v1', JSON.stringify([{ id: 'cp', snapshot: { competitors: [{ id: 1, name: 'Adam Test' }] } }]));

globalThis.window = {
  location: { reload() {} },
  setTimeout,
  confirm: () => true,
  prompt: () => null
};
globalThis.document = {
  readyState: 'loading',
  documentElement: {},
  head: { append() {} },
  body: { append() {} },
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById() { return null; },
  createElement() { return { className: '', dataset: {}, style: {}, set id(v) { this._id = v; }, set textContent(v) { this._text = v; } }; }
};
globalThis.MutationObserver = class { observe() {} };
globalThis.queueMicrotask ??= fn => Promise.resolve().then(fn);

await import('../src/runtime.js');

const loaded = JSON.parse(localStorage.getItem('strongman-next.state.v1'));
assert.equal(loaded.eventName, 'Legacy Strong Man');
assert.equal(loaded.competitors.length, 1);
assert.equal(loaded.competitors[0].id, '1');
assert.equal(localStorage.map.has('strongman-next.state.v1'), false);
assert.ok([...localStorage.map.keys()].some(key => key.includes('.state.v1')));

loaded.competitors[0].residence = 'Malbork';
loaded.eventName = 'Strong Man A';
localStorage.setItem('strongman-next.state.v1', JSON.stringify(loaded));
const reloaded = JSON.parse(localStorage.getItem('strongman-next.state.v1'));
assert.equal(reloaded.competitors[0].residence, 'Malbork');
assert.equal(reloaded.eventName, 'Strong Man A');

const checkpoints = JSON.parse(localStorage.getItem('strongman-next.checkpoints.v1'));
assert.equal(checkpoints[0].snapshot.competitors[0].name, 'Adam Test');
const rawCheckpoint = [...localStorage.map.entries()].find(([key]) => key.includes('.checkpoints.v1'))[1];
assert.equal(JSON.parse(rawCheckpoint)[0].snapshot.competitors, undefined);

console.log('Runtime storage smoke test passed');
