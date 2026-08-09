export function calculateContainSize(width, height, maxDimension = 120) {
  const sourceWidth = Math.max(1, Number(width) || 1);
  const sourceHeight = Math.max(1, Number(height) || 1);
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}

export function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  const padding = (base64.match(/=*$/)?.[0].length || 0);
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

export async function processCompetitorPhoto(file, options = {}) {
  if (!(file instanceof Blob) || !file.size) throw new Error('Wybierz prawidłowy plik graficzny.');
  if (file.type && !file.type.startsWith('image/')) throw new Error('Wybrany plik nie jest obrazem.');

  const maxDimension = options.maxDimension || 120;
  const targetBytes = options.targetBytes || 10 * 1024;
  const startQuality = options.startQuality || 0.82;
  const minQuality = options.minQuality || 0.5;
  const qualityStep = options.qualityStep || 0.06;
  let image;
  try {
    image = await decodeImage(file);
  } catch {
    throw new Error('Nie udało się odczytać zdjęcia. Wybierz plik JPEG, PNG, WEBP lub HEIC obsługiwany przez urządzenie.');
  }

  const size = calculateContainSize(image.width, image.height, maxDimension);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    image.close?.();
    throw new Error('Przeglądarka nie może przetworzyć tego zdjęcia.');
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(image, 0, 0, size.width, size.height);
  image.close?.();

  let quality = startQuality;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > targetBytes && quality - qualityStep >= minQuality) {
    quality = Number((quality - qualityStep).toFixed(2));
    blob = await canvasToBlob(canvas, quality);
  }
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, width: size.width, height: size.height, bytes: blob.size, quality };
}

async function decodeImage(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Safari variants differ in createImageBitmap option support; HTMLImageElement is the safe fallback.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    if (typeof image.decode === 'function') await image.decode();
    else await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Nie udało się zapisać zdjęcia.')), 'image/jpeg', quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Nie udało się odczytać przetworzonego zdjęcia.'));
    reader.readAsDataURL(blob);
  });
}
