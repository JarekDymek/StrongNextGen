const DEFAULT_TIMEOUT_MS = 15_000;

export function submissionJson(submission) {
  return JSON.stringify(submission, null, 2);
}

export function createSubmissionFile(submission, filename, FileType = globalThis.File) {
  const content = submissionJson(submission);
  if (typeof FileType === 'function') {
    return new FileType([content], filename, { type: 'application/json' });
  }
  const blob = new Blob([content], { type: 'application/json' });
  Object.defineProperty(blob, 'name', { value: filename });
  return blob;
}

export function createShareFallbackFile(submission, filename, FileType = globalThis.File) {
  const content = submissionJson(submission);
  const fallbackName = `${filename.replace(/\.json$/i, '')}.txt`;
  if (typeof FileType === 'function') {
    return new FileType([content], fallbackName, { type: 'text/plain' });
  }
  const blob = new Blob([content], { type: 'text/plain' });
  Object.defineProperty(blob, 'name', { value: fallbackName });
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

export function canShareSubmission(navigatorRef, file, fallbackFile = null) {
  if (!navigatorRef?.share || !navigatorRef?.canShare) return false;
  return [file, fallbackFile]
    .filter(Boolean)
    .some(candidate => navigatorRef.canShare({ files: [candidate] }));
}

export async function shareSubmission(navigatorRef, file, title, fallbackFile = null) {
  if (!navigatorRef?.share || !navigatorRef?.canShare) throw new Error('shareUnavailable');

  const canShareFallback = Boolean(fallbackFile && navigatorRef.canShare({ files: [fallbackFile] }));
  if (/Android/i.test(String(navigatorRef.userAgent || '')) && canShareFallback) {
    await navigatorRef.share({ files: [fallbackFile], title });
    return 'text';
  }

  const canShareJson = navigatorRef.canShare({ files: [file] });
  if (canShareJson) {
    try {
      await navigatorRef.share({ files: [file], title });
      return 'json';
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      if (!canShareFallback) throw error;
    }
  }

  if (!canShareFallback) throw new Error('shareUnavailable');
  await navigatorRef.share({ files: [fallbackFile], title });
  return 'text';
}
