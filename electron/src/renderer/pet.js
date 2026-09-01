import { PetEngine } from './engine.mjs';

const canvas = document.querySelector('#pet');
const context = canvas.getContext('2d', { alpha: true });
context.imageSmoothingEnabled = true;

const atlas = {
  spritesheet: null,
  proud: [],
  sleep: [],
  drag: []
};

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function renderFrame(frame) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (frame.kind === 'petting' && atlas.spritesheet) {
    const envelope = Math.max(0, Math.min(1, frame.envelope || 0));
    const breath = Number(frame.breath) || 0;
    const sway = Number(frame.sway) || 0;
    const scaleX = 1 + envelope * (0.018 + breath * 0.006);
    const scaleY = 1 - envelope * (0.014 - breath * 0.005);
    const y = envelope * (1.8 + breath * 1.2);
    context.save();
    context.translate(96, 104 + y);
    context.rotate(envelope * sway * 0.012);
    context.scale(scaleX, scaleY);
    context.drawImage(atlas.spritesheet, frame.column * 192, frame.row * 208, 192, 208,
      -96, -104, 192, 208);
    context.restore();
  } else if (frame.kind === 'sheet' && atlas.spritesheet) {
    context.drawImage(atlas.spritesheet, frame.column * 192, frame.row * 208, 192, 208, 0, 0, 192, 208);
  } else if (frame.kind === 'proud' && atlas.proud[frame.column]) {
    context.drawImage(atlas.proud[frame.column], 0, 0, 192, 208);
  } else if (frame.kind === 'sleep' && atlas.sleep[frame.column]) {
    context.drawImage(atlas.sleep[frame.column], 0, 0, 192, 208);
  } else if (frame.kind === 'drag' && atlas.drag[frame.column]) {
    const ease = 1 - Math.pow(1 - frame.progress, 3);
    const dropping = frame.phase === 'dropping';
    const lift = dropping ? 1 - ease : ease;
    const y = 2 - 30 * lift + (frame.phase === 'held' ? frame.sway * 1.5 : 0);
    const squash = dropping ? Math.sin(frame.progress * Math.PI) : 0;
    const baseScale = 1 - 0.14 * lift;
    const scaleX = baseScale + squash * 0.04;
    const scaleY = baseScale - squash * 0.055;
    const rotation = frame.phase === 'held' ? frame.sway * 0.018 : 0;
    context.save();
    context.globalAlpha = 0.26 * lift;
    context.fillStyle = '#2e2e2e';
    context.beginPath();
    context.ellipse(96, 191, 50 * (1 - 0.28 * lift), 6.5 * (1 - 0.28 * lift), 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.save();
    context.translate(96, 104 + y);
    context.rotate(rotation);
    context.scale(scaleX, scaleY);
    context.drawImage(atlas.drag[frame.column], -96, -104, 192, 208);
    context.restore();
  }
}

const engine = new PetEngine({
  render: renderFrame,
  moveTo: (x, y) => window.petAPI.moveTo(x, y),
  speech: (text, duration) => window.petAPI.showSpeech(text, duration),
  hideSpeech: () => window.petAPI.hideSpeech(),
  record: (metric, amount = 1) => window.petAPI.record(metric, amount),
  mood: (traits) => window.petAPI.saveMood(traits),
  gift: (presentation) => window.petAPI.gift(presentation),
  savePosition: () => window.petAPI.savePosition(),
  publish: (state) => window.petAPI.publishState(state)
});

let pointerStart = null;
let clickCount = 0;
let lastClickAt = 0;

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  pointerStart = { x: event.screenX, y: event.screenY };
  document.body.classList.add('dragging');
  engine.pointerDown(pointerStart);
});

canvas.addEventListener('pointermove', (event) => {
  if (!pointerStart || !(event.buttons & 1)) return;
  engine.pointerDrag(
    { x: event.screenX, y: event.screenY },
    { x: event.screenX - pointerStart.x, y: event.screenY - pointerStart.y }
  );
});

canvas.addEventListener('pointerup', (event) => {
  if (event.button !== 0 || !pointerStart) return;
  pointerStart = null;
  document.body.classList.remove('dragging');
  const now = performance.now();
  const nextClickCount = now - lastClickAt < 500 ? clickCount + 1 : 1;
  const consumed = engine.pointerUp(nextClickCount);
  if (consumed) {
    clickCount = 0;
    lastClickAt = 0;
  } else {
    clickCount = nextClickCount >= 3 ? 0 : nextClickCount;
    lastClickAt = now;
  }
});

canvas.addEventListener('pointercancel', () => {
  if (!pointerStart) return;
  pointerStart = null;
  document.body.classList.remove('dragging');
  engine.pointerCancel();
  clickCount = 0;
  lastClickAt = 0;
});

document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.petAPI.showContextMenu();
});

window.petAPI.onEnvironment((environment) => engine.updateEnvironment(environment));
window.petAPI.onMoveResult((result) => engine.confirmMove(result));
window.petAPI.onCommand((command) => {
  if (command.type === 'action') engine.trigger(command.value);
  else if (command.type === 'giftTap') engine.giftTapped();
  else if (command.type === 'giveGift') engine.receiveGift(command.value);
  else if (command.type === 'settings') engine.applySettings(command.value);
  else if (command.type === 'traits') engine.replaceTraits(command.value);
  else if (command.type === 'visibility') engine.updateEnvironment({ visible: command.value });
  else if (command.type === 'interaction') engine.noteInteraction();
});

async function start() {
  const initial = await window.petAPI.ready();
  const [sheet, proud, sleep, drag] = await Promise.all([
    loadImage(initial.assets.spritesheet),
    Promise.all(initial.assets.proud.map(loadImage)),
    Promise.all(initial.assets.sleep.map(loadImage)),
    Promise.all(initial.assets.drag.map(loadImage))
  ]);
  atlas.spritesheet = sheet;
  atlas.proud = proud;
  atlas.sleep = sleep;
  atlas.drag = drag;
  engine.initialize(initial);
  window.petAPI.rendererReady();
  const scheduleTick = () => {
    engine.tick();
    setTimeout(scheduleTick, engine.tickIntervalMs());
  };
  setTimeout(scheduleTick, engine.tickIntervalMs());
}

start().catch((error) => console.error('Unable to start pet renderer', error));
