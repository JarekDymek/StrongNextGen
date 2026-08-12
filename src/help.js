export const EMERGENCY_HELP_TOPICS = Object.freeze([
  {
    id: 'correct-previous-result',
    symbol: '←',
    title: 'Błędny wynik poprzedniej konkurencji',
    summary: 'Cofnij jedno podsumowanie, popraw wynik i wróć do przerwanej konkurencji.',
    keywords: 'wynik pomyłka poprzednia korekta cofnij zawodnik'
  },
  {
    id: 'reorder-events',
    symbol: '↕',
    title: 'Zmiana kolejności konkurencji',
    summary: 'Zablokuj rozegrane etapy i ustaw bezpiecznie tylko przyszłe konkurencje.',
    keywords: 'kolejność konkurencje pogoda finał przełożyć zmienić'
  },
  {
    id: 'undo-summary',
    symbol: '↶',
    title: 'Przypadkowe podsumowanie',
    summary: 'Cofnij ostatnie podsumowanie bez usuwania wpisów z formularza.',
    keywords: 'podsumowanie przypadkowe cofnij wyniki'
  },
  {
    id: 'results-problem',
    symbol: '!',
    title: 'Brakuje wyników lub dane się nie zgadzają',
    summary: 'Sprawdź szkice, zapis automatyczny i ostatni bezpieczny punkt kontrolny.',
    keywords: 'brak wyników zniknęły nie zgadzają dane szkic zapis'
  },
  {
    id: 'add-competitor',
    symbol: '+',
    title: 'Dodanie zawodnika w trakcie zawodów',
    summary: 'Wróć bezpiecznie do bazy i dodaj zawodnika bez resetowania zawodów.',
    keywords: 'dodać nowy zawodnik baza lista startowa'
  },
  {
    id: 'refresh-recovery',
    symbol: '⟳',
    title: 'Odświeżenie lub odzyskanie pracy',
    summary: 'Odzyskaj autosave albo wybierz właściwy punkt kontrolny.',
    keywords: 'odświeżenie przeładowanie odzyskaj checkpoint punkt kontrolny'
  },
  {
    id: 'switch-device',
    symbol: '⇄',
    title: 'Przeniesienie zawodów na inne urządzenie',
    summary: 'Wyeksportuj pełny stan i bezpiecznie zaimportuj go na drugim urządzeniu.',
    keywords: 'telefon ipad komputer urządzenie eksport import przenieść'
  },
  {
    id: 'offline-stopwatch',
    symbol: '◷',
    title: 'Offline lub problem ze stoperem',
    summary: 'Sprawdź tryb instalacji, łączność i awaryjne wpisanie wyniku ręcznie.',
    keywords: 'offline internet stoper czas nie działa'
  }
]);

export function getEmergencyHelpTopics(context = {}, query = '') {
  const normalizedQuery = normalizeSearch(query);
  return EMERGENCY_HELP_TOPICS
    .map(topic => ({ ...topic, ...topicAvailability(topic.id, context) }))
    .filter(topic => !normalizedQuery || normalizeSearch(`${topic.title} ${topic.summary} ${topic.keywords}`).includes(normalizedQuery))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

export function topicAvailability(topicId, context = {}) {
  const historyCount = nonNegativeInteger(context.historyCount);
  const currentEventIndex = nonNegativeInteger(context.currentEventIndex);
  const selectedEventCount = nonNegativeInteger(context.selectedEventCount);
  const currentFinalized = Boolean(context.currentFinalized);
  const currentDraftCount = nonNegativeInteger(context.currentDraftCount);
  const inCompetition = selectedEventCount > 0 && ['scoring', 'summary'].includes(context.stage);

  if (topicId === 'correct-previous-result') {
    const available = context.stage === 'scoring' && currentEventIndex > 0 && historyCount === currentEventIndex && !currentFinalized;
    return {
      available,
      recommended: available && currentDraftCount > 0,
      reason: available
        ? currentDraftCount > 0 ? 'Bieżąca konkurencja ma już zapisane wyniki.' : 'Można bezpiecznie cofnąć poprzednie podsumowanie.'
        : currentFinalized
          ? 'Najpierw użyj pomocy „Przypadkowe podsumowanie”, aby cofnąć bieżącą konkurencję.'
          : currentEventIndex === 0
            ? 'Nie ma wcześniejszej konkurencji do poprawienia.'
            : 'Otwórz ekran wyników rozpoczętej konkurencji.'
    };
  }

  if (topicId === 'reorder-events') {
    const available = selectedEventCount > 1 && historyCount > 0;
    return {
      available,
      recommended: available && !currentFinalized,
      reason: available
        ? currentDraftCount > 0 ? 'Rozpoczęta konkurencja zostanie zablokowana razem z zakończonymi.' : 'Zakończone konkurencje zostaną zablokowane.'
        : 'Zmiana planu jest dostępna po zakończeniu co najmniej jednej konkurencji.'
    };
  }

  if (topicId === 'undo-summary') {
    return {
      available: historyCount > 0,
      recommended: currentFinalized,
      reason: historyCount > 0 ? 'Wpisy pozostaną w formularzu po cofnięciu.' : 'Nie ma podsumowania, które można cofnąć.'
    };
  }

  if (topicId === 'results-problem') {
    return {
      available: true,
      recommended: inCompetition && (currentDraftCount > 0 || historyCount > 0),
      reason: context.hasCheckpoints ? 'Dostępny jest co najmniej jeden punkt kontrolny.' : 'Najpierw utworzymy punkt bezpieczeństwa.'
    };
  }

  if (topicId === 'add-competitor') {
    return {
      available: true,
      recommended: false,
      reason: inCompetition ? 'Zmiana listy może wpłynąć na dalszą kolejność i punktację.' : 'Możesz przejść bezpośrednio do bazy zawodników.'
    };
  }

  if (topicId === 'refresh-recovery') {
    return {
      available: true,
      recommended: false,
      reason: context.hasCheckpoints ? 'Możesz wybrać zapisany punkt kontrolny.' : 'Aplikacja spróbuje użyć bieżącego autosave.'
    };
  }

  if (topicId === 'switch-device') {
    return {
      available: true,
      recommended: false,
      reason: 'Pełny eksport obejmuje wyniki, szkice, kolejność i bazę zawodników.'
    };
  }

  return {
    available: true,
    recommended: context.online === false,
    reason: context.online === false ? 'Urządzenie jest obecnie offline.' : 'Funkcje zawodów działają offline po instalacji PWA.'
  };
}

function normalizeSearch(value) {
  return String(value || '')
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nonNegativeInteger(value) {
  return Math.max(0, Number.parseInt(value, 10) || 0);
}
