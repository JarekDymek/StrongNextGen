import {
  INTERNATIONAL_LEVEL_CODES,
  isCompleteCareerBest,
  NATIONAL_LEVEL_CODES,
  normalizeCareer,
  normalizeCountryCode,
  normalizeOptionalNumber,
  normalizeStrengthRecords,
  normalizeUpperText as normalizeProfileText
} from '../src/competitor-profile-data.js';

export const LEGAL_TEXT_VERSION = '2026-08-v3';

export function normalizeUpperText(value) {
  return normalizeProfileText(value);
}

export function normalizePositiveNumber(value) {
  const normalized = String(value || '').trim().replace(',', '.');
  const parsed = /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : '';
}

export function createSubmission(values, photo, now = new Date()) {
  const locale = values.formLocale === 'en' ? 'en' : 'pl';
  const name = normalizeUpperText(values.name);
  const birthDate = String(values.birthDate || '').trim();
  const residence = normalizeUpperText(values.residence);
  const countryCode = normalizeCountryCode(values.countryCode);
  const height = normalizePositiveNumber(values.height);
  const weight = normalizePositiveNumber(values.weight);
  const contact = createContact(values.contact || {});
  if (!name || !isValidIsoDate(birthDate) || !residence || !countryCode || !height || !weight) {
    throw new Error('invalidRequired');
  }
  if (!String(photo || '').startsWith('data:image/jpeg;base64,')) {
    throw new Error('invalidPhoto');
  }

  const strengthRecords = createStrengthRecords(values.strengthRecords || {});
  const career = createCareer(values.career || {});
  const declarations = createDeclarations(values.declarations || {}, locale, now);

  return {
    schemaVersion: 3,
    type: 'competitor-submission',
    createdAt: now.toISOString(),
    formLocale: locale,
    contact,
    competitor: {
      name,
      birthDate,
      residence,
      countryCode,
      height,
      weight,
      strengthRecords,
      career,
      photo
    },
    declarations
  };
}

export function createContact(values) {
  const phone = normalizePhone(values.phone);
  const email = normalizeEmail(values.email);
  if (!phone || !email) throw new Error('invalidContact');
  return { phone, email };
}

export function normalizePhone(value) {
  const source = String(value || '').trim();
  if (!source || source.length > 40 || !/^[+\d\s().-]+$/.test(source)) return '';
  let compact = source.replace(/[\s().-]+/g, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;
  if (!/^\+?\d+$/.test(compact)) return '';
  const digits = compact.replace(/^\+/, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return compact.startsWith('+') ? `+${digits}` : digits;
}

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLocaleLowerCase('en-US');
  if (!email || email.length > 254 || /\s/.test(email)) return '';
  return /^[^@]+@[^@]+\.[^@]{2,}$/.test(email) ? email : '';
}

export function createStrengthRecords(values) {
  const fields = ['squatKg', 'benchPressKg', 'deadliftKg'];
  fields.forEach(field => {
    const raw = values[field];
    if (raw === null || raw === undefined || String(raw).trim() === '') return;
    if (normalizeOptionalNumber(raw, 1, 1000) === null) throw new Error('invalidStrength');
  });
  return normalizeStrengthRecords(values);
}

export function createCareer(values) {
  const nationalResults = buildCareerResults(
    Array.isArray(values.nationalResults) ? values.nationalResults : values.nationalBest ? [values.nationalBest] : [],
    NATIONAL_LEVEL_CODES
  );
  const internationalResults = buildCareerResults(
    Array.isArray(values.internationalResults) ? values.internationalResults : values.internationalBest ? [values.internationalBest] : [],
    INTERNATIONAL_LEVEL_CODES
  );
  const candidate = normalizeCareer({
    nationalResults,
    internationalResults
  });
  if (![...candidate.nationalResults, ...candidate.internationalResults].every(isCompleteCareerBest) ||
      candidate.nationalResults.length !== nationalResults.length ||
      candidate.internationalResults.length !== internationalResults.length) {
    throw new Error('invalidCareer');
  }
  return {
    nationalResults: candidate.nationalResults,
    internationalResults: candidate.internationalResults
  };
}

export function createDeclarations(values, locale, now = new Date()) {
  const declarations = {
    version: LEGAL_TEXT_VERSION,
    locale: locale === 'en' ? 'en' : 'pl',
    dataAndPhotoConfirmed: Boolean(values.dataAndPhotoConfirmed),
    riskAccepted: Boolean(values.riskAccepted),
    mediaPermissionAccepted: Boolean(values.mediaPermissionAccepted),
    contactDataNoticeAcknowledged: Boolean(values.contactDataNoticeAcknowledged),
    acceptedAt: now.toISOString()
  };
  if (!declarations.dataAndPhotoConfirmed || !declarations.riskAccepted || !declarations.contactDataNoticeAcknowledged) {
    throw new Error('invalidDeclarations');
  }
  return declarations;
}

export function submissionFilename(name) {
  const safeName = normalizeUpperText(name)
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'ZAWODNIK';
  return `zawodnik_${safeName}.json`;
}

function buildCareerBest(value, allowedCodes) {
  if (!value || typeof value !== 'object') return null;
  const hasAnyValue = Object.values(value).some(item => String(item ?? '').trim() !== '');
  if (!hasAnyValue) return null;
  const level = allowedCodes.includes(String(value.level || '').trim().toUpperCase())
    ? String(value.level).trim().toUpperCase()
    : '';
  return {
    level,
    place: value.place,
    year: value.year,
    eventName: normalizeUpperText(value.eventName)
  };
}

function buildCareerResults(values, allowedCodes) {
  return values
    .map(value => buildCareerBest(value, allowedCodes))
    .filter(Boolean);
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
