export async function processPhoto(file, options = {}) {
  if (!(file instanceof Blob) || !file.size || (file.type && !file.type.startsWith('image/'))) {
    throw new Error('Wybierz prawidłowy plik graficzny.');
  }
  const image = await decodeImage(file);
  const maxDimension = options.maxDimension || 120;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Przeglądarka nie może przetworzyć zdjęcia.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  image.close?.();

  let quality = 0.82;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > 10 * 1024 && quality > 0.5) {
    quality = Number(Math.max(0.5, quality - 0.06).toFixed(2));
    blob = await canvasToBlob(canvas, quality);
  }
  return {
    dataUrl: await blobToDataUrl(blob),
    width,
    height,
    bytes: blob.size
  };
}

async function decodeImage(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // HTMLImageElement remains available on Safari versions with partial bitmap support.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
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
    reader.onerror = () => reject(new Error('Nie udało się odczytać zdjęcia.'));
    reader.readAsDataURL(blob);
  });
}
