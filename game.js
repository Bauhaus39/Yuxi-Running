/* =========================================================
   玉玺快跑 — 雪夜皇城大逃亡
   A self-contained canvas endless runner.
   ========================================================= */
(() => {
'use strict';

/* ----------------------------- helpers ----------------------------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const choice = arr => arr[(Math.random() * arr.length) | 0];
const pad = (n, len = 6) => String(Math.max(0, Math.floor(n))).padStart(len, '0');
const fmt = n => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const $ = sel => document.querySelector(sel);
function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ----------------------------- assets ----------------------------- */
const ASSET_SRC = Object.assign({
  hero: 'assets/game/hero_head.png',
  chaser: 'assets/game/chaser_sheet.png',
  poster: 'assets/game/chaser_photo.jpg',
  cutout: 'assets/game/chaser_cutout.png'
}, window.__YUXI_ASSETS || {});

const IMG = {};
const CHASER_META = { frameW: 198, frameH: 287, cols: 5, rows: 4, count: 20, fps: 11 };
const POSTER_LINES = [
  '咕咕嘎嘎！把玉玺留下！',
  '别跑了，你逃不出皇城的。',
  '你的鞋带开了……骗你的。',
  '再跑一步，我就飞起来了！'
];
const SPEECH_START = '咕咕嘎嘎！把玉玺留下！';
const SPEECH_DANGER = ['还我玉玺！', '抓到你了！', '别跑！', '等等我……'];
const SPEECH_FAR = ['等……等等我！', '你跑得好快……', '咕……'];
const SPEECH_HIT = '抓到你的衣角了！';
const SPEECH_POWER = '不准用道具！';

/* ----------------------------- elements ----------------------------- */
const canvas = $('#game');
const ctx = canvas.getContext('2d', { alpha: false });
const el = {
  hud: $('#hud'), menu: $('#menu'), loading: $('#loading'),
  pause: $('#pauseScreen'), over: $('#gameoverScreen'),
  score: $('#score'), distance: $('#distance'), seals: $('#seals'),
  lead: $('#lead'), chaseFill: $('#chaseFill'), chasePanel: $('#chasePanel'),
  chaseState: $('#chaseState'), combo: $('#combo'), comboMult: $('#comboMult'),
  pillShield: $('#pillShield'), pillMagnet: $('#pillMagnet'), magnetTime: $('#magnetTime'),
  toast: $('#toast'), countdown: $('#countdown'), touch: $('#touchControls'),
  menuBest: $('#menuBest'), finalScore: $('#finalScore'), finalDistance: $('#finalDistance'),
  finalSeals: $('#finalSeals'), newBest: $('#newBest'), gameoverLine: $('#gameoverLine'),
  menuSpeech: $('#menuSpeech'), pauseBtn: $('#pauseBtn')
};
const ui = {
  started: false, toastTimer: 0, chaseText: '', menuSpeechT: 0, menuSpeechIndex: 0
};

/* ----------------------------- state ----------------------------- */
let W = innerWidth, H = innerHeight, DPR = 1;
const L = {};

const G = {
  phase: 'loading',
  time: 0,
  elapsed: 0,
  distance: 0,
  speed: 16,
  worldSpeed: 16,
  score: 0,
  seals: 0,
  lead: 32,
  maxLead: 60,
  combo: 0,
  comboT: 0,
  mult: 1,
  obstacles: [],
  tokens: [],
  pickups: [],
  particles: [],
  floaters: [],
  snow: [],
  stars: [],
  ridges: [],
  shake: 0,
  flash: 0,
  flashColor: '232,70,58',
  spawnTimer: 2.2,
  tokenTimer: 1.2,
  powerTimer: 15,
  heartTimer: 0,
  slowT: 0,
  introT: 0,
  caughtT: 0,
  countdownKey: null,
  best: loadBest(),
  player: null,
  chaser: null,
  muted: localStorage.getItem('yuxi_muted') === '1',
  menuSpeechT: 3.5,
  menuSpeechIndex: 0,
  sessionCaught: false
};

/* ----------------------------- audio ----------------------------- */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.noise = null;
    this.musicTimer = null;
    this.musicPlaying = false;
    this.step = 0;
    this.nextTime = 0;
    this.enabled = !G.muted;
  }
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? .55 : 0;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = .17;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate * .5;
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    } catch (e) { this.ctx = null; }
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  setEnabled(on) {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(on ? .55 : 0, this.ctx.currentTime, .04);
    }
  }
  tone(freq, dur, type = 'sine', vol = .12, when = 0, endFreq = null, dest = null) {
    if (!this.ctx || !this.enabled) return;
    const t = (when || this.ctx.currentTime);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(.018, dur * .3));
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.master);
    o.start(t);
    o.stop(t + dur + .02);
  }
  noiseBurst(dur, vol, cutoff, when = 0, dest = null) {
    if (!this.ctx || !this.enabled || !this.noise) return;
    const t = when || this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(dest || this.master);
    src.start(t); src.stop(t + dur);
  }
  click() { this.init(); this.tone(620, .045, 'triangle', .1, 0, 780); }
  jump() { this.init(); this.tone(260, .16, 'triangle', .15, 0, 620); this.noiseBurst(.08, .035, 2200); }
  slide() { this.init(); this.noiseBurst(.2, .1, 900); this.tone(170, .14, 'sine', .07, 0, 90); }
  coin(pitch = 1) {
    this.init();
    const now = this.ctx ? this.ctx.currentTime : 0;
    this.tone(1046 * pitch, .1, 'sine', .065, now);
    this.tone(1568 * pitch, .18, 'sine', .05, now + .035);
    this.tone(2093 * pitch, .12, 'triangle', .028, now + .07);
  }
  power() {
    this.init(); const n = this.ctx ? this.ctx.currentTime : 0;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, .24, 'triangle', .085, n + i * .07));
  }
  shield() { this.init(); const n = this.ctx ? this.ctx.currentTime : 0; this.tone(392, .3, 'sine', .1, n); this.tone(784, .4, 'sine', .07, n + .04); }
  hit() {
    this.init(); const n = this.ctx ? this.ctx.currentTime : 0;
    this.tone(120, .3, 'sawtooth', .15, n, 46);
    this.noiseBurst(.22, .16, 700);
    this.tone(62, .4, 'sine', .17, n + .03, 40);
  }
  near() { this.init(); this.tone(1760, .06, 'sine', .025); }
  catch() {
    this.init(); const n = this.ctx ? this.ctx.currentTime : 0;
    [523, 440, 349, 262].forEach((f, i) => this.tone(f, .34, 'triangle', .11, n + i * .13));
    this.tone(70, .8, 'sawtooth', .1, n + .28, 38);
  }
  heartbeat(fast = false) {
    if (!this.ctx) return;
    const n = this.ctx.currentTime;
    this.tone(70, .12, 'sine', .08, n);
    this.tone(55, .16, 'sine', .06, n + (fast ? .15 : .23));
  }
  startMusic() {
    this.init();
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + .12;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 90);
  }
  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
  scheduleMusic() {
    if (!this.ctx || !this.musicPlaying || !this.enabled) return;
    const ahead = this.ctx.currentTime + .32;
    while (this.nextTime < ahead) {
      this.playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % 32;
      this.nextTime += .235;
    }
  }
  playStep(step, t) {
    const scale = [293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];
    const pattern = [0, 2, 4, 2, 5, 4, 2, 0, 1, 3, 5, 4, 7, 5, 4, 2, 0, 2, 4, 6, 5, 4, 2, 1, 0, 3, 5, 7, 6, 4, 2, 0];
    if (step % 2 === 0) {
      const f = scale[pattern[step] % scale.length];
      this.tone(f, .42, 'triangle', .035, t, null, this.musicGain);
      this.tone(f * 2, .28, 'sine', .013, t + .012, null, this.musicGain);
    }
    if (step % 8 === 0) {
      this.tone(73.42, .8, 'sine', .045, t, null, this.musicGain);
      this.tone(146.83, .45, 'triangle', .016, t, null, this.musicGain);
    }
    if (step % 4 === 2) {
      this.noiseBurst(.045, .018, 4000, t, this.musicGain);
    }
    if (step % 16 === 0) {
      this.tone(55, .32, 'sine', .05, t, null, this.musicGain);
    }
  }
}
const sound = new SoundEngine();

/* ----------------------------- persistence ----------------------------- */
function loadBest() {
  try {
    const o = JSON.parse(localStorage.getItem('yuxi_best') || '{}');
    return { score: +o.score || 0, distance: +o.distance || 0, seals: +o.seals || 0 };
  } catch (e) { return { score: 0, distance: 0, seals: 0 }; }
}
function saveBest() {
  try { localStorage.setItem('yuxi_best', JSON.stringify(G.best)); } catch (e) {}
}

/* ----------------------------- images ----------------------------- */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('image failed: ' + src.slice(0, 80)));
    im.src = src;
  });
}

/* ----------------------------- layout ----------------------------- */
function computeLayout() {
  W = Math.max(320, window.innerWidth);
  H = Math.max(320, window.innerHeight);
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const portrait = H / W > 1.1;
  L.portrait = portrait;
  L.cx = W * .5;
  L.horizon = H * (portrait ? .305 : .335);
  L.bottom = H * (portrait ? .94 : .985);
  L.cam = 7.4;
  L.pz = .7;
  L.laneW = portrait ? Math.min(W * .216, H * .24) : Math.min(W * .205, H * .27);
  L.heroH = portrait ? Math.min(H * .26, W * .52) : Math.min(H * .295, W * .52);
  L.tp = L.cam / (L.pz + L.cam);
  L.unit = L.laneW;

  makeStars();
  makeRidges();
  makeSnow(true);
}

function project(lane, z) {
  const t = L.cam / (Math.max(-3, z) + L.cam);
  return {
    t,
    x: L.cx + lane * L.laneW * t,
    y: L.horizon + (L.bottom - L.horizon) * t
  };
}

function groundY(z) { return project(0, z).y; }

function makeStars() {
  G.stars = [];
  const n = Math.round(clamp(W * H / 13000, 55, 160));
  for (let i = 0; i < n; i++) {
    G.stars.push({
      x: Math.random() * W,
      y: Math.random() * L.horizon * .86,
      r: rand(.3, 1.5),
      a: rand(.18, .9),
      p: rand(0, TAU),
      s: rand(.5, 2.2)
    });
  }
}

function makeRidges() {
  G.ridges = [];
  const layers = [
    { base: L.horizon + 10, amp: H * .15, color: '#1b2a4b', snow: .2, count: 24, seed: 1.2 },
    { base: L.horizon + 24, amp: H * .12, color: '#1c2b48', snow: .3, count: 20, seed: 4.2 },
    { base: L.horizon + 42, amp: H * .085, color: '#22324c', snow: .45, count: 17, seed: 8.4 }
  ];
  for (const cfg of layers) {
    const pts = [];
    const step = (W + 180) / cfg.count;
    for (let i = 0; i <= cfg.count + 1; i++) {
      const x = -90 + i * step;
      let y = cfg.base - cfg.amp * (.18 + Math.random() * .55);
      if (i % 3 === 0) y -= cfg.amp * rand(.15, .55);
      if (i % 5 === 0) y += cfg.amp * rand(.05, .22);
      pts.push({ x, y });
    }
    G.ridges.push({ ...cfg, pts });
  }
}

function makeSnow(reset) {
  const n = Math.round(clamp(W * H / 11000, 55, 160));
  G.snow = [];
  for (let i = 0; i < n; i++) {
    G.snow.push({
      x: Math.random() * W,
      y: Math.random() * H,
      z: Math.random(),
      r: rand(.7, 3.4),
      v: rand(15, 52),
      drift: rand(4, 22),
      p: rand(0, TAU),
      a: rand(.3, .82)
    });
  }
}

/* ----------------------------- run setup ----------------------------- */
function makePlayer() {
  return {
    lane: 0, visualLane: 0,
    jumpY: 0, vy: 0,
    sliding: false, slideT: 0,
    hitT: 0, invuln: 0,
    shield: false, magnetT: 0,
    phase: 0, land: 0, dustT: 0,
    lean: 0, startT: 0
  };
}
function makeChaser() {
  return {
    z: 3.35, visualLane: 0, bounce: 0,
    speech: SPEECH_START, speechT: 3.2, speechCool: 0,
    alert: 0
  };
}
function resetRun() {
  G.elapsed = 0; G.distance = 0; G.speed = 16; G.worldSpeed = 16;
  G.score = 0; G.seals = 0; G.lead = 32; G.combo = 0; G.comboT = 0; G.mult = 1;
  G.obstacles = []; G.tokens = []; G.pickups = []; G.particles = []; G.floaters = [];
  G.shake = 0; G.flash = 0; G.spawnTimer = 2.5; G.tokenTimer = 1.1; G.powerTimer = 16;
  G.heartTimer = 0; G.slowT = 0; G.introT = 0; G.caughtT = 0;
  G.countdownKey = null; G.sessionCaught = false;
  G.player = makePlayer();
  G.chaser = makeChaser();
  updateHUD(true);
}

/* ----------------------------- UI plumbing ----------------------------- */
function hideScreens() {
  [el.menu, el.loading, el.pause, el.over].forEach(s => s.classList.add('hidden'));
}
function setPhase(p) {
  G.phase = p;
  document.body.dataset.state = p;
  const inGame = p === 'intro' || p === 'playing' || p === 'paused' || p === 'caught' || p === 'gameover';
  el.hud.classList.toggle('hidden', !inGame);
  el.touch.classList.toggle('hidden', !(p === 'playing' && isTouch()));
}
function isTouch() {
  return matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
}
function showToast(text, danger = false) {
  el.toast.textContent = text;
  el.toast.classList.toggle('danger', danger);
  el.toast.classList.add('show');
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1900);
}
function updateHUD(force) {
  if (!el.score) return;
  el.score.textContent = pad(G.score);
  el.distance.textContent = Math.floor(G.distance);
  el.seals.textContent = G.seals;
  const lead = Math.max(0, G.lead);
  el.lead.textContent = lead < 10 ? lead.toFixed(1) : Math.ceil(lead);
  const pct = clamp(lead / G.maxLead, 0, 1);
  el.chaseFill.style.width = (pct * 100).toFixed(1) + '%';
  const danger = lead < 12;
  el.chasePanel.classList.toggle('danger', danger);
  let chaseText;
  if (lead < 6) chaseText = '危险！它就在你身后！';
  else if (lead < 12) chaseText = '听到企鹅的脚步声了……';
  else if (lead < 22) chaseText = '它越追越近了，快找玉玺！';
  else if (lead < 38) chaseText = '暂时安全，继续跑！';
  else chaseText = '遥遥领先，企鹅灯急得直跺脚';
  if (force || chaseText !== ui.chaseText) {
    el.chaseState.textContent = chaseText;
    ui.chaseText = chaseText;
  }
  el.combo.classList.toggle('hidden', G.combo < 2);
  el.comboMult.textContent = 'x' + G.mult;
  el.pillShield.classList.toggle('hidden', !G.player || !G.player.shield);
  const mag = G.player ? Math.max(0, G.player.magnetT) : 0;
  el.pillMagnet.classList.toggle('hidden', mag <= 0);
  if (mag > 0) el.magnetTime.textContent = Math.ceil(mag);
  el.menuBest.textContent = fmt(G.best.score);
}
function bumpCombo() {
  el.combo.classList.remove('bump');
  void el.combo.offsetWidth;
  el.combo.classList.add('bump');
}
function syncMute() {
  document.body.classList.toggle('muted', G.muted);
  sound.setEnabled(!G.muted);
  try { localStorage.setItem('yuxi_muted', G.muted ? '1' : '0'); } catch (e) {}
}
function toggleMute() {
  G.muted = !G.muted;
  syncMute();
  if (!G.muted) { sound.init(); sound.click(); }
}
function setMenuSpeech() {
  el.menuSpeech.textContent = POSTER_LINES[ui.menuSpeechIndex % POSTER_LINES.length];
  ui.menuSpeechIndex++;
}

/* ----------------------------- flow ----------------------------- */
function startGame() {
  sound.init();
  sound.resume();
  sound.stopMusic();
  hideScreens();
  resetRun();
  setPhase('intro');
  el.hud.classList.remove('hidden');
  el.countdown.classList.remove('hidden');
  el.countdown.textContent = '3';
  G.introT = 2.2;
  G.countdownKey = 3;
  sound.startMusic();
  sound.jump();
  setTimeout(() => {
    if (G.phase === 'intro') {
      el.countdown.classList.remove('pop');
      void el.countdown.offsetWidth;
      el.countdown.classList.add('pop');
    }
  }, 20);
}

function showMenu() {
  hideScreens();
  el.menu.classList.remove('hidden');
  setPhase('menu');
  el.hud.classList.add('hidden');
  sound.stopMusic();
  G.distance = 0;
  G.menuSpeechT = .2;
  updateHUD(true);
}

function pauseGame() {
  if (G.phase !== 'playing') return;
  setPhase('paused');
  el.pause.classList.remove('hidden');
  sound.stopMusic();
}
function resumeGame() {
  if (G.phase !== 'paused') return;
  el.pause.classList.add('hidden');
  setPhase('playing');
  sound.startMusic();
  sound.resume();
}
function catchPlayer() {
  if (G.phase === 'caught' || G.phase === 'gameover') return;
  G.phase = 'caught';
  G.caughtT = 0;
  G.sessionCaught = true;
  G.lead = 0;
  G.shake = 28;
  G.flash = .7;
  sound.catch();
  sound.stopMusic();
  setPhase('caught');
  el.pauseBtn.disabled = true;
  const p = G.player;
  p.hitT = 2;
  G.chaser.speech = '抓到你了！';
  G.chaser.speechT = 2.5;
  spawnBurst(project(p.visualLane, L.pz).x, project(0, L.pz).y - L.heroH * .5, '#f7d88a', 26, 190);
}

function finishGameOver() {
  setPhase('gameover');
  el.pauseBtn.disabled = false;
  const score = Math.floor(G.score);
  const distance = Math.floor(G.distance);
  const seals = G.seals;
  const isNew = score > G.best.score;
  if (isNew) {
    G.best = { score, distance, seals };
    saveBest();
  }
  el.finalScore.textContent = fmt(score);
  el.finalDistance.textContent = fmt(distance);
  el.finalSeals.textContent = seals;
  el.newBest.classList.toggle('hidden', !isNew);
  let line;
  if (distance < 100) line = '刚跑出宫门就被逮住了。企鹅灯说：下次记得系紧鞋带。';
  else if (distance < 300) line = '你跑得不慢，但它追得更执着。雪地上全是它的小脚印。';
  else if (distance < 650) line = '朱雀大街都被你跑完了，还是没能甩掉这只企鹅。';
  else if (distance < 1000) line = '只差一点就能逃出皇城。企鹅灯喘着气，把玉玺抱得更紧了。';
  else line = '你几乎跑穿了整个皇城！虽然被追上了，但这条街会记住你的速度。';
  el.gameoverLine.textContent = line;
  el.menuBest.textContent = fmt(G.best.score);
  el.over.classList.remove('hidden');
  updateHUD(true);
}

function backToMenu() {
  hideScreens();
  setPhase('menu');
  el.menu.classList.remove('hidden');
  sound.stopMusic();
  G.distance = 0;
  updateHUD(true);
}

/* ----------------------------- input ----------------------------- */
function canControl() { return G.phase === 'playing'; }

function moveLane(dir) {
  if (!canControl()) return;
  const p = G.player;
  const next = clamp(p.lane + dir, -1, 1);
  if (next !== p.lane) {
    p.lane = next;
    p.lean = dir * .9;
    sound.tone(310, .06, 'sine', .035, 0, 380);
  }
}
function doJump() {
  if (!canControl()) return;
  const p = G.player;
  if (p.jumpY > .001 || p.vy > 0) return;
  p.sliding = false;
  p.slideT = 0;
  p.vy = 5.35;
  p.jumpY = .001;
  p.land = 0;
  sound.jump();
  spawnBurst(project(p.visualLane, L.pz).x, project(0, L.pz).y - 4, 'rgba(255,240,205,.7)', 6, 55);
}
function doSlide() {
  if (!canControl()) return;
  const p = G.player;
  if (p.sliding) return;
  if (p.jumpY > .001) {
    p.vy = Math.min(p.vy, -5.8);
    p.jumpY = .001;
  }
  p.sliding = true;
  p.slideT = .64;
  sound.slide();
  const x = project(p.visualLane, L.pz).x;
  const y = project(0, L.pz).y;
  for (let i = 0; i < 7; i++) {
    addParticle(x + rand(-22, 22), y - rand(0, 10), rand(-80, 80), rand(-70, -10), rand(.28, .55), rand(2, 5), 'rgba(245,231,200,.75)', 180);
  }
}

window.addEventListener('keydown', e => {
  const k = e.key;
  const controlKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar'];
  if (controlKeys.includes(k)) e.preventDefault();
  if (e.repeat) return;

  if (G.phase === 'menu' || G.phase === 'gameover') {
    if (k === 'Enter' || k === ' ') { startGame(); }
    return;
  }
  if (k === 'Escape' || k === 'p' || k === 'P') {
    if (G.phase === 'playing') pauseGame();
    else if (G.phase === 'paused') resumeGame();
    return;
  }
  if (k === 'm' || k === 'M') { toggleMute(); return; }
  if (G.phase === 'paused') {
    if (k === 'Enter') resumeGame();
    return;
  }
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') moveLane(-1);
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') moveLane(1);
  else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ' || k === 'Spacebar') doJump();
  else if (k === 'ArrowDown' || k === 's' || k === 'S') doSlide();
}, { passive: false });

/* swipe */
let swipe = null;
window.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  if (!canControl()) return;
  swipe = { x: e.clientX, y: e.clientY, used: false, t: performance.now(), id: e.pointerId };
}, { passive: true });
window.addEventListener('pointermove', e => {
  if (!swipe || swipe.used || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  const threshold = 24;
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
  swipe.used = true;
  if (Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1);
  else if (dy < 0) doJump();
  else doSlide();
}, { passive: true });
window.addEventListener('pointerup', () => { swipe = null; }, { passive: true });
window.addEventListener('pointercancel', () => { swipe = null; }, { passive: true });

/* touch buttons */
document.querySelectorAll('.touch-btn').forEach(btn => {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const act = btn.dataset.act;
    if (act === 'left') moveLane(-1);
    else if (act === 'right') moveLane(1);
    else if (act === 'jump') doJump();
    else if (act === 'slide') doSlide();
  }, { passive: false });
});

/* buttons */
$('#startBtn').addEventListener('click', () => { sound.init(); sound.click(); startGame(); });
$('#menuMuteBtn').addEventListener('click', toggleMute);
$('#muteBtn').addEventListener('click', toggleMute);
el.pauseBtn.addEventListener('click', pauseGame);
$('#resumeBtn').addEventListener('click', resumeGame);
$('#pauseRestartBtn').addEventListener('click', () => { sound.click(); el.pause.classList.add('hidden'); startGame(); });
$('#pauseHomeBtn').addEventListener('click', () => { sound.click(); backToMenu(); });
$('#restartBtn').addEventListener('click', () => { sound.click(); el.over.classList.add('hidden'); startGame(); });
$('#homeBtn').addEventListener('click', () => { sound.click(); el.over.classList.add('hidden'); backToMenu(); });

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.phase === 'playing') pauseGame();
});

/* ----------------------------- spawning ----------------------------- */
function spawnObstacle(type, lane, opts = {}) {
  const o = {
    kind: 'obstacle', type, lane,
    z: 64, prevZ: 64,
    full: !!opts.full,
    seed: Math.random() * 10,
    resolved: false,
    passed: false
  };
  G.obstacles.push(o);
  return o;
}

function spawnRow() {
  const e = G.elapsed;
  const early = e < 12;
  let r = Math.random();
  if (early && r < .58) {
    // single full-lane block
    const lane = choice([-1, 0, 1]);
    spawnObstacle(choice(['lion', 'crate']), lane);
    maybeSealLine(choice([-1, 0, 1].filter(x => x !== lane)), 3, 46);
    return;
  }
  const patterns = early
    ? ['single', 'single', 'jump', 'slide']
    : (e < 24
      ? ['single', 'double', 'jump', 'slide', 'jump', 'slide', 'mixed', 'double']
      : ['single', 'double', 'jump', 'slide', 'jump', 'slide', 'mixed', 'double', 'bigJump', 'bigSlide']);
  const p = choice(patterns);
  if (p === 'single') {
    const lane = choice([-1, 0, 1]);
    spawnObstacle(choice(['lion', 'crate', 'lantern']), lane);
    maybeSealLine(choice([-1, 0, 1].filter(x => x !== lane)), 3, 47);
  } else if (p === 'double') {
    const free = choice([-1, 0, 1]);
    [-1, 0, 1].filter(x => x !== free).forEach(lane => {
      spawnObstacle(choice(['lion', 'crate']), lane);
    });
  } else if (p === 'jump') {
    const lane = choice([-1, 0, 1]);
    spawnObstacle('barrier', lane);
    maybeSealArc(lane, 43);
  } else if (p === 'slide') {
    const lane = choice([-1, 0, 1]);
    spawnObstacle('beam', lane);
    maybeSealLine(lane, 4, 43);
  } else if (p === 'mixed') {
    const blockLane = choice([-1, 0, 1]);
    spawnObstacle(choice(['lion', 'crate']), blockLane);
    const barrierLane = choice([-1, 0, 1].filter(x => x !== blockLane));
    spawnObstacle(choice(['barrier', 'spikes']), barrierLane);
    maybeSealLine(choice([-1, 0, 1].filter(x => x !== blockLane)), 3, 48);
  } else if (p === 'bigJump') {
    spawnObstacle('wall', 0, { full: true });
    maybeSealArc(1, 43);
  } else if (p === 'bigSlide') {
    spawnObstacle('gate', 0, { full: true });
    maybeSealLine(0, 3, 43);
  }
}

function maybeSealLine(lane, count, zStart) {
  if (Math.random() < .36) {
    for (let i = 0; i < count; i++) {
      G.tokens.push(makeToken(lane, zStart + i * 1.45, .12));
    }
  }
}
function maybeSealArc(lane, zStart) {
  if (Math.random() < .45) {
    for (let i = 0; i < 5; i++) {
      G.tokens.push(makeToken(lane, zStart + i * 1.2, .18 + Math.sin(i / 4 * Math.PI) * .55));
    }
  }
}
function makeToken(lane, z, h = .15) {
  return {
    kind: 'token', lane, z, seed: Math.random() * TAU,
    h, collected: false, prevZ: z
  };
}
function spawnTokenPattern() {
  if (Math.random() < .45) return;
  const r = Math.random();
  if (r < .36) {
    const lane = choice([-1, 0, 1]);
    const z0 = 48;
    for (let i = 0; i < 7; i++) G.tokens.push(makeToken(lane, z0 + i * 1.3, .14));
  } else if (r < .72) {
    const dir = Math.random() < .5 ? 1 : -1;
    const start = choice([-1, 1]);
    const z0 = 45;
    for (let i = 0; i < 9; i++) {
      const lane = clamp(start * (i < 4 ? 1 : -1), -1, 1);
      G.tokens.push(makeToken(lane, z0 + i * 1.2, .13));
    }
  } else {
    const lane = choice([-1, 0, 1]);
    for (let i = 0; i < 7; i++) {
      G.tokens.push(makeToken(lane, 42 + i * 1.15, .2 + Math.sin(i / 6 * Math.PI) * .6));
    }
  }
}
function spawnPickup() {
  const lane = choice([-1, 0, 1]);
  const type = Math.random() < .55 ? 'shield' : 'magnet';
  G.pickups.push({ kind: 'pickup', type, lane, z: 55, seed: Math.random() * TAU, prevZ: 55 });
}

/* ----------------------------- particles ----------------------------- */
function addParticle(x, y, vx, vy, life, size, color, gravity = 120, type = 'dot') {
  if (G.particles.length > 190) G.particles.shift();
  G.particles.push({ x, y, vx, vy, life, max: life, size, color, gravity, type, rot: rand(0, TAU), spin: rand(-6, 6) });
}
function spawnBurst(x, y, color, count = 12, speed = 130) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU);
    const s = rand(speed * .25, speed);
    const life = rand(.3, .8);
    addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s - rand(10, 70), life, rand(1.6, 5), color, rand(80, 220), Math.random() < .3 ? 'spark' : 'dot');
  }
}
function addFloater(x, y, text, color = '#ffe6a6', size = 17) {
  G.floaters.push({ x, y, text, color, size, life: .95, max: .95, vy: -48 });
}

function updateParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.life -= dt;
    if (p.life <= 0) { G.particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    p.rot += p.spin * dt;
  }
  for (let i = G.floaters.length - 1; i >= 0; i--) {
    const f = G.floaters[i];
    f.life -= dt;
    f.y += f.vy * dt;
    f.vy *= .96;
    if (f.life <= 0) G.floaters.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of G.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y);
    if (p.type === 'spark') {
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size * 1.8, -p.size * .3, p.size * 3.6, p.size * .6);
    } else if (p.type === 'snow') {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(0, 0, p.size, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(0, 0, p.size * a, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  for (const f of G.floaters) {
    const a = clamp(f.life / f.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `700 ${f.size}px "STKaiti","KaiTi",serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = f.color;
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 8;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
}

/* ----------------------------- update ----------------------------- */
function updateSnow(dt) {
  for (const s of G.snow) {
    s.y += s.v * dt * (.4 + s.z);
    s.x += Math.sin(G.time * .9 + s.p) * s.drift * dt;
    if (s.y > H + 10) { s.y = -10; s.x = Math.random() * W; }
    if (s.x < -10) s.x = W + 10;
    if (s.x > W + 10) s.x = -10;
  }
}

function updatePlayer(dt) {
  const p = G.player;
  p.visualLane += (p.lane - p.visualLane) * Math.min(1, dt * 15);
  p.lean += (0 - p.lean) * Math.min(1, dt * 8);
  p.phase += dt * (11 + G.worldSpeed * .18);
  if (p.jumpY > 0 || p.vy > 0) {
    p.vy -= 17.8 * dt;
    p.jumpY += p.vy * dt;
    if (p.jumpY <= 0) {
      if (p.jumpY < -.04) {
        p.land = 1;
        const x = project(p.visualLane, L.pz).x;
        const y = project(0, L.pz).y;
        for (let i = 0; i < 4; i++) addParticle(x + rand(-18, 18), y, rand(-50, 50), rand(-55, -15), rand(.2, .4), rand(1.6, 3.4), 'rgba(242,230,205,.65)', 160);
      }
      p.jumpY = 0; p.vy = 0;
    }
  }
  if (p.sliding) {
    p.slideT -= dt;
    if (p.slideT <= 0) p.sliding = false;
  }
  p.hitT = Math.max(0, p.hitT - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.land = Math.max(0, p.land - dt * 3.5);
  p.magnetT = Math.max(0, p.magnetT - dt);
  if (p.magnetT > 0) {
    p.magnetT -= 0; // keeps linter quiet
  }
  p.dustT -= dt;
  if (p.dustT <= 0 && p.jumpY < .02) {
    p.dustT = .12;
    const x = project(p.visualLane, L.pz).x;
    const y = project(0, L.pz).y;
    addParticle(x + rand(-20, 20), y + rand(-4, 2), rand(-40, 40), rand(-20, -2), rand(.15, .3), rand(1, 2.8), 'rgba(255,245,220,.5)', 35);
    if (G.worldSpeed > 30) addParticle(x + rand(-30, 30), y - rand(0, 8), rand(-60, 60), rand(-40, -8), rand(.2, .35), rand(1, 3.2), 'rgba(255,236,190,.6)', 50);
  }
}

function updateChaser(dt) {
  const c = G.chaser;
  const p = G.player;
  const closeness = clamp(1 - G.lead / 45, 0, 1);
  c.visualLane += (p.visualLane - c.visualLane) * Math.min(1, dt * 4);
  c.bounce = Math.sin(G.time * 9) * 3;
  c.z = L.pz + .85 + clamp(G.lead, 0, 60) * .052;
  c.alert = clamp(1 - G.lead / 18, 0, 1);
  c.speechT = Math.max(0, c.speechT - dt);
  c.speechCool = Math.max(0, c.speechCool - dt);
  if (c.speechT <= 0 && c.speechCool <= 0) {
    if (G.lead < 13) c.speech = choice(SPEECH_DANGER);
    else if (G.lead > 44) c.speech = choice(SPEECH_FAR);
    else c.speech = choice(['咕咕嘎嘎！', '别跑！', '玉玺留下！']);
    c.speechT = rand(2.8, 4.6);
    c.speechCool = rand(3.2, 5.5);
  }
}

function doHit(reason) {
  const p = G.player;
  if (p.invuln > 0) return;
  if (p.shield) {
    p.shield = false;
    p.invuln = 1;
    G.flash = .32;
    G.flashColor = '255,214,120';
    G.shake = 10;
    const pp = project(p.visualLane, L.pz);
    spawnBurst(pp.x, pp.y - L.heroH * .55, '#ffe7a8', 20, 180);
    addFloater(pp.x, pp.y - L.heroH * .95, '龙鳞挡下！', '#ffe5a0', 20);
    sound.shield();
    showToast('龙鳞护盾挡住了这一击', false);
    return;
  }
  p.invuln = 1.25;
  p.hitT = .42;
  p.sliding = false;
  p.slideT = 0;
  G.lead = Math.max(0, G.lead - 9);
  G.combo = 0; G.comboT = 0; G.mult = 1;
  G.shake = 20;
  G.flash = .55;
  G.flashColor = '232,70,58';
  G.slowT = .55;
  G.chaser.speech = SPEECH_HIT;
  G.chaser.speechT = 2;
  const pp = project(p.visualLane, L.pz);
  addFloater(pp.x, pp.y - L.heroH * .9, '-9m 被追近', '#ffb49c', 18);
  spawnBurst(pp.x, pp.y - L.heroH * .5, '#f6d394', 18, 190);
  sound.hit();
  if (G.lead <= 0) catchPlayer();
}

function updateHUDDangerSound(dt) {
  if (G.lead < 14) {
    G.heartTimer -= dt;
    if (G.heartTimer <= 0) {
      G.heartTimer = G.lead < 7 ? .58 : .95;
      sound.heartbeat(G.lead < 7);
    }
  } else {
    G.heartTimer = Math.min(G.heartTimer, .4);
  }
}

function update(dt) {
  G.time += dt;
  updateSnow(dt);
  updateParticles(dt);
  G.shake *= Math.pow(.001, dt);
  G.flash = Math.max(0, G.flash - dt * 2.8);

  if (G.phase === 'menu') {
    G.distance += dt * 4;
    G.menuSpeechT -= dt;
    if (G.menuSpeechT <= 0) {
      G.menuSpeechT = 5.4;
      setMenuSpeech();
    }
    return;
  }
  if (G.phase === 'paused' || G.phase === 'gameover' || G.phase === 'loading') return;

  if (G.phase === 'intro') {
    G.introT -= dt;
    G.distance += dt * 4.5;
    G.player.phase += dt * 9;
    updateChaser(dt);
    updateHUD();
    const key = Math.ceil(G.introT);
    if (key !== G.countdownKey) {
      G.countdownKey = key;
      if (G.introT > 0) {
        el.countdown.textContent = String(key);
        el.countdown.classList.remove('pop');
        void el.countdown.offsetWidth;
        el.countdown.classList.add('pop');
        sound.tone(key === 1 ? 660 : 440, .08, 'sine', .08);
      }
    }
    if (G.introT <= 0) {
      el.countdown.textContent = '跑！';
      el.countdown.classList.remove('pop');
      void el.countdown.offsetWidth;
      el.countdown.classList.add('pop');
      setTimeout(() => el.countdown.classList.add('hidden'), 520);
      setPhase('playing');
      G.spawnTimer = 2.1;
      G.tokenTimer = .8;
      sound.power();
    }
    return;
  }

  if (G.phase === 'caught') {
    G.caughtT += dt;
    G.distance += G.worldSpeed * dt * .15;
    G.worldSpeed = lerp(G.worldSpeed, 4, Math.min(1, dt * 2.8));
    updateChaser(dt);
    updatePlayer(dt);
    updateHUD();
    if (G.caughtT > 1.35) finishGameOver();
    return;
  }

  /* ---- playing ---- */
  G.elapsed += dt;
  G.speed = 16 + Math.min(19.5, G.elapsed * .27);
  const slowFactor = G.slowT > 0 ? .62 : 1;
  G.slowT = Math.max(0, G.slowT - dt);
  G.worldSpeed = G.speed * slowFactor;
  G.distance += G.worldSpeed * dt;
  G.score += G.worldSpeed * dt * 4.6;

  // passive pressure: the penguin never rests
  G.lead = Math.max(0, G.lead - (.055 + G.elapsed * .00075) * dt);
  if (G.lead <= 0) { catchPlayer(); return; }

  G.comboT = Math.max(0, G.comboT - dt);
  if (G.comboT <= 0 && G.combo > 0) { G.combo = 0; G.mult = 1; }

  updatePlayer(dt);
  updateChaser(dt);

  G.spawnTimer -= dt;
  if (G.spawnTimer <= 0) {
    spawnRow();
    const base = G.elapsed < 20 ? 1.75 : G.elapsed < 60 ? 1.45 : 1.12;
    G.spawnTimer = Math.max(.72, base + rand(-.12, .2) - Math.min(.25, G.elapsed * .0015));
  }
  G.tokenTimer -= dt;
  if (G.tokenTimer <= 0) {
    spawnTokenPattern();
    G.tokenTimer = rand(2.4, 4.1);
  }
  G.powerTimer -= dt;
  if (G.powerTimer <= 0) {
    spawnPickup();
    G.powerTimer = rand(17, 25);
  }

  // move and collide
  const p = G.player;
  for (const o of G.obstacles) {
    o.prevZ = o.z;
    o.z -= G.worldSpeed * dt;
    if (o.full) {
      if (!o.resolved && o.prevZ > L.pz + .15 && o.z <= L.pz + .15) {
        let hit = false;
        if (o.type === 'gate' && !p.sliding) hit = true;
        if (o.type === 'wall' && p.jumpY < .31) hit = true;
        if (hit) doHit(o.type);
        o.resolved = true;
      }
    } else if (!o.resolved && o.prevZ > L.pz + .15 && o.z <= L.pz + .15) {
      let hit = false;
      if (Math.abs(p.visualLane - o.lane) < .55) {
        if (o.type === 'barrier' || o.type === 'spikes') {
          if (p.jumpY < .30) hit = true;
        } else if (o.type === 'beam') {
          if (!p.sliding) hit = true;
        } else {
          hit = true;
        }
      }
      if (hit) doHit(o.type);
      else if (Math.abs(p.visualLane - o.lane) > .5) {
        if (Math.random() < .55) {
          G.lead = Math.min(G.maxLead, G.lead + .35);
          addFloater(project(p.visualLane, L.pz).x, project(0, L.pz).y - L.heroH * .7, '有惊无险 +0.3m', '#cfe8d2', 13);
          sound.near();
        }
      }
      o.resolved = true;
    }
  }
  G.obstacles = G.obstacles.filter(o => o.z > -2.2);

  for (const tk of G.tokens) {
    tk.prevZ = tk.z;
    tk.z -= G.worldSpeed * dt;
    if (!tk.collected && tk.z < L.pz + .85 && tk.z > L.pz - 1.7) {
      const sameLane = Math.abs(p.visualLane - tk.lane) < .62;
      if (sameLane || p.magnetT > 0) collectToken(tk);
    }
  }
  G.tokens = G.tokens.filter(t => !t.collected && t.z > -2);

  for (const pk of G.pickups) {
    pk.prevZ = pk.z;
    pk.z -= G.worldSpeed * dt;
    if (!pk.taken && pk.z < L.pz + .85 && pk.z > L.pz - 1.7 && Math.abs(p.visualLane - pk.lane) < .62) {
      collectPickup(pk);
    }
  }
  G.pickups = G.pickups.filter(pk => !pk.taken && pk.z > -2);

  updateHUDDangerSound(dt);
  updateHUD();
}

function collectToken(tk) {
  const p = G.player;
  tk.collected = true;
  G.seals++;
  G.combo++;
  G.comboT = 2.25;
  G.mult = Math.min(8, 1 + Math.floor(G.combo / 5));
  const gain = 18 * G.mult;
  G.score += gain;
  G.lead = Math.min(G.maxLead, G.lead + .28 + G.mult * .035);
  const pr = project(tk.lane, tk.z);
  const px = pr.x;
  const py = project(0, tk.z).y - (tk.h + .35) * L.laneW * pr.t;
  spawnBurst(px, py, '#7cebc7', 8, 110);
  addParticle(px, py, 0, -20, .4, 10, 'rgba(159,255,217,.22)', -20, 'dot');
  addFloater(px, py - 15, '+' + (gain), G.mult > 1 ? '#ffe29a' : '#b7f5df', 13 + Math.min(6, G.mult));
  if (G.combo % 5 === 0) {
    bumpCombo();
    addFloater(px, py - 42, '连击 x' + G.mult + '！', '#ffd57f', 18);
  }
  sound.coin(1 + Math.min(.35, G.mult * .035));
}

function collectPickup(pk) {
  pk.taken = true;
  const p = G.player;
  const pr = project(pk.lane, pk.z);
  const py = project(0, pk.z).y - .7 * L.laneW * pr.t;
  if (pk.type === 'shield') {
    if (p.shield) G.score += 100;
    p.shield = true;
    showToast('获得 龙鳞护盾 · 可挡一次追捕', false);
    addFloater(pr.x, py - 10, '龙鳞护盾', '#ffe6a9', 18);
  } else {
    p.magnetT = Math.max(p.magnetT, 8);
    showToast('获得 聚玉符 · 自动收集玉玺 8 秒', false);
    addFloater(pr.x, py - 10, '聚玉符', '#a9ffe1', 18);
  }
  G.chaser.speech = SPEECH_POWER;
  G.chaser.speechT = 2.1;
  G.score += 60;
  spawnBurst(pr.x, py, pk.type === 'shield' ? '#ffe5a1' : '#9effdc', 22, 170);
  sound.power();
}

/* ----------------------------- drawing: background ----------------------------- */
function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, L.horizon * 1.08);
  g.addColorStop(0, '#040711');
  g.addColorStop(.3, '#091226');
  g.addColorStop(.56, '#14203d');
  g.addColorStop(.74, '#332746');
  g.addColorStop(.86, '#77464b');
  g.addColorStop(.95, '#c27655');
  g.addColorStop(1, '#e5a264');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, L.horizon + 2);
  ctx.fillStyle = '#0a0f1b';
  ctx.fillRect(0, L.horizon, W, H - L.horizon);

  // stars
  for (const s of G.stars) {
    const tw = .62 + .38 * Math.sin(G.time * s.s + s.p);
    ctx.globalAlpha = s.a * tw;
    ctx.fillStyle = '#ffe9c4';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // moon
  const mx = W * .735, my = H * .165, mr = Math.min(W, H) * .072;
  const halo = ctx.createRadialGradient(mx, my, mr * .18, mx, my, mr * 3.4);
  halo.addColorStop(0, 'rgba(255,225,171,.24)');
  halo.addColorStop(.35, 'rgba(255,196,122,.08)');
  halo.addColorStop(1, 'rgba(255,180,110,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - mr * 3.4, my - mr * 3.4, mr * 6.8, mr * 6.8);
  const moonG = ctx.createRadialGradient(mx - mr * .3, my - mr * .34, mr * .1, mx, my, mr);
  moonG.addColorStop(0, '#fff8df');
  moonG.addColorStop(.65, '#f7dba5');
  moonG.addColorStop(1, '#e4ae70');
  ctx.fillStyle = moonG;
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
  ctx.globalAlpha = .09;
  ctx.fillStyle = '#8b634a';
  ctx.beginPath(); ctx.arc(mx - mr * .33, my - mr * .1, mr * .18, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + mr * .28, my + mr * .22, mr * .12, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + mr * .03, my - mr * .36, mr * .08, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;

  // soft cloud banks
  const drift = Math.sin(G.time * .014) * W * .01;
  drawCloud(W * .18 + drift, H * .22, W * .3, H * .025, .17);
  drawCloud(W * .58 + drift * .6, H * .30, W * .38, H * .035, .13);
  drawCloud(W * .82 + drift, H * .12, W * .25, H * .025, .09);
}

function drawCloud(x, y, w, h, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#1a2038';
  ctx.beginPath();
  ctx.ellipse(x, y, w * .5, h, 0, 0, TAU);
  ctx.ellipse(x - w * .18, y + h * .2, w * .28, h * .7, 0, 0, TAU);
  ctx.ellipse(x + w * .2, y - h * .1, w * .3, h * .85, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = a * .28;
  ctx.fillStyle = '#d48e6f';
  ctx.beginPath();
  ctx.ellipse(x + w * .04, y + h * .35, w * .35, h * .18, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawMountains() {
  for (const layer of G.ridges) {
    ctx.beginPath();
    ctx.moveTo(-120, L.horizon + 70);
    for (const p of layer.pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(W + 120, L.horizon + 70);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, L.horizon - layer.amp, 0, L.horizon + 40);
    grad.addColorStop(0, layer.color);
    grad.addColorStop(1, '#09101e');
    ctx.fillStyle = grad;
    ctx.fill();
    // moonlit snow on the high faces
    ctx.save();
    ctx.globalAlpha = .2 + layer.snow * .22;
    ctx.fillStyle = '#c7d6e2';
    for (let i = 1; i < layer.pts.length - 1; i++) {
      const p = layer.pts[i];
      const prev = layer.pts[i - 1], next = layer.pts[i + 1];
      if (p.y < prev.y && p.y < next.y && p.y < layer.base - layer.amp * .35) {
        const spread = 12 + layer.snow * 18;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + 1);
        ctx.lineTo(p.x - spread, p.y + 9 + layer.snow * 15);
        ctx.lineTo(p.x - spread * .2, p.y + 6);
        ctx.lineTo(p.x + spread * .35, p.y + 12);
        ctx.lineTo(p.x + spread, p.y + 7 + layer.snow * 12);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = .45 + layer.snow * .2;
    ctx.strokeStyle = '#dfe7ed';
    ctx.lineWidth = Math.max(.6, 1.1 - layer.snow * .2);
    ctx.beginPath();
    for (let i = 0; i < layer.pts.length; i++) {
      const p = layer.pts[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawRoof(x, y, w, h, fill, snow) {
  const top = y - h * .78;
  ctx.save();
  const roofG = ctx.createLinearGradient(0, top, 0, y + h * .08);
  roofG.addColorStop(0, fill);
  roofG.addColorStop(.7, '#1e1117');
  roofG.addColorStop(1, '#3a1c20');
  ctx.fillStyle = roofG;
  ctx.beginPath();
  ctx.moveTo(x - w * .58, y + h * .07);
  ctx.bezierCurveTo(x - w * .47, y - h * .12, x - w * .34, y - h * .52, x - w * .15, top);
  ctx.quadraticCurveTo(x, top - h * .05, x + w * .15, top);
  ctx.bezierCurveTo(x + w * .34, y - h * .52, x + w * .47, y - h * .12, x + w * .58, y + h * .07);
  ctx.quadraticCurveTo(x + w * .34, y + h * .015, x + w * .22, y + h * .03);
  ctx.lineTo(x - w * .22, y + h * .03);
  ctx.quadraticCurveTo(x - w * .34, y + h * .015, x - w * .58, y + h * .07);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(186,134,69,.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // roof tiles
  ctx.strokeStyle = 'rgba(5,5,8,.34)';
  ctx.lineWidth = .7;
  for (let i = 1; i < 7; i++) {
    const u = (i / 7) * 2 - 1;
    const sx = x + u * w * .15;
    const ex = x + u * w * .5;
    ctx.beginPath();
    ctx.moveTo(sx, top + 1);
    ctx.quadraticCurveTo(x + u * w * .32, y - h * .34, ex, y + h * .03);
    ctx.stroke();
  }

  // ridge and snow
  ctx.strokeStyle = 'rgba(231,188,111,.72)';
  ctx.lineWidth = Math.max(1, w * .006);
  ctx.beginPath(); ctx.moveTo(x - w * .16, top); ctx.quadraticCurveTo(x, top - h * .05, x + w * .16, top); ctx.stroke();
  ctx.strokeStyle = snow;
  ctx.globalAlpha = .82;
  ctx.lineWidth = Math.max(1.2, h * .08);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - w * .47, y - h * .1);
  ctx.quadraticCurveTo(x - w * .25, top + h * .06, x - w * .02, top - h * .02);
  ctx.quadraticCurveTo(x + w * .25, top + h * .04, x + w * .45, y - h * .16);
  ctx.stroke();
  // upturned eave tips
  ctx.globalAlpha = .78;
  ctx.strokeStyle = '#d8b36b';
  ctx.lineWidth = Math.max(.8, h * .035);
  ctx.beginPath();
  ctx.moveTo(x - w * .58, y + h * .07);
  ctx.quadraticCurveTo(x - w * .63, y - h * .03, x - w * .55, y - h * .12);
  ctx.moveTo(x + w * .58, y + h * .07);
  ctx.quadraticCurveTo(x + w * .63, y - h * .03, x + w * .55, y - h * .12);
  ctx.stroke();
  ctx.restore();
}

function drawPalace() {
  const cx = L.cx, hor = L.horizon;
  // warm haze hanging over the palace
  const haze = ctx.createLinearGradient(0, hor - H * .18, 0, hor + H * .015);
  haze.addColorStop(0, 'rgba(217,143,86,0)');
  haze.addColorStop(.72, 'rgba(220,139,78,.12)');
  haze.addColorStop(1, 'rgba(233,156,84,.2)');
  ctx.fillStyle = haze;
  ctx.fillRect(cx - W * .48, hor - H * .18, W * .96, H * .2);
  const glow = ctx.createRadialGradient(cx, hor - H * .035, 0, cx, hor - H * .035, W * .3);
  glow.addColorStop(0, 'rgba(247,173,102,.13)');
  glow.addColorStop(1, 'rgba(247,173,102,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - W * .4, hor - H * .2, W * .8, H * .26);

  // distant watchtowers behind the wall
  [-1, 1].forEach((side, si) => {
    const tx = cx + side * W * .39;
    for (let tier = 0; tier < 2; tier++) {
      const tw = W * (.07 - tier * .012);
      const ty = hor - H * .045 - tier * H * .033;
      ctx.fillStyle = '#1c1018';
      ctx.fillRect(tx - tw * .22, ty, tw * .44, H * .025);
      drawRoof(tx, ty - 1, tw, H * .03, '#24131a', 'rgba(222,216,202,.5)');
    }
  });

  // city wall
  const wallTop = hor - H * .058;
  const wallG = ctx.createLinearGradient(0, wallTop, 0, hor + H * .03);
  wallG.addColorStop(0, '#3b1b22');
  wallG.addColorStop(.35, '#2b141c');
  wallG.addColorStop(1, '#170e15');
  ctx.fillStyle = wallG;
  ctx.fillRect(cx - W * .455, wallTop, W * .91, H * .088);
  // wall panel joints
  ctx.strokeStyle = 'rgba(10,5,10,.3)';
  ctx.lineWidth = .7;
  for (let i = 1; i < 30; i++) {
    const x = cx - W * .455 + i * W * .0303;
    ctx.beginPath(); ctx.moveTo(x, wallTop + H * .014); ctx.lineTo(x, hor + H * .032); ctx.stroke();
  }
  // snow cap
  ctx.fillStyle = 'rgba(229,231,226,.68)';
  ctx.fillRect(cx - W * .455, wallTop - 2, W * .91, 3);
  // battlements
  for (let i = 0; i < 34; i++) {
    const x = cx - W * .445 + i * W * .026;
    ctx.fillStyle = '#2a151d';
    ctx.fillRect(x, wallTop - H * .02, W * .013, H * .021);
    ctx.fillStyle = 'rgba(225,220,207,.52)';
    ctx.fillRect(x, wallTop - H * .022, W * .013, 2.2);
  }
  // wall banners
  [-1, 1].forEach(side => {
    const bx = cx + side * W * .16;
    ctx.fillStyle = 'rgba(113,25,31,.75)';
    ctx.fillRect(bx - W * .012, wallTop + H * .012, W * .024, H * .034);
    ctx.strokeStyle = 'rgba(224,177,92,.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - W * .012, wallTop + H * .012, W * .024, H * .034);
    ctx.fillStyle = 'rgba(255,218,142,.56)';
    ctx.font = `${Math.max(7, H * .012)}px "STKaiti","KaiTi",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('禁', bx, wallTop + H * .029);
  });

  // gate
  const gw = W * .1, gh = H * .1;
  ctx.fillStyle = '#3b1a21';
  ctx.fillRect(cx - gw / 2, hor - gh, gw, gh);
  ctx.fillStyle = '#0b0910';
  ctx.beginPath();
  ctx.moveTo(cx - gw * .31, hor);
  ctx.lineTo(cx - gw * .31, hor - gh * .56);
  ctx.quadraticCurveTo(cx, hor - gh * .91, cx + gw * .31, hor - gh * .56);
  ctx.lineTo(cx + gw * .31, hor);
  ctx.closePath();
  ctx.fill();
  // warm door light + steps
  const dg = ctx.createLinearGradient(0, hor - gh * .55, 0, hor);
  dg.addColorStop(0, 'rgba(255,197,119,.5)');
  dg.addColorStop(1, 'rgba(255,156,78,.12)');
  ctx.fillStyle = dg;
  ctx.fillRect(cx - gw * .19, hor - gh * .54, gw * .38, gh * .54);
  ctx.fillStyle = 'rgba(233,218,188,.16)';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(cx - gw * (.4 + i * .035), hor - 3 + i * 2, gw * .8, 1.4);
  }
  drawRoof(cx, hor - gh - 1, gw * 1.52, H * .055, '#25141a', 'rgba(234,228,212,.68)');
  // plaque
  ctx.fillStyle = '#191014';
  ctx.strokeStyle = 'rgba(224,178,96,.7)';
  ctx.lineWidth = 1.2;
  roundRect(cx - gw * .22, hor - gh - H * .026, gw * .44, H * .021, 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f3ce86';
  ctx.font = `700 ${Math.max(8, H * .014)}px "STKaiti","KaiTi",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('朱雀门', cx, hor - gh - H * .015);
  // gate lanterns
  [-1, 1].forEach(side => {
    const lx = cx + side * gw * .46, ly = hor - gh * .62;
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, gw * .22);
    lg.addColorStop(0, 'rgba(255,187,103,.35)');
    lg.addColorStop(1, 'rgba(255,155,77,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(lx, ly, gw * .22, 0, TAU); ctx.fill();
    ctx.fillStyle = '#bd3e34';
    ctx.beginPath(); ctx.ellipse(lx, ly, gw * .035, gw * .05, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,206,128,.65)';
    ctx.fillRect(lx - gw * .022, ly - gw * .057, gw * .044, 2);
  });

  // two towers
  [-1, 1].forEach((side, si) => {
    const tx = cx + side * W * .275;
    for (let tier = 0; tier < 3; tier++) {
      const ty = hor - H * .062 - tier * H * .03;
      const tw = W * (.085 - tier * .013);
      ctx.fillStyle = tier % 2 ? '#2c161e' : '#24131a';
      ctx.fillRect(tx - tw * .3, ty, tw * .6, H * .024);
      // tiny balcony
      ctx.fillStyle = 'rgba(205,161,88,.35)';
      ctx.fillRect(tx - tw * .34, ty + H * .008, tw * .68, 1);
      drawRoof(tx, ty - H * .001, tw, H * .037, '#2d181e', 'rgba(229,225,213,.62)');
      for (let w = 0; w < 4; w++) {
        ctx.globalAlpha = .36 + .2 * Math.sin(G.time * .8 + si + tier + w);
        ctx.fillStyle = '#ffc876';
        ctx.fillRect(tx - tw * .19 + w * tw * .13, ty + H * .008, tw * .055, H * .009);
      }
      ctx.globalAlpha = 1;
    }
  });
  // side halls
  [-1, 1].forEach(side => {
    const hx = cx + side * W * .365;
    const hw = W * .15;
    ctx.fillStyle = '#24131a';
    ctx.fillRect(hx - hw * .5, hor - H * .036, hw, H * .049);
    // columns
    for (let i = -2; i <= 2; i++) {
      ctx.fillStyle = 'rgba(116,46,42,.55)';
      ctx.fillRect(hx + i * hw * .16, hor - H * .036, Math.max(1, W * .003), H * .048);
    }
    drawRoof(hx, hor - H * .039, hw, H * .045, '#2c171d', 'rgba(228,222,211,.55)');
  });
}

function drawRoad() {
  // moonlit snow fields on either side of the avenue
  const ground = ctx.createLinearGradient(0, L.horizon, 0, H);
  ground.addColorStop(0, '#2b3852');
  ground.addColorStop(.28, '#1e2b44');
  ground.addColorStop(.62, '#111a2e');
  ground.addColorStop(1, '#080d19');
  ctx.fillStyle = ground;
  ctx.fillRect(0, L.horizon - 1, W, H - L.horizon + 1);
  // soft drifts
  for (let i = 0; i < 11; i++) {
    const side = i % 2 ? 1 : -1;
    const z = 7 + (i * 7.3) % 52;
    const p = project(side * (2.8 + (i % 3) * .7), z);
    const t = p.t;
    ctx.fillStyle = `rgba(197,214,229,${.04 + t * .06})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, L.laneW * .5 * t, L.laneW * .12 * t, side * .1, 0, TAU);
    ctx.fill();
  }

  // road body
  const far = project(0, 62), near = project(0, -1.1);
  const leftFar = project(-1.95, 62).x, rightFar = project(1.95, 62).x;
  const leftNear = project(-1.95, -1.1).x, rightNear = project(1.95, -1.1).x;
  ctx.beginPath();
  ctx.moveTo(leftFar, far.y); ctx.lineTo(rightFar, far.y);
  ctx.lineTo(rightNear, near.y); ctx.lineTo(leftNear, near.y);
  ctx.closePath();
  const roadG = ctx.createLinearGradient(0, far.y, 0, near.y);
  roadG.addColorStop(0, '#2b3347');
  roadG.addColorStop(.38, '#22293b');
  roadG.addColorStop(.8, '#181d2c');
  roadG.addColorStop(1, '#121622');
  ctx.fillStyle = roadG;
  ctx.fill();

  // warm center reflection
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const refl = ctx.createLinearGradient(0, far.y, 0, near.y);
  refl.addColorStop(0, 'rgba(223,155,80,.08)');
  refl.addColorStop(.55, 'rgba(228,160,84,.08)');
  refl.addColorStop(1, 'rgba(238,174,101,.02)');
  ctx.fillStyle = refl;
  ctx.fillRect(L.cx - W * .18, far.y, W * .36, near.y - far.y);
  ctx.restore();

  // side curbs
  [-1, 1].forEach(side => {
    ctx.beginPath();
    ctx.moveTo(project(side * 1.9, 62).x, project(0, 62).y);
    ctx.lineTo(project(side * 2.42, 62).x, project(0, 62).y);
    ctx.lineTo(project(side * 2.42, -1.1).x, project(0, -1.1).y);
    ctx.lineTo(project(side * 1.9, -1.1).x, project(0, -1.1).y);
    ctx.closePath();
    ctx.fillStyle = side < 0 ? '#1a1c27' : '#181a25';
    ctx.fill();
    ctx.strokeStyle = 'rgba(206,170,108,.22)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });

  // horizontal stone joints moving toward camera
  const spacing = 3.2;
  const offset = (G.distance * 1.0) % spacing;
  for (let i = 0; i < 24; i++) {
    const z = i * spacing - offset + 1.1;
    if (z < .3 || z > 58) continue;
    const y = groundY(z);
    if (y < L.horizon + 3) continue;
    const a = clamp(1 - z / 62, .035, .22);
    ctx.strokeStyle = `rgba(207,195,170,${a})`;
    ctx.lineWidth = Math.max(.5, 1.5 * project(0, z).t);
    ctx.beginPath();
    ctx.moveTo(project(-1.87, z).x, y);
    ctx.lineTo(project(1.87, z).x, y);
    ctx.stroke();
  }

  // lane divider perspective lines
  [-.55, .55].forEach(lx => {
    ctx.beginPath();
    const a = project(lx, 55), b = project(lx, -1);
    const grad = ctx.createLinearGradient(0, a.y, 0, b.y);
    grad.addColorStop(0, 'rgba(236,199,122,0)');
    grad.addColorStop(.25, 'rgba(236,199,122,.19)');
    grad.addColorStop(.72, 'rgba(236,199,122,.27)');
    grad.addColorStop(1, 'rgba(236,199,122,.03)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  });

  // dashes in the two dividers
  const dashOff = (G.distance * 1.3) % 6;
  for (let i = 0; i < 12; i++) {
    const z1 = i * 6 - dashOff + 1;
    const z2 = z1 + 2.2;
    if (z1 < .2) continue;
    if (z1 > 55) break;
    const t1 = project(0, z1).t, t2 = project(0, z2).t;
    const alpha = clamp(1 - z1 / 58, .07, .6);
    [-.55, .55].forEach(lx => {
      const a = project(lx, z1), b = project(lx, z2);
      ctx.strokeStyle = `rgba(245,205,120,${alpha})`;
      ctx.lineWidth = Math.max(.6, 2.2 * t1);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
  }

  // snow banks along curbs
  for (let i = 0; i < 18; i++) {
    const z = i * 3.5 - (G.distance * .9) % 3.5 + 1;
    if (z < .4 || z > 54) continue;
    const t = project(0, z).t;
    const a = clamp(1 - z / 62, .05, .27);
    [-1, 1].forEach(side => {
      const p = project(side * 2.15, z);
      ctx.fillStyle = `rgba(220,226,235,${a})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 1, (16 + Math.sin(i * 2.1) * 7) * t, 5 * t, 0, 0, TAU);
      ctx.fill();
    });
  }
}

function drawRailing() {
  const shift = (G.distance * 1.0) % 4;
  for (let i = 0; i < 16; i++) {
    const z = i * 4 - shift + 1.3;
    if (z < .7 || z > 52) continue;
    const t = project(0, z).t;
    if (t < .04) continue;
    const k = t / L.tp;
    const a = clamp(1 - z / 58, .08, .55);
    [-1, 1].forEach(side => {
      const p = project(side * 1.92, z);
      ctx.strokeStyle = `rgba(182,148,96,${a})`;
      ctx.lineWidth = Math.max(.7, 2.6 * k);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y - 27 * k);
      ctx.stroke();
      ctx.fillStyle = `rgba(232,238,239,${a * .8})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 27 * k, Math.max(1.2, 4.5 * k), Math.max(.6, 1.8 * k), 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(211,182,127,${a * .8})`;
      ctx.beginPath(); ctx.arc(p.x, p.y - 30 * k, Math.max(.7, 1.8 * k), 0, TAU); ctx.fill();
    });
  }
  // side rails
  [-1, 1].forEach(side => {
    ctx.beginPath();
    let first = true;
    for (let i = 0; i <= 18; i++) {
      const z = i * 3 - ((G.distance * 1.0) % 3) + .5;
      if (z < .5) continue;
      const p = project(side * 1.92, z);
      const hh = 24 * project(0, z).t / L.tp;
      if (first) { ctx.moveTo(p.x, p.y - hh); first = false; }
      else ctx.lineTo(p.x, p.y - hh);
    }
    ctx.strokeStyle = 'rgba(190,153,94,.26)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  });
}

/* ----------------------------- drawing: world ----------------------------- */
function drawLantern(side, z, seed) {
  const p = project(side * 2.14, z);
  const t = p.t;
  if (t < .03 || p.y < L.horizon) return;
  const k = t / L.tp;
  const h = L.laneW * .82 * k;
  const sway = Math.sin(G.time * 1.25 + seed) * 2.3 * k;
  ctx.save();
  ctx.globalAlpha = clamp(1 - z / 64, .15, 1);
  // warm pool on the snow / paving
  const pool = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 76 * k);
  pool.addColorStop(0, 'rgba(255,177,88,.14)');
  pool.addColorStop(.5, 'rgba(244,132,61,.06)');
  pool.addColorStop(1, 'rgba(244,132,61,0)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 1, 66 * k, 18 * k, 0, 0, TAU);
  ctx.fill();
  // post
  const grad = ctx.createLinearGradient(p.x - 3 * k, 0, p.x + 3 * k, 0);
  grad.addColorStop(0, '#291514');
  grad.addColorStop(.45, '#78342b');
  grad.addColorStop(1, '#1c1112');
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(.8, 5 * k);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - h); ctx.stroke();
  // cross arm
  ctx.lineWidth = Math.max(.6, 3 * k);
  ctx.beginPath(); ctx.moveTo(p.x - 10 * k, p.y - h + 4 * k); ctx.lineTo(p.x + 17 * k, p.y - h + 4 * k); ctx.stroke();
  // snow on arm
  ctx.strokeStyle = 'rgba(238,240,238,.55)';
  ctx.lineWidth = Math.max(.5, 1.6 * k);
  ctx.beginPath(); ctx.moveTo(p.x - 9 * k, p.y - h + 2 * k); ctx.lineTo(p.x + 16 * k, p.y - h + 2 * k); ctx.stroke();

  // glow
  const lx = p.x + 21 * k + sway, ly = p.y - h + 33 * k;
  const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 70 * k);
  glow.addColorStop(0, 'rgba(255,187,94,.34)');
  glow.addColorStop(.4, 'rgba(245,134,62,.11)');
  glow.addColorStop(1, 'rgba(245,134,62,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(lx, ly, 70 * k, 0, TAU); ctx.fill();
  // lantern body
  ctx.fillStyle = '#a72b2b';
  ctx.strokeStyle = 'rgba(255,205,126,.64)';
  ctx.lineWidth = Math.max(.5, 1.2 * k);
  ctx.beginPath(); ctx.ellipse(lx, ly, 14 * k, 19 * k, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,184,92,.28)';
  ctx.beginPath(); ctx.ellipse(lx - 3 * k, ly - 3 * k, 6 * k, 10 * k, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e4bc74';
  ctx.fillRect(lx - 8 * k, ly - 21 * k, 16 * k, 4 * k);
  ctx.fillRect(lx - 8 * k, ly + 17 * k, 16 * k, 4 * k);
  // snow on the cap
  ctx.fillStyle = 'rgba(245,246,241,.72)';
  ctx.beginPath(); ctx.ellipse(lx, ly - 21 * k, 8 * k, 1.8 * k, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#c7924d';
  ctx.lineWidth = Math.max(.5, 1.1 * k);
  ctx.beginPath(); ctx.moveTo(lx, ly + 21 * k); ctx.lineTo(lx, ly + 31 * k); ctx.stroke();
  ctx.restore();
}

function drawPine(side, z, seed) {
  const p = project(side * 3.1, z);
  const t = p.t;
  if (t < .025) return;
  const k = t / L.tp;
  const h = L.laneW * 1.55 * k;
  const w = L.laneW * .34 * k;
  ctx.save();
  ctx.globalAlpha = clamp(1 - z / 68, .1, .85);
  ctx.fillStyle = '#101a1c';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - w * .2, p.y - h);
  ctx.lineTo(p.x + w * .2, p.y - h);
  ctx.closePath(); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const yy = p.y - h * (.42 + i * .19);
    const ww = w * (1 - i * .2);
    ctx.fillStyle = i % 2 ? '#152326' : '#111d20';
    ctx.beginPath();
    ctx.moveTo(p.x, yy - h * .13);
    ctx.lineTo(p.x - ww * .5, yy);
    ctx.lineTo(p.x + ww * .5, yy);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(226,232,230,.44)';
    ctx.lineWidth = Math.max(.8, 2.1 * k);
    ctx.beginPath(); ctx.moveTo(p.x - ww * .5, yy); ctx.lineTo(p.x + ww * .5, yy); ctx.stroke();
    // snow resting on the branches
    ctx.fillStyle = 'rgba(220,230,237,.23)';
    ctx.beginPath();
    ctx.moveTo(p.x - ww * .42, yy - 1);
    ctx.quadraticCurveTo(p.x, yy - h * .045, p.x + ww * .42, yy - 1);
    ctx.quadraticCurveTo(p.x, yy + h * .02, p.x - ww * .42, yy - 1);
    ctx.fill();
  }
  ctx.restore();
}

function drawObstacle(o) {
  const p = project(o.lane, o.z);
  if (p.t < .025) return;
  const k = p.t / L.tp;
  const baseW = L.laneW * .78 * k;
  const alpha = clamp((o.z + 2.5) / 4, 0, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 2, baseW * .48, baseW * .08, 0, 0, TAU);
  ctx.fill();
  ctx.translate(p.x, p.y);
  if (o.full) {
    drawFullObstacle(o, k);
  } else {
    const u = baseW / 100;
    if (o.type === 'lion') drawLion(u, o.seed);
    else if (o.type === 'crate') drawCrate(u, o.seed);
    else if (o.type === 'barrier' || o.type === 'spikes') drawBarrier(u, o.seed);
    else if (o.type === 'beam') drawBeam(u, o.seed);
    else if (o.type === 'lantern') drawStoneLantern(u);
  }
  ctx.restore();
}

function drawLion(u, seed) {
  // pedestal
  const stone = ctx.createLinearGradient(-50 * u, -25 * u, 50 * u, 0);
  stone.addColorStop(0, '#59606a');
  stone.addColorStop(.45, '#363c46');
  stone.addColorStop(1, '#22262e');
  ctx.fillStyle = stone;
  roundRect(-45 * u, -22 * u, 90 * u, 22 * u, 3 * u); ctx.fill();
  ctx.fillStyle = '#787b7d';
  ctx.fillRect(-38 * u, -25 * u, 76 * u, 4 * u);
  // body
  ctx.fillStyle = '#3d424b';
  ctx.beginPath(); ctx.ellipse(0, -52 * u, 28 * u, 29 * u, 0, 0, TAU); ctx.fill();
  // mane
  ctx.fillStyle = '#272c34';
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU;
    const r = (i % 2 ? 30 : 24) * u;
    ctx.lineTo(Math.cos(a) * r, -77 * u + Math.sin(a) * r * .9);
  }
  ctx.closePath(); ctx.fill();
  // head
  ctx.fillStyle = '#5a5f66';
  ctx.beginPath(); ctx.ellipse(0, -77 * u, 20 * u, 19 * u, 0, 0, TAU); ctx.fill();
  // ears
  ctx.fillStyle = '#333840';
  ctx.beginPath(); ctx.ellipse(-17 * u, -91 * u, 6 * u, 4 * u, -.5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(17 * u, -91 * u, 6 * u, 4 * u, .5, 0, TAU); ctx.fill();
  // eyes
  ctx.fillStyle = '#f5c36b';
  ctx.beginPath(); ctx.arc(-7 * u, -80 * u, 2.6 * u, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(7 * u, -80 * u, 2.6 * u, 0, TAU); ctx.fill();
  // mouth + ribbon
  ctx.strokeStyle = '#1d2026'; ctx.lineWidth = 2 * u;
  ctx.beginPath(); ctx.arc(0, -72 * u, 8 * u, .15, Math.PI - .15); ctx.stroke();
  ctx.fillStyle = '#a7282f';
  ctx.fillRect(-23 * u, -100 * u, 46 * u, 5 * u);
  ctx.fillStyle = '#e2b45d';
  ctx.beginPath(); ctx.arc(0, -97 * u, 4 * u, 0, TAU); ctx.fill();
  // snow
  ctx.fillStyle = 'rgba(235,239,237,.55)';
  ctx.beginPath(); ctx.ellipse(-20 * u, -25 * u, 22 * u, 3 * u, -.08, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(24 * u, -92 * u, 10 * u, 3 * u, .1, 0, TAU); ctx.fill();
  // stone plaque
  ctx.fillStyle = '#22272f';
  roundRect(-14 * u, -40 * u, 28 * u, 14 * u, 1.5 * u); ctx.fill();
  ctx.fillStyle = 'rgba(235,201,133,.7)';
  ctx.font = `${10 * u}px "STKaiti","KaiTi",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('镇', 0, -33 * u);
}

function drawCrate(u) {
  const wood = ctx.createLinearGradient(-40 * u, 0, 40 * u, -70 * u);
  wood.addColorStop(0, '#5b3523');
  wood.addColorStop(.45, '#8d5731');
  wood.addColorStop(1, '#42271e');
  ctx.fillStyle = wood;
  roundRect(-38 * u, -72 * u, 76 * u, 72 * u, 3 * u); ctx.fill();
  ctx.strokeStyle = '#2d1a14'; ctx.lineWidth = 3 * u; ctx.stroke();
  ctx.strokeStyle = 'rgba(219,162,91,.35)'; ctx.lineWidth = 1.4 * u;
  ctx.beginPath(); ctx.moveTo(-31 * u, -65 * u); ctx.lineTo(31 * u, -7 * u); ctx.moveTo(31 * u, -65 * u); ctx.lineTo(-31 * u, -7 * u); ctx.stroke();
  ctx.strokeStyle = '#c49a54'; ctx.lineWidth = 2.2 * u;
  ctx.strokeRect(-28 * u, -62 * u, 56 * u, 52 * u);
  // red paper seal
  ctx.save();
  ctx.translate(0, -38 * u); ctx.rotate(-.08);
  ctx.fillStyle = '#b42e33';
  ctx.fillRect(-13 * u, -18 * u, 26 * u, 32 * u);
  ctx.strokeStyle = '#f0c178'; ctx.lineWidth = 1.5 * u;
  ctx.strokeRect(-9 * u, -14 * u, 18 * u, 24 * u);
  ctx.fillStyle = '#ffe5b2'; ctx.font = `${15 * u}px "STKaiti","KaiTi",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('封', 0, -2 * u);
  ctx.restore();
  ctx.fillStyle = 'rgba(236,240,236,.5)';
  ctx.fillRect(-38 * u, -75 * u, 76 * u, 3 * u);
}

function drawBarrier(u) {
  // legs
  ctx.strokeStyle = '#37201a'; ctx.lineWidth = 5 * u; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-30 * u, 0); ctx.lineTo(-23 * u, -55 * u); ctx.moveTo(30 * u, 0); ctx.lineTo(23 * u, -55 * u); ctx.stroke();
  // board
  const g = ctx.createLinearGradient(0, -78 * u, 0, -40 * u);
  g.addColorStop(0, '#b93838'); g.addColorStop(.5, '#8e2229'); g.addColorStop(1, '#5d141b');
  ctx.fillStyle = g;
  roundRect(-46 * u, -77 * u, 92 * u, 31 * u, 2 * u); ctx.fill();
  ctx.strokeStyle = '#e2b866'; ctx.lineWidth = 2 * u; ctx.stroke();
  ctx.fillStyle = '#f3d18b'; ctx.font = `${16 * u}px "STKaiti","KaiTi",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('禁 行', 0, -61 * u);
  // spikes/caps
  ctx.fillStyle = '#d9ab5e';
  for (let i = 0; i < 5; i++) {
    const x = -36 * u + i * 18 * u;
    ctx.beginPath(); ctx.moveTo(x, -77 * u); ctx.lineTo(x + 5 * u, -86 * u); ctx.lineTo(x + 10 * u, -77 * u); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(235,240,236,.55)';
  ctx.fillRect(-46 * u, -80 * u, 92 * u, 3 * u);
}

function drawBeam(u) {
  // posts
  ctx.strokeStyle = '#4d1d1c'; ctx.lineWidth = 6 * u;
  ctx.beginPath(); ctx.moveTo(-52 * u, 0); ctx.lineTo(-52 * u, -176 * u); ctx.moveTo(52 * u, 0); ctx.lineTo(52 * u, -176 * u); ctx.stroke();
  ctx.strokeStyle = '#d0a45d'; ctx.lineWidth = 1.4 * u;
  ctx.beginPath(); ctx.moveTo(-52 * u, 0); ctx.lineTo(-52 * u, -176 * u); ctx.moveTo(52 * u, 0); ctx.lineTo(52 * u, -176 * u); ctx.stroke();
  // crossbeam
  ctx.fillStyle = '#2a1717';
  ctx.fillRect(-58 * u, -181 * u, 116 * u, 14 * u);
  ctx.fillStyle = '#c49a56';
  ctx.fillRect(-58 * u, -181 * u, 116 * u, 2 * u);
  // banner
  const bg = ctx.createLinearGradient(0, -175 * u, 0, -112 * u);
  bg.addColorStop(0, '#9e2b2c');
  bg.addColorStop(1, '#4d1119');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-40 * u, -170 * u);
  ctx.lineTo(40 * u, -170 * u);
  ctx.lineTo(33 * u, -124 * u);
  ctx.lineTo(18 * u, -136 * u);
  ctx.lineTo(0, -114 * u);
  ctx.lineTo(-18 * u, -136 * u);
  ctx.lineTo(-33 * u, -124 * u);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(238,196,116,.7)'; ctx.lineWidth = 1.5 * u; ctx.stroke();
  ctx.fillStyle = '#f1d28f'; ctx.font = `${16 * u}px "STKaiti","KaiTi",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('低头', 0, -149 * u);
  // hanging lanterns
  ctx.fillStyle = '#c4463c';
  ctx.beginPath(); ctx.ellipse(-53 * u, -200 * u, 8 * u, 11 * u, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(53 * u, -200 * u, 8 * u, 11 * u, 0, 0, TAU); ctx.fill();
}

function drawStoneLantern(u) {
  // stone lantern block
  ctx.fillStyle = '#3f4650';
  roundRect(-25 * u, -20 * u, 50 * u, 20 * u, 2 * u); ctx.fill();
  ctx.fillStyle = '#575f69';
  ctx.fillRect(-8 * u, -66 * u, 16 * u, 46 * u);
  ctx.fillStyle = '#303740';
  ctx.fillRect(-25 * u, -78 * u, 50 * u, 14 * u);
  drawRoof(0, -78 * u, 58 * u, 15 * u, '#242a32', 'rgba(238,242,238,.55)');
  ctx.fillStyle = 'rgba(255,187,92,.42)';
  ctx.fillRect(-10 * u, -75 * u, 20 * u, 8 * u);
  ctx.fillStyle = '#4a515b';
  ctx.fillRect(-7 * u, -99 * u, 14 * u, 8 * u);
}

function drawFullObstacle(o, k) {
  const half = L.laneW * 1.65 * k;
  if (o.type === 'gate') {
    const clearance = L.heroH * .70 * k;
    const top = clearance + 26 * k;
    const beamH = 22 * k;
    // posts
    ctx.fillStyle = '#4c1f1d';
    ctx.fillRect(-half - 15 * k, -top - 88 * k, 30 * k, top + 88 * k);
    ctx.fillRect(half - 15 * k, -top - 88 * k, 30 * k, top + 88 * k);
    ctx.fillStyle = '#d1a259';
    ctx.fillRect(-half - 15 * k, -top - 88 * k, 30 * k, 3 * k);
    ctx.fillRect(half - 15 * k, -top - 88 * k, 30 * k, 3 * k);
    // roof / beam
    ctx.fillStyle = '#291718';
    ctx.fillRect(-half - 34 * k, -top - 88 * k, half * 2 + 68 * k, 13 * k);
    ctx.fillStyle = '#b68648';
    ctx.fillRect(-half - 34 * k, -top - 88 * k, half * 2 + 68 * k, 2 * k);
    // hanging red cloth
    const bg = ctx.createLinearGradient(0, -top, 0, -clearance);
    bg.addColorStop(0, '#a72d2e');
    bg.addColorStop(1, '#4c1018');
    ctx.fillStyle = bg;
    const clothTop = -top + 4 * k;
    const clothBottom = -clearance + 2 * k;
    ctx.beginPath();
    ctx.moveTo(-half + 8 * k, clothTop);
    ctx.lineTo(half - 8 * k, clothTop);
    ctx.lineTo(half - 22 * k, clothBottom + 8 * k);
    ctx.lineTo(half * .45, clothBottom);
    ctx.lineTo(0, clothBottom + 14 * k);
    ctx.lineTo(-half * .45, clothBottom);
    ctx.lineTo(-half + 22 * k, clothBottom + 8 * k);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(242,199,118,.6)';
    ctx.lineWidth = 1.4 * k; ctx.stroke();
    ctx.fillStyle = '#efd08f';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(9, 22 * k)}px "STKaiti","KaiTi",serif`;
    ctx.fillText('低 头', 0, -clearance - 26 * k);
    // lanterns
    ctx.fillStyle = '#d15545';
    [-half + 12 * k, half - 12 * k].forEach(x => {
      ctx.beginPath(); ctx.ellipse(x, -top + 18 * k, 9 * k, 13 * k, 0, 0, TAU); ctx.fill();
    });
    // snow line
    ctx.fillStyle = 'rgba(236,241,239,.55)';
    ctx.fillRect(-half - 34 * k, -top - 90 * k, half * 2 + 68 * k, 3 * k);
  } else {
    // low wall across the road
    const wallH = L.heroH * .16 * k;
    const g = ctx.createLinearGradient(0, -wallH, 0, 0);
    g.addColorStop(0, '#8c672f');
    g.addColorStop(.5, '#4a3221');
    g.addColorStop(1, '#261b16');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(-half, -wallH * .8);
    ctx.lineTo(-half + 12 * k, -wallH);
    ctx.lineTo(half - 12 * k, -wallH);
    ctx.lineTo(half, -wallH * .8);
    ctx.lineTo(half, 0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(225,181,98,.65)'; ctx.lineWidth = 2 * k; ctx.stroke();
    // spikes
    ctx.fillStyle = '#d6aa5c';
    for (let i = -5; i <= 5; i++) {
      const x = i * 24 * k;
      ctx.beginPath();
      ctx.moveTo(x - 8 * k, -wallH);
      ctx.lineTo(x, -wallH - 19 * k);
      ctx.lineTo(x + 8 * k, -wallH);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(240,241,236,.45)';
    ctx.fillRect(-half, -wallH - 3 * k, half * 2, 2 * k);
    ctx.fillStyle = '#efcf8b'; ctx.font = `${Math.max(8, 13 * k)}px "STKaiti","KaiTi",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('禁止通行', 0, -wallH * .42);
  }
}

function drawHazardTags() {
  const pl = G.player ? G.player.visualLane : 0;
  for (const o of G.obstacles) {
    if (o.resolved && o.z < L.pz) continue;
    if (o.z < L.pz - .5 || o.z > 11) continue;
    // Only tag the hazard in the runner's own lane (his big head hides it);
    // adjacent-lane hazards are already plainly visible.
    if (!o.full && Math.abs(o.lane - pl) > .55) continue;
    const p = project(o.full ? 0 : o.lane, o.z);
    if (!p || p.t < .03) continue;
    const k = p.t / L.tp;
    const baseW = L.laneW * .78 * k;
    let h = baseW;
    let label = '避', color = '#ff9b7d', glow = 'rgba(255,113,81,';
    if (o.full) {
      if (o.type === 'gate') { h = L.heroH * .78 * k; label = '伏'; color = '#92f2d8'; glow = 'rgba(91,224,192,'; }
      else { h = L.heroH * .24 * k; label = '跳'; color = '#ffdb8b'; glow = 'rgba(255,198,96,'; }
    } else if (o.type === 'barrier' || o.type === 'spikes') {
      h = baseW * .95; label = '跳'; color = '#ffdb8b'; glow = 'rgba(255,198,96,';
    } else if (o.type === 'beam') {
      h = baseW * 1.9; label = '伏'; color = '#92f2d8'; glow = 'rgba(91,224,192,';
    } else if (o.type === 'crate') {
      h = baseW * .82;
    } else if (o.type === 'lantern') {
      h = baseW * 1.02;
    } else {
      h = baseW * 1.02;
    }
    const y = p.y - h - 24;
    const alpha = clamp((o.z - L.pz) / 2.2, 0, 1) * clamp((11 - o.z) / 3.5, .2, 1);
    const x = o.full ? L.cx : p.x;
    ctx.save();
    ctx.globalAlpha = alpha;
    // thread
    ctx.strokeStyle = `${glow}.3)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(x, y + 11);
    ctx.lineTo(x, p.y - h + 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // small glow
    const rg = ctx.createRadialGradient(x, y, 0, x, y, 24);
    rg.addColorStop(0, `${glow}.17)`);
    rg.addColorStop(1, `${glow}0)`);
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(x, y, 24, 0, TAU); ctx.fill();
    // diamond tag
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(9,12,19,.78)';
    ctx.fillRect(-10, -10, 20, 20);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-10, -10, 20, 20);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = color;
    ctx.font = '700 12px "STKaiti","KaiTi",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }
}

function drawToken(tk) {
  if (tk.collected) return;
  const p = project(tk.lane, tk.z);
  if (p.t < .028) return;
  const k = p.t / L.tp;
  const x = p.x;
  const y = p.y - (tk.h + .22) * L.laneW * p.t;
  const size = L.laneW * .17 * k;
  const spin = Math.cos(G.time * 2.6 + tk.seed) * .8;
  const float = Math.sin(G.time * 2.3 + tk.seed) * 3 * k;
  ctx.save();
  ctx.translate(x, y + float);
  // glow
  const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.4);
  gl.addColorStop(0, 'rgba(98,241,201,.24)');
  gl.addColorStop(1, 'rgba(98,241,201,0)');
  ctx.fillStyle = gl;
  ctx.beginPath(); ctx.arc(0, 0, size * 2.4, 0, TAU); ctx.fill();
  ctx.scale(spin, 1);
  // seal token
  const g = ctx.createLinearGradient(-size, -size, size, size);
  g.addColorStop(0, '#9effe0');
  g.addColorStop(.32, '#3bc99f');
  g.addColorStop(.7, '#16856f');
  g.addColorStop(1, '#0c5c51');
  ctx.fillStyle = g;
  roundRect(-size * .72, -size * .86, size * 1.44, size * 1.7, size * .18); ctx.fill();
  ctx.strokeStyle = 'rgba(255,226,153,.9)'; ctx.lineWidth = Math.max(.7, size * .075); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,238,174,.45)'; ctx.lineWidth = Math.max(.4, size * .03);
  ctx.strokeRect(-size * .53, -size * .65, size * 1.06, size * 1.25);
  ctx.fillStyle = 'rgba(255,239,178,.92)';
  ctx.font = `700 ${size * .8}px "STKaiti","KaiTi",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('玉', 0, size * .04);
  // sparkle
  const tw = .5 + .5 * Math.sin(G.time * 4 + tk.seed);
  ctx.fillStyle = `rgba(255,250,218,${.6 * tw})`;
  ctx.beginPath();
  ctx.moveTo(size * 1.2, -size * 1.2);
  ctx.lineTo(size * 1.28, -size * .95);
  ctx.lineTo(size * 1.55, -size * .88);
  ctx.lineTo(size * 1.28, -size * .8);
  ctx.lineTo(size * 1.2, -size * .55);
  ctx.lineTo(size * 1.12, -size * .8);
  ctx.lineTo(size * .85, -size * .88);
  ctx.lineTo(size * 1.12, -size * .95);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawPickup(pk) {
  if (pk.taken) return;
  const p = project(pk.lane, pk.z);
  if (p.t < .03) return;
  const k = p.t / L.tp;
  const size = L.laneW * .22 * k;
  const y = p.y - (.75 + Math.sin(G.time * 2.2 + pk.seed) * .04) * L.laneW * p.t;
  ctx.save();
  ctx.translate(p.x, y);
  const isShield = pk.type === 'shield';
  const col = isShield ? '255,211,118' : '105,234,200';
  const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 3);
  gl.addColorStop(0, `rgba(${col},.3)`);
  gl.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = gl;
  ctx.beginPath(); ctx.arc(0, 0, size * 3, 0, TAU); ctx.fill();
  ctx.rotate(Math.sin(G.time * 1.4 + pk.seed) * .1);
  const g = ctx.createLinearGradient(-size, -size, size, size);
  if (isShield) {
    g.addColorStop(0, '#fff1c1'); g.addColorStop(.5, '#d8a64c'); g.addColorStop(1, '#83521e');
  } else {
    g.addColorStop(0, '#c4fff0'); g.addColorStop(.5, '#4ad2b0'); g.addColorStop(1, '#146958');
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU - Math.PI / 8;
    const r = i % 2 ? size * .86 : size;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,244,207,.85)'; ctx.lineWidth = Math.max(.6, size * .06); ctx.stroke();
  ctx.fillStyle = isShield ? '#3a2108' : '#04251e';
  ctx.beginPath(); ctx.arc(0, 0, size * .53, 0, TAU); ctx.fill();
  ctx.fillStyle = isShield ? '#ffe7a5' : '#b8ffe8';
  ctx.font = `700 ${size * .6}px "STKaiti","KaiTi",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(isShield ? '盾' : '吸', 0, size * .08);
  ctx.restore();
}

/* ----------------------------- drawing: characters ----------------------------- */
function drawHero() {
  const p = G.player;
  if (!p) return;
  const pr = project(p.visualLane, L.pz);
  const x = pr.x;
  const ground = pr.y;
  const jumpPx = p.jumpY * L.laneW * pr.t;
  const sliding = p.sliding;
  const h = L.heroH * (sliding ? .72 : 1);
  const headH = L.heroH * (sliding ? .55 : .60);
  const headW = headH * (640 / 898);
  const bodyH = h * .48;
  const feet = ground - jumpPx + (sliding ? L.heroH * .015 : 0);
  const bodyTop = feet - bodyH;
  const headBottom = feet - (sliding ? L.heroH * .10 : L.heroH * .40);
  const headTop = headBottom - headH;
  const bodyW = h * .25;
  const phase = p.phase;
  const runAmp = sliding ? 0 : (p.jumpY > .02 ? .35 : 1);
  const swing = Math.sin(phase) * runAmp;
  const swing2 = Math.sin(phase + Math.PI) * runAmp;
  const bob = Math.sin(phase * 2) * h * .012 * (p.jumpY > .02 ? .2 : 1);
  const lean = p.lean * .22 + (sliding ? .34 : 0);

  // shadow
  const shScale = clamp(1 - p.jumpY * .7, .45, 1);
  ctx.save();
  ctx.globalAlpha = .34 * shScale;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, ground + 2, bodyW * .72 * shScale, h * .035 * shScale, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // dust when landing
  if (p.land > .15) {
    ctx.globalAlpha = p.land * .3;
  }

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.translate(x, bob);
  // hit flash on whole character
  if (p.hitT > 0 && Math.sin(G.time * 45) > 0) ctx.globalAlpha = .65;
  ctx.rotate(lean * .28);
  // trailing silk scarf — two ribbons, not a tail
  const wind = Math.sin(G.time * 5.2) * 5;
  ctx.save();
  ctx.translate(-bodyW * .16, bodyTop + h * .07);
  ctx.rotate(-.16);
  ctx.lineCap = 'round';
  const ribbon = (offset, length, width, alpha) => {
    ctx.strokeStyle = `rgba(240,187,95,${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(0, offset);
    ctx.bezierCurveTo(-h * .1, -h * .025 + wind + offset, -h * .21, h * .075 + wind * .6 + offset, -h * length, h * .02 + wind * .35 + offset);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,237,184,${alpha * .55})`;
    ctx.lineWidth = Math.max(.6, width * .35);
    ctx.beginPath();
    ctx.moveTo(-h * .02, offset + h * .007);
    ctx.bezierCurveTo(-h * .11, -h * .015 + wind + offset, -h * .2, h * .065 + wind * .6 + offset, -h * (length - .02), h * .014 + wind * .35 + offset);
    ctx.stroke();
  };
  ribbon(-h * .014, .29, h * .025, .9);
  ribbon(h * .012, .22, h * .017, .65);
  // knot
  ctx.fillStyle = '#e9b765';
  ctx.beginPath(); ctx.ellipse(-h * .006, 0, h * .018, h * .02, -.2, 0, TAU); ctx.fill();
  ctx.restore();

  // legs
  drawHeroLeg(-1, swing, h, bodyH, feet);
  drawHeroLeg(1, swing2, h, bodyH, feet);

  // body robe
  const robe = ctx.createLinearGradient(-bodyW * .5, bodyTop, bodyW * .5, feet);
  robe.addColorStop(0, '#b23432');
  robe.addColorStop(.42, '#89232a');
  robe.addColorStop(.8, '#5d1721');
  robe.addColorStop(1, '#3f111a');
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-bodyW * .46, bodyTop + h * .02);
  ctx.quadraticCurveTo(-bodyW * .66, bodyTop + h * .15, -bodyW * .52, feet - h * .14);
  ctx.lineTo(-bodyW * .25, feet - h * .10);
  ctx.lineTo(0, feet - h * .155);
  ctx.lineTo(bodyW * .25, feet - h * .10);
  ctx.lineTo(bodyW * .52, feet - h * .14);
  ctx.quadraticCurveTo(bodyW * .66, bodyTop + h * .15, bodyW * .46, bodyTop + h * .02);
  ctx.quadraticCurveTo(0, bodyTop - h * .035, -bodyW * .46, bodyTop + h * .02);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(238,186,105,.6)';
  ctx.lineWidth = Math.max(1, h * .006); ctx.stroke();
  // robe lapel
  ctx.strokeStyle = 'rgba(255,219,151,.78)';
  ctx.lineWidth = Math.max(1.2, h * .009);
  ctx.beginPath();
  ctx.moveTo(-bodyW * .2, bodyTop + h * .025);
  ctx.quadraticCurveTo(-bodyW * .07, bodyTop + h * .15, 0, bodyTop + h * .215);
  ctx.quadraticCurveTo(bodyW * .07, bodyTop + h * .15, bodyW * .2, bodyTop + h * .025);
  ctx.stroke();
  // front panel and hem trim
  ctx.fillStyle = 'rgba(49,13,19,.36)';
  ctx.beginPath();
  ctx.moveTo(-bodyW * .12, bodyTop + h * .21);
  ctx.lineTo(bodyW * .12, bodyTop + h * .21);
  ctx.lineTo(bodyW * .2, feet - h * .15);
  ctx.lineTo(-bodyW * .2, feet - h * .15);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(226,177,95,.55)';
  ctx.lineWidth = Math.max(1, h * .005);
  ctx.beginPath();
  ctx.moveTo(-bodyW * .52, feet - h * .14);
  ctx.quadraticCurveTo(0, feet - h * .1, bodyW * .52, feet - h * .14);
  ctx.stroke();
  // belt
  ctx.fillStyle = '#261814';
  ctx.fillRect(-bodyW * .48, feet - h * .255, bodyW * .96, h * .05);
  ctx.fillStyle = '#e1ac55';
  ctx.fillRect(-bodyW * .46, feet - h * .26, bodyW * .92, h * .009);
  ctx.fillStyle = '#50dcb6';
  roundRect(-h * .03, feet - h * .272, h * .06, h * .047, h * .012); ctx.fill();
  ctx.strokeStyle = 'rgba(255,241,183,.75)'; ctx.lineWidth = 1; ctx.stroke();
  // shoulder pauldrons
  [-1, 1].forEach(side => {
    const sx = side * bodyW * .41, sy = bodyTop + h * .055;
    const sg = ctx.createRadialGradient(sx - h * .01, sy - h * .01, 0, sx, sy, h * .045);
    sg.addColorStop(0, '#f5d489');
    sg.addColorStop(.65, '#b77a31');
    sg.addColorStop(1, '#5e3518');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(sx, sy, h * .052, h * .035, side * .18, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,158,.65)'; ctx.lineWidth = 1; ctx.stroke();
  });
  // arms
  drawHeroArm(-1, swing2, h, bodyTop, bodyW, p);
  drawHeroArm(1, swing, h, bodyTop, bodyW, p);
  // head
  if (IMG.hero) {
    ctx.save();
    ctx.translate(0, headBottom + h * .01);
    ctx.rotate(-lean * .32 + Math.sin(phase * 2) * .012);
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = h * .04;
    ctx.shadowOffsetY = h * .018;
    ctx.drawImage(IMG.hero, -headW / 2, -headH, headW, headH);
    ctx.restore();
  } else {
    ctx.fillStyle = '#d6a281';
    ctx.beginPath(); ctx.ellipse(0, headBottom - headH * .5, headW * .35, headH * .35, 0, 0, TAU); ctx.fill();
  }
  // shield aura
  if (p.shield) {
    ctx.save();
    ctx.globalAlpha = .65;
    const cy = headBottom - headH * .45;
    const aura = ctx.createRadialGradient(0, cy, headW * .2, 0, cy, headW * 1.25);
    aura.addColorStop(0, 'rgba(255,219,129,0)');
    aura.addColorStop(.7, 'rgba(255,206,106,.1)');
    aura.addColorStop(1, 'rgba(255,190,76,.3)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.ellipse(0, cy, headW * 1.15, headH * .72, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,151,.3)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(0, cy, headW * 1.02, headH * .64, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  // magnet aura
  if (p.magnetT > 0) {
    ctx.save();
    ctx.globalAlpha = .32 + .12 * Math.sin(G.time * 6);
    ctx.strokeStyle = '#78ffe0';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const rr = headW * (.7 + i * .17) + Math.sin(G.time * 3 + i) * 4;
      ctx.beginPath(); ctx.ellipse(0, headBottom - headH * .35, rr, rr * .8, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawHeroLeg(side, swing, h, bodyH, feet) {
  const hipX = side * h * .075;
  const hipY = feet - h * .25;
  const kick = swing * h * .12;
  const lift = Math.max(0, swing) * h * .075;
  const kneeX = hipX + kick * .5;
  const kneeY = hipY + h * .105;
  const footX = hipX + kick;
  const footY = feet - lift;
  ctx.save();
  // dark trousers
  ctx.strokeStyle = '#2a1d1c';
  ctx.lineWidth = h * .062;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.quadraticCurveTo(kneeX, kneeY, footX, footY - h * .022);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,218,153,.15)';
  ctx.lineWidth = h * .012;
  ctx.stroke();
  // gold ankle wrap
  ctx.strokeStyle = '#c99b4d';
  ctx.lineWidth = h * .014;
  ctx.beginPath();
  ctx.moveTo(footX - h * .02, footY - h * .038);
  ctx.lineTo(footX + h * .02, footY - h * .038);
  ctx.stroke();
  // boot
  ctx.fillStyle = '#171213';
  ctx.beginPath();
  ctx.ellipse(footX + side * h * .014, footY - h * .008, h * .056, h * .026, side * .06, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(219,170,79,.45)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#d9a54e';
  ctx.beginPath();
  ctx.ellipse(footX + side * h * .034, footY - h * .008, h * .018, h * .009, side * .06, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawHeroArm(side, swing, h, bodyTop, bodyW, p) {
  const shoulderX = side * bodyW * .38;
  const shoulderY = bodyTop + h * .09;
  const elbowX = side * bodyW * .62 + swing * h * .045;
  const elbowY = shoulderY + h * .13 - Math.max(0, swing) * h * .04;
  const handX = side * bodyW * .7 + swing * h * .08;
  const handY = shoulderY + h * .21 - Math.max(0, swing) * h * .08;
  ctx.save();
  // sleeve
  ctx.strokeStyle = '#721b22';
  ctx.lineWidth = h * .07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.quadraticCurveTo(elbowX, elbowY, handX, handY);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(235,180,98,.35)';
  ctx.lineWidth = h * .012;
  ctx.stroke();
  // cuff
  ctx.fillStyle = '#d2a050';
  ctx.beginPath(); ctx.arc(handX, handY, h * .026, 0, TAU); ctx.fill();
  // hand
  ctx.fillStyle = '#d9a17c';
  ctx.beginPath(); ctx.arc(handX + side * h * .012, handY + h * .02, h * .022, 0, TAU); ctx.fill();
  // seal in right hand
  if (side === 1) {
    ctx.save();
    ctx.translate(handX + h * .02, handY + h * .05);
    ctx.rotate(-.2);
    ctx.shadowColor = 'rgba(93,246,202,.6)';
    ctx.shadowBlur = h * .04;
    ctx.fillStyle = '#38c7a3';
    roundRect(-h * .032, -h * .045, h * .064, h * .075, h * .008); ctx.fill();
    ctx.strokeStyle = '#ffe3a1'; ctx.lineWidth = Math.max(.8, h * .005); ctx.stroke();
    ctx.fillStyle = '#ffe9b5';
    ctx.font = `${h * .028}px "STKaiti","KaiTi",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('玺', 0, -h * .008);
    ctx.restore();
  }
  ctx.restore();
}

function drawChaser() {
  const c = G.chaser;
  if (!c) return;
  let z = c.z;
  const closeness = clamp(1 - G.lead / 44, 0, 1);
  const sideOffset = 1.02 - closeness * .5;
  let lane = c.visualLane - sideOffset;
  let lunge = 0;
  if (G.phase === 'caught') {
    const tt = clamp(G.caughtT / .9, 0, 1);
    lunge = easeOut(tt);
    z = lerp(c.z, L.pz - .9, lunge);
    lane = lerp(c.visualLane - sideOffset, G.player.visualLane, lunge);
  }
  const p = project(lane, z);
  const k = p.t / L.tp;
  const bounce = Math.sin(G.time * (G.phase === 'menu' ? 5 : 10)) * 3;
  const h = L.heroH * .76 * k * (1 + closeness * .12) * (1 + lunge * .45);
  const w = h * (CHASER_META.frameW / CHASER_META.frameH);
  const x = p.x;
  const y = p.y + bounce;
  if (!IMG.chaser) return;
  // shadow
  ctx.save();
  ctx.globalAlpha = .3;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, p.y + 2, w * .34, h * .04, 0, 0, TAU); ctx.fill();
  ctx.restore();
  // danger aura
  if (G.lead < 14 || lunge > 0) {
    const aura = ctx.createRadialGradient(x, y - h * .6, h * .12, x, y - h * .6, h * .75);
    aura.addColorStop(0, `rgba(228,65,54,${.13 + .09 * Math.sin(G.time * 5)})`);
    aura.addColorStop(1, 'rgba(228,65,54,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(x, y - h * .6, h * .8, 0, TAU); ctx.fill();
  }
  const frame = Math.floor(G.time * CHASER_META.fps) % CHASER_META.count;
  const col = frame % CHASER_META.cols;
  const row = Math.floor(frame / CHASER_META.cols);
  const sx = col * CHASER_META.frameW;
  const sy = row * CHASER_META.frameH;
  ctx.save();
  ctx.translate(x, y - h * .02);
  ctx.rotate(Math.sin(G.time * 7) * .025 + (G.phase === 'caught' ? -.08 : 0));
  ctx.shadowColor = 'rgba(0,0,0,.38)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;
  ctx.drawImage(IMG.chaser, sx, sy, CHASER_META.frameW, CHASER_META.frameH, -w / 2, -h, w, h);
  ctx.restore();

  // speech bubble
  if (c.speechT > 0 && c.speech && G.phase !== 'menu') {
    drawSpeechBubble(x, y - h - 8, c.speech, Math.max(.7, k * .9 + .2));
  }
  // alert icon
  if (G.lead < 9 && G.phase === 'playing') {
    const ay = y - h - 16 + Math.sin(G.time * 6) * 3;
    ctx.save();
    ctx.translate(x + w * .48, ay);
    ctx.fillStyle = '#e7473d';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe6ae';
    ctx.font = '700 13px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 1);
    ctx.restore();
  }
}

function drawSpeechBubble(x, y, text, scale) {
  const fs = Math.max(11, 13 * scale);
  ctx.save();
  ctx.font = `700 ${fs}px "STKaiti","KaiTi",serif`;
  const tw = ctx.measureText(text).width;
  const pw = tw + 20 * scale;
  const ph = 29 * scale;
  const bx = x - pw / 2;
  const by = y - ph;
  ctx.globalAlpha = clamp(G.chaser.speechT, 0, 1);
  ctx.fillStyle = 'rgba(255,246,222,.94)';
  ctx.strokeStyle = 'rgba(69,39,23,.22)';
  ctx.lineWidth = 1;
  roundRect(bx, by, pw, ph, 4 * scale); ctx.fill(); ctx.stroke();
  // tail
  ctx.beginPath();
  ctx.moveTo(x - 5 * scale, by + ph - 1);
  ctx.lineTo(x + 2 * scale, by + ph + 8 * scale);
  ctx.lineTo(x + 7 * scale, by + ph - 1);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#43291f';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, by + ph * .51);
  ctx.restore();
}

/* ----------------------------- drawing: environment overlay ----------------------------- */
function drawSnow() {
  for (const s of G.snow) {
    const a = s.a * (.45 + s.z * .55);
    ctx.globalAlpha = a;
    ctx.fillStyle = s.z > .7 ? '#fff8e7' : '#d4dee9';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * (.55 + s.z * .9), 0, TAU);
    ctx.fill();
    if (s.z > .92) {
      ctx.globalAlpha = a * .16;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 4.5, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawSpeedLines() {
  const inten = clamp((G.worldSpeed - 22) / 18, 0, 1);
  if (inten <= 0) return;
  ctx.save();
  ctx.globalAlpha = inten * .22;
  ctx.strokeStyle = '#ffe8ba';
  ctx.lineWidth = 1;
  const t = G.time;
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const x = L.cx + side * (W * .29 + (i * 37 % (W * .18)));
    const y = L.horizon + ((t * 760 + i * 137) % (H - L.horizon));
    const len = 22 + (i * 13 % 55);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * len * .35, y + len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVignette() {
  const g = ctx.createRadialGradient(L.cx, H * .48, Math.min(W, H) * .22, L.cx, H * .5, Math.max(W, H) * .74);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(.68, 'rgba(3,5,10,.18)');
  g.addColorStop(1, 'rgba(2,3,8,.68)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // bottom warm haze
  const b = ctx.createLinearGradient(0, H * .78, 0, H);
  b.addColorStop(0, 'rgba(70,35,24,0)');
  b.addColorStop(1, 'rgba(45,22,17,.28)');
  ctx.fillStyle = b;
  ctx.fillRect(0, H * .78, W, H * .22);
  // danger edges
  if (G.phase !== 'menu' && G.lead < 14) {
    const d = clamp(1 - G.lead / 14, 0, 1);
    const pulse = .5 + .5 * Math.sin(G.time * 4.2);
    const rg = ctx.createRadialGradient(L.cx, H * .52, Math.min(W, H) * .18, L.cx, H * .52, Math.max(W, H) * .68);
    rg.addColorStop(0, 'rgba(138,15,20,0)');
    rg.addColorStop(.65, `rgba(156,20,24,${.04 * d * pulse})`);
    rg.addColorStop(1, `rgba(156,20,24,${.25 * d + .08 * d * pulse})`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
  if (G.flash > 0) {
    ctx.fillStyle = `rgba(${G.flashColor},${G.flash * .5})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawForegroundUI() {
  // subtle top light
  const g = ctx.createLinearGradient(0, 0, 0, H * .17);
  g.addColorStop(0, 'rgba(0,0,0,.36)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * .17);
}

function drawForegroundAtmosphere() {
  // out-of-focus lanterns at the edges, like a cinematic foreground
  const r = Math.min(W, H) * .055;
  [-1, 1].forEach(side => {
    const x = side < 0 ? W * .025 : W * .975;
    const y = H * .64;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.3);
    g.addColorStop(0, 'rgba(255,156,81,.12)');
    g.addColorStop(.4, 'rgba(196,72,52,.07)');
    g.addColorStop(1, 'rgba(196,72,52,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 2.3, 0, TAU); ctx.fill();
    ctx.globalAlpha = .16;
    ctx.fillStyle = '#9d2e2f';
    ctx.beginPath(); ctx.ellipse(x, y, r * .45, r * .7, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  });
  // a few huge, soft flakes that read as close to the lens
  for (let i = 0; i < 8; i++) {
    const x = ((i * 191 + G.time * (7 + i % 3)) % (W + 80)) - 40;
    const y = ((i * 271 + G.time * (9 + i % 4)) % (H + 80)) - 40;
    const rr = 8 + (i % 4) * 6;
    ctx.globalAlpha = .055 + (i % 3) * .016;
    ctx.fillStyle = '#eef6ff';
    ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ----------------------------- scene composition ----------------------------- */
function getWorldObjects() {
  const arr = [];
  // side lanterns
  for (const side of [-1, 1]) {
    const off = (G.distance * 1.02) % 9;
    for (let i = 0; i < 8; i++) {
      let z = i * 9 - off + 2.5;
      if (z < .4 || z > 66) continue;
      arr.push({ kind: 'lantern', side, z, seed: i + (side > 0 ? 4 : 0) });
    }
  }
  // pines
  for (const side of [-1, 1]) {
    const off = (G.distance * .76 + 4) % 15;
    for (let i = 0; i < 5; i++) {
      let z = i * 15 - off + 5;
      if (z < 1 || z > 68) continue;
      arr.push({ kind: 'pine', side, z, seed: i });
    }
  }
  for (const o of G.obstacles) arr.push({ kind: 'obstacle', z: o.z, o });
  for (const t of G.tokens) arr.push({ kind: 'token', z: t.z, o: t });
  for (const p of G.pickups) arr.push({ kind: 'pickup', z: p.z, o: p });
  return arr;
}

function drawWorldObjects(list) {
  for (const d of list) {
    if (d.kind === 'lantern') drawLantern(d.side, d.z, d.seed);
    else if (d.kind === 'pine') drawPine(d.side, d.z, d.seed);
    else if (d.kind === 'obstacle') drawObstacle(d.o);
    else if (d.kind === 'token') drawToken(d.o);
    else if (d.kind === 'pickup') drawPickup(d.o);
  }
}

function drawScene() {
  ctx.save();
  if (G.shake > .2) {
    ctx.translate(rand(-G.shake, G.shake) * .5, rand(-G.shake, G.shake) * .35);
  }
  drawSky();
  drawMountains();
  drawPalace();
  drawRoad();
  drawRailing();

  const inGame = G.phase !== 'menu' && G.phase !== 'loading';
  if (!inGame) {
    const objects = getWorldObjects();
    objects.sort((a, b) => b.z - a.z);
    drawWorldObjects(objects);
  } else {
    const objects = getWorldObjects();
    objects.sort((a, b) => b.z - a.z);
    const cz = G.chaser ? G.chaser.z : 4;
    const pz = L.pz;
    if (G.phase === 'caught') {
      let i = 0;
      while (i < objects.length && objects[i].z > pz) {
        drawWorldObjects([objects[i]]);
        i++;
      }
      drawHero();
      drawChaser();
      while (i < objects.length) {
        ctx.save();
        ctx.globalAlpha = clamp((objects[i].z + 2.2) / 3.5, 0, 1);
        drawWorldObjects([objects[i]]);
        ctx.restore();
        i++;
      }
    } else {
      // far side of the chaser
      let i = 0;
      while (i < objects.length && objects[i].z > cz) {
        drawWorldObjects([objects[i]]);
        i++;
      }
      drawChaser();
      // between chaser and player
      while (i < objects.length && objects[i].z > pz) {
        drawWorldObjects([objects[i]]);
        i++;
      }
      drawHero();
      // objects already passed the player
      while (i < objects.length) {
        ctx.save();
        ctx.globalAlpha = clamp((objects[i].z + 2.2) / 3.5, 0, 1);
        drawWorldObjects([objects[i]]);
        ctx.restore();
        i++;
      }
      drawHazardTags();
    }
  }

  drawSnow();
  drawParticles();
  drawSpeedLines();
  ctx.restore();

  drawVignette();
  drawForegroundAtmosphere();
  drawForegroundUI();
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawScene();
}

/* ----------------------------- boot / loop ----------------------------- */
function setMenuImages() {
  if (IMG.hero) {
    $('#menuHeroImg').src = IMG.hero.src;
    $('#mobileHeroImg').src = IMG.hero.src;
  }
  if (IMG.poster) $('#posterImg').src = IMG.poster.src;
  if (IMG.cutout) {
    $('#caughtImg').src = IMG.cutout.src;
    $('#mobileChaserImg').src = IMG.cutout.src;
  }
  document.querySelectorAll('.logo-char').forEach(ch => ch.setAttribute('data-char', ch.textContent));
  el.menuBest.textContent = fmt(G.best.score);
}

function handleResize() {
  computeLayout();
}

window.addEventListener('resize', () => {
  clearTimeout(handleResize._t);
  handleResize._t = setTimeout(handleResize, 80);
  document.body.classList.toggle('is-touch', isTouch());
});
window.addEventListener('orientationchange', () => setTimeout(handleResize, 160));

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

async function boot() {
  computeLayout();
  document.body.classList.toggle('is-touch', isTouch());
  syncMute();
  setMenuSpeech();
  try {
    const [hero, chaser, poster, cutout] = await Promise.all([
      loadImage(ASSET_SRC.hero),
      loadImage(ASSET_SRC.chaser),
      loadImage(ASSET_SRC.poster),
      loadImage(ASSET_SRC.cutout)
    ]);
    IMG.hero = hero; IMG.chaser = chaser; IMG.poster = poster; IMG.cutout = cutout;
  } catch (e) {
    console.error(e);
    const loading = el.loading;
    loading.querySelector('p').textContent = '素材没有加载成功，请确认 assets 文件夹完整。';
    return;
  }
  setMenuImages();
  el.loading.classList.add('hidden');
  el.menu.classList.remove('hidden');
  setPhase('menu');
  G.distance = 0;
  G.player = makePlayer();
  G.chaser = makeChaser();
  updateHUD(true);
  setMenuSpeech();
  requestAnimationFrame(loop);
  const params = new URLSearchParams(location.search);
  if (params.has('autostart')) {
    setTimeout(() => startGame(), 120);
    if (params.has('skipintro')) setTimeout(() => { G.introT = -.01; }, 500);
  }
}

// expose a tiny debug hook for automated smoke tests (harmless in normal play)
window.YUXI = {
  start: startGame,
  state: () => ({ phase: G.phase, score: G.score, distance: G.distance, lead: G.lead, speed: G.speed, player: G.player && { lane: G.player.lane, jump: +G.player.jumpY.toFixed(2), slide: G.player.sliding } }),
  skipIntro: () => { if (G.phase === 'intro') { G.introT = -.1; } },
  demoRow: () => {
    G.obstacles = [];
    G.tokens = [];
    G.obstacles.push({ kind: 'obstacle', type: 'lion', lane: -1, z: 6.2, prevZ: 6.2, full: false, seed: 1, resolved: true });
    G.obstacles.push({ kind: 'obstacle', type: 'barrier', lane: 0, z: 6.2, prevZ: 6.2, full: false, seed: 2, resolved: true });
    G.obstacles.push({ kind: 'obstacle', type: 'beam', lane: 1, z: 6.2, prevZ: 6.2, full: false, seed: 3, resolved: true });
    G.obstacles.push({ kind: 'obstacle', type: 'gate', lane: 0, z: 12.5, prevZ: 12.5, full: true, seed: 4, resolved: true });
    G.obstacles.push({ kind: 'obstacle', type: 'crate', lane: 0, z: 17, prevZ: 17, full: false, seed: 5, resolved: true });
    G.tokens.push(makeToken(-1, 5.5, .3), makeToken(0, 4.8, .5), makeToken(1, 4.2, .3));
    G.pickups.push({ kind: 'pickup', type: 'shield', lane: 0, z: 8.5, seed: 2, prevZ: 8.5 });
  },
  demoOne: (type, lane, z) => {
    G.obstacles = [];
    G.tokens = [];
    G.obstacles.push({ kind: 'obstacle', type, lane: lane || 0, z: z || 7, prevZ: z || 7, full: type === 'gate' || type === 'wall', seed: 2, resolved: true });
  },
  setLead: v => { G.lead = v; },
  seed: () => ({ obstacles: G.obstacles.length, tokens: G.tokens.length, particles: G.particles.length })
};

boot();
})();
