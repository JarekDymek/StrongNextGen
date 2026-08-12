const STATE_KEY = 'strongman-next.state.v1';
const CHECKPOINTS_KEY = 'strongman-next.checkpoints.v1';
const COMPETITOR_DATABASE_KEY = 'strongman-next.competitor-database.v1';
const SEASON_DATABASE_KEY = 'strongman-next.season-database.v1';
const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
const storageWarnings = new Map();

function rememberStorageWarning(key, error) {
  if (storageWarnings.has(key)) return;
  storageWarnings.set(key, `Nie udało się odczytać ${key}. Aplikacja pominęła uszkodzony zapis.`);
  console.error(`[Strongman Next] Błąd odczytu ${key}:`, error);
}

export function consumeStorageWarnings() {
  const warnings = [...storageWarnings.values()];
  storageWarnings.clear();
  return warnings;
}

export function hasStorageWarning(key) {
  return storageWarnings.has(key);
}

export function createStorageSnapshot(state, { includeLogo = true } = {}) {
  const copy = structuredClone(state);
  delete copy.ui;
  if (Array.isArray(copy.competitors)) {
    copy.competitors = copy.competitors.map(competitor => ({ ...competitor, photo: '' }));
  }
  if (!includeLogo) delete copy.logoData;
  return copy;
}

export function loadSavedState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    rememberStorageWarning('zapisu zawodów', error);
    return null;
  }
}

export function saveState(state) {
  const copy = createStorageSnapshot(state);
  copy.savedAt = new Date().toISOString();
  localStorage.setItem(STATE_KEY, JSON.stringify(copy));
}

export function clearSavedState() {
  localStorage.removeItem(STATE_KEY);
}

export function loadCompetitorDatabase() {
  try {
    const raw = localStorage.getItem(COMPETITOR_DATABASE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.competitors) ? parsed.competitors : [];
  } catch (error) {
    rememberStorageWarning('bazy zawodników', error);
    return null;
  }
}

export function saveCompetitorDatabase(competitors) {
  localStorage.setItem(COMPETITOR_DATABASE_KEY, JSON.stringify(Array.isArray(competitors) ? competitors : []));
}

export function loadSeasonDatabase() {
  try {
    const raw = localStorage.getItem(SEASON_DATABASE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return Array.isArray(parsed?.events) ? parsed.events : [];
  } catch (error) {
    rememberStorageWarning('klasyfikacji sezonu', error);
    return null;
  }
}

export function saveSeasonDatabase(events) {
  localStorage.setItem(SEASON_DATABASE_KEY, JSON.stringify({
    schemaVersion: 1,
    season: 2026,
    savedAt: new Date().toISOString(),
    events: Array.isArray(events) ? events : []
  }));
}

export function loadCheckpoints() {
  try {
    const raw = localStorage.getItem(CHECKPOINTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    rememberStorageWarning('punktów kontrolnych', error);
    return [];
  }
}

export function saveCheckpoint(state, label = 'Punkt kontrolny') {
  const copy = createStorageSnapshot(state, { includeLogo: false });
  const checkpoints = loadCheckpoints();
  checkpoints.unshift({
    id: `checkpoint-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label,
    createdAt: new Date().toISOString(),
    snapshot: copy
  });
  localStorage.setItem(CHECKPOINTS_KEY, JSON.stringify(checkpoints.slice(0, 50)));
  return checkpoints[0];
}

export function deleteCheckpoints(ids) {
  const idSet = new Set(ids);
  const remaining = loadCheckpoints().filter(checkpoint => !idSet.has(checkpoint.id));
  localStorage.setItem(CHECKPOINTS_KEY, JSON.stringify(remaining));
  return remaining;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || file.size > MAX_IMPORT_BYTES) {
      reject(new Error('Plik jest pusty albo przekracza bezpieczny limit 15 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || file.size > MAX_IMPORT_BYTES) {
      reject(new Error('Plik jest pusty albo przekracza bezpieczny limit 15 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

export function pickJsonFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });
}

export function pickSeasonFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,text/html,.json,.html,.htm';
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });
}

export function pickImageFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });
}
