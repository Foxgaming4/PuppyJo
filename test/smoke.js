/* Headless smoke test: mocks DOM/Canvas/WebAudio, boots the real game scripts,
 * drives frames through a full run to game-over, and exercises every screen and
 * meta system. Run: `node test/smoke.js` from the project root. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

/* ----------------------------- mocks ----------------------------- */
let perfNow = 1000;
const rafQueue = [];
const timers = [];

function ctxMock() {
  const grad = { addColorStop() {} };
  const store = {};
  return new Proxy(store, {
    get(t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
      if (p in t) return t[p];
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

function makeEl(tag) {
  const t = (tag || 'div').toLowerCase();
  const node = {
    tagName: t.toUpperCase(), children: [], dataset: {}, _q: {},
    className: '', textContent: '', innerHTML: '', value: '', checked: false, disabled: false, offsetWidth: 0,
    style: new Proxy({}, { get: (s, p) => (p === 'setProperty' ? (k, v) => { s[k] = v; } : s[p]), set: (s, p, v) => { s[p] = v; return true; } }),
    classList: { _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, f) { const on = f === undefined ? !this._s.has(c) : f; on ? this._s.add(c) : this._s.delete(c); return on; },
      contains(c) { return this._s.has(c); } },
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { cs.forEach((c) => this.children.push(c)); },
    prepend(c) { this.children.unshift(c); },
    querySelector(sel) { return (this._q[sel] || (this._q[sel] = makeEl('span'))); },
    querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    getBoundingClientRect() { return { width: 800, height: 600, left: 0, top: 0 }; },
    remove() {}, focus() {}, contains2() {},
    onclick: null, oninput: null, onchange: null,
  };
  if (t === 'canvas') { node.getContext = () => ctxMock(); node.width = 0; node.height = 0; node.clientWidth = 96; node.clientHeight = 96; }
  return node;
}

const elCache = {};
function cachedEl(key) { return (elCache[key] || (elCache[key] = makeEl('div'))); }

const documentMock = {
  readyState: 'complete', hidden: false,
  getElementById(id) { if (id === 'game') { const c = cachedEl('#game'); c.getContext = () => ctxMock(); c.clientWidth = 800; c.clientHeight = 600; return c; } return cachedEl('#' + id); },
  querySelector(sel) { const c = cachedEl(sel); if (sel === '#game') c.getContext = () => ctxMock(); return c; },
  querySelectorAll() { return []; },
  createElement(tag) { return makeEl(tag); },
  addEventListener() {}, removeEventListener() {},
  body: makeEl('body'),
};

const localStorageMock = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
})();

class GainStub { constructor() { this.gain = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }; } connect() {} }
class OscStub { constructor() { this.type = ''; this.frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }; } connect() {} start() {} stop() {} }
class AudioContextStub {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = {}; }
  createGain() { return new GainStub(); }
  createOscillator() { return new OscStub(); }
  createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n) }; }
  createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
  createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect() {} }; }
  resume() {}
}

// wire globals onto globalThis (which the scripts see as `window`)
const g = globalThis;
g.window = g;
g.document = documentMock;
g.localStorage = localStorageMock;
const def = (k, v) => Object.defineProperty(g, k, { value: v, writable: true, configurable: true });
def('navigator', { maxTouchPoints: 0, getGamepads: () => [] });
def('location', { protocol: 'file:' });
g.AudioContext = AudioContextStub;
def('performance', { now: () => perfNow });
// image/audio stubs: never "load", so the game keeps using procedural fallback
class ImageStub { constructor() { this.complete = false; this.naturalWidth = 0; } set src(v) { this._src = v; } get src() { return this._src; } }
class AudioStub { constructor() { this.volume = 1; } addEventListener() {} set src(v) { this._src = v; } cloneNode() { return new AudioStub(); } play() { return Promise.resolve(); } }
def('Image', ImageStub);
def('Audio', AudioStub);
g.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
g.cancelAnimationFrame = () => {};
g.confirm = () => true;
g.devicePixelRatio = 1;
g.addEventListener = () => {};
g.removeEventListener = () => {};
const realSetInterval = g.setInterval;
g.setInterval = (fn, ms) => { const id = realSetInterval(fn, ms); timers.push(id); return id; };

/* ----------------------------- load scripts ----------------------------- */
const root = path.join(__dirname, '..');
['js/data.js', 'js/storage.js', 'js/audio.js', 'js/game.js', 'js/ui.js', 'js/main.js'].forEach((f) => {
  const code = fs.readFileSync(path.join(root, f), 'utf8');
  vm.runInThisContext(code, { filename: f });
});

/* ----------------------------- drive ----------------------------- */
function tick(ms = 33) {
  perfNow += ms;
  const q = rafQueue.splice(0, rafQueue.length);
  q.forEach((cb) => cb(perfNow));
}

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + ' -> ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 3).join('\n')); }
}

console.log('Puppy Runner — headless smoke test\n');

check('boot created globals', () => {
  if (!g.PR_DATA || !g.PR_SAVE || !g.PR_AUDIO || !g.PR_GAME || !g.PR_UI) throw new Error('missing modules');
});
check('data: 50+ achievements built', () => {
  if (g.PR_DATA.ACHIEVEMENTS.length < 50) throw new Error('only ' + g.PR_DATA.ACHIEVEMENTS.length);
});
check('data: 8 worlds', () => { if (g.PR_DATA.WORLDS.length !== 8) throw new Error('worlds=' + g.PR_DATA.WORLDS.length); });
check('save loaded with defaults', () => { const s = g.PR_SAVE.get(); if (s.level !== 1 || !s.owned.skin.includes('classic')) throw new Error('bad default'); });

check('attract frames run', () => { for (let i = 0; i < 30; i++) tick(); });

check('start run + countdown + play', () => {
  g.PR_GAME.startRun();
  if (g.PR_GAME.mode !== 'countdown') throw new Error('mode=' + g.PR_GAME.mode);
  for (let i = 0; i < 130 && g.PR_GAME.mode === 'countdown'; i++) tick();
  if (g.PR_GAME.mode !== 'play') throw new Error('did not reach play, mode=' + g.PR_GAME.mode);
});

check('run progresses & player can jump/slide', () => {
  for (let i = 0; i < 60; i++) { if (i % 12 === 0) g.PR_GAME.inputJump(); if (i % 20 === 0) g.PR_GAME.inputSlideDown(); tick(); g.PR_GAME.inputSlideUp(); }
});

let gotGameOver = false;
g.PR_GAME.on('gameover', () => { gotGameOver = true; });
check('run reaches game over', () => {
  let n = 0;
  while (g.PR_GAME.mode !== 'dead' && n < 4000) { tick(); n++; }
  if (g.PR_GAME.mode !== 'dead') throw new Error('never died after ' + n + ' ticks');
  // let the gameover handler (UI) process
  tick(); tick();
  if (!gotGameOver) throw new Error('gameover event not received');
});

check('stats recorded after run', () => {
  const s = g.PR_SAVE.get();
  if (s.runs < 1) throw new Error('runs=' + s.runs);
  if (s.scores.length < 1) throw new Error('no leaderboard entry');
});

check('save during a run does NOT pop the menu (regression)', () => {
  g.PR_UI.nav('menu');                                  // be on the menu
  const screens = g.document.querySelector('#screens');
  screens.classList.add('hidden');                      // emulate entering a run
  g.PR_SAVE.addBones(1); g.PR_SAVE.save();              // fires the save listener
  if (!screens.classList.contains('hidden')) throw new Error('menu re-opened over the running game');
  screens.classList.remove('hidden');
});

check('navigate every screen', () => {
  ['shop', 'worlds', 'achievements', 'leaderboard', 'daily', 'settings', 'menu'].forEach((n) => g.PR_UI.nav(n));
});

check('leaderboard scopes render', () => {
  // exercised via nav, but call global builder path through nav again
  g.PR_UI.nav('leaderboard');
});

check('buy + equip a skin', () => {
  const s = g.PR_SAVE.get();
  s.bones = 99999; g.PR_SAVE.save();
  // simulate purchase via storage API (UI buy path is DOM-bound)
  const skin = g.PR_DATA.SKINS[3];
  if (!g.PR_SAVE.spend(skin.cost, 'bones')) throw new Error('spend failed');
  g.PR_SAVE.addOwned('skin', skin.id); g.PR_SAVE.equip('skin', skin.id);
  if (!g.PR_SAVE.own('skin', skin.id)) throw new Error('not owned');
  if (g.PR_SAVE.get().equipped.skin !== skin.id) throw new Error('not equipped');
});

check('XP/level + world unlock', () => {
  const before = g.PR_SAVE.get().level;
  const res = g.PR_SAVE.addXP(100000);
  if (res.leveled.length < 1) throw new Error('did not level up');
  if (g.PR_SAVE.get().level <= before) throw new Error('level did not increase');
  if (!g.PR_SAVE.worldIsUnlocked('space')) throw new Error('space not unlocked at high level');
});

check('puppy preview renders', () => {
  const cv = makeEl('canvas');
  g.PR_GAME.previewPuppy(cv, { skin: 'golden', hat: 'crown', glasses: 'shades' });
});

check('multiple back-to-back runs are stable', () => {
  for (let r = 0; r < 2; r++) {
    g.PR_GAME.startRun();
    let n = 0;
    while (g.PR_GAME.mode !== 'dead' && n < 4000) { if (n % 15 === 0) g.PR_GAME.inputJump(); tick(); n++; }
  }
});

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'ALL CHECKS PASSED ✅'));
timers.forEach((id) => clearInterval(id));
process.exit(failures ? 1 : 0);
