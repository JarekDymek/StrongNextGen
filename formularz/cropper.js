import { decodePhotoFile, encodeCroppedPhoto } from './image-tools.js';

export function calculateCropGeometry(imageWidth, imageHeight, viewportSize, zoom = 1, offsetX = 0, offsetY = 0) {
  const width = Math.max(1, Number(imageWidth) || 1);
  const height = Math.max(1, Number(imageHeight) || 1);
  const viewport = Math.max(1, Number(viewportSize) || 1);
  const zoomValue = clamp(Number(zoom) || 1, 1, 4);
  const coverScale = Math.max(viewport / width, viewport / height);
  const scale = coverScale * zoomValue;
  const displayedWidth = width * scale;
  const displayedHeight = height * scale;
  const maximumOffsetX = Math.max(0, (displayedWidth - viewport) / 2);
  const maximumOffsetY = Math.max(0, (displayedHeight - viewport) / 2);
  const clampedOffsetX = clamp(Number(offsetX) || 0, -maximumOffsetX, maximumOffsetX);
  const clampedOffsetY = clamp(Number(offsetY) || 0, -maximumOffsetY, maximumOffsetY);
  const sourceWidth = viewport / scale;
  const sourceHeight = viewport / scale;
  return {
    scale,
    displayedWidth,
    displayedHeight,
    offsetX: clampedOffsetX,
    offsetY: clampedOffsetY,
    maximumOffsetX,
    maximumOffsetY,
    sourceRect: {
      x: clamp(width / 2 - sourceWidth / 2 - clampedOffsetX / scale, 0, width - sourceWidth),
      y: clamp(height / 2 - sourceHeight / 2 - clampedOffsetY / scale, 0, height - sourceHeight),
      width: sourceWidth,
      height: sourceHeight
    }
  };
}

export function createPhotoCropper({ canvas, zoomInput, onChange = () => {} }) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('photoReadError');
  let image = null;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let drag = null;

  const viewportSize = () => canvas.width;

  function geometry() {
    return image ? calculateCropGeometry(image.width, image.height, viewportSize(), zoom, offsetX, offsetY) : null;
  }

  function render() {
    context.fillStyle = '#e7edf4';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!image) return;
    const next = geometry();
    offsetX = next.offsetX;
    offsetY = next.offsetY;
    const x = (canvas.width - next.displayedWidth) / 2 + offsetX;
    const y = (canvas.height - next.displayedHeight) / 2 + offsetY;
    context.drawImage(image, x, y, next.displayedWidth, next.displayedHeight);
  }

  async function load(file) {
    disposeImage();
    image = await decodePhotoFile(file);
    reset();
    onChange();
  }

  function reset() {
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    zoomInput.value = '1';
    render();
    onChange();
  }

  function clear() {
    disposeImage();
    image = null;
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    zoomInput.value = '1';
    render();
    onChange();
  }

  async function exportPhoto() {
    const next = geometry();
    if (!image || !next) throw new Error('invalidPhoto');
    return encodeCroppedPhoto(image, next.sourceRect, { size: 120, targetBytes: 10 * 1024 });
  }

  function disposeImage() {
    image?.close?.();
  }

  zoomInput.addEventListener('input', () => {
    zoom = clamp(Number(zoomInput.value) || 1, 1, 4);
    render();
    onChange();
  });

  canvas.addEventListener('pointerdown', event => {
    if (!image) return;
    canvas.setPointerCapture(event.pointerId);
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId || !image) return;
    const scaleX = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
    const scaleY = canvas.height / Math.max(1, canvas.getBoundingClientRect().height);
    offsetX += (event.clientX - drag.x) * scaleX;
    offsetY += (event.clientY - drag.y) * scaleY;
    drag.x = event.clientX;
    drag.y = event.clientY;
    render();
    onChange();
  });
  const finishDrag = event => {
    if (drag?.pointerId === event.pointerId) drag = null;
  };
  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);

  render();
  return {
    load,
    reset,
    clear,
    exportPhoto,
    hasImage: () => Boolean(image),
    getState: () => ({ zoom, offsetX, offsetY, geometry: geometry() }),
    destroy: () => disposeImage()
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
