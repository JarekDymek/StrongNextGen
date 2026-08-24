import {
  normalizeCareer,
  normalizeCountryCode,
  normalizeStrengthRecords
} from './competitor-profile-data.js';

export const SYSTEM_COMPETITOR_CATEGORIES = Object.freeze([
  'Puchar Polski',
  'Legenda',
  'Tyberian Team',
  'Inny'
]);

const KNOWN_CATEGORY_LABELS = new Map([
  ['puchar polski', 'Puchar Polski'],
  ['legenda', 'Legenda'],
  ['tyberian team', 'Tyberian Team'],
  ['inny', 'Inny'],
  ['aktywny zawodnik', 'Inny']
]);

const NON_CATEGORY_KEYS = new Set(['bez kategorii', 'uncategorized', 'all']);

export function normalizeCompetitorKey(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('pl')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function normalizeCategoryKey(value) {
  return normalizeCompetitorKey(value);
}

function categoryValues(value) {
  if (Array.isArray(value)) return value.flatMap(categoryValues);
  if (value === null || value === undefined) return [];
  if (typeof value !== 'string') return [String(value)];

  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.flatMap(categoryValues);
    } catch {
      // Older exports occasionally contain a malformed array string.
    }
  }
  return trimmed.split(/[;,|]/g);
}

export function getCompetitorCategories(source) {
  const byKey = new Map();
  [...categoryValues(source?.category), ...categoryValues(source?.categories)].forEach(value => {
    const trimmed = String(value || '').trim().replace(/\s+/g, ' ');
    const key = normalizeCategoryKey(trimmed);
    if (!key || NON_CATEGORY_KEYS.has(key)) return;
    const label = KNOWN_CATEGORY_LABELS.get(key) || trimmed;
    const canonicalKey = normalizeCategoryKey(label);
    if (byKey.has(canonicalKey)) return;
    byKey.set(canonicalKey, label);
  });
  return [...byKey.values()];
}

export function competitorMatchesCategory(competitor, requestedCategory) {
  const requested = normalizeCategoryKey(requestedCategory);
  const categories = getCompetitorCategories(competitor).map(normalizeCategoryKey);
  if (!requested || requested === 'all') return true;
  if (requested === 'uncategorized') return categories.length === 0;
  return categories.includes(requested);
}

export function normalizeCompetitorContact(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rawPhone = String(source.phone || '').trim();
  const compactPhone = rawPhone.replace(/[\s().-]+/g, '').replace(/^00/, '+');
  const phone = /^\+?\d{7,15}$/.test(compactPhone) ? compactPhone : '';
  const rawEmail = String(source.email || '').trim().toLocaleLowerCase('en-US');
  const email = rawEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawEmail) ? rawEmail : '';
  return { phone, email };
}

export function normalizeCompetitorRecord(item, index = 0) {
  const source = typeof item === 'string' ? { name: item } : item || {};
  const name = String(source.name || '').trim().replace(/\s+/g, ' ');
  if (!name) return null;
  const categories = getCompetitorCategories(source);
  const warnings = parseListValue(source.dataWarnings);

  return {
    id: String(source.id || `competitor-${slug(name)}-${index}`),
    name,
    category: categories[0] || '',
    categories,
    birthDate: stringValue(source.birthDate || source.dateOfBirth || source.birth_date || source.dataUrodzenia),
    residence: stringValue(source.residence || source.city || source.miejsceZamieszkania),
    height: stringValue(source.height || source.wzrost),
    weight: stringValue(source.weight || source.waga),
    notes: stringValue(source.notes || source.description || source.opis || source.achievements || source.osiagniecia),
    countryCode: normalizeCountryCode(source.countryCode),
    strengthRecords: normalizeStrengthRecords(source.strengthRecords),
    career: normalizeCareer(source.career),
    contact: normalizeCompetitorContact(source.contact),
    photo: validPhoto(source.photo || source.image || source.avatar || source.icon),
    dataWarnings: uniqueStrings(warnings)
  };
}

export function normalizeCompetitorRecords(items) {
  const records = [];
  const aliases = new Map();
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const normalized = normalizeCompetitorRecord(item, index);
    if (!normalized) return;
    const result = upsertCompetitorRecord(records, normalized, { mode: 'preferIncoming' });
    records.splice(0, records.length, ...result.records);
    result.aliases.forEach((value, key) => aliases.set(key, value));
  });
  return { records, aliases };
}

export function mergeCompetitorDetails(existing, incoming, options = {}) {
  const settings = typeof options === 'string' ? { mode: options } : options;
  const mode = settings.mode || 'fillMissing';
  const categoriesMode = settings.categoriesMode || 'merge';
  const current = normalizeCompetitorRecord(existing);
  const candidate = normalizeCompetitorRecord(incoming);
  if (!current) return candidate;
  if (!candidate) return current;

  const merged = { ...current, id: current.id };
  const scalarFields = ['name', 'birthDate', 'residence', 'height', 'weight', 'notes', 'photo'];
  scalarFields.forEach(field => {
    const currentValue = String(current[field] || '').trim();
    const incomingValue = String(candidate[field] || '').trim();
    if (!incomingValue) return;
    if (mode === 'preferIncoming' || !currentValue) merged[field] = candidate[field];
  });
  if (candidate.countryCode && (mode === 'preferIncoming' || !current.countryCode)) {
    merged.countryCode = candidate.countryCode;
  }
  merged.strengthRecords = mergeStrengthRecords(current.strengthRecords, candidate.strengthRecords, {
    preferIncoming: mode === 'preferIncoming' && hasOwn(incoming, 'strengthRecords')
  });
  merged.career = mergeCareer(current.career, candidate.career, {
    preferIncoming: mode === 'preferIncoming' && hasOwn(incoming, 'career')
  });
  merged.contact = mergeContact(current.contact, candidate.contact, {
    preferIncoming: mode === 'preferIncoming' && hasOwn(incoming, 'contact')
  });
  const currentCategories = getCompetitorCategories(current);
  const candidateCategories = getCompetitorCategories(candidate);
  merged.categories = categoriesMode === 'replace'
    ? uniqueCategories(candidateCategories)
    : categoriesMode === 'fillMissing'
      ? uniqueCategories(currentCategories.length ? currentCategories : candidateCategories)
      : uniqueCategories([...currentCategories, ...candidateCategories]);
  merged.category = merged.categories[0] || '';
  merged.dataWarnings = uniqueStrings([...(current.dataWarnings || []), ...(candidate.dataWarnings || [])]);
  return merged;
}

function mergeContact(current, incoming, { preferIncoming = false } = {}) {
  const previous = normalizeCompetitorContact(current);
  const candidate = normalizeCompetitorContact(incoming);
  if (preferIncoming) return candidate;
  return {
    phone: previous.phone || candidate.phone,
    email: previous.email || candidate.email
  };
}

function mergeStrengthRecords(current, incoming, { preferIncoming = false } = {}) {
  const previous = normalizeStrengthRecords(current);
  const candidate = normalizeStrengthRecords(incoming);
  return Object.fromEntries(Object.keys(previous).map(key => [
    key,
    preferIncoming && candidate[key] !== null
      ? candidate[key]
      : previous[key] !== null
        ? previous[key]
        : candidate[key]
  ]));
}

function mergeCareer(current, incoming, { preferIncoming = false } = {}) {
  const previous = normalizeCareer(current);
  const candidate = normalizeCareer(incoming);
  const chooseResults = (oldValues, newValues) => {
    if (preferIncoming && newValues.length) return newValues;
    return oldValues.length ? oldValues : newValues;
  };
  return {
    nationalResults: chooseResults(previous.nationalResults, candidate.nationalResults),
    internationalResults: chooseResults(previous.internationalResults, candidate.internationalResults),
    titleCodes: preferIncoming && candidate.titleCodes.length
      ? candidate.titleCodes
      : previous.titleCodes.length
        ? previous.titleCodes
        : candidate.titleCodes
  };
}

function hasOwn(value, key) {
  return Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key));
}

export function upsertCompetitorRecord(collection, incoming, { mode = 'fillMissing', categoriesMode = 'merge', matchByName = true } = {}) {
  const records = [...(collection || [])];
  const candidate = normalizeCompetitorRecord(incoming, records.length);
  const aliases = new Map();
  if (!candidate) return { records, competitor: null, added: false, updated: false, aliases };

  let index = records.findIndex(item => String(item.id) === candidate.id);
  if (index < 0 && matchByName) {
    const nameKey = normalizeCompetitorKey(candidate.name);
    index = records.findIndex(item => normalizeCompetitorKey(item.name) === nameKey);
    if (index >= 0 && records[index].id !== candidate.id) aliases.set(candidate.id, records[index].id);
  }

  if (index < 0) {
    records.push(candidate);
    return { records, competitor: candidate, added: true, updated: false, aliases };
  }

  const previous = records[index];
  const merged = mergeCompetitorDetails(previous, candidate, { mode, categoriesMode });
  if (!hasOwn(incoming, 'contact')) merged.contact = normalizeCompetitorContact(previous.contact);
  records[index] = merged;
  return {
    records,
    competitor: merged,
    added: false,
    updated: JSON.stringify(previous) !== JSON.stringify(merged),
    aliases
  };
}

export function mergeCompetitorCollections(seed, incoming, { mode = 'fillMissing', categoriesMode = 'merge' } = {}) {
  const normalizedSeed = normalizeCompetitorRecords(seed).records;
  let records = normalizedSeed;
  const aliases = new Map();
  (Array.isArray(incoming) ? incoming : []).forEach((item, index) => {
    const candidate = normalizeCompetitorRecord(item, records.length + index);
    if (!candidate) return;
    const result = upsertCompetitorRecord(records, candidate, { mode, categoriesMode });
    records = result.records;
    result.aliases.forEach((value, key) => aliases.set(key, value));
  });
  return { records, aliases };
}

export function remapCompetitionStateCompetitorIds(source, aliases) {
  if (!source || !aliases?.size) return source;
  const next = structuredClone(source);
  const resolve = id => {
    let current = String(id || '');
    const seen = new Set();
    while (aliases.has(current) && !seen.has(current)) {
      seen.add(current);
      current = aliases.get(current);
    }
    return current;
  };
  const mapIds = ids => [...new Set((Array.isArray(ids) ? ids : []).map(resolve).filter(Boolean))];

  next.selectedCompetitorIds = mapIds(next.selectedCompetitorIds);
  next.startOrderIds = mapIds(next.startOrderIds);
  next.eventHistory = (Array.isArray(next.eventHistory) ? next.eventHistory : []).map(event => ({
    ...event,
    orderIds: mapIds(event.orderIds),
    results: (Array.isArray(event.results) ? event.results : []).map(result => ({ ...result, id: resolve(result.id) }))
  }));
  next.drafts = remapNestedRecord(next.drafts, resolve);
  next.scores = remapFlatRecord(next.scores, resolve);
  return next;
}

function remapNestedRecord(value, resolve) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).map(([outerKey, inner]) => [outerKey, remapFlatRecord(inner, resolve)]));
}

function remapFlatRecord(value, resolve) {
  if (!value || typeof value !== 'object') return {};
  const result = {};
  Object.entries(value).forEach(([id, item]) => {
    const targetId = resolve(id);
    if (!(targetId in result) || String(result[targetId] || '').trim() === '') result[targetId] = item;
  });
  return result;
}

function uniqueCategories(values) {
  const byKey = new Map();
  values.forEach(value => {
    const key = normalizeCategoryKey(value);
    if (key && !byKey.has(key)) byKey.set(key, KNOWN_CATEGORY_LABELS.get(key) || String(value).trim());
  });
  return [...byKey.values()];
}

function parseListValue(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Keep a non-empty legacy warning string when it is not valid JSON.
    }
  }
  return [value];
}

function uniqueStrings(values) {
  const byKey = new Map();
  values.forEach(value => {
    const text = String(value || '').trim();
    const key = normalizeCompetitorKey(text);
    if (key && !byKey.has(key)) byKey.set(key, text);
  });
  return [...byKey.values()];
}

function stringValue(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function validPhoto(value) {
  const photo = stringValue(value);
  if (/^data:image\/(?:jpe?g|png|webp|gif);base64,/i.test(photo)) return photo.length <= 700_000 ? photo : '';
  return /^https?:\/\//i.test(photo) && photo.length <= 2048 ? photo : '';
}

function slug(value) {
  return normalizeCompetitorKey(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
}
