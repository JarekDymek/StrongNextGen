function reconcileOrder(order = [], selectedIds = []) {
  const selected = new Set(selectedIds);
  const existing = order.filter(id => selected.has(id));
  const missing = selectedIds.filter(id => !existing.includes(id));
  return [...existing, ...missing];
}

export function buildNextStartOrder(selectedIds = [], previousEvent = null, fallbackOrder = []) {
  if (!previousEvent) return reconcileOrder(fallbackOrder, selectedIds);
  const previousOrder = reconcileOrder(previousEvent.orderIds || fallbackOrder, selectedIds);
  const orderIndex = new Map(previousOrder.map((id, index) => [id, index]));
  const results = new Map((previousEvent.results || []).map(result => [result.id, result]));

  return [...selectedIds].sort((a, b) => {
    const pointsA = Number.parseFloat(results.get(a)?.points) || 0;
    const pointsB = Number.parseFloat(results.get(b)?.points) || 0;
    if (pointsA !== pointsB) return pointsA - pointsB;
    return (orderIndex.get(a) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function isFinalEventIndex(state, index) {
  const count = Array.isArray(state?.selectedEventIds) ? state.selectedEventIds.length : 0;
  return count > 1 && index === count - 1;
}

export function advanceToNextNonFinalEvent(state) {
  if (!state || !Array.isArray(state.eventHistory) || !Array.isArray(state.selectedEventIds)) return null;
  const currentIndex = Number.parseInt(state.currentEventIndex, 10) || 0;
  const previous = state.eventHistory[currentIndex];
  const nextIndex = currentIndex + 1;
  if (!previous || nextIndex >= state.selectedEventIds.length || isFinalEventIndex(state, nextIndex)) return null;

  const initialStartOrderIds = Array.isArray(state.initialStartOrderIds) && state.initialStartOrderIds.length
    ? [...state.initialStartOrderIds]
    : [...(state.startOrderIds || [])];

  return {
    ...state,
    initialStartOrderIds,
    startOrderIds: buildNextStartOrder(
      state.selectedCompetitorIds || [],
      previous,
      previous.orderIds || state.startOrderIds || []
    ),
    currentEventIndex: nextIndex,
    stage: 'scoring'
  };
}

export function rewindLastEvent(state) {
  if (!state || !Array.isArray(state.eventHistory) || !state.eventHistory.length) return null;
  const history = state.eventHistory.slice(0, -1);
  const currentEventIndex = history.length;
  const initial = Array.isArray(state.initialStartOrderIds) && state.initialStartOrderIds.length
    ? state.initialStartOrderIds
    : state.startOrderIds || [];
  const previous = history[currentEventIndex - 1];
  const usePreviousOrder = currentEventIndex > 0 && !isFinalEventIndex(state, currentEventIndex) && previous;

  return {
    ...state,
    eventHistory: history,
    currentEventIndex,
    startOrderIds: usePreviousOrder
      ? buildNextStartOrder(state.selectedCompetitorIds || [], previous, previous.orderIds || initial)
      : reconcileOrder(initial, state.selectedCompetitorIds || []),
    stage: 'scoring'
  };
}

export function restoreInitialStartOrder(state, stage = 'draw') {
  if (!state) return null;
  const initial = Array.isArray(state.initialStartOrderIds) && state.initialStartOrderIds.length
    ? state.initialStartOrderIds
    : state.startOrderIds || [];
  return { ...state, startOrderIds: [...initial], stage };
}
