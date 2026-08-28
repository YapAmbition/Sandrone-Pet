const { app, BrowserWindow, Menu, Tray, ipcMain, screen, nativeImage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { JsonStore } = require('./store.cjs');
const { PetStats } = require('./stats.cjs');
const { MovementAreaTracker } = require('./movement-area.cjs');
const { windowsLaunchExecutable } = require('./windows-paths.cjs');
const { GIFTS } = require('./gifts.cjs');
const SMOKE_TEST = process.env.HISSY_SMOKE_TEST === '1';

const CELL_WIDTH = 192;
const CELL_HEIGHT = 208;
const STANDARD_SCALE = 0.75;
const SPEECH_WIDTH = 190;
const SPEECH_HEIGHT = 68;
const MIN_SCALE = 0.5625;
const MAX_SCALE = 1.125;
const DEFAULTS = {
  scale: 0.75,
  visibilityMode: 'always',
  activityLevel: 'default',
  cursorHuntEnabled: true,
  paused: false,
  clickThrough: false,
  launchAtLogin: false,
  position: null,
  stats: null,
  seenGiftCount: 0
};

let store;
let stats;
let petWindow;
let speechWindow;
let giftWindow;
let statsWindow;
let helpWindow;
let tray;
let speechTimer;
let activeGift = null;
let environmentTimer;
let companionTimer;
let fullscreenHelper;
let fullscreenDetected = false;
let latestPetState = { sleeping: false, mode: 'idle' };
const smokeReady = new Set();
let rebuildTrayMenu = () => {};
const movementAreas = new MovementAreaTracker();

function appFile(...parts) { return path.join(__dirname, '..', ...parts); }
function preloadFile(name) { return appFile('preload', name); }
function rendererFile(name) { return appFile('renderer', name); }
function assetsPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.resolve(__dirname, '../../../Assets');
}
function assetUrl(relativePath) {
  return pathToFileURL(path.join(assetsPath(), relativePath)).href;
}

function validScale(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, number)) : 0.75;
}

function petSize() {
  const scale = validScale(store.get('scale'));
  return { width: Math.round(CELL_WIDTH * scale), height: Math.round(CELL_HEIGHT * scale) };
}

function clampBounds(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const area = movementAreas.areaFor(display);
  return {
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height))),
    width: bounds.width,
    height: bounds.height
  };
}

function defaultBounds() {
  const display = screen.getPrimaryDisplay();
  const area = movementAreas.areaFor(display);
  const size = petSize();
  return {
    x: Math.round(area.x + area.width - size.width - 18),
    y: Math.round(area.y + area.height - size.height - 8),
    ...size
  };
}

function restoreBounds() {
  const saved = store.get('position');
  const size = petSize();
  if (!saved || !Number.isFinite(saved.relativeX) || !Number.isFinite(saved.relativeY)) return defaultBounds();
  const displays = screen.getAllDisplays();
  const display = displays.find((item) => String(item.id) === String(saved.displayId)) || screen.getPrimaryDisplay();
  const area = movementAreas.areaFor(display);
  const availableWidth = Math.max(0, area.width - size.width);
  const availableHeight = Math.max(0, area.height - size.height);
  return clampBounds({
    x: area.x + Math.max(0, Math.min(1, saved.relativeX)) * availableWidth,
    y: area.y + Math.max(0, Math.min(1, saved.relativeY)) * availableHeight,
    ...size
  });
}

function savePosition() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = movementAreas.areaFor(display);
  const availableWidth = Math.max(0, area.width - bounds.width);
  const availableHeight = Math.max(0, area.height - bounds.height);
  store.set('position', {
    displayId: String(display.id),
    relativeX: availableWidth ? (bounds.x - area.x) / availableWidth : 0,
    relativeY: availableHeight ? (bounds.y - area.y) / availableHeight : 0
  });
}

function positionSpeechBubble() {
  if (!petWindow || !speechWindow || petWindow.isDestroyed() || speechWindow.isDestroyed()) return;
  const pet = petWindow.getBounds();
  const bubble = speechWindow.getBounds();
  const display = screen.getDisplayMatching(pet);
  const area = movementAreas.areaFor(display);
  let x = Math.round(pet.x + pet.width / 2 - bubble.width / 2);
  let y = Math.round(pet.y - bubble.height + 12);
  x = Math.max(area.x + 4, Math.min(x, area.x + area.width - bubble.width - 4));
  if (y < area.y + 4) y = Math.min(area.y + area.height - bubble.height - 4, pet.y + pet.height - 12);
  speechWindow.setPosition(x, y, false);
}

function positionGiftWindow() {
  if (!petWindow || !giftWindow || petWindow.isDestroyed() || giftWindow.isDestroyed()) return;
  const pet = petWindow.getBounds();
  const gift = giftWindow.getBounds();
  const area = movementAreas.areaFor(screen.getDisplayMatching(pet));
  const factor = validScale(store.get('scale')) / STANDARD_SCALE;
  const gap = Math.round(3.5 * factor);
  const rightX = pet.x + pet.width + gap;
  const leftX = pet.x - gift.width - gap;
  let x = rightX + gift.width <= area.x + area.width - 4 ? rightX : leftX;
  x = Math.max(area.x + 4, Math.min(x, area.x + area.width - gift.width - 4));
  let y = Math.round(pet.y + (pet.height - gift.height) * 0.42);
  y = Math.max(area.y + 4, Math.min(y, area.y + area.height - gift.height - 4));
  giftWindow.setPosition(x, y, false);
}

function resizeSpeechBubble() {
  if (!speechWindow || speechWindow.isDestroyed()) return;
  const factor = validScale(store.get('scale')) / STANDARD_SCALE;
  speechWindow.setSize(Math.round(SPEECH_WIDTH * factor), Math.round(SPEECH_HEIGHT * factor), false);
  speechWindow.webContents.setZoomFactor(factor);
  positionSpeechBubble();
}

function resizeGiftWindow() {
  if (!giftWindow || giftWindow.isDestroyed()) return;
  const factor = validScale(store.get('scale')) / STANDARD_SCALE;
  const side = Math.round(70 * factor);
  giftWindow.setSize(side, side, false);
  giftWindow.webContents.setZoomFactor(factor);
  positionGiftWindow();
}

function sendToPet(channel, value) {
  if (petWindow && !petWindow.isDestroyed() && !petWindow.webContents.isLoading()) {
    petWindow.webContents.send(channel, value);
  }
}

function command(type, value) { sendToPet('pet:command', { type, value }); }

function createSpeechWindow() {
  const factor = validScale(store.get('scale')) / STANDARD_SCALE;
  speechWindow = new BrowserWindow({
    width: Math.round(SPEECH_WIDTH * factor),
    height: Math.round(SPEECH_HEIGHT * factor),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    show: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: preloadFile('speech-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: factor
    }
  });
  speechWindow.setIgnoreMouseEvents(true);
  speechWindow.setAlwaysOnTop(true, 'pop-up-menu');
  speechWindow.loadFile(rendererFile('speech.html'));
  speechWindow.on('closed', () => { speechWindow = null; });
}

function createGiftWindow() {
  const factor = validScale(store.get('scale')) / STANDARD_SCALE;
  const side = Math.round(70 * factor);
  giftWindow = new BrowserWindow({
    width: side,
    height: side,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: preloadFile('gift-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: factor
    }
  });
  giftWindow.setMenuBarVisibility(false);
  giftWindow.setAlwaysOnTop(true, 'pop-up-menu');
  giftWindow.loadFile(rendererFile('gift.html'));
  giftWindow.on('closed', () => { giftWindow = null; activeGift = null; });
}

function sendGiftPresentation(presentation) {
  if (!giftWindow || giftWindow.isDestroyed()) return;
  const deliver = () => {
    if (giftWindow && !giftWindow.isDestroyed()) giftWindow.webContents.send('gift:presentation', presentation);
  };
  if (giftWindow.webContents.isLoading()) giftWindow.webContents.once('did-finish-load', deliver);
  else deliver();
}

function showActiveGiftWindow() {
  if (!activeGift || !giftWindow || giftWindow.isDestroyed()) return;
  positionGiftWindow();
  sendGiftPresentation({
    type: 'show',
    name: activeGift.name,
    imageUrl: assetUrl(`Gifts/${activeGift.asset}`)
  });
  giftWindow.showInactive();
}

function handleGiftPresentation(presentation) {
  if (presentation?.type === 'show') {
    const gift = GIFTS.find((item) => item.id === presentation.gift?.id);
    if (!gift) return;
    activeGift = gift;
    stats.recordGift(gift.id);
    statsWindow?.webContents.send('stats:changed');
    resizeGiftWindow();
    positionGiftWindow();
    if (petWindow?.isVisible()) showActiveGiftWindow();
    return;
  }
  if (presentation?.type === 'reaction' && activeGift) {
    sendGiftPresentation({ type: 'reaction' });
    return;
  }
  activeGift = null;
  sendGiftPresentation({ type: 'hide' });
  giftWindow?.hide();
}

function showSpeech(text, duration) {
  if (!speechWindow || speechWindow.isDestroyed()) return;
  clearTimeout(speechTimer);
  positionSpeechBubble();
  speechWindow.webContents.send('speech:text', String(text || ''));
  if (petWindow?.isVisible()) speechWindow.showInactive();
  speechTimer = setTimeout(() => speechWindow?.hide(), Math.max(300, Number(duration) || 1800));
}

function hideSpeech() {
  clearTimeout(speechTimer);
  speechWindow?.hide();
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    ...restoreBounds(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: preloadFile('pet-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  petWindow.setMenuBarVisibility(false);
  petWindow.setAlwaysOnTop(true, 'pop-up-menu');
  if (process.platform === 'darwin') petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.setIgnoreMouseEvents(Boolean(store.get('clickThrough')), { forward: true });
  petWindow.loadFile(rendererFile('pet.html'));
  petWindow.once('ready-to-show', () => {
    if (!SMOKE_TEST) applyVisibility();
  });
  petWindow.on('move', positionSpeechBubble);
  petWindow.on('move', positionGiftWindow);
  petWindow.on('closed', () => { petWindow = null; });
}

function resizePet(scale) {
  store.set('scale', validScale(scale));
  if (!petWindow || petWindow.isDestroyed()) return;
  const old = petWindow.getBounds();
  const size = petSize();
  const next = clampBounds({
    x: Math.round(old.x + old.width / 2 - size.width / 2),
    y: old.y + old.height - size.height,
    ...size
  });
  petWindow.setBounds(next, false);
  resizeSpeechBubble();
  resizeGiftWindow();
  savePosition();
  command('settings', settingsSnapshot());
}

function resetPosition() {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.setBounds(defaultBounds(), false);
  savePosition();
  command('interaction');
}

function settingsSnapshot() {
  const all = store.snapshot();
  return {
    scale: validScale(all.scale),
    visibilityMode: all.visibilityMode,
    activityLevel: all.activityLevel,
    cursorHuntEnabled: Boolean(all.cursorHuntEnabled),
    paused: Boolean(all.paused),
    clickThrough: Boolean(all.clickThrough),
    launchAtLogin: Boolean(all.launchAtLogin)
  };
}

function setSetting(key, value) {
  if (key === 'scale') return resizePet(value);
  const allowed = new Set(['visibilityMode', 'activityLevel', 'cursorHuntEnabled', 'paused', 'clickThrough', 'launchAtLogin']);
  if (!allowed.has(key)) return;
  store.set(key, value);
  if (key === 'clickThrough') petWindow?.setIgnoreMouseEvents(Boolean(value), { forward: true });
  if (key === 'launchAtLogin') {
    if (app.isPackaged && process.platform === 'win32') {
      app.setLoginItemSettings({
        openAtLogin: Boolean(value),
        path: windowsLaunchExecutable(process.execPath)
      });
    }
  }
  if (key === 'visibilityMode') applyVisibility();
  command('settings', settingsSnapshot());
  rebuildTrayMenu();
}

function applyVisibility() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const mode = store.get('visibilityMode');
  const shouldShow = mode === 'always' || (mode === 'fullscreen' && !fullscreenDetected);
  if (shouldShow) {
    petWindow.showInactive();
    if (activeGift) {
      showActiveGiftWindow();
    }
  } else {
    hideSpeech();
    giftWindow?.hide();
    petWindow.hide();
  }
  command('visibility', shouldShow);
}

function check(value, expected) { return value === expected; }

function visibilitySubmenu(settings) {
  return [
    { label: '始终显示', type: 'radio', checked: check(settings.visibilityMode, 'always'), click: () => setSetting('visibilityMode', 'always') },
    { label: '隐藏宠物', type: 'radio', checked: check(settings.visibilityMode, 'hidden'), click: () => setSetting('visibilityMode', 'hidden') },
    { label: '进入全屏后隐藏', type: 'radio', checked: check(settings.visibilityMode, 'fullscreen'), click: () => setSetting('visibilityMode', 'fullscreen') }
  ];
}

function activitySubmenu(settings) {
  return [
    { label: '默认', type: 'radio', checked: check(settings.activityLevel, 'default'), click: () => setSetting('activityLevel', 'default') },
    { label: '活泼', type: 'radio', checked: check(settings.activityLevel, 'lively'), click: () => setSetting('activityLevel', 'lively') },
    { label: '安静（不主动活动）', type: 'radio', checked: check(settings.activityLevel, 'quiet'), click: () => setSetting('activityLevel', 'quiet') }
  ];
}

function petContextMenuTemplate() {
  const settings = settingsSnapshot();
  return [
    { label: '得意一下', click: () => command('action', 'proud') },
    { label: '哈气！', click: () => command('action', 'hiss') },
    { label: '让她找找看', click: () => command('action', 'gift') },
    { label: latestPetState.sleeping ? '叫醒她' : '让她睡觉', click: () => command('action', 'toggleSleep') },
    { label: '回到屏幕右下角', click: resetPosition },
    { label: '宠物显示', submenu: visibilitySubmenu(settings) },
    { label: '活动性', submenu: activitySubmenu(settings) },
    { label: '多涅小记…', click: showStatsWindow },
    { label: '使用帮助…', click: showHelpWindow },
    { type: 'separator' },
    { label: '退出哈气桑多涅', click: () => app.quit() }
  ];
}

function commonMenuTemplate(includeQuit = true) {
  const settings = settingsSnapshot();
  const template = [
    { label: '挥爪', click: () => command('action', 'wave') },
    { label: '得意一下', click: () => command('action', 'proud') },
    { label: '跳一下', click: () => command('action', 'jump') },
    { label: '哈气！', click: () => command('action', 'hiss') },
    { label: '让她找找看', click: () => command('action', 'gift') },
    { label: latestPetState.sleeping ? '叫醒她' : '让她睡觉', click: () => command('action', 'toggleSleep') },
    { label: '多涅小记…', click: showStatsWindow },
    { type: 'separator' },
    { label: '自动扑向鼠标', type: 'checkbox', checked: settings.cursorHuntEnabled,
      click: (item) => setSetting('cursorHuntEnabled', item.checked) },
    { label: settings.paused ? '继续移动' : '暂停移动', click: () => setSetting('paused', !settings.paused) },
    { label: '鼠标点击穿透', type: 'checkbox', checked: settings.clickThrough,
      click: (item) => setSetting('clickThrough', item.checked) },
    {
      label: '宠物显示', submenu: visibilitySubmenu(settings)
    },
    {
      label: '活动性', submenu: activitySubmenu(settings)
    },
    {
      label: '宠物大小', submenu: [
        { label: '小 75%', type: 'radio', checked: settings.scale === 0.5625, click: () => resizePet(0.5625) },
        { label: '标准 100%', type: 'radio', checked: settings.scale === 0.75, click: () => resizePet(0.75) },
        { label: '大 125%', type: 'radio', checked: settings.scale === 0.9375, click: () => resizePet(0.9375) },
        { label: '超大 150%', type: 'radio', checked: settings.scale === 1.125, click: () => resizePet(1.125) }
      ]
    },
    { label: '回到屏幕右下角', click: resetPosition },
    { label: '登录时自动启动', type: 'checkbox', checked: settings.launchAtLogin,
      click: (item) => setSetting('launchAtLogin', item.checked) },
    { label: '使用帮助…', click: showHelpWindow }
  ];
  if (includeQuit) template.push({ type: 'separator' }, { label: '退出哈气桑多涅', click: () => app.quit() });
  return template;
}

function createTray() {
  const image = nativeImage.createFromPath(path.join(assetsPath(), 'AppIcon.png')).resize({ width: 20, height: 20 });
  tray = new Tray(image);
  tray.setToolTip('哈气桑多涅桌面宠物');
  rebuildTrayMenu = () => tray?.setContextMenu(Menu.buildFromTemplate(commonMenuTemplate(true)));
  rebuildTrayMenu();
}

function showStatsWindow() {
  if (statsWindow && !statsWindow.isDestroyed()) {
    statsWindow.show();
    statsWindow.focus();
    statsWindow.webContents.send('stats:changed');
    return;
  }
  statsWindow = new BrowserWindow({
    width: 520,
    height: 790,
    minWidth: 480,
    minHeight: 720,
    title: '多涅小记',
    backgroundColor: '#f7f7f8',
    webPreferences: {
      preload: preloadFile('stats-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  statsWindow.setMenuBarVisibility(false);
  statsWindow.loadFile(rendererFile('stats.html'));
  statsWindow.on('closed', () => { statsWindow = null; });
}

function showHelpWindow() {
  if (helpWindow && !helpWindow.isDestroyed()) {
    helpWindow.show();
    helpWindow.focus();
    return;
  }
  helpWindow = new BrowserWindow({
    width: 520,
    height: 650,
    title: '哈气桑多涅使用帮助',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  helpWindow.setMenuBarVisibility(false);
  helpWindow.loadFile(rendererFile('help.html'));
  helpWindow.on('closed', () => { helpWindow = null; });
}

function startEnvironmentFeed() {
  const pollEnvironment = () => {
    if (petWindow && !petWindow.isDestroyed()) {
      const bounds = petWindow.getBounds();
      const display = screen.getDisplayMatching(bounds);
      sendToPet('pet:environment', {
        cursor: screen.getCursorScreenPoint(),
        bounds,
        workArea: movementAreas.areaFor(display),
        visible: petWindow.isVisible()
      });
      if (activeGift) positionGiftWindow();
    }
    const delay = !petWindow?.isVisible() ? 500 : (latestPetState.sleeping ? 200 : 42);
    environmentTimer = setTimeout(pollEnvironment, delay);
  };
  pollEnvironment();
  companionTimer = setInterval(() => {
    if (petWindow?.isVisible()) {
      stats.add('companionSeconds', 1);
      statsWindow?.webContents.send('stats:changed');
    }
  }, 1000);
}

function startFullscreenMonitor() {
  if (process.platform !== 'win32') return;
  const helper = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'fullscreen-helper.exe')
    : path.resolve(__dirname, '../../bin/fullscreen-helper.exe');
  if (!fs.existsSync(helper)) {
    console.warn(`Fullscreen helper not found: ${helper}`);
    return;
  }
  fullscreenHelper = spawn(helper, [String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const handleHelperStopped = (error) => {
    if (error) console.warn(`Fullscreen helper unavailable: ${error.message}`);
    fullscreenHelper = null;
    if (fullscreenDetected) {
      fullscreenDetected = false;
      applyVisibility();
    }
  };
  let pending = '';
  fullscreenHelper.stdout.setEncoding('utf8');
  fullscreenHelper.stdout.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    for (const line of lines) {
      const next = line.trim() === '1';
      if (next !== fullscreenDetected) {
        fullscreenDetected = next;
        applyVisibility();
      }
    }
  });
  fullscreenHelper.on('error', handleHelperStopped);
  fullscreenHelper.on('exit', () => handleHelperStopped());
}

function registerIpc() {
  const markSmokeReady = (name) => {
    if (!SMOKE_TEST) return;
    smokeReady.add(name);
    if (smokeReady.has('pet') && smokeReady.has('gift') && smokeReady.has('stats')) {
      console.log('Electron pet, gift, and stats renderers smoke test passed.');
      app.exit(0);
    }
  };
  ipcMain.handle('pet:ready', () => ({
    assets: {
      spritesheet: assetUrl('spritesheet.png'),
      proud: Array.from({ length: 6 }, (_, index) => assetUrl(`Proud/proud-${index}.png`)),
      sleep: Array.from({ length: 6 }, (_, index) => assetUrl(`Sleep/sleep-${index}.png`)),
      drag: ['lift-1.png', 'lift-2.png', 'lift-3.png', 'lift-4.png', 'held.png']
        .map((name) => assetUrl(`Drag/${name}`))
    },
    gifts: GIFTS.map((gift) => ({ id: gift.id, weight: gift.weight })),
    traits: stats.snapshot().traits,
    settings: settingsSnapshot(),
    platform: process.platform,
    bounds: petWindow.getBounds(),
    workArea: movementAreas.areaFor(screen.getDisplayMatching(petWindow.getBounds()))
  }));
  ipcMain.on('pet:renderer-ready', () => {
    markSmokeReady('pet');
  });
  ipcMain.on('gift:renderer-ready', () => markSmokeReady('gift'));
  ipcMain.on('stats:renderer-ready', () => markSmokeReady('stats'));
  ipcMain.on('pet:move-to', (_event, point) => {
    if (!petWindow || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
    const current = petWindow.getBounds();
    const next = clampBounds({ ...current, x: point.x, y: point.y });
    petWindow.setPosition(next.x, next.y, false);
    sendToPet('pet:move-result', {
      requested: { x: point.x, y: point.y },
      actual: petWindow.getBounds()
    });
    positionSpeechBubble();
  });
  ipcMain.on('pet:save-position', savePosition);
  ipcMain.on('pet:state', (_event, state) => {
    latestPetState = { ...latestPetState, ...state };
    rebuildTrayMenu();
  });
  ipcMain.on('speech:show', (_event, payload) => showSpeech(payload?.text, payload?.duration));
  ipcMain.on('speech:hide', hideSpeech);
  ipcMain.on('gift:presentation', (_event, presentation) => handleGiftPresentation(presentation));
  ipcMain.on('gift:tapped', () => command('giftTap'));
  ipcMain.on('menu:context', () => Menu.buildFromTemplate(petContextMenuTemplate()).popup({ window: petWindow }));
  ipcMain.on('stats:record', (_event, metric) => {
    stats.add(metric, 1);
    statsWindow?.webContents.send('stats:changed');
  });
  ipcMain.on('mood:update', (_event, traits) => {
    stats.setTraits(traits);
    statsWindow?.webContents.send('stats:changed');
  });
  ipcMain.handle('stats:snapshot', () => ({
    ...stats.snapshot(),
    giftDefinitions: GIFTS.map((gift) => ({
      ...gift,
      imageUrl: assetUrl(`Gifts/${gift.asset}`)
    })),
    seenGiftCount: Number(store.get('seenGiftCount')) || 0
  }));
  ipcMain.on('stats:mark-gifts-seen', () => {
    const snapshot = stats.snapshot();
    const total = Object.values(snapshot.gifts.counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
    store.set('seenGiftCount', total);
  });
  ipcMain.handle('stats:reset', async () => {
    const result = await dialog.showMessageBox(statsWindow, {
      type: 'warning',
      buttons: ['取消', '清空'],
      defaultId: 0,
      cancelId: 0,
      message: '要清空多涅小记吗？',
      detail: '今天、累计记录、当前状态和小箱子收藏都会清空，此操作无法撤销。'
    });
    if (result.response !== 1) return false;
    stats.reset();
    store.set('seenGiftCount', 0);
    command('traits', stats.snapshot().traits);
    return true;
  });
}

if (!app.requestSingleInstanceLock()) app.quit();

app.on('second-instance', () => {
  if (petWindow && !petWindow.isVisible()) {
    setSetting('visibilityMode', 'always');
    petWindow.showInactive();
  }
});

app.whenReady().then(() => {
  app.setName('哈气桑多涅');
  if (process.platform === 'darwin') app.dock?.hide();
  store = new JsonStore(path.join(app.getPath('userData'), 'settings.json'), DEFAULTS);
  stats = new PetStats(store);
  screen.on('display-removed', (_event, display) => movementAreas.remove(display.id));
  registerIpc();
  createSpeechWindow();
  createGiftWindow();
  createPetWindow();
  if (SMOKE_TEST) {
    showStatsWindow();
    setTimeout(() => {
      console.error('Electron pet, gift, or stats renderer smoke test timed out.');
      app.exit(1);
    }, 12_000).unref();
  } else {
    createTray();
    startEnvironmentFeed();
    startFullscreenMonitor();
  }
  app.on('activate', () => petWindow?.showInactive());
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  savePosition();
  stats?.save();
  clearTimeout(environmentTimer);
  clearInterval(companionTimer);
  clearTimeout(speechTimer);
  giftWindow?.close();
  fullscreenHelper?.kill();
});
