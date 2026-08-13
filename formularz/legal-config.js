export const LEGAL_TEXT_VERSION = '2026-08-v1';

// Uzupełnij te pola przed traktowaniem sekcji prywatności jako kompletnej informacji prawnej.
export const LEGAL_CONFIG = Object.freeze({
  controllerName: '',
  controllerAddress: '',
  controllerContact: '',
  dataProtectionOfficerContact: '',
  processingPurposes: '',
  legalBases: '',
  retentionPeriod: '',
  recipients: '',
  internationalTransfers: '',
  dataSubjectRights: ''
});

export function privacyNotice(locale = 'pl') {
  const configured = Object.values(LEGAL_CONFIG).some(Boolean);
  if (!configured) {
    return locale === 'en'
      ? 'The organiser must complete the controller identity, contact details, purposes and legal bases of processing, retention period, recipients, transfers and data-subject rights before this notice is treated as complete.'
      : 'Organizator musi uzupełnić dane administratora i kontakt, cele oraz podstawy przetwarzania, okres przechowywania, odbiorców, transfery i prawa osoby, której dane dotyczą, zanim ta informacja będzie kompletna.';
  }
  return Object.entries(LEGAL_CONFIG)
    .filter(([, value]) => value)
    .map(([, value]) => value)
    .join('\n');
}
