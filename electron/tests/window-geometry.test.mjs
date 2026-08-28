import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { canonicalBounds, scaledSize } = require('../src/main/window-geometry.cjs');

test('every size preset scales pet, speech bubble, and gift proportionally', () => {
  const presets = [
    { scale: 0.375, pet: [72, 78], speech: [95, 34], gift: [35, 35] },
    { scale: 0.5625, pet: [108, 117], speech: [143, 51], gift: [53, 53] },
    { scale: 0.75, pet: [144, 156], speech: [190, 68], gift: [70, 70] },
    { scale: 0.9375, pet: [180, 195], speech: [238, 85], gift: [88, 88] },
    { scale: 1.125, pet: [216, 234], speech: [285, 102], gift: [105, 105] }
  ];
  for (const preset of presets) {
    const factor = preset.scale / 0.75;
    assert.deepEqual(Object.values(scaledSize(192, 208, preset.scale)), preset.pet);
    assert.deepEqual(Object.values(scaledSize(190, 68, factor)), preset.speech);
    assert.deepEqual(Object.values(scaledSize(70, 70, factor)), preset.gift);
  }
});

test('Windows DPI rounding cannot accumulate into pet or companion window growth', () => {
  const area = { x: 0, y: 0, width: 1536, height: 832 };
  for (const selectedSize of [
    { width: 144, height: 156 },
    { width: 190, height: 68 },
    { width: 70, height: 70 }
  ]) {
    let systemBounds = {
      x: 1200,
      y: 650,
      width: selectedSize.width + 1,
      height: selectedSize.height + 1
    };
    for (let action = 0; action < 100; action += 1) {
      const requested = canonicalBounds(
        { ...systemBounds, x: systemBounds.x - 2 },
        area,
        selectedSize
      );
      assert.equal(requested.width, selectedSize.width);
      assert.equal(requested.height, selectedSize.height);
      systemBounds = { ...requested, width: requested.width + 1, height: requested.height + 1 };
    }
  }
});
