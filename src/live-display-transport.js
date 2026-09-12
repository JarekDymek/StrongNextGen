// One request at a time; retain only a dirty flag, never a queue of old snapshots.
export function createLivePublisher({ readSnapshot, send, onStatus = () => {}, intervalMs = 1000,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let dirty = true, stopped = false, busy = false, timer, lastStart = -Infinity;
  let mediaSent = '', lastBody = '', seq = 0;
  const status = value => { try { onStatus(value); } catch {} };
  function schedule() {
    if (stopped || timer != null || busy) return;
    timer = setTimer(() => { timer = null; void tick(); }, Math.max(0, intervalMs - (now() - lastStart)));
  }
  async function tick() {
    if (stopped || busy) return;
    busy = true;
    lastStart = now();
    try {
      const payload = { seq: seq = Math.max(seq + 1, now()) };
      let mediaText = mediaSent;
      let bodyText = lastBody;
      if (dirty) {
        dirty = false;
        const { media, ...snapshot } = readSnapshot();
        mediaText = JSON.stringify(media);
        bodyText = JSON.stringify(snapshot);
        if (bodyText !== lastBody) payload.snapshot = snapshot;
        if (mediaText !== mediaSent) payload.media = media;
      }
      await send(payload);
      mediaSent = mediaText;
      lastBody = bodyText;
      status({ connected: true, syncedAt: now() });
    } catch {
      dirty = true;
      // The server may have committed a request whose response was lost.
      // Retry a complete latest snapshot even when it matches the last ACK.
      lastBody = '';
      mediaSent = '';
      status({ connected: false });
    } finally {
      busy = false;
      schedule();
    }
  }
  schedule();
  return {
    notify() { dirty = true; schedule(); },
    stop() { stopped = true; if (timer != null) clearTimer(timer); }
  };
}
