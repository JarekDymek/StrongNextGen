import { APP_VERSION, DEFAULT_COMPETITORS, DEFAULT_EVENTS, EVENT_TYPE_LABEL } from './data.js';
import { buildFinalStartOrder, buildScores, calculateEventPoints, rankStandings } from './scoring.js';
import {
  clearSavedState,
  deleteCheckpoints,
  downloadJson,
  loadCheckpoints,
  loadSavedState,
  pickImageFile,
  pickJsonFile,
  readJsonFile,
  saveCheckpoint,
  saveState
} from './storage.js';

const app = document.getElementById('app');
const collator = new Intl.Collator('pl', { sensitivity: 'base' });
let deferredInstallPrompt = null;
let stopwatchTimer = null;
const STAGES = ['setup', 'draw', 'scoring', 'summary'];
const STAGE_LABELS = {
  setup: 'Przygotowanie',
  draw: 'Kolejność',
  scoring: 'Wyniki',
  summary: 'Klasyfikacja'
};
const STAGE_SHORT_LABELS = {
  setup: 'Start',
  draw: 'Kolejność',
  scoring: 'Wyniki',
  summary: 'Tabela'
};

let state = hydrateState(loadSavedState());
state.ui = createUiState();
if (isStandalone()) state.appInstalled = true;
render();
registerServiceWorker();
initPwaInstall();

app.addEventListener('click', handleClick);
app.addEventListener('input', handleInput);
app.addEventListener('change', handleChange);
app.addEventListener('submit', handleSubmit);
app.addEventListener('toggle', handleToggle, true);

function createInitialState() {
  const competitors = normalizeCompetitors(DEFAULT_COMPETITORS);
  const events = normalizeEvents(DEFAULT_EVENTS);
  return {
    schemaVersion: 1,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    savedAt: null,
    eventName: 'Nowe zawody Strong Man',
    eventLocation: '',
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
    scores: {}
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
    stopwatch: null,
    settingsOpen: false
  };
}

function hydrateState(saved) {
  const base = createInitialState();
  if (!saved || typeof saved !== 'object') return base;

  const next = {
    ...base,
    ...saved,
    competitors: mergeBaseCompetitors(base.competitors, normalizeCompetitors(saved.competitors || [])),
    events: normalizeEvents(saved.events || DEFAULT_EVENTS),
    selectedCompetitorIds: Array.isArray(saved.selectedCompetitorIds) ? saved.selectedCompetitorIds : [],
    selectedEventIds: Array.isArray(saved.selectedEventIds) ? saved.selectedEventIds : [],
    startOrderIds: Array.isArray(saved.startOrderIds) ? saved.startOrderIds : [],
    eventHistory: Array.isArray(saved.eventHistory) ? saved.eventHistory : [],
    drafts: saved.drafts && typeof saved.drafts === 'object' ? saved.drafts : {},
    scores: saved.scores && typeof saved.scores === 'object' ? saved.scores : {}
  };

  const competitorIds = new Set(next.competitors.map(competitor => competitor.id));
  const eventIds = new Set(next.events.map(event => event.id));
  next.selectedCompetitorIds = next.selectedCompetitorIds.filter(id => competitorIds.has(id));
  next.selectedEventIds = next.selectedEventIds.filter(id => eventIds.has(id));
  next.startOrderIds = next.startOrderIds.filter(id => competitorIds.has(id));
  next.stage = STAGES.includes(next.stage) ? next.stage : 'setup';
  next.currentEventIndex = Math.max(0, Math.min(next.currentEventIndex || 0, Math.max(next.selectedEventIds.length - 1, 0)));
  next.finalistsLimit = Math.max(1, Number.parseInt(next.finalistsLimit, 10) || 5);
  next.scores = buildScores(next.selectedCompetitorIds, next.eventHistory);
  return next;
}

function normalizeCompetitors(items) {
  const seen = new Set();
  return (items || [])
    .map((item, index) => {
      const source = typeof item === 'string' ? { name: item } : item || {};
      const name = String(source.name || '').trim();
      if (!name) return null;
      const key = normalizeKey(name);
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        id: source.id || `competitor-${slug(name)}-${index}`,
        name,
        category: source.category || source.categories?.[0] || '',
        categories: Array.isArray(source.categories) ? source.categories : [source.category].filter(Boolean),
        birthDate: source.birthDate || '',
        residence: source.residence || '',
        height: source.height || '',
        weight: source.weight || '',
        notes: source.notes || '',
        photo: source.photo || ''
      };
    })
    .filter(Boolean)
    .sort((a, b) => collator.compare(a.name, b.name));
}

function mergeBaseCompetitors(baseCompetitors, savedCompetitors) {
  const byKey = new Map();
  [...baseCompetitors, ...savedCompetitors].forEach(competitor => {
    const key = normalizeKey(competitor.name);
    if (!key) return;
    byKey.set(key, {
      ...byKey.get(key),
      ...competitor,
      photo: competitor.photo || byKey.get(key)?.photo || '',
      categories: competitor.categories?.length ? competitor.categories : byKey.get(key)?.categories || []
    });
  });
  return [...byKey.values()].sort((a, b) => collator.compare(a.name, b.name));
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

function render() {
  applyEnvironment();
  document.documentElement.dataset.stage = state.stage;
  const eventTitle = state.eventName?.trim() || 'Nowe zawody';
  const showInstallAction = shouldShowInstallAction();
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

    <nav class="stepper" aria-label="Etapy zawodów">
      ${STAGES.map(stage => `
        <button type="button" class="step ${stage === state.stage ? 'is-active' : ''}" data-action="go-stage" data-stage="${stage}">
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
    ${renderStopwatch()}
  `;
  syncStopwatchTicker();
}

function renderStage() {
  if (state.stage === 'draw') return renderDraw();
  if (state.stage === 'scoring') return renderScoring();
  if (state.stage === 'summary') return renderSummary();
  return renderSetup();
}

function renderQuickSettings(showInstallAction) {
  if (!state.ui.settingsOpen) return '';
  return `
    <section class="quick-settings" aria-label="Menu aplikacji">
      ${showInstallAction ? '<button class="utility-button install-button" type="button" data-action="install-app">Instaluj</button>' : ''}
      <button class="utility-button sun-button ${state.outdoorMode ? 'is-active' : ''}" type="button" data-action="toggle-outdoor">
        ${state.outdoorMode ? 'Słońce: włączone' : 'Słońce: wyłączone'}
      </button>
      <button class="utility-button update-button-inline" type="button" data-action="check-update">Sprawdź aktualizację</button>
    </section>
  `;
}

function stageSubtitle() {
  const selected = `${state.selectedCompetitorIds.length} zawodników · ${state.selectedEventIds.length} konkurencji`;
  if (state.stage === 'setup') return selected;
  if (state.stage === 'draw') return 'Ustaw lub wylosuj pierwszą kolejność startową';
  if (state.stage === 'scoring') return currentEvent()?.name || 'Wpisywanie wyników';
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
      <form class="inline-form" data-form="add-competitor">
        <input name="name" placeholder="Imię i nazwisko zawodnika" autocomplete="off">
        <button type="submit" class="primary-button">Dodaj</button>
      </form>
      <div class="button-row">
        <button type="button" class="secondary-button" data-action="import-competitors">Import zawodników</button>
        <button type="button" class="secondary-button" data-action="export-competitors">Eksport listy</button>
      </div>
      <label class="search-box">
        <span>Szukaj zawodnika</span>
        <input data-filter="competitors" placeholder="Wpisz fragment nazwiska">
      </label>
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

function renderCompetitorSelection() {
  if (!state.competitors.length) {
    return `<div class="empty-state">Brak zawodników w bazie. Dodaj ręcznie albo zaimportuj plik JSON.</div>`;
  }
  const ordered = orderSelectedFirst(state.competitors, state.selectedCompetitorIds);
  return ordered.map(competitor => {
    const selectedIndex = state.selectedCompetitorIds.indexOf(competitor.id);
    const selected = selectedIndex >= 0;
    const meta = [competitor.category, competitor.residence, competitor.weight ? `${competitor.weight} kg` : ''].filter(Boolean).join(' · ');
    return `
      <article class="selection-item ${selected ? 'is-selected' : ''}" data-filter-text="${escapeAttr(`${competitor.name} ${meta} ${competitor.notes || ''}`)}">
        <button type="button" class="select-card" data-action="toggle-competitor" data-id="${escapeAttr(competitor.id)}">
          <span class="order-pill">${selected ? selectedIndex + 1 : '+'}</span>
          <span class="avatar">${competitor.photo ? `<img src="${escapeAttr(competitor.photo)}" alt="">` : escapeHtml(initials(competitor.name))}</span>
          <span class="select-card__main">
            <strong>${escapeHtml(competitor.name)}</strong>
            ${meta ? `<small>${escapeHtml(meta)}</small>` : '<small>Dotknij, aby wybrać</small>'}
          </span>
          <span class="check-pill ${selected ? 'is-checked' : ''}">${selected ? '✓' : ''}</span>
        </button>
        <div class="item-actions">
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
  const ordered = orderSelectedFirst(state.events, state.selectedEventIds);
  return ordered.map(event => {
    const selectedIndex = state.selectedEventIds.indexOf(event.id);
    const selected = selectedIndex >= 0;
    const isFinal = selected && selectedIndex === state.selectedEventIds.length - 1 && state.selectedEventIds.length > 1;
    return `
      <div class="event-row selection-item ${selected ? 'is-selected' : ''}" data-filter-text="${escapeAttr(event.name)}">
        <button type="button" class="select-card event-select" data-action="toggle-event" data-id="${escapeAttr(event.id)}">
          <span class="order-pill">${selected ? selectedIndex + 1 : '+'}</span>
          <span class="select-card__main">
            <strong>${escapeHtml(event.name)}</strong>
            <small>${EVENT_TYPE_LABEL[event.type]}${isFinal ? ' · Finał' : ''}</small>
          </span>
          <span class="check-pill ${selected ? 'is-checked' : ''}">${selected ? '✓' : ''}</span>
        </button>
        <div class="item-actions">
          <button type="button" class="mini-button" data-action="edit-event" data-id="${escapeAttr(event.id)}">Edytuj</button>
          <button type="button" class="mini-button danger-mini" data-action="delete-event" data-id="${escapeAttr(event.id)}">Usuń</button>
        </div>
        ${selected ? `
          <div class="reorder-actions selection-reorder-actions">
            <button type="button" class="icon-button" data-action="move-event" data-id="${escapeAttr(event.id)}" data-direction="-1" ${selectedIndex === 0 ? 'disabled' : ''} aria-label="Przesuń konkurencję wyżej">↑</button>
            <button type="button" class="icon-button" data-action="move-event" data-id="${escapeAttr(event.id)}" data-direction="1" ${selectedIndex === state.selectedEventIds.length - 1 ? 'disabled' : ''} aria-label="Przesuń konkurencję niżej">↓</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function renderDraw() {
  const order = getStartOrderIds();
  return `
    <section class="panel strong-panel">
      <div class="panel-heading">
        <span class="panel-icon">🎰</span>
        <div>
          <h2>Kolejność startowa pierwszej konkurencji</h2>
          <p>Domyślnie obowiązuje kolejność wyboru zawodników. Losowanie jest świadomą opcją.</p>
        </div>
      </div>
      <div class="button-column">
        <button type="button" class="primary-button" data-action="shuffle-order">Losuj kolejność</button>
        <button type="button" class="secondary-button" data-action="restore-selection-order">Przywróć kolejność wyboru</button>
      </div>
    </section>

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
      <button type="button" class="primary-button action-large is-guided" data-action="start-competition">Start zawodów</button>
      <button type="button" class="secondary-button action-large" data-action="go-setup">Wróć do przygotowania</button>
    </div>
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
        <button type="button" class="success-button action-large ${guideFinalize ? 'is-guided' : ''}" data-action="finalize-event">
          ${finalized ? 'Przelicz podsumowanie' : 'Podsumuj konkurencję'}
        </button>
        <button type="button" class="primary-button action-large ${canGoNext ? 'is-guided' : ''}" data-action="next-event" ${canGoNext ? '' : 'disabled'}>
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
        <span class="avatar avatar--large">${competitor?.photo ? `<img src="${escapeAttr(competitor.photo)}" alt="">` : escapeHtml(initials(competitor?.name || ''))}</span>
        <div>
          <strong>${escapeHtml(competitor?.name || 'Zawodnik')}</strong>
          <small>${escapeHtml(status)}</small>
        </div>
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
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;
  const action = trigger.dataset.action;
  const id = trigger.dataset.id;
  event.preventDefault();

  if (action === 'go-stage') return goStage(trigger.dataset.stage);
  if (action === 'go-setup') return guardedGoSetup();
  if (action === 'go-draw') return goDraw();
  if (action === 'go-scoring') return goScoring();
  if (action === 'toggle-competitor') return toggleSelected(state.selectedCompetitorIds, id);
  if (action === 'toggle-event') return toggleSelected(state.selectedEventIds, id);
  if (action === 'move-event') return moveInArray(state.selectedEventIds, id, Number(trigger.dataset.direction));
  if (action === 'move-start-order') return moveInArray(state.startOrderIds, id, Number(trigger.dataset.direction));
  if (action === 'edit-competitor') return editCompetitor(id);
  if (action === 'delete-competitor') return deleteCompetitor(id);
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
}

function handleInput(event) {
  const target = event.target;
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
    applyFilter(target.dataset.filter, target.value);
    return;
  }

  if (target.matches('[data-reset-input]')) {
    const button = app.querySelector('[data-action="confirm-reset"]');
    if (button) button.disabled = target.value !== 'RESET';
  }
}

function handleChange(event) {
  const target = event.target;
  if (target.matches('[data-checkpoint-id]')) return;
}

function handleSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);

  if (form.dataset.form === 'add-competitor') {
    const name = String(data.get('name') || '').trim();
    if (!name) return flash('Wpisz nazwisko zawodnika.');
    const existing = state.competitors.find(competitor => normalizeKey(competitor.name) === normalizeKey(name));
    if (existing) {
      if (!state.selectedCompetitorIds.includes(existing.id)) state.selectedCompetitorIds.push(existing.id);
      persistAndRender('Zawodnik już był w bazie, został zaznaczony.');
      return;
    }
    const competitor = { id: makeId('competitor', name), name, category: '', photo: '' };
    state.competitors.push(competitor);
    state.competitors.sort((a, b) => collator.compare(a.name, b.name));
    state.selectedCompetitorIds.push(competitor.id);
    persistAndRender('Dodano i zaznaczono zawodnika.');
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
  if (stage === 'setup') return guardedGoSetup();
  if (stage === 'draw') return goDraw();
  if (stage === 'scoring') return goScoring();
  if (stage === 'summary') {
    if (!state.eventHistory.length) return flash('Klasyfikacja pojawi się po podsumowaniu konkurencji.');
    state.stage = 'summary';
    persistAndRender();
  }
}

function guardedGoSetup() {
  if (state.eventHistory.length && !window.confirm('Wrócić do przygotowania? Wyniki zostaną zachowane, ale zmiany list mogą wpłynąć na dalszą pracę.')) {
    return;
  }
  state.stage = 'setup';
  persistAndRender();
}

function goDraw() {
  if (state.selectedCompetitorIds.length < 2) return flash('Wybierz co najmniej 2 zawodników.');
  if (state.selectedEventIds.length < 1) return flash('Wybierz co najmniej 1 konkurencję.');
  state.startOrderIds = reconcileOrder(state.startOrderIds, state.selectedCompetitorIds);
  if (!state.startOrderIds.length) state.startOrderIds = [...state.selectedCompetitorIds];
  state.stage = 'draw';
  persistAndRender();
}

function goScoring() {
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

function editCompetitor(id) {
  const competitor = competitorById(id);
  if (!competitor) return;

  const name = window.prompt('Imię i nazwisko zawodnika:', competitor.name);
  if (name === null) return;
  const trimmedName = name.trim();
  if (!trimmedName) return flash('Nazwa zawodnika nie może być pusta.');
  const duplicate = state.competitors.find(item => item.id !== id && normalizeKey(item.name) === normalizeKey(trimmedName));
  if (duplicate) return flash('Zawodnik o tej nazwie już istnieje.');

  const category = window.prompt('Kategoria:', competitor.category || '');
  if (category === null) return;
  const residence = window.prompt('Miejscowość:', competitor.residence || '');
  if (residence === null) return;
  const weight = window.prompt('Waga:', competitor.weight || '');
  if (weight === null) return;
  const notes = window.prompt('Notatki:', competitor.notes || '');
  if (notes === null) return;

  competitor.name = trimmedName;
  competitor.category = category.trim();
  competitor.categories = competitor.category ? [competitor.category] : [];
  competitor.residence = residence.trim();
  competitor.weight = weight.trim();
  competitor.notes = notes.trim();
  state.competitors.sort((a, b) => collator.compare(a.name, b.name));
  renameCompetitorInHistory(id, trimmedName);
  persistAndRender('Dane zawodnika zapisane.');
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
  persistAndRender('Zawodnik usunięty.');
}

function editEvent(id) {
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
  state.eventHistory = state.eventHistory
    .filter(item => item.eventId !== id)
    .map((item, index) => ({ ...item, nr: index + 1 }));
  state.currentEventIndex = Math.max(0, Math.min(state.currentEventIndex, Math.max(state.selectedEventIds.length - 1, 0)));
  state.scores = buildScores(state.selectedCompetitorIds, state.eventHistory);
  persistAndRender('Konkurencja usunięta.');
}

function shuffleStartOrder() {
  state.startOrderIds = getStartOrderIds();
  for (let i = state.startOrderIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.startOrderIds[i], state.startOrderIds[j]] = [state.startOrderIds[j], state.startOrderIds[i]];
  }
  state.drawUsed = true;
  persistAndRender('Kolejność została wylosowana.');
}

function restoreSelectionOrder() {
  state.startOrderIds = [...state.selectedCompetitorIds];
  state.drawUsed = false;
  persistAndRender('Przywrócono kolejność wyboru zawodników.');
}

function startCompetition() {
  if (state.eventHistory.length && !window.confirm('Rozpocząć zawody od nowa? Dotychczasowe podsumowania konkurencji zostaną usunięte.')) {
    return;
  }
  state.startOrderIds = getStartOrderIds();
  state.currentEventIndex = 0;
  state.eventHistory = [];
  state.drafts = {};
  state.scores = {};
  state.stage = 'scoring';
  persistAndRender('Zawody rozpoczęte.');
}

function finalizeCurrentEvent() {
  const event = currentEvent();
  if (!event) return;
  const orderIds = getOrderForEvent(state.currentEventIndex);
  const draft = getCurrentDraft();
  const missing = orderIds.filter(id => !String(draft[id] || '').trim());
  const existing = state.eventHistory[state.currentEventIndex];

  if (existing && !window.confirm('Nadpisać zapisane podsumowanie tej konkurencji? Późniejsze podsumowania zostaną usunięte.')) {
    return;
  }

  if (missing.length && !window.confirm(`Brakuje ${missing.length} wyników. Potraktować je jako DNF / 0?`)) {
    return;
  }

  const rows = orderIds.map(id => ({
    id,
    name: competitorById(id)?.name || 'Zawodnik',
    result: String(draft[id] || '0')
  }));
  const calculated = calculateEventPoints(rows, orderIds.length, event.type);
  if (calculated.error) {
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
    orderIds,
    createdAt: new Date().toISOString(),
    results: calculated.results
  };
  state.scores = buildScores(state.selectedCompetitorIds, state.eventHistory);
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
  saveCheckpoint(state, `${state.eventName || 'Zawody'} · ${new Date().toLocaleString('pl-PL')}`);
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
  const json = await readJsonFile(file);
  if (!json || typeof json !== 'object' || !json.schemaVersion) {
    flash('To nie wygląda jak plik stanu Strongman Next.');
    return;
  }
  if (!window.confirm('Wczytać stan z pliku i zastąpić aktualny stan aplikacji?')) return;
  state = hydrateState(json);
  state.ui = createUiState();
  persistAndRender('Stan został wczytany.');
}

async function importCompetitors() {
  const file = await pickJsonFile();
  if (!file) return;
  const json = await readJsonFile(file);
  const imported = normalizeCompetitors(Array.isArray(json) ? json : json.competitors || []);
  if (!imported.length) return flash('Nie znaleziono zawodników w pliku.');
  mergeCompetitors(imported);
  persistAndRender(`Zaimportowano zawodników: ${imported.length}.`);
}

function exportCompetitors() {
  downloadJson(`zawodnicy_${timestamp()}.json`, state.competitors);
}

async function importEvents() {
  const file = await pickJsonFile();
  if (!file) return;
  const json = await readJsonFile(file);
  const imported = normalizeEvents(Array.isArray(json) ? json : json.events || []);
  if (!imported.length) return flash('Nie znaleziono konkurencji w pliku.');
  mergeEvents(imported);
  persistAndRender(`Zaimportowano konkurencje: ${imported.length}.`);
}

function exportEvents() {
  downloadJson(`konkurencje_${timestamp()}.json`, state.events);
}

async function changeLogo() {
  const file = await pickImageFile();
  if (!file) return;
  const dataUrl = await readAsDataUrl(file);
  state.logoData = dataUrl;
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
  state = createInitialState();
  state.ui = createUiState();
  persistAndRender('Aplikacja została zresetowana.');
}

function loadCheckpointById(id) {
  const checkpoint = loadCheckpoints().find(item => item.id === id);
  if (!checkpoint) return;
  if (!window.confirm('Wczytać punkt kontrolny i zastąpić aktualny stan?')) return;
  state = hydrateState(checkpoint.snapshot);
  state.ui = createUiState();
  persistAndRender('Punkt kontrolny został wczytany.');
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
  const filename = safeFilename(`${state.eventName || 'zawody'}_wyniki_${timestamp()}.html`);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  flash('Eksport wyników HTML przygotowany.');
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
  } catch {
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
  if (index === 0) return getStartOrderIds();
  if (isFinalEventIndex(index)) return getFinalOrderIds();
  const previous = state.eventHistory[index - 1];
  const fallback = getStartOrderIds();
  if (!previous) return fallback;
  return [...state.selectedCompetitorIds].sort((a, b) => {
    const resultA = previous.results.find(row => row.id === a);
    const resultB = previous.results.find(row => row.id === b);
    const pointsA = Number.parseFloat(resultA?.points) || 0;
    const pointsB = Number.parseFloat(resultB?.points) || 0;
    if (pointsA !== pointsB) return pointsA - pointsB;
    return fallback.indexOf(a) - fallback.indexOf(b);
  });
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

function mergeCompetitors(imported) {
  const byKey = new Map(state.competitors.map(item => [normalizeKey(item.name), item]));
  imported.forEach(item => {
    if (!byKey.has(normalizeKey(item.name))) {
      state.competitors.push({ ...item, id: makeId('competitor', item.name) });
    }
  });
  state.competitors.sort((a, b) => collator.compare(a.name, b.name));
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

function applyFilter(type, value) {
  const list = app.querySelector(`[data-list="${cssEscape(type)}"]`);
  if (!list) return;
  const needle = normalizeKey(value);
  list.querySelectorAll('[data-filter-text]').forEach(row => {
    row.hidden = needle && !normalizeKey(row.dataset.filterText).includes(needle);
  });
}

function persist() {
  state.scores = buildScores(state.selectedCompetitorIds, state.eventHistory);
  saveState(state);
}

function persistAndRender(message = '') {
  persist();
  render();
  if (message) flash(message);
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
  <p>${escapeHtml(state.eventLocation || '')} · ${new Date().toLocaleString('pl-PL')}</p>
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
    navigator.serviceWorker.register('./sw.js').catch(() => {});
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

function formatDate(value) {
  try {
    return new Date(value).toLocaleString('pl-PL');
  } catch {
    return '';
  }
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
}
