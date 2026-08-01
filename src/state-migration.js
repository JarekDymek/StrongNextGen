const LEGACY_STATE_KEY = 'strongman-next.state.v1';
const LEGACY_CHECKPOINTS_KEY = 'strongman-next.checkpoints.v1';
const REGISTRY_KEY = 'strongman-next.competitions.v2';
const SHARED_COMPETITORS_KEY = 'strongman-next.shared-competitors.v1';

const toId = value => value === undefined || value === null || value === '' ? value : String(value);
const normalizeIds = values => Array.isArray(values) ? values.map(toId) : values;

export function normalizeStateIdentifiers(source) {
  if (!source || typeof source !== 'object') return source;
  const state = structuredClone(source);
  if (Array.isArray(state.competitors)) {
    state.competitors = state.competitors.map(item => ({ ...item, id: toId(item.id) }));
  }
  if (Array.isArray(state.events)) {
    state.events = state.events.map(item => ({ ...item, id: toId(item.id) }));
  }
  state.selectedCompetitorIds = normalizeIds(state.selectedCompetitorIds);
  state.selectedEventIds = normalizeIds(state.selectedEventIds);
  state.startOrderIds = normalizeIds(state.startOrderIds);
  state.initialStartOrderIds = normalizeIds(state.initialStartOrderIds);
  if (Array.isArray(state.eventHistory)) {
    state.eventHistory = state.eventHistory.map(event => ({
      ...event,
      eventId: toId(event.eventId),
      orderIds: normalizeIds(event.orderIds),
      results: Array.isArray(event.results)
        ? event.results.map(result => ({ ...result, id: toId(result.id) }))
        : event.results
    }));
  }
  return state;
}

function normalizeCheckpoints(checkpoints) {
  return Array.isArray(checkpoints)
    ? checkpoints.map(checkpoint => ({
        ...checkpoint,
        snapshot: normalizeStateIdentifiers(checkpoint.snapshot)
      }))
    : checkpoints;
}

function normalizeStoredJson(storage, key, transform) {
  const raw = storage.getItem(key);
  if (!raw) return;
  try {
    storage.setItem(key, JSON.stringify(transform(JSON.parse(raw))));
  } catch {
    // Uszkodzony JSON pozostaje bez zmian; aplikacja ma własne zabezpieczenia odczytu.
  }
}

function migrateStoredIdentifiers() {
  normalizeStoredJson(localStorage, LEGACY_STATE_KEY, normalizeStateIdentifiers);
  normalizeStoredJson(localStorage, LEGACY_CHECKPOINTS_KEY, normalizeCheckpoints);
  normalizeStoredJson(localStorage, SHARED_COMPETITORS_KEY, items =>
    Array.isArray(items) ? items.map(item => ({ ...item, id: toId(item.id) })) : items
  );

  let registry;
  try {
    registry = JSON.parse(localStorage.getItem(REGISTRY_KEY) || 'null');
  } catch {
    registry = null;
  }
  registry?.competitions?.forEach(item => {
    normalizeStoredJson(localStorage, `strongman-next.competition.${item.id}.state.v1`, normalizeStateIdentifiers);
    normalizeStoredJson(localStorage, `strongman-next.competition.${item.id}.checkpoints.v1`, normalizeCheckpoints);
  });
}

function guardDrawStageNavigation() {
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-action="go-stage"][data-stage="draw"]');
    if (!trigger) return;
    let state;
    try {
      state = JSON.parse(localStorage.getItem(LEGACY_STATE_KEY) || 'null');
    } catch {
      state = null;
    }
    if (!state?.initialStartOrderIds?.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.startOrderIds = [...state.initialStartOrderIds];
    state.stage = 'draw';
    localStorage.setItem(LEGACY_STATE_KEY, JSON.stringify(state));
    window.location.reload();
  }, true);
}

if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  migrateStoredIdentifiers();
  if (typeof document !== 'undefined') guardDrawStageNavigation();
}
