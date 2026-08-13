const polishCollator = new Intl.Collator('pl', { sensitivity: 'base' });

export function seasonPointsForPosition(position) {
  const parsed = Number.parseInt(position, 10);
  return parsed >= 1 && parsed <= 5 ? 6 - parsed : 0;
}

export function normalizeSeasonEvents(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item, index) => normalizeSeasonEvent(item, index))
    .filter(Boolean)
    .filter(item => {
      const key = item.id || `${item.date}:${normalizeText(item.location)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareSeasonEvents);
}

export function mergeSeasonEvents(current, imported) {
  const byKey = new Map();
  [current, imported].forEach(collection => {
    normalizeSeasonEvents(collection).forEach(event => {
      byKey.set(`${event.date}:${normalizeText(event.location)}`, event);
    });
  });
  return normalizeSeasonEvents([...byKey.values()])
    .map((event, index) => ({ ...event, number: index + 1 }));
}

export function mergeCanonicalSeasonEvents(canonical, local) {
  const baseEvents = normalizeSeasonEvents(canonical);
  const highestBaseNumber = baseEvents.reduce((maximum, event) => Math.max(maximum, event.number || 0), 0);
  const baseIds = new Set(baseEvents.map(event => event.id).filter(Boolean));
  const baseKeys = new Set(baseEvents.map(seasonEventKey));
  const localOnly = normalizeSeasonEvents(local).filter(event => {
    if (baseIds.has(event.id) || baseKeys.has(seasonEventKey(event))) return false;
    return Number(event.number || 0) > highestBaseNumber;
  });
  return normalizeSeasonEvents([...baseEvents, ...localOnly]);
}

export function normalizeSeasonEvent(item, index = 0) {
  if (!item || typeof item !== 'object') return null;
  const date = normalizeIsoDate(item.date);
  const location = String(item.location || item.city || '').trim();
  if (!date || !location) return null;
  const ranking = (Array.isArray(item.ranking) ? item.ranking : [])
    .map((row, rankingIndex) => {
      const name = String(row?.name || row?.competitor || '').trim();
      const position = Number.parseInt(row?.position ?? row?.rank ?? rankingIndex + 1, 10);
      if (!name || position < 1 || position > 5) return null;
      return {
        position,
        competitorId: row.competitorId || '',
        name,
        sourceName: String(row.sourceName || name),
        seasonPoints: seasonPointsForPosition(position),
        competitionPoints: Number(row.competitionPoints || row.points || 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position || polishCollator.compare(a.name, b.name))
    .slice(0, 5);

  return {
    ...item,
    id: item.id || `season-${date}-${slug(location)}-${index}`,
    number: Number.parseInt(item.number, 10) || index + 1,
    date,
    location,
    name: item.name || `${location} · ${formatSeasonDate(date)}`,
    sourceFile: String(item.sourceFile || ''),
    ranking,
    competitions: Array.isArray(item.competitions) ? item.competitions : [],
  };
}

export function calculateSeasonStandings(items, maxCountedStarts = 4) {
  const events = normalizeSeasonEvents(items);
  const byCompetitor = new Map();
  events.forEach((event, eventIndex) => {
    event.ranking.forEach(result => {
      const key = normalizeText(result.name);
      if (!byCompetitor.has(key)) {
        byCompetitor.set(key, {
          competitorId: result.competitorId || '',
          name: result.name,
          results: [],
        });
      }
      byCompetitor.get(key).results.push({
        eventId: event.id,
        eventNumber: event.number || eventIndex + 1,
        date: event.date,
        location: event.location,
        position: result.position,
        points: seasonPointsForPosition(result.position),
      });
    });
  });

  const limit = Math.max(1, Number.parseInt(maxCountedStarts, 10) || 4);
  const standings = [...byCompetitor.values()].map(row => {
    const chronological = [...row.results].sort((a, b) => a.date.localeCompare(b.date) || a.eventNumber - b.eventNumber);
    const counted = [...chronological]
      .sort((a, b) => b.points - a.points || a.date.localeCompare(b.date) || a.eventNumber - b.eventNumber)
      .slice(0, limit);
    const countedIds = new Set(counted.map(result => result.eventId));
    const allPoints = chronological.reduce((sum, result) => sum + result.points, 0);
    const countedPoints = counted.reduce((sum, result) => sum + result.points, 0);
    return {
      ...row,
      starts: chronological.length,
      results: chronological,
      countedEventIds: [...countedIds],
      allPoints,
      countedPoints,
      rejectedPoints: allPoints - countedPoints,
    };
  });

  standings.sort((a, b) => b.countedPoints - a.countedPoints || polishCollator.compare(a.name, b.name));
  let previousPoints = null;
  let previousRank = 0;
  standings.forEach((row, index) => {
    if (row.countedPoints !== previousPoints) {
      previousPoints = row.countedPoints;
      previousRank = index + 1;
    }
    row.rank = previousRank;
  });
  return standings;
}

export function formatSeasonDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || '');
}

function compareSeasonEvents(a, b) {
  return a.date.localeCompare(b.date) || polishCollator.compare(a.location, b.location);
}

function seasonEventKey(event) {
  return `${event.date}:${normalizeText(event.location)}`;
}

function normalizeIsoDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? text
    : match
      ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
      : '';
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}

function normalizeText(value) {
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
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event';
}
