import test from 'node:test';
import assert from 'node:assert/strict';
import { PetEngine, TICK_MS, SLEEP_TICK_MS } from '../src/renderer/engine.mjs';

function fixture() {
  let now = 0;
  const events = { frames: [], moves: [], records: [], recordDetails: [], speeches: [], gifts: [], states: [], speechHides: 0 };
  const engine = new PetEngine({
    render: (value) => events.frames.push(value),
    moveTo: (x, y) => events.moves.push({ x, y }),
    record: (value, amount = 1) => { events.records.push(value); events.recordDetails.push({ value, amount }); },
    gift: (value) => events.gifts.push(value),
    speech: (text) => events.speeches.push(text),
    hideSpeech: () => { events.speechHides += 1; },
    publish: (state) => events.states.push(state)
  }, () => now);
  engine.initialize({
    settings: { scale: 0.75, activityLevel: 'default', cursorHuntEnabled: true, paused: false },
    bounds: { x: 800, y: 600, width: 144, height: 156 },
    workArea: { x: 0, y: 0, width: 1200, height: 800 },
    gifts: [{ id: 'screw', weight: 100 }, { id: 'gear', weight: 0 }]
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
  assert.ok(events.speeches.at(-1).startsWith('哈?~~'));
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

test('slowly approaching the idle pet makes her turn away, then dodge if followed', () => {
  const { engine, events } = fixture();
  const center = engine.center();
  engine.updateEnvironment({ cursor: { x: center.x + 230, y: center.y } });
  engine.tick();
  engine.phaseTicks = 1;
  engine.updateEnvironment({ cursor: { x: center.x + 227, y: center.y } });
  engine.tick();
  assert.equal(engine.mode, 'idle');
  assert.ok(engine.phaseTicks >= 71);
  assert.deepEqual(events.frames.at(-1), { kind: 'sheet', row: 9, column: 4 });
  for (let index = 2; index <= 16; index += 1) {
    engine.updateEnvironment({ cursor: { x: center.x + 230 - index * 3, y: center.y } });
    engine.tick();
  }
  assert.ok(engine.turnAwayTicks > 0);
  assert.equal(engine.guidingActive, false);
  assert.equal(events.frames.at(-1).kind, 'sheet');
  assert.equal(events.frames.at(-1).row, 9);
  assert.ok(events.frames.at(-1).column >= 4 && events.frames.at(-1).column <= 5);
  for (let index = 0; index < 17; index += 1) engine.tick();
  assert.deepEqual(events.frames.at(-1), { kind: 'sheet', row: 10, column: 4 });
  assert.ok(events.speeches.at(-1).startsWith('多涅。'));

  for (let x = 175; x >= 75 && engine.mode === 'idle'; x -= 5) {
    engine.updateEnvironment({ cursor: { x: center.x + x, y: center.y } });
    engine.tick();
  }
  assert.equal(engine.mode, 'walkLeft');
  assert.ok(events.speeches.at(-1).startsWith('多涅。'));
});

test('a nearby cursor owns the idle state until it leaves the interaction range', () => {
  const { engine, advance } = fixture();
  const center = engine.center();
  engine.phaseTicks = 1;
  engine.updateEnvironment({ cursor: { x: center.x + engine.environment.bounds.width, y: center.y } });
  advance(61_000);
  engine.tick();
  assert.equal(engine.cursorAttentionLocked, true);
  assert.equal(engine.mode, 'idle');
  assert.equal(engine.sleeping, false);
  assert.equal(engine.phaseTicks, 1);

  engine.updateEnvironment({ cursor: { x: center.x + engine.environment.bounds.width * 2.2, y: center.y } });
  engine.tick();
  assert.equal(engine.cursorAttentionLocked, false);
  assert.notEqual(engine.mode, 'idle');
});

test('slow strokes over her head trigger one accepted petting response', () => {
  const { engine, events } = fixture();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    engine.giftCooldownTicks = 10_000;
    engine.traits = { ...engine.traits, closeness: 90, temper: 10, boredom: 50 };
    const head = {
      x: engine.environment.bounds.x + engine.environment.bounds.width * 0.36,
      y: engine.environment.bounds.y + engine.environment.bounds.height * 0.43
    };
    engine.updateEnvironment({ cursor: head });
    engine.tick();
    for (let index = 0; index < 17; index += 1) {
      engine.updateEnvironment({ cursor: { x: head.x + (index % 2 ? 2 : 0), y: head.y } });
      engine.tick();
    }

    assert.ok(engine.pettingTicks > 0);
    assert.equal(engine.pettingArmed, false);
    assert.equal(events.frames.at(-1).kind, 'petting');
    assert.equal(events.frames.at(-1).row, 0);
    assert.equal(events.frames.at(-1).column, 3);
    assert.ok(events.frames.at(-1).envelope > 0);
    assert.ok(events.speeches.at(-1).startsWith('多涅多涅~'));
    assert.deepEqual(events.records, ['interactions', 'pettingAccepted']);
    assert.ok(engine.traits.closeness > 90);
    assert.ok(engine.traits.boredom < 50);
  } finally {
    Math.random = originalRandom;
  }
});

test('continued strokes rearm petting without leaving while a stationary cursor does not', () => {
  const { engine, events } = fixture();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    engine.giftCooldownTicks = 10_000;
    engine.traits = { ...engine.traits, closeness: 100, temper: 0 };
    const head = {
      x: engine.environment.bounds.x + engine.environment.bounds.width * 0.36,
      y: engine.environment.bounds.y + engine.environment.bounds.height * 0.43
    };
    engine.updateEnvironment({ cursor: head });
    engine.tick();
    for (let index = 0; index < 17; index += 1) {
      engine.updateEnvironment({ cursor: { x: head.x + (index % 2 ? 2 : 0), y: head.y } });
      engine.tick();
    }
    while (engine.pettingTicks > 0) engine.tick();
    const interactionsAfterFirstPet = events.records.length;
    for (let index = 0; index < 80; index += 1) engine.tick();
    assert.equal(events.records.length, interactionsAfterFirstPet);
    assert.equal(engine.pettingArmed, false);

    for (let index = 0; index < 28 && events.records.length === interactionsAfterFirstPet; index += 1) {
      engine.updateEnvironment({ cursor: { x: head.x + (index % 2 ? 3 : 0), y: head.y } });
      engine.tick();
    }
    assert.equal(events.records.length, interactionsAfterFirstPet + 2);
    assert.ok(engine.pettingTicks > 0);
  } finally {
    Math.random = originalRandom;
  }
});

test('calmly hovering over her head can trigger the first petting response', () => {
  const { engine, events } = fixture();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    engine.giftCooldownTicks = 10_000;
    const head = {
      x: engine.environment.bounds.x + engine.environment.bounds.width * 0.36,
      y: engine.environment.bounds.y + engine.environment.bounds.height * 0.43
    };
    engine.updateEnvironment({ cursor: head });
    for (let index = 0; index < 62; index += 1) engine.tick();
    assert.ok(engine.pettingTicks > 0);
    assert.deepEqual(events.records, ['interactions', 'pettingAccepted']);
  } finally {
    Math.random = originalRandom;
  }
});

test('a fast pass through the head zone is not treated as petting', () => {
  const { engine, events } = fixture();
  const head = {
    x: engine.environment.bounds.x + engine.environment.bounds.width * 0.36,
    y: engine.environment.bounds.y + engine.environment.bounds.height * 0.43
  };
  engine.updateEnvironment({ cursor: { x: head.x - 80, y: head.y } });
  engine.updateMouseHunt();
  engine.updateEnvironment({ cursor: head });
  engine.updateMouseHunt();

  assert.equal(engine.pettingTicks, 0);
  assert.equal(engine.pettingDwellTicks, 1);
  assert.deepEqual(events.records, []);
});

test('steady slow movement beside her can guide her for a measured walk', () => {
  const { engine, events } = fixture();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    engine.giftCooldownTicks = 10_000;
    engine.traits = { ...engine.traits, vitality: 90, closeness: 90, temper: 0 };
    const center = engine.center();
    engine.updateEnvironment({ cursor: { x: center.x + 110, y: center.y } });
    engine.tick();
    for (let index = 1; index <= 22 && !engine.guidingActive; index += 1) {
      engine.updateEnvironment({ cursor: { x: center.x + 110 + index * 2, y: center.y } });
      engine.tick();
    }
    assert.equal(engine.guidingActive, true);
    assert.equal(engine.turnAwayTicks, 0);
    assert.equal(engine.mode, 'walkRight');
    for (let index = 0; index < 40; index += 1) {
      const cursor = engine.environment.cursor;
      engine.updateEnvironment({ cursor: { x: cursor.x + 2, y: cursor.y } });
      engine.tick();
    }
    engine.finishGuiding();
    assert.equal(engine.guidingActive, false);
    assert.equal(engine.mode, 'idle');
    assert.ok(events.moves.length > 10);
    const guided = events.recordDetails.find((entry) => entry.value === 'guidedWalk');
    assert.ok(guided.amount >= 0.35);
  } finally {
    Math.random = originalRandom;
  }
});

test('turn-away animation uses the original directional sprites and reverses on return', () => {
  const { engine, events } = fixture();
  const center = engine.center();
  engine.slowApproachScore = 100;
  engine.updateTsundereInteraction({ x: center.x - 180, y: center.y }, 2, 180, 183);
  engine.renderIdleOrLook();
  assert.deepEqual(events.frames.at(-1), { kind: 'sheet', row: 10, column: 4 });

  for (let index = 0; index < 18; index += 1) engine.tick();
  assert.deepEqual(events.frames.at(-1), { kind: 'sheet', row: 9, column: 4 });

  engine.turnAwayTicks = 0;
  engine.glanceBackTicks = 24;
  const returnFrames = [];
  for (let index = 0; index < 17; index += 1) {
    engine.renderIdleOrLook();
    returnFrames.push(events.frames.at(-1));
  }
  assert.deepEqual(returnFrames[0], { kind: 'sheet', row: 9, column: 4 });
  assert.deepEqual(returnFrames.at(-1), { kind: 'sheet', row: 10, column: 4 });
});

test('three quick pokes escalate from wave to hiss to walking away', () => {
  const { engine, events } = fixture();
  const point = engine.center();
  engine.updateEnvironment({ cursor: point });

  engine.pointerDown(point);
  engine.pointerUp(1);
  assert.equal(engine.mode, 'waving');

  engine.pointerDown(point);
  engine.pointerUp(2);
  assert.equal(engine.mode, 'hissing');
  assert.ok(events.speeches.at(-1).startsWith('哈?~~'));

  engine.pointerDown(point);
  engine.pointerUp(3);
  assert.ok(['walkLeft', 'walkRight'].includes(engine.mode));
  assert.ok(events.speeches.at(-1).startsWith('多涅。'));
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

test('sleeping lowers the renderer tick rate without delaying proximity wake', () => {
  const { engine, events } = fixture();
  assert.equal(engine.tickIntervalMs(), TICK_MS);
  engine.startSleeping();
  assert.equal(engine.tickIntervalMs(), SLEEP_TICK_MS);
  engine.updateEnvironment({ cursor: engine.center() });
  for (let index = 0; index < 3; index += 1) engine.tick();
  assert.equal(engine.sleeping, true);
  engine.tick();
  assert.equal(engine.sleeping, false);
  assert.equal(engine.tickIntervalMs(), TICK_MS);
  assert.ok(events.frames.filter((frame) => frame.kind === 'sleep').length <= 3);
});

test('manual gift discovery shows, reacts, and returns to idle', () => {
  const { engine, events } = fixture();
  engine.triggerGiftDiscovery();
  assert.equal(engine.giftActive, true);
  assert.equal(engine.mode, 'review');
  assert.deepEqual(events.gifts.at(-1), { type: 'show', gift: { id: 'screw', weight: 100 } });
  assert.equal(events.speeches.at(-1), '多涅？');

  for (let index = 0; index < 27; index += 1) engine.tick();
  assert.ok(events.speeches.at(-1).startsWith('多涅。🎁'));
  engine.giftTapped();
  assert.equal(events.records.at(-1), 'interactions');
  assert.equal(events.gifts.at(-1).type, 'reaction');
  assert.ok(events.speeches.at(-1).startsWith('多涅！'));

  for (let index = 27; index < 144; index += 1) engine.tick();
  assert.equal(engine.giftActive, false);
  assert.equal(events.gifts.at(-1).type, 'hide');
  assert.equal(engine.mode, 'idle');
});

test('a gifted collectible is presented without recording another discovery', () => {
  const { engine, events } = fixture();
  assert.equal(engine.receiveGift('screw'), true);
  assert.equal(engine.giftActive, true);
  assert.equal(engine.giftUseAction, 'jump');
  assert.deepEqual(events.gifts.at(-1), {
    type: 'show', gift: { id: 'screw', weight: 100 }, record: false
  });
  assert.ok(engine.traits.vitality > 68);
});

test('gift reactions only render columns that exist in each animation row', () => {
  const { engine, events } = fixture();
  engine.receiveGift('screw');
  for (let index = 0; index < 90; index += 1) engine.tick();
  const jumpFrames = events.frames.filter((frame) => frame.kind === 'sheet' && frame.row === 4);
  assert.ok(jumpFrames.length > 0);
  assert.ok(jumpFrames.every((frame) => frame.column >= 0 && frame.column < 5));

  engine.cancelGiftPresentation();
  engine.receiveGift('gear');
  for (let index = 0; index < 90; index += 1) engine.tick();
  const waveFrames = events.frames.filter((frame) => frame.kind === 'sheet' && frame.row === 3);
  assert.ok(waveFrames.length > 0);
  assert.ok(waveFrames.every((frame) => frame.column >= 0 && frame.column < 4));
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
