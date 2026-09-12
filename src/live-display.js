import { buildPublicDisplaySnapshot } from './public-display-snapshot.js';
import { createLivePublisher } from './live-display-transport.js';

const SESSION_KEY = 'strongman-next.live-display.v1';
export async function displayRequest(url, body, token = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error('live-unavailable');
    return await response.json();
  } finally { clearTimeout(timer); }
}

export function mountLiveDisplay({ getState, getOrder }) {
  const configured = document.querySelector('meta[name="strongman-results-endpoint"]')?.content;
  const origin = configured ? new URL(configured).origin : location.origin;
  const endpoint = origin + '/api/display-publish';
  const panel = document.createElement('details');
  panel.style.cssText = 'margin:16px auto;padding:12px;max-width:900px;background:#10233b;color:white;border-radius:12px';
  panel.innerHTML = '<summary>Live Display — telebim</summary><p data-live-status>Live Display: wyłączono</p>' +
    '<button type="button" data-live-start>Uruchom sesję</button> ' +
    '<button type="button" data-live-send hidden>Wyślij teraz</button> ' +
    '<button type="button" data-live-break hidden>Przerwa</button> ' +
    '<button type="button" data-live-stop hidden>Zatrzymaj transmisję</button>' +
    '<p data-live-room></p><a data-live-link target="_blank" rel="noopener" style="color:#ffe12c;overflow-wrap:anywhere"></a>';
  document.body.append(panel);
  const el = name => panel.querySelector('[data-live-' + name + ']');
  let session, publisher, mode = 'auto', activeId = '', lastIndex, previousResults = {};
  let lastSync = 0, starting = false, generation = 0;
  function readSnapshot() {
    const state = getState();
    if (lastIndex !== state.currentEventIndex) { mode = 'auto'; activeId = ''; previousResults = {}; }
    lastIndex = state.currentEventIndex;
    const eventId = state.selectedEventIds[lastIndex];
    const draft = state.drafts?.[eventId] || {};
    for (const [id, value] of Object.entries(draft)) {
      if (previousResults[id] !== value) activeId = id;
    }
    previousResults = { ...draft };
    el('break').textContent = mode === 'break' ? 'Wznów LIVE' : 'Przerwa';
    return buildPublicDisplaySnapshot(state, { orderIds: getOrder(), mode, activeId });
  }
  function connect(nextSession) {
    session = nextSession;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
    const link = origin + '/display/?room=' + encodeURIComponent(session.room);
    el('room').textContent = 'Kod sesji: ' + session.room;
    el('link').href = link;
    el('link').textContent = link;
    el('start').hidden = true;
    ['send', 'break', 'stop'].forEach(name => el(name).hidden = false);
    const currentGeneration = ++generation;
    publisher = createLivePublisher({
      readSnapshot,
      send: payload => displayRequest(endpoint, { room: session.room, ...payload }, session.token),
      onStatus: value => {
        if (currentGeneration !== generation) return;
        if (value.syncedAt) lastSync = value.syncedAt;
        el('status').textContent = 'Live Display: ' + (value.connected ? 'połączono' :
          navigator.onLine === false ? 'brak sieci' : 'brak połączenia — ponawiam') +
          (lastSync ? ' · ostatnia synchronizacja: ' + new Date(lastSync).toLocaleTimeString('pl-PL') : '');
      }
    });
  }
  el('start').addEventListener('click', () => {
    if (starting) return;
    starting = true;
    el('start').disabled = true;
    el('status').textContent = 'Live Display: łączenie…';
    displayRequest(endpoint, { action: 'create' }).then(connect).catch(() => {
      el('status').textContent = 'Live Display: brak połączenia. Spróbuj ponownie.';
    }).finally(() => { starting = false; el('start').disabled = false; });
  });
  el('send').addEventListener('click', () => publisher?.notify());
  el('break').addEventListener('click', () => {
    mode = mode === 'break' ? 'auto' : 'break';
    publisher?.notify();
  });
  el('stop').addEventListener('click', () => {
    ++generation;
    publisher?.stop(); publisher = null; session = null;
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    el('start').hidden = false;
    ['send', 'break', 'stop'].forEach(name => el(name).hidden = true);
    el('status').textContent = 'Live Display: wyłączono';
  });
  window.addEventListener('online', () => publisher?.notify());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) publisher?.notify();
  });
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (/^[A-Z2-9]{10}$/.test(saved?.room) && /^[a-f0-9]{64}$/.test(saved?.token)) connect(saved);
  } catch {}
  return () => { try { publisher?.notify(); } catch {} };
}

