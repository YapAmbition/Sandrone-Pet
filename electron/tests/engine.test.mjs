import test from 'node:test';
import assert from 'node:assert/strict';
import { PetEngine } from '../src/renderer/engine.mjs';

function fixture() {
  let now = 0;
  const events = { frames: [], moves: [], records: [], speeches: [], gifts: [], states: [], speechHides: 0 };
  const engine = new PetEngine({
    render: (value) => events.frames.push(value),
    moveTo: (x, y) => events.moves.push({ x, y }),
    record: (value) => events.records.push(value),
    gift: (value) => events.gifts.push(value),
    speech: (text) => events.speeches.push(text),
    hideSpeech: () => { events.speechHides += 1; },
    publish: (state) => events.states.push(state)
  }, () => now);
  engine.initialize({
    settings: { scale: 0.75, activityLevel: 'default', cursorHuntEnabled: true, paused: false },
    bounds: { x: 800, y: 600, width: 144, height: 156 },
    workArea: { x: 0, y: 0, width: 1200, height: 800 },
    gifts: [{ id: 'screw', weight: 100 }]
  });
  return { engine, events, advance: (milliseconds) => { now += milliseconds; } };
}

test('long press drag releases through a landing animation into one hiss', () => {
  const { engine, events, advance } = fixture();
  engine.pointerDown({ x: 820, y: 630 });
  engine.pointerDrag({ x: 900, y: 650 }, { x: 80, y: 20 });
  advance(249);
  engine.tick();
  assert.equal(engine.dragging, false);
  advance(1);
  engine.tick();
  assert.equal(engine.dragging, true);
  for (let index = 0; index < 7; index += 1) engine.tick();
  assert.deepEqual([...new Set(events.frames.filter((frame) => frame.kind === 'drag')
    .map((frame) => frame.column))], [0, 1, 2, 3, 4]);
  engine.pointerDrag({ x: 900, y: 650 }, { x: 80, y: 20 });
  assert.equal(engine.pointerUp(1), true);
  assert.equal(engine.dropping, true);
  for (let index = 0; index < 8; index += 1) engine.tick();
  const dropColumns = events.frames.filter((frame) => frame.kind === 'drag' && frame.phase === 'dropping')
    .map((frame) => frame.column);
  assert.equal(dropColumns[0], 4);
  assert.equal(dropColumns.at(-1), 0);
  assert.equal(engine.mode, 'hissing');
  assert.deepEqual(events.records, ['interactions', 'hisses']);
  assert.equal(events.speeches.at(-1), '哈?~~');
});

test('holding still for 250ms picks the pet up', () => {
  const { engine, events, advance } = fixture();
  engine.pointerDown({ x: 820, y: 630 });
  advance(250);
  engine.tick();
  assert.equal(engine.dragging, true);
  assert.equal(events.frames.at(-1).kind, 'drag');
});

test('quick pointer movement stays a click until the hold threshold', () => {
  const { engine, events, advance } = fixture();
  engine.pointerDown({ x: 820, y: 630 });
  engine.pointerDrag({ x: 1000, y: 700 }, { x: 180, y: 70 });
  advance(200);
  engine.tick();
  assert.equal(engine.dragging, false);
  assert.equal(engine.pointerUp(1), false);
  assert.equal(engine.mode, 'waving');
  assert.deepEqual(events.records, ['interactions']);
});

test('re-grabbing during hiss uses the new drag position as the next hiss anchor', () => {
  const { engine, events, advance } = fixture();
  engine.triggerHiss();
  engine.pointerDown({ x: 820, y: 630 });
  advance(250);
  engine.tick();
  engine.pointerDrag({ x: 950, y: 680 }, { x: 130, y: 50 });
  engine.pointerUp(1);
  for (let index = 0; index < 8; index += 1) engine.tick();
  assert.equal(engine.hissBaseX, 930);
  assert.equal(events.moves.at(-1).x, 930);
  assert.ok(events.speechHides > 0);
});

test('a second long press cleanly interrupts the landing animation', () => {
  const { engine, advance } = fixture();
  engine.pointerDown({ x: 820, y: 630 });
  advance(250);
  engine.tick();
  engine.pointerUp(1);
  assert.equal(engine.dropping, true);

  engine.pointerDown({ x: 820, y: 630 });
  advance(250);
  engine.tick();
  assert.equal(engine.dragging, true);
  assert.equal(engine.dropping, false);
});

test('automatic sleep begins after one minute of inactivity', () => {
  const { engine, events, advance } = fixture();
  advance(60_001);
  engine.tick();
  assert.equal(engine.sleeping, true);
  assert.equal(engine.mode, 'sleeping');
  assert.ok(events.records.includes('sleeps'));
});

test('manual gift discovery shows, reacts, and returns to idle', () => {
  const { engine, events } = fixture();
  engine.triggerGiftDiscovery();
  assert.equal(engine.giftActive, true);
  assert.equal(engine.mode, 'review');
  assert.deepEqual(events.gifts.at(-1), { type: 'show', gift: { id: 'screw', weight: 100 } });
  assert.equal(events.speeches.at(-1), '多涅？');

  for (let index = 0; index < 27; index += 1) engine.tick();
  assert.equal(events.speeches.at(-1), '多涅。🎁');
  engine.giftTapped();
  assert.equal(events.records.at(-1), 'interactions');
  assert.equal(events.gifts.at(-1).type, 'reaction');
  assert.equal(events.speeches.at(-1), '多涅！💢');

  for (let index = 27; index < 144; index += 1) engine.tick();
  assert.equal(engine.giftActive, false);
  assert.equal(events.gifts.at(-1).type, 'hide');
  assert.equal(engine.mode, 'idle');
});

test('sleeping pet does not discover gifts until manually woken', () => {
  const { engine, events } = fixture();
  engine.startSleeping();
  engine.giftCooldownTicks = 0;
  for (let index = 0; index < 500; index += 1) engine.tick();
  assert.equal(engine.giftActive, false);
  assert.equal(events.gifts.length, 0);
  engine.triggerGiftDiscovery();
  assert.equal(engine.sleeping, false);
  assert.equal(engine.giftActive, true);
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
