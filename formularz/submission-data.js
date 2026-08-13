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

export const LEGAL_TEXT_VERSION = '2026-08-v2';

export const SYSTEM_CATEGORIES = Object.freeze([
  'Puchar Polski',
  'Legenda',
  'Tyberian Team',
  'Inny'
]);

const CATEGORY_ALIASES = new Map([
  ['puchar polski', 'Puchar Polski'],
  ['legenda', 'Legenda'],
  ['tyberian team', 'Tyberian Team'],
  ['inny', 'Inny'],
  ['aktywny zawodnik', 'Inny']
]);

export function normalizeUpperText(value) {
  return normalizeProfileText(value);
}

export function normalizePositiveNumber(value) {
  const normalized = String(value || '').trim().replace(',', '.');
  const parsed = /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : '';
}

export function normalizeSubmissionCategories(selected, customInput = '') {
  const categories = new Map();
  (Array.isArray(selected) ? selected : []).forEach(value => {
    const trimmed = String(value || '').trim().replace(/\s+/g, ' ');
    const key = categoryKey(trimmed);
    if (!key || key === 'bez kategorii') return;
    const systemLabel = CATEGORY_ALIASES.get(key);
    if (systemLabel && !categories.has(categoryKey(systemLabel))) {
      categories.set(categoryKey(systemLabel), systemLabel);
    }
  });
  String(customInput || '').split(',').forEach(value => {
    const trimmed = String(value || '').trim().replace(/\s+/g, ' ');
    const key = categoryKey(trimmed);
    if (!key || key === 'bez kategorii' || CATEGORY_ALIASES.has(key)) return;
    if (!categories.has(key)) categories.set(key, normalizeUpperText(trimmed));
  });
  return [...categories.values()];
}

export function createSubmission(values, photo, now = new Date()) {
  const locale = values.formLocale === 'en' ? 'en' : 'pl';
  const name = normalizeUpperText(values.name);
  const birthDate = String(values.birthDate || '').trim();
  const residence = normalizeUpperText(values.residence);
  const countryCode = normalizeCountryCode(values.countryCode);
  const height = normalizePositiveNumber(values.height);
  const weight = normalizePositiveNumber(values.weight);
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
    schemaVersion: 2,
    type: 'competitor-submission',
    createdAt: now.toISOString(),
    formLocale: locale,
    competitor: {
      name,
      birthDate,
      residence,
      countryCode,
      height,
      weight,
      categories: normalizeSubmissionCategories(values.categories, values.customCategories),
      strengthRecords,
      career,
      photo
    },
    declarations
  };
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
    acceptedAt: now.toISOString()
  };
  if (!declarations.dataAndPhotoConfirmed || !declarations.riskAccepted) {
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

function categoryKey(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
