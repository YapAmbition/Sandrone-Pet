import test from 'node:test';
import assert from 'node:assert/strict';
import { PetEngine } from '../src/renderer/engine.mjs';

function fixture() {
  let now = 0;
  const events = { frames: [], moves: [], records: [], speeches: [], states: [] };
  const engine = new PetEngine({
    render: (value) => events.frames.push(value),
    moveTo: (x, y) => events.moves.push({ x, y }),
    record: (value) => events.records.push(value),
    speech: (text) => events.speeches.push(text),
    publish: (state) => events.states.push(state)
  }, () => now);
  engine.initialize({
    settings: { scale: 0.75, activityLevel: 'default', cursorHuntEnabled: true, paused: false },
    bounds: { x: 800, y: 600, width: 144, height: 156 },
    workArea: { x: 0, y: 0, width: 1200, height: 800 }
  });
  return { engine, events, advance: (milliseconds) => { now += milliseconds; } };
}

test('drag release records one interaction and starts one hiss', () => {
  const { engine, events } = fixture();
  engine.pointerDown({ x: 820, y: 630 });
  engine.pointerDrag({ x: 900, y: 650 }, { x: 80, y: 20 });
  engine.pointerUp(0);
  assert.equal(engine.mode, 'hissing');
  assert.deepEqual(events.records, ['interactions', 'hisses']);
  assert.equal(events.speeches.at(-1), '哈?~~');
});

test('automatic sleep begins after one minute of inactivity', () => {
  const { engine, events, advance } = fixture();
  advance(60_001);
  engine.tick();
  assert.equal(engine.sleeping, true);
  assert.equal(engine.mode, 'sleeping');
  assert.ok(events.records.includes('sleeps'));
});

test('manual jump uses a scale-aware parabolic lift and lands', () => {
  const { engine, events } = fixture();
  engine.triggerJump();
  for (let index = 0; index < 34; index += 1) engine.tick();
  const lifted = events.moves.some((point) => point.y < 600);
  assert.equal(lifted, true);
  assert.notEqual(engine.mode, 'jumping');
});

test('quiet activity remains idle', () => {
  const { engine } = fixture();
  engine.applySettings({ activityLevel: 'quiet' });
  engine.chooseNextRoamPhase();
  assert.equal(engine.mode, 'idle');
  assert.equal(engine.phaseTicks, Number.MAX_SAFE_INTEGER);
});

test('walking is always followed by a timed idle window', () => {
  const { engine } = fixture();
  engine.setMode('walkRight', 1, 0);
  engine.tick();
  assert.equal(engine.mode, 'idle');
  assert.ok(engine.phaseTicks >= 72 && engine.phaseTicks <= 144);
});

test('transient actions are always followed by a timed idle window', () => {
  const { engine } = fixture();
  engine.triggerWave();
  for (let index = 0; index < 24; index += 1) engine.tick();
  assert.equal(engine.mode, 'idle');
  assert.ok(engine.phaseTicks >= 72 && engine.phaseTicks <= 144);
});

test('leaving quiet mode resumes autonomous activity scheduling', () => {
  const { engine } = fixture();
  engine.applySettings({ activityLevel: 'quiet' });
  engine.applySettings({ activityLevel: 'default' });
  assert.notEqual(engine.phaseTicks, Number.MAX_SAFE_INTEGER);
});

test('walking pet turns around when macOS rejects movement into a reserved area', () => {
  const { engine } = fixture();
  engine.setMode('walkLeft', 120, 0);
  engine.environment.bounds.x = 110;
  engine.moveHorizontally();
  engine.confirmMove({
    requested: { x: 108.425, y: 600 },
    actual: { x: 110, y: 600, width: 144, height: 156 }
  });
  // WindowServer can first acknowledge setPosition, then push the window back.
  engine.confirmMove({
    requested: { x: 108.425, y: 600 },
    actual: { x: 108.425, y: 600, width: 144, height: 156 }
  });
  engine.confirmMove({
    requested: { x: 108.425, y: 600 },
    actual: { x: 110, y: 600, width: 144, height: 156 }
  });

  assert.equal(engine.mode, 'walkRight');
  assert.equal(engine.phaseTicks, 120);
});

test('screen-edge turns preserve the remaining walking time', () => {
  const { engine } = fixture();
  engine.setMode('walkRight', 100, 0);
  engine.environment.bounds.x = 1056;
  engine.moveHorizontally();
  assert.equal(engine.mode, 'walkLeft');
  assert.equal(engine.phaseTicks, 100);
});

test('large system correction updates the hiss anchor instead of fighting it', () => {
  const { engine } = fixture();
  engine.startHiss(3);
  engine.confirmMove({
    requested: { x: 20, y: 600 },
    actual: { x: 110, y: 600, width: 144, height: 156 }
  });

  assert.equal(engine.hissBaseX, 110);
});
