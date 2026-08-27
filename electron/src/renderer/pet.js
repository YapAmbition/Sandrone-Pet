import { PetEngine, TICK_MS } from './engine.mjs';

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
  if (frame.kind === 'sheet' && atlas.spritesheet) {
    context.drawImage(atlas.spritesheet, frame.column * 192, frame.row * 208, 192, 208, 0, 0, 192, 208);
  } else if (frame.kind === 'proud' && atlas.proud[frame.column]) {
    context.drawImage(atlas.proud[frame.column], 0, 0, 192, 208);
  } else if (frame.kind === 'sleep' && atlas.sleep[frame.column]) {
    context.drawImage(atlas.sleep[frame.column], 0, 0, 192, 208);
  } else if (frame.kind === 'drag' && atlas.drag[frame.column]) {
    const ease = 1 - Math.pow(1 - frame.progress, 3);
    const dropping = frame.phase === 'dropping';
    const lift = dropping ? 1 - ease : ease;
    const y = 10 - 12 * lift + (frame.phase === 'held' ? frame.sway * 1.5 : 0);
    const scaleX = dropping ? 1 + Math.sin(frame.progress * Math.PI) * 0.035 : 0.96 + 0.04 * lift;
    const scaleY = dropping ? 1 - Math.sin(frame.progress * Math.PI) * 0.055 : 0.96 + 0.04 * lift;
    const rotation = frame.phase === 'held' ? frame.sway * 0.018 : 0;
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
  record: (metric) => window.petAPI.record(metric),
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
  else if (command.type === 'settings') engine.applySettings(command.value);
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
  setInterval(() => engine.tick(), TICK_MS);
}

start().catch((error) => console.error('Unable to start pet renderer', error));
