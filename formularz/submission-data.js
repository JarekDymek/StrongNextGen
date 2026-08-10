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
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pl-PL');
}

export function normalizePositiveNumber(value) {
  const parsed = Number.parseFloat(String(value || '').trim().replace(',', '.'));
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
  const name = normalizeUpperText(values.name);
  const birthDate = String(values.birthDate || '').trim();
  const residence = normalizeUpperText(values.residence);
  const height = normalizePositiveNumber(values.height);
  const weight = normalizePositiveNumber(values.weight);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !residence || !height || !weight) {
    throw new Error('Uzupełnij prawidłowo wszystkie wymagane dane.');
  }
  if (!String(photo || '').startsWith('data:image/jpeg;base64,')) {
    throw new Error('Dodaj prawidłowe zdjęcie zawodnika.');
  }
  return {
    schemaVersion: 1,
    type: 'competitor-submission',
    createdAt: now.toISOString(),
    competitor: {
      name,
      birthDate,
      residence,
      height,
      weight,
      notes: normalizeUpperText(values.notes),
      categories: normalizeSubmissionCategories(values.categories, values.customCategories),
      photo
    }
  };
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

function categoryKey(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}
