import { PetEngine, TICK_MS } from './engine.mjs';

const canvas = document.querySelector('#pet');
const context = canvas.getContext('2d', { alpha: true });
context.imageSmoothingEnabled = true;

const atlas = {
  spritesheet: null,
  proud: [],
  sleep: []
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
  const wasDrag = Math.hypot(event.screenX - pointerStart.x, event.screenY - pointerStart.y) > 3;
  pointerStart = null;
  document.body.classList.remove('dragging');
  const now = performance.now();
  clickCount = !wasDrag && now - lastClickAt < 500 ? clickCount + 1 : 1;
  lastClickAt = now;
  engine.pointerUp(wasDrag ? 0 : clickCount);
  if (!wasDrag && clickCount >= 3) clickCount = 0;
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
  const [sheet, proud, sleep] = await Promise.all([
    loadImage(initial.assets.spritesheet),
    Promise.all(initial.assets.proud.map(loadImage)),
    Promise.all(initial.assets.sleep.map(loadImage))
  ]);
  atlas.spritesheet = sheet;
  atlas.proud = proud;
  atlas.sleep = sleep;
  engine.initialize(initial);
  window.petAPI.rendererReady();
  setInterval(() => engine.tick(), TICK_MS);
}

start().catch((error) => console.error('Unable to start pet renderer', error));
