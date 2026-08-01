import { mergeCompetitorRecords, normalizeCompetitorName, normalizeImportedCompetitor } from './competitor-data.js';
import { advanceToNextNonFinalEvent, restoreInitialStartOrder, rewindLastEvent } from './competition-rules.js';

const STATE_KEY = 'strongman-next.state.v1';
const CHECKPOINTS_KEY = 'strongman-next.checkpoints.v1';
const REGISTRY_KEY = 'strongman-next.competitions.v2';
const SHARED_COMPETITORS_KEY = 'strongman-next.shared-competitors.v1';
const SESSION_ACTIVE_KEY = 'strongman-next.active-competition.v2';
const FLASH_KEY = 'strongman-next.runtime-flash';

if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof Storage !== 'undefined') {
  initRuntime();
}

function initRuntime() {
  const nativeStorage = {
    getItem: Storage.prototype.getItem,
    setItem: Storage.prototype.setItem,
    removeItem: Storage.prototype.removeItem
  };

  const rawGet = key => nativeStorage.getItem.call(localStorage, key);
  const rawSet = (key, value) => nativeStorage.setItem.call(localStorage, key, value);
  const rawRemove = key => nativeStorage.removeItem.call(localStorage, key);
  let lastInjectedCompetitors = new Map();

  const parseJson = (raw, fallback) => {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const competitionStateKey = id => `strongman-next.competition.${id}.state.v1`;
  const competitionCheckpointsKey = id => `strongman-next.competition.${id}.checkpoints.v1`;
  const makeId = () => `competition-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  function loadRegistry() {
    const stored = parseJson(rawGet(REGISTRY_KEY), null);
    if (stored?.competitions?.length) return stored;

    const legacyState = parseJson(rawGet(STATE_KEY), null);
    const legacyCheckpoints = parseJson(rawGet(CHECKPOINTS_KEY), []);
    const id = makeId();
    const name = String(legacyState?.eventName || 'Zawody Strong Man').trim() || 'Zawody Strong Man';
    const registry = {
      version: 2,
      lastActiveId: id,
      competitions: [{ id, name, archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
    };

    if (legacyState?.competitors?.length) {
      saveSharedCompetitors(legacyState.competitors);
      delete legacyState.competitors;
    }
    rawSet(competitionStateKey(id), JSON.stringify(legacyState || {
      schemaVersion: 1,
      eventName: name,
      createdAt: new Date().toISOString()
    }));
    rawSet(competitionCheckpointsKey(id), JSON.stringify(stripCheckpointCompetitors(legacyCheckpoints)));
    rawSet(REGISTRY_KEY, JSON.stringify(registry));
    rawRemove(STATE_KEY);
    rawRemove(CHECKPOINTS_KEY);
    return registry;
  }

  function saveRegistry(registry) {
    rawSet(REGISTRY_KEY, JSON.stringify(registry));
  }

  function currentCompetitionId() {
    const registry = loadRegistry();
    const sessionId = sessionStorage.getItem(SESSION_ACTIVE_KEY);
    const valid = registry.competitions.some(item => item.id === sessionId);
    const id = valid
      ? sessionId
      : registry.competitions.find(item => item.id === registry.lastActiveId)?.id
        || registry.competitions.find(item => !item.archived)?.id
        || registry.competitions[0].id;
    sessionStorage.setItem(SESSION_ACTIVE_KEY, id);
    return id;
  }

  function loadSharedCompetitors() {
    const parsed = parseJson(rawGet(SHARED_COMPETITORS_KEY), []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function saveSharedCompetitors(items) {
    const normalized = items.map((item, index) => normalizeImportedCompetitor(item, index)).filter(Boolean);
    rawSet(SHARED_COMPETITORS_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function snapshotCompetitors(items) {
    lastInjectedCompetitors = new Map(items.map(item => [normalizeCompetitorName(item.name), structuredClone(item)]));
  }

  function mergeIntentionalCompetitorChanges(incomingItems) {
    const current = loadSharedCompetitors();
    if (!current.length) {
      const saved = saveSharedCompetitors(incomingItems);
      snapshotCompetitors(incomingItems);
      return saved;
    }

    const currentByName = new Map(current.map(item => [normalizeCompetitorName(item.name), item]));
    const fields = ['name', 'category', 'categories', 'birthDate', 'residence', 'height', 'weight', 'notes', 'photo'];
    let changed = false;

    incomingItems.map((item, index) => normalizeImportedCompetitor(item, index)).filter(Boolean).forEach(incoming => {
      const key = normalizeCompetitorName(incoming.name);
      const injectedEntry = [...lastInjectedCompetitors.entries()].find(([snapshotKey, item]) =>
        snapshotKey === key || String(item.id) === String(incoming.id)
      );
      const injected = injectedEntry?.[1];
      const currentEntry = [...currentByName.entries()].find(([currentKey, item]) =>
        currentKey === key || String(item.id) === String(incoming.id)
      );
      const existingKey = currentEntry?.[0];
      const existing = currentEntry?.[1];
      if (!existing) {
        currentByName.set(key, incoming);
        changed = true;
        return;
      }
      if (!injected) return;

      const next = { ...existing, id: existing.id };
      fields.forEach(field => {
        const incomingValue = incoming[field];
        const injectedValue = injected[field];
        const differs = JSON.stringify(incomingValue ?? '') !== JSON.stringify(injectedValue ?? '');
        if (differs) next[field] = incomingValue;
      });
      if (JSON.stringify(next) !== JSON.stringify(existing) || existingKey !== key) {
        if (existingKey !== key) currentByName.delete(existingKey);
        currentByName.set(key, next);
        changed = true;
      }
    });

    const merged = [...currentByName.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' }));
    if (changed) rawSet(SHARED_COMPETITORS_KEY, JSON.stringify(merged));
    snapshotCompetitors(incomingItems);
    return merged;
  }

  function injectCompetitorsIntoState(rawState) {
    const state = parseJson(rawState, null);
    if (!state) return null;
    const shared = loadSharedCompetitors();
    if (shared.length) state.competitors = shared;
    snapshotCompetitors(state.competitors || shared);
    return JSON.stringify(state);
  }

  function stripCompetitorsFromState(rawState) {
    const state = parseJson(rawState, null);
    if (!state) return rawState;
    if (Array.isArray(state.competitors)) mergeIntentionalCompetitorChanges(state.competitors);
    delete state.competitors;
    return JSON.stringify(state);
  }

  function stripCheckpointCompetitors(checkpoints) {
    return (Array.isArray(checkpoints) ? checkpoints : []).map(checkpoint => {
      const copy = structuredClone(checkpoint);
      if (copy.snapshot?.competitors) delete copy.snapshot.competitors;
      return copy;
    });
  }

  function injectCheckpointCompetitors(raw) {
    const checkpoints = parseJson(raw, []);
    const shared = loadSharedCompetitors();
    if (!shared.length) return JSON.stringify(checkpoints);
    return JSON.stringify(checkpoints.map(checkpoint => ({
      ...checkpoint,
      snapshot: { ...(checkpoint.snapshot || {}), competitors: shared }
    })));
  }

  function syncCompetitionName(state) {
    const name = String(state?.eventName || '').trim();
    if (!name) return;
    const id = currentCompetitionId();
    const registry = loadRegistry();
    const item = registry.competitions.find(entry => entry.id === id);
    if (!item || item.name === name) return;
    item.name = name;
    item.updatedAt = new Date().toISOString();
    saveRegistry(registry);
  }

  Storage.prototype.getItem = function patchedGetItem(key) {
    if (this !== localStorage) return nativeStorage.getItem.call(this, key);
    const id = currentCompetitionId();
    if (key === STATE_KEY) return injectCompetitorsIntoState(rawGet(competitionStateKey(id)));
    if (key === CHECKPOINTS_KEY) return injectCheckpointCompetitors(rawGet(competitionCheckpointsKey(id)) || '[]');
    return nativeStorage.getItem.call(this, key);
  };

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    if (this !== localStorage) return nativeStorage.setItem.call(this, key, value);
    const id = currentCompetitionId();
    if (key === STATE_KEY) {
      const parsed = parseJson(value, null);
      if (parsed) syncCompetitionName(parsed);
      return rawSet(competitionStateKey(id), stripCompetitorsFromState(value));
    }
    if (key === CHECKPOINTS_KEY) {
      const checkpoints = stripCheckpointCompetitors(parseJson(value, []));
      return rawSet(competitionCheckpointsKey(id), JSON.stringify(checkpoints));
    }
    return nativeStorage.setItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    if (this !== localStorage) return nativeStorage.removeItem.call(this, key);
    const id = currentCompetitionId();
    if (key === STATE_KEY) return rawRemove(competitionStateKey(id));
    if (key === CHECKPOINTS_KEY) return rawRemove(competitionCheckpointsKey(id));
    return nativeStorage.removeItem.call(this, key);
  };

  loadRegistry();
  currentCompetitionId();

  function loadActiveState() {
    return parseJson(localStorage.getItem(STATE_KEY), null);
  }

  function saveActiveState(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  document.addEventListener('click', event => {
    const actionTarget = event.target.closest('[data-action]');
    const action = actionTarget?.dataset.action;

    if (action === 'next-event') {
      const state = loadActiveState();
      const advanced = advanceToNextNonFinalEvent(state);
      if (advanced) {
        event.preventDefault();
        event.stopImmediatePropagation();
        saveActiveState(advanced);
        window.location.reload();
        return;
      }
    }

    if (action === 'undo-event') {
      const state = loadActiveState();
      const rewound = rewindLastEvent(state);
      if (rewound) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (window.confirm('Cofnąć ostatnie podsumowanie konkurencji? Wpisane wyniki zostaną w formularzu.')) {
          saveActiveState(rewound);
          window.location.reload();
        }
        return;
      }
    }

    if (action === 'go-draw') {
      const state = loadActiveState();
      if (state?.initialStartOrderIds?.length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        saveActiveState(restoreInitialStartOrder(state, 'draw'));
        window.location.reload();
        return;
      }
    }

    if (action === 'import-competitors') {
      event.preventDefault();
      event.stopImmediatePropagation();
      importCompetitorsFile();
      return;
    }

    const profileButton = event.target.closest('[data-runtime-profile]');
    const avatar = event.target.closest('.avatar');
    if (profileButton || avatar) {
      const id = profileButton?.dataset.runtimeProfile || competitorIdFromElement(avatar);
      if (id) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openCompetitorProfile(id);
        return;
      }
    }

    if (event.target.closest('[data-runtime-competitions]')) {
      event.preventDefault();
      openCompetitionManager();
      return;
    }

    const competitionAction = event.target.closest('[data-runtime-competition-action]');
    if (competitionAction) {
      event.preventDefault();
      handleCompetitionAction(competitionAction.dataset.runtimeCompetitionAction, competitionAction.dataset.id);
      return;
    }

    if (event.target.closest('[data-runtime-close]')) closeRuntimeModal();
  }, true);

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-action="start-competition"]');
    if (!trigger) return;
    window.setTimeout(() => {
      const state = loadActiveState();
      if (!state?.startOrderIds?.length) return;
      state.initialStartOrderIds = [...state.startOrderIds];
      saveActiveState(state);
    }, 0);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeRuntimeModal();
  });

  async function importCompetitorsFile() {
    const file = await pickJsonFile();
    if (!file) return;
    let json;
    try {
      json = JSON.parse(await file.text());
    } catch {
      showRuntimeToast('Plik nie zawiera prawidłowego JSON.');
      return;
    }
    const source = Array.isArray(json) ? json : json?.competitors;
    if (!Array.isArray(source)) {
      showRuntimeToast('Nie znaleziono tablicy zawodników w pliku.');
      return;
    }

    const result = mergeCompetitorRecords(loadSharedCompetitors(), source);
    if (!result.competitors.length) {
      showRuntimeToast('Nie znaleziono prawidłowych rekordów zawodników.');
      return;
    }
    saveSharedCompetitors(result.competitors);
    sessionStorage.setItem(FLASH_KEY, `Import zakończony: dodano ${result.added}, zaktualizowano ${result.updated}, bez zmian ${result.unchanged}.`);
    window.location.reload();
  }

  function pickJsonFile() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
      input.click();
    });
  }

  function competitorIdFromElement(element) {
    if (!element) return '';
    return element.closest('[data-action="toggle-competitor"]')?.dataset.id
      || element.closest('.result-card')?.querySelector('[data-result]')?.dataset.result
      || '';
  }

  function openCompetitorProfile(id) {
    const state = loadActiveState();
    const competitor = state?.competitors?.find(item => String(item.id) === String(id));
    if (!competitor) return showRuntimeToast('Nie znaleziono danych zawodnika.');
    const categories = competitor.categories?.length ? competitor.categories.join(', ') : competitor.category;
    const age = calculateAge(competitor.birthDate);
    const facts = [
      ['Data urodzenia', formatBirthDate(competitor.birthDate)],
      ['Wiek', age === null ? '' : `${age} lat`],
      ['Miejsce zamieszkania', competitor.residence],
      ['Wzrost', competitor.height ? `${competitor.height} cm` : ''],
      ['Waga', competitor.weight ? `${competitor.weight} kg` : ''],
      ['Kategoria', categories]
    ].filter(([, value]) => String(value || '').trim());

    openRuntimeModal(`
      <section class="runtime-profile">
        <button type="button" class="runtime-close" data-runtime-close aria-label="Zamknij">×</button>
        <div class="runtime-profile__head">
          <div class="runtime-profile__photo">${competitor.photo ? `<img src="${escapeAttr(competitor.photo)}" alt="${escapeAttr(competitor.name)}">` : escapeHtml(initials(competitor.name))}</div>
          <div><span class="runtime-kicker">Profil zawodnika</span><h2>${escapeHtml(competitor.name)}</h2></div>
        </div>
        ${facts.length ? `<dl class="runtime-facts">${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : ''}
        ${competitor.notes ? `<div class="runtime-notes"><h3>Osiągnięcia i informacje</h3><p>${escapeHtml(competitor.notes).replaceAll('\n', '<br>')}</p></div>` : ''}
      </section>
    `);
  }

  function calculateAge(value) {
    if (!value) return null;
    const birth = new Date(`${value}T00:00:00`);
    if (Number.isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const beforeBirthday = today.getMonth() < birth.getMonth()
      || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
    if (beforeBirthday) age -= 1;
    return age >= 0 ? age : null;
  }

  function formatBirthDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pl-PL');
  }

  function openCompetitionManager() {
    const registry = loadRegistry();
    const activeId = currentCompetitionId();
    const rows = registry.competitions.map(item => `
      <article class="runtime-competition-row ${item.id === activeId ? 'is-active' : ''} ${item.archived ? 'is-archived' : ''}">
        <div><strong>${escapeHtml(item.name)}</strong><small>${item.id === activeId ? 'Aktywne w tej karcie' : item.archived ? 'Archiwalne' : 'Dostępne'}</small></div>
        <div class="runtime-row-actions">
          ${item.id === activeId ? '' : `<button type="button" data-runtime-competition-action="activate" data-id="${escapeAttr(item.id)}">Otwórz</button>`}
          <button type="button" data-runtime-competition-action="rename" data-id="${escapeAttr(item.id)}">Zmień nazwę</button>
          <button type="button" data-runtime-competition-action="duplicate" data-id="${escapeAttr(item.id)}">Kopiuj</button>
          <button type="button" data-runtime-competition-action="archive" data-id="${escapeAttr(item.id)}">${item.archived ? 'Przywróć' : 'Archiwizuj'}</button>
          <button type="button" class="is-danger" data-runtime-competition-action="delete" data-id="${escapeAttr(item.id)}">Usuń</button>
        </div>
      </article>
    `).join('');

    openRuntimeModal(`
      <section class="runtime-manager">
        <button type="button" class="runtime-close" data-runtime-close aria-label="Zamknij">×</button>
        <span class="runtime-kicker">Niezależne stany i backupy</span>
        <h2>Zawody</h2>
        <p>Każda karta przeglądarki może prowadzić inną imprezę. Baza zawodników jest wspólna.</p>
        <button type="button" class="runtime-create" data-runtime-competition-action="create">Utwórz nowe zawody</button>
        <div class="runtime-competition-list">${rows}</div>
      </section>
    `);
  }

  function handleCompetitionAction(action, id) {
    const registry = loadRegistry();
    const item = registry.competitions.find(entry => entry.id === id);

    if (action === 'create') {
      const name = window.prompt('Nazwa nowych zawodów:', 'Strong Women');
      if (!name?.trim()) return;
      const newId = makeId();
      const now = new Date().toISOString();
      registry.competitions.push({ id: newId, name: name.trim(), archived: false, createdAt: now, updatedAt: now });
      registry.lastActiveId = newId;
      saveRegistry(registry);
      rawSet(competitionStateKey(newId), JSON.stringify({ schemaVersion: 1, eventName: name.trim(), createdAt: now }));
      rawSet(competitionCheckpointsKey(newId), '[]');
      sessionStorage.setItem(SESSION_ACTIVE_KEY, newId);
      window.location.reload();
      return;
    }

    if (!item) return;

    if (action === 'activate') {
      item.archived = false;
      registry.lastActiveId = item.id;
      item.updatedAt = new Date().toISOString();
      saveRegistry(registry);
      sessionStorage.setItem(SESSION_ACTIVE_KEY, item.id);
      window.location.reload();
      return;
    }

    if (action === 'rename') {
      const name = window.prompt('Nowa nazwa zawodów:', item.name);
      if (!name?.trim()) return;
      item.name = name.trim();
      item.updatedAt = new Date().toISOString();
      const state = parseJson(rawGet(competitionStateKey(item.id)), { schemaVersion: 1 });
      state.eventName = item.name;
      rawSet(competitionStateKey(item.id), JSON.stringify(state));
      saveRegistry(registry);
      if (item.id === currentCompetitionId()) window.location.reload();
      else openCompetitionManager();
      return;
    }

    if (action === 'duplicate') {
      const name = window.prompt('Nazwa kopii zawodów:', `Kopia – ${item.name}`);
      if (!name?.trim()) return;
      const newId = makeId();
      const now = new Date().toISOString();
      const state = parseJson(rawGet(competitionStateKey(item.id)), { schemaVersion: 1 });
      state.eventName = name.trim();
      state.createdAt = now;
      state.savedAt = null;
      rawSet(competitionStateKey(newId), JSON.stringify(state));
      rawSet(competitionCheckpointsKey(newId), rawGet(competitionCheckpointsKey(item.id)) || '[]');
      registry.competitions.push({ id: newId, name: name.trim(), archived: false, createdAt: now, updatedAt: now });
      saveRegistry(registry);
      openCompetitionManager();
      return;
    }

    if (action === 'archive') {
      const wasActive = item.id === currentCompetitionId();
      item.archived = !item.archived;
      item.updatedAt = new Date().toISOString();
      if (item.archived && wasActive) {
        let next = registry.competitions.find(entry => entry.id !== item.id && !entry.archived);
        if (!next) {
          const newId = makeId();
          const now = new Date().toISOString();
          next = { id: newId, name: 'Nowe zawody', archived: false, createdAt: now, updatedAt: now };
          registry.competitions.push(next);
          rawSet(competitionStateKey(newId), JSON.stringify({ schemaVersion: 1, eventName: next.name, createdAt: now }));
          rawSet(competitionCheckpointsKey(newId), '[]');
        }
        registry.lastActiveId = next.id;
        sessionStorage.setItem(SESSION_ACTIVE_KEY, next.id);
      }
      saveRegistry(registry);
      if (wasActive) window.location.reload();
      else openCompetitionManager();
      return;
    }

    if (action === 'delete') {
      if (registry.competitions.length === 1) return showRuntimeToast('Nie można usunąć jedynych zawodów.');
      if (!window.confirm(`Usunąć zawody „${item.name}” wraz z wynikami i punktami kontrolnymi?`)) return;
      registry.competitions = registry.competitions.filter(entry => entry.id !== item.id);
      rawRemove(competitionStateKey(item.id));
      rawRemove(competitionCheckpointsKey(item.id));
      if (item.id === currentCompetitionId()) {
        const next = registry.competitions.find(entry => !entry.archived) || registry.competitions[0];
        registry.lastActiveId = next.id;
        sessionStorage.setItem(SESSION_ACTIVE_KEY, next.id);
        saveRegistry(registry);
        window.location.reload();
      } else {
        saveRegistry(registry);
        openCompetitionManager();
      }
    }
  }

  function openRuntimeModal(content) {
    closeRuntimeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'runtime-backdrop';
    backdrop.dataset.runtimeModal = 'true';
    backdrop.innerHTML = `<div class="runtime-modal">${content}</div>`;
    document.body.append(backdrop);
  }

  function closeRuntimeModal() {
    document.querySelector('[data-runtime-modal]')?.remove();
  }

  function enhanceDom() {
    const topbar = document.querySelector('.topbar');
    if (topbar && !topbar.querySelector('[data-runtime-competitions]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'runtime-competition-button';
      button.dataset.runtimeCompetitions = 'true';
      button.textContent = `Zawody: ${activeCompetitionName()}`;
      topbar.querySelector('.settings-button')?.before(button);
    }

    document.querySelectorAll('.selection-item').forEach(row => {
      const id = row.querySelector('[data-action="toggle-competitor"]')?.dataset.id;
      const actions = row.querySelector('.item-actions');
      if (id && actions && !actions.querySelector('[data-runtime-profile]')) {
        actions.insertAdjacentHTML('afterbegin', `<button type="button" class="mini-button runtime-info-button" data-runtime-profile="${escapeAttr(id)}" aria-label="Informacje o zawodniku">i</button>`);
      }
    });

    document.querySelectorAll('.result-card').forEach(card => {
      const id = card.querySelector('[data-result]')?.dataset.result;
      const header = card.querySelector('header');
      if (id && header && !header.querySelector('[data-runtime-profile]')) {
        header.insertAdjacentHTML('beforeend', `<button type="button" class="runtime-score-info" data-runtime-profile="${escapeAttr(id)}" aria-label="Informacje o zawodniku">i</button>`);
      }
    });

    document.querySelectorAll('.avatar').forEach(avatar => {
      avatar.classList.add('runtime-avatar-action');
      avatar.setAttribute('title', 'Pokaż profil zawodnika');
    });
  }

  function activeCompetitionName() {
    const registry = loadRegistry();
    return registry.competitions.find(item => item.id === currentCompetitionId())?.name || 'Zawody';
  }

  function showRuntimeToast(message) {
    const toast = document.createElement('div');
    toast.className = 'runtime-toast';
    toast.textContent = message;
    document.body.append(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 250);
    }, 3400);
  }

  function installStyles() {
    if (document.getElementById('strongman-runtime-styles')) return;
    const style = document.createElement('style');
    style.id = 'strongman-runtime-styles';
    style.textContent = `
      .runtime-competition-button{margin-left:auto;max-width:42vw;border:2px solid currentColor;border-radius:999px;background:#fff;color:#0b1f36;font-weight:900;padding:.65rem .85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .outdoor-mode .runtime-competition-button{background:#fff;color:#000;border-width:3px}.runtime-avatar-action{cursor:pointer}.runtime-info-button,.runtime-score-info{font-weight:1000!important;border-radius:50%!important;min-width:2.25rem!important;width:2.25rem;height:2.25rem;padding:0!important}
      .runtime-score-info{margin-left:auto;border:2px solid currentColor;background:#fff;color:#0b1f36;font-size:1rem}.runtime-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(2,8,23,.82);display:flex;align-items:center;justify-content:center;padding:1rem}.runtime-modal{position:relative;width:min(760px,100%);max-height:92vh;overflow:auto;background:#fff;color:#111827;border-radius:22px;box-shadow:0 24px 80px rgba(0,0,0,.45);padding:1.25rem}.runtime-close{position:absolute;right:.75rem;top:.55rem;border:0;background:transparent;font-size:2rem;line-height:1;cursor:pointer}.runtime-kicker{display:block;text-transform:uppercase;letter-spacing:.08em;font-weight:900;font-size:.75rem;color:#475569}.runtime-profile__head{display:flex;gap:1rem;align-items:center;padding-right:2.5rem}.runtime-profile__head h2,.runtime-manager h2{margin:.2rem 0;font-size:clamp(1.5rem,5vw,2.4rem)}.runtime-profile__photo{width:112px;height:112px;border-radius:18px;overflow:hidden;display:grid;place-items:center;background:#e2e8f0;font-size:2rem;font-weight:900;flex:none}.runtime-profile__photo img{width:100%;height:100%;object-fit:cover}.runtime-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem;margin:1.25rem 0}.runtime-facts div{background:#f1f5f9;border-radius:14px;padding:.75rem}.runtime-facts dt{font-size:.75rem;font-weight:800;color:#475569}.runtime-facts dd{margin:.2rem 0 0;font-weight:900}.runtime-notes{border-top:2px solid #e2e8f0;padding-top:1rem}.runtime-notes h3{margin:0 0 .5rem}.runtime-notes p{line-height:1.45;margin:0}.runtime-manager>p{color:#475569}.runtime-create{width:100%;padding:.9rem;border:0;border-radius:14px;background:#0b1f36;color:#fff;font-weight:900;font-size:1rem}.runtime-competition-list{display:grid;gap:.75rem;margin-top:1rem}.runtime-competition-row{border:2px solid #cbd5e1;border-radius:16px;padding:.8rem}.runtime-competition-row.is-active{border-color:#0b1f36;background:#f8fafc}.runtime-competition-row.is-archived{opacity:.65}.runtime-competition-row>div:first-child{display:flex;justify-content:space-between;gap:.75rem}.runtime-competition-row small{color:#64748b}.runtime-row-actions{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.7rem}.runtime-row-actions button{border:1px solid #94a3b8;border-radius:10px;background:#fff;padding:.5rem .65rem;font-weight:800}.runtime-row-actions .is-danger{color:#b91c1c;border-color:#ef4444}.runtime-toast{position:fixed;left:50%;bottom:1rem;z-index:12000;transform:translate(-50%,140%);background:#0f172a;color:#fff;padding:.8rem 1rem;border-radius:12px;font-weight:800;max-width:calc(100vw - 2rem);transition:transform .2s ease}.runtime-toast.is-visible{transform:translate(-50%,0)}
      @media(max-width:640px){.topbar{flex-wrap:wrap}.runtime-competition-button{order:3;max-width:100%;width:100%;margin:.5rem 0 0}.runtime-facts{grid-template-columns:1fr}.runtime-profile__photo{width:88px;height:88px}.runtime-modal{padding:1rem}.runtime-competition-row>div:first-child{display:block}.runtime-competition-row small{display:block;margin-top:.2rem}}
    `;
    document.head.append(style);
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  }

  function escapeHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  installStyles();
  const observer = new MutationObserver(() => queueMicrotask(enhanceDom));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceDom, { once: true });
  else enhanceDom();

  const flash = sessionStorage.getItem(FLASH_KEY);
  if (flash) {
    sessionStorage.removeItem(FLASH_KEY);
    window.setTimeout(() => showRuntimeToast(flash), 250);
  }
}
