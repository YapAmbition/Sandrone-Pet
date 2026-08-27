export const CELL_WIDTH = 192;
export const CELL_HEIGHT = 208;
export const TICK_MS = 1000 / 24;
export const LONG_PRESS_MS = 250;

const LIFT_TICKS = 7;
const DROP_TICKS = 8;

const FRAME_COUNTS = {
  idle: 6,
  walkRight: 8,
  walkLeft: 8,
  waving: 4,
  jumping: 5,
  hissing: 8,
  waiting: 6,
  working: 6,
  review: 6,
  proud: 6,
  sleeping: 6
};

const ROWS = {
  idle: 0,
  walkRight: 1,
  walkLeft: 2,
  waving: 3,
  jumping: 4,
  hissing: 5,
  waiting: 6,
  working: 7,
  review: 8
};

function randomBetween(lower, upper) {
  return lower + Math.floor(Math.random() * (upper - lower + 1));
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function transient(mode) { return !['idle', 'walkRight', 'walkLeft', 'sleeping'].includes(mode); }
function dragColumn(progress, dropping) {
  const step = Math.min(4, Math.floor(clamp(progress, 0, 1) * 5));
  return dropping ? 4 - step : step;
}

export class PetEngine {
  constructor(hooks = {}, now = () => performance.now()) {
    this.hooks = {
      render: hooks.render || (() => {}),
      moveTo: hooks.moveTo || (() => {}),
      speech: hooks.speech || (() => {}),
      hideSpeech: hooks.hideSpeech || (() => {}),
      record: hooks.record || (() => {}),
      savePosition: hooks.savePosition || (() => {}),
      publish: hooks.publish || (() => {})
    };
    this.now = now;
    this.settings = {
      scale: 0.75,
      activityLevel: 'default',
      cursorHuntEnabled: true,
      paused: false
    };
    this.environment = {
      cursor: { x: 0, y: 0 },
      bounds: { x: 0, y: 0, width: 144, height: 156 },
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
      visible: true
    };
    this.mode = 'idle';
    this.frameIndex = 0;
    this.frameClock = 0;
    this.phaseTicks = 80;
    this.transientLoopsRemaining = 0;
    this.idleLookClock = 0;
    this.dragging = false;
    this.pointerHeld = false;
    this.pressStartedAt = 0;
    this.latestPointer = null;
    this.dragVisualTick = 0;
    this.dropping = false;
    this.dropTick = 0;
    this.dragOffset = { x: 0, y: 0 };
    this.jumpBaseY = 0;
    this.jumpHeight = 0;
    this.jumpTick = 0;
    this.jumpTotalTicks = 34;
    this.hissBaseX = 0;
    this.hissTick = 0;
    this.lastPointer = null;
    this.lastPointerDelta = { x: 0, y: 0 };
    this.lureScore = 0;
    this.huntCooldownTicks = 0;
    this.huntAnticipationTicks = 0;
    this.huntTarget = { x: 0, y: 0 };
    this.pounceActive = false;
    this.pounceStartX = 0;
    this.pounceTargetX = 0;
    this.lastInteractionTime = this.now();
    this.sleepRequested = false;
    this.sleeping = false;
    this.wakeProximityArmed = false;
    this.wakeHoverTicks = 0;
    this.pendingMove = null;
    this.blockedMoveTicks = 0;
    this.acceptedMoveTicks = 0;
  }

  initialize({ settings, bounds, workArea }) {
    this.settings = { ...this.settings, ...settings };
    this.environment.bounds = { ...bounds };
    this.environment.workArea = { ...workArea };
    this.jumpBaseY = bounds.y;
    const staysIdle = this.settings.paused || this.settings.activityLevel === 'quiet';
    this.setMode('idle', staysIdle ? Number.MAX_SAFE_INTEGER : 80, 0);
  }

  applySettings(settings = {}) {
    const previousPaused = this.settings.paused;
    const previousActivity = this.settings.activityLevel;
    this.settings = { ...this.settings, ...settings };
    if (settings.cursorHuntEnabled === false) this.cancelHunt();
    if (!previousPaused && this.settings.paused) {
      this.cancelHunt();
      this.setMode('idle', Number.MAX_SAFE_INTEGER, 0);
    } else if (previousPaused && !this.settings.paused) {
      this.chooseNextRoamPhase();
    }
    if (previousActivity !== this.settings.activityLevel && this.settings.activityLevel === 'quiet' &&
        ['idle', 'walkLeft', 'walkRight'].includes(this.mode)) {
      this.setMode('idle', Number.MAX_SAFE_INTEGER, 0);
    } else if (previousActivity === 'quiet' && this.settings.activityLevel !== 'quiet' &&
        this.mode === 'idle') {
      this.chooseNextRoamPhase();
    }
  }

  updateEnvironment(environment) {
    this.environment = { ...this.environment, ...environment };
    if (environment?.bounds) this.reconcileMove(environment.bounds);
  }

  confirmMove(result = {}) {
    if (!result.actual) return;
    if (result.requested && Number.isFinite(result.requested.x) && Number.isFinite(result.requested.y)) {
      this.pendingMove = { x: result.requested.x, y: result.requested.y };
    }
    this.environment.bounds = { ...this.environment.bounds, ...result.actual };
    this.reconcileMove(result.actual);
  }

  reconcileMove(actual) {
    if (!this.pendingMove || this.dragging || !Number.isFinite(actual?.x)) return;
    const errorX = actual.x - this.pendingMove.x;
    const blockedLeft = this.mode === 'walkLeft' && errorX > 1.25;
    const blockedRight = this.mode === 'walkRight' && errorX < -1.25;

    if (blockedLeft || blockedRight) {
      this.blockedMoveTicks += 1;
      this.acceptedMoveTicks = 0;
      if (Math.abs(errorX) > 6 || this.blockedMoveTicks >= 2) {
        const remainingTicks = Math.max(1, this.phaseTicks);
        this.blockedMoveTicks = 0;
        this.acceptedMoveTicks = 0;
        this.pendingMove = null;
        this.setMode(blockedLeft ? 'walkRight' : 'walkLeft', remainingTicks, 0);
      }
      return;
    }

    if (this.mode === 'hissing' && Math.abs(errorX) > 8) this.hissBaseX = actual.x;
    if (['walkLeft', 'walkRight'].includes(this.mode) && this.blockedMoveTicks > 0) {
      this.acceptedMoveTicks += 1;
      if (this.acceptedMoveTicks >= 2) {
        this.blockedMoveTicks = 0;
        this.acceptedMoveTicks = 0;
      }
    } else {
      this.blockedMoveTicks = 0;
      this.acceptedMoveTicks = 0;
    }
  }

  noteInteraction() {
    this.lastInteractionTime = this.now();
    this.sleepRequested = false;
    if (this.sleeping) this.wakeFromSleep();
  }

  trigger(action) {
    if (action === 'wave') this.triggerWave();
    else if (action === 'proud') this.triggerProud();
    else if (action === 'jump') this.triggerJump();
    else if (action === 'hiss') this.triggerHiss();
    else if (action === 'toggleSleep') this.toggleSleep();
  }

  triggerWave() {
    this.noteInteraction();
    this.startWave();
  }

  startWave() {
    this.cancelHunt();
    this.setMode('waving', 90, 2);
  }

  triggerProud() {
    this.noteInteraction();
    this.startProud();
  }

  startProud() {
    this.cancelHunt();
    this.setMode('proud', 90, 2);
    this.hooks.speech('多涅多涅~', 1800);
  }

  triggerJump() {
    this.noteInteraction();
    this.startJump();
  }

  startJump() {
    this.cancelHunt();
    if (this.mode === 'jumping') this.moveTo(this.environment.bounds.x, this.jumpBaseY);
    this.jumpBaseY = this.environment.bounds.y;
    this.jumpTick = 0;
    this.jumpTotalTicks = 34;
    const scaledHeight = this.environment.bounds.height * 0.5;
    const availableHeight = this.environment.bounds.y - this.environment.workArea.y - 8;
    this.jumpHeight = Math.max(0, Math.min(scaledHeight, availableHeight));
    this.setMode('jumping', 90, 0);
  }

  triggerHiss() {
    this.noteInteraction();
    this.startHiss(3);
  }

  startHiss(loops = 3) {
    this.hooks.record('hisses');
    this.cancelHunt();
    if (this.mode === 'hissing') this.moveTo(this.hissBaseX, this.environment.bounds.y);
    this.hissBaseX = this.environment.bounds.x;
    this.hissTick = 0;
    this.setMode('hissing', 90, loops);
    this.hooks.speech('哈?~~', Math.max(2000, loops * 1000));
  }

  toggleSleep() {
    if (this.sleeping) {
      this.noteInteraction();
      return;
    }
    this.lastInteractionTime = this.now();
    this.sleepRequested = true;
    if (['idle', 'walkLeft', 'walkRight'].includes(this.mode)) this.startSleeping();
  }

  startSleeping() {
    if (this.sleeping) return;
    this.hooks.record('sleeps');
    this.cancelHunt();
    this.sleepRequested = false;
    this.sleeping = true;
    this.wakeHoverTicks = 0;
    const center = this.center();
    this.wakeProximityArmed = distance(this.environment.cursor, center) > this.sleepWakeRadius();
    this.setMode('sleeping', Number.MAX_SAFE_INTEGER, 0);
    this.hooks.speech('Zzz…', 2200);
  }

  wakeFromSleep() {
    if (!this.sleeping) return;
    this.sleeping = false;
    this.sleepRequested = false;
    this.wakeHoverTicks = 0;
    this.hooks.hideSpeech();
    this.setMode('idle', 48, 0);
  }

  sleepWakeRadius() { return this.environment.bounds.width * 1.18; }

  pointerDown(screenPoint) {
    this.noteInteraction();
    if (this.huntAnticipationTicks > 0 || this.pounceActive) {
      this.cancelHunt();
      this.setMode('idle', 80, 0);
    }
    this.pointerHeld = true;
    this.pressStartedAt = this.now();
    this.latestPointer = { ...screenPoint };
    this.dragOffset = {
      x: screenPoint.x - this.environment.bounds.x,
      y: screenPoint.y - this.environment.bounds.y
    };
  }

  pointerDrag(screenPoint, movement) {
    this.noteInteraction();
    this.latestPointer = { ...screenPoint };
    if (this.dragging) this.moveTo(screenPoint.x - this.dragOffset.x, screenPoint.y - this.dragOffset.y);
  }

  pointerUp(clickCount) {
    this.pointerHeld = false;
    this.latestPointer = null;
    const wasDrag = this.dragging;
    this.dragging = false;
    this.hooks.record('interactions');
    if (wasDrag) {
      this.hooks.savePosition();
      this.startDrop();
      return true;
    }
    this.dropping = false;
    if (clickCount >= 3) this.triggerHiss();
    else if (clickCount === 2) this.triggerJump();
    else this.triggerWave();
    return false;
  }

  pointerCancel() {
    this.pointerHeld = false;
    this.latestPointer = null;
    if (!this.dragging) return;
    this.dragging = false;
    this.hooks.record('interactions');
    this.hooks.savePosition();
    this.startDrop();
  }

  tick() {
    if (!this.environment.visible) return;
    if (this.pointerHeld && !this.dragging && this.now() - this.pressStartedAt >= LONG_PRESS_MS) {
      this.beginDrag();
    }
    if (this.dragging) return this.tickDrag();
    if (this.dropping) return this.tickDrop();
    if (this.huntCooldownTicks > 0) this.huntCooldownTicks -= 1;
    this.updateAutomaticSleep();
    if (this.sleeping) return this.tickSleeping();
    this.updateMouseHunt();
    if (this.huntAnticipationTicks > 0) return this.tickHuntAnticipation();
    if (this.mode === 'walkRight' || this.mode === 'walkLeft') this.moveHorizontally();
    if (this.mode === 'jumping') return this.tickJump();
    if (this.mode === 'hissing') {
      this.hissTick += 1;
      this.moveTo(this.hissBaseX + Math.sin(this.hissTick * 1.7) * 4.5 * this.settings.scale,
        this.environment.bounds.y);
    }

    this.frameClock += 1;
    if (this.frameClock >= 3) {
      this.frameClock = 0;
      this.frameIndex += 1;
      if (this.frameIndex >= FRAME_COUNTS[this.mode]) {
        this.frameIndex = 0;
        if (transient(this.mode)) {
          this.transientLoopsRemaining -= 1;
          if (this.transientLoopsRemaining <= 0) return this.chooseNextRoamPhase();
        }
      }
    }

    if (this.mode === 'idle') {
      this.idleLookClock += 1;
      this.renderIdleOrLook();
    } else if (this.mode === 'proud') {
      this.hooks.render({ kind: 'proud', column: this.frameIndex });
    } else {
      this.hooks.render({ kind: 'sheet', row: ROWS[this.mode], column: this.frameIndex });
    }

    if (!this.settings.paused && !transient(this.mode)) {
      this.phaseTicks -= 1;
      if (this.phaseTicks <= 0) this.chooseNextRoamPhase();
    }
  }

  beginDrag() {
    if (!this.pointerHeld || this.dragging) return;
    this.cancelHunt();
    this.setMode('idle', 80, 0);
    this.sleeping = false;
    this.sleepRequested = false;
    this.dropping = false;
    this.dragging = true;
    this.dragVisualTick = 0;
    this.hooks.hideSpeech();
    if (this.latestPointer) {
      this.moveTo(this.latestPointer.x - this.dragOffset.x, this.latestPointer.y - this.dragOffset.y);
    }
    this.hooks.render({ kind: 'drag', phase: 'lifting', progress: 0, sway: 0, column: 0 });
    this.hooks.publish({ mode: 'dragging', sleeping: false });
  }

  tickDrag() {
    this.dragVisualTick += 1;
    const progress = Math.min(1, this.dragVisualTick / LIFT_TICKS);
    const sway = progress < 1 ? 0 : Math.sin((this.dragVisualTick - LIFT_TICKS) * 0.22);
    this.hooks.render({
      kind: 'drag',
      phase: progress < 1 ? 'lifting' : 'held',
      progress,
      sway,
      column: dragColumn(progress, false)
    });
  }

  startDrop() {
    this.dropping = true;
    this.dropTick = 0;
    this.hooks.render({ kind: 'drag', phase: 'dropping', progress: 0, sway: 0, column: 4 });
    this.hooks.publish({ mode: 'dropping', sleeping: false });
  }

  tickDrop() {
    this.dropTick += 1;
    const progress = Math.min(1, this.dropTick / DROP_TICKS);
    this.hooks.render({ kind: 'drag', phase: 'dropping', progress, sway: 0,
      column: dragColumn(progress, true) });
    if (progress < 1) return;
    this.dropping = false;
    this.startHiss(3);
  }

  updateAutomaticSleep() {
    if (this.sleeping || this.sleepRequested) return;
    if (this.now() - this.lastInteractionTime < 60_000) return;
    this.sleepRequested = true;
    if (this.mode === 'idle') this.startSleeping();
  }

  tickSleeping() {
    this.frameClock += 1;
    if (this.frameClock >= 10) {
      this.frameClock = 0;
      this.frameIndex = (this.frameIndex + 1) % FRAME_COUNTS.sleeping;
    }
    this.hooks.render({ kind: 'sleep', column: this.frameIndex });
    const pointerDistance = distance(this.environment.cursor, this.center());
    const radius = this.sleepWakeRadius();
    if (!this.wakeProximityArmed) {
      if (pointerDistance > radius) this.wakeProximityArmed = true;
      return;
    }
    if (pointerDistance <= radius) {
      this.wakeHoverTicks += 1;
      if (this.wakeHoverTicks >= 20) {
        this.lastInteractionTime = this.now();
        this.wakeFromSleep();
      }
    } else {
      this.wakeHoverTicks = 0;
    }
  }

  updateMouseHunt() {
    const pointer = this.environment.cursor;
    if (!this.lastPointer) {
      this.lastPointer = { ...pointer };
      return;
    }
    const delta = { x: pointer.x - this.lastPointer.x, y: pointer.y - this.lastPointer.y };
    const speed = Math.hypot(delta.x, delta.y);
    const dot = delta.x * this.lastPointerDelta.x + delta.y * this.lastPointerDelta.y;
    const pointerDistance = distance(pointer, this.center());
    this.lastPointer = { ...pointer };
    this.lastPointerDelta = delta;

    if (!this.settings.cursorHuntEnabled || this.settings.paused || this.huntCooldownTicks > 0 ||
        this.huntAnticipationTicks > 0 || this.pounceActive || this.mode !== 'idle') {
      this.lureScore = Math.max(0, this.lureScore - 0.25);
      return;
    }
    const inPlayRange = pointerDistance > 72 * this.settings.scale && pointerDistance < 430 * this.settings.scale;
    if (inPlayRange && speed > 11) {
      this.lureScore += Math.min(2, speed / 16);
      if (dot < 0) this.lureScore += 1.4;
    } else {
      this.lureScore = Math.max(0, this.lureScore - 0.42);
    }
    if (this.lureScore >= 10.5) {
      this.noteInteraction();
      this.beginHunt(pointer);
    }
  }

  beginHunt(pointer) {
    this.lureScore = 0;
    this.huntTarget = { ...pointer };
    this.huntAnticipationTicks = 11;
    this.jumpBaseY = this.environment.bounds.y;
    this.setMode('jumping', 90, 0);
    this.hooks.render({ kind: 'sheet', row: ROWS.jumping, column: 0 });
  }

  tickHuntAnticipation() {
    this.huntTarget = { ...this.environment.cursor };
    const elapsed = 11 - this.huntAnticipationTicks;
    this.hooks.render({ kind: 'sheet', row: ROWS.jumping, column: elapsed < 6 ? 0 : 1 });
    this.huntAnticipationTicks -= 1;
    if (this.huntAnticipationTicks <= 0) this.launchPounce(this.huntTarget);
  }

  launchPounce(pointer) {
    this.pounceActive = true;
    this.jumpBaseY = this.environment.bounds.y;
    this.pounceStartX = this.environment.bounds.x;
    const area = this.environment.workArea;
    let desiredX = pointer.x - this.environment.bounds.width / 2;
    const maxTravel = 270 * this.settings.scale;
    desiredX = clamp(desiredX, this.pounceStartX - maxTravel, this.pounceStartX + maxTravel);
    this.pounceTargetX = clamp(desiredX, area.x, area.x + area.width - this.environment.bounds.width);
    const travel = Math.abs(this.pounceTargetX - this.pounceStartX);
    const scaledHeight = Math.min(this.environment.bounds.height * 0.52,
      this.environment.bounds.height * 0.28 + travel * 0.1);
    const availableHeight = this.environment.bounds.y - area.y - 8;
    this.jumpHeight = Math.max(0, Math.min(scaledHeight, availableHeight));
    this.jumpTick = 5;
    this.jumpTotalTicks = 34;
  }

  tickJump() {
    const anticipationTicks = 5;
    const flightTicks = 24;
    const landingStart = anticipationTicks + flightTicks;
    this.jumpTick = Math.min(this.jumpTick + 1, this.jumpTotalTicks);
    let lift = 0;
    let column = 0;
    let x = this.environment.bounds.x;
    if (this.jumpTick <= anticipationTicks) {
      column = 0;
    } else if (this.jumpTick <= landingStart) {
      const t = (this.jumpTick - anticipationTicks) / flightTicks;
      lift = 4 * this.jumpHeight * t * (1 - t);
      if (t < 0.22) column = 1;
      else if (t < 0.48) column = 2;
      else if (t < 0.78) column = 3;
      else column = 4;
      if (this.pounceActive) x = this.pounceStartX + (this.pounceTargetX - this.pounceStartX) * t;
    } else if (this.pounceActive) {
      x = this.pounceTargetX;
    }
    this.moveTo(x, this.jumpBaseY - lift);
    this.hooks.render({ kind: 'sheet', row: ROWS.jumping, column });
    if (this.jumpTick < this.jumpTotalTicks) return;
    if (!this.pounceActive) return this.chooseNextRoamPhase();
    this.pounceActive = false;
    this.huntCooldownTicks = 190;
    const caught = Math.abs(this.environment.cursor.x - (this.environment.bounds.x + this.environment.bounds.width / 2)) <
        this.environment.bounds.width * 0.42 &&
      Math.abs(this.environment.cursor.y - (this.environment.bounds.y + this.environment.bounds.height / 2)) <
        this.environment.bounds.height * 1.35;
    if (caught) {
      this.hooks.record('caught');
      this.startProud();
    } else {
      this.hooks.record('missed');
      this.startHiss(2);
    }
  }

  moveHorizontally() {
    const area = this.environment.workArea;
    let x = this.environment.bounds.x + 2.1 * this.settings.scale * (this.mode === 'walkRight' ? 1 : -1);
    if (x + this.environment.bounds.width >= area.x + area.width) {
      x = area.x + area.width - this.environment.bounds.width;
      this.setMode('walkLeft', Math.max(1, this.phaseTicks), 0);
    } else if (x <= area.x) {
      x = area.x;
      this.setMode('walkRight', Math.max(1, this.phaseTicks), 0);
    }
    this.moveTo(x, clamp(this.environment.bounds.y, area.y + 4,
      area.y + area.height - this.environment.bounds.height));
  }

  chooseNextRoamPhase() {
    if (this.sleepRequested) return this.startSleeping();
    if (this.settings.paused || this.settings.activityLevel === 'quiet') {
      return this.setMode('idle', Number.MAX_SAFE_INTEGER, 0);
    }
    // Every active action must be followed by a real idle window. Mouse hunting
    // only runs while idle, so autonomous movement cannot starve interaction.
    if (this.mode !== 'idle') return this.startTimedIdle();

    const roll = randomBetween(0, 99);
    if (roll < 25) this.startTimedIdle();
    else if (roll < 45) this.setMode('walkRight', randomBetween(72, 120), 0);
    else if (roll < 65) this.setMode('walkLeft', randomBetween(72, 120), 0);
    else if (roll < 80) this.startWave();
    else if (roll < 90) this.startJump();
    else this.startHiss(2);
  }

  startTimedIdle() {
    const ticks = this.settings.activityLevel === 'lively'
      ? randomBetween(36, 72)
      : randomBetween(72, 144);
    this.setMode('idle', ticks, 0);
  }

  setMode(mode, ticks, loops) {
    if (this.mode === 'jumping' && mode !== 'jumping') this.moveTo(this.environment.bounds.x, this.jumpBaseY);
    if (this.mode === 'hissing' && mode !== 'hissing') this.moveTo(this.hissBaseX, this.environment.bounds.y);
    this.mode = mode;
    this.frameIndex = 0;
    this.frameClock = 0;
    this.phaseTicks = ticks;
    this.transientLoopsRemaining = loops;
    if (mode === 'proud') this.hooks.render({ kind: 'proud', column: 0 });
    else if (mode === 'sleeping') this.hooks.render({ kind: 'sleep', column: 0 });
    else this.hooks.render({ kind: 'sheet', row: ROWS[mode], column: 0 });
    this.hooks.publish({ mode: this.mode, sleeping: this.sleeping });
  }

  renderIdleOrLook() {
    const center = this.center();
    const pointer = this.environment.cursor;
    const dx = pointer.x - center.x;
    const dyUp = center.y - pointer.y;
    if (Math.hypot(dx, dyUp) < 85 || this.idleLookClock % 96 < 34) {
      this.hooks.render({ kind: 'sheet', row: 0, column: Math.min(this.frameIndex, 5) });
      return;
    }
    let degrees = Math.atan2(dx, dyUp) * 180 / Math.PI;
    if (degrees < 0) degrees += 360;
    const direction = Math.round(degrees / 22.5) % 16;
    this.hooks.render({ kind: 'sheet', row: direction < 8 ? 9 : 10, column: direction < 8 ? direction : direction - 8 });
  }

  cancelHunt() {
    this.huntAnticipationTicks = 0;
    this.pounceActive = false;
    this.lureScore = 0;
  }

  center() {
    return {
      x: this.environment.bounds.x + this.environment.bounds.width / 2,
      y: this.environment.bounds.y + this.environment.bounds.height / 2
    };
  }

  moveTo(x, y) {
    this.pendingMove = { x, y };
    this.environment.bounds.x = x;
    this.environment.bounds.y = y;
    this.hooks.moveTo(x, y);
  }
}
