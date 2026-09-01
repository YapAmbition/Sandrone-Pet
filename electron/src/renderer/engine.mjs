export const CELL_WIDTH = 192;
export const CELL_HEIGHT = 208;
export const TICK_MS = 1000 / 24;
export const SLEEP_TICK_MS = 200;
export const LONG_PRESS_MS = 250;

import {
  DEFAULT_TRAITS,
  normalizeTraits,
  applyGiftEffect,
  applyTraitEvent,
  driftTraits,
  roamWeights,
  chooseWeighted,
  huntWillingness,
  decorateSpeech
} from './temperament.mjs';

const LIFT_TICKS = 7;
const DROP_TICKS = 8;
const TURN_AWAY_TICKS = 72;
const GLANCE_BACK_TICKS = 24;
const TURN_DIRECTION_FRAME_TICKS = 2;

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
      gift: hooks.gift || (() => {}),
      mood: hooks.mood || (() => {}),
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
    this.lastPointerDistance = null;
    this.lureScore = 0;
    this.huntCooldownTicks = 0;
    this.huntAnticipationTicks = 0;
    this.huntTarget = { x: 0, y: 0 };
    this.pounceActive = false;
    this.pounceStartX = 0;
    this.pounceTargetX = 0;
    this.slowApproachScore = 0;
    this.turnAwayTicks = 0;
    this.glanceBackTicks = 0;
    this.turnAwayStartDirection = 0;
    this.cursorAttentionLocked = false;
    this.pettingDwellTicks = 0;
    this.pettingTravel = 0;
    this.pettingRearmTravel = 0;
    this.pettingTicks = 0;
    this.pettingArmed = true;
    this.guideScore = 0;
    this.guideLeadTravel = 0;
    this.guideDirection = 0;
    this.guidingActive = false;
    this.guidingTicks = 0;
    this.guideCooldownTicks = 0;
    this.guidedPixels = 0;
    this.lastInteractionTime = this.now();
    this.sleepRequested = false;
    this.sleeping = false;
    this.wakeProximityArmed = false;
    this.wakeHoverTicks = 0;
    this.pendingMove = null;
    this.blockedMoveTicks = 0;
    this.acceptedMoveTicks = 0;
    this.giftDefinitions = [];
    this.giftActive = false;
    this.giftTick = 0;
    this.giftReactionTicks = 0;
    this.giftUseAction = null;
    this.giftCooldownTicks = 24 * 8;
    this.traits = normalizeTraits(DEFAULT_TRAITS);
    this.lastTraitTickAt = this.now();
    this.lastMoodPublishAt = this.now();
  }

  initialize({ settings, bounds, workArea, gifts = [], traits }) {
    this.settings = { ...this.settings, ...settings };
    this.environment.bounds = { ...bounds };
    this.environment.workArea = { ...workArea };
    this.jumpBaseY = bounds.y;
    this.giftDefinitions = gifts.map((gift) => ({ ...gift }));
    this.traits = normalizeTraits(traits || DEFAULT_TRAITS);
    this.lastTraitTickAt = this.now();
    this.lastMoodPublishAt = this.now();
    const staysIdle = this.settings.paused || this.settings.activityLevel === 'quiet';
    this.setMode('idle', staysIdle ? Number.MAX_SAFE_INTEGER : 80, 0);
  }

  applySettings(settings = {}) {
    const previousPaused = this.settings.paused;
    const previousActivity = this.settings.activityLevel;
    this.settings = { ...this.settings, ...settings };
    if (settings.cursorHuntEnabled === false) this.cancelHunt();
    if (!previousPaused && this.settings.paused) {
      this.cancelGiftPresentation();
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

  replaceTraits(value) {
    this.traits = normalizeTraits(value || DEFAULT_TRAITS);
    this.lastMoodPublishAt = this.now();
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
      if (this.guidingActive) {
        this.finishGuiding();
        return;
      }
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

  mutateTraits(event) {
    this.traits = applyTraitEvent(this.traits, event, Date.now());
    this.hooks.mood(this.traits);
  }

  tickTraits() {
    const now = this.now();
    const seconds = Math.max(0, Math.min(2, (now - this.lastTraitTickAt) / 1000));
    this.lastTraitTickAt = now;
    if (seconds <= 0) return;
    this.traits = driftTraits(this.traits, {
      seconds,
      sleeping: this.sleeping,
      secondsSinceInteraction: Math.max(0, (now - this.lastInteractionTime) / 1000)
    });
    if (now - this.lastMoodPublishAt >= 10_000) {
      this.lastMoodPublishAt = now;
      this.hooks.mood(this.traits);
    }
  }

  decorated(base, event) {
    return decorateSpeech(base, event, this.traits);
  }

  speak(base, event, duration, onlyWithEmoji = false) {
    const result = this.decorated(base, event);
    if (!onlyWithEmoji || result.usedEmoji) this.hooks.speech(result.text, duration);
  }

  trigger(action) {
    if (action === 'wave') this.triggerWave();
    else if (action === 'proud') this.triggerProud();
    else if (action === 'jump') this.triggerJump();
    else if (action === 'hiss') this.triggerHiss();
    else if (action === 'toggleSleep') this.toggleSleep();
    else if (action === 'gift') this.triggerGiftDiscovery();
  }

  triggerWave() {
    this.noteInteraction();
    this.mutateTraits('friendly');
    this.cancelGiftPresentation();
    this.startWave();
  }

  startWave() {
    this.cancelHunt();
    this.mutateTraits('wave');
    this.setMode('waving', 90, 2);
    this.speak('多涅。', 'wave', 1800, true);
  }

  triggerProud() {
    this.noteInteraction();
    this.cancelGiftPresentation();
    this.startProud();
  }

  startProud(event = 'proud') {
    this.cancelHunt();
    this.mutateTraits('showOff');
    this.setMode('proud', 90, 2);
    this.speak('多涅多涅~', event, 1800);
  }

  triggerJump() {
    this.noteInteraction();
    this.cancelGiftPresentation();
    this.startJump();
  }

  startJump() {
    this.cancelHunt();
    this.mutateTraits('jump');
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
    this.mutateTraits('irritated');
    this.cancelGiftPresentation();
    this.startHiss(2);
  }

  startHiss(loops = 2, event = 'hiss') {
    this.hooks.record('hisses');
    this.cancelHunt();
    this.mutateTraits('hiss');
    if (this.mode === 'hissing') this.moveTo(this.hissBaseX, this.environment.bounds.y);
    this.hissBaseX = this.environment.bounds.x;
    this.hissTick = 0;
    this.setMode('hissing', 90, loops);
    this.speak('哈?~~', event, Math.max(2000, loops * 1000));
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
    this.cancelTsunderePose();
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
    if (clickCount >= 3) {
      this.mutateTraits('repeatedPoke');
      this.startDodgeFrom(this.environment.cursor);
    } else if (clickCount === 2) {
      this.mutateTraits('irritated');
      this.startHiss(2, 'hiss');
    } else this.triggerWave();
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
    this.tickTraits();
    if (this.pointerHeld && !this.dragging && this.now() - this.pressStartedAt >= LONG_PRESS_MS) {
      this.beginDrag();
    }
    if (this.dragging) return this.tickDrag();
    if (this.dropping) return this.tickDrop();
    if (this.giftCooldownTicks > 0) this.giftCooldownTicks -= 1;
    if (this.huntCooldownTicks > 0) this.huntCooldownTicks -= 1;
    if (this.guideCooldownTicks > 0) this.guideCooldownTicks -= 1;
    const cursorControlsIdle = this.updateCursorAttentionLock();
    if (!cursorControlsIdle) this.updateAutomaticSleep();
    if (this.sleeping) return this.tickSleeping();
    if (!this.giftActive && this.giftCooldownTicks <= 0 && !this.settings.paused &&
        !cursorControlsIdle && this.settings.activityLevel !== 'quiet' && this.mode === 'idle' &&
        Math.floor(Math.random() * 360) === 0) {
      this.startGiftDiscovery(this.randomGift());
    }
    if (this.giftActive) return this.tickGift();
    if (this.pettingTicks > 0) return this.tickPetting();
    if (this.guidingActive) return this.tickGuiding();
    this.updateMouseHunt();
    if (this.pettingTicks > 0) return this.tickPetting();
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

    if (!this.settings.paused && !transient(this.mode) && !(this.mode === 'idle' && cursorControlsIdle)) {
      this.phaseTicks -= 1;
      if (this.phaseTicks <= 0) this.chooseNextRoamPhase();
    }
  }

  beginDrag() {
    if (!this.pointerHeld || this.dragging) return;
    this.cancelHunt();
    this.cancelGiftPresentation();
    this.setMode('idle', 80, 0);
    this.sleeping = false;
    this.sleepRequested = false;
    this.dropping = false;
    this.dragging = true;
    this.mutateTraits('drag');
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
    this.startHiss(2, 'drag');
  }

  randomGift() {
    if (!this.giftDefinitions.length) return null;
    const totalWeight = this.giftDefinitions.reduce((sum, gift) => sum + Math.max(0, Number(gift.weight) || 0), 0);
    if (totalWeight <= 0) return this.giftDefinitions[0];
    let roll = Math.random() * totalWeight;
    for (const gift of this.giftDefinitions) {
      roll -= Math.max(0, Number(gift.weight) || 0);
      if (roll < 0) return gift;
    }
    return this.giftDefinitions[0];
  }

  triggerGiftDiscovery() {
    this.noteInteraction();
    this.startGiftDiscovery(this.randomGift());
  }

  startGiftDiscovery(gift) {
    if (!gift || this.dragging || this.dropping) return;
    this.cancelHunt();
    if (this.sleeping) this.wakeFromSleep();
    this.cancelGiftPresentation();
    this.setMode('review', Number.MAX_SAFE_INTEGER, 0);
    this.giftActive = true;
    this.giftTick = 0;
    this.giftReactionTicks = 0;
    this.giftUseAction = null;
    this.giftCooldownTicks = 24 * 240;
    this.mutateTraits('gift');
    this.hooks.gift({ type: 'show', gift });
    this.hooks.speech('多涅？', 1100);
  }

  receiveGift(identifier) {
    const gift = this.giftDefinitions.find((item) => item.id === identifier);
    if (!gift || this.dragging || this.dropping) return false;
    this.noteInteraction();
    this.cancelHunt();
    if (this.sleeping) this.wakeFromSleep();
    this.cancelGiftPresentation();
    this.setMode('review', Number.MAX_SAFE_INTEGER, 0);
    this.giftActive = true;
    this.giftTick = 0;
    this.giftReactionTicks = 0;
    this.giftUseAction = ({ screw: 'jump', gear: 'wave', feather: 'proud', ruby: 'proud' })[identifier] || 'proud';
    this.traits = applyGiftEffect(this.traits, identifier, this.now());
    this.lastMoodPublishAt = this.now();
    this.hooks.mood(this.traits);
    this.hooks.gift({ type: 'show', gift, record: false });
    this.hooks.speech('多涅？', 1100);
    return true;
  }

  giftTapped() {
    if (!this.giftActive) return;
    this.noteInteraction();
    this.hooks.record('interactions');
    this.giftReactionTicks = 32;
    this.mutateTraits('giftTapped');
    this.hooks.gift({ type: 'reaction' });
    this.speak('多涅！', 'giftTapped', 1700);
  }

  cancelGiftPresentation() {
    if (!this.giftActive) return;
    this.giftActive = false;
    this.giftTick = 0;
    this.giftReactionTicks = 0;
    this.giftUseAction = null;
    this.hooks.gift({ type: 'hide' });
  }

  tickGift() {
    this.giftTick += 1;
    if (this.giftReactionTicks > 0) {
      this.giftReactionTicks -= 1;
      this.hooks.render({ kind: 'sheet', row: ROWS.hissing, column: Math.floor(this.giftTick / 3) % 8 });
    } else if (this.giftTick < 27) {
      this.hooks.render({ kind: 'sheet', row: ROWS.review, column: Math.floor(this.giftTick / 5) % 6 });
    } else {
      if (this.giftUseAction === 'jump') {
        this.hooks.render({ kind: 'sheet', row: ROWS.jumping,
          column: Math.floor(this.giftTick / 4) % FRAME_COUNTS.jumping });
      } else if (this.giftUseAction === 'wave') {
        this.hooks.render({ kind: 'sheet', row: ROWS.waving,
          column: Math.floor(this.giftTick / 5) % FRAME_COUNTS.waving });
      } else {
        this.hooks.render({ kind: 'proud', column: Math.floor(this.giftTick / 5) % 6 });
      }
      if (this.giftTick === 27) this.speak('多涅。🎁', 'giftProud', 2000);
    }
    if (this.giftTick < 144) return;
    this.cancelGiftPresentation();
    this.startTimedIdle();
  }

  updateAutomaticSleep() {
    if (this.sleeping || this.sleepRequested) return;
    if (this.now() - this.lastInteractionTime < 60_000) return;
    this.sleepRequested = true;
    if (this.mode === 'idle') this.startSleeping();
  }

  updateCursorAttentionLock() {
    if (this.mode !== 'idle' || this.pointerHeld || this.dragging || this.dropping) {
      this.cursorAttentionLocked = false;
      return false;
    }
    const pointerDistance = distance(this.environment.cursor, this.center());
    const acquireRadius = this.environment.bounds.width * 1.8;
    const releaseRadius = this.environment.bounds.width * 2.0;
    this.cursorAttentionLocked = pointerDistance <=
      (this.cursorAttentionLocked ? releaseRadius : acquireRadius);
    if (this.cursorAttentionLocked) {
      this.lastInteractionTime = this.now();
      this.sleepRequested = false;
    }
    return this.cursorAttentionLocked;
  }

  tickSleeping() {
    this.frameClock += 1;
    if (this.frameClock >= 2) {
      this.frameClock = 0;
      this.frameIndex = (this.frameIndex + 1) % FRAME_COUNTS.sleeping;
      this.hooks.render({ kind: 'sleep', column: this.frameIndex });
    }
    const pointerDistance = distance(this.environment.cursor, this.center());
    const radius = this.sleepWakeRadius();
    if (!this.wakeProximityArmed) {
      if (pointerDistance > radius) this.wakeProximityArmed = true;
      return;
    }
    if (pointerDistance <= radius) {
      this.wakeHoverTicks += 1;
      if (this.wakeHoverTicks >= 4) {
        this.lastInteractionTime = this.now();
        this.wakeFromSleep();
      }
    } else {
      this.wakeHoverTicks = 0;
    }
  }

  tickIntervalMs() { return this.sleeping ? SLEEP_TICK_MS : TICK_MS; }

  updateMouseHunt() {
    const pointer = this.environment.cursor;
    if (!this.lastPointer) {
      this.lastPointer = { ...pointer };
      this.lastPointerDistance = distance(pointer, this.center());
      return;
    }
    const delta = { x: pointer.x - this.lastPointer.x, y: pointer.y - this.lastPointer.y };
    const speed = Math.hypot(delta.x, delta.y);
    const dot = delta.x * this.lastPointerDelta.x + delta.y * this.lastPointerDelta.y;
    const pointerDistance = distance(pointer, this.center());
    const previousPointerDistance = this.lastPointerDistance;
    this.lastPointer = { ...pointer };
    this.lastPointerDelta = delta;
    this.lastPointerDistance = pointerDistance;
    const pettingCaptured = this.turnAwayTicks <= 0 && this.glanceBackTicks <= 0 &&
      this.updatePetting(pointer, speed);
    const guideCaptured = !pettingCaptured &&
      this.updateSlowGuide(pointer, delta, speed, pointerDistance, previousPointerDistance);
    if (!pettingCaptured && !guideCaptured) {
      this.updateTsundereInteraction(pointer, speed, pointerDistance, previousPointerDistance);
    }

    if (pettingCaptured) {
      this.guideScore = 0;
      this.guideLeadTravel = 0;
      this.lureScore = Math.max(0, this.lureScore - 0.5);
      return;
    }

    if (guideCaptured) {
      this.lureScore = Math.max(0, this.lureScore - 0.5);
      return;
    }

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
      this.lureScore = 0;
      if (Math.random() <= huntWillingness(this.traits)) {
        this.noteInteraction();
        this.beginHunt(pointer);
      } else {
        this.huntCooldownTicks = 48;
        if (this.traits.temper >= 70 && Math.random() < 0.25) this.startHiss(2, 'hiss');
      }
    }
  }

  updateSlowGuide(pointer, delta, speed, pointerDistance, previousPointerDistance) {
    if (this.guidingActive) return true;
    if (this.guideCooldownTicks > 0 || this.mode !== 'idle' || this.settings.paused || this.pointerHeld ||
        this.turnAwayTicks > 0 || this.glanceBackTicks > 0 || this.huntAnticipationTicks > 0 || this.pounceActive) {
      this.guideScore = Math.max(0, this.guideScore - 0.8);
      this.guideLeadTravel = 0;
      return false;
    }
    const width = this.environment.bounds.width;
    const center = this.center();
    const direction = Math.sign(delta.x);
    const pointerLeads = direction !== 0 && (pointer.x - center.x) * direction > width * 0.38;
    const gentle = speed >= 0.7 && speed <= 7.5;
    const horizontal = Math.abs(delta.x) >= Math.max(0.55, Math.abs(delta.y) * 1.35);
    const usefulRange = pointerDistance > width * 0.62 && pointerDistance < width * 1.8;
    // Moving inward is reserved for the tsundere turn-away gesture. Guiding
    // only accumulates when the pointer is clearly leading away from her.
    const movingAway = previousPointerDistance !== null && pointerDistance - previousPointerDistance >= 0.35;
    const stableDirection = this.guideDirection === 0 || this.guideDirection === direction;
    const qualifies = pointerLeads && gentle && horizontal && usefulRange && movingAway && stableDirection;
    if (qualifies) {
      this.guideDirection = direction;
      this.guideScore += 1;
      this.guideLeadTravel += Math.abs(delta.x);
      this.phaseTicks = Math.max(this.phaseTicks, 72);
    } else {
      this.guideScore = Math.max(0, this.guideScore - 0.75);
      if (!stableDirection || speed > 9 || !usefulRange) {
        this.guideDirection = 0;
        this.guideLeadTravel = 0;
      }
    }
    if (this.guideScore < 16 || this.guideLeadTravel < 28 * this.settings.scale) return qualifies;

    const willingness = clamp(0.22 + 0.30 * (this.traits.vitality / 100) +
      0.25 * (this.traits.closeness / 100) + 0.10 * (this.traits.boredom / 100) -
      0.22 * (this.traits.temper / 100), 0.18, 0.90);
    this.guideScore = 0;
    this.guideLeadTravel = 0;
    if (Math.random() > willingness) {
      this.guideCooldownTicks = 72;
      this.speak('多涅。', 'turnAway', 1500);
      return true;
    }
    this.noteInteraction();
    this.hooks.record('interactions');
    this.cancelHunt();
    this.cancelTsunderePose();
    this.guidingActive = true;
    this.guidingTicks = 120;
    this.guidedPixels = 0;
    this.setMode(this.guideDirection > 0 ? 'walkRight' : 'walkLeft', 120, 0);
    return true;
  }

  finishGuiding() {
    if (!this.guidingActive) return;
    this.guidingActive = false;
    this.guideCooldownTicks = 48;
    this.hooks.record('guidedWalk', this.guidedPixels / Math.max(1, this.environment.bounds.width));
    this.guidedPixels = 0;
    this.guideDirection = 0;
    this.lastPointer = null;
    this.startTimedIdle();
  }

  tickGuiding() {
    const pointer = this.environment.cursor;
    const center = this.center();
    const width = this.environment.bounds.width;
    const horizontalGap = pointer.x - center.x;
    const verticalGap = Math.abs(pointer.y - center.y);
    const pointerStep = this.lastPointer ? distance(pointer, this.lastPointer) : 0;
    this.lastPointer = { ...pointer };
    this.guidingTicks -= 1;
    if (this.guidingTicks <= 0 || Math.abs(horizontalGap) < width * 0.42 ||
        Math.abs(horizontalGap) > width * 1.9 || verticalGap > this.environment.bounds.height * 1.15 ||
        pointerStep > 13) return this.finishGuiding();
    const desiredDirection = Math.sign(horizontalGap);
    if (desiredDirection !== this.guideDirection) return this.finishGuiding();
    const desiredMode = desiredDirection > 0 ? 'walkRight' : 'walkLeft';
    if (this.mode !== desiredMode) this.setMode(desiredMode, Math.max(1, this.guidingTicks), 0);
    const area = this.environment.workArea;
    const nextX = clamp(this.environment.bounds.x + 2.1 * this.settings.scale * desiredDirection,
      area.x, area.x + area.width - width);
    const moved = Math.abs(nextX - this.environment.bounds.x);
    if (moved < 0.1) return this.finishGuiding();
    this.moveTo(nextX, clamp(this.environment.bounds.y, area.y + 4,
      area.y + area.height - this.environment.bounds.height));
    this.guidedPixels += moved;
    this.frameClock += 1;
    if (this.frameClock >= 3) {
      this.frameClock = 0;
      this.frameIndex = (this.frameIndex + 1) % FRAME_COUNTS[this.mode];
    }
    this.hooks.render({ kind: 'sheet', row: ROWS[this.mode], column: this.frameIndex });
  }

  pointerInHeadZone(pointer) {
    const bounds = this.environment.bounds;
    const normalizedX = (pointer.x - bounds.x) / Math.max(1, bounds.width);
    const normalizedY = (pointer.y - bounds.y) / Math.max(1, bounds.height);
    const dx = (normalizedX - 0.36) / 0.34;
    const dy = (normalizedY - 0.43) / 0.28;
    return dx * dx + dy * dy <= 1;
  }

  updatePetting(pointer, speed) {
    if (this.mode !== 'idle' || this.settings.paused || this.pointerHeld) {
      this.pettingDwellTicks = 0;
      this.pettingTravel = 0;
      return false;
    }
    const inHeadZone = this.pointerInHeadZone(pointer);
    if (!inHeadZone) {
      this.pettingDwellTicks = 0;
      this.pettingTravel = 0;
      this.pettingRearmTravel = 0;
      this.pettingArmed = true;
      return false;
    }
    if (!this.pettingArmed) {
      if (speed >= 0.8) this.pettingRearmTravel += Math.min(speed, 12);
      if (this.pettingRearmTravel >= 16) {
        this.pettingArmed = true;
        this.pettingRearmTravel = 0;
        this.pettingDwellTicks = 0;
        this.pettingTravel = 0;
      }
      return true;
    }
    this.pettingDwellTicks += 1;
    this.pettingTravel += Math.min(speed, 12);
    const deliberateStroke = this.pettingDwellTicks >= 14 && this.pettingTravel >= 28;
    const calmHover = this.pettingDwellTicks >= 60;
    if (deliberateStroke || calmHover) this.triggerPettingResponse();
    return true;
  }

  triggerPettingResponse() {
    this.pettingDwellTicks = 0;
    this.pettingTravel = 0;
    this.pettingRearmTravel = 0;
    this.pettingArmed = false;
    this.noteInteraction();
    this.hooks.record('interactions');
    this.cancelHunt();
    this.cancelTsunderePose();
    const acceptance = clamp(0.25 + 0.55 * (this.traits.closeness / 100) -
      0.35 * (this.traits.temper / 100), 0.1, 0.85);
    const accepted = Math.random() < acceptance;
    this.hooks.record(accepted ? 'pettingAccepted' : 'pettingRejected');
    if (accepted) {
      this.mutateTraits('petted');
      this.pettingTicks = 54;
      this.speak('多涅多涅~', 'proud', 1900);
      return;
    }
    this.mutateTraits('irritated');
    if (Math.random() < this.traits.temper / 100) {
      this.startHiss(2, 'hiss');
    } else {
      this.setMode('waving', 90, 1);
      this.speak('多涅。', 'dodge', 1600);
    }
  }

  tickPetting() {
    const elapsed = 54 - this.pettingTicks + 1;
    this.pettingTicks -= 1;
    const envelope = Math.min(1, elapsed / 8, Math.max(0, this.pettingTicks) / 8);
    this.hooks.render({
      kind: 'petting',
      row: ROWS.idle,
      column: 3,
      envelope,
      breath: Math.sin(elapsed * 0.28),
      sway: Math.sin(elapsed * 0.34)
    });
    if (this.pettingTicks > 0) return;
    this.lastPointer = null;
    this.startTimedIdle();
  }

  beginHunt(pointer) {
    this.cancelTsunderePose();
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
      this.mutateTraits('caught');
      this.startProud('caught');
    } else {
      this.hooks.record('missed');
      this.mutateTraits('missed');
      this.startHiss(2, 'missed');
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

    const action = chooseWeighted(roamWeights(this.traits, this.settings.activityLevel));
    if (action === 'walkRight' || action === 'walkLeft') {
      this.mutateTraits('walk');
      this.setMode(action, randomBetween(72, 120), 0);
    } else if (action === 'wave') this.startWave();
    else if (action === 'jump') this.startJump();
    else this.startHiss(2, 'hiss');
  }

  startTimedIdle() {
    const ticks = this.settings.activityLevel === 'lively'
      ? randomBetween(36, 72)
      : randomBetween(72, 144);
    this.setMode('idle', ticks, 0);
  }

  setMode(mode, ticks, loops) {
    if (this.guidingActive && !['walkLeft', 'walkRight'].includes(mode)) {
      this.guidingActive = false;
      this.hooks.record('guidedWalk', this.guidedPixels / Math.max(1, this.environment.bounds.width));
      this.guidedPixels = 0;
      this.guideDirection = 0;
      this.guideCooldownTicks = 48;
    }
    if (this.mode === 'jumping' && mode !== 'jumping') this.moveTo(this.environment.bounds.x, this.jumpBaseY);
    if (this.mode === 'hissing' && mode !== 'hissing') this.moveTo(this.hissBaseX, this.environment.bounds.y);
    this.mode = mode;
    if (mode !== 'idle') {
      this.pettingTicks = 0;
      this.pettingDwellTicks = 0;
      this.pettingTravel = 0;
      this.cursorAttentionLocked = false;
      this.cancelTsunderePose();
    }
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
    if (this.turnAwayTicks > 0) {
      const elapsed = TURN_AWAY_TICKS - this.turnAwayTicks;
      const step = Math.min(8, Math.floor(elapsed / TURN_DIRECTION_FRAME_TICKS));
      this.renderLookDirectionIndex((this.turnAwayStartDirection + step) % 16);
      return;
    }
    if (this.glanceBackTicks > 0) {
      const elapsed = GLANCE_BACK_TICKS - this.glanceBackTicks;
      const step = Math.min(8, Math.floor(elapsed / TURN_DIRECTION_FRAME_TICKS));
      this.glanceBackTicks -= 1;
      this.renderLookDirectionIndex((this.turnAwayStartDirection + 8 - step + 16) % 16);
      return;
    }
    if (this.slowApproachScore > 0) {
      this.renderLookDirection(pointer, false);
      return;
    }
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

  renderLookDirection(pointer, opposite) {
    const center = this.center();
    const dx = pointer.x - center.x;
    const dyUp = center.y - pointer.y;
    let degrees = Math.atan2(dx, dyUp) * 180 / Math.PI;
    if (degrees < 0) degrees += 360;
    let direction = Math.round(degrees / 22.5) % 16;
    if (opposite) direction = (direction + 8) % 16;
    this.renderLookDirectionIndex(direction);
  }

  renderLookDirectionIndex(direction) {
    direction = (direction % 16 + 16) % 16;
    this.hooks.render({ kind: 'sheet', row: direction < 8 ? 9 : 10, column: direction < 8 ? direction : direction - 8 });
  }

  updateTsundereInteraction(pointer, speed, pointerDistance, previousPointerDistance) {
    const outerRadius = this.environment.bounds.width * 1.8;
    const innerRadius = this.environment.bounds.width * 0.55;
    if (this.turnAwayTicks > 0) {
      if (!this.pointerHeld && pointerDistance < innerRadius && speed < 8) {
        this.startDodgeFrom(pointer);
        return;
      }
      if (previousPointerDistance !== null && pointerDistance > outerRadius * 1.05 &&
          previousPointerDistance <= outerRadius * 1.05) {
        this.turnAwayTicks = 0;
        this.glanceBackTicks = GLANCE_BACK_TICKS;
        this.phaseTicks = Math.max(this.phaseTicks, GLANCE_BACK_TICKS);
        return;
      }
      this.turnAwayTicks -= 1;
      if (this.turnAwayTicks <= 0) {
        this.glanceBackTicks = GLANCE_BACK_TICKS;
        this.phaseTicks = Math.max(this.phaseTicks, GLANCE_BACK_TICKS);
      }
      return;
    }
    if (this.mode !== 'idle' || this.settings.paused || this.pointerHeld ||
        this.huntAnticipationTicks > 0 || this.pounceActive) {
      this.slowApproachScore = Math.max(0, this.slowApproachScore - 0.8);
      return;
    }
    const inRange = pointerDistance > innerRadius && pointerDistance < outerRadius;
    const approaching = previousPointerDistance !== null && previousPointerDistance - pointerDistance > 0.1 &&
      speed >= 0.25 && speed < 8;
    const hovering = pointerDistance < outerRadius * 0.78 && speed < 1.25;
    if (inRange && approaching) this.slowApproachScore += 1;
    else if (inRange && hovering && this.slowApproachScore >= 3) this.slowApproachScore += 0.45;
    else this.slowApproachScore = Math.max(0, this.slowApproachScore - 0.6);

    // Keep her attention on a deliberate slow approach instead of allowing
    // the ordinary idle countdown to start another roaming action midway.
    if (this.slowApproachScore > 0) this.phaseTicks = Math.max(this.phaseTicks, TURN_AWAY_TICKS);

    const threshold = 15 - 4 * (this.traits.pride / 100) - 2 * (this.traits.temper / 100);
    if (this.slowApproachScore < threshold) return;
    this.slowApproachScore = 0;
    this.turnAwayTicks = TURN_AWAY_TICKS;
    const center = this.center();
    let degrees = Math.atan2(pointer.x - center.x, center.y - pointer.y) * 180 / Math.PI;
    if (degrees < 0) degrees += 360;
    this.turnAwayStartDirection = Math.round(degrees / 22.5) % 16;
    this.phaseTicks = Math.max(this.phaseTicks, TURN_AWAY_TICKS);
    this.speak('多涅。', 'turnAway', 1800);
  }

  startDodgeFrom(pointer) {
    const center = this.center();
    const area = this.environment.workArea;
    const leftSpace = this.environment.bounds.x - area.x;
    const rightSpace = area.x + area.width - (this.environment.bounds.x + this.environment.bounds.width);
    const minimumSpace = this.environment.bounds.width * 0.65;
    let mode = pointer.x < center.x ? 'walkRight' : 'walkLeft';
    if (mode === 'walkLeft' && leftSpace < minimumSpace && rightSpace > leftSpace) mode = 'walkRight';
    if (mode === 'walkRight' && rightSpace < minimumSpace && leftSpace > rightSpace) mode = 'walkLeft';
    const ticks = Math.round(52 - 20 * (this.traits.closeness / 100));
    this.cancelHunt();
    this.cancelTsunderePose();
    this.setMode(mode, ticks, 0);
    this.speak('多涅。', 'dodge', 1600);
  }

  cancelTsunderePose() {
    this.slowApproachScore = 0;
    this.turnAwayTicks = 0;
    this.glanceBackTicks = 0;
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
