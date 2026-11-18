// 一次对狙：文档里说的「积木」。
// 放进去：seed、第几场、第几个对手、加成。拿出来：赢没赢、几秒、缩了几次头、打了几枪。
// 只管规则，不管画（画在 main.js），也不碰微信，所以电竞高光那一步可以直接拿去用。
//
// 0.4 的博弈：谁先暴露谁死。
//   你露着头才看得见、才能开枪，但他也正在找你（画面下方那栋楼上的红圈，就是他的镜子）。
//   缩头：安全，还会让画面变一下（= 眨眼找茬），但你什么都看不见、打不了。
//   他也一样：他探头时才在找你（红圈在动），那也正是你唯一打得中他的时候。
//   红圈停在你窗口上、你又露着头 → 锁定圈转满 → 他瞄准你（镜片反光）→ 抢先开枪，或者马上缩头。
//   打空一枪 = 枪口火光，他立刻知道你在哪。
const scene = require('./scene.js');
const { clamp, lerp, easeOut, rng } = require('./util.js');

const RISE_SEC = 0.25; // 他探头、缩头的动作要多久
const FAKE_SEC = 0.3; // 假人探头露多久
const HITTABLE_LIFT = 0.45; // 头抬到多高才算露出来
const COLS = 6; // 你这栋楼（下方小图）几列几行窗户
const ROWS = 3;
const WATCH_SEC = 3; // 你缩头躲开他的瞄准后，他盯着你窗口多久才放弃

const NO_MODS = {
  hitRadiusAdd: 0, settleMul: 1, holdMaxAdd: 0, heartMul: 1, quickDrawAdd: 0,
  enemyRateMul: 1, reloadMul: 1, peekCue: false, silent: false, helmets: 0, rescueAdd: 0,
};

function createDuel(opts) {
  const cfg = opts.config;
  const idx = Math.min(opts.duelIndex, cfg.duels.length - 1);
  const dcfg = cfg.duels[idx];
  const m = opts.levelNo - 1; // 第几场（0、1、2）
  const mods = Object.assign({}, NO_MODS, opts.mods || {});
  const sc = scene.build(opts.seed, dcfg, opts.scopeD, opts.theme);
  const half = opts.scopeD / 2;
  const rand = rng(opts.seed ^ 0x5bd1e995);
  const S = cfg.seek;

  const d = {
    sc,
    dcfg,
    mods,
    levelNo: opts.levelNo,
    duelIndex: opts.duelIndex,
    hitRadius: cfg.hitRadius(opts.duelIndex, opts.levelNo) + mods.hitRadiusAdd,
    quickDrawSec: dcfg.quickDraw * (1 - S.perMatch * m * 0.5) + mods.quickDrawAdd,
    lockSec: dcfg.lockSec * (1 - S.perMatch * m),
    heatRate: dcfg.heatRate * (1 + S.perMatch * 2 * m) * mods.enemyRateMul,
    seekSpeed: dcfg.seekSpeed * (1 + S.perMatch * m),
    cam: { x: sc.w / 2, y: sc.h / 2 },
    t: 0,
    state: 'play', // play → hit / dead
    // 你
    me: { c: Math.floor(rand() * COLS), r: Math.floor(rand() * ROWS) },
    duck: 0, // 0 = 露着头，1 = 缩在掩体后
    duckHeld: false,
    duckBottomed: true, // 这一次缩头已经缩到底了吗（点一下也要缩到底再起来）
    blinks: 0,
    exposedSec: 0, // 一共露了多久
    helmets: mods.helmets,
    // 他的镜子在你这栋楼上找你
    seek: { x: rand() * (COLS - 1), y: rand() * (ROWS - 1), tx: 0, ty: 0, dwell: 0 },
    heat: 0, // 他多清楚你在哪（0..1）
    lock: 0, // 锁定圈（0..1），满了他就瞄准你
    drawLeft: -1, // 他正在瞄你：还剩几秒开枪（≥ 0 时）
    watch: 0, // 你缩头躲开瞄准后，他还盯着你窗口几秒
    flashSec: 0, // 他开枪的火光（打飞你的诱饵头盔时），这几秒他暴露了
    // 开枪
    heart: 1,
    holding: false,
    holdSec: 0,
    recoverSec: 0,
    phase: 0,
    sway: { x: 0, y: 0 },
    reloadSec: 0,
    shots: 0,
    impacts: [], // 每一枪的落点：{x, y, t, kind: 'hit'|'close'|'miss'|'covered'|'decoy'}
    hitAt: null,
    events: [], // 给画面看的事：'helmet'（头盔被打飞）、'spotted'（打空暴露）
    // 他的探头节奏
    enemy: { mode: 'hide', timer: lerp(dcfg.hideMin, dcfg.hideMax, rand()) * 0.5, fake: false },
    decoy: { mode: 'hide', timer: 1 + rand() * 2 },
  };
  pickTarget();

  d.COLS = COLS;
  d.ROWS = ROWS;

  d.pan = function (dx, dy) {
    d.cam.x = clamp(d.cam.x - dx, half, sc.w - half);
    d.cam.y = clamp(d.cam.y - dy, half, sc.h - half);
  };

  d.exposed = function () {
    return d.duck < 0.5;
  };
  d.enemyExposed = function () {
    return sc.enemy.lift >= HITTABLE_LIFT;
  };
  // 他在找你吗：探头时才找（红圈在动）
  d.searching = function () {
    return d.state === 'play' && (d.enemy.mode === 'peek' || d.enemy.mode === 'rise') && !d.enemy.fake;
  };

  // —— 缩头 ——
  d.duckDown = function () {
    if (d.state !== 'play') return;
    d.duckHeld = true;
    if (d.duckBottomed) {
      d.duckBottomed = false;
      d.blinks += 1;
    }
    if (d.holding) {
      d.holding = false; // 缩头就憋不住了，这一枪不开
      d.recoverSec = cfg.breath.recoverSec;
    }
  };
  d.duckUp = function () {
    d.duckHeld = false;
  };

  // 缩到底的那一刻画面才变，变化的地方就不会「跳」
  function applyChanges() {
    sc.enemy.pose = 1 - sc.enemy.pose;
    const inView = [];
    const outView = [];
    sc.distractors.forEach((x) => {
      const near = Math.abs(x.x - d.cam.x) < half && Math.abs(x.y - d.cam.y) < half;
      (near ? inView : outView).push(x);
    });
    const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);
    shuffle(inView).concat(shuffle(outView)).slice(0, dcfg.distractors).forEach(scene.toggle);
  }

  // —— 开枪 ——
  d.triggerDown = function () {
    if (d.state !== 'play' || d.duck > 0 || d.reloadSec > 0 || d.recoverSec > 0) return;
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
    d.reloadSec = cfg.shot.reloadSec * mods.reloadMul;
    const aim = d.aimWorld();
    const head = scene.enemyHead(sc, 1);
    const dist = Math.hypot(aim.x - head.x, aim.y - head.y);
    let kind;
    if (sc.decoy && sc.decoy.lift > 0.4) {
      const dh = scene.decoyHead(sc);
      if (Math.hypot(aim.x - dh.x, aim.y - dh.y) <= d.hitRadius) kind = 'decoy';
    }
    if (!kind) {
      if (d.enemyExposed() && dist <= d.hitRadius) kind = 'hit';
      else if (!d.enemyExposed() && dist <= d.hitRadius + 6) kind = 'covered';
      else if (dist <= d.hitRadius * 2.5) kind = 'close';
      else kind = 'miss';
    }
    d.impacts.push({ x: aim.x, y: aim.y, t: d.t, kind, dist });
    if (kind === 'hit') {
      d.state = 'hit';
      d.hitAt = aim;
      return { hit: true, kind, dist };
    }
    // 打空：枪口火光，他马上知道你在哪（消音器例外）
    if (!mods.silent) {
      d.heat = 1;
      d.seek.x = d.me.c;
      d.seek.y = d.me.r;
      d.lock = Math.max(d.lock, 0.6);
      d.events.push({ kind: 'spotted', t: d.t });
    }
    return { hit: false, kind, dist };
  }

  d.aimWorld = function () {
    return { x: d.cam.x + d.sway.x, y: d.cam.y + d.sway.y };
  };

  function swayAmp() {
    const b = cfg.breath;
    const free = b.amp * d.heart;
    if (!d.holding) return free;
    const steady = b.holdMinAmp * Math.sqrt(d.heart);
    const settle = b.settleSec * mods.settleMul;
    const holdMax = b.holdMaxSec + mods.holdMaxAdd;
    if (d.holdSec < settle) { const k = d.holdSec / settle; return lerp(free, steady, k * k); }
    if (d.holdSec < holdMax) return steady;
    return steady + (d.holdSec - holdMax) * b.tremorPerSec;
  }

  d.steadiness = function () {
    const b = cfg.breath;
    if (d.recoverSec > 0 && !d.holding) return 'recover';
    if (!d.holding) return 'free';
    if (d.holdSec < b.settleSec * mods.settleMul) return 'settling';
    if (d.holdSec < b.holdMaxSec + mods.holdMaxAdd) return 'steady';
    return 'tremble';
  };

  // —— 他的镜子怎么找你 ——
  // 他越清楚你在哪（heat 越高），下一个看的窗口就越靠近你
  function pickTarget() {
    const s = d.seek;
    const spread = (1 - d.heat) * S.spread;
    let tx;
    let ty;
    if (rand() < d.heat * d.heat) {
      tx = d.me.c;
      ty = d.me.r;
    } else {
      tx = clamp(Math.round(d.me.c + (rand() * 2 - 1) * spread * COLS), 0, COLS - 1);
      ty = clamp(Math.round(d.me.r + (rand() * 2 - 1) * spread * ROWS), 0, ROWS - 1);
      if (rand() < 0.35) {
        tx = Math.floor(rand() * COLS);
        ty = Math.floor(rand() * ROWS);
      }
    }
    s.tx = tx;
    s.ty = ty;
    s.dwell = S.dwellSec * (0.7 + rand() * 0.6);
  }

  function onMe() {
    return Math.abs(d.seek.x - d.me.c) < 0.5 && Math.abs(d.seek.y - d.me.r) < 0.5;
  }
  d.onMe = onMe;

  function updateSeek(dt) {
    const s = d.seek;
    // 他瞄着你 / 盯着你的窗口：红圈不动
    if (d.drawLeft >= 0 || d.watch > 0) return;
    if (d.searching()) {
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const dist = Math.hypot(dx, dy);
      const step = d.seekSpeed * dt;
      if (dist > step) {
        s.x += (dx / dist) * step;
        s.y += (dy / dist) * step;
      } else {
        s.x = s.tx;
        s.y = s.ty;
        s.dwell -= dt;
        if (s.dwell <= 0) pickTarget();
      }
      // 你露着头，他越看越清楚你在哪
      if (d.exposed()) d.heat = Math.min(1, d.heat + d.heatRate * dt);
      // 红圈停在你窗口上、你又露着头：锁定圈往上转
      if (onMe() && d.exposed()) {
        d.lock += dt / d.lockSec;
        if (d.lock >= 1) {
          d.lock = 1;
          d.drawLeft = d.quickDrawSec;
          d.enemy.mode = 'peek';
          d.enemy.timer = 99;
          d.enemy.fake = false;
        }
      } else d.lock = Math.max(0, d.lock - dt * 0.8);
    } else {
      d.lock = Math.max(0, d.lock - dt * 0.5);
    }
    if (!d.exposed()) d.heat = Math.max(0, d.heat - S.coolPerSec * dt);
  }

  // 他的节奏：缩着 → 探头 → 缩回去。瞄着你、盯着你时一直露着
  function updateEnemy(dt) {
    const e = d.enemy;
    const busy = d.drawLeft >= 0 || d.watch > 0 || d.flashSec > 0;
    if (!busy) e.timer -= dt;
    if (e.mode === 'hide' && e.timer <= 0) {
      e.mode = 'rise';
      e.timer = RISE_SEC;
    } else if (e.mode === 'rise' && e.timer <= 0) {
      e.mode = 'peek';
      e.timer = dcfg.peekSec;
    } else if (e.mode === 'peek' && e.timer <= 0) {
      e.mode = 'fall';
      e.timer = RISE_SEC;
    } else if (e.mode === 'fall' && e.timer <= 0) {
      e.mode = 'hide';
      e.timer = lerp(dcfg.hideMin, dcfg.hideMax, rand());
    }
    const k = clamp(1 - e.timer / RISE_SEC, 0, 1);
    sc.enemy.lift = busy || e.mode === 'peek' ? 1 : e.mode === 'rise' ? easeOut(k) : e.mode === 'fall' ? 1 - easeOut(k) : 0;

    // 狡猾型的假人：另一扇窗里一个头盔，自己一会儿露一会儿缩（眨眼时它不会挪）
    if (sc.decoy) {
      const q = d.decoy;
      q.timer -= dt;
      if (q.timer <= 0) {
        q.mode = q.mode === 'hide' ? 'peek' : 'hide';
        q.timer = q.mode === 'peek' ? 1.2 + rand() * 1.2 : 1.5 + rand() * 2.5;
      }
      const target = q.mode === 'peek' ? 1 : 0;
      sc.decoy.lift += clamp(target - sc.decoy.lift, -dt / RISE_SEC, dt / RISE_SEC);
    }
  }

  d.update = function (dt) {
    d.t += dt;
    if (d.state !== 'play') return;

    // 缩头 / 起来
    const want = d.duckHeld || !d.duckBottomed ? 1 : 0;
    const speed = 2000 / dcfg.blinkMs; // 一下一上 = blinkMs
    d.duck = clamp(d.duck + clamp(want - d.duck, -speed * dt, speed * dt), 0, 1);
    if (!d.duckBottomed && d.duck >= 1) {
      d.duckBottomed = true;
      applyChanges();
    }
    if (d.exposed()) d.exposedSec += dt;

    updateEnemy(dt);
    updateSeek(dt);

    // 他瞄着你：你露着头，倒计时就走；缩头躲开，他盯着你的窗口等你出来
    if (d.drawLeft >= 0) {
      if (d.exposed()) {
        d.drawLeft -= dt;
        d.watch = 0;
        if (d.drawLeft <= 0) {
          if (d.helmets > 0) {
            // 诱饵头盔：他打飞的是头盔，开枪的火光把他自己照出来了
            d.helmets -= 1;
            d.drawLeft = -1;
            d.lock = 0;
            d.heat = 0.5;
            d.flashSec = 1.6;
            d.events.push({ kind: 'helmet', t: d.t });
          } else {
            d.state = 'dead';
            d.holding = false;
            return;
          }
        }
      } else {
        d.watch += dt;
        if (d.watch >= WATCH_SEC) {
          // 等不到你，放弃，接着找
          d.drawLeft = -1;
          d.watch = 0;
          d.lock = 0.3;
          d.enemy.mode = 'fall';
          d.enemy.timer = RISE_SEC;
          pickTarget();
        }
      }
    }
    if (d.flashSec > 0) {
      d.flashSec -= dt;
      if (d.flashSec <= 0) {
        d.enemy.mode = 'fall';
        d.enemy.timer = RISE_SEC;
      }
    }

    const rise = d.heat * cfg.heart.perHeat + d.lock * cfg.heart.perLock + (d.drawLeft >= 0 ? 0.3 : 0);
    d.heart = Math.min(cfg.heart.max, 1 + rise * mods.heartMul);
    if (d.reloadSec > 0) d.reloadSec = Math.max(0, d.reloadSec - dt);
    if (d.recoverSec > 0 && !d.holding) d.recoverSec = Math.max(0, d.recoverSec - dt);
    if (d.holding) d.holdSec += dt;

    d.phase += (dt * (d.holding ? 0.3 : 1) * Math.PI * 2) / cfg.breath.periodSec;
    const amp = swayAmp();
    const tremor = d.steadiness() === 'tremble' ? Math.sin(d.t * 37) * amp * 0.3 : 0;
    d.sway.y = amp * Math.sin(d.phase);
    d.sway.x = amp * 0.35 * Math.sin(d.phase * 2 + 0.7) + tremor;

    // 吸附：屏息时准星离他的头够近，镜头被轻轻拉过去（第三场没有）
    if (d.holding && cfg.assist) {
      const ar = cfg.assist.radius;
      const radius = Array.isArray(ar) ? ar[Math.min(opts.levelNo, ar.length) - 1] : ar;
      const head = scene.enemyHead(sc, 1);
      const dx = head.x - d.cam.x;
      const dy = head.y - d.cam.y;
      if (radius > 0 && Math.hypot(dx, dy) < radius) {
        const k = Math.min(1, cfg.assist.perSec * dt);
        d.pan(-dx * k, -dy * k);
      }
    }
  };

  // 镜片反光：他瞄着你，或者开枪的火光
  d.glint = function () {
    if (d.state !== 'play') return false;
    return d.drawLeft >= 0 || d.flashSec > 0;
  };

  d.result = function () {
    return { win: d.state === 'hit', sec: d.t, blinks: d.blinks, shots: d.shots, exposed: d.exposedSec };
  };

  return d;
}

module.exports = { createDuel, COLS, ROWS };
