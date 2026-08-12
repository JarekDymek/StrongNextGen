import { APP_VERSION, BASE_REVISION, DEFAULT_COMPETITORS, DEFAULT_EVENTS, DEFAULT_SEASON, EVENT_TYPE_LABEL } from './data.js';
import { buildFinalStartOrder, buildNextStartOrder, buildScores, calculateEventPoints, rankStandings } from './scoring.js';
import { calculateSeasonStandings, formatSeasonDate, normalizeSeasonEvent, normalizeSeasonEvents, seasonPointsForPosition } from './season.js';
import { buildSeasonHtml } from './season-export.js';
import {
  competitorMatchesCategory,
  getCompetitorCategories,
  mergeCompetitorCollections,
  normalizeCategoryKey,
  normalizeCompetitorKey,
  normalizeCompetitorRecord,
  normalizeCompetitorRecords,
  remapCompetitionStateCompetitorIds,
  SYSTEM_COMPETITOR_CATEGORIES,
  upsertCompetitorRecord
} from './competitor-data.js';
import { estimateDataUrlBytes, processCompetitorPhoto } from './image-tools.js';
import { EMERGENCY_HELP_TOPICS, getEmergencyHelpTopics } from './help.js';
import {
  clearSavedState,
  consumeStorageWarnings,
  deleteCheckpoints,
  downloadJson,
  hasStorageWarning,
  loadCompetitorDatabase,
  loadCheckpoints,
  loadSeasonDatabase,
  loadSavedState,
  pickImageFile,
  pickJsonFile,
  pickSeasonFile,
  readJsonFile,
  readTextFile,
  saveCheckpoint,
  saveCompetitorDatabase,
  saveSeasonDatabase,
  saveState
} from './storage.js';

const app = document.getElementById('app');
const collator = new Intl.Collator('pl', { sensitivity: 'base' });
let deferredInstallPrompt = null;
let stopwatchTimer = null;
const recentActions = new Map();
const RAPID_ACTION_COOLDOWNS = new Map([
  ['toggle-competitor', 350],
  ['toggle-event', 350],
  ['start-competition', 800],
  ['finalize-event', 800],
  ['next-event', 800],
  ['undo-event', 800],
  ['save-checkpoint', 800],
  ['help-start-correction', 800],
  ['help-resume-current', 800],
  ['help-start-reorder', 800],
  ['help-finish-reorder', 800],
  ['confirm-competitor-submission', 800]
]);
const STAGES = ['setup', 'draw', 'scoring', 'summary', 'season'];
const STAGE_LABELS = {
  setup: 'Przygotowanie',
  draw: 'Kolejność',
  scoring: 'Wyniki',
  summary: 'Klasyfikacja',
  season: 'Sezon'
};
const STAGE_SHORT_LABELS = {
  setup: 'Start',
  draw: 'Kolej.',
  scoring: 'Wyniki',
  summary: 'Tabela',
  season: 'Sezon'
};

const savedStateAtStartup = loadSavedState();
const competitorDatabaseAtStartup = loadCompetitorDatabase();
const seasonDatabaseAtStartup = loadSeasonDatabase();
const competitorDatabaseReadFailed = hasStorageWarning('bazy zawodników');
const seasonDatabaseReadFailed = hasStorageWarning('klasyfikacji sezonu');
let state = hydrateState(savedStateAtStartup, competitorDatabaseAtStartup, seasonDatabaseAtStartup);
state.ui = createUiState();
let persistenceFailureReported = false;
if (!competitorDatabaseReadFailed) {
  try {
    saveCompetitorDatabase(state.competitors);
  } catch (error) {
    reportPersistenceFailure(error);
  }
}
if (!seasonDatabaseReadFailed) {
  try {
    saveSeasonDatabase(state.seasonEvents);
  } catch (error) {
    reportPersistenceFailure(error);
  }
}
if (isStandalone()) state.appInstalled = true;
render();
consumeStorageWarnings().forEach(warning => flash(warning));
registerServiceWorker();
initPwaInstall();

app.addEventListener('click', event => {
  handleClick(event).catch(error => reportUnexpectedError(error));
});
app.addEventListener('input', event => {
  try {
    handleInput(event);
  } catch (error) {
    reportUnexpectedError(error);
  }
});
app.addEventListener('change', event => {
  handleChange(event).catch(error => reportUnexpectedError(error));
});
app.addEventListener('submit', event => {
  try {
    handleSubmit(event);
  } catch (error) {
    reportUnexpectedError(error);
  }
});
app.addEventListener('toggle', handleToggle, true);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.ui.profileCompetitorId) closeCompetitorProfile();
  if (event.key === 'Escape' && state.ui.seasonEditor) closeSeasonEditor();
  if (event.key === 'Escape' && state.ui.competitorEditor) closeCompetitorEditor();
  if (event.key === 'Escape' && state.ui.competitorSubmission) closeCompetitorSubmission();
  if (event.key === 'Escape' && state.ui.emergencyHelp?.open) closeEmergencyHelp();
});

function createInitialState(competitorSource = DEFAULT_COMPETITORS) {
  const competitors = normalizeCompetitors(competitorSource);
  const events = normalizeEvents(DEFAULT_EVENTS);
  return {
    schemaVersion: 3,
    baseRevision: BASE_REVISION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    savedAt: null,
    eventName: 'Nowe zawody Strong Man',
    eventLocation: '',
    eventDate: '',
    backupEmail: '',
    finalistsLimit: 5,
    outdoorMode: true,
    appInstalled: false,
    logoData: null,
    competitors,
    events,
    selectedCompetitorIds: [],
    selectedEventIds: [],
    startOrderIds: [],
    drawUsed: false,
    stage: 'setup',
    currentEventIndex: 0,
    eventHistory: [],
    drafts: {},
    eventOrderOverrides: {},
    scores: {},
    seasonEvents: normalizeSeasonEvents(DEFAULT_SEASON.events),
    seasonMaxCountedStarts: DEFAULT_SEASON.maxCountedStarts || 4
  };
}

function createUiState() {
  return {
    resetOpen: false,
    sections: {
      competition: true,
      competitors: true,
      events: true,
      safety: false,
      help: false
    },
    installHelpOpen: false,
    profileCompetitorId: null,
    stopwatch: null,
    settingsOpen: false,
    drawAnimation: null,
    seasonEditor: null,
    competitorEditor: null,
    competitorSubmission: null,
    competitorSearch: '',
    competitorCategoryFilter: 'all',
    helpSearch: '',
    emergencyHelp: null
  };
}

function hydrateState(saved, durableDatabase = null, durableSeason = null) {
  const databaseSeed = Array.isArray(durableDatabase) ? durableDatabase : DEFAULT_COMPETITORS;
  const base = createInitialState(databaseSeed);
  base.seasonEvents = mergeSeasonEventCollections(base.seasonEvents, durableSeason);
  if (!saved || typeof saved !== 'object') return base;

  const recovered = mergeCompetitorCollections(base.competitors, saved.competitors || [], {
    mode: 'fillMissing',
    categoriesMode: 'fillMissing'
  });
  const migratedSaved = remapCompetitionStateCompetitorIds(saved, recovered.aliases);
  const selectedCompetitorIds = normalizeIdList(migratedSaved.selectedCompetitorIds);
  const selectedEventIds = normalizeIdList(migratedSaved.selectedEventIds);

  const next = {
    ...base,
    ...migratedSaved,
    eventName: stateString(migratedSaved.eventName, base.eventName),
    eventLocation: stateString(migratedSaved.eventLocation),
    eventDate: isValidIsoDate(stateString(migratedSaved.eventDate)) ? stateString(migratedSaved.eventDate) : '',
    backupEmail: stateString(migratedSaved.backupEmail),
    outdoorMode: typeof migratedSaved.outdoorMode === 'boolean' ? migratedSaved.outdoorMode : base.outdoorMode,
    appInstalled: Boolean(migratedSaved.appInstalled),
    logoData: validStoredLogo(migratedSaved.logoData),
    drawUsed: Boolean(migratedSaved.drawUsed),
    competitors: sortCompetitors(recovered.records),
    events: mergeBaseEvents(base.events, normalizeEvents(migratedSaved.events || [])),
    selectedCompetitorIds,
    selectedEventIds,
    startOrderIds: normalizeIdList(migratedSaved.startOrderIds),
    eventHistory: normalizeEventHistory(migratedSaved.eventHistory, selectedEventIds, recovered.records),
    drafts: normalizeDrafts(migratedSaved.drafts),
    eventOrderOverrides: normalizeEventOrderOverrides(migratedSaved.eventOrderOverrides),
    scores: {},
    seasonEvents: mergeSeasonEventCollections(base.seasonEvents, durableSeason, migratedSaved.seasonEvents),
    seasonMaxCountedStarts: Math.max(1, Number.parseInt(migratedSaved.seasonMaxCountedStarts, 10) || base.seasonMaxCountedStarts),
    baseRevision: BASE_REVISION,
    schemaVersion: 3
  };

  const competitorIds = new Set(next.competitors.map(competitor => competitor.id));
  const eventIds = new Set(next.events.map(event => event.id));
  next.selectedCompetitorIds = next.selectedCompetitorIds.filter(id => competitorIds.has(id));
  next.selectedEventIds = next.selectedEventIds.filter(id => eventIds.has(id));
  next.startOrderIds = next.startOrderIds.filter(id => competitorIds.has(id));
  next.eventOrderOverrides = Object.fromEntries(
    Object.entries(next.eventOrderOverrides)
      .filter(([eventId]) => eventIds.has(eventId))
      .map(([eventId, order]) => {
        const selectedOrder = order.filter(id => competitorIds.has(id) && next.selectedCompetitorIds.includes(id));
        const eventIndex = next.selectedEventIds.indexOf(eventId);
        const isFinal = next.selectedEventIds.length > 1 && eventIndex === next.selectedEventIds.length - 1;
        return [eventId, isFinal ? selectedOrder : reconcileOrder(selectedOrder, next.selectedCompetitorIds)];
      })
      .filter(([, order]) => order.length)
  );
  next.stage = STAGES.includes(next.stage) ? next.stage : 'setup';
  const importedEventIndex = Number.parseInt(next.currentEventIndex, 10);
  next.currentEventIndex = Math.max(0, Math.min(Number.isFinite(importedEventIndex) ? importedEventIndex : 0, Math.max(next.selectedEventIds.length - 1, 0)));
  next.finalistsLimit = Math.max(1, Number.parseInt(next.finalistsLimit, 10) || 5);
  next.scores = buildScores(next.selectedCompetitorIds, next.eventHistory);
  return next;
}

function stateString(value, fallback = '') {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : fallback;
}

function normalizeIdList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => stateString(item)).filter(Boolean))];
}

function normalizeDrafts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const drafts = {};
  Object.entries(value).forEach(([eventId, draft]) => {
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return;
    drafts[eventId] = Object.fromEntries(
      Object.entries(draft).map(([competitorId, result]) => [competitorId, stateString(result)])
    );
  });
  return drafts;
}

function normalizeEventOrderOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([eventId, order]) => [stateString(eventId), normalizeIdList(order)])
      .filter(([eventId, order]) => eventId && order.length)
  );
}

function normalizeEventHistory(value, selectedEventIds, competitors) {
  if (!Array.isArray(value)) return [];
  const names = new Map(competitors.map(competitor => [competitor.id, competitor.name]));
  return value.map((event, index) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
    const eventId = stateString(event.eventId || selectedEventIds[index] || `legacy-event-${index + 1}`);
    const results = (Array.isArray(event.results) ? event.results : []).map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const id = stateString(row.id);
      if (!id) return null;
      const pointsValue = Number.parseFloat(String(row.points ?? '').replace(',', '.'));
      const placeValue = row.place === '-' ? '-' : Number.parseInt(row.place, 10);
      return {
        ...row,
        id,
        name: stateString(row.name, names.get(id) || 'Zawodnik'),
        result: stateString(row.result),
        rawInput: stateString(row.rawInput ?? row.result),
        place: placeValue === '-' || (Number.isFinite(placeValue) && placeValue > 0) ? placeValue : '-',
        points: Number.isFinite(pointsValue) && pointsValue >= 0 ? pointsValue.toFixed(2) : '0.00',
        isDist: Boolean(row.isDist),
        isDnf: Boolean(row.isDnf)
      };
    }).filter(Boolean);
    if (!eventId || !results.length) return null;
    const orderIds = normalizeIdList(event.orderIds);
    results.forEach(row => {
      if (!orderIds.includes(row.id)) orderIds.push(row.id);
    });
    return {
      ...event,
      nr: index + 1,
      eventId,
      name: stateString(event.name, `Konkurencja ${index + 1}`),
      type: event.type === 'low' ? 'low' : 'high',
      isFinal: Boolean(event.isFinal),
      finalistsLimit: Number.isFinite(Number(event.finalistsLimit)) ? Number(event.finalistsLimit) : null,
      orderIds,
      createdAt: stateString(event.createdAt),
      results
    };
  }).filter(Boolean);
}

function validStoredLogo(value) {
  const logo = stateString(value);
  return /^data:image\/(?:jpe?g|png|webp|gif);base64,/i.test(logo) && logo.length <= 2_000_000 ? logo : null;
}

function normalizeCompetitors(items) {
  return sortCompetitors(normalizeCompetitorRecords(items).records);
}

function sortCompetitors(items) {
  return [...items].sort((a, b) => collator.compare(a.name, b.name));
}

function normalizeEvents(items) {
  const seen = new Set();
  return (items || [])
    .map((item, index) => {
      const source = typeof item === 'string' ? { name: item, type: 'high' } : item || {};
      const name = String(source.name || '').trim();
      const type = source.type === 'low' ? 'low' : 'high';
      if (!name) return null;
      const key = `${normalizeKey(name)}:${type}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        id: source.id || `event-${slug(name)}-${index}`,
        name,
        type
      };
    })
    .filter(Boolean)
    .sort((a, b) => collator.compare(a.name, b.name));
}

function mergeBaseEvents(baseEvents, savedEvents) {
  const byKey = new Map();
  [...baseEvents, ...savedEvents].forEach(eventItem => {
    const key = `${normalizeKey(eventItem.name)}:${eventItem.type}`;
    if (!key) return;
    byKey.set(key, { ...byKey.get(key), ...eventItem });
  });
  return [...byKey.values()].sort((a, b) => collator.compare(a.name, b.name));
}

function render() {
  applyEnvironment();
  document.documentElement.dataset.stage = state.stage;
  const eventTitle = state.eventName?.trim() || 'Nowe zawody';
  const showInstallAction = shouldShowInstallAction();
  const helpLocksNavigation = isHelpWorkflowActive();
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <img class="brand__logo" src="${escapeAttr(getLogoSrc())}" alt="Strong Man">
        <div class="brand__text">
          <span class="eyebrow">Strongman Next</span>
          <h1>${escapeHtml(eventTitle)}</h1>
          <p>${escapeHtml(stageSubtitle())}</p>
        </div>
      </div>
      <button class="icon-button settings-button" type="button" data-action="toggle-settings" aria-expanded="${state.ui.settingsOpen ? 'true' : 'false'}" aria-label="Menu aplikacji">☰</button>
    </header>

    ${renderQuickSettings(showInstallAction)}
    ${renderHelpGuidance()}

    <nav class="stepper" aria-label="Etapy zawodów">
      ${STAGES.map(stage => `
        <button type="button" class="step ${stage === state.stage ? 'is-active' : ''}" data-action="go-stage" data-stage="${stage}" ${helpLocksNavigation && stage !== state.stage ? 'disabled' : ''}>
          <span>${STAGES.indexOf(stage) + 1}</span>
          <b class="step-label-full">${STAGE_LABELS[stage]}</b>
          <b class="step-label-short">${STAGE_SHORT_LABELS[stage]}</b>
        </button>
      `).join('')}
    </nav>

    <main class="screen">
      ${renderStage()}
    </main>

    ${renderResetGuard()}
    ${renderInstallHelp()}
    ${renderCompetitorProfile()}
    ${renderCompetitorEditor()}
    ${renderCompetitorSubmission()}
    ${renderStopwatch()}
    ${renderSeasonEditor()}
    ${renderEmergencyHelp()}
  `;
  syncStopwatchTicker();
  applyCompetitorFilters();
}

function renderStage() {
  if (state.stage === 'draw') return renderDraw();
  if (state.stage === 'scoring') return renderScoring();
  if (state.stage === 'summary') return renderSummary();
  if (state.stage === 'season') return renderSeason();
  return renderSetup();
}

function renderQuickSettings(showInstallAction) {
  if (!state.ui.settingsOpen) return '';
  return `
    <section class="quick-settings" aria-label="Menu aplikacji">
      <button class="utility-button help-button" type="button" data-action="open-help">? Pomoc awaryjna</button>
      ${showInstallAction ? '<button class="utility-button install-button" type="button" data-action="install-app">Instaluj</button>' : ''}
      <button class="utility-button sun-button ${state.outdoorMode ? 'is-active' : ''}" type="button" data-action="toggle-outdoor">
        ${state.outdoorMode ? 'Słońce: włączone' : 'Słońce: wyłączone'}
      </button>
      <button class="utility-button update-button-inline" type="button" data-action="check-update">Sprawdź aktualizację</button>
    </section>
  `;
}

function helpContext() {
  const event = currentEvent();
  const draft = event ? state.drafts[event.id] || {} : {};
  return {
    stage: state.stage,
    currentEventIndex: state.currentEventIndex,
    selectedEventCount: state.selectedEventIds.length,
    historyCount: state.eventHistory.length,
    currentFinalized: Boolean(state.eventHistory[state.currentEventIndex]),
    currentDraftCount: Object.values(draft).filter(value => String(value || '').trim()).length,
    hasCheckpoints: loadCheckpoints().length > 0,
    online: navigator.onLine
  };
}

function renderHelpGuidance() {
  const session = state.ui.emergencyHelp;
  if (!session || session.open || session.phase === 'topics' || session.phase === 'overview' || session.phase === 'complete') return '';
  const topic = EMERGENCY_HELP_TOPICS.find(item => item.id === session.topicId);
  if (!topic) return '';

  let instruction = 'Wykonaj wskazany krok, a następnie wróć do Pomocy.';
  let action = '<button type="button" class="secondary-button" data-action="open-help">Otwórz Pomoc</button>';
  if (session.phase === 'editing-previous') {
    instruction = 'Popraw błędny wynik i naciśnij „Podsumuj konkurencję”. Szkic przerwanej konkurencji jest zachowany.';
  } else if (session.phase === 'ready-to-resume') {
    instruction = 'Poprzednia konkurencja została przeliczona. Wróć teraz do przerwanej konkurencji.';
    action = '<button type="button" class="success-button is-guided" data-action="help-resume-current">Wróć do przerwanej konkurencji</button>';
  } else if (session.phase === 'reordering-events') {
    instruction = 'Zmień kolejność tylko odblokowanych, przyszłych konkurencji. Zakończone i rozpoczęte są chronione.';
    action = '<button type="button" class="success-button is-guided" data-action="help-finish-reorder">Zatwierdź nowy plan i wróć</button>';
  }

  return `
    <aside class="help-guidance" aria-live="polite">
      <span class="help-guidance__symbol">${escapeHtml(topic.symbol)}</span>
      <div>
        <strong>Pomoc: ${escapeHtml(topic.title)}</strong>
        <p>${escapeHtml(instruction)}</p>
      </div>
      <div class="help-guidance__actions">
        ${action}
        <button type="button" class="secondary-button" data-action="help-cancel">Anuluj procedurę</button>
      </div>
    </aside>
  `;
}

function renderEmergencyHelp() {
  const session = state.ui.emergencyHelp;
  if (!session?.open) return '';
  const topic = EMERGENCY_HELP_TOPICS.find(item => item.id === session.topicId);
  const title = topic?.title || 'Pomoc podczas zawodów';
  return `
    <div class="modal-backdrop help-backdrop" role="presentation">
      <section class="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="emergency-help-title">
        <header class="help-modal__header">
          <div>
            <span class="eyebrow">Tryb bezpiecznej pomocy</span>
            <h2 id="emergency-help-title">${escapeHtml(title)}</h2>
          </div>
          <button type="button" class="profile-close" data-action="close-help" aria-label="Zamknij okno Pomocy">×</button>
        </header>
        ${session.topicId ? renderHelpTopic(session, topic) : renderHelpTopics()}
      </section>
    </div>
  `;
}

function renderHelpTopics() {
  const context = helpContext();
  const topics = getEmergencyHelpTopics(context, state.ui.helpSearch);
  return `
    <div class="help-context">
      <strong>${escapeHtml(helpStageLabel())}</strong>
      <small>${escapeHtml(currentEvent()?.name || 'Brak aktywnej konkurencji')} · ${context.currentDraftCount} wpisanych wyników · ${context.historyCount} podsumowań</small>
    </div>
    <label class="help-search">
      <span>Co się stało?</span>
      <input data-help-search value="${escapeAttr(state.ui.helpSearch)}" placeholder="Np. zły wynik, pogoda, inne urządzenie" autocomplete="off">
    </label>
    <div class="help-topic-list">
      ${topics.length ? topics.map(topic => `
        <button type="button" class="help-topic ${topic.recommended ? 'is-recommended' : ''}" data-action="help-select-topic" data-id="${escapeAttr(topic.id)}" ${topic.available ? '' : 'disabled'}>
          <span class="help-topic__symbol">${escapeHtml(topic.symbol)}</span>
          <span class="help-topic__copy">
            <strong>${escapeHtml(topic.title)}</strong>
            <small>${escapeHtml(topic.summary)}</small>
            <em>${escapeHtml(topic.reason)}</em>
          </span>
          ${topic.recommended ? '<span class="help-topic__badge">Zalecane teraz</span>' : ''}
        </button>
      `).join('') : '<div class="empty-state">Nie znaleziono pasującego tematu. Wyczyść wyszukiwanie.</div>'}
    </div>
  `;
}

function renderHelpTopic(session, topic) {
  if (!topic) return '<div class="empty-state">Nie znaleziono procedury.</div>';
  const content = helpTopicContent(session, topic.id);
  const checkpoint = session.checkpointId
    ? '<div class="help-safety is-safe"><strong>Punkt bezpieczeństwa zapisany</strong><small>Możesz anulować procedurę i wrócić do stanu sprzed zmian.</small></div>'
    : '<div class="help-safety"><strong>Punkt bezpieczeństwa powstanie automatycznie</strong><small>Zostanie zapisany przed wykonaniem pierwszej zmiany.</small></div>';
  return `
    ${checkpoint}
    <div class="help-step" aria-live="polite">
      <span class="help-step__number">${content.step}</span>
      <div>
        <strong>${escapeHtml(content.heading)}</strong>
        <p>${escapeHtml(content.text)}</p>
      </div>
    </div>
    <div class="help-impact">
      <div><span>Zostaje</span><strong>${escapeHtml(content.preserved)}</strong></div>
      <div><span>Przeliczane</span><strong>${escapeHtml(content.recalculated)}</strong></div>
      <div class="${content.riskLevel === 'high' ? 'is-warning' : ''}"><span>Uwaga</span><strong>${escapeHtml(content.risk)}</strong></div>
    </div>
    <div class="help-primary-action">${content.action}</div>
    <div class="help-secondary-actions">
      <button type="button" class="secondary-button" data-action="help-show-topics">Inny problem</button>
      ${session.phase === 'complete'
        ? '<button type="button" class="primary-button" data-action="help-finish">Zakończ Pomoc</button>'
        : '<button type="button" class="secondary-button" data-action="help-cancel">Anuluj procedurę</button>'}
    </div>
  `;
}

function helpTopicContent(session, topicId) {
  if (session.phase === 'complete') {
    return {
      step: 'Gotowe',
      heading: 'Procedura zakończona',
      text: session.completionMessage || 'Aplikacja wróciła do bezpiecznego stanu pracy.',
      preserved: session.preservedMessage || 'Zapisane dane zawodów',
      recalculated: session.recalculatedMessage || 'Tylko dane wskazane w procedurze',
      risk: 'Sprawdź aktywną konkurencję przed kolejnym wpisem.',
      riskLevel: 'low',
      action: ''
    };
  }

  if (topicId === 'correct-previous-result') {
    if (session.phase === 'editing-previous') {
      return {
        step: '1 z 2', heading: 'Popraw wynik i podsumuj konkurencję',
        text: 'Zmień błędny wpis na ekranie wyników. Następnie naciśnij „Podsumuj konkurencję”.',
        preserved: `${session.origin?.draftCount || 0} wpisanych wyników przerwanej konkurencji`,
        recalculated: 'Poprzednia konkurencja po podsumowaniu',
        risk: 'Nie przechodź ręcznie do innego etapu; Pomoc wskaże powrót.', riskLevel: 'low',
        action: '<button type="button" class="primary-button action-large" data-action="close-help">Wróć do edycji wyniku</button>'
      };
    }
    if (session.phase === 'ready-to-resume') {
      return {
        step: '2 z 2', heading: 'Wróć do przerwanej konkurencji',
        text: 'Poprawione podsumowanie jest zapisane. Szkic bieżącej konkurencji czeka na swoim miejscu.',
        preserved: 'Wpisane już wyniki i faktyczna kolejność bieżącej konkurencji',
        recalculated: 'Poprzednia konkurencja i klasyfikacja łączna',
        risk: 'Jeżeli bieżąca konkurencja już ruszyła, jej kolejność pozostaje bez zmian.',
        riskLevel: 'low',
        action: '<button type="button" class="success-button action-large is-guided" data-action="help-resume-current">Wróć do przerwanej konkurencji</button>'
      };
    }
    return {
      step: '1 z 2', heading: 'Cofnij poprzednie podsumowanie do edycji',
      text: `Wrócisz do konkurencji „${session.origin?.previousEventName || 'poprzedniej'}”. Po poprawieniu wyniku podsumuj ją ponownie.`,
      preserved: `${session.origin?.draftCount || 0} wpisanych wyników przerwanej konkurencji`,
      recalculated: 'Punkty poprzedniej konkurencji i klasyfikacja łączna',
      risk: session.origin?.draftCount ? 'Rozpoczęta kolejność zostanie zamrożona, aby nie zmieniła się po korekcie.' : 'Kolejność nie rozpoczętej jeszcze konkurencji może zostać przeliczona.',
      riskLevel: 'low',
      action: '<button type="button" class="primary-button action-large is-guided" data-action="help-start-correction">Przejdź do poprawy wyniku</button>'
    };
  }

  if (topicId === 'reorder-events') {
    if (session.phase === 'reordering-events') {
      return {
        step: '1 z 1', heading: 'Przesuń przyszłe konkurencje',
        text: 'Użyj strzałek przy odblokowanych pozycjach. Chronionych konkurencji nie można edytować, usuwać ani odznaczać.',
        preserved: 'Rozegrane wyniki, szkice oraz aktywna konkurencja',
        recalculated: 'Kolejność przyszłych konkurencji i oznaczenie finału',
        risk: 'Ostatnia pozycja programu zawsze staje się finałem.', riskLevel: 'high',
        action: '<button type="button" class="success-button action-large is-guided" data-action="help-finish-reorder">Zatwierdź nowy plan i wróć</button>'
      };
    }
    return {
      step: '1 z 1', heading: 'Zmień wyłącznie przyszłe konkurencje',
      text: `${session.origin?.lockedCount || 0} pierwszych pozycji planu zostanie zablokowanych. Przesuwać można tylko pozostałe konkurencje.`,
      preserved: 'Rozegrane wyniki, szkice oraz aktywna konkurencja',
      recalculated: 'Kolejność przyszłych konkurencji i oznaczenie finału',
      risk: 'Ostatnia pozycja programu zawsze staje się finałem.',
      riskLevel: 'high',
      action: '<button type="button" class="primary-button action-large is-guided" data-action="help-start-reorder">Otwórz bezpieczną zmianę planu</button>'
    };
  }

  const generic = {
    'undo-summary': ['Cofnij ostatnie podsumowanie', 'Wpisy pozostaną w formularzu i będzie można je poprawić.', 'Wszystkie wcześniejsze konkurencje', 'Bieżąca konkurencja po ponownym podsumowaniu', 'Sprawdź nazwę konkurencji przed edycją.', '<button type="button" class="primary-button action-large" data-action="help-undo-summary">Cofnij ostatnie podsumowanie</button>'],
    'results-problem': ['Sprawdź punkty kontrolne', 'Otwórz sekcję bezpieczeństwa i porównaj daty zapisów przed wczytaniem.', 'Aktualny stan, dopóki nie potwierdzisz wczytania', 'Po wczytaniu aplikacja odbuduje punktację', 'Wczytanie punktu zastępuje bieżący stan.', '<button type="button" class="primary-button action-large" data-action="help-open-checkpoints">Pokaż punkty kontrolne</button>'],
    'add-competitor': ['Otwórz bazę zawodników', 'Dodaj zawodnika do trwałej bazy. Istniejące wyniki nie zostaną zmienione.', 'Wyniki i historia rozegranych konkurencji', 'Lista dostępnych zawodników', 'Dodanie zawodnika do trwającej punktacji wymaga świadomej decyzji sędziego.', '<button type="button" class="primary-button action-large" data-action="help-open-competitors">Otwórz bazę zawodników</button>'],
    'refresh-recovery': ['Odzyskaj bezpieczny zapis', 'Najpierw sprawdź autosave. Jeśli stan jest niepełny, wybierz najnowszy właściwy punkt kontrolny.', 'Punkty kontrolne i trwała baza zawodników', 'Stan zawodów po wybranym zapisie', 'Nie wybieraj starszego punktu wyłącznie po nazwie; sprawdź datę.', '<button type="button" class="primary-button action-large" data-action="help-open-checkpoints">Pokaż zapisy bezpieczeństwa</button>'],
    'switch-device': ['Przygotuj pełny plik stanu', 'Pobierz plik i zaimportuj go na drugim urządzeniu. Nie rozpoczynaj wpisywania równolegle na obu.', 'Wyniki, szkice, kolejności i dane zawodów', 'Stan zostanie odtworzony podczas importu', 'Po przeniesieniu wybierz jedno urządzenie jako główne.', '<button type="button" class="primary-button action-large" data-action="help-export-state">Eksportuj pełny stan</button>'],
    'offline-stopwatch': ['Przejdź na tryb awaryjny', 'Prowadzenie zawodów działa offline. Gdy stoper zawiedzie, zmierz czas urządzeniem zapasowym i wpisz wynik ręcznie.', 'Wszystkie dotychczasowe dane', 'Nic bez potwierdzenia sędziego', 'Nie odświeżaj strony podczas pracującego stopera.', '<button type="button" class="primary-button action-large" data-action="help-return-scoring">Wróć do wyników</button>']
  }[topicId];
  return {
    step: '1 z 1', heading: generic?.[0] || 'Postępuj bezpiecznie', text: generic?.[1] || '',
    preserved: generic?.[2] || 'Aktualny zapis', recalculated: generic?.[3] || 'Brak', risk: generic?.[4] || 'Sprawdź stan przed dalszą pracą.',
    riskLevel: ['results-problem', 'refresh-recovery'].includes(topicId) ? 'high' : 'low', action: generic?.[5] || ''
  };
}

function helpStageLabel() {
  if (state.stage === 'scoring') return `Wyniki · konkurencja ${state.currentEventIndex + 1} z ${state.selectedEventIds.length}`;
  return STAGE_LABELS[state.stage] || 'Stan zawodów';
}

function stageSubtitle() {
  const selected = `${state.selectedCompetitorIds.length} zawodników · ${state.selectedEventIds.length} konkurencji`;
  if (state.stage === 'setup') return selected;
  if (state.stage === 'draw') return 'Ustaw lub wylosuj pierwszą kolejność startową';
  if (state.stage === 'scoring') return currentEvent()?.name || 'Wpisywanie wyników';
  if (state.stage === 'season') return `Puchar Polski 2026 · ${state.seasonEvents.length} imprez`;
  return 'Wyniki końcowe i eksport';
}

function renderSetup() {
  const selectedCompetitors = state.selectedCompetitorIds.length;
  const selectedEvents = state.selectedEventIds.length;
  const canContinue = selectedCompetitors >= 2 && selectedEvents >= 1;

  return `
    <section class="hero-card">
      <img src="${escapeAttr(getLogoSrc())}" alt="Logo zawodów" class="hero-logo">
      <button class="ghost-button" type="button" data-action="change-logo">Zmień logo</button>
    </section>

    ${accordion('competition', 'Dane zawodów', 'Nazwa, miejsce, logo i komunikacja backupu.', `
      <div class="form-grid">
        <label>
          <span>Nazwa zawodów</span>
          <input value="${escapeAttr(state.eventName)}" data-bind="eventName" autocomplete="off">
        </label>
        <label>
          <span>Miejsce</span>
          <input value="${escapeAttr(state.eventLocation)}" data-bind="eventLocation" autocomplete="off">
        </label>
        <label>
          <span>Data zawodów</span>
          <input type="date" value="${escapeAttr(state.eventDate)}" data-bind="eventDate">
        </label>
        <label>
          <span>E-mail backupu</span>
          <input value="${escapeAttr(state.backupEmail)}" data-bind="backupEmail" inputmode="email" autocomplete="email">
        </label>
        <label>
          <span>Liczba finalistów</span>
          <input type="number" min="1" max="${Math.max(1, state.selectedCompetitorIds.length || state.competitors.length || 20)}" value="${escapeAttr(state.finalistsLimit)}" data-bind-number="finalistsLimit" inputmode="numeric">
        </label>
      </div>
      <div class="button-row">
        <button type="button" class="secondary-button" data-action="change-logo">Wybierz inne logo</button>
        <button type="button" class="secondary-button" data-action="reset-logo">Przywróć logo domyślne</button>
      </div>
    `)}

    ${accordion('competitors', 'Zawodnicy', `${selectedCompetitors} wybranych. Kolejność kliknięć jest kolejnością startową.`, `
      <button type="button" class="primary-button" data-action="open-competitor-editor">Dodaj zawodnika</button>
      <div class="button-row">
        <button type="button" class="secondary-button" data-action="import-competitors">Import zawodników</button>
        <button type="button" class="secondary-button" data-action="export-competitors">Eksport listy</button>
      </div>
      <label class="search-box">
        <span>Szukaj zawodnika</span>
        <input data-filter="competitors" value="${escapeAttr(state.ui.competitorSearch)}" placeholder="Wpisz fragment imienia lub nazwiska">
      </label>
      ${renderCompetitorCategoryFilters()}
      <div class="selection-list" data-list="competitors">
        ${renderCompetitorSelection()}
      </div>
    `)}

    ${accordion('events', 'Konkurencje', `${selectedEvents} wybranych. Ostatnia wybrana będzie finałem.`, `
      <form class="inline-form" data-form="add-event">
        <input name="name" placeholder="Nazwa konkurencji" autocomplete="off">
        <select name="type">
          <option value="high">Więcej = lepiej</option>
          <option value="low">Mniej = lepiej</option>
        </select>
        <button type="submit" class="primary-button">Dodaj</button>
      </form>
      <div class="button-row">
        <button type="button" class="secondary-button" data-action="import-events">Import konkurencji</button>
        <button type="button" class="secondary-button" data-action="export-events">Eksport bazy</button>
      </div>
      <label class="search-box">
        <span>Szukaj konkurencji</span>
        <input data-filter="events" placeholder="Wpisz nazwę konkurencji">
      </label>
      <div class="selection-list" data-list="events">
        ${renderEventSelection()}
      </div>
    `)}

    ${accordion('safety', 'Backup i bezpieczeństwo', 'Punkty kontrolne, import, eksport i reset.', `
      <div class="button-column">
        <button type="button" class="success-button" data-action="save-checkpoint">Zapisz punkt kontrolny</button>
        <button type="button" class="secondary-button" data-action="export-state">Eksportuj stan do pliku</button>
        <button type="button" class="secondary-button" data-action="import-state">Importuj stan z pliku</button>
        <button type="button" class="danger-button" data-action="open-reset">Reset aplikacji</button>
      </div>
      ${renderCheckpointList()}
    `, false)}

    ${accordion('help', 'Skrót pracy sędziego', 'Najważniejsze zasady obsługi na zawodach.', `
      <ul class="help-list">
        <li>Najpierw wybierz zawodników. Pierwszy kliknięty zawodnik startuje jako pierwszy, jeśli nie użyjesz losowania.</li>
        <li>Wybierz konkurencje w docelowej kolejności. Ostatnia wybrana konkurencja jest traktowana jako finał.</li>
        <li>Wyniki zapisują się automatycznie po wpisaniu. Podsumowanie konkurencji jest osobnym, zabezpieczonym krokiem.</li>
        <li>Przed resetem trzeba wpisać RESET. Import stanu wymaga potwierdzenia.</li>
      </ul>
    `, false)}

    <div class="sticky-actions">
      <button type="button" class="primary-button action-large ${canContinue ? 'is-guided' : ''}" data-action="go-draw" ${canContinue ? '' : 'disabled'}>
        Ustaw kolejność startową
      </button>
      ${canContinue ? '' : '<p class="action-hint">Wybierz co najmniej 2 zawodników i 1 konkurencję.</p>'}
    </div>
  `;
}

function renderCompetitorCategoryFilters() {
  const filters = [
    ['all', 'Wszyscy'],
    ['Puchar Polski', 'Puchar Polski'],
    ['Legenda', 'Legenda'],
    ['Tyberian Team', 'Tyberian Team'],
    ['Inny', 'Inny'],
    ['uncategorized', 'Bez kategorii']
  ];
  const active = normalizeCategoryKey(state.ui.competitorCategoryFilter);
  return `
    <div class="category-filters" role="group" aria-label="Filtr kategorii zawodnik&#243;w">
      ${filters.map(([value, label]) => {
        const selected = active === normalizeCategoryKey(value);
        return `<button type="button" class="category-filter ${selected ? 'is-active' : ''}"
          data-action="set-competitor-category-filter" data-category="${escapeAttr(value)}"
          aria-pressed="${selected}">${escapeHtml(label)}</button>`;
      }).join('')}
    </div>
  `;
}

function renderCompetitorSelection() {
  if (!state.competitors.length) {
    return `<div class="empty-state">Brak zawodników w bazie. Dodaj ręcznie albo zaimportuj plik JSON.</div>`;
  }
  const ordered = orderSelectedFirst(state.competitors, state.selectedCompetitorIds);
  return ordered.map(competitor => {
    const selectedIndex = state.selectedCompetitorIds.indexOf(competitor.id);
    const selected = selectedIndex >= 0;
    const categories = getCompetitorCategories(competitor);
    const meta = [categories.join(', '), competitor.residence, competitor.weight ? `${competitor.weight} kg` : ''].filter(Boolean).join(' · ');
    return `
      <article class="selection-item ${selected ? 'is-selected' : ''}" data-competitor-id="${escapeAttr(competitor.id)}" data-filter-text="${escapeAttr(`${competitor.name} ${meta} ${competitor.notes || ''}`)}">
        <div class="competitor-select-row">
          <button type="button" class="avatar avatar-button" data-action="open-competitor-profile" data-id="${escapeAttr(competitor.id)}" aria-label="Pokaż informacje o ${escapeAttr(competitor.name)}">
            ${competitor.photo ? `<img src="${escapeAttr(competitor.photo)}" alt="">` : escapeHtml(initials(competitor.name))}
          </button>
          <button type="button" class="select-card competitor-select" data-action="toggle-competitor" data-id="${escapeAttr(competitor.id)}">
            <span class="order-pill">${selected ? selectedIndex + 1 : '+'}</span>
            <span class="select-card__main">
              <strong>${escapeHtml(competitor.name)}</strong>
              ${meta ? `<small>${escapeHtml(meta)}</small>` : '<small>Dotknij, aby wybrać</small>'}
            </span>
            <span class="check-pill ${selected ? 'is-checked' : ''}">${selected ? '✓' : ''}</span>
          </button>
        </div>
        <div class="item-actions">
          <button type="button" class="mini-button info-mini" data-action="open-competitor-profile" data-id="${escapeAttr(competitor.id)}" aria-label="Pokaż informacje o zawodniku">ⓘ Profil</button>
          <button type="button" class="mini-button" data-action="edit-competitor" data-id="${escapeAttr(competitor.id)}">Edytuj</button>
          <button type="button" class="mini-button danger-mini" data-action="delete-competitor" data-id="${escapeAttr(competitor.id)}">Usuń</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderEventSelection() {
  if (!state.events.length) {
    return `<div class="empty-state">Brak konkurencji w bazie. Dodaj ręcznie albo zaimportuj plik JSON.</div>`;
  }
  const reorderSession = activeEventReorderSession();
  const lockedCount = reorderSession?.origin?.lockedCount || 0;
  const ordered = orderSelectedFirst(state.events, state.selectedEventIds);
  return ordered.map(event => {
    const selectedIndex = state.selectedEventIds.indexOf(event.id);
    const selected = selectedIndex >= 0;
    const isFinal = selected && selectedIndex === state.selectedEventIds.length - 1 && state.selectedEventIds.length > 1;
    const locked = Boolean(reorderSession && selected && selectedIndex < lockedCount);
    const moveUpDisabled = selectedIndex <= 0 || Boolean(reorderSession && selectedIndex <= lockedCount);
    const moveDownDisabled = selectedIndex === state.selectedEventIds.length - 1 || locked;
    const workflowStatus = locked
      ? selectedIndex < state.eventHistory.length ? 'Zakończona · zablokowana' : 'Rozpoczęta · zablokowana'
      : reorderSession && selected ? 'Przyszła · można przesunąć' : '';
    return `
      <div class="event-row selection-item ${selected ? 'is-selected' : ''} ${locked ? 'is-workflow-locked' : ''}" data-filter-text="${escapeAttr(event.name)}">
        <button type="button" class="select-card event-select" data-action="toggle-event" data-id="${escapeAttr(event.id)}" ${reorderSession ? 'disabled' : ''}>
          <span class="order-pill">${selected ? selectedIndex + 1 : '+'}</span>
          <span class="select-card__main">
            <strong>${escapeHtml(event.name)}</strong>
            <small>${EVENT_TYPE_LABEL[event.type]}${isFinal ? ' · Finał' : ''}${workflowStatus ? ` · ${escapeHtml(workflowStatus)}` : ''}</small>
          </span>
          <span class="check-pill ${selected ? 'is-checked' : ''}">${selected ? '✓' : ''}</span>
        </button>
        <div class="item-actions">
          <button type="button" class="mini-button" data-action="edit-event" data-id="${escapeAttr(event.id)}" ${reorderSession ? 'disabled' : ''}>Edytuj</button>
          <button type="button" class="mini-button danger-mini" data-action="delete-event" data-id="${escapeAttr(event.id)}" ${reorderSession ? 'disabled' : ''}>Usuń</button>
        </div>
        ${selected ? `
          <div class="reorder-actions selection-reorder-actions">
            <button type="button" class="icon-button" data-action="move-event" data-id="${escapeAttr(event.id)}" data-direction="-1" ${moveUpDisabled ? 'disabled' : ''} aria-label="Przesuń konkurencję wyżej">↑</button>
            <button type="button" class="icon-button" data-action="move-event" data-id="${escapeAttr(event.id)}" data-direction="1" ${moveDownDisabled ? 'disabled' : ''} aria-label="Przesuń konkurencję niżej">↓</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function renderDraw() {
  const animation = state.ui.drawAnimation;
  const order = animation?.orderIds || getStartOrderIds();
  const drawInProgress = Boolean(animation);
  const drawCompleted = Boolean(state.drawUsed) && !drawInProgress;
  return `
    <section class="panel strong-panel">
      <div class="panel-heading">
        <span class="panel-icon">🎰</span>
        <div>
          <h2>Kolejność startowa pierwszej konkurencji</h2>
          <p>Domyślnie wykonaj publiczne losowanie. Start bez losowania to świadoma opcja sędziego.</p>
        </div>
      </div>
      <div class="button-column">
        <button type="button" class="primary-button ${!drawCompleted ? 'is-guided' : ''}" data-action="shuffle-order" ${drawInProgress ? 'disabled' : ''}>
          ${drawInProgress ? 'Losowanie trwa...' : drawCompleted ? 'Losuj ponownie' : 'Losuj kolejność'}
        </button>
        <button type="button" class="secondary-button" data-action="restore-selection-order" ${drawInProgress ? 'disabled' : ''}>Przywróć kolejność wyboru</button>
      </div>
    </section>

    ${renderDrawVisualization(order, drawInProgress, drawCompleted)}

    <section class="order-list">
      ${order.map((id, index) => {
        const competitor = competitorById(id);
        return `
          <article class="order-card">
            <span class="order-pill">${index + 1}</span>
            <strong>${escapeHtml(competitor?.name || 'Zawodnik')}</strong>
            <div class="reorder-actions">
              <button type="button" class="icon-button" data-action="move-start-order" data-id="${escapeAttr(id)}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="icon-button" data-action="move-start-order" data-id="${escapeAttr(id)}" data-direction="1" ${index === order.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
          </article>
        `;
      }).join('')}
    </section>

    <div class="sticky-actions">
      <button type="button" class="${drawCompleted ? 'primary-button is-guided' : 'secondary-button'} action-large" data-action="start-competition" ${drawInProgress ? 'disabled' : ''}>
        ${drawCompleted ? 'Start zawodów' : 'Start bez losowania'}
      </button>
      <button type="button" class="secondary-button action-large" data-action="go-setup">Wróć do przygotowania</button>
    </div>
  `;
}

function renderDrawVisualization(order, inProgress, completed) {
  const visible = order.slice(0, 8);
  return `
    <section class="draw-visual ${inProgress ? 'is-running' : ''} ${completed ? 'is-complete' : ''}" aria-live="polite">
      <div class="draw-visual__header">
        <span class="draw-visual__icon">🎲</span>
        <div>
          <strong>${inProgress ? 'Trwa publiczne losowanie' : completed ? 'Kolejność wylosowana' : 'Gotowe do losowania'}</strong>
          <small>${inProgress ? 'Nazwiska są tasowane na ekranie.' : completed ? 'Poniżej znajduje się finalna kolejność startowa.' : 'Naciśnij „Losuj kolejność”, aby pokazać proces zawodnikom.'}</small>
        </div>
      </div>
      <div class="draw-slots">
        ${visible.map((id, index) => {
          const competitor = competitorById(id);
          return `
            <div class="draw-slot">
              <span>${index + 1}</span>
              <strong>${escapeHtml(competitor?.name || 'Zawodnik')}</strong>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderScoring() {
  const event = currentEvent();
  if (!event) {
    return `
      <section class="panel">
        <h2>Brak wybranej konkurencji</h2>
        <p>Wróć do przygotowania i wybierz konkurencje.</p>
        <button type="button" class="primary-button" data-action="go-setup">Wróć</button>
      </section>
    `;
  }

  const orderIds = getOrderForEvent(state.currentEventIndex);
  const draft = getCurrentDraft();
  const finalized = state.eventHistory[state.currentEventIndex];
  const filled = orderIds.filter(id => String(draft[id] || '').trim()).length;
  const canGoNext = Boolean(finalized);
  const allResultsEntered = areCurrentEventResultsComplete();
  const guideFinalize = !canGoNext && allResultsEntered;
  const showScoringActions = Boolean(finalized) || allResultsEntered;
  const finalEvent = isFinalEventIndex(state.currentEventIndex);
  const nextIsFinal = isFinalEventIndex(state.currentEventIndex + 1);
  const nextLabel = state.currentEventIndex >= state.selectedEventIds.length - 1
    ? 'Pokaż klasyfikację końcową'
    : nextIsFinal ? 'Konkurencja finałowa' : 'Następna konkurencja';

  return `
    <section class="score-header">
      <div>
        <span class="eyebrow">Konkurencja ${state.currentEventIndex + 1} z ${state.selectedEventIds.length}</span>
        <h2>${escapeHtml(finalEvent ? `${event.name} (FINAŁ)` : event.name)}</h2>
        <p>${EVENT_TYPE_LABEL[event.type]} · ${filled}/${orderIds.length} wyników wpisanych</p>
      </div>
      <button type="button" class="secondary-button" data-action="go-draw">Kolejność</button>
    </section>

    ${finalEvent ? renderFinalBanner(orderIds) : ''}
    ${finalized ? renderEventSummary(finalized) : ''}

    <section class="result-list">
      ${orderIds.map((id, index) => renderResultCard(id, index, event, draft, finalized)).join('')}
    </section>

    ${showScoringActions ? `
      <div class="sticky-actions">
        <button type="button" class="success-button action-large ${guideFinalize ? 'is-guided' : ''}" data-action="finalize-event" data-guard-key="${state.currentEventIndex}">
          ${finalized ? 'Przelicz podsumowanie' : 'Podsumuj konkurencję'}
        </button>
        <button type="button" class="primary-button action-large ${canGoNext ? 'is-guided' : ''}" data-action="next-event" data-guard-key="${state.currentEventIndex}" ${canGoNext ? '' : 'disabled'}>
          ${nextLabel}
        </button>
        <button type="button" class="secondary-button action-large" data-action="undo-event" ${state.eventHistory.length ? '' : 'disabled'}>Cofnij ostatnie podsumowanie</button>
      </div>
    ` : ''}
  `;
}

function renderResultCard(id, index, event, draft, finalized) {
  const competitor = competitorById(id);
  const value = draft[id] ?? '';
  const summary = finalized?.results.find(result => result.id === id);
  const status = summary ? `${summary.place}. miejsce · ${summary.points} pkt` : (String(value).trim() ? 'wpisany' : 'czeka');
  const placeholder = event.type === 'low' ? 'np. 52.40, 1:12.5 albo 018.5' : 'np. liczba powtórzeń, metry, sekundy';
  return `
    <article class="result-card ${String(value).trim() ? 'has-value' : ''}">
      <header>
        <span class="order-pill">${index + 1}</span>
        <button type="button" class="avatar avatar--large avatar-button" data-action="open-competitor-profile" data-id="${escapeAttr(id)}" aria-label="Pokaż informacje o ${escapeAttr(competitor?.name || 'zawodniku')}">
          ${competitor?.photo ? `<img src="${escapeAttr(competitor.photo)}" alt="">` : escapeHtml(initials(competitor?.name || ''))}
        </button>
        <div>
          <strong>${escapeHtml(competitor?.name || 'Zawodnik')}</strong>
          <small>${escapeHtml(status)}</small>
        </div>
        <button type="button" class="profile-info-button" data-action="open-competitor-profile" data-id="${escapeAttr(id)}" aria-label="Pokaż profil zawodnika">i</button>
      </header>
      <div class="result-entry">
        <input data-result="${escapeAttr(id)}" inputmode="decimal" value="${escapeAttr(value)}" placeholder="${escapeAttr(placeholder)}">
        <button type="button" class="success-button compact-ok" data-action="accept-result" data-id="${escapeAttr(id)}">OK</button>
      </div>
      <div class="quick-actions">
        <button type="button" class="secondary-button" data-action="open-stopwatch" data-id="${escapeAttr(id)}">Stoper</button>
        <button type="button" class="secondary-button" data-action="set-dnf" data-id="${escapeAttr(id)}">DNF / 0</button>
        <button type="button" class="secondary-button" data-action="clear-result" data-id="${escapeAttr(id)}">Wyczyść</button>
      </div>
    </article>
  `;
}

function renderFinalBanner(orderIds) {
  const leader = competitorById(orderIds[orderIds.length - 1]);
  return `
    <section class="final-banner">
      <strong>Konkurencja finałowa</strong>
      <p>Startuje top ${orderIds.length}. Kolejność jest odwrócona względem klasyfikacji: lider ${escapeHtml(leader?.name || 'zawodów')} startuje jako ostatni.</p>
    </section>
  `;
}

function renderEventSummary(event) {
  const sorted = [...event.results].sort((a, b) => {
    if (a.place === '-') return 1;
    if (b.place === '-') return -1;
    return Number(a.place) - Number(b.place);
  });
  return `
    <details class="accordion summary-accordion" open>
      <summary>
        <span>Podsumowanie zapisane</span>
        <small>Możesz przejść dalej albo przeliczyć po korekcie.</small>
      </summary>
      <div class="table-card">
        ${sorted.map(row => `
          <div class="table-row">
            <span>${escapeHtml(String(row.place))}</span>
            <strong>${escapeHtml(row.name)}</strong>
            <span>${escapeHtml(String(row.result))}</span>
            <span>${escapeHtml(String(row.points))} pkt</span>
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

function renderSummary() {
  const competitors = state.selectedCompetitorIds.map(id => competitorById(id)).filter(Boolean);
  const standings = rankStandings(competitors, state.scores, state.eventHistory);
  return `
    <section class="panel strong-panel">
      <div class="panel-heading">
        <span class="panel-icon">🏆</span>
        <div>
          <h2>Klasyfikacja końcowa</h2>
          <p>${escapeHtml(state.eventName || 'Zawody')} · ${state.eventHistory.length} konkurencji zakończonych</p>
        </div>
      </div>
      <div class="button-column">
        <button type="button" class="secondary-button" data-action="export-state">Eksportuj pełny stan</button>
        <button type="button" class="success-button" data-action="export-results-html">Eksportuj wyniki HTML</button>
        <button type="button" class="secondary-button" data-action="go-scoring">Wróć do wyników</button>
      </div>
    </section>

    <section class="standings">
      ${standings.map(row => `
        <article class="standing-card ${row.rank <= 3 ? 'is-podium' : ''} ${row.tieGroupSize ? 'has-tie' : ''}">
          <span class="rank">${row.rank}</span>
          <div class="standing-card__main">
            <strong>${escapeHtml(row.name)}</strong>
            ${row.tieStatus ? `<small class="tie-note ${row.tieStatus === 'Wygrywa remis' ? 'is-winner' : ''}">${escapeHtml(row.tieStatus)} · ${escapeHtml(row.tieReason)}</small>` : ''}
          </div>
          <button type="button" class="profile-info-button" data-action="open-competitor-profile" data-id="${escapeAttr(row.id)}" aria-label="Pokaż profil zawodnika">i</button>
          <span>${row.points.toFixed(2)} pkt</span>
        </article>
      `).join('')}
    </section>

    <section class="panel event-breakdown">
      <h2>Punkty za konkurencje</h2>
      <p>Pełne podsumowanie każdej rozegranej konkurencji: miejsce, wynik i punkty.</p>
      <div class="event-summary-list">
        ${state.eventHistory.map(event => renderEventSummaryDetails(event)).join('')}
      </div>
    </section>
  `;
}

function renderEventSummaryDetails(event) {
  const sorted = [...event.results].sort((a, b) => {
    if (a.place === '-') return 1;
    if (b.place === '-') return -1;
    return Number(a.place) - Number(b.place);
  });
  const leader = sorted.find(row => row.place !== '-');
  return `
    <details class="accordion event-summary-card">
      <summary>
        <span>${event.nr}. ${escapeHtml(event.name)}</span>
        <small>${leader ? `Wygrywa: ${escapeHtml(leader.name)} · ${escapeHtml(String(leader.points))} pkt` : EVENT_TYPE_LABEL[event.type]}</small>
      </summary>
      <div class="table-card">
        ${sorted.map(row => `
          <div class="table-row">
            <span>${escapeHtml(String(row.place))}</span>
            <strong>${escapeHtml(row.name)}</strong>
            <span>${escapeHtml(String(row.result))}</span>
            <span>${escapeHtml(String(row.points))} pkt</span>
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

function renderSeason() {
  const standings = calculateSeasonStandings(state.seasonEvents, state.seasonMaxCountedStarts);
  const completedEvents = state.seasonEvents.filter(event => event.ranking.length).length;
  return `
    <section class="panel strong-panel season-overview">
      <div class="panel-heading">
        <span class="panel-icon">2026</span>
        <div>
          <h2>Klasyfikacja generalna</h2>
          <p>${completedEvents} imprez · punkty 5-4-3-2-1 · liczą się ${state.seasonMaxCountedStarts} najlepsze starty</p>
        </div>
      </div>
      <div class="button-column season-actions">
        <button type="button" class="primary-button" data-action="add-season-event">Dodaj zawody</button>
        <button type="button" class="secondary-button" data-action="import-season">Importuj JSON / HTML</button>
        <button type="button" class="success-button" data-action="export-season-html">Eksportuj czytelny HTML</button>
        <button type="button" class="secondary-button" data-action="export-season">Eksportuj dane JSON</button>
      </div>
      <p class="season-import-note">Plik HTML z wynikami aplikacji można wczytać bez przepisywania tabeli. PDF dodaj ręcznie, aby uniknąć błędów odczytu.</p>
    </section>

    <section class="season-standings" aria-label="Klasyfikacja generalna sezonu 2026">
      ${standings.length ? standings.map(row => renderSeasonStanding(row)).join('') : '<div class="empty-state">Brak wyników sezonu.</div>'}
    </section>

    <section class="panel season-events-panel">
      <div class="panel-heading">
        <span class="panel-icon">#</span>
        <div>
          <h2>Imprezy sezonu</h2>
          <p>Chronologiczna lista wyników. Każdą imprezę można rozwinąć, edytować albo usunąć.</p>
        </div>
      </div>
      <div class="season-event-list">
        ${state.seasonEvents.map((event, index) => renderSeasonEvent(event, index)).join('')}
      </div>
    </section>
  `;
}

function renderSeasonStanding(row) {
  const resultByEvent = new Map(row.results.map(result => [result.eventId, result]));
  return `
    <details class="season-standing-card ${row.rank <= 3 ? 'is-podium' : ''}">
      <summary>
        <span class="rank">${row.rank}</span>
        <span class="season-standing-main">
          <strong>${escapeHtml(row.name)}</strong>
          <small>${row.starts} ${row.starts === 1 ? 'start' : 'starty'} · wszystkie: ${row.allPoints} pkt${row.rejectedPoints ? ` · odrzucone: ${row.rejectedPoints}` : ''}</small>
        </span>
        <strong class="season-total">${row.countedPoints} pkt</strong>
      </summary>
      <div class="season-points-strip">
        ${state.seasonEvents.map(event => {
          const result = resultByEvent.get(event.id);
          if (!result) return `<span class="season-point is-empty" title="${escapeAttr(event.location)}">-</span>`;
          const counted = row.countedEventIds.includes(event.id);
          return `<span class="season-point ${counted ? 'is-counted' : 'is-rejected'}" title="${escapeAttr(`${event.location}: ${result.position}. miejsce`)}">${result.points}</span>`;
        }).join('')}
      </div>
    </details>
  `;
}

function renderSeasonEvent(event, index) {
  const leader = event.ranking.find(result => result.position === 1) || event.ranking[0];
  return `
    <details class="accordion season-event-card">
      <summary>
        <span>${index + 1}. ${escapeHtml(event.location)} · ${formatSeasonDate(event.date)}</span>
        <small>${leader ? `Zwycięzca: ${escapeHtml(leader.name)}` : 'Brak klasyfikacji'}</small>
      </summary>
      <div class="accordion__body">
        <div class="season-ranking-list">
          ${event.ranking.map(result => `
            <div class="season-ranking-row">
              <span>${result.position}</span>
              <strong>${escapeHtml(result.name)}</strong>
              <span>${seasonPointsForPosition(result.position)} pkt</span>
            </div>
          `).join('') || '<div class="empty-state">Brak wpisanych lokat.</div>'}
        </div>
        ${event.sourceFile ? `<small>Źródło: ${escapeHtml(event.sourceFile)}</small>` : ''}
        <div class="button-row">
          <button type="button" class="secondary-button" data-action="edit-season-event" data-id="${escapeAttr(event.id)}">Edytuj</button>
          <button type="button" class="danger-button" data-action="delete-season-event" data-id="${escapeAttr(event.id)}">Usuń</button>
        </div>
      </div>
    </details>
  `;
}

function renderSeasonEditor() {
  const editor = state.ui.seasonEditor;
  if (!editor) return '';
  const rows = Array.from({ length: 5 }, (_, index) => editor.ranking?.[index] || { position: index + 1, name: '', competitionPoints: '' });
  return `
    <div class="modal-backdrop season-editor-backdrop" role="presentation">
      <section class="modal season-editor-modal" role="dialog" aria-modal="true" aria-labelledby="season-editor-title">
        <h2 id="season-editor-title">${editor.id ? 'Edytuj zawody sezonu' : 'Dodaj zawody sezonu'}</h2>
        <p>Wpisz pięć pozycji klasyfikacji końcowej. Przy remisie powtórz lokatę, na przykład 1, 2, 2, 4, 5.</p>
        <form data-form="season-event" class="season-editor-form">
          <input type="hidden" name="id" value="${escapeAttr(editor.id || '')}">
          <div class="form-grid">
            <label><span>Data</span><input type="date" name="date" value="${escapeAttr(editor.date || '')}" required></label>
            <label><span>Miejscowość</span><input name="location" value="${escapeAttr(editor.location || '')}" autocomplete="off" required></label>
          </div>
          <label><span>Plik źródłowy / opis</span><input name="sourceFile" value="${escapeAttr(editor.sourceFile || '')}" autocomplete="off"></label>
          <datalist id="season-competitors">
            ${state.competitors.filter(competitor => competitorMatchesCategory(competitor, 'Puchar Polski')).map(competitor => `<option value="${escapeAttr(competitor.name)}"></option>`).join('')}
          </datalist>
          <div class="season-editor-results">
            ${rows.map((row, index) => `
              <div class="season-editor-row">
                <label><span>Lokata</span><input type="number" min="1" max="5" name="position-${index}" value="${escapeAttr(row.position)}" inputmode="numeric" required></label>
                <label><span>Zawodnik</span><input name="competitor-${index}" value="${escapeAttr(row.name || '')}" list="season-competitors" autocomplete="off" required></label>
                <label><span>Pkt zawodów</span><input type="number" step="0.01" min="0" name="competitionPoints-${index}" value="${escapeAttr(row.competitionPoints || '')}" inputmode="decimal"></label>
              </div>
            `).join('')}
          </div>
          <div class="button-row season-editor-actions">
            <button type="button" class="secondary-button" data-action="close-season-editor">Anuluj</button>
            <button type="submit" class="success-button">Zapisz zawody</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function accordion(id, title, subtitle, body, defaultOpen = true) {
  const open = state.ui.sections[id] ?? defaultOpen;
  return `
    <details class="accordion" data-section="${escapeAttr(id)}" ${open ? 'open' : ''}>
      <summary>
        <span>${escapeHtml(title)}</span>
        <small>${escapeHtml(subtitle)}</small>
      </summary>
      <div class="accordion__body">${body}</div>
    </details>
  `;
}

function renderCheckpointList() {
  const checkpoints = loadCheckpoints();
  if (!checkpoints.length) {
    return `<div class="empty-state">Nie ma jeszcze punktów kontrolnych.</div>`;
  }
  return `
    <div class="checkpoint-toolbar">
      <label class="mini-check"><input type="checkbox" data-action="toggle-all-checkpoints"> Zaznacz wszystkie</label>
      <button type="button" class="danger-button" data-action="delete-selected-checkpoints">Usuń zaznaczone</button>
    </div>
    <div class="checkpoint-list">
      ${checkpoints.map(checkpoint => `
        <article class="checkpoint-card">
          <input type="checkbox" data-checkpoint-id="${escapeAttr(checkpoint.id)}">
          <button type="button" data-action="load-checkpoint" data-id="${escapeAttr(checkpoint.id)}">
            <strong>${escapeHtml(checkpoint.label)}</strong>
            <small>${formatDate(checkpoint.createdAt)} · ${escapeHtml(checkpoint.snapshot?.eventName || 'Bez nazwy')}</small>
          </button>
        </article>
      `).join('')}
    </div>
  `;
}

function renderResetGuard() {
  if (!state.ui.resetOpen) return '';
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <h2 id="reset-title">Reset aplikacji</h2>
        <p>To usunie aktualny stan z tego urządzenia. Punkty kontrolne zostają dostępne, dopóki ich osobno nie usuniesz.</p>
        <label>
          <span>Wpisz RESET</span>
          <input data-reset-input autocomplete="off" autocapitalize="characters" spellcheck="false">
        </label>
        <div class="button-row">
          <button type="button" class="secondary-button" data-action="close-reset">Anuluj</button>
          <button type="button" class="danger-button" data-action="confirm-reset" disabled>Resetuj</button>
        </div>
      </section>
    </div>
  `;
}

function renderInstallHelp() {
  if (!state.ui.installHelpOpen) return '';
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="install-title">
        <h2 id="install-title">Instalacja aplikacji</h2>
        <p>Na iPhonie i iPadzie użyj przycisku udostępniania w Safari, a potem wybierz „Do ekranu początkowego”. Na PC wybierz ikonę instalacji w pasku adresu przeglądarki.</p>
        <p>Aplikacja po instalacji działa offline w zakresie prowadzenia zawodów, wpisywania wyników, punktów kontrolnych oraz eksportu plików.</p>
        <button type="button" class="primary-button" data-action="close-install-help">Rozumiem</button>
      </section>
    </div>
  `;
}

function renderCompetitorProfile() {
  const competitor = competitorById(state.ui.profileCompetitorId);
  if (!competitor) return '';
  const categories = getCompetitorCategories(competitor);
  const dataWarnings = Array.isArray(competitor.dataWarnings) ? competitor.dataWarnings.filter(Boolean) : [];
  const age = dataWarnings.length ? null : calculateAge(competitor.birthDate);
  const details = [
    ['Wiek', age === null ? '' : `${age} lat`],
    ['Data urodzenia', competitor.birthDate ? `${formatBirthDate(competitor.birthDate)}${dataWarnings.length ? ' (do weryfikacji)' : ''}` : ''],
    ['Wzrost', formatMeasurement(competitor.height, 'cm')],
    ['Waga', formatMeasurement(competitor.weight, 'kg')],
    ['Miejsce zamieszkania', competitor.residence],
    ['Kategoria', categories.join(', ')]
  ].filter(([, value]) => value);

  return `
    <div class="modal-backdrop profile-backdrop" data-profile-backdrop role="presentation">
      <section class="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <button type="button" class="profile-close" data-action="close-competitor-profile" aria-label="Zamknij profil">×</button>
        <header class="profile-header">
          <span class="profile-photo">${competitor.photo ? `<img src="${escapeAttr(competitor.photo)}" alt="${escapeAttr(competitor.name)}">` : escapeHtml(initials(competitor.name))}</span>
          <div>
            <span class="eyebrow">Profil zawodnika</span>
            <h2 id="profile-title">${escapeHtml(competitor.name)}</h2>
          </div>
        </header>
        ${details.length ? `
          <dl class="profile-details">
            ${details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join('')}
          </dl>
        ` : '<p class="empty-profile-data">Brak szczegółowych danych zawodnika.</p>'}
        ${dataWarnings.length ? `
          <aside class="profile-data-warning" role="note">
            <strong>Dane wymagają weryfikacji</strong>
            <p>${escapeHtml(dataWarnings.join(' '))}</p>
          </aside>
        ` : ''}
        <section class="profile-notes-section">
          <h3>Osiągnięcia i informacje</h3>
          <p class="profile-notes">${escapeHtml(competitor.notes || 'Brak dodatkowego opisu.')}</p>
        </section>
        <button type="button" class="primary-button" data-action="close-competitor-profile">Zamknij</button>
      </section>
    </div>
  `;
}

function renderCompetitorEditor() {
  const editor = state.ui.competitorEditor;
  if (!editor) return '';
  const categories = getCompetitorCategories(editor);
  const knownCategories = SYSTEM_COMPETITOR_CATEGORIES;
  const knownKeys = new Set(knownCategories.map(normalizeCategoryKey));
  const customCategories = categories.filter(category => !knownKeys.has(normalizeCategoryKey(category))).join(', ');
  const isEdit = Boolean(editor.id);
  return `
    <div class="modal-backdrop competitor-editor-backdrop" role="presentation">
      <section class="modal competitor-editor-modal" role="dialog" aria-modal="true" aria-labelledby="competitor-editor-title">
        <button type="button" class="profile-close" data-action="close-competitor-editor" aria-label="Zamknij formularz">&times;</button>
        <header class="editor-header">
          <span class="eyebrow">Trwa&#322;a baza zawodnik&#243;w</span>
          <h2 id="competitor-editor-title">${isEdit ? 'Edytuj zawodnika' : 'Dodaj zawodnika'}</h2>
          <p>Rekord b&#281;dzie dost&#281;pny w tych i kolejnych zawodach.</p>
        </header>
        <form class="competitor-form" data-form="competitor-editor">
          <input type="hidden" name="id" value="${escapeAttr(editor.id || '')}">
          <label class="field-full">
            <span>Imi&#281; i nazwisko</span>
            <input name="name" value="${escapeAttr(editor.name || '')}" data-competitor-editor-field autocomplete="name" required>
          </label>
          <fieldset class="category-fieldset field-full">
            <legend>Kategorie</legend>
            <div class="category-options">
              ${knownCategories.map(category => `
                <label class="category-option">
                  <input type="checkbox" name="categories" value="${escapeAttr(category)}" ${categories.some(value => normalizeCategoryKey(value) === normalizeCategoryKey(category)) ? 'checked' : ''}>
                  <span>${escapeHtml(category)}</span>
                </label>
              `).join('')}
            </div>
            <label>
              <span>Inne kategorie, oddzielone przecinkami</span>
              <input name="categoriesCustom" value="${escapeAttr(customCategories)}" data-competitor-editor-field autocomplete="off">
            </label>
          </fieldset>
          <label>
            <span>Data urodzenia</span>
            <input type="date" name="birthDate" value="${escapeAttr(editor.birthDate || '')}" data-competitor-editor-field>
          </label>
          <label>
            <span>Miejscowo&#347;&#263;</span>
            <input name="residence" value="${escapeAttr(editor.residence || '')}" data-competitor-editor-field autocomplete="address-level2">
          </label>
          <label>
            <span>Wzrost (cm)</span>
            <input name="height" value="${escapeAttr(editor.height || '')}" data-competitor-editor-field inputmode="numeric">
          </label>
          <label>
            <span>Waga (kg)</span>
            <input name="weight" value="${escapeAttr(editor.weight || '')}" data-competitor-editor-field inputmode="decimal">
          </label>
          <label class="field-full">
            <span>Osi&#261;gni&#281;cia i informacje</span>
            <textarea name="notes" rows="4" data-competitor-editor-field>${escapeHtml(editor.notes || '')}</textarea>
          </label>
          <section class="photo-editor field-full" aria-labelledby="photo-editor-title">
            <div class="photo-preview" aria-hidden="true">
              ${editor.photo ? `<img src="${escapeAttr(editor.photo)}" alt="">` : `<span>${escapeHtml(initials(editor.name || 'Nowy zawodnik'))}</span>`}
            </div>
            <div class="photo-editor__actions">
              <strong id="photo-editor-title">Zdjęcie zawodnika</strong>
              <p>Automatycznie zmniejszymy je do maks. 120 px i zapiszemy jako lekki JPEG.</p>
              <label class="secondary-button file-button">
                <span>${editor.photo ? 'Zmie&#324; zdj&#281;cie' : 'Wybierz zdj&#281;cie'}</span>
                <input type="file" accept="image/*" data-competitor-photo>
              </label>
              ${editor.photo ? '<button type="button" class="danger-button" data-action="remove-competitor-photo">Usu&#324; zdj&#281;cie</button>' : ''}
            </div>
          </section>
          <p class="form-status field-full ${editor.photoError ? 'is-error' : ''}" data-photo-status role="status">${escapeHtml(editor.photoError || editor.photoStatus || '')}</p>
          <div class="editor-actions field-full">
            <button type="button" class="secondary-button" data-action="close-competitor-editor">Anuluj</button>
            <button type="submit" class="success-button" ${editor.photoProcessing ? 'disabled' : ''}>Zapisz zawodnika</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderCompetitorSubmission() {
  const preview = state.ui.competitorSubmission;
  if (!preview) return '';
  const competitor = preview.competitor;
  const existing = competitorById(preview.matchId);
  const details = [
    ['Data urodzenia', competitor.birthDate],
    ['Miejscowość', competitor.residence],
    ['Wzrost', `${competitor.height} cm`],
    ['Waga', `${competitor.weight} kg`],
    ['Kategorie', getCompetitorCategories(competitor).join(', ') || 'Bez kategorii']
  ];
  return `
    <div class="modal-backdrop submission-backdrop" role="presentation">
      <section class="modal submission-modal" role="dialog" aria-modal="true" aria-labelledby="submission-title">
        <button type="button" class="profile-close" data-action="close-competitor-submission" aria-label="Anuluj import">&times;</button>
        <header class="submission-header">
          <span class="submission-photo">${competitor.photo ? `<img src="${escapeAttr(competitor.photo)}" alt="">` : escapeHtml(initials(competitor.name))}</span>
          <div>
            <span class="eyebrow">Zgłoszenie zawodnika</span>
            <h2 id="submission-title">${escapeHtml(competitor.name)}</h2>
            <p>${existing ? `Znaleziono rekord: ${escapeHtml(existing.name)}` : 'Nowy zawodnik w bazie'}</p>
          </div>
        </header>
        <dl class="profile-details">
          ${details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
        </dl>
        ${competitor.notes ? `<section class="profile-notes-section"><h3>Osiągnięcia i informacje</h3><p class="profile-notes">${escapeHtml(competitor.notes)}</p></section>` : ''}
        <p class="submission-safety">Import zmieni wyłącznie rekord zawodnika. Wyniki i kolejność zawodów pozostaną bez zmian.</p>
        <div class="editor-actions">
          <button type="button" class="secondary-button" data-action="close-competitor-submission">Anuluj</button>
          <button type="button" class="success-button" data-action="confirm-competitor-submission">
            ${existing ? 'Aktualizuj istniejącego' : 'Dodaj nowego zawodnika'}
          </button>
        </div>
      </section>
    </div>
  `;
}

function renderStopwatch() {
  const stopwatch = state.ui.stopwatch;
  if (!stopwatch) return '';
  const competitor = competitorById(stopwatch.competitorId);
  const elapsed = getStopwatchElapsedMs();
  return `
    <div class="stopwatch-overlay" role="dialog" aria-modal="true" aria-labelledby="stopwatch-title">
      <section class="stopwatch-panel">
        <button type="button" class="stopwatch-close" data-action="stopwatch-close" aria-label="Zamknij stoper">×</button>
        <span class="eyebrow">Stoper wyniku</span>
        <h2 id="stopwatch-title">${escapeHtml(competitor?.name || 'Zawodnik')}</h2>
        <div class="stopwatch-time" data-stopwatch-time>${formatStopwatch(elapsed)}</div>
        <button type="button" class="stopwatch-main ${stopwatch.running ? 'is-running' : ''}" data-action="stopwatch-toggle">
          ${stopwatch.running ? 'STOP' : elapsed > 0 ? 'START DALEJ' : 'START'}
        </button>
        <div class="button-row">
          <button type="button" class="secondary-button" data-action="stopwatch-reset">Reset</button>
          <button type="button" class="success-button" data-action="stopwatch-save">Zapisz wynik</button>
        </div>
      </section>
    </div>
  `;
}

async function handleClick(event) {
  if (event.target.matches('[data-profile-backdrop]')) {
    closeCompetitorProfile();
    return;
  }
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;
  const action = trigger.dataset.action;
  const id = trigger.dataset.id;
  event.preventDefault();
  if (isRapidDuplicateAction(action, trigger.dataset.guardKey ?? id)) return;

  if (action === 'go-stage') return goStage(trigger.dataset.stage);
  if (action === 'go-setup') return guardedGoSetup();
  if (action === 'go-draw') return goDraw();
  if (action === 'go-scoring') return goScoring();
  if (action === 'toggle-competitor') return toggleSelected(state.selectedCompetitorIds, id);
  if (action === 'toggle-event') return toggleEventSelection(id);
  if (action === 'move-event') return moveEventSelection(id, Number(trigger.dataset.direction));
  if (action === 'move-start-order') return moveInArray(state.startOrderIds, id, Number(trigger.dataset.direction));
  if (action === 'open-competitor-editor') return openCompetitorEditor();
  if (action === 'edit-competitor') return editCompetitor(id);
  if (action === 'close-competitor-editor') return closeCompetitorEditor();
  if (action === 'remove-competitor-photo') return removeCompetitorPhoto();
  if (action === 'close-competitor-submission') return closeCompetitorSubmission();
  if (action === 'confirm-competitor-submission') return confirmCompetitorSubmission();
  if (action === 'set-competitor-category-filter') return setCompetitorCategoryFilter(trigger.dataset.category);
  if (action === 'delete-competitor') return deleteCompetitor(id);
  if (action === 'open-competitor-profile') return openCompetitorProfile(id);
  if (action === 'close-competitor-profile') return closeCompetitorProfile();
  if (action === 'edit-event') return editEvent(id);
  if (action === 'delete-event') return deleteEvent(id);
  if (action === 'shuffle-order') return shuffleStartOrder();
  if (action === 'restore-selection-order') return restoreSelectionOrder();
  if (action === 'start-competition') return startCompetition();
  if (action === 'finalize-event') return finalizeCurrentEvent();
  if (action === 'next-event') return nextEvent();
  if (action === 'undo-event') return undoEvent();
  if (action === 'accept-result') return acceptResult(id);
  if (action === 'set-dnf') return setResult(id, '0');
  if (action === 'clear-result') return setResult(id, '');
  if (action === 'save-checkpoint') return createCheckpoint();
  if (action === 'export-state') return exportState();
  if (action === 'import-state') return importState();
  if (action === 'import-competitors') return importCompetitors();
  if (action === 'export-competitors') return exportCompetitors();
  if (action === 'import-events') return importEvents();
  if (action === 'export-events') return exportEvents();
  if (action === 'add-season-event') return openSeasonEditor();
  if (action === 'edit-season-event') return openSeasonEditor(id);
  if (action === 'delete-season-event') return deleteSeasonEvent(id);
  if (action === 'close-season-editor') return closeSeasonEditor();
  if (action === 'import-season') return importSeason();
  if (action === 'export-season') return exportSeason();
  if (action === 'export-season-html') return exportSeasonHtml(trigger);
  if (action === 'change-logo') return changeLogo();
  if (action === 'reset-logo') return resetLogo();
  if (action === 'open-reset') return openReset();
  if (action === 'close-reset') return closeReset();
  if (action === 'confirm-reset') return confirmReset();
  if (action === 'load-checkpoint') return loadCheckpointById(id);
  if (action === 'toggle-all-checkpoints') return toggleAllCheckpoints(trigger);
  if (action === 'delete-selected-checkpoints') return deleteSelectedCheckpoints();
  if (action === 'toggle-settings') return toggleSettings();
  if (action === 'check-update') return checkForUpdates();
  if (action === 'install-app') return installApp();
  if (action === 'toggle-outdoor') return toggleOutdoorMode();
  if (action === 'close-install-help') return closeInstallHelp();
  if (action === 'open-stopwatch') return openStopwatch(id);
  if (action === 'stopwatch-toggle') return toggleStopwatch();
  if (action === 'stopwatch-reset') return resetStopwatch();
  if (action === 'stopwatch-save') return saveStopwatchResult();
  if (action === 'stopwatch-close') return closeStopwatch();
  if (action === 'export-results-html') return exportResultsHtml();
  if (action === 'open-help') return openEmergencyHelp();
  if (action === 'close-help') return closeEmergencyHelp();
  if (action === 'help-show-topics') return showHelpTopics();
  if (action === 'help-select-topic') return selectHelpTopic(id);
  if (action === 'help-start-correction') return startHelpCorrection();
  if (action === 'help-resume-current') return resumeHelpCurrentEvent();
  if (action === 'help-start-reorder') return startHelpEventReorder();
  if (action === 'help-finish-reorder') return finishHelpEventReorder();
  if (action === 'help-undo-summary') return helpUndoSummary();
  if (action === 'help-open-checkpoints') return openHelpWorkspace('safety');
  if (action === 'help-open-competitors') return openHelpWorkspace('competitors');
  if (action === 'help-export-state') return helpExportState();
  if (action === 'help-return-scoring') return helpReturnScoring();
  if (action === 'help-cancel') return cancelEmergencyHelp();
  if (action === 'help-finish') return finishEmergencyHelp();
}

function isRapidDuplicateAction(action, id = '') {
  const cooldown = RAPID_ACTION_COOLDOWNS.get(action);
  if (!cooldown) return false;
  const key = rapidActionKey(action, id);
  const now = performance.now();
  const previous = recentActions.get(key) || -Infinity;
  recentActions.set(key, now);
  return now - previous < cooldown;
}

function releaseRapidAction(action, id = '') {
  recentActions.delete(rapidActionKey(action, id));
}

function rapidActionKey(action, id = '') {
  return action === 'toggle-competitor' || action === 'toggle-event' ? action : `${action}:${id}`;
}

function handleInput(event) {
  const target = event.target;
  const competitorEditorForm = target.closest('form[data-form="competitor-editor"]');
  if (competitorEditorForm && (target.matches('[data-competitor-editor-field]') || target.name === 'categories')) {
    syncCompetitorEditorFromForm(competitorEditorForm);
    return;
  }

  if (target.matches('[data-bind]')) {
    state[target.dataset.bind] = target.value;
    persist();
    return;
  }

  if (target.matches('[data-bind-number]')) {
    const value = Number.parseInt(target.value, 10);
    state[target.dataset.bindNumber] = Number.isFinite(value) && value > 0 ? value : 1;
    persist();
    return;
  }

  if (target.matches('[data-result]')) {
    const actionsVisible = Boolean(app.querySelector('.sticky-actions'));
    const draft = getCurrentDraft();
    draft[target.dataset.result] = target.value;
    persist();
    updateResultCardStatus(target);
    if (actionsVisible && !state.eventHistory[state.currentEventIndex] && !areCurrentEventResultsComplete()) {
      render();
    }
    return;
  }

  if (target.matches('[data-filter]')) {
    if (target.dataset.filter === 'competitors') state.ui.competitorSearch = target.value;
    applyFilter(target.dataset.filter, target.value);
    return;
  }

  if (target.matches('[data-help-search]')) {
    state.ui.helpSearch = target.value;
    render();
    window.setTimeout(() => {
      const input = app.querySelector('[data-help-search]');
      input?.focus({ preventScroll: true });
      if (input) input.setSelectionRange(input.value.length, input.value.length);
    });
    return;
  }

  if (target.matches('[data-reset-input]')) {
    const button = app.querySelector('[data-action="confirm-reset"]');
    if (button) button.disabled = target.value !== 'RESET';
  }
}

async function handleChange(event) {
  const target = event.target;
  if (target.matches('[data-checkpoint-id]')) return;
  if (target.matches('[data-competitor-photo]')) {
    await changeCompetitorPhoto(target.files?.[0], target.closest('form'));
  }

}

function handleSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);

  if (form.dataset.form === 'season-event') {
    saveSeasonEvent(data);
    return;
  }

  if (form.dataset.form === 'competitor-editor') {
    saveCompetitorEditor(data);
    return;
  }

  if (form.dataset.form === 'add-event') {
    const name = String(data.get('name') || '').trim();
    const type = data.get('type') === 'low' ? 'low' : 'high';
    if (!name) return flash('Wpisz nazwę konkurencji.');
    const existing = state.events.find(eventItem => normalizeKey(eventItem.name) === normalizeKey(name) && eventItem.type === type);
    if (existing) {
      if (!state.selectedEventIds.includes(existing.id)) state.selectedEventIds.push(existing.id);
      persistAndRender('Konkurencja już była w bazie, została zaznaczona.');
      return;
    }
    const eventItem = { id: makeId('event', name), name, type };
    state.events.push(eventItem);
    state.events.sort((a, b) => collator.compare(a.name, b.name));
    state.selectedEventIds.push(eventItem.id);
    persistAndRender('Dodano i zaznaczono konkurencję.');
  }
}

function handleToggle(event) {
  const details = event.target.closest('details[data-section]');
  if (!details || !state.ui) return;
  state.ui.sections[details.dataset.section] = details.open;
}

function goStage(stage) {
  if (stage === state.stage) return;
  if (isHelpWorkflowActive()) return flash('Najpierw zakończ albo anuluj aktywną procedurę Pomocy.');
  if (stage === 'setup') return guardedGoSetup();
  if (stage === 'draw') return goDraw();
  if (stage === 'scoring') return goScoring();
  if (stage === 'season') {
    state.stage = 'season';
    persistAndRender();
    return;
  }
  if (stage === 'summary') {
    if (!state.eventHistory.length) return flash('Klasyfikacja pojawi się po podsumowaniu konkurencji.');
    state.stage = 'summary';
    persistAndRender();
  }
}

function guardedGoSetup() {
  if (isHelpWorkflowActive() && state.stage !== 'setup') return flash('Najpierw zakończ albo anuluj aktywną procedurę Pomocy.');
  if (state.eventHistory.length && !window.confirm('Wrócić do przygotowania? Wyniki zostaną zachowane, ale zmiany list mogą wpłynąć na dalszą pracę.')) {
    return;
  }
  state.stage = 'setup';
  persistAndRender();
}

function goDraw() {
  if (isHelpWorkflowActive() && state.stage !== 'draw') return flash('Najpierw zakończ albo anuluj aktywną procedurę Pomocy.');
  if (state.selectedCompetitorIds.length < 2) return flash('Wybierz co najmniej 2 zawodników.');
  if (state.selectedEventIds.length < 1) return flash('Wybierz co najmniej 1 konkurencję.');
  state.startOrderIds = reconcileOrder(state.startOrderIds, state.selectedCompetitorIds);
  if (!state.startOrderIds.length) state.startOrderIds = [...state.selectedCompetitorIds];
  state.stage = 'draw';
  persistAndRender();
}

function goScoring() {
  if (isHelpWorkflowActive() && state.stage !== 'scoring') return flash('Najpierw zakończ albo anuluj aktywną procedurę Pomocy.');
  if (!state.selectedCompetitorIds.length || !state.selectedEventIds.length) return goDraw();
  state.stage = 'scoring';
  persistAndRender();
}

function toggleSelected(list, id) {
  const index = list.indexOf(id);
  if (index >= 0) list.splice(index, 1);
  else list.push(id);
  state.startOrderIds = reconcileOrder(state.startOrderIds, state.selectedCompetitorIds);
  persistAndRender();
}

function moveInArray(list, id, direction) {
  const index = list.indexOf(id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(nextIndex, 0, item);
  persistAndRender();
}

function activeEventReorderSession() {
  const session = state.ui?.emergencyHelp;
  return session?.topicId === 'reorder-events' && session.phase === 'reordering-events' ? session : null;
}

function isHelpWorkflowActive() {
  return ['editing-previous', 'ready-to-resume', 'reordering-events'].includes(state.ui?.emergencyHelp?.phase);
}

function toggleEventSelection(id) {
  if (activeEventReorderSession()) {
    flash('W trybie bezpiecznej zmiany planu można tylko przesuwać przyszłe konkurencje.');
    return;
  }
  if (state.selectedEventIds.includes(id)) delete state.eventOrderOverrides[id];
  toggleSelected(state.selectedEventIds, id);
}

function moveEventSelection(id, direction) {
  const session = activeEventReorderSession();
  if (session) {
    const index = state.selectedEventIds.indexOf(id);
    const nextIndex = index + direction;
    const lockedCount = session.origin?.lockedCount || 0;
    if (index < lockedCount || nextIndex < lockedCount) {
      flash('Ta konkurencja jest zakończona albo rozpoczęta i pozostaje zablokowana.');
      return;
    }
  }
  moveInArray(state.selectedEventIds, id, direction);
}

function openEmergencyHelp() {
  state.ui.settingsOpen = false;
  if (state.ui.emergencyHelp) {
    state.ui.emergencyHelp.open = true;
  } else {
    state.ui.emergencyHelp = { open: true, topicId: '', phase: 'topics', checkpointId: '', origin: null };
  }
  render();
  window.setTimeout(() => app.querySelector('[data-help-search], .help-primary-action button')?.focus(), 60);
}

function closeEmergencyHelp() {
  if (!state.ui.emergencyHelp) return;
  state.ui.emergencyHelp.open = false;
  render();
}

function showHelpTopics() {
  const session = state.ui.emergencyHelp;
  if (session && ['editing-previous', 'ready-to-resume', 'reordering-events'].includes(session.phase)) {
    if (!window.confirm('Przerwać bieżącą procedurę i przywrócić automatyczny punkt bezpieczeństwa?')) return;
    restoreHelpCheckpoint(session, true);
    return;
  }
  state.ui.emergencyHelp = { open: true, topicId: '', phase: 'topics', checkpointId: '', origin: null };
  render();
}

function selectHelpTopic(topicId) {
  const topic = getEmergencyHelpTopics(helpContext()).find(item => item.id === topicId);
  if (!topic?.available) return flash(topic?.reason || 'Ta procedura nie jest dostępna w aktualnym stanie.');

  let checkpoint;
  try {
    checkpoint = saveCheckpoint(state, `POMOC · ${topic.title} · ${new Date().toLocaleString('pl-PL')}`);
  } catch (error) {
    reportPersistenceFailure(error);
    flash('Nie udało się utworzyć punktu bezpieczeństwa. Procedura nie została rozpoczęta.');
    return;
  }

  const event = currentEvent();
  const draft = event ? state.drafts[event.id] || {} : {};
  const draftCount = Object.values(draft).filter(value => String(value || '').trim()).length;
  const currentOrderIds = event ? getOrderForEvent(state.currentEventIndex) : [];
  const currentStarted = state.stage === 'scoring' && !state.eventHistory[state.currentEventIndex] && state.currentEventIndex === state.eventHistory.length;
  const lockedCount = Math.min(
    state.selectedEventIds.length,
    Math.max(state.eventHistory.length, currentStarted ? state.currentEventIndex + 1 : state.eventHistory.length)
  );
  const previousEvent = eventById(state.selectedEventIds[Math.max(0, state.currentEventIndex - 1)]);
  state.ui.emergencyHelp = {
    open: true,
    topicId,
    phase: 'overview',
    checkpointId: checkpoint.id,
    origin: {
      stage: state.stage,
      currentEventIndex: state.currentEventIndex,
      currentEventId: event?.id || '',
      currentEventName: event?.name || '',
      previousEventName: previousEvent?.name || '',
      orderIds: [...currentOrderIds],
      draftCount,
      currentStarted,
      lockedCount,
      lockedEventIds: state.selectedEventIds.slice(0, lockedCount),
      selectedEventIds: [...state.selectedEventIds]
    }
  };
  render();
}

function startHelpCorrection() {
  const session = state.ui.emergencyHelp;
  if (session?.topicId !== 'correct-previous-result' || state.currentEventIndex < 1) return;
  const origin = session.origin;
  const previousIndex = origin.currentEventIndex - 1;
  if (origin.currentStarted && origin.currentEventId) {
    state.eventOrderOverrides[origin.currentEventId] = [...origin.orderIds];
  }
  state.eventHistory = state.eventHistory.slice(0, previousIndex);
  state.currentEventIndex = previousIndex;
  state.scores = buildScores(state.selectedCompetitorIds, state.eventHistory);
  state.stage = 'scoring';
  releaseRapidAction('finalize-event', String(previousIndex));
  session.phase = 'editing-previous';
  session.open = false;
  persistAndRender('Poprzednia konkurencja jest otwarta do poprawy. Po zmianie podsumuj ją ponownie.');
}

function resumeHelpCurrentEvent() {
  const session = state.ui.emergencyHelp;
  if (session?.topicId !== 'correct-previous-result' || session.phase !== 'ready-to-resume') return;
  const targetIndex = state.selectedEventIds.indexOf(session.origin.currentEventId);
  if (targetIndex < 0) return flash('Nie znaleziono przerwanej konkurencji w aktualnym programie.');
  state.currentEventIndex = targetIndex;
  state.stage = 'scoring';
  session.phase = 'complete';
  session.open = true;
  session.completionMessage = `Wrócono do konkurencji „${session.origin.currentEventName}”. ${session.origin.draftCount} wcześniej wpisanych wyników pozostało w formularzu.`;
  session.preservedMessage = 'Szkic oraz kolejność przerwanej konkurencji';
  session.recalculatedMessage = 'Poprzednia konkurencja i klasyfikacja łączna';
  persistAndRender();
}

function startHelpEventReorder() {
  const session = state.ui.emergencyHelp;
  if (session?.topicId !== 'reorder-events') return;
  session.phase = 'reordering-events';
  session.open = false;
  state.stage = 'setup';
  state.ui.sections = { ...state.ui.sections, competition: false, competitors: false, events: true, safety: false };
  persistAndRender('Zmieniaj tylko odblokowane, przyszłe konkurencje.');
}

function finishHelpEventReorder() {
  const session = activeEventReorderSession();
  if (!session) return;
  const lockedCount = session.origin.lockedCount || 0;
  const lockedStillValid = session.origin.lockedEventIds.every((id, index) => state.selectedEventIds[index] === id);
  if (!lockedStillValid) {
    flash('Chroniona część programu zmieniła się. Anuluj procedurę i przywróć punkt bezpieczeństwa.');
    return;
  }
  const targetIndex = session.origin.currentStarted
    ? state.selectedEventIds.indexOf(session.origin.currentEventId)
    : Math.min(state.eventHistory.length, Math.max(state.selectedEventIds.length - 1, 0));
  if (targetIndex < 0 || targetIndex < Math.max(0, lockedCount - (session.origin.currentStarted ? 1 : 0))) {
    flash('Nie można ustalić bezpiecznej konkurencji do wznowienia.');
    return;
  }
  state.currentEventIndex = targetIndex;
  state.stage = 'scoring';
  session.phase = 'complete';
  session.open = true;
  session.completionMessage = `Nowy plan zapisany. Aktywna konkurencja: „${currentEvent()?.name || 'brak'}”. Finał: „${eventById(state.selectedEventIds.at(-1))?.name || 'brak'}”.`;
  session.preservedMessage = `${lockedCount} chronionych pozycji programu oraz wszystkie wyniki`;
  session.recalculatedMessage = 'Tylko kolejność przyszłych konkurencji';
  persistAndRender();
}

function helpUndoSummary() {
  const session = state.ui.emergencyHelp;
  if (!session || !state.eventHistory.length) return;
  state.eventHistory.pop();
  state.currentEventIndex = Math.max(0, state.eventHistory.length);
  state.scores = buildScores(state.selectedCompetitorIds, state.eventHistory);
  state.stage = 'scoring';
  session.phase = 'complete';
  session.open = true;
  session.completionMessage = 'Ostatnie podsumowanie cofnięto. Wpisane wyniki pozostały w formularzu do kontroli.';
  persistAndRender();
}

function openHelpWorkspace(section) {
  const session = state.ui.emergencyHelp;
  if (!session) return;
  state.stage = 'setup';
  state.ui.sections = { ...state.ui.sections, [section]: true };
  session.phase = 'complete';
  session.open = false;
  persistAndRender(section === 'safety' ? 'Sprawdź datę punktu kontrolnego przed wczytaniem.' : 'Baza zawodników została otwarta.');
  window.setTimeout(() => app.querySelector(`details[data-section="${cssEscape(section)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function helpExportState() {
  const session = state.ui.emergencyHelp;
  exportState();
  if (!session) return;
  session.phase = 'complete';
  session.open = true;
  session.completionMessage = 'Pełny plik stanu został przygotowany. Zaimportuj go na drugim urządzeniu i kontynuuj pracę tylko tam.';
  render();
}

function helpReturnScoring() {
  const session = state.ui.emergencyHelp;
  if (!session) return;
  if (state.selectedCompetitorIds.length && state.selectedEventIds.length) state.stage = 'scoring';
  session.phase = 'complete';
  session.open = true;
  session.completionMessage = 'Możesz kontynuować offline. W razie awarii stopera wpisz ręcznie czas z urządzenia zapasowego.';
  persistAndRender();
}

function cancelEmergencyHelp() {
  const session = state.ui.emergencyHelp;
  if (!session) return;
  if (['editing-previous', 'ready-to-resume', 'reordering-events'].includes(session.phase)) {
    if (!window.confirm('Anulować procedurę i przywrócić automatyczny punkt bezpieczeństwa? Zmiany wykonane w ramach Pomocy zostaną cofnięte.')) return;
    restoreHelpCheckpoint(session, false);
    return;
  }
  state.ui.emergencyHelp = null;
  render();
}

function finishEmergencyHelp() {
  state.ui.emergencyHelp = null;
  render();
}

function restoreHelpCheckpoint(session, showTopics) {
  const checkpoint = loadCheckpoints().find(item => item.id === session?.checkpointId);
  if (!checkpoint) {
    flash('Nie znaleziono automatycznego punktu bezpieczeństwa. Stan nie został zmieniony.');
    return false;
  }
  const snapshot = { ...checkpoint.snapshot };
  if (!Object.prototype.hasOwnProperty.call(snapshot, 'logoData')) snapshot.logoData = state.logoData;
  state = hydrateState(snapshot, loadCompetitorDatabase(), loadSeasonDatabase());
  state.ui = createUiState();
  if (showTopics) state.ui.emergencyHelp = { open: true, topicId: '', phase: 'topics', checkpointId: '', origin: null };
  persistAndRender(showTopics ? 'Przywrócono stan sprzed procedury. Wybierz inny temat.' : 'Procedura anulowana. Przywrócono punkt bezpieczeństwa.', { competitorsChanged: true });
  return true;
}

function shuffledCopy(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function delay(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function editCompetitor(id) {
  openCompetitorEditor(id);
}

function openCompetitorEditor(id = '') {
  const existing = id ? competitorById(id) : null;
  state.ui.competitorEditor = normalizeCompetitorRecord(existing || {
    id: '',
    name: '',
    category: '',
    categories: [],
    birthDate: '',
    residence: '',
    height: '',
    weight: '',
    notes: '',
    photo: '',
    dataWarnings: []
  }) || {
    id: '', name: '', category: '', categories: [], birthDate: '', residence: '', height: '', weight: '', notes: '', photo: '', dataWarnings: []
  };
  if (!existing) state.ui.competitorEditor.id = '';
  state.ui.competitorEditor.photoStatus = '';
  state.ui.competitorEditor.photoError = '';
  state.ui.competitorEditor.photoProcessing = false;
  state.ui.competitorEditor.photoRemoved = false;
  render();
  window.setTimeout(() => app.querySelector('[data-form="competitor-editor"] input[name="name"]')?.focus(), 30);
}

function closeCompetitorEditor() {
  state.ui.competitorEditor = null;
  render();
}

function syncCompetitorEditorFromForm(form) {
  const editor = state.ui.competitorEditor;
  if (!editor || !form) return;
  const data = new FormData(form);
  ['name', 'birthDate', 'residence', 'height', 'weight', 'notes'].forEach(field => {
    editor[field] = String(data.get(field) || '').trim();
  });
  editor.categories = competitorEditorCategories(data);
  editor.category = editor.categories[0] || '';
}

function competitorEditorCategories(data) {
  const systemByKey = new Map(SYSTEM_COMPETITOR_CATEGORIES.map(category => [normalizeCategoryKey(category), category]));
  const categories = new Map();
  data.getAll('categories').forEach(value => {
    const key = normalizeCategoryKey(value);
    const label = systemByKey.get(key);
    if (label) categories.set(key, label);
  });
  String(data.get('categoriesCustom') || '').split(/[;,|]/g).forEach(value => {
    const label = String(value || '').trim().replace(/\s+/g, ' ');
    const key = normalizeCategoryKey(label);
    if (!key || key === 'bez kategorii' || key === 'aktywny zawodnik' || systemByKey.has(key) || categories.has(key)) return;
    categories.set(key, label);
  });
  return [...categories.values()];
}

async function changeCompetitorPhoto(file, form) {
  const editor = state.ui.competitorEditor;
  if (!editor || !file) return;
  syncCompetitorEditorFromForm(form);
  editor.photoProcessing = true;
  editor.photoError = '';
  editor.photoStatus = 'Przetwarzam zdj\u0119cie...';
  const status = app.querySelector('[data-photo-status]');
  if (status) status.textContent = editor.photoStatus;
  const submit = form?.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const result = await processCompetitorPhoto(file);
    editor.photo = result.dataUrl;
    editor.photoRemoved = false;
    editor.photoStatus = `Gotowe: ${result.width} x ${result.height} px, ${(result.bytes / 1024).toFixed(1)} KB.`;
  } catch (error) {
    editor.photoError = error?.message || 'Nie uda\u0142o si\u0119 przetworzy\u0107 zdj\u0119cia.';
    editor.photoStatus = '';
  } finally {
    editor.photoProcessing = false;
    render();
  }
}

function removeCompetitorPhoto() {
  const editor = state.ui.competitorEditor;
  if (!editor) return;
  const form = app.querySelector('[data-form="competitor-editor"]');
  syncCompetitorEditorFromForm(form);
  editor.photo = '';
  editor.photoRemoved = true;
  editor.photoError = '';
  editor.photoStatus = 'Zdj\u0119cie zostanie usuni\u0119te po zapisaniu formularza.';
  render();
}

function saveCompetitorEditor(data) {
  const editor = state.ui.competitorEditor;
  if (!editor || editor.photoProcessing) return;
  const name = String(data.get('name') || '').trim().replace(/\s+/g, ' ');
  if (!name) return flash('Wpisz imi\u0119 i nazwisko zawodnika.');
  const id = String(data.get('id') || editor.id || '');
  const duplicate = state.competitors.find(item => item.id !== id && normalizeCompetitorKey(item.name) === normalizeCompetitorKey(name));
  if (id && duplicate) return flash('Inny zawodnik o tym imieniu i nazwisku ju\u017c istnieje.');
  if (!id && duplicate) {
    if (!state.selectedCompetitorIds.includes(duplicate.id)) state.selectedCompetitorIds.push(duplicate.id);
    state.ui.competitorEditor = null;
    persistAndRender('Zawodnik ju\u017c istnieje w bazie i zosta\u0142 zaznaczony.');
    return;
  }

  const categories = competitorEditorCategories(data);
  const source = {
    id: id || makeId('competitor', name),
    name,
    category: categories[0] || '',
    categories,
    birthDate: String(data.get('birthDate') || '').trim(),
    residence: String(data.get('residence') || '').trim(),
    height: String(data.get('height') || '').trim(),
    weight: String(data.get('weight') || '').trim(),
    notes: String(data.get('notes') || '').trim(),
    photo: editor.photo || '',
    dataWarnings: editor.dataWarnings || []
  };
  const previousName = id ? competitorById(id)?.name : '';
  const result = upsertCompetitorRecord(state.competitors, source, { mode: 'preferIncoming', categoriesMode: 'replace' });
  if (editor.photoRemoved) result.competitor.photo = '';
  state.competitors = sortCompetitors(result.records);
  const competitorId = result.competitor.id;
  if (!state.selectedCompetitorIds.includes(competitorId)) state.selectedCompetitorIds.push(competitorId);
  state.startOrderIds = reconcileOrder(state.startOrderIds, state.selectedCompetitorIds);
  if (previousName && previousName !== result.competitor.name) renameCompetitorInHistory(competitorId, result.competitor.name);
  state.ui.competitorEditor = null;
  persistAndRender(result.added ? 'Dodano zawodnika do zawod\u00f3w i trwa\u0142ej bazy.' : 'Dane zawodnika zapisane w trwa\u0142ej bazie.', { competitorsChanged: true });
}

function openCompetitorProfile(id) {
  if (!competitorById(id)) return;
  state.ui.profileCompetitorId = id;
  render();
  window.setTimeout(() => app.querySelector('[data-action="close-competitor-profile"]')?.focus(), 30);
}

function closeCompetitorProfile() {
  state.ui.profileCompetitorId = null;
  render();
}

function deleteCompetitor(id) {
  const competitor = competitorById(id);
  if (!competitor) return;
  const selected = state.selectedCompetitorIds.includes(id);
  const used = state.eventHistory.some(event => event.orderIds?.includes(id) || event.results?.some(result => result.id === id));
  const warning = used
    ? `Usunąć zawodnika ${competitor.name}? Zostanie usunięty także z kolejności, wyników i historii rozegranych konkurencji.`
    : selected
      ? `Usunąć zawodnika ${competitor.name} z bazy i listy startowej?`
      : `Usunąć zawodnika ${competitor.name} z bazy?`;
  if (!window.confirm(warning)) return;

  state.competitors = state.competitors.filter(item => item.id !== id);
  state.selectedCompetitorIds = state.selectedCompetitorIds.filter(itemId => itemId !== id);
  state.startOrderIds = state.startOrderIds.filter(itemId => itemId !== id);
  Object.values(state.drafts || {}).forEach(draft => delete draft[id]);
  state.eventHistory = state.eventHistory.map(event => ({
    ...event,
    orderIds: (event.orderIds || []).filter(itemId => itemId !== id),
    results: (event.results || []).filter(result => result.id !== id)
  }));
  state.scores = buildScores(state.selectedCompetitorIds, state.eventHistory);
  state.currentEventIndex = Math.max(0, Math.min(state.currentEventIndex, Math.max(state.selectedEventIds.length - 1, 0)));
  persistAndRender('Zawodnik usunięty.', { competitorsChanged: true });
}

function editEvent(id) {
  if (activeEventReorderSession()) return flash('Podczas bezpiecznej zmiany planu edycja treści konkurencji jest zablokowana.');
  const event = eventById(id);
  if (!event) return;
  const summarized = state.eventHistory.some(item => item.eventId === id);
  const name = window.prompt('Nazwa konkurencji:', event.name);
  if (name === null) return;
  const trimmedName = name.trim();
  if (!trimmedName) return flash('Nazwa konkurencji nie może być pusta.');

  const typeInput = window.prompt('Typ punktacji: high = więcej lepiej, low = mniej lepiej', event.type);
  if (typeInput === null) return;
  const type = typeInput.trim().toLowerCase() === 'low' ? 'low' : 'high';
  if (summarized && type !== event.type) {
    return flash('Nie zmieniam typu punktacji po podsumowaniu. Cofnij podsumowanie tej konkurencji i edytuj ponownie.');
  }

  const duplicate = state.events.find(item => item.id !== id && normalizeKey(item.name) === normalizeKey(trimmedName) && item.type === type);
  if (duplicate) return flash('Taka konkurencja już istnieje.');

  event.name = trimmedName;
  event.type = type;
  state.events.sort((a, b) => collator.compare(a.name, b.name));
  state.eventHistory = state.eventHistory.map(item => item.eventId === id ? { ...item, name: item.isFinal ? `${trimmedName} (FINAŁ)` : trimmedName, type } : item);
  persistAndRender('Konkurencja zapisana.');
}

function deleteEvent(id) {
  if (activeEventReorderSession()) return flash('Podczas bezpiecznej zmiany planu usuwanie konkurencji jest zablokowane.');
  const event = eventById(id);
  if (!event) return;
  const selected = state.selectedEventIds.includes(id);
  const used = state.eventHistory.some(item => item.eventId === id);
  const warning = used
    ? `Usunąć konkurencję ${event.name}? Zostanie usunięta także z historii wyników.`
    : selected
      ? `Usunąć konkurencję ${event.name} z bazy i programu zawodów?`
      : `Usunąć konkurencję ${event.name} z bazy?`;
  if (!window.confirm(warning)) return;

  state.events = state.events.filter(item => item.id !== id);
  state.selectedEventIds = state.selectedEventIds.filter(itemId => itemId !== id);
  delete state.drafts[id];
  delete state.eventOrderOverrides[id];
  state.eventHistory = state.eventHistory
    .filter(item => item.eventId !== id)
    .map((item, index) => ({ ...item, nr: index + 1 }));
  state.currentEventIndex = Math.max(0, Math.min(state.currentEventIndex, Math.max(state.selectedEventIds.length - 1, 0)));
  state.scores = buildScores(state.selectedCompetitorIds, state.eventHistory);
  persistAndRender('Konkurencja usunięta.');
}

async function shuffleStartOrder() {
  if (state.ui.drawAnimation) return;
  const baseOrder = getStartOrderIds();
  if (baseOrder.length < 2) return flash('Do losowania potrzeba co najmniej 2 zawodników.');

  let animatedOrder = [...baseOrder];
  for (let step = 0; step < 12; step++) {
    animatedOrder = shuffledCopy(animatedOrder);
    state.ui.drawAnimation = {
      step,
      orderIds: animatedOrder
    };
    render();
    await delay(step < 8 ? 130 : 210);
  }

  state.startOrderIds = shuffledCopy(baseOrder);
  state.ui.drawAnimation = null;
  state.drawUsed = true;
  persistAndRender('Kolejność została wylosowana.');
}

function restoreSelectionOrder() {
  state.ui.drawAnimation = null;
  state.startOrderIds = [...state.selectedCompetitorIds];
  state.drawUsed = false;
  persistAndRender('Przywrócono kolejność wyboru zawodników.');
}

function startCompetition() {
  if (!state.drawUsed && !window.confirm('Rozpocząć zawody bez losowania? Zostanie użyta ręczna kolejność wyboru zawodników.')) {
    return;
  }
  if (state.eventHistory.length && !window.confirm('Rozpocząć zawody od nowa? Dotychczasowe podsumowania konkurencji zostaną usunięte.')) {
    return;
  }
  state.startOrderIds = getStartOrderIds();
  state.currentEventIndex = 0;
  state.eventHistory = [];
  state.drafts = {};
  state.eventOrderOverrides = {};
  state.scores = {};
  state.stage = 'scoring';
  persistAndRender('Zawody rozpoczęte.');
}

function finalizeCurrentEvent() {
  const event = currentEvent();
  if (!event) {
    releaseRapidAction('finalize-event', String(state.currentEventIndex));
    return;
  }
  const orderIds = getOrderForEvent(state.currentEventIndex);
  const draft = getCurrentDraft();
  const missing = orderIds.filter(id => !String(draft[id] || '').trim());
  const existing = state.eventHistory[state.currentEventIndex];

  if (existing && !window.confirm('Nadpisać zapisane podsumowanie tej konkurencji? Późniejsze podsumowania zostaną usunięte.')) {
    releaseRapidAction('finalize-event', String(state.currentEventIndex));
    return;
  }

  if (missing.length && !window.confirm(`Brakuje ${missing.length} wyników. Potraktować je jako DNF / 0?`)) {
    releaseRapidAction('finalize-event', String(state.currentEventIndex));
    return;
  }
  missing.forEach(id => {
    draft[id] = '0';
  });

  const rows = orderIds.map(id => ({
    id,
    name: competitorById(id)?.name || 'Zawodnik',
    result: String(draft[id] || '0')
  }));
  const calculated = calculateEventPoints(rows, orderIds.length, event.type);
  if (calculated.error) {
    releaseRapidAction('finalize-event', String(state.currentEventIndex));
    flash('Niektóre wyniki mają błędny format. Popraw je przed podsumowaniem.');
    return;
  }

  state.eventHistory = state.eventHistory.slice(0, state.currentEventIndex);
  state.eventHistory[state.currentEventIndex] = {
    nr: state.currentEventIndex + 1,
    eventId: event.id,
    name: isFinalEventIndex(state.currentEventIndex) ? `${event.name} (FINAŁ)` : event.name,
    type: event.type,
    isFinal: isFinalEventIndex(state.currentEventIndex),
    finalistsLimit: isFinalEventIndex(state.currentEventIndex) ? orderIds.length : null,
    orderIds: [...orderIds],
    createdAt: new Date().toISOString(),
    results: calculated.results
  };
  state.scores = buildScores(state.selectedCompetitorIds, state.eventHistory);
  const helpSession = state.ui.emergencyHelp;
  if (
    helpSession?.topicId === 'correct-previous-result' &&
    helpSession.phase === 'editing-previous' &&
    helpSession.origin?.currentEventIndex === state.currentEventIndex + 1
  ) {
    helpSession.phase = 'ready-to-resume';
    helpSession.open = true;
    persistAndRender('Poprawiona konkurencja została podsumowana. Wróć do przerwanej konkurencji.');
    return;
  }
  persistAndRender('Podsumowanie konkurencji zapisane.');
}

function nextEvent() {
  if (!state.eventHistory[state.currentEventIndex]) {
    flash('Najpierw podsumuj aktualną konkurencję.');
    return;
  }
  if (state.currentEventIndex >= state.selectedEventIds.length - 1) {
    state.stage = 'summary';
  } else {
    const nextIndex = state.currentEventIndex + 1;
    if (isFinalEventIndex(nextIndex)) {
      const finalists = getFinalOrderIds();
      const leader = competitorById(finalists[finalists.length - 1]);
      if (!window.confirm(
        `Następna konkurencja jest FINAŁEM.\n\n` +
        `Do finału wchodzi top ${finalists.length} zawodników.\n` +
        `Kolejność startu będzie odwrócona: lider ${leader?.name || 'zawodów'} startuje jako ostatni.\n\n` +
        `Czy przejść do finału?`
      )) {
        return;
      }
    }
    state.currentEventIndex = nextIndex;
    state.stage = 'scoring';
  }
  persistAndRender();
}

function undoEvent() {
  if (!state.eventHistory.length) return;
  if (!window.confirm('Cofnąć ostatnie podsumowanie konkurencji? Wpisane wyniki zostaną w formularzu.')) return;
  state.eventHistory.pop();
  state.currentEventIndex = Math.max(0, state.eventHistory.length);
  state.scores = buildScores(state.selectedCompetitorIds, state.eventHistory);
  state.stage = 'scoring';
  persistAndRender('Cofnięto ostatnie podsumowanie.');
}

function acceptResult(id) {
  const input = app.querySelector(`[data-result="${cssEscape(id)}"]`);
  const draft = getCurrentDraft();
  if (!String(draft[id] || '').trim()) {
    flash('Wpisz wynik albo wybierz DNF / 0.');
    focusResultInput(id);
    return;
  }

  if (input) {
    input.closest('.result-card')?.classList.add('has-value');
    input.blur();
  }

  if (focusNextPendingResult(id)) {
    flash('Wynik zapisany. Następny zawodnik.');
    return;
  }

  render();
  window.setTimeout(() => {
    app.querySelector('.sticky-actions')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, 80);
  flash('Wszystkie wyniki wpisane. Możesz podsumować konkurencję.');
}

function setResult(id, value) {
  const draft = getCurrentDraft();
  draft[id] = value;
  persist();
  render();
  if (String(value || '').trim()) {
    window.setTimeout(() => {
      if (!focusNextPendingResult(id)) {
        app.querySelector('.sticky-actions')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 80);
  }
}

function createCheckpoint() {
  try {
    saveCheckpoint(state, `${state.eventName || 'Zawody'} · ${new Date().toLocaleString('pl-PL')}`);
  } catch (error) {
    reportPersistenceFailure(error);
    return;
  }
  persistAndRender('Punkt kontrolny zapisany.');
}

function exportState() {
  const filename = safeFilename(`${state.eventName || 'zawody'}_strongman_next_${timestamp()}.json`);
  downloadJson(filename, state);
  flash('Eksport przygotowany.');
}

async function importState() {
  const file = await pickJsonFile();
  if (!file) return;
  const importedFile = await tryReadJsonFile(file, 'stanu zawodów');
  if (!importedFile.ok) return;
  const json = importedFile.data;
  if (!json || typeof json !== 'object' || !json.schemaVersion) {
    flash('To nie wygląda jak plik stanu Strongman Next.');
    return;
  }
  if (!window.confirm('Wczytać stan z pliku i zastąpić aktualny stan aplikacji?')) return;
  state = hydrateState(json, loadCompetitorDatabase(), loadSeasonDatabase());
  state.ui = createUiState();
  persistAndRender('Stan został wczytany.', { competitorsChanged: true });
}

async function importCompetitors() {
  const file = await pickJsonFile();
  if (!file) return;
  const importedFile = await tryReadJsonFile(file, 'bazy zawodników');
  if (!importedFile.ok) return;
  const json = importedFile.data;
  if (json?.type === 'competitor-submission') {
    openCompetitorSubmission(json);
    return;
  }
  const rawItems = Array.isArray(json) ? json : json.competitors || [];
  const imported = normalizeCompetitors(rawItems);
  if (!imported.length) return flash('Nie znaleziono zawodników w pliku.');
  const categoryPayload = collectCategoryPayload(rawItems);
  const result = mergeCompetitors(imported, categoryPayload);
  persistAndRender(`Import zawodników: ${result.added} dodano, ${result.updated} zaktualizowano, ${result.unchanged} bez zmian.`, { competitorsChanged: true });
}

async function tryReadJsonFile(file, label) {
  try {
    return { ok: true, data: await readJsonFile(file) };
  } catch (error) {
    console.error(`[Strongman Next] Nie udało się odczytać ${label}:`, error);
    flash(`Nie udało się odczytać ${label}. Sprawdź format i kompletność pliku.`);
    return { ok: false, data: null };
  }
}

function collectCategoryPayload(rawItems) {
  const ids = new Set();
  const names = new Set();
  (Array.isArray(rawItems) ? rawItems : []).forEach(item => {
    if (!item || typeof item !== 'object') return;
    const hasCategories = Object.prototype.hasOwnProperty.call(item, 'categories') || Object.prototype.hasOwnProperty.call(item, 'category');
    if (!hasCategories) return;
    if (item.id) ids.add(String(item.id));
    if (item.name) names.add(normalizeCompetitorKey(item.name));
  });
  return { ids, names };
}

function openCompetitorSubmission(json) {
  const normalized = normalizeSubmissionFile(json);
  if (!normalized.ok) {
    flash(normalized.error);
    return;
  }
  const competitor = normalized.competitor;
  const idMatch = competitor.id ? competitorById(competitor.id) : null;
  const identityMatch = state.competitors.find(item =>
    normalizeCompetitorKey(item.name) === normalizeCompetitorKey(competitor.name) &&
    String(item.birthDate || '') === competitor.birthDate
  );
  state.ui.competitorSubmission = {
    competitor,
    matchId: idMatch?.id || identityMatch?.id || ''
  };
  render();
}

function normalizeSubmissionFile(json) {
  if (!json || json.schemaVersion !== 1 || json.type !== 'competitor-submission' || !json.competitor || typeof json.competitor !== 'object') {
    return { ok: false, error: 'To nie jest prawidłowy plik zgłoszenia zawodnika.' };
  }
  const source = json.competitor;
  const name = normalizeSubmissionText(source.name);
  const birthDate = String(source.birthDate || '').trim();
  const residence = normalizeSubmissionText(source.residence);
  const height = normalizePositiveNumber(source.height);
  const weight = normalizePositiveNumber(source.weight);
  const photo = String(source.photo || '').trim();
  if (!name) return { ok: false, error: 'Zgłoszenie nie zawiera imienia i nazwiska.' };
  if (!isValidIsoDate(birthDate)) return { ok: false, error: 'Zgłoszenie zawiera nieprawidłową datę urodzenia.' };
  if (!residence) return { ok: false, error: 'Zgłoszenie nie zawiera miejscowości.' };
  if (!height || !weight) return { ok: false, error: 'Wzrost i waga muszą być dodatnimi wartościami.' };
  if (!photo.startsWith('data:image/jpeg;base64,') || estimateDataUrlBytes(photo) > 20 * 1024) {
    return { ok: false, error: 'Zdjęcie w zgłoszeniu ma nieprawidłowy format albo jest zbyt duże.' };
  }

  const systemByKey = new Map(SYSTEM_COMPETITOR_CATEGORIES.map(category => [normalizeCategoryKey(category), category]));
  const categories = getCompetitorCategories(source).map(category =>
    systemByKey.get(normalizeCategoryKey(category)) || normalizeSubmissionText(category)
  );
  const competitor = normalizeCompetitorRecord({
    ...source,
    id: source.id ? String(source.id) : 'submission-preview',
    name,
    birthDate,
    residence,
    height,
    weight,
    notes: normalizeSubmissionText(source.notes),
    category: categories[0] || '',
    categories,
    photo
  });
  competitor.id = source.id ? String(source.id) : '';
  return { ok: true, competitor };
}

function closeCompetitorSubmission() {
  state.ui.competitorSubmission = null;
  render();
}

function confirmCompetitorSubmission() {
  const preview = state.ui.competitorSubmission;
  if (!preview) return;
  const existing = competitorById(preview.matchId);
  const source = {
    ...preview.competitor,
    id: existing?.id || makeId('competitor', preview.competitor.name),
    category: preview.competitor.categories[0] || ''
  };
  const previousName = existing?.name || '';
  const result = upsertCompetitorRecord(state.competitors, source, {
    mode: 'preferIncoming',
    categoriesMode: 'replace',
    matchByName: Boolean(existing)
  });
  state.competitors = sortCompetitors(result.records);
  if (existing && previousName !== result.competitor.name) renameCompetitorInHistory(existing.id, result.competitor.name);
  state.ui.competitorSubmission = null;
  persistAndRender(existing ? 'Zaktualizowano istniejącego zawodnika.' : 'Dodano nowego zawodnika do trwałej bazy.', { competitorsChanged: true });
}

function normalizeSubmissionText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pl-PL');
}

function normalizePositiveNumber(value) {
  const normalized = String(value || '').trim().replace(',', '.');
  const parsed = /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : '';
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function exportCompetitors() {
  saveCompetitorDatabase(state.competitors);
  downloadJson(`zawodnicy_${timestamp()}.json`, loadCompetitorDatabase() || state.competitors);
}

async function importEvents() {
  const file = await pickJsonFile();
  if (!file) return;
  const importedFile = await tryReadJsonFile(file, 'bazy konkurencji');
  if (!importedFile.ok) return;
  const json = importedFile.data;
  const imported = normalizeEvents(Array.isArray(json) ? json : json.events || []);
  if (!imported.length) return flash('Nie znaleziono konkurencji w pliku.');
  mergeEvents(imported);
  persistAndRender(`Zaimportowano konkurencje: ${imported.length}.`);
}

function exportEvents() {
  downloadJson(`konkurencje_${timestamp()}.json`, state.events);
}

function openSeasonEditor(id = '', seed = null) {
  const source = seed || state.seasonEvents.find(event => event.id === id) || {
    id: '',
    date: state.eventDate || '',
    location: state.eventLocation || '',
    sourceFile: '',
    ranking: []
  };
  state.ui.seasonEditor = structuredClone(source);
  render();
  window.setTimeout(() => app.querySelector('.season-editor-modal input:not([type="hidden"])')?.focus(), 60);
}

function closeSeasonEditor() {
  state.ui.seasonEditor = null;
  render();
}

function saveSeasonEvent(data) {
  const id = String(data.get('id') || '').trim();
  const date = String(data.get('date') || '').trim();
  const location = String(data.get('location') || '').trim();
  const sourceFile = String(data.get('sourceFile') || '').trim();
  const ranking = Array.from({ length: 5 }, (_, index) => {
    const typedName = String(data.get(`competitor-${index}`) || '').trim();
    const existing = state.competitors.find(competitor => normalizeKey(competitor.name) === normalizeKey(typedName));
    const name = existing?.name || typedName;
    return {
      position: Number.parseInt(data.get(`position-${index}`), 10),
      competitorId: existing?.id || '',
      name,
      sourceName: typedName,
      seasonPoints: seasonPointsForPosition(data.get(`position-${index}`)),
      competitionPoints: Number(data.get(`competitionPoints-${index}`) || 0),
    };
  });

  if (!date || !location) return flash('Wpisz datę i miejscowość zawodów.');
  if (ranking.some(row => !row.name || row.position < 1 || row.position > 5)) {
    return flash('Wpisz pięciu zawodników i prawidłowe lokaty 1-5.');
  }
  if (new Set(ranking.map(row => normalizeKey(row.name))).size !== ranking.length) {
    return flash('Ten sam zawodnik nie może wystąpić dwa razy w jednej klasyfikacji.');
  }
  const sortedPositions = ranking.map(row => row.position).sort((a, b) => a - b);
  if (sortedPositions[0] !== 1 || sortedPositions.some((position, index) => index > 0 && position !== sortedPositions[index - 1] && position !== index + 1)) {
    return flash('Popraw układ lokat. Po remisie następna lokata musi uwzględniać liczbę zawodników, np. 1, 2, 2, 4, 5.');
  }

  const duplicate = state.seasonEvents.find(event => event.id !== id && event.date === date && normalizeKey(event.location) === normalizeKey(location));
  if (duplicate && !window.confirm(`Zawody ${duplicate.location} z dnia ${formatSeasonDate(duplicate.date)} już istnieją. Zastąpić je?`)) return;

  ranking.forEach(row => {
    let competitor = state.competitors.find(item => normalizeKey(item.name) === normalizeKey(row.name));
    if (!competitor) {
      competitor = {
        id: makeId('competitor', row.name),
        name: row.name,
        category: 'Puchar Polski',
        categories: ['Puchar Polski'],
        birthDate: '', residence: '', height: '', weight: '', notes: '', photo: ''
      };
      state.competitors.push(competitor);
    } else ensureCompetitorCategory(competitor, 'Puchar Polski');
    row.competitorId = competitor.id;
  });
  state.competitors.sort((a, b) => collator.compare(a.name, b.name));

  const previous = state.seasonEvents.find(event => event.id === id) || duplicate;
  const normalized = normalizeSeasonEvent({
    ...previous,
    id: previous?.id || `season-${date}-${slug(location)}-${Date.now()}`,
    date,
    location,
    name: `${location} · ${formatSeasonDate(date)}`,
    sourceFile,
    ranking,
  });
  state.seasonEvents = renumberSeasonEvents([
    ...state.seasonEvents.filter(event => event.id !== id && event.id !== duplicate?.id),
    normalized,
  ]);
  state.ui.seasonEditor = null;
  persistAndRender('Zawody sezonu zapisane i klasyfikacja przeliczona.', { competitorsChanged: true });
}

function deleteSeasonEvent(id) {
  const seasonEvent = state.seasonEvents.find(event => event.id === id);
  if (!seasonEvent) return;
  if (!window.confirm(`Usunąć z sezonu zawody ${seasonEvent.location} · ${formatSeasonDate(seasonEvent.date)}? Klasyfikacja zostanie natychmiast przeliczona.`)) return;
  state.seasonEvents = renumberSeasonEvents(state.seasonEvents.filter(event => event.id !== id));
  persistAndRender('Zawody usunięte z klasyfikacji sezonu.');
}

function exportSeason() {
  const payload = {
    schemaVersion: 1,
    season: 2026,
    seriesName: DEFAULT_SEASON.seriesName,
    maxCountedStarts: state.seasonMaxCountedStarts,
    pointsByPosition: DEFAULT_SEASON.pointsByPosition,
    exportedAt: new Date().toISOString(),
    events: state.seasonEvents,
    standings: calculateSeasonStandings(state.seasonEvents, state.seasonMaxCountedStarts),
  };
  downloadJson(`klasyfikacja_generalna_2026_${timestamp()}.json`, payload);
  flash('Eksport sezonu przygotowany.');
}

async function exportSeasonHtml(trigger) {
  if (trigger?.disabled) return;
  if (trigger) {
    trigger.disabled = true;
    trigger.setAttribute('aria-busy', 'true');
  }
  try {
    const standings = calculateSeasonStandings(state.seasonEvents, state.seasonMaxCountedStarts);
    const html = buildSeasonHtml({
      season: 2026,
      seriesName: DEFAULT_SEASON.seriesName,
      maxCountedStarts: state.seasonMaxCountedStarts,
      events: state.seasonEvents,
      standings,
      exportedAt: new Date().toISOString(),
      logoData: await getExportLogoData()
    });
    downloadHtmlFile(`klasyfikacja_generalna_2026_${timestamp()}.html`, html);
    flash('Czytelny plik HTML klasyfikacji został przygotowany.');
  } finally {
    if (trigger?.isConnected) {
      trigger.disabled = false;
      trigger.removeAttribute('aria-busy');
    }
  }
}

async function importSeason() {
  const file = await pickSeasonFile();
  if (!file) return;
  try {
    const text = await readTextFile(file);
    if (file.name.toLowerCase().endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      const payload = JSON.parse(text);
      if (Array.isArray(payload?.eventHistory)) {
        const seed = seasonEventFromCompetitionState(payload, file.name);
        if (!seed) return flash('Stan nie zawiera pełnej klasyfikacji zawodów.');
        openSeasonEditor('', seed);
        return;
      }
      if (Array.isArray(payload?.events) && payload.events.length > 1) {
        const imported = normalizeSeasonEvents(payload.events);
        if (!imported.length) return flash('W pliku nie znaleziono prawidłowych zawodów sezonu.');
        if (!window.confirm(`Zaimportować ${imported.length} imprez i zastąpić wpisy o tej samej dacie oraz miejscowości?`)) return;
        state.seasonEvents = mergeSeasonEvents(state.seasonEvents, imported);
        ensureSeasonCompetitors(imported);
        persistAndRender(`Zaimportowano ${imported.length} imprez sezonu.`, { competitorsChanged: true });
        return;
      }
      const candidate = normalizeSeasonEvent(payload?.events?.[0] || payload);
      if (candidate) {
        openSeasonEditor(candidate.id, candidate);
        return;
      }
      return flash('Nie rozpoznano formatu pliku sezonu.');
    }

    if (/<html[\s>]/i.test(text)) {
      const seed = parseSeasonHtml(text, file.name);
      if (!seed) return flash('W HTML nie znaleziono klasyfikacji końcowej 1-5.');
      openSeasonEditor('', seed);
      return;
    }
    flash('Obsługiwane są pliki JSON i HTML. Wynik PDF dodaj ręcznie.');
  } catch (error) {
    console.error('[Strongman Next] Nie udało się zaimportować danych sezonu:', error);
    flash('Nie udało się odczytać pliku. Sprawdź, czy jest kompletny.');
  }
}

function parseSeasonHtml(text, sourceFile) {
  const documentNode = new DOMParser().parseFromString(text, 'text/html');
  const table = [...documentNode.querySelectorAll('table')].find(candidate => {
    const header = normalizeKey(candidate.querySelector('tr')?.textContent || '');
    return header.includes('zawodnik') && (header.includes('punkty') || header.includes('suma'));
  });
  if (!table) return null;
  const ranking = [...table.querySelectorAll('tbody tr, tr')]
    .map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent.trim()))
    .filter(cells => cells.length >= 3)
    .map(cells => ({
      position: Number.parseInt(cells[0].match(/\d+/)?.[0], 10),
      name: cells[1],
      sourceName: cells[1],
      competitionPoints: Number(String(cells[2]).replace(',', '.')) || 0,
    }))
    .filter(row => row.position >= 1 && row.position <= 5 && row.name)
    .slice(0, 5);
  if (ranking.length !== 5) return null;

  const pageText = documentNode.body?.textContent || '';
  const dateMatch = pageText.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](2026)/);
  const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}` : '';
  const subtitle = [...documentNode.querySelectorAll('h2, body > p')]
    .map(node => node.textContent.trim())
    .find(value => value && !/klasyfikacja|szczegółowe|wygenerowano/i.test(value) && !/^\d+\./.test(value));
  const location = String(subtitle || '')
    .split('·')[0]
    .replace(/\d{1,2}[.\/-]\d{1,2}[.\/-]2026.*$/, '')
    .trim();
  return { id: '', date, location, sourceFile, ranking };
}

function seasonEventFromCompetitionState(payload, sourceFile) {
  const competitors = (payload.selectedCompetitorIds || [])
    .map(id => payload.competitors?.find(competitor => competitor.id === id))
    .filter(Boolean);
  if (!competitors.length || !payload.eventHistory?.length) return null;
  const scores = payload.scores && typeof payload.scores === 'object'
    ? payload.scores
    : buildScores(payload.selectedCompetitorIds || [], payload.eventHistory);
  const standings = rankStandings(competitors, scores, payload.eventHistory).slice(0, 5);
  if (standings.length !== 5) return null;
  return {
    id: '',
    date: payload.eventDate || '',
    location: payload.eventLocation || '',
    sourceFile,
    ranking: standings.map(row => ({
      position: row.rank,
      competitorId: row.id,
      name: row.name,
      sourceName: row.name,
      competitionPoints: row.points,
    })),
  };
}

function mergeSeasonEvents(current, imported) {
  const byKey = new Map(current.map(event => [`${event.date}:${normalizeKey(event.location)}`, event]));
  imported.forEach(event => byKey.set(`${event.date}:${normalizeKey(event.location)}`, event));
  return renumberSeasonEvents([...byKey.values()]);
}

function mergeSeasonEventCollections(baseEvents = [], durableEvents = null, savedEvents = null) {
  const byKey = new Map();
  [baseEvents, durableEvents, savedEvents].forEach(collection => {
    if (!Array.isArray(collection) || !collection.length) return;
    normalizeSeasonEvents(collection).forEach(event => {
      byKey.set(`${event.date}:${normalizeKey(event.location)}`, event);
    });
  });
  return renumberSeasonEvents([...byKey.values()]);
}

function renumberSeasonEvents(items) {
  return normalizeSeasonEvents(items).map((event, index) => ({ ...event, number: index + 1 }));
}

function ensureSeasonCompetitors(events) {
  events.flatMap(event => event.ranking).forEach(row => {
    const existing = state.competitors.find(competitor => normalizeKey(competitor.name) === normalizeKey(row.name));
    if (existing) {
      ensureCompetitorCategory(existing, 'Puchar Polski');
      row.competitorId = existing.id;
      return;
    }
    const competitor = {
      id: makeId('competitor', row.name),
      name: row.name,
      category: 'Puchar Polski',
      categories: ['Puchar Polski'],
      birthDate: '', residence: '', height: '', weight: '', notes: '', photo: ''
    };
    state.competitors.push(competitor);
    row.competitorId = competitor.id;
  });
  state.competitors.sort((a, b) => collator.compare(a.name, b.name));
}

function ensureCompetitorCategory(competitor, category) {
  const categories = getCompetitorCategories(competitor);
  if (!categories.some(value => normalizeCategoryKey(value) === normalizeCategoryKey(category))) categories.push(category);
  competitor.categories = categories;
  competitor.category = categories[0] || '';
}

async function changeLogo() {
  const file = await pickImageFile();
  if (!file) return;
  const processed = await processCompetitorPhoto(file, {
    maxDimension: 512,
    targetBytes: 150 * 1024,
    startQuality: 0.9,
    minQuality: 0.6
  });
  state.logoData = processed.dataUrl;
  persistAndRender('Logo zostało zmienione.');
}

function resetLogo() {
  state.logoData = null;
  persistAndRender('Przywrócono logo domyślne.');
}

function openReset() {
  state.ui.resetOpen = true;
  render();
  setTimeout(() => app.querySelector('[data-reset-input]')?.focus(), 50);
}

function closeReset() {
  state.ui.resetOpen = false;
  render();
}

function confirmReset() {
  const input = app.querySelector('[data-reset-input]');
  if (input?.value !== 'RESET') return;
  clearSavedState();
  state = hydrateState(null, loadCompetitorDatabase(), loadSeasonDatabase());
  state.ui = createUiState();
  persistAndRender('Aplikacja została zresetowana.');
}

function loadCheckpointById(id) {
  const checkpoint = loadCheckpoints().find(item => item.id === id);
  if (!checkpoint) return;
  if (!window.confirm('Wczytać punkt kontrolny i zastąpić aktualny stan?')) return;
  const snapshot = { ...checkpoint.snapshot };
  if (!Object.prototype.hasOwnProperty.call(snapshot, 'logoData')) snapshot.logoData = state.logoData;
  state = hydrateState(snapshot, loadCompetitorDatabase(), loadSeasonDatabase());
  state.ui = createUiState();
  persistAndRender('Punkt kontrolny został wczytany.', { competitorsChanged: true });
}

function toggleAllCheckpoints(trigger) {
  const checked = trigger.checked;
  app.querySelectorAll('[data-checkpoint-id]').forEach(input => {
    input.checked = checked;
  });
}

function deleteSelectedCheckpoints() {
  const ids = [...app.querySelectorAll('[data-checkpoint-id]:checked')].map(input => input.dataset.checkpointId);
  if (!ids.length) return flash('Zaznacz punkty kontrolne do usunięcia.');
  if (!window.confirm(`Usunąć zaznaczone punkty kontrolne (${ids.length})?`)) return;
  deleteCheckpoints(ids);
  render();
  flash('Punkty kontrolne usunięte.');
}

async function installApp() {
  if (isStandalone()) {
    state.appInstalled = true;
    persist();
    flash('Aplikacja jest już uruchomiona jak zainstalowana.');
    render();
    return;
  }
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    if (result.outcome === 'accepted') {
      state.appInstalled = true;
      persist();
    }
    deferredInstallPrompt = null;
    flash(result.outcome === 'accepted' ? 'Instalacja rozpoczęta.' : 'Instalację można uruchomić później.');
    render();
    return;
  }
  state.ui.installHelpOpen = true;
  render();
}

function closeInstallHelp() {
  state.ui.installHelpOpen = false;
  render();
}

function toggleSettings() {
  state.ui.settingsOpen = !state.ui.settingsOpen;
  render();
}

function toggleOutdoorMode() {
  state.outdoorMode = !state.outdoorMode;
  persistAndRender(state.outdoorMode ? 'Tryb pełnego słońca włączony.' : 'Tryb pełnego słońca wyłączony.');
}

function openStopwatch(id) {
  state.ui.stopwatch = {
    competitorId: id,
    elapsedMs: 0,
    running: false,
    startedAt: 0
  };
  signal('open');
  render();
}

function toggleStopwatch() {
  const stopwatch = state.ui.stopwatch;
  if (!stopwatch) return;
  if (stopwatch.running) {
    stopwatch.elapsedMs = getStopwatchElapsedMs();
    stopwatch.running = false;
    stopwatch.startedAt = 0;
    signal('stop');
  } else {
    stopwatch.running = true;
    stopwatch.startedAt = performance.now();
    signal('start');
  }
  render();
}

function resetStopwatch() {
  const stopwatch = state.ui.stopwatch;
  if (!stopwatch) return;
  stopwatch.elapsedMs = 0;
  stopwatch.startedAt = stopwatch.running ? performance.now() : 0;
  signal('reset');
  render();
}

function saveStopwatchResult() {
  const stopwatch = state.ui.stopwatch;
  if (!stopwatch) return;
  const seconds = (getStopwatchElapsedMs() / 1000).toFixed(2);
  const draft = getCurrentDraft();
  draft[stopwatch.competitorId] = seconds;
  state.ui.stopwatch = null;
  stopStopwatchTicker();
  persistAndRender(`Zapisano czas: ${seconds}s.`);
}

function closeStopwatch() {
  state.ui.stopwatch = null;
  stopStopwatchTicker();
  render();
}

function exportResultsHtml() {
  const competitors = state.selectedCompetitorIds.map(id => competitorById(id)).filter(Boolean);
  const standings = rankStandings(competitors, state.scores, state.eventHistory);
  const html = buildResultsHtml(standings);
  const filename = `${safeFilename(`${state.eventName || 'zawody'}_wyniki_${timestamp()}`)}.html`;
  downloadHtmlFile(filename, html);
  flash('Eksport wyników HTML przygotowany.');
}

function downloadHtmlFile(filename, html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function getExportLogoData() {
  if (state.logoData?.startsWith('data:image/')) return state.logoData;
  try {
    const response = await fetch(new URL('assets/logo-strong-man.png', document.baseURI));
    if (!response.ok) return '';
    return await readAsDataUrl(await response.blob());
  } catch (error) {
    console.warn('[Strongman Next] Nie udało się dołączyć logo do eksportu:', error);
    return '';
  }
}

async function checkForUpdates() {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    }
    const response = await fetch(`version.json?ts=${Date.now()}`, { cache: 'no-store' });
    const remote = await response.json();
    if (remote.version && remote.version !== APP_VERSION) {
      flash(`Dostępna wersja ${remote.version}. Pobieram aktualizację...`);
      window.setTimeout(() => window.location.reload(), 900);
      return;
    }
    flash('Masz aktualną wersję aplikacji.');
  } catch (error) {
    console.warn('[Strongman Next] Sprawdzenie aktualizacji nie powiodło się:', error);
    flash('Nie udało się sprawdzić aktualizacji. Aplikacja działa offline.');
  }
}

function getCurrentDraft() {
  const key = currentEvent()?.id || `event-${state.currentEventIndex}`;
  state.drafts[key] ||= {};
  return state.drafts[key];
}

function areCurrentEventResultsComplete() {
  const draft = getCurrentDraft();
  const orderIds = getOrderForEvent(state.currentEventIndex);
  return orderIds.length > 0 && orderIds.every(id => String(draft[id] || '').trim());
}

function focusNextPendingResult(currentId) {
  const draft = getCurrentDraft();
  const orderIds = getOrderForEvent(state.currentEventIndex);
  const currentIndex = Math.max(0, orderIds.indexOf(currentId));
  const afterCurrent = orderIds.slice(currentIndex + 1).find(id => !String(draft[id] || '').trim());
  const firstPending = afterCurrent || orderIds.find(id => !String(draft[id] || '').trim());
  if (!firstPending) return false;
  focusResultInput(firstPending);
  return true;
}

function focusResultInput(id) {
  const input = app.querySelector(`[data-result="${cssEscape(id)}"]`);
  if (!input) return;
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => {
    input.focus({ preventScroll: true });
    input.select();
  }, 180);
}

function currentEvent() {
  return eventById(state.selectedEventIds[state.currentEventIndex]);
}

function getStartOrderIds() {
  return reconcileOrder(state.startOrderIds, state.selectedCompetitorIds).length
    ? reconcileOrder(state.startOrderIds, state.selectedCompetitorIds)
    : [...state.selectedCompetitorIds];
}

function getOrderForEvent(index) {
  const eventId = state.selectedEventIds[index];
  const override = state.eventOrderOverrides[eventId];
  if (override?.length) {
    const selectedOrder = override.filter(id => state.selectedCompetitorIds.includes(id));
    return isFinalEventIndex(index) ? selectedOrder : reconcileOrder(selectedOrder, state.selectedCompetitorIds);
  }
  if (index === 0) return getStartOrderIds();
  if (isFinalEventIndex(index)) return getFinalOrderIds();
  const previous = state.eventHistory[index - 1];
  const fallback = getStartOrderIds();
  return buildNextStartOrder(state.selectedCompetitorIds, previous, fallback);
}

function isFinalEventIndex(index) {
  return state.selectedEventIds.length > 1 && index === state.selectedEventIds.length - 1;
}

function getFinalOrderIds() {
  const competitors = state.selectedCompetitorIds.map(id => competitorById(id)).filter(Boolean);
  if (!competitors.length) return [];
  return buildFinalStartOrder(competitors, state.scores, state.eventHistory, state.finalistsLimit).map(competitor => competitor.id);
}

function reconcileOrder(order, selected) {
  const selectedSet = new Set(selected);
  const existing = order.filter(id => selectedSet.has(id));
  const missing = selected.filter(id => !existing.includes(id));
  return [...existing, ...missing];
}

function orderSelectedFirst(items, selectedIds) {
  const selectedMap = new Map(selectedIds.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const aSelected = selectedMap.has(a.id);
    const bSelected = selectedMap.has(b.id);
    if (aSelected && bSelected) return selectedMap.get(a.id) - selectedMap.get(b.id);
    if (aSelected) return -1;
    if (bSelected) return 1;
    return collator.compare(a.name, b.name);
  });
}

function competitorById(id) {
  return state.competitors.find(competitor => competitor.id === id);
}

function eventById(id) {
  return state.events.find(eventItem => eventItem.id === id);
}

function renameCompetitorInHistory(id, name) {
  state.eventHistory = state.eventHistory.map(event => ({
    ...event,
    results: (event.results || []).map(result => result.id === id ? { ...result, name } : result)
  }));
}

function mergeCompetitors(imported, categoryPayload = { ids: new Set(), names: new Set() }) {
  const result = { added: 0, updated: 0, unchanged: 0 };
  imported.forEach(item => {
    const replaceCategories = categoryPayload.ids.has(String(item.id)) || categoryPayload.names.has(normalizeCompetitorKey(item.name));
    const upserted = upsertCompetitorRecord(state.competitors, item, {
      mode: 'preferIncoming',
      categoriesMode: replaceCategories ? 'replace' : 'merge'
    });
    state.competitors = upserted.records;
    if (upserted.added) result.added++;
    else if (upserted.updated) result.updated++;
    else result.unchanged++;
  });
  state.competitors = sortCompetitors(state.competitors);
  return result;
}

function mergeEvents(imported) {
  const byKey = new Map(state.events.map(item => [`${normalizeKey(item.name)}:${item.type}`, item]));
  imported.forEach(item => {
    const key = `${normalizeKey(item.name)}:${item.type}`;
    if (!byKey.has(key)) {
      state.events.push({ ...item, id: makeId('event', item.name) });
    }
  });
  state.events.sort((a, b) => collator.compare(a.name, b.name));
}

function updateResultCardStatus(input) {
  const card = input.closest('.result-card');
  if (!card) return;
  card.classList.toggle('has-value', Boolean(String(input.value).trim()));
  const status = card.querySelector('small');
  if (status && !state.eventHistory[state.currentEventIndex]) {
    status.textContent = String(input.value).trim() ? 'wpisany' : 'czeka';
  }
}

function setCompetitorCategoryFilter(category) {
  state.ui.competitorCategoryFilter = category || 'all';
  render();
}

function applyCompetitorFilters() {
  const list = app.querySelector('[data-list="competitors"]');
  if (!list || !state.ui) return;
  const input = app.querySelector('[data-filter="competitors"]');
  if (input && input.value !== state.ui.competitorSearch) input.value = state.ui.competitorSearch;
  const needle = normalizeCompetitorKey(state.ui.competitorSearch);
  list.querySelectorAll('[data-competitor-id]').forEach(row => {
    const competitor = competitorById(row.dataset.competitorId);
    const matchesText = !needle || normalizeCompetitorKey(row.dataset.filterText).includes(needle);
    const matchesCategory = competitorMatchesCategory(competitor, state.ui.competitorCategoryFilter);
    row.hidden = !(matchesText && matchesCategory);
  });
}

function applyFilter(type, value) {
  if (type === 'competitors') {
    state.ui.competitorSearch = value;
    applyCompetitorFilters();
    return;
  }
  const list = app.querySelector(`[data-list="${cssEscape(type)}"]`);
  if (!list) return;
  const needle = normalizeKey(value);
  list.querySelectorAll('[data-filter-text]').forEach(row => {
    row.hidden = needle && !normalizeKey(row.dataset.filterText).includes(needle);
  });
}

function persist({ competitorsChanged = false } = {}) {
  state.scores = buildScores(state.selectedCompetitorIds, state.eventHistory);
  state.schemaVersion = 3;
  try {
    if (competitorsChanged) saveCompetitorDatabase(state.competitors);
    saveSeasonDatabase(state.seasonEvents);
    saveState(state);
    persistenceFailureReported = false;
    return true;
  } catch (error) {
    reportPersistenceFailure(error);
    return false;
  }
}

function persistAndRender(message = '', options = {}) {
  const saved = persist(options);
  render();
  if (message && saved) flash(message);
}

function reportPersistenceFailure(error) {
  console.error('[Strongman Next] Nie udało się zapisać stanu aplikacji:', error);
  if (persistenceFailureReported) return;
  persistenceFailureReported = true;
  window.setTimeout(() => {
    flash('Nie udało się zapisać zmian na tym urządzeniu. Eksportuj stan do pliku i zwolnij miejsce w pamięci przeglądarki.');
  }, 0);
}

function reportUnexpectedError(error) {
  console.error('[Strongman Next] Nieoczekiwany błąd interfejsu:', error);
  flash('Operacja nie została wykonana. Dane pozostają w dotychczasowym stanie. Spróbuj ponownie lub użyj ostatniego punktu kontrolnego.');
}

function flash(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.classList.add('is-visible'), 20);
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 250);
  }, 2600);
}

function applyEnvironment() {
  document.body.classList.toggle('outdoor-mode', Boolean(state.outdoorMode));
  document.body.classList.toggle('is-standalone', isStandalone());
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function shouldShowInstallAction() {
  return !isStandalone();
}

function initPwaInstall() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    document.body.classList.add('can-install');
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    state.appInstalled = true;
    persist();
    flash('Aplikacja została zainstalowana.');
    render();
  });
}

function getStopwatchElapsedMs() {
  const stopwatch = state.ui.stopwatch;
  if (!stopwatch) return 0;
  if (!stopwatch.running) return stopwatch.elapsedMs || 0;
  return (stopwatch.elapsedMs || 0) + Math.max(0, performance.now() - stopwatch.startedAt);
}

function formatStopwatch(ms) {
  const totalCentiseconds = Math.floor(ms / 10);
  const minutes = Math.floor(totalCentiseconds / 6000);
  const seconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function syncStopwatchTicker() {
  stopStopwatchTicker();
  if (!state.ui.stopwatch?.running) return;
  stopwatchTimer = window.setInterval(() => {
    const target = document.querySelector('[data-stopwatch-time]');
    if (target) target.textContent = formatStopwatch(getStopwatchElapsedMs());
  }, 80);
}

function stopStopwatchTicker() {
  if (stopwatchTimer) {
    window.clearInterval(stopwatchTimer);
    stopwatchTimer = null;
  }
}

function signal(type) {
  if (navigator.vibrate) {
    const patterns = {
      open: [35],
      start: [90],
      stop: [150, 70, 80],
      reset: [40, 40, 40]
    };
    navigator.vibrate(patterns[type] || [50]);
  }
  try {
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = type === 'stop' ? 330 : 660;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.08);
  } catch {
    // Audio is best-effort only; some browsers require user activation.
  }
}

function buildResultsHtml(standings) {
  const rows = standings.map(row => `
    <tr>
      <td>${row.rank}</td>
      <td>${escapeHtml(row.name)}</td>
      <td>${row.points.toFixed(2)}</td>
      <td>${escapeHtml(row.tieReason || '')}</td>
    </tr>
  `).join('');
  const history = state.eventHistory.map(event => `
    <h2>${event.nr}. ${escapeHtml(event.name)}</h2>
    <table>
      <thead><tr><th>Miejsce</th><th>Zawodnik</th><th>Wynik</th><th>Punkty</th></tr></thead>
      <tbody>
        ${event.results.map(result => `
          <tr>
            <td>${escapeHtml(String(result.place))}</td>
            <td>${escapeHtml(result.name)}</td>
            <td>${escapeHtml(String(result.result))}</td>
            <td>${escapeHtml(String(result.points))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `).join('');
  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <title>Wyniki - ${escapeHtml(state.eventName || 'Zawody Strong Man')}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:24px;color:#111827}
    h1{font-size:28px;margin-bottom:4px}
    h2{margin-top:28px}
    table{width:100%;border-collapse:collapse;margin:12px 0 24px}
    th,td{border:1px solid #d1d5db;padding:9px;text-align:left}
    th{background:#0b1f36;color:white}
    tr:nth-child(even){background:#f8fafc}
  </style>
</head>
<body>
  <h1>${escapeHtml(state.eventName || 'Zawody Strong Man')}</h1>
  <p>${escapeHtml(state.eventLocation || '')}${state.eventDate ? ` · ${formatSeasonDate(state.eventDate)}` : ''} · wyeksportowano ${new Date().toLocaleString('pl-PL')}</p>
  <h2>Klasyfikacja</h2>
  <table>
    <thead><tr><th>#</th><th>Zawodnik</th><th>Punkty</th><th>Tie-break</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${history}
</body>
</html>`;
}

function getLogoSrc() {
  return state.logoData || 'assets/logo-strong-man.png';
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      console.warn('[Strongman Next] Rejestracja trybu offline nie powiodła się:', error);
    });
  }
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || '?';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function normalizeKey(value) {
  return String(value || '')
    .replaceAll('ł', 'l')
    .replaceAll('Ł', 'L')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
}

function makeId(prefix, name) {
  return `${prefix}-${slug(name)}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function safeFilename(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'strongman';
}

function timestamp() {
  return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

function calculateAge(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const now = new Date();
  let age = now.getFullYear() - year;
  const birthdayPassed = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  if (!birthdayPassed) age--;
  return age >= 0 && age < 120 ? age : null;
}

function formatBirthDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || '');
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function formatMeasurement(value, unit) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /[a-ząćęłńóśźż]/i.test(text) ? text : `${text} ${unit}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pl-PL');
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
}
