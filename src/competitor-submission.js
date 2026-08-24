import {
  normalizeCompetitorRecord,
  normalizeCompetitorContact
} from './competitor-data.js';
import { estimateDataUrlBytes } from './image-tools.js';
import {
  INTERNATIONAL_LEVEL_CODES,
  isCompleteCareerBest,
  NATIONAL_LEVEL_CODES,
  normalizeCareer,
  normalizeCountryCode,
  normalizeStrengthRecords,
  TITLE_CODES
} from './competitor-profile-data.js';

export function normalizeSubmissionFile(json) {
  const schemaVersion = Number(json?.schemaVersion);
  if (!json || ![1, 2, 3].includes(schemaVersion) || json.type !== 'competitor-submission' || !json.competitor || typeof json.competitor !== 'object' || Array.isArray(json.competitor)) {
    return { ok: false, error: 'To nie jest prawidłowy plik zgłoszenia zawodnika.' };
  }
  const source = json.competitor;
  const name = normalizeSubmissionText(source.name);
  const birthDate = String(source.birthDate || '').trim();
  const residence = normalizeSubmissionText(source.residence);
  const height = normalizePositiveNumber(source.height);
  const weight = normalizePositiveNumber(source.weight);
  const photo = String(source.photo || '').trim();
  if (!name || name.length > 120) return { ok: false, error: 'Zgłoszenie nie zawiera prawidłowego imienia i nazwiska.' };
  if (!isValidIsoDate(birthDate)) return { ok: false, error: 'Zgłoszenie zawiera nieprawidłową datę urodzenia.' };
  if (!residence || residence.length > 100) return { ok: false, error: 'Zgłoszenie nie zawiera prawidłowej miejscowości.' };
  if (!height || !weight || Number(height) > 300 || Number(weight) > 500) return { ok: false, error: 'Wzrost i waga muszą być prawidłowymi dodatnimi wartościami.' };
  if (!photo.startsWith('data:image/jpeg;base64,') || estimateDataUrlBytes(photo) > 20 * 1024) {
    return { ok: false, error: 'Zdjęcie w zgłoszeniu ma nieprawidłowy format albo jest zbyt duże.' };
  }

  const countryCode = schemaVersion >= 2 ? normalizeCountryCode(source.countryCode) : '';
  if (schemaVersion >= 2 && !countryCode) return { ok: false, error: 'Zgłoszenie zawiera nieprawidłowy kod reprezentowanego kraju.' };
  const structured = validateSubmissionProfileData(source, schemaVersion);
  if (!structured.ok) return structured;
  const declarations = schemaVersion >= 2 ? normalizeSubmissionDeclarations(json.declarations, schemaVersion) : null;
  if (schemaVersion >= 2 && !declarations) {
    return { ok: false, error: 'Zgłoszenie nie zawiera kompletnych wymaganych oświadczeń.' };
  }
  const contact = schemaVersion === 3 ? normalizeSubmissionContact(json.contact) : normalizeCompetitorContact({});
  if (schemaVersion === 3 && (!contact.phone || !contact.email)) {
    return { ok: false, error: 'Zgłoszenie nie zawiera prawidłowych danych kontaktowych.' };
  }
  const competitor = normalizeCompetitorRecord({
    ...source,
    id: source.id ? String(source.id).slice(0, 200) : 'submission-preview',
    name,
    birthDate,
    residence,
    height,
    weight,
    notes: normalizeSubmissionText(source.notes).slice(0, 2000),
    countryCode,
    strengthRecords: structured.strengthRecords,
    career: structured.career,
    contact,
    category: '',
    categories: [],
    photo
  });
  competitor.id = source.id ? String(source.id).slice(0, 200) : '';
  if (schemaVersion < 3) delete competitor.contact;
  return { ok: true, competitor, schemaVersion, declarations };
}

function validateSubmissionProfileData(source, schemaVersion) {
  if (schemaVersion === 1) {
    return { ok: true, strengthRecords: normalizeStrengthRecords({}), career: normalizeCareer({}) };
  }
  if (source.strengthRecords !== undefined && (!source.strengthRecords || typeof source.strengthRecords !== 'object' || Array.isArray(source.strengthRecords))) {
    return { ok: false, error: 'Rekordy siłowe mają nieprawidłowy format.' };
  }
  const strengthRecords = normalizeStrengthRecords(source.strengthRecords);
  for (const key of ['squatKg', 'benchPressKg', 'deadliftKg']) {
    const raw = source.strengthRecords?.[key];
    if (raw !== null && raw !== undefined && String(raw).trim() !== '' && strengthRecords[key] === null) {
      return { ok: false, error: 'Rekordy siłowe zawierają nieprawidłową wartość.' };
    }
  }
  if (source.career !== undefined && (!source.career || typeof source.career !== 'object' || Array.isArray(source.career))) {
    return { ok: false, error: 'Dane kariery mają nieprawidłowy format.' };
  }
  const career = normalizeCareer(source.career);
  const rawTitleCodes = source.career?.titleCodes;
  if (rawTitleCodes !== undefined && (!Array.isArray(rawTitleCodes) || rawTitleCodes.some(code => !TITLE_CODES.includes(String(code))))) {
    return { ok: false, error: 'Lista tytułów zawiera nieznany kod.' };
  }
  if (!validCareerResults(source.career, 'nationalResults', 'nationalBest', career.nationalResults, NATIONAL_LEVEL_CODES) ||
      !validCareerResults(source.career, 'internationalResults', 'internationalBest', career.internationalResults, INTERNATIONAL_LEVEL_CODES)) {
    return { ok: false, error: 'Wynik kariery wymaga prawidłowego rodzaju zawodów, miejsca i roku.' };
  }
  return { ok: true, strengthRecords, career };
}

function validCareerResults(source, arrayField, legacyField, normalized, allowedLevels) {
  if (source?.[arrayField] !== undefined && !Array.isArray(source[arrayField])) return false;
  const rawValues = Array.isArray(source?.[arrayField])
    ? source[arrayField]
    : source?.[legacyField]
      ? [source[legacyField]]
      : [];
  if (rawValues.some(value => value !== null && value !== undefined &&
      (!value || typeof value !== 'object' || Array.isArray(value)))) return false;
  const raw = rawValues.filter(value => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value).some(item => String(item ?? '').trim() !== ''));
  if (raw.length > 20 || normalized.length !== raw.length) return false;
  return raw.every((value, index) => validCareerBest(value, normalized[index], allowedLevels));
}

function validCareerBest(raw, normalized, allowedLevels) {
  if (raw === null || raw === undefined) return normalized === null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  if (!Object.values(raw).some(value => String(value ?? '').trim() !== '')) return normalized === null;
  if (!normalized) return false;
  if (!isCompleteCareerBest(normalized)) return false;
  if (!allowedLevels.includes(normalized.level)) return false;
  return !normalized.eventName || normalized.eventName.length <= 120;
}

function normalizeSubmissionDeclarations(value, schemaVersion) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const locale = value.locale === 'en' ? 'en' : value.locale === 'pl' ? 'pl' : '';
  const version = String(value.version || '').trim();
  const acceptedAt = String(value.acceptedAt || '').trim();
  if (!locale || !version || version.length > 40 || Number.isNaN(Date.parse(acceptedAt))) return null;
  if (value.dataAndPhotoConfirmed !== true || value.riskAccepted !== true) return null;
  if (typeof value.mediaPermissionAccepted !== 'boolean') return null;
  if (schemaVersion === 3 && value.contactDataNoticeAcknowledged !== true) return null;
  const declarations = {
    version,
    locale,
    dataAndPhotoConfirmed: true,
    riskAccepted: true,
    mediaPermissionAccepted: value.mediaPermissionAccepted,
    ...(schemaVersion === 3 ? { contactDataNoticeAcknowledged: true } : {}),
    acceptedAt: new Date(acceptedAt).toISOString()
  };
  if (value.privacyNoticeAcknowledged === true) declarations.privacyNoticeAcknowledged = true;
  return declarations;
}

function normalizeSubmissionContact(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return normalizeCompetitorContact({});
  if (Object.keys(value).some(key => !['phone', 'email'].includes(key))) return normalizeCompetitorContact({});
  return normalizeCompetitorContact(value);
}

function normalizeSubmissionText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pl-PL');
}

function normalizePositiveNumber(value) {
  const normalized = String(value || '').trim().replace(',', '.');
  const parsed = /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : '';
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
