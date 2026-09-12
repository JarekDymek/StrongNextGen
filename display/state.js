export function mergeDisplayState(previous, payload) {
  if (!payload || !Number.isFinite(payload.updatedAt) || !payload.revision || !payload.mediaVersion) {
    throw new Error('invalid-state');
  }
  const snapshot = payload.snapshot || previous?.snapshot;
  const media = payload.media || previous?.media;
  if (!snapshot || snapshot.version !== 1 || !snapshot.current ||
      !Array.isArray(snapshot.current.rows) || !Array.isArray(snapshot.current.results) ||
      !Array.isArray(snapshot.overall) || !Array.isArray(snapshot.previous) ||
      !['live', 'summary', 'break', 'end'].includes(snapshot.stage) ||
      !media || typeof media.photos !== 'object' ||
      (!payload.media && payload.mediaVersion !== previous?.mediaVersion) ||
      (!payload.snapshot && payload.revision !== previous?.revision)) throw new Error('invalid-state');
  return { snapshot, media, revision: payload.revision, mediaVersion: payload.mediaVersion, updatedAt: payload.updatedAt };
}

export function selectScreen(snapshot, elapsed) {
  const current = snapshot.current;
  if (snapshot.stage === 'live') return { kind: 'live', title: current.name, rows: current.rows };
  if (snapshot.stage === 'end') return { kind: 'overall', title: 'KLASYFIKACJA KOŃCOWA', rows: snapshot.overall };
  if (snapshot.stage === 'summary' && elapsed < 12000) {
    return { kind: 'results', title: current.name + ' — WYNIKI', rows: current.results };
  }
  const rotationStart = snapshot.stage === 'summary' ? 12000 : 0;
  const screens = [{ kind: 'overall', title: 'KLASYFIKACJA GENERALNA', rows: snapshot.overall },
    ...snapshot.previous.map(event => ({ kind: 'results', title: event.number + '. ' + event.name, rows: event.rows })),
    ...(snapshot.next ? [{ kind: 'next', title: 'ZA CHWILĘ', event: snapshot.next }] : [])];
  // Each table gets enough time to show every page before rotating.
  const durations = screens.map(screen => Math.max(12000, Math.ceil((screen.rows?.length || 0) / 8) * 8000));
  const cycle = durations.reduce((sum, duration) => sum + duration, 0);
  let position = (elapsed - rotationStart) % cycle;
  for (let i = 0; i < screens.length; i++) {
    if (position < durations[i]) return { ...screens[i], pageElapsed: position };
    position -= durations[i];
  }
  return screens[0];
}

