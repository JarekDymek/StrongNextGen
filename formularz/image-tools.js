export async function decodePhotoFile(file) {
  if (!(file instanceof Blob) || !file.size || (file.type && !file.type.startsWith('image/'))) {
    throw new Error('invalidPhoto');
  }
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      return await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Safari versions with partial ImageBitmap support use the image fallback.
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

export async function encodeCroppedPhoto(image, sourceRect, options = {}) {
  if (!image || !sourceRect) throw new Error('invalidPhoto');
  const size = options.size || 120;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('photoReadError');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    0,
    0,
    size,
    size
  );
  const blob = await compressJpeg(canvas, options.targetBytes || 10 * 1024);
  return {
    dataUrl: await blobToDataUrl(blob),
    width: size,
    height: size,
    bytes: blob.size
  };
}

// Retained for compatibility with older tests and direct form integrations.
export async function processPhoto(file, options = {}) {
  const image = await decodePhotoFile(file);
  try {
    const side = Math.min(image.width, image.height);
    return await encodeCroppedPhoto(image, {
      x: (image.width - side) / 2,
      y: (image.height - side) / 2,
      width: side,
      height: side
    }, options);
  } finally {
    image.close?.();
  }
}

async function compressJpeg(canvas, targetBytes) {
  let quality = 0.86;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > targetBytes && quality > 0.58) {
    quality = Number(Math.max(0.58, quality - 0.05).toFixed(2));
    blob = await canvasToBlob(canvas, quality);
  }
  return blob;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('photoReadError')), 'image/jpeg', quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('photoReadError'));
    reader.readAsDataURL(blob);
  });
}
