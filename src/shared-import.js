export const SHARED_SUBMISSION_CACHE = 'strongman-next-shared-submission-v1';
export const SHARED_SUBMISSION_PATH = '__shared-submission__';

export async function consumeSharedSubmission({ cacheStorage = globalThis.caches, baseUrl = globalThis.document?.baseURI } = {}) {
  if (!cacheStorage || !baseUrl) return null;
  const cache = await cacheStorage.open(SHARED_SUBMISSION_CACHE);
  const key = new URL(SHARED_SUBMISSION_PATH, baseUrl).href;
  const response = await cache.match(key);
  if (!response) return null;
  await cache.delete(key);
  const text = await response.text();
  if (!text || text.length > 15 * 1024 * 1024) throw new Error('sharedSubmissionInvalid');
  return {
    filename: decodeURIComponent(response.headers.get('x-shared-filename') || 'zawodnik.json'),
    text
  };
}

export function registerFileLaunchHandler(onFile, launchQueueRef = globalThis.launchQueue) {
  if (!launchQueueRef?.setConsumer || typeof onFile !== 'function') return false;
  launchQueueRef.setConsumer(async launchParams => {
    for (const handle of launchParams?.files || []) {
      const file = await handle.getFile();
      await onFile(file);
    }
  });
  return true;
}
