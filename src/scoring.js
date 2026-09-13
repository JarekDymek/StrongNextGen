export function parseResult(rawValue, eventType) {
  const valStr = String(rawValue ?? '').trim().replace(',', '.').toLowerCase();
  const worstVal = eventType === 'high' ? -Infinity : +Infinity;

  if (valStr === '' || valStr === '0' || valStr === 'dnf') {
    return { val: worstVal, raw: rawValue, zero: true, dnf: true };
  }

  if (eventType === 'low') {
    const legacyDistance = valStr.match(/^dnf\s*\+\s*(\d+(?:\.\d+)?)\s*m?$/);
    if (legacyDistance) {
      const distance = Number(legacyDistance[1]);
      if (distance > 0) {
        return { val: 99000 - distance, raw: rawValue, zero: false, isDist: true, distance };
      }
    }

    if (valStr.includes(':')) {
      const parts = valStr.split(':');
      const validTime = parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+(?:\.\d+)?$/.test(parts[1]);
      const minutes = validTime ? Number(parts[0]) : NaN;
      const seconds = validTime ? Number(parts[1]) : NaN;
      if (Number.isFinite(minutes) && Number.isFinite(seconds) && seconds >= 0 && seconds < 60) {
        return { val: minutes * 60 + seconds, raw: rawValue, zero: false, isTime: true };
      }
      return { val: worstVal, raw: rawValue, zero: true, error: true };
    }

    if (valStr.startsWith('0') && valStr.length > 1) {
      const distanceText = valStr.slice(1);
      const distance = /^\d+(?:\.\d+)?$/.test(distanceText) ? Number(distanceText) : NaN;
      if (Number.isFinite(distance) && distance > 0) {
        return { val: 99000 - distance, raw: rawValue, zero: false, isDist: true, distance };
      }
      return { val: worstVal, raw: rawValue, zero: true, error: true };
    }

    const time = /^\d+(?:\.\d+)?$/.test(valStr) ? Number(valStr) : NaN;
    if (Number.isFinite(time) && time > 0) {
      return { val: time, raw: rawValue, zero: false, isTime: true };
    }

    return { val: worstVal, raw: rawValue, zero: true, error: true };
  }

  if (eventType === 'high') {
    const score = /^\d+(?:\.\d+)?$/.test(valStr) ? Number(valStr) : NaN;
    if (Number.isFinite(score) && score > 0) {
      return { val: score, raw: rawValue, zero: false };
    }
    if (Number.isFinite(score) && score === 0) {
      return { val: worstVal, raw: rawValue, zero: true, dnf: true };
    }
    return { val: worstVal, raw: rawValue, zero: true, error: true };
  }

  return { val: worstVal, raw: rawValue, zero: true, error: true };
}

export function calculateEventPoints(currentResults, totalCompetitors, eventType) {
  let hasError = false;
  const parsedResults = currentResults.map(entry => {
    const parsed = parseResult(entry.result, eventType);
    parsed.id = entry.id;
    parsed.name = entry.name;
    if (parsed.error === true) hasError = true;
    return parsed;
  });

  if (hasError) {
    return { results: [], error: true };
  }

  parsedResults.sort((a, b) => eventType === 'high' ? b.val - a.val : a.val - b.val);

  const finalEventResults = [];
  for (let i = 0; i < parsedResults.length;) {
    let j = i;
    while (j < parsedResults.length && parsedResults[j].val === parsedResults[i].val) {
      j++;
    }

    const tiedCount = j - i;
    let sumOfPoints = 0;
    for (let k = i; k < j; k++) {
      if (!parsedResults[k].zero) {
        sumOfPoints += totalCompetitors - k;
      }
    }

    const averagePoints = tiedCount > 0 ? sumOfPoints / tiedCount : 0;
    for (let k = i; k < j; k++) {
      const p = parsedResults[k];
      let displayResult = p.raw;
      if (p.isDist) {
        displayResult = `DNF+${p.distance}m`;
      } else if (p.dnf && !p.isDist) {
        displayResult = 'DNF';
      }

      finalEventResults.push({
        id: p.id,
        name: p.name,
        result: displayResult,
        rawInput: p.raw,
        place: p.zero ? '-' : i + 1,
        points: (p.zero ? 0 : averagePoints).toFixed(2),
        isDist: Boolean(p.isDist),
        isDnf: Boolean(p.dnf)
      });
    }
    i = j;
  }

  return { results: finalEventResults, error: false };
}

export function buildScores(competitorIds, eventHistory) {
  const scores = Object.fromEntries(competitorIds.map(id => [id, 0]));
  eventHistory.forEach(event => {
    event.results.forEach(result => {
      scores[result.id] = (scores[result.id] || 0) + (Number.parseFloat(result.points) || 0);
    });
  });
  return scores;
}

export function buildNextStartOrder(competitorIds, previousEvent, fallbackOrder = competitorIds) {
  const selectedIds = [...competitorIds];
  if (!previousEvent?.results?.length) return reconcileOrder(fallbackOrder, selectedIds);

  const fallback = reconcileOrder(fallbackOrder, selectedIds);
  const previousOrder = reconcileOrder(previousEvent.orderIds || [], fallback);
  const previousPosition = new Map(previousOrder.map((id, index) => [id, index]));
  const fallbackPosition = new Map(fallback.map((id, index) => [id, index]));
  const points = new Map(previousEvent.results.map(result => [result.id, Number.parseFloat(result.points) || 0]));

  return selectedIds.map((id, inputIndex) => ({ id, inputIndex })).sort((a, b) => {
    const pointsDifference = (points.get(a.id) || 0) - (points.get(b.id) || 0);
    if (pointsDifference !== 0) return pointsDifference;
    const priorDifference = (previousPosition.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (previousPosition.get(b.id) ?? Number.MAX_SAFE_INTEGER);
    if (priorDifference !== 0) return priorDifference;
    const fallbackDifference = (fallbackPosition.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (fallbackPosition.get(b.id) ?? Number.MAX_SAFE_INTEGER);
    if (fallbackDifference !== 0) return fallbackDifference;
    return a.inputIndex - b.inputIndex;
  }).map(entry => entry.id);
}

function reconcileOrder(order, selectedIds) {
  const selectedSet = new Set(selectedIds);
  const existing = order.filter(id => selectedSet.has(id));
  const missing = selectedIds.filter(id => !existing.includes(id));
  return [...existing, ...missing];
}

export function breakTie(competitorIdA, competitorIdB, eventHistory, totalCompetitors) {
  const countPlaces = competitorId => {
    const places = Array(totalCompetitors + 1).fill(0);
    eventHistory.forEach(event => {
      const result = event.results.find(row => row.id === competitorId);
      if (result && result.place !== '-') {
        const place = Number.parseInt(result.place, 10);
        if (Number.isFinite(place)) places[place]++;
      }
    });
    return places;
  };

  const aPlaces = countPlaces(competitorIdA);
  const bPlaces = countPlaces(competitorIdB);

  for (let i = 1; i <= totalCompetitors; i++) {
    if (aPlaces[i] !== bPlaces[i]) {
      return { outcome: bPlaces[i] - aPlaces[i], reason: `więcej ${i}. miejsc` };
    }
  }

  const lastSharedEvent = [...eventHistory].reverse().find(event =>
    event.results.some(row => row.id === competitorIdA) &&
    event.results.some(row => row.id === competitorIdB)
  );

  if (lastSharedEvent) {
    const aResult = lastSharedEvent.results.find(row => row.id === competitorIdA);
    const bResult = lastSharedEvent.results.find(row => row.id === competitorIdB);
    const aParsed = parseResult(aResult?.rawInput ?? aResult?.result, lastSharedEvent.type);
    const bParsed = parseResult(bResult?.rawInput ?? bResult?.result, lastSharedEvent.type);

    if (!aParsed.error && !bParsed.error && aParsed.val !== bParsed.val) {
      const outcome = lastSharedEvent.type === 'high'
        ? bParsed.val - aParsed.val
        : aParsed.val - bParsed.val;
      return {
        outcome,
        reason: `lepszy wynik w ostatniej wspólnej konkurencji (${lastSharedEvent.nr}: ${lastSharedEvent.name})`
      };
    }

    const aPoints = Number.parseFloat(aResult?.points) || 0;
    const bPoints = Number.parseFloat(bResult?.points) || 0;
    if (aPoints !== bPoints) {
      return {
        outcome: bPoints - aPoints,
        reason: `więcej punktów w ostatniej wspólnej konkurencji (${lastSharedEvent.nr}: ${lastSharedEvent.name})`
      };
    }
  }

  return { outcome: 0, reason: 'Remis nierozstrzygnięty' };
}

export function rankStandings(competitors, scores, eventHistory) {
  const totalCompetitors = competitors.length;
  const ranked = competitors
    .map(competitor => ({
      ...competitor,
      points: scores[competitor.id] || 0
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return breakTie(a.id, b.id, eventHistory, totalCompetitors).outcome;
    })
    .map((competitor, index) => ({ ...competitor, rank: index + 1 }));

  for (let i = 0; i < ranked.length;) {
    let j = i + 1;
    while (j < ranked.length && ranked[j].points === ranked[i].points) j++;

    if (j - i > 1) {
      const group = ranked.slice(i, j);
      const first = group[0];
      const second = group[1];
      const tie = breakTie(first.id, second.id, eventHistory, totalCompetitors);
      const resolved = tie.outcome !== 0 && tie.reason !== 'Remis nierozstrzygnięty';

      group.forEach(row => {
        row.tieGroupSize = group.length;
        row.tieResolved = resolved;
      });

      if (resolved) {
        first.tieStatus = 'Wygrywa remis';
        first.tieReason = `Wygrywa z ${second.name}: ${tie.reason}`;
        group.slice(1).forEach(row => {
          row.tieStatus = 'Niżej po tie-breaku';
          row.tieReason = `Remis punktowy rozstrzygnięty: ${tie.reason}`;
        });
      } else {
        group.forEach(row => {
          row.tieStatus = 'Remis nierozstrzygnięty';
          row.tieReason = 'Zawodnicy mają tę samą liczbę punktów i tie-break nie wskazał zwycięzcy.';
        });
      }
    }

    i = j;
  }

  return ranked;
}

export function buildFinalStartOrder(competitors, scores, eventHistory, finalistsLimit = 5) {
  const ranked = rankStandings(competitors, scores, eventHistory);
  const limit = Math.max(1, Math.min(Number.parseInt(finalistsLimit, 10) || 5, ranked.length));
  return ranked.slice(0, limit).reverse();
}

// Presentation only: never feed these labels back into scoring or tie-breaks.
// Legacy bag convention approved for the six-bag throw: +100 per missing bag.
export function resultFormat(event = {}) {
  const name = String(event.name || '').toLowerCase().replace(/ł/g, 'l')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\bzegar\b/.test(name)) return 'clock';
  if (/przerzucanie (?:6 )?workow nad poprzeczka/.test(name)) return 'bags';
  if (/martwy ciag|wyciskanie platformy|powtorzen|axel|wyciskanie belki|przerzucanie kuli/.test(name) && event.type !== 'low') return 'reps';
  if (/na dystans/.test(name) || /spacer|przeciaganie|pociag|yoke|kowadlo|nosidlo|tir w siadzie/.test(name)) return event.type === 'high' ? 'distance' : 'course';
  if (/uchwyt herkulesa|waga placzu/.test(name)) return 'seconds';
  return event.type === 'low' ? 'seconds' : 'number';
}

export function formatEventResult(value, event = {}) {
  const row = value && typeof value === 'object' ? value : null;
  const raw = row ? row.rawInput ?? row.result : value;
  if (String(raw ?? '').trim() === '') return '—';
  const parsed = parseResult(raw, event.type || 'low');
  const kind = resultFormat(event);
  const decimal = n => String(n).replace('.', ',');
  if (parsed.isDist) return `${decimal(parsed.distance)} m`;
  if (parsed.error) return '—';
  if (parsed.dnf || row?.isDnf) {
    if (kind === 'bags') return '0 na 6 worków';
    if (kind === 'reps') return '0 powtórzeń';
    if (kind === 'clock') return '0 minut';
    if (kind === 'course' || kind === 'distance') return '0 metrów';
    if (kind === 'seconds') return '0 s';
    return '0';
  }
  if (kind === 'bags') {
    const missing = Math.floor(parsed.val / 100);
    if (missing < 0 || missing > 5) return 'Wynik worków do sprawdzenia';
    return `${6 - missing} na 6 worków — ${decimal((parsed.val - missing * 100).toFixed(2))} s`;
  }
  if (kind === 'clock') return `${decimal(parsed.val)} minut`;
  if (kind === 'reps') return `${decimal(parsed.val)} powt.`;
  if (kind === 'distance') return `${decimal(parsed.val)} m`;
  if (kind === 'course' || kind === 'seconds') return `${decimal(parsed.val.toFixed(2))} s`;
  return decimal(parsed.val);
}
