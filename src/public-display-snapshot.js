import { formatEventResult, rankStandings } from './scoring.js';

const text = value => String(value ?? '');
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export function formatPublicResult(value, type = 'low', event = {}) {
  return formatEventResult(value, { ...event, type });
}

export function safeDisplayImage(value) {
  const src = text(value);
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(src)) return src;
  if (/^https:\/\//i.test(src)) return src;
  if (/^(\.\/|\.\.\/)?assets\/[a-z0-9_./-]+$/i.test(src)) return src;
  return '';
}

export function buildPublicDisplaySnapshot(state, { orderIds, mode = 'auto', activeId = '' } = {}) {
  const ids = state.selectedCompetitorIds || [];
  const competitors = ids.map(id => state.competitors.find(c => c.id === id)).filter(Boolean);
  const index = state.currentEventIndex || 0;
  const event = state.events.find(e => e.id === state.selectedEventIds[index]);
  const history = state.eventHistory || [];
  const person = id => competitors.find(c => c.id === id);
  const resultRows = entry => (entry.results || []).map(row => ({
    id: text(row.id), name: text(person(row.id)?.name || row.name),
    result: formatPublicResult(row, entry.type, entry), place: text(row.place), points: number(row.points)
  }));
  const previous = history.map(entry => ({
    number: number(entry.nr), name: text(entry.name), rows: resultRows(entry)
  }));
  const draft = state.drafts?.[event?.id] || {};
  const finalized = history[index];
  const current = {
    number: index + 1, name: text(event?.name), completed: Boolean(finalized),
    rows: (orderIds || finalized?.orderIds || state.startOrderIds || ids).map((id, start) => ({
      id: text(id), name: text(person(id)?.name), start: start + 1,
      result: formatPublicResult(draft[id], event?.type, event)
    })),
    results: finalized ? resultRows(finalized) : []
  };
  const stage = state.stage === 'summary' ? 'end' : mode === 'break' || state.stage !== 'scoring'
    ? 'break' : finalized ? 'summary' : 'live';
  const next = state.events.find(e => e.id === state.selectedEventIds[index + (finalized ? 1 : 0)]);
  return {
    version: 1, eventName: text(state.eventName), eventLocation: text(state.eventLocation),
    eventDate: text(state.eventDate), eventCount: state.selectedEventIds.length,
    stage, activeId: text(activeId), current, previous,
    overall: rankStandings(competitors, state.scores || {}, history).map(row => ({
      id: text(row.id), name: text(row.name), place: text(row.rank), points: number(row.points)
    })),
    next: next ? { name: text(next.name), number: index + (finalized ? 2 : 1) } : null,
    media: {
      logo: safeDisplayImage(state.logoData) || '../assets/logo-strong-man.png',
      photos: Object.fromEntries(competitors.map(c => [text(c.id), safeDisplayImage(c.photo)]))
    }
  };
}

