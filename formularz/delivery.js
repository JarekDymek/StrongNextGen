const DEFAULT_TIMEOUT_MS = 15_000;

export function submissionJson(submission) {
  return JSON.stringify(submission, null, 2);
}

export function createSubmissionFile(submission, filename, FileType = globalThis.File) {
  const content = submissionJson(submission);
  if (typeof FileType === 'function') {
    return new FileType([content], filename, { type: 'application/json;charset=utf-8' });
  }
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  Object.defineProperty(blob, 'name', { value: filename });
  return blob;
}

export function resolveSubmissionEndpoint(documentRef = globalThis.document) {
  return String(documentRef?.querySelector('meta[name="strongman-submission-endpoint"]')?.content || '').trim();
}

export async function sendSubmission({ endpoint, submission, filename, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!endpoint) throw new Error('sendUnavailable');
  if (typeof fetchImpl !== 'function') throw new Error('sendUnavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ submission, filename }),
      signal: controller.signal
    });
    if (!response?.ok) throw new Error('sendFailed');
    return true;
  } catch (error) {
    if (error?.message === 'sendUnavailable') throw error;
    throw new Error('sendFailed');
  } finally {
    clearTimeout(timeout);
  }
}

export function createSendController(send = sendSubmission) {
  let inFlight = null;
  return {
    run(options) {
      if (inFlight) return inFlight;
      inFlight = Promise.resolve()
        .then(() => send(options))
        .finally(() => { inFlight = null; });
      return inFlight;
    },
    isBusy() {
      return Boolean(inFlight);
    }
  };
}

export function canShareSubmission(navigatorRef, file) {
  return Boolean(navigatorRef?.share && navigatorRef?.canShare?.({ files: [file] }));
}

export async function shareSubmission(navigatorRef, file, title) {
  if (!canShareSubmission(navigatorRef, file)) throw new Error('shareUnavailable');
  await navigatorRef.share({ files: [file], title });
}
