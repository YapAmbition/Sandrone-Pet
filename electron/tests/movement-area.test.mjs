import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { MovementAreaTracker } = require('../src/main/movement-area.cjs');

function display(workArea) {
  return { id: 1, workArea };
}

test('macOS Stage Manager cannot repeatedly shrink the horizontal pet area', () => {
  const tracker = new MovementAreaTracker('darwin');
  const full = tracker.areaFor(display({ x: 0, y: 25, width: 1440, height: 875 }));
  const stageManagerVisible = tracker.areaFor(display({ x: 110, y: 25, width: 1330, height: 875 }));
  const hiddenAgain = tracker.areaFor(display({ x: 0, y: 25, width: 1440, height: 875 }));

  assert.deepEqual(full, { x: 0, y: 25, width: 1440, height: 875 });
  assert.deepEqual(stageManagerVisible, full);
  assert.deepEqual(hiddenAgain, full);
});

test('vertical work area changes are still respected on macOS', () => {
  const tracker = new MovementAreaTracker('darwin');
  tracker.areaFor(display({ x: 0, y: 25, width: 1440, height: 875 }));
  assert.deepEqual(
    tracker.areaFor(display({ x: 110, y: 25, width: 1330, height: 820 })),
    { x: 0, y: 25, width: 1440, height: 820 }
  );
});

test('Windows always follows the current work area', () => {
  const tracker = new MovementAreaTracker('win32');
  tracker.areaFor(display({ x: 0, y: 0, width: 1920, height: 1040 }));
  assert.deepEqual(
    tracker.areaFor(display({ x: 80, y: 0, width: 1840, height: 1040 })),
    { x: 80, y: 0, width: 1840, height: 1040 }
  );
});
