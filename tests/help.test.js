import assert from 'node:assert/strict';
import { getEmergencyHelpTopics, topicAvailability } from '../src/help.js';

const liveContext = {
  stage: 'scoring',
  currentEventIndex: 1,
  selectedEventCount: 4,
  historyCount: 1,
  currentFinalized: false,
  currentDraftCount: 2,
  hasCheckpoints: true,
  online: true
};

const correction = topicAvailability('correct-previous-result', liveContext);
assert.equal(correction.available, true);
assert.equal(correction.recommended, true);

const correctionAfterFinalize = topicAvailability('correct-previous-result', {
  ...liveContext,
  historyCount: 2,
  currentFinalized: true
});
assert.equal(correctionAfterFinalize.available, false);
assert.match(correctionAfterFinalize.reason, /Przypadkowe podsumowanie/);

const reorder = topicAvailability('reorder-events', liveContext);
assert.equal(reorder.available, true);
assert.match(reorder.reason, /zablokowana/);

assert.equal(topicAvailability('reorder-events', { selectedEventCount: 3, historyCount: 0 }).available, false);
assert.equal(topicAvailability('undo-summary', { historyCount: 0 }).available, false);
assert.equal(topicAvailability('offline-stopwatch', { online: false }).recommended, true);

const filtered = getEmergencyHelpTopics(liveContext, 'pogoda');
assert.deepEqual(filtered.map(topic => topic.id), ['reorder-events']);
assert.equal(getEmergencyHelpTopics(liveContext)[0].recommended, true);

console.log('Help tests passed');
