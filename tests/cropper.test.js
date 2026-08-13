import assert from 'node:assert/strict';
import { calculateCropGeometry } from '../formularz/cropper.js';

for (const [width, height] of [[900, 1200], [1200, 900], [800, 800], [2400, 300], [300, 2400]]) {
  for (const zoom of [1, 2, 4]) {
    const geometry = calculateCropGeometry(width, height, 360, zoom, 99999, -99999);
    assert.ok(geometry.displayedWidth >= 360);
    assert.ok(geometry.displayedHeight >= 360);
    assert.ok(geometry.sourceRect.x >= 0);
    assert.ok(geometry.sourceRect.y >= 0);
    assert.ok(geometry.sourceRect.x + geometry.sourceRect.width <= width + 0.0001);
    assert.ok(geometry.sourceRect.y + geometry.sourceRect.height <= height + 0.0001);
    assert.ok(Math.abs(geometry.sourceRect.width - geometry.sourceRect.height) < 0.0001);
  }
}

const portrait = calculateCropGeometry(900, 1200, 360, 1, 0, 0);
assert.equal(portrait.maximumOffsetX, 0);
assert.ok(portrait.maximumOffsetY > 0);
const landscape = calculateCropGeometry(1200, 900, 360, 1, 0, 0);
assert.ok(landscape.maximumOffsetX > 0);
assert.equal(landscape.maximumOffsetY, 0);

console.log('Cropper geometry tests passed');
