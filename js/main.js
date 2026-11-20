// =====================================================================
//  MAIN.JS — starts everything: renderer, map, menus, matchmaking, loop.
// =====================================================================
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { store, makeCode, clamp } from './util.js';
import { makeTextures } from './textures.js';
import { GameMap } from './map.js';
import { NavGrid } from './nav.js';
import { Input, isTouchDevice } from './input.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Game } from './game.js';
import { NetHost, NetClient, probePublicServers, publicId, privateId, netAvailable, LOCAL_MODE } from './net.js';

const $ = (id) => document.getElementById(id);
let game = null; // the current match (null while in the menu)

// ---------------- settings ----------------
const DEFAULTS = {
  name: 'Player' + Math.floor(Math.random() * 900 + 100),
  touchSens: CONFIG.CONTROLS.TOUCH_SENS * 1000, // shown as 1..20
  mouseSens: CONFIG.CONTROLS.MOUSE_SENS * 1000,
  fov: CONFIG.GRAPHICS.FOV,
  volume: 0.8,
  quality: isTouchDevice() ? 'medium' : 'high',
  invert: false,
  fps: false,
};
const settings = { ...DEFAULTS, ...store.get('killermystery-settings', {}) };
const saveSettings = () => store.set('killermystery-settings', settings);

// ---------------- renderer / scene ----------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x8fbbe8);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb8cde0, 40, 140);
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 400);
scene.add(camera);

const textures = makeTextures(renderer);
const map = new GameMap();
scene.add(map.build(textures));
const nav = new NavGrid(map);

// lights: soft sky light + sun (no shadows = fast on phones)
scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x6a5a48, 1.6));
const sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
sun.position.set(30, 60, 20);
scene.add(sun);
// sky dome
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.MeshBasicMaterial({ map: textures.sky, side: THREE.BackSide, fog: false }));
  sky.position.set(map.worldW / 2, 0, map.worldD / 2);
  scene.add(sky);
}

function applyGraphics() {
  const q = settings.quality;
  const maxPR = q === 'low' ? 0.75 : q === 'medium' ? 1.0 : CONFIG.GRAPHICS.MAX_PIXEL_RATIO;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPR));
  scene.fog.far = q === 'low' ? 90 : 140;
  camera.far = q === 'low' ? 160 : 400;
  camera.fov = settings.fov;
  resize();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  checkRotate();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------------- UI / input ----------------
const ui = new UI();
ui.setTouch(isTouchDevice());
const input = new Input({ touchRoot: $('touch'), canvas, joyBase: $('joy-base'), joyKnob: $('joy-knob') });
function applyInputSettings() {
  input.touchSens = settings.touchSens / 1000;
  input.mouseSens = settings.mouseSens / 1000;
  input.invertY = settings.invert;
  Audio.setVolume(settings.volume);
  $('fps').classList.toggle('hidden', !settings.fps);
}
applyGraphics();
applyInputSettings();
$('version').textContent = `v${CONFIG.VERSION}${LOCAL_MODE ? ' · LOCAL TEST NETWORK' : ''}`;

let rotateDismissed = false;
function checkRotate() {
  const portrait = window.innerHeight > window.innerWidth;
  $('rotate').classList.toggle('hidden', !(game && ui.isTouch && portrait && !rotateDismissed));
}
$('rotate-ok').onclick = () => { rotateDismissed = true; checkRotate(); };

// ---------------- menu wiring ----------------
const nameInput = $('name-input');
nameInput.value = settings.name;
nameInput.addEventListener('change', () => {
  settings.name = nameInput.value.trim().slice(0, 20) || DEFAULTS.name;
  nameInput.value = settings.name;
  saveSettings();
});
const myName = () => (nameInput.value.trim().slice(0, 20) || settings.name);

document.addEventListener('pointerdown', () => Audio.unlock(), { capture: true });
document.addEventListener('touchstart', () => Audio.unlock(), { capture: true, passive: true });

$('btn-quick').onclick = () => quickPlay();
$('btn-browser').onclick = () => { ui.show('browser'); refreshBrowser(); };
$('btn-private').onclick = () => ui.show('private');
$('btn-offline').onclick = () => startGame('offline', null, { serverLabel: 'Offline' });
$('btn-settings').onclick = () => { fillSettings(); ui.show('settings'); };
$('btn-help').onclick = () => ui.show('help');
$('btn-help-back').onclick = () => ui.show('menu');
$('btn-browser-back').onclick = () => ui.show('menu');
$('btn-refresh').onclick = () => refreshBrowser();
$('btn-private-back').onclick = () => ui.show('menu');
$('btn-create-private').onclick = () => createPrivate();
$('btn-join-private').onclick = () => joinPrivate($('code-input').value);
$('code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinPrivate($('code-input').value); });
$('btn-return').onclick = () => ui.show('menu');

// settings screen
const S_FIELDS = [
  ['s-touch', 'touchSens', 'v-touch', (v) => v.toFixed(1)],
  ['s-mouse', 'mouseSens', 'v-mouse', (v) => v.toFixed(1)],
  ['s-fov', 'fov', 'v-fov', (v) => `${v}°`],
  ['s-vol', 'volume', 'v-vol', (v) => `${Math.round(v * 100)}%`],
];
function fillSettings() {
  for (const [id, key, lab, fmt] of S_FIELDS) { $(id).value = settings[key]; $(lab).textContent = fmt(+settings[key]); }
  $('s-quality').value = settings.quality;
  $('s-invert').checked = settings.invert;
  $('s-fps').checked = settings.fps;
}
for (const [id, key, lab, fmt] of S_FIELDS) {
  $(id).addEventListener('input', () => {
    settings[key] = +$(id).value; $(lab).textContent = fmt(settings[key]);
    applyInputSettings(); applyGraphics(); saveSettings();
  });
}
$('s-quality').onchange = () => { settings.quality = $('s-quality').value; applyGraphics(); saveSettings(); };
$('s-invert').onchange = () => { settings.invert = $('s-invert').checked; applyInputSettings(); saveSettings(); };
$('s-fps').onchange = () => { settings.fps = $('s-fps').checked; applyInputSettings(); saveSettings(); };
$('btn-settings-back').onclick = () => ui.show('menu');

// X button: in game -> die/spectate -> menu. In menu -> leave the game.
$('xbtn').addEventListener('click', (e) => {
  e.preventDefault();
  if (game) { input.press('x'); return; }
  leaveWholeGame();
});
function leaveWholeGame() {
  ui.show('left');
  try { window.close(); } catch { /* browsers only allow this for script-opened tabs */ }
}

// ---------------- matchmaking ----------------
let cancelToken = 0;
function failToMenu(msg) {
  ui.show('menu');
  ui.notice(msg);
}

function requireNet() {
  if (netAvailable()) return true;
  failToMenu('Online play could not load (no internet?). You can still Play Offline with bots.');
  return false;
}

async function hostServer(peerId, label, code) {
  const net = await NetHost.create(peerId);
  startGame('host', net, { serverLabel: label, code });
}

async function joinServer(hostId) {
  const net = await NetClient.connect(hostId);
  const welcome = await new Promise((resolve, reject) => {
    const done = (fn, v) => { clearTimeout(t); net.off('message', onMsg); net.off('close', onClose); fn(v); };
    const onMsg = (m) => {
      if (m.t === 'welcome') done(resolve, m);
      else if (m.t === 'reject') done(reject, { type: 'full', message: m.reason || 'Server is full' });
    };
    const onClose = () => done(reject, { type: 'closed', message: 'The server closed the connection' });
    const t = setTimeout(() => done(reject, { type: 'timeout', message: 'The server did not answer' }), 8000);
    net.on('message', onMsg);
    net.on('close', onClose);
    net.send({ t: 'hello', name: myName() });
  }).catch((e) => { net.close(); throw e; });
  startGame('client', net, { welcome, serverLabel: welcome.server });
}

async function quickPlay() {
  if (!requireNet()) return;
  const token = ++cancelToken;
  ui.loading('Looking for public servers…', () => { cancelToken++; ui.show('menu'); });
  try {
    const results = await probePublicServers();
    if (token !== cancelToken) return;
    const open = results.filter((r) => r.info && r.info.humans < r.info.max)
      .sort((a, b) => b.info.humans - a.info.humans || Math.random() - 0.5);
    for (const r of open) {
      if (token !== cancelToken) return;
      ui.loading(`Joining ${r.info.name}…`, () => { cancelToken++; ui.show('menu'); });
      try { await joinServer(r.id); return; } catch (e) { console.warn('join failed', e); }
    }
    // nobody is playing: become the host of the first free slot
    const free = results.filter((r) => !r.info).map((r) => r.slot);
    for (const slot of free) {
      if (token !== cancelToken) return;
      ui.loading(`Starting Public Server #${slot}…`, () => { cancelToken++; ui.show('menu'); });
      try { await hostServer(publicId(slot), `Public Server #${slot}`, null); return; } catch (e) {
        if (e?.type === 'unavailable-id') { try { await joinServer(publicId(slot)); return; } catch { /* next */ } }
        else throw e;
      }
    }
    failToMenu('All public servers are full. Try again or create a private server.');
  } catch (e) {
    if (token !== cancelToken) return;
    console.warn(e);
    failToMenu(netErrorText(e));
  }
}

async function refreshBrowser() {
  if (!requireNet()) return;
  const list = $('server-list');
  list.innerHTML = '<div class="muted">Searching for servers…</div>';
  const rows = new Map();
  try {
    const results = await probePublicServers();
    list.innerHTML = '';
    for (const r of results) {
      const row = document.createElement('div');
      if (r.info) {
        const phase = { waiting: 'Waiting', pre: 'Starting', play: 'In round', post: 'Round over' }[r.info.phase] || '';
        row.className = 'srv';
        row.innerHTML = `<div><div class="name"></div><div class="meta">${r.info.humans} players · ${r.info.total - r.info.humans} bots · ${phase}</div></div>`;
        row.querySelector('.name').textContent = r.info.name;
        const b = document.createElement('button');
        b.className = 'btn small'; b.textContent = r.info.humans >= r.info.max ? 'Full' : 'Join';
        b.disabled = r.info.humans >= r.info.max;
        b.onclick = () => joinFromBrowser(r.id);
        row.appendChild(b);
      } else {
        row.className = 'srv empty';
        row.innerHTML = `<div><div class="name">Public Server #${r.slot} — empty</div><div class="meta">Start it and others can join</div></div>`;
        const b = document.createElement('button');
        b.className = 'btn small'; b.textContent = 'Host';
        b.onclick = () => hostFromBrowser(r.slot);
        row.appendChild(b);
      }
      rows.set(r.slot, row);
      list.appendChild(row);
    }
  } catch (e) {
    list.innerHTML = '';
    const d = document.createElement('div'); d.className = 'muted'; d.textContent = netErrorText(e);
    list.appendChild(d);
  }
}

async function joinFromBrowser(id) {
  const token = ++cancelToken;
  ui.loading('Joining server…', () => { cancelToken++; ui.show('browser'); });
  try { await joinServer(id); } catch (e) { if (token === cancelToken) { failToMenu(netErrorText(e)); } }
}
async function hostFromBrowser(slot) {
  const token = ++cancelToken;
  ui.loading(`Starting Public Server #${slot}…`, () => { cancelToken++; ui.show('browser'); });
  try { await hostServer(publicId(slot), `Public Server #${slot}`, null); }
  catch (e) {
    if (token !== cancelToken) return;
    if (e?.type === 'unavailable-id') { try { await joinServer(publicId(slot)); return; } catch (e2) { failToMenu(netErrorText(e2)); return; } }
    failToMenu(netErrorText(e));
  }
}

async function createPrivate() {
  if (!requireNet()) return;
  const token = ++cancelToken;
  ui.loading('Creating private server…', () => { cancelToken++; ui.show('private'); });
  for (let i = 0; i < 4; i++) {
    const code = makeCode(5);
    try { await hostServer(privateId(code), 'Private Server', code); return; } catch (e) {
      if (token !== cancelToken) return;
      if (e?.type !== 'unavailable-id') { failToMenu(netErrorText(e)); return; }
    }
  }
  failToMenu('Could not create a server, try again.');
}

async function joinPrivate(code) {
  code = String(code || '').trim().toUpperCase();
  if (code.length < 4) { ui.notice('Type the 5-letter code first.'); ui.show('menu'); return; }
  if (!requireNet()) return;
  const token = ++cancelToken;
  ui.loading(`Joining ${code}…`, () => { cancelToken++; ui.show('private'); });
  try { await joinServer(privateId(code)); } catch (e) {
    if (token !== cancelToken) return;
    failToMenu(e?.type === 'unavailable' ? `No server with code ${code} was found.` : netErrorText(e));
  }
}

function netErrorText(e) {
  if (!e) return 'Something went wrong.';
  if (e.type === 'full') return e.message || 'That server is full.';
  if (e.type === 'unavailable') return e.message || 'Server not found.';
  if (e.type === 'timeout' || e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error')
    return 'Could not reach the online service. Check your internet, or Play Offline.';
  if (e.type === 'browser-incompatible') return 'This browser does not support online play (WebRTC).';
  return e.message || String(e.type || e);
}

// ---------------- the match ----------------

function startGame(mode, net, opts) {
  ui.notice('');
  Audio.unlock();
  game = new Game({
    mode, net, scene, camera, map, nav, textures, ui,
    myName: myName(),
    serverLabel: opts.serverLabel, code: opts.code, welcome: opts.welcome,
    onExit: (reason) => {
      game = null;
      input.setActive(false);
      ui.show('menu');
      if (reason) ui.notice(reason);
      checkRotate();
    },
  });
  ui.game = game;
  ui.show('game');
  input.setActive(true);
  if (ui.isTouch) {
    // go fullscreen + landscape on phones (ignored where unsupported)
    const el = document.documentElement;
    const fs = el.requestFullscreen || el.webkitRequestFullscreen;
    try {
      const p = fs?.call(el, { navigationUI: 'hide' });
      p?.then?.(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    } catch { /* */ }
    $('touch-hint').style.display = '';
    setTimeout(() => { $('touch-hint').style.display = 'none'; }, 8000);
  }
  checkRotate();
  if (mode === 'host' && opts.code) ui.toast(`Private server code: <b>${opts.code}</b> — share it with friends!`, '#fd6', 10);
  if (mode === 'host' && !opts.code) ui.toast('You are hosting this public server. Keep this tab open!', '#9ad', 7);
}

// If the host hides the tab, keep the server ticking (browsers pause requestAnimationFrame)
setInterval(() => {
  if (document.hidden && game && game.isHost) step(0.05, true);
}, 50);

// ---------------- main loop ----------------
let last = performance.now();
let menuT = 0;
let fpsAcc = 0, fpsN = 0;

function step(dt, background = false) {
  if (game) {
    const inp = background ? emptyInput() : input.read();
    game.update(dt, inp);
  }
}
const emptyInput = () => ({ fwd: 0, strafe: 0, run: false, jump: false, attack: false, attackHeld: false, equip: false, throw: false, next: false, x: false, score: false, scoreUp: false, lookDX: 0, lookDY: 0 });

function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  if (game) {
    step(dt);
  } else {
    // menu background: slow fly-through of the map
    menuT += dt;
    const c = map.center();
    const a = menuT * 0.05;
    camera.rotation.order = 'YXZ';
    camera.position.set(c.x + Math.cos(a) * 9, 3.2, c.z + Math.sin(a) * 9);
    camera.lookAt(c.x + Math.cos(a + 1.3) * 7, 2.6, c.z + Math.sin(a + 1.3) * 7);
    input.read();
  }
  renderer.render(scene, camera);
  if (settings.fps) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { $('fps').textContent = `${Math.round(fpsN / fpsAcc)} FPS`; fpsAcc = 0; fpsN = 0; }
  }
}

ui.show('menu');
resize();
requestAnimationFrame(frame);

// warn hosts before closing the tab
window.addEventListener('beforeunload', (e) => {
  if (game && game.isHost && game.net && game.net.conns && game.net.conns.size > 0) { e.preventDefault(); e.returnValue = ''; }
});

// debug handle (open the browser console and type GMM)
window.GMM = { get game() { return game; }, map, nav, CONFIG, startGame };
