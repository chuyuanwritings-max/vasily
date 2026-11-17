// 一次对狙：文档里说的「积木」。
// 放进去：seed、第几关、第几个对手、难度。拿出来：赢没赢、几秒、眨了几次眼、打了几枪。
// 只管规则，不管画（画在 main.js），也不碰微信，所以电竞高光那一步可以直接拿去用。
//
// 0.2 的开枪博弈：他会「缩着 → 探头 → 缩回去」，只有探头时打得中；
// 你屏息只能稳两秒左右，所以要读他的节奏，提前按住。
// 他找到你以后，下一次探头就开枪：镜片一闪，谁先开枪谁赢。
const scene = require('./scene.js');
const { clamp, lerp, easeOut, rng } = require('./util.js');

const RISE_SEC = 0.25; // 探头、缩头的动作要多久
const FAKE_SEC = 0.3; // 假探头露多久
const HITTABLE_LIFT = 0.6; // 头抬到多高才算露出来

function createDuel(opts) {
  const cfg = opts.config;
  const idx = Math.min(opts.duelIndex, cfg.duels.length - 1);
  const dcfg = cfg.duels[idx];
  const sc = scene.build(opts.seed, dcfg, opts.scopeD);
  const half = opts.scopeD / 2;
  const rand = rng(opts.seed ^ 0x5bd1e995);
  const peekScale = Math.max(cfg.peekMinScale, 1 - cfg.peekShrinkPerLevel * (opts.levelNo - 1));

  const d = {
    sc,
    dcfg,
    levelNo: opts.levelNo,
    duelIndex: opts.duelIndex,
    hitRadius: cfg.hitRadius(opts.duelIndex, opts.levelNo),
    quickDrawSec: cfg.quickDrawSec[Math.min(idx, cfg.quickDrawSec.length - 1)],
    cam: { x: sc.w / 2, y: sc.h / 2 },
    t: 0,
    state: 'play', // play → hit / dead
    blinks: 0,
    blinkMs: -1, // 正在眨眼时 ≥ 0
    blinkApplied: false,
    eyeOpenSec: 0,
    progress: 0, // 对面找到你的进度 0..1
    locked: false, // 他已经找到你：下一次探头就开枪
    drawLeft: -1, // 拔枪对决剩几秒（≥ 0 时他正在瞄你）
    heart: 1,
    holding: false,
    holdSec: 0,
    recoverSec: 0,
    phase: 0,
    sway: { x: 0, y: 0 },
    reloadSec: 0,
    shots: 0,
    impacts: [], // 每一枪的落点：{x, y, t, kind: 'hit'|'close'|'miss'|'covered'}
    hitAt: null,
    // 他的探头节奏
    enemy: { mode: 'hide', timer: 0, fake: false },
  };
  d.enemy.timer = lerp(dcfg.hideMin, dcfg.hideMax, rand()) * 0.6; // 第一下来得快一点

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
    if (!d.locked) d.progress = Math.min(1, d.progress + dcfg.blinkCost);
    return true;
  };

  // 眼睛完全闭上的那一刻才变，变化的地方就不会「跳」
  function applyChanges() {
    sc.enemy.pose = 1 - sc.enemy.pose;
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
    if (d.state !== 'play' || d.reloadSec > 0 || d.recoverSec > 0) return;
    d.holding = true;
    d.holdSec = 0;
  };

  d.triggerUp = function () {
    if (!d.holding) return null;
    d.holding = false;
    d.recoverSec = cfg.breath.recoverSec;
    return fire();
  };

  function fire() {
    d.shots += 1;
    d.reloadSec = cfg.shot.reloadSec;
    const aim = d.aimWorld();
    const head = scene.enemyHead(sc);
    const dist = Math.hypot(aim.x - head.x, aim.y - head.y);
    const exposed = sc.enemy.lift >= HITTABLE_LIFT;
    let kind;
    if (exposed && dist <= d.hitRadius) kind = 'hit';
    else if (!exposed && dist <= d.hitRadius + 6) kind = 'covered'; // 瞄对了，但他缩着
    else if (dist <= d.hitRadius * 2.5) kind = 'close';
    else kind = 'miss';
    d.impacts.push({ x: aim.x, y: aim.y, t: d.t, kind, dist });
    if (kind === 'hit') {
      d.state = 'hit';
      d.hitAt = aim;
      d.holding = false;
      return { hit: true, kind, dist };
    }
    if (!d.locked) d.progress = Math.min(1, d.progress + cfg.shot.missCost);
    return { hit: false, kind, dist };
  }

  // 准星指着的世界坐标 = 镜子正中 + 呼吸晃动
  d.aimWorld = function () {
    return { x: d.cam.x + d.sway.x, y: d.cam.y + d.sway.y };
  };

  function swayAmp() {
    const b = cfg.breath;
    const free = b.amp * d.heart;
    if (!d.holding) return free;
    const steady = b.holdMinAmp * Math.sqrt(d.heart);
    // 先慢后快地稳下来：按住越久越稳，不会一按就稳
    if (d.holdSec < b.settleSec) { const k = d.holdSec / b.settleSec; return lerp(free, steady, k * k); }
    if (d.holdSec < b.holdMaxSec) return steady;
    return steady + (d.holdSec - b.holdMaxSec) * b.tremorPerSec;
  }

  d.steadiness = function () {
    const b = cfg.breath;
    if (d.recoverSec > 0 && !d.holding) return 'recover';
    if (!d.holding) return 'free';
    if (d.holdSec < b.settleSec) return 'settling';
    if (d.holdSec < b.holdMaxSec) return 'steady';
    return 'tremble';
  };

  d.exposed = function () {
    return sc.enemy.lift >= HITTABLE_LIFT;
  };

  // 他的节奏：缩着 → 探头（或假探头）→ 缩回去
  function updateEnemy(dt) {
    const e = d.enemy;
    e.timer -= dt;
    if (e.mode === 'hide' && e.timer <= 0) {
      e.mode = 'rise';
      e.timer = RISE_SEC;
      // 找到你以后不再假探头：这次是来开枪的
      e.fake = !d.locked && rand() < dcfg.fakeChance;
    } else if (e.mode === 'rise' && e.timer <= 0) {
      e.mode = 'peek';
      e.timer = d.locked ? Math.max(dcfg.peekSec, d.quickDrawSec) + 0.2 : e.fake ? FAKE_SEC : dcfg.peekSec * peekScale;
      if (d.locked) d.drawLeft = d.quickDrawSec;
    } else if (e.mode === 'peek' && e.timer <= 0 && d.drawLeft < 0) {
      e.mode = 'fall';
      e.timer = RISE_SEC;
    } else if (e.mode === 'fall' && e.timer <= 0) {
      e.mode = 'hide';
      e.timer = lerp(dcfg.hideMin, dcfg.hideMax, rand());
    }
    const k = clamp(1 - e.timer / RISE_SEC, 0, 1);
    sc.enemy.lift = e.mode === 'peek' ? 1 : e.mode === 'rise' ? easeOut(k) : e.mode === 'fall' ? 1 - easeOut(k) : 0;
  }

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

    if (!d.locked) {
      d.progress += dcfg.enemyRate * dt;
      if (d.progress >= 1) {
        d.progress = 1;
        d.locked = true;
      }
    }

    updateEnemy(dt);

    // 拔枪对决：镜片一闪，倒计时到了他就开枪
    if (d.drawLeft >= 0) {
      d.drawLeft -= dt;
      if (d.drawLeft <= 0) {
        d.state = 'dead';
        d.holding = false;
        return;
      }
    }

    d.heart = Math.min(cfg.heart.max, 1 + d.blinks * cfg.heart.perBlink + d.progress * cfg.heart.perProgress + (d.drawLeft >= 0 ? 0.4 : 0));
    if (d.reloadSec > 0) d.reloadSec = Math.max(0, d.reloadSec - dt);
    if (d.recoverSec > 0 && !d.holding) d.recoverSec = Math.max(0, d.recoverSec - dt);
    if (d.holding) d.holdSec += dt;

    const speed = d.holding ? 0.3 : 1;
    d.phase += (dt * speed * Math.PI * 2) / cfg.breath.periodSec;
    const amp = swayAmp();
    const tremor = d.steadiness() === 'tremble' ? Math.sin(d.t * 37) * amp * 0.3 : 0;
    d.sway.y = amp * Math.sin(d.phase);
    d.sway.x = amp * 0.35 * Math.sin(d.phase * 2 + 0.7) + tremor;
  };

  d.glint = function () {
    if (d.state !== 'play') return false;
    if (d.drawLeft >= 0) return true; // 他正在瞄你：一直亮
    return d.progress >= cfg.glintAt && Math.sin(d.t * 10) > 0.2;
  };

  d.result = function () {
    return { win: d.state === 'hit', sec: d.t, blinks: d.blinks, shots: d.shots };
  };

  return d;
}

module.exports = { createDuel };
