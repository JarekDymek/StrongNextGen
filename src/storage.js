const STATE_KEY = 'strongman-next.state.v1';
const CHECKPOINTS_KEY = 'strongman-next.checkpoints.v1';

export function loadSavedState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  const copy = structuredClone(state);
  delete copy.ui;
  copy.savedAt = new Date().toISOString();
  localStorage.setItem(STATE_KEY, JSON.stringify(copy));
}

export function clearSavedState() {
  localStorage.removeItem(STATE_KEY);
}

export function loadCheckpoints() {
  try {
    const raw = localStorage.getItem(CHECKPOINTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCheckpoint(state, label = 'Punkt kontrolny') {
  const copy = structuredClone(state);
  delete copy.ui;
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

export function pickJsonFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
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
