import { mergeDisplayState, selectScreen } from './state.js';
const $ = id => document.getElementById(id);
const room = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
if (/^[A-Z2-9]{10}$/.test(room)) start(room);
else $('pair').addEventListener('submit', event => {
  event.preventDefault();
  location.search = '?room=' + encodeURIComponent($('room').value.trim().toUpperCase());
});

function start(room) {
  $('pair').hidden = true;
  $('screen').hidden = false;
  const cacheKey = 'strongman.display.' + room;
  let last, stageKey = '', stageAt = Date.now(), failed = false;
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey));
    if (saved) last = mergeDisplayState(null, saved);
  } catch {}
  function render() {
    if (!last) {
      $('event').textContent = 'STRONGMAN';
      $('title').textContent = 'Oczekiwanie na transmisję';
      $('status').textContent = 'Sesja ' + room + ' · uruchom Live Display na iPadzie';
      return;
    }
    const { snapshot: snapshot, media } = last;
    const key = snapshot.stage + ':' + snapshot.current.number;
    if (key !== stageKey) { stageKey = key; stageAt = Date.now(); }
    const elapsed = Date.now() - stageAt;
    const screen = selectScreen(snapshot, elapsed);
    $('event').textContent = snapshot.eventName;
    $('location').textContent = [snapshot.eventLocation, snapshot.eventDate].filter(Boolean).join(' · ');
    $('event-number').textContent = 'Konkurencja ' + snapshot.current.number + ' z ' + snapshot.eventCount;
    $('title').textContent = screen.title || 'Zawody Strongman';
    const logo = media.logo || '../assets/logo-strong-man.png';
    if ($('logo').getAttribute('src') !== logo) {
      $('logo').src = logo; $('watermark').src = logo;
    }
    $('phase').textContent = snapshot.stage === 'end' ? 'KONIEC ZAWODÓW' :
      screen.kind === 'live' ? 'LIVE' : screen.kind === 'results' ? 'WYNIKI KONKURENCJI' : 'PRZERWA';
    $('status').textContent = failed || Date.now() - last.updatedAt > 6000 ? 'Oczekiwanie na aktualizację' : '';
    const content = $('content');
    content.replaceChildren();
    $('page').textContent = '';
    if (screen.kind === 'next') {
      const card = document.createElement('div'); card.className = 'next';
      const number = document.createElement('small'); number.textContent = 'KONKURENCJA ' + screen.event.number;
      const name = document.createElement('div'); name.textContent = screen.event.name;
      card.append(number, name); content.append(card); return;
    }
    const rows = screen.rows || [];
    if (!rows.length) {
      const message = document.createElement('p'); message.className = 'waiting';
      message.textContent = 'Oczekiwanie na wyniki'; content.append(message); return;
    }
    const pages = Math.ceil(rows.length / 8);
    const page = Math.floor((screen.pageElapsed ?? elapsed) / 8000) % pages;
    if (pages > 1) $('page').textContent = (page + 1) + ' / ' + pages;
    const table = document.createElement('table');
    table.className = screen.kind;
    const head = table.createTHead().insertRow();
    const columns = screen.kind === 'live' ? ['Start', 'Foto', 'Zawodnik', 'Wynik'] :
      screen.kind === 'results' ? ['Miejsce', 'Foto', 'Zawodnik', 'Wynik', 'Punkty'] : ['Miejsce', 'Foto', 'Zawodnik', 'Punkty'];
    for (const label of columns) { const th = document.createElement('th'); th.textContent = label; head.append(th); }
    const body = table.createTBody();
    for (const row of rows.slice(page * 8, page * 8 + 8)) {
      const tr = body.insertRow();
      if (screen.kind === 'live' && row.id === snapshot.activeId) tr.className = 'active';
      tr.insertCell().textContent = screen.kind === 'live' ? row.start : row.place;
      const photo = tr.insertCell();
      if (media.photos[row.id]) {
        const img = document.createElement('img'); img.className = 'portrait';
        img.src = media.photos[row.id]; img.alt = ''; img.addEventListener('error', () => img.remove(), { once: true });
        photo.append(img);
      }
      const name = tr.insertCell(); name.className = 'name'; name.textContent = row.name;
      if (screen.kind !== 'overall') tr.insertCell().textContent = row.result;
      if (screen.kind !== 'live') tr.insertCell().textContent = Number(row.points).toLocaleString('pl-PL', { maximumFractionDigits: 2 });
    }
    content.append(table);
  }
  async function poll() {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const query = new URLSearchParams({ room, revision: last?.revision || '', mediaVersion: last?.mediaVersion || '' });
      const response = await fetch('../api/display-state?' + query, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('waiting');
      const next = mergeDisplayState(last, await response.json());
      if (!last || next.revision !== last.revision || next.mediaVersion !== last.mediaVersion) {
        try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch {}
      }
      last = next;
      failed = false;
    } catch { failed = true; }
    finally { clearTimeout(timeout); setTimeout(poll, Math.max(0, 1000 - (Date.now() - started))); }
  }
  render();
  setInterval(render, 1000);
  void poll();
}
