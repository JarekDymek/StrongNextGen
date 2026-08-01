const PROFILE_FIELDS = ['category', 'birthDate', 'residence', 'height', 'weight', 'notes', 'photo'];

export function normalizeCompetitorName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function firstValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function normalizeCategories(source) {
  const raw = source?.categories ?? source?.category ?? source?.division ?? [];
  const values = Array.isArray(raw) ? raw : [raw];
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function makeCompetitorId(name, index) {
  const slug = normalizeCompetitorName(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'zawodnik';
  return `competitor-${slug}-${Date.now()}-${index}`;
}

export function normalizeImportedCompetitor(item, index = 0) {
  const source = typeof item === 'string' ? { name: item } : item || {};
  const name = String(firstValue(source, ['name', 'fullName', 'athleteName'])).trim();
  if (!name) return null;

  const categories = normalizeCategories(source);
  return {
    id: String(source.id || makeCompetitorId(name, index)),
    name,
    category: String(firstValue(source, ['category', 'division']) || categories[0] || '').trim(),
    categories,
    birthDate: String(firstValue(source, ['birthDate', 'dateOfBirth', 'birthday', 'dob'])).trim(),
    residence: String(firstValue(source, ['residence', 'city', 'place', 'location'])).trim(),
    height: String(firstValue(source, ['height', 'heightCm'])).trim(),
    weight: String(firstValue(source, ['weight', 'weightKg'])).trim(),
    notes: String(firstValue(source, ['notes', 'achievements', 'description', 'bio'])).trim(),
    photo: String(firstValue(source, ['photo', 'icon', 'image', 'avatar'])).trim()
  };
}

function sameValue(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left || []) === JSON.stringify(right || []);
  }
  return String(left ?? '') === String(right ?? '');
}

function mergeOne(existing, incoming) {
  const merged = { ...existing, id: existing.id, name: incoming.name || existing.name };
  PROFILE_FIELDS.forEach(field => {
    if (String(incoming[field] ?? '').trim()) merged[field] = incoming[field];
  });
  if (incoming.categories?.length) merged.categories = [...incoming.categories];
  if (!merged.category && merged.categories?.length) merged.category = merged.categories[0];
  return merged;
}

export function mergeCompetitorRecords(existingItems = [], importedItems = []) {
  const existing = existingItems
    .map((item, index) => normalizeImportedCompetitor(item, index))
    .filter(Boolean);
  const imported = importedItems
    .map((item, index) => normalizeImportedCompetitor(item, index))
    .filter(Boolean);

  const byName = new Map(existing.map(item => [normalizeCompetitorName(item.name), item]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  imported.forEach(item => {
    const key = normalizeCompetitorName(item.name);
    const current = byName.get(key);
    if (!current) {
      byName.set(key, item);
      added += 1;
      return;
    }

    const merged = mergeOne(current, item);
    const changed = ['name', ...PROFILE_FIELDS, 'categories'].some(field => !sameValue(current[field], merged[field]));
    byName.set(key, merged);
    if (changed) updated += 1;
    else unchanged += 1;
  });

  const competitors = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' })
  );
  return { competitors, added, updated, unchanged };
}
