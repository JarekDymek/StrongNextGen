const DEFAULT_TIMEOUT_MS = 20_000;

export function collectResultsRecipients(competitors) {
  const byEmail = new Map();
  (Array.isArray(competitors) ? competitors : []).forEach(competitor => {
    const email = String(competitor?.contact?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return;
    const deliveryProof = /^v1:[a-f0-9]{64}$/.test(String(competitor?.contact?.deliveryProof || ''))
      ? competitor.contact.deliveryProof
      : '';
    const previous = byEmail.get(email);
    byEmail.set(email, { email, deliveryProof: deliveryProof || previous?.deliveryProof || '' });
  });
  const all = [...byEmail.values()];
  return {
    all,
    verified: all.filter(item => item.deliveryProof),
    unverified: all.filter(item => !item.deliveryProof)
  };
}

export function resolveResultsEndpoint(documentRef = globalThis.document) {
  return String(documentRef?.querySelector('meta[name="strongman-results-endpoint"]')?.content || '').trim();
}

export async function sendResultsSummary({ endpoint, event, recipients, html, filename, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!endpoint || typeof fetchImpl !== 'function') throw new Error('resultsSendUnavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, recipients, html, filename }),
      signal: controller.signal
    });
    if (!response?.ok) {
      const details = await response?.json?.().catch(() => null);
      throw new Error(details?.error || 'resultsSendFailed');
    }
    return await response.json();
  } catch (error) {
    if (['results-delivery-not-configured', 'invalid-recipients'].includes(error?.message)) throw error;
    throw new Error('resultsSendFailed');
  } finally {
    clearTimeout(timeout);
  }
}

export function buildResultsMailto({ emails, eventName, filename }) {
  const recipients = [...new Set((emails || []).map(value => String(value || '').trim().toLowerCase()).filter(Boolean))];
  const subject = `WYNIKI ZAWODÓW — ${eventName || 'Zawody Strong Man'}`;
  const body = `Wyniki zawodów ${eventName || 'Strong Man'}\n\nPełna klasyfikacja końcowa została przygotowana w pliku ${filename || 'HTML'}. Dołącz pobrany plik do tej wiadomości przed wysłaniem.`;
  return `mailto:?bcc=${encodeURIComponent(recipients.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
