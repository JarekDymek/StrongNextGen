export function parseResult(rawValue, eventType) {
  const valStr = String(rawValue ?? '').trim().replace(',', '.').toLowerCase();
  const worstVal = eventType === 'high' ? -Infinity : +Infinity;

  if (valStr === '' || valStr === '0' || valStr === 'dnf') {
    return { val: worstVal, raw: rawValue, zero: true, dnf: true };
  }

  if (eventType === 'low') {
    if (valStr.includes(':')) {
      const parts = valStr.split(':');
      const minutes = Number.parseFloat(parts[0]);
      const seconds = Number.parseFloat(parts[1]);
      if (Number.isFinite(minutes) && Number.isFinite(seconds) && seconds >= 0 && seconds < 60) {
        return { val: minutes * 60 + seconds, raw: rawValue, zero: false, isTime: true };
      }
      return { val: worstVal, raw: rawValue, zero: true, error: true };
    }

    if (valStr.startsWith('0') && valStr.length > 1) {
      const distance = Number.parseFloat(valStr.slice(1));
      if (Number.isFinite(distance) && distance > 0) {
        return { val: 99000 - distance, raw: rawValue, zero: false, isDist: true, distance };
      }
      return { val: worstVal, raw: rawValue, zero: true, error: true };
    }

    const time = Number.parseFloat(valStr);
    if (Number.isFinite(time) && time > 0) {
      return { val: time, raw: rawValue, zero: false, isTime: true };
    }

    return { val: worstVal, raw: rawValue, zero: true, error: true };
  }

  if (eventType === 'high') {
    const score = Number.parseFloat(valStr);
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

  for (let i = eventHistory.length - 1; i >= 0; i--) {
    const event = eventHistory[i];
    const aResult = event.results.find(row => row.id === competitorIdA);
    const bResult = event.results.find(row => row.id === competitorIdB);
    if (aResult && bResult) {
      const aPoints = Number.parseFloat(aResult.points) || 0;
      const bPoints = Number.parseFloat(bResult.points) || 0;
      if (aPoints !== bPoints) {
        return { outcome: bPoints - aPoints, reason: `lepszy wynik w konkurencji ${event.nr}: ${event.name}` };
      }
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
