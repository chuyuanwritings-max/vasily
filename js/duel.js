// 一次对狙：文档里说的「积木」。
// 放进去：seed、第几关、第几次对狙、难度。拿出来：赢没赢、几秒、眨了几次眼、打了几枪。
// 只管规则，不管画（画在 main.js），也不碰微信，所以电竞高光那一步可以直接拿去用。
const scene = require('./scene.js');
const { clamp, lerp, easeOut } = require('./util.js');

function createDuel(opts) {
  const cfg = opts.config;
  const dcfg = cfg.duels[Math.min(opts.duelIndex, cfg.duels.length - 1)];
  const sc = scene.build(opts.seed, dcfg, opts.scopeD);
  const half = opts.scopeD / 2;

  const d = {
    sc,
    dcfg,
    levelNo: opts.levelNo,
    duelIndex: opts.duelIndex,
    hitRadius: cfg.hitRadius(opts.duelIndex, opts.levelNo),
    cam: { x: sc.w / 2, y: sc.h / 2 },
    t: 0,
    state: 'play', // play → hit / dead
    blinks: 0,
    blinkMs: -1, // 正在眨眼时 ≥ 0
    blinkApplied: false,
    eyeOpenSec: 0,
    progress: 0, // 对面找到你的进度 0..1
    heart: 1,
    holding: false,
    holdSec: 0,
    phase: 0,
    sway: { x: 0, y: 0 },
    reloadSec: 0,
    shots: 0,
    lastMiss: null,
    hitAt: null,
  };

  d.pan = function (dx, dy) {
    d.cam.x = clamp(d.cam.x - dx, half, sc.w - half);
    d.cam.y = clamp(d.cam.y - dy, half, sc.h - half);
  };

  d.blink = function () {
    if (d.state !== 'play' || d.blinkMs >= 0) return false;
    d.blinkMs = 0;
    d.blinkApplied = false;
    d.blinks += 1;
    d.eyeOpenSec = 0;
    d.progress += dcfg.blinkCost;
    return true;
  };

  // 眼睛完全闭上的那一刻才变，变化的地方就不会「跳」
  function applyChanges() {
    sc.enemy.pose = 1 - sc.enemy.pose;
    // 干扰优先挑镜子里看得见的，这样每次眨眼都真有东西骗你
    const inView = [];
    const outView = [];
    sc.distractors.forEach((x) => {
      const near = Math.abs(x.x - d.cam.x) < half && Math.abs(x.y - d.cam.y) < half;
      (near ? inView : outView).push(x);
    });
    const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);
    const pool = shuffle(inView).concat(shuffle(outView));
    pool.slice(0, dcfg.distractors).forEach(scene.toggle);
  }

  d.triggerDown = function () {
    if (d.state !== 'play' || d.reloadSec > 0) return;
    d.holding = true;
    d.holdSec = 0;
  };

  d.triggerUp = function () {
    if (!d.holding) return null;
    d.holding = false;
    return fire();
  };

  function fire() {
    d.shots += 1;
    const aim = d.aimWorld();
    const head = scene.enemyHead(sc);
    const dist = Math.hypot(aim.x - head.x, aim.y - head.y);
    if (dist <= d.hitRadius) {
      d.state = 'hit';
      d.hitAt = aim;
      return { hit: true, dist };
    }
    d.progress += cfg.shot.missCost;
    d.reloadSec = cfg.shot.reloadSec;
    d.lastMiss = { x: aim.x, y: aim.y, t: d.t };
    return { hit: false, dist };
  }

  // 准星指着的世界坐标 = 镜子正中 + 呼吸晃动
  d.aimWorld = function () {
    return { x: d.cam.x + d.sway.x, y: d.cam.y + d.sway.y };
  };

  // 准星晃多大：不屏息跟着呼吸晃；按住慢慢稳住；憋太久手抖
  function swayAmp() {
    const b = cfg.breath;
    const free = b.amp * d.heart;
    if (!d.holding) return free;
    const steady = b.holdMinAmp * Math.sqrt(d.heart);
    if (d.holdSec < b.settleSec) return lerp(free, steady, easeOut(d.holdSec / b.settleSec));
    if (d.holdSec < b.holdMaxSec) return steady;
    return steady + (d.holdSec - b.holdMaxSec) * b.tremorPerSec;
  }

  d.steadiness = function () {
    const b = cfg.breath;
    if (!d.holding) return 'free';
    if (d.holdSec < b.settleSec) return 'settling';
    if (d.holdSec < b.holdMaxSec) return 'steady';
    return 'tremble';
  };

  d.update = function (dt) {
    d.t += dt;
    if (d.state !== 'play') return;

    if (d.blinkMs >= 0) {
      d.blinkMs += dt * 1000;
      if (!d.blinkApplied && d.blinkMs >= dcfg.blinkMs / 2) {
        applyChanges();
        d.blinkApplied = true;
      }
      if (d.blinkMs >= dcfg.blinkMs) d.blinkMs = -1;
    } else {
      d.eyeOpenSec += dt;
      if (d.eyeOpenSec >= cfg.eye.openMaxSec) d.blink();
    }

    d.progress += dcfg.enemyRate * dt;
    if (d.progress >= 1) {
      d.progress = 1;
      d.state = 'dead';
      d.holding = false;
      return;
    }

    d.heart = Math.min(cfg.heart.max, 1 + d.blinks * cfg.heart.perBlink + d.progress * cfg.heart.perProgress);
    if (d.reloadSec > 0) d.reloadSec = Math.max(0, d.reloadSec - dt);
    if (d.holding) d.holdSec += dt;

    // 屏息时呼吸停住，只剩很慢的晃
    const speed = d.holding ? 0.3 : 1;
    d.phase += (dt * speed * Math.PI * 2) / cfg.breath.periodSec;
    const amp = swayAmp();
    const tremor = d.steadiness() === 'tremble' ? Math.sin(d.t * 37) * amp * 0.3 : 0;
    d.sway.y = amp * Math.sin(d.phase);
    d.sway.x = amp * 0.35 * Math.sin(d.phase * 2 + 0.7) + tremor;
  };

  d.glint = function () {
    return d.state === 'play' && d.progress >= cfg.glintAt && Math.sin(d.t * 10) > 0.2;
  };

  d.result = function () {
    return { win: d.state === 'hit', sec: d.t, blinks: d.blinks, shots: d.shots };
  };

  return d;
}

module.exports = { createDuel };
