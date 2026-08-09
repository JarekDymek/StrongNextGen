import assert from 'node:assert/strict';
import { calculateContainSize, estimateDataUrlBytes } from '../src/image-tools.js';

assert.deepEqual(calculateContainSize(1152, 1536), { width: 90, height: 120 });
assert.deepEqual(calculateContainSize(1536, 1152), { width: 120, height: 90 });
assert.deepEqual(calculateContainSize(80, 60), { width: 80, height: 60 });
assert.equal(estimateDataUrlBytes('data:image/jpeg;base64,QUJDRA=='), 4);

console.log('Image tool tests passed');
