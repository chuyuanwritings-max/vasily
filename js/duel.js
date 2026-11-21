// 一个回合的对狙：文档里说的「积木」。
// 放进去：seed、回合设定（levels.js）、加成。拿出来：赢没赢、用时、打了几枪、被没被瞄准过。
// 只管规则，不管画（画在 main.js），也不碰微信。
//
// 博弈：谁先暴露谁死。
//   你露着头才看得见、才能开枪，但他也正在找你（画面下方那栋楼上的红圈，就是他的镜子）。
//   缩头：安全，还会让画面变一下（= 眨眼找茬），但看不见、打不了。按住就一直缩着。
//   他探头时才在找你（红圈在动），那也正是你唯一打得中他的时候。
// 0.5 加的五条：
//   认出他：对面有好几个人影，只有一个是狙击手。红圈靠近你时他的镜片会反光；每种对手还有自己的破绽。
//   子弹有限：打空一发他换窗重新藏；打错人扣时间。用完还没打中就输。
//   倒计时：整回合有时限。
//   换窗：点下面那栋楼的另一扇窗，爬过去，他对你位置的把握清零。
//   他会学你：同一扇窗露头第三次，他已经预先瞄着那里。
const scene = require('./scene.js');
const themes = require('./themes.js');
const { clamp, lerp, easeOut, rng } = require('./util.js');

const RISE_SEC = 0.25; // 他探头、缩头的动作要多久
const HITTABLE_LIFT = 0.45; // 头抬到多高才算露出来
const COLS = 6; // 你这栋楼（下方小图）几列几行窗户
const ROWS = 3;
const WATCH_SEC = 3; // 你缩头躲开他的瞄准后，他盯着你窗口多久才放弃
const OTHER_R = 7; // 打路人 / 假人的判定圈

const NO_MODS = {
  hitRadiusAdd: 0, settleMul: 1, holdMaxAdd: 0, heartMul: 1, quickDrawAdd: 0,
  enemyRateMul: 1, reloadMul: 1, peekCue: false, silent: false, helmets: 0, rescueAdd: 0,
};

function createDuel(opts) {
  const cfg = opts.config;
  const R = opts.round;
  const opp = cfg.opponents[R.opp];
  const phases = opp.phases || [{}];
  const mods = Object.assign({}, NO_MODS, opts.mods || {});
  const cond = R.cond || null;
  const sc = scene.build(opts.seed, { poseShift: opp.poseShift, contrast: 0.2 }, opts.scopeD, R.theme, {
    figures: R.figures || 1,
    decoys: opp.decoy || (phases[0].decoy || 0),
    night: cond === 'night',
    pigeons: cond === 'pigeons',
    escort: R.goal === 'escort',
    props: R.props === undefined ? 10 : R.props,
  });
  const half = opts.scopeD / 2;
  const rand = rng(opts.seed ^ 0x5bd1e995);
  const S = cfg.seek;
  // 这回合的遮挡：关卡写明的，或者 'auto' = 用这张地图自带的（擂台、每日挑战）
  const roundCover = R.cover === 'auto' ? themes.get(R.theme).cover : R.cover || null;

  const d = {
    sc,
    round: R,
    opp,
    mods,
    cond,
    levelIndex: opts.levelIndex || 0,
    COLS,
    ROWS,
    phase: 0, // Boss 第几段
    bossHp: phases.length,
    hitRadius: (R.hitR || 9) + mods.hitRadiusAdd,
    cam: { x: sc.w / 2, y: sc.h / 2 },
    t: 0,
    state: 'play', // play → hit / dead / dry（子弹用完）/ timeout / mateDown
    bullets: R.bullets || 3,
    timeLeft: R.time || 80,
    // 你
    me: { c: Math.floor(rand() * COLS), r: Math.floor(rand() * ROWS) },
    duck: 0, // 0 = 露着头，1 = 缩在掩体后
    duckHeld: false,
    duckBottomed: true, // 这一次缩头已经缩到底了吗（点一下也要缩到底再起来）
    blinks: 0,
    exposedSec: 0,
    peeks: 0, // 在这扇窗露头几次了（他会记住）
    moving: 0, // 正在爬向另一扇窗：还剩几秒
    moveTo: null,
    helmets: mods.helmets,
    // 他的镜子在你这栋楼上找你
    seek: { x: rand() * (COLS - 1), y: rand() * (ROWS - 1), tx: 0, ty: 0, dwell: 0 },
    heat: 0, // 他多清楚你在哪（0..1）
    lock: 0, // 锁定圈（0..1），满了他就瞄准你
    drawLeft: -1, // 他正在瞄你：还剩几秒开枪（≥ 0 时）
    watch: 0,
    flashSec: 0, // 他开枪的火光（打飞你的诱饵头盔时），这几秒他暴露了
    stare: 0, // 你盯着他看了多久（换位型会跑）
    relocating: false,
    fog: 0,
    coverNext: 2.5, // 下一次遮挡还有几秒
    // 二战样机：楼下的敌军巡逻（扇形视野扫到你就拉警报）和你的小队
    patrols: [],
    alarm: 0, // 警报（0..1），满了 = 被巡逻发现
    squad: (R.squad || []).map((id) => ({ id, charges: cfg.squad[id].charges })),
    decoyT: -1, // 诱饵兵举起钢盔：还有几秒他上钩开枪
    alternateMode: opts.alternate === undefined ? !!cfg.alternate : !!opts.alternate,
    // 开枪
    heart: 1,
    holding: false,
    holdSec: 0,
    recoverSec: 0,
    breath: 0,
    sway: { x: 0, y: 0 },
    reloadSec: 0,
    shots: 0,
    wasted: 0, // 浪费了几发（打空、打错）
    lockedOnce: false, // 被他瞄准过没有
    impacts: [], // 每一枪的落点：{x, y, t, kind}
    hitAt: null,
    events: [], // 给画面和声音的事
    seekTrail: [], // 红圈走过的路（输了回放用）
    enemy: { mode: 'hide', timer: lerp(opp.hideMin, opp.hideMax, rand()) * 0.6 },
  };

  function tactic() {
    const t = Object.assign({}, opp, phases[d.phase] || {});
    // 擂台加难：他找得更快
    if (R.seekMul) {
      t.seekSpeed *= R.seekMul;
      t.heatRate *= R.seekMul;
    }
    return t;
  }
  d.tactic = tactic;

  // —— 二战样机：楼下的巡逻 ——
  // 巡逻在你这栋楼下面的街上来回走，抬头看楼上：扇形覆盖左右 coneCols 扇窗。
  // 照《盟军敢死队》的两段视野：扇形里你露着头 → 很快被发现；缩着头只躲得过远的一段，正下方缩头也躲不过。
  const P = cfg.patrol;
  for (let i = 0; i < (R.patrols || 0); i++) {
    d.patrols.push({ x: i === 0 ? -0.6 : COLS - 0.4, dir: i === 0 ? 1 : -1, pause: 0, stun: 0, active: i === 0 || false, at: i === 0 ? 0 : P.secondAt });
  }
  function patrolSees(pt) {
    if (!pt.active || pt.stun > 0 || pt.x < -0.5 || pt.x > COLS - 0.5) return 0;
    const dc = Math.abs(d.me.c - pt.x);
    if (dc > P.coneCols) return 0;
    const near = dc < 0.5;
    if (d.exposed()) return 1 / P.spotExposed;
    if (near) return 1 / P.spotDucked;
    return 0;
  }
  function updatePatrols(dt) {
    if (!d.patrols.length) return;
    let rate = 0;
    d.patrols.forEach((pt) => {
      if (!pt.active) {
        if (d.t >= pt.at) {
          pt.active = true;
          d.events.push({ kind: 'patrolIn' });
        }
        return;
      }
      if (pt.stun > 0) {
        pt.stun -= dt;
        if (pt.stun <= 0) d.events.push({ kind: 'patrolBack' });
        return;
      }
      if (pt.pause > 0) pt.pause -= dt;
      else {
        pt.x += pt.dir * P.speed * dt;
        if (pt.x > COLS - 0.2 || pt.x < -0.8) {
          pt.dir *= -1;
          pt.pause = P.pauseSec[0] + rand() * (P.pauseSec[1] - P.pauseSec[0]);
        } else if (rand() < dt * 0.15) pt.pause = 0.6 + rand();
      }
      rate = Math.max(rate, patrolSees(pt));
    });
    if (rate > 0) d.alarm = Math.min(1, d.alarm + rate * dt);
    else d.alarm = Math.max(0, d.alarm - dt * P.coolPerSec);
    if (d.alarm >= 1) {
      d.state = 'spotted';
      d.holding = false;
    }
  }
  d.patrolSees = (pt) => patrolSees(pt) > 0;

  // —— 二战样机：小队（点一下放技能） ——
  // decoy 诱饵兵：举起钢盔，他上钩朝钢盔开枪，枪口火光把他照出来
  // beret 贝雷帽：悄悄放倒离你最近的巡逻兵，那队巡逻停下来找人
  d.useSquad = function (id) {
    if (d.state !== 'play') return false;
    const m = d.squad.find((x) => x.id === id);
    if (!m || m.charges <= 0) return false;
    if (id === 'decoy') {
      if (d.decoyT >= 0) return false;
      d.decoyT = cfg.squad.decoy.baitSec;
      // 他缩着就引他探头
      if (d.enemy.mode === 'hide' && !d.relocating) d.enemy.timer = Math.min(d.enemy.timer, 0.3);
    } else if (id === 'beret') {
      const live = d.patrols.filter((pt) => pt.active && pt.stun <= 0);
      if (!live.length) return false;
      live.sort((a, b) => Math.abs(a.x - d.me.c) - Math.abs(b.x - d.me.c));
      live[0].stun = cfg.squad.beret.stunSec;
      d.alarm = Math.max(0, d.alarm - 0.5);
    }
    m.charges -= 1;
    d.events.push({ kind: 'squad', id });
    return true;
  };
  function updateDecoy(dt) {
    if (d.decoyT < 0) return;
    d.decoyT -= dt;
    if (d.decoyT > 0) return;
    // 他探着头才会朝钢盔开枪；还没探头就再等一会儿
    if (d.enemy.mode === 'peek' && !d.relocating) {
      d.decoyT = -1;
      d.flashSec = 1.8; // 火光：他的位置亮出来，这几秒他也露着
      d.drawLeft = -1;
      d.lock = 0;
      d.heat = Math.min(d.heat, 0.3);
      d.events.push({ kind: 'decoyShot' });
    } else if (d.decoyT < -4) d.decoyT = -1; // 他一直不出来，钢盔收回
  }
  // 现在这一招带什么遮挡（Boss 第三招放蒸汽）
  d.coverKind = function () {
    return tactic().cover || roundCover;
  };

  // —— 挡视线的东西：火车、蒸汽、烟雾弹、沙尘暴、水雾、玻璃反光 ——
  // 挡住他那扇窗时（玻璃反光除外），他看不见你：不升温、不锁定。火车还挡子弹。
  function spawnCover(kind) {
    const C = cfg.covers[kind];
    const pick = (a) => a[0] + rand() * (a[1] - a[0]);
    const ew = sc.enemy.win;
    if (kind === 'train') sc.covers.push({ kind, x: -C.len, y: scene.GROUND - C.h, w: C.len, h: C.h, a: 1, age: 0 });
    else if (kind === 'sand') sc.covers.push({ kind, x: -C.w, y: 100, w: C.w, h: scene.GROUND - 100, a: 0.92, age: 0 });
    else if (kind === 'glare') sc.covers.push({ kind, x: -C.w - 60, y: 0, w: C.w, h: scene.WORLD_H, a: 1, age: 0 });
    else if (kind === 'mist') sc.covers.push({ kind, x: 60, y: 430, r: C.r, a: 0.5, age: 0, seed: rand() * 6 });
    else if (kind === 'steam') {
      const w = rand() < C.nearHim ? ew : sc.allWindows[Math.floor(rand() * sc.allWindows.length)];
      sc.covers.push({ kind, x: w.x + 8 + (rand() - 0.5) * 80, y: w.y + 11 + (rand() - 0.5) * 30, r: C.r, R: C.r, a: 0, age: 0, life: C.life, seed: rand() * 6 });
    } else if (kind === 'smoke') {
      // 烟雾弹扔在他附近：烟一起来，就知道他大概在那一片
      const side = rand() < 0.5 ? -1 : 1;
      sc.covers.push({ kind, x: ew.x + 8 + side * pick(C.off), y: ew.y + 11 + (rand() - 0.5) * 40, r: C.r, R: C.r, a: 0, age: 0, life: C.life, seed: rand() * 6 });
      d.events.push({ kind: 'smoke' });
    }
    if (kind === 'train') d.events.push({ kind: 'train' });
    return C;
  }
  function updateCovers(dt) {
    sc.covers.forEach((c) => {
      c.age += dt;
      const C = cfg.covers[c.kind];
      if (c.kind === 'train' || c.kind === 'sand' || c.kind === 'glare') c.x += C.speed * dt;
      else if (c.kind === 'mist') c.a = 0.45 + 0.45 * Math.sin((d.t / C.period) * Math.PI * 2);
      else {
        const grow = Math.min(1, c.age / 0.7);
        c.r = c.R * (0.5 + 0.5 * grow);
        c.a = grow * clamp((c.life - c.age) / C.fade, 0, 1);
      }
    });
    sc.covers = sc.covers.filter((c) => (c.life ? c.age < c.life : c.kind === 'mist' || c.x < scene.WORLD_W + 80));
    const kind = d.coverKind();
    if (!kind) {
      sc.covers = sc.covers.filter((c) => c.life); // 换招以后火车、沙尘这类不再来，已有的烟让它自己散
      return;
    }
    if (kind === 'mist') {
      if (!sc.covers.some((c) => c.kind === 'mist')) spawnCover('mist');
      return;
    }
    d.coverNext -= dt;
    if (d.coverNext <= 0) {
      const C = spawnCover(kind);
      d.coverNext = C.every[0] + rand() * (C.every[1] - C.every[0]);
    }
  }
  // 他被挡住了吗（看不见你）
  function enemyBlind() {
    const h = scene.enemyHead(sc, 1);
    return scene.coverAt(sc, h.x, h.y, true) > 0.6;
  }
  d.enemyBlind = enemyBlind;
  sc.enemy.swayOn = !tactic().still;
  pickTarget();

  d.pan = function (dx, dy) {
    d.cam.x = clamp(d.cam.x - dx, half, sc.w - half);
    d.cam.y = clamp(d.cam.y - dy, half, sc.h - half);
  };

  d.exposed = function () {
    return d.duck < 0.5 && d.moving <= 0;
  };
  d.enemyExposed = function () {
    return sc.enemy.lift >= HITTABLE_LIFT;
  };
  // 他在找你吗：探头时才找（红圈在动）
  d.searching = function () {
    return d.state === 'play' && (d.enemy.mode === 'peek' || d.enemy.mode === 'rise') && !d.relocating;
  };
  // 轮流模式：有巡逻在楼下走的时候，对面不找你
  d.patrolOnStreet = function () {
    return d.patrols.some((pt) => pt.active && pt.stun <= 0 && pt.x > -0.5 && pt.x < COLS - 0.5);
  };
  // 他在瞄队友（掩护关）：这时候他不找你
  d.aimingMate = function () {
    const m = sc.mate;
    return !!m && !m.done && !m.down && m.state === 'run' && d.searching();
  };

  // —— 缩头 ——
  d.duckDown = function () {
    if (d.state !== 'play') return;
    d.duckHeld = true;
    if (d.duckBottomed) {
      d.duckBottomed = false;
      d.blinks += 1;
      d.events.push({ kind: 'duck' });
    }
    if (d.holding) {
      d.holding = false; // 缩头就憋不住了，这一枪不开
      d.recoverSec = cfg.breath.recoverSec;
    }
  };
  d.duckUp = function () {
    d.duckHeld = false;
  };

  // —— 换窗：爬到你这栋楼的另一扇窗 ——
  d.moveWindow = function (c, r) {
    if (d.state !== 'play' || d.moving > 0) return false;
    if (c === d.me.c && r === d.me.r) return false;
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    d.moving = cfg.move.sec;
    d.moveTo = { c, r, from: { c: d.me.c, r: d.me.r } };
    d.holding = false;
    d.events.push({ kind: 'crawl' });
    return true;
  };

  // 缩到底的那一刻画面才变，变化的地方就不会「跳」
  function applyChanges() {
    sc.enemy.pose = 1 - sc.enemy.pose;
    sc.figures.forEach((f) => {
      if (f.kind === 'civ' && rand() < 0.4) f.pose = 1 - f.pose;
    });
    const inView = [];
    const outView = [];
    const pool = sc.distractors.concat(sc.props.filter((p) => p.type === 'cat' || p.type === 'lamp'));
    pool.forEach((x) => {
      const near = Math.abs(x.x - d.cam.x) < half && Math.abs(x.y - d.cam.y) < half;
      (near ? inView : outView).push(x);
    });
    const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);
    const n = R.changes || 4 + Math.min(4, Math.floor(d.levelIndex / 2));
    shuffle(inView).concat(shuffle(outView)).slice(0, n).forEach(scene.toggle);
  }

  // —— 开枪 ——
  d.triggerDown = function () {
    if (d.state !== 'play' || d.duck > 0 || d.moving > 0 || d.reloadSec > 0 || d.recoverSec > 0 || d.bullets <= 0) return;
    d.holding = true;
    d.holdSec = 0;
  };

  d.triggerUp = function () {
    if (!d.holding) return null;
    d.holding = false;
    d.recoverSec = cfg.breath.recoverSec;
    return fire();
  };

  function flushAt(x) {
    let flushed = false;
    sc.flocks.forEach((fl) => {
      const b = sc.buildings[fl.b];
      if (fl.state === 'sit' && x >= b.x - 10 && x <= b.x + b.w + 10) {
        fl.state = 'fly';
        fl.t = d.t;
        flushed = true;
      }
    });
    if (flushed) d.events.push({ kind: 'wings' });
    return flushed;
  }

  function fire() {
    d.shots += 1;
    d.bullets -= 1;
    d.reloadSec = cfg.shot.reloadSec * mods.reloadMul;
    const aim = d.aimWorld();
    const head = scene.enemyHead(sc, 1);
    const dist = Math.hypot(aim.x - head.x, aim.y - head.y);
    let kind = null;
    // 火车挡在前面：子弹打在车厢上
    const trainHit = sc.covers.some((c) => c.kind === 'train' && aim.x >= c.x && aim.x <= c.x + c.w && aim.y >= c.y && aim.y <= c.y + c.h);
    if (trainHit) kind = 'covered';
    if (!kind && d.enemyExposed() && dist <= d.hitRadius) kind = 'hit';
    if (!kind) {
      const other = sc.figures.find((f) => f !== sc.enemy && f.lift > 0.4 && Math.hypot(aim.x - scene.figureHead(f).x, aim.y - scene.figureHead(f).y) <= OTHER_R);
      if (other) kind = other.kind === 'decoy' ? 'decoy' : 'wrong';
      else if (sc.props.some((p) => Math.hypot(aim.x - scene.propHead(p).x, aim.y - scene.propHead(p).y) <= OTHER_R)) kind = 'wrong';
    }
    if (!kind) {
      if (!d.enemyExposed() && dist <= d.hitRadius + 6) kind = 'covered';
      else if (dist <= d.hitRadius * 2.5) kind = 'close';
      else kind = 'miss';
    }
    d.impacts.push({ x: aim.x, y: aim.y, t: d.t, kind, dist });
    d.events.push({ kind: 'shot', result: kind });
    if (kind === 'hit') {
      if (d.bossHp > 1) {
        bossNextPhase(aim);
        return { hit: true, boss: true, kind, dist };
      }
      d.state = 'hit';
      d.hitAt = aim;
      return { hit: true, kind, dist };
    }
    d.wasted += 1;
    if (kind === 'wrong' || kind === 'decoy') d.timeLeft = Math.max(0.5, d.timeLeft - cfg.shot.wrongPenaltySec);
    // 枪口火光：他马上知道你在哪（消音器例外）
    if (!mods.silent) {
      d.heat = Math.max(d.heat, 0.8);
      d.seek.x = d.seek.tx = d.me.c;
      d.seek.y = d.seek.ty = d.me.r;
      d.lock = Math.max(d.lock, 0.5);
      d.events.push({ kind: 'spotted' });
    }
    if (sc.flocks.length && flushAt(aim.x)) d.heat = Math.min(1, d.heat + cfg.conditions.pigeons.flushHeat);
    // 打空（不是打错人）：他缩回去换一扇窗
    if (kind === 'miss' || kind === 'close' || kind === 'covered') startRelocate();
    if (d.bullets <= 0) d.state = 'dry';
    return { hit: false, kind, dist };
  }

  // Boss 挨了一枪：头盔飞了，换窗，换一招，子弹重给
  function bossNextPhase(aim) {
    d.bossHp -= 1;
    d.phase += 1;
    d.hitAt = aim;
    d.events.push({ kind: 'bossHit', hp: d.bossHp });
    d.bullets = R.bullets || 3;
    d.heat = 0.3;
    d.lock = 0;
    d.drawLeft = -1;
    d.watch = 0;
    const tc = tactic();
    sc.enemy.swayOn = !tc.still;
    // 新的一招要摆假人：在空窗里多放几个头盔
    const want = tc.decoy || 0;
    const have = sc.figures.filter((f) => f.kind === 'decoy').length;
    for (let i = have; i < want; i++) {
      const free = sc.spots.filter((w) => !scene.slotBusy(sc, w) && !sc.figures.some((f) => Math.abs(f.win.x - w.x) + Math.abs(f.win.y - w.y) < 60));
      if (!free.length) break;
      const w = free[Math.floor(rand() * free.length)];
      sc.figures.push({ kind: 'decoy', win: w, lift: 0, pose: 0, shift: 0, color: sc.enemy.color, sway: 0, swayOn: false, phase: 0, timer: 1 });
    }
    sc.decoy = sc.figures.find((f) => f.kind === 'decoy') || null;
    startRelocate();
  }

  function startRelocate() {
    if (d.relocating) return;
    d.relocating = true;
    if (d.enemy.mode !== 'hide') {
      d.enemy.mode = 'fall';
      d.enemy.timer = RISE_SEC;
    }
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
    // 开局几秒他不会直接看你那扇窗（别一上来就被撞上）
    if (d.t < 5 && d.heat < 0.3 && tx === d.me.c && ty === d.me.r) tx = (tx + 2 + Math.floor(rand() * 3)) % COLS;
    s.tx = tx;
    s.ty = ty;
    s.dwell = S.dwellSec * (0.7 + rand() * 0.6);
  }

  function onMe() {
    return Math.abs(d.seek.x - d.me.c) < 0.5 && Math.abs(d.seek.y - d.me.r) < 0.5;
  }
  d.onMe = onMe;
  d.seekDist = function () {
    return Math.hypot(d.seek.x - d.me.c, d.seek.y - d.me.r);
  };

  function heatMul() {
    let k = mods.enemyRateMul;
    if (d.fog > 0) k *= lerp(1, cfg.conditions.fog.heatMul, d.fog);
    if (cond === 'night') k *= cfg.conditions.night.heatMul;
    return k;
  }

  function updateSeek(dt) {
    const s = d.seek;
    if (d.drawLeft >= 0 || d.watch > 0) return;
    if (d.searching() && !d.aimingMate()) {
      const tc = tactic();
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const dist = Math.hypot(dx, dy);
      const step = tc.seekSpeed * dt;
      if (dist > step) {
        s.x += (dx / dist) * step;
        s.y += (dy / dist) * step;
      } else {
        s.x = s.tx;
        s.y = s.ty;
        s.dwell -= dt;
        if (s.dwell <= 0) pickTarget();
      }
      const blind = enemyBlind();
      if (d.exposed() && !blind) d.heat = Math.min(1, d.heat + tc.heatRate * heatMul() * dt);
      if (onMe() && d.exposed() && !blind) {
        d.lock += dt / tc.lockSec;
        if (d.lock >= 1) {
          d.lock = 1;
          d.drawLeft = tc.quickDraw + mods.quickDrawAdd;
          d.lockedOnce = true;
          d.enemy.mode = 'peek';
          d.enemy.timer = 99;
          d.events.push({ kind: 'aimed' });
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
    const tc = tactic();
    const busy = d.drawLeft >= 0 || d.watch > 0 || d.flashSec > 0;
    // 轮流模式：巡逻在楼下时他缩着等（已经瞄上你的不算）
    if (d.alternateMode && !busy && d.patrolOnStreet()) {
      if (e.mode === 'peek' || e.mode === 'rise') { e.mode = 'fall'; e.timer = RISE_SEC; }
      if (e.mode === 'hide') { e.timer = Math.max(e.timer, 0.8); return; }
    }
    if (!busy) e.timer -= dt;
    if (e.mode === 'hide' && d.relocating) {
      // 缩到窗台下了：换窗，窗帘一扇扇动
      scene.relocateSniper(sc, rand, opts.scopeD, d.t);
      d.relocating = false;
      d.stare = 0;
      e.timer = 1.6;
    } else if (e.mode === 'hide' && e.timer <= 0) {
      e.mode = 'rise';
      e.timer = RISE_SEC;
      // 鸽子：他探头的那栋楼顶上的鸽子飞起来
      if (sc.flocks.length) flushAt(sc.enemy.win.x);
    } else if (e.mode === 'rise' && e.timer <= 0) {
      e.mode = 'peek';
      e.timer = tc.peekSec;
    } else if (e.mode === 'peek' && e.timer <= 0) {
      e.mode = 'fall';
      e.timer = RISE_SEC;
    } else if (e.mode === 'fall' && e.timer <= 0) {
      e.mode = 'hide';
      e.timer = lerp(tc.hideMin, tc.hideMax, rand());
    }
    const k = clamp(1 - e.timer / RISE_SEC, 0, 1);
    sc.enemy.lift = busy || e.mode === 'peek' ? 1 : e.mode === 'rise' ? easeOut(k) : e.mode === 'fall' ? 1 - easeOut(k) : 0;

    // 换位型：被你盯着看就跑
    if (tc.mover && d.exposed() && d.enemyExposed() && d.drawLeft < 0) {
      const h = scene.enemyHead(sc, 1);
      if (Math.hypot(h.x - d.cam.x, h.y - d.cam.y) < 45) d.stare += dt;
      if (d.stare > 1.0) startRelocate();
    }
  }

  // 路人：一直轻轻晃，隔一会儿走开再回来；夜里有的开灯
  function updateFigures(dt) {
    sc.figures.forEach((f) => {
      f.phase += dt;
      f.sway = f.swayOn ? Math.sin(f.phase * 1.7) * 1.6 : 0;
      if (f.kind === 'civ') {
        if (f.phone) {
          f.flashAt -= dt;
          if (f.flashAt <= 0) {
            f.flashOn = !f.flashOn;
            f.flashAt = f.flashOn ? 0.25 : 2.5 + rand() * 4;
          }
        }
        f.timer -= dt;
        if (f.timer <= 0) {
          if (f.lift > 0.5 && rand() < 0.45) {
            f.away = true;
            f.timer = 1.5 + rand() * 2;
          } else {
            f.away = false;
            if (rand() < 0.5) f.pose = 1 - f.pose;
            f.timer = 1.5 + rand() * 3;
          }
          if (sc.night) f.lit = !f.away && rand() < 0.6;
        }
        const target = f.away ? 0 : 1;
        f.lift += clamp(target - f.lift, -dt * 3, dt * 3);
      } else if (f.kind === 'decoy') {
        f.timer -= dt;
        if (f.timer <= 0) {
          f.up = !f.up;
          f.timer = f.up ? 1.2 + rand() * 1.4 : 1.2 + rand() * 2.2;
        }
        f.lift += clamp((f.up ? 1 : 0) - f.lift, -dt / RISE_SEC, dt / RISE_SEC);
      }
    });
    sc.flocks.forEach((fl) => {
      if (fl.state === 'fly' && d.t - fl.t > 1.6) fl.state = 'gone';
      if (fl.state === 'gone' && d.t - fl.t > cfg.conditions.pigeons.backSec) fl.state = 'sit';
    });
  }

  // 掩护关：队友在街上一段段跑，跑的时候他瞄准队友
  function updateMate(dt) {
    const m = sc.mate;
    if (!m || m.done || m.down) return;
    const E = cfg.escort;
    if (m.state === 'hide') {
      m.timer -= dt;
      if (m.timer <= 0) m.state = 'run';
    } else {
      const tx = m.covers[m.next];
      m.x = Math.min(tx, m.x + E.speed * dt);
      if (m.x >= tx) {
        m.next += 1;
        if (m.next >= m.covers.length) {
          m.done = true;
          d.events.push({ kind: 'mateSafe' });
        } else {
          m.state = 'hide';
          m.timer = lerp(E.hideSec[0], E.hideSec[1], rand());
        }
      }
    }
    if (d.aimingMate()) {
      m.lock += dt / E.lockSec;
      if (m.lock >= 1) {
        m.down = true;
        d.state = 'mateDown';
      }
    } else m.lock = Math.max(0, m.lock - dt * 0.15);
  }

  function updateFog() {
    const fogOn = cond === 'fog' || tactic().fog;
    if (!fogOn) {
      d.fog = Math.max(0, d.fog - 0.02);
      return;
    }
    const F = cfg.conditions.fog;
    const cyc = F.thickSec + F.clearSec;
    const p = d.t % cyc;
    // 浓 → 淡（中间有 0.8 秒过渡）
    const target = p < F.thickSec ? 1 : 0.12;
    d.fog += clamp(target - d.fog, -0.02, 0.02);
  }

  d.update = function (dt) {
    d.t += dt;
    if (d.state !== 'play') return;

    d.timeLeft -= dt;
    if (d.timeLeft <= 0) {
      d.timeLeft = 0;
      d.state = 'timeout';
      return;
    }

    // 换窗：爬过去的这段时间等于缩着
    if (d.moving > 0) {
      d.moving -= dt;
      if (d.moving <= 0) {
        d.moving = 0;
        d.me.c = d.moveTo.c;
        d.me.r = d.moveTo.r;
        d.heat = 0;
        d.lock = 0;
        d.drawLeft = -1;
        d.watch = 0;
        d.peeks = 0;
        d.moveTo = null;
        pickTarget();
      }
    }

    // 缩头 / 起来
    const wasExposed = d.exposed();
    const want = d.duckHeld || !d.duckBottomed || d.moving > 0 ? 1 : 0;
    const speed = 2000 / 240; // 一下一上约 0.24 秒
    d.duck = clamp(d.duck + clamp(want - d.duck, -speed * dt, speed * dt), 0, 1);
    if (!d.duckBottomed && d.duck >= 1) {
      d.duckBottomed = true;
      applyChanges();
    }
    if (d.exposed()) d.exposedSec += dt;
    // 又在同一扇窗露头：他会记住
    if (!wasExposed && d.exposed()) {
      d.peeks += 1;
      if (d.peeks >= cfg.learn.aimAt && d.drawLeft < 0) {
        d.seek.x = d.seek.tx = d.me.c;
        d.seek.y = d.seek.ty = d.me.r;
        d.seek.dwell = 3;
        d.heat = Math.max(d.heat, 0.9);
        d.lock = Math.max(d.lock, 0.4);
        d.events.push({ kind: 'learned' });
      }
    }

    updateFog();
    updateCovers(dt);
    updateFigures(dt);
    updateEnemy(dt);
    updateSeek(dt);
    updateMate(dt);
    updatePatrols(dt);
    updateDecoy(dt);
    if (d.state !== 'play') return;
    if (Math.floor(d.t * 5) !== Math.floor((d.t - dt) * 5)) {
      d.seekTrail.push({ x: d.seek.x, y: d.seek.y });
      if (d.seekTrail.length > 50) d.seekTrail.shift();
    }

    // 他瞄着你：你露着头，倒计时就走；缩头躲开，他盯着你的窗口等你出来
    if (d.drawLeft >= 0) {
      if (d.exposed()) {
        d.drawLeft -= dt;
        d.watch = 0;
        if (d.drawLeft <= 0) {
          if (d.helmets > 0) {
            d.helmets -= 1;
            d.drawLeft = -1;
            d.lock = 0;
            d.heat = 0.5;
            d.flashSec = 1.6;
            d.events.push({ kind: 'helmet' });
          } else {
            d.state = 'dead';
            d.holding = false;
            return;
          }
        }
      } else {
        d.watch += dt;
        if (d.watch >= WATCH_SEC) {
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

    d.breath += (dt * (d.holding ? 0.3 : 1) * Math.PI * 2) / cfg.breath.periodSec;
    const amp = swayAmp();
    const tremor = d.steadiness() === 'tremble' ? Math.sin(d.t * 37) * amp * 0.3 : 0;
    d.sway.y = amp * Math.sin(d.breath);
    d.sway.x = amp * 0.35 * Math.sin(d.breath * 2 + 0.7) + tremor;

    // 吸附：屏息时准星离他的头够近，镜头被轻轻拉过去（后面几关没有）
    if (d.holding && cfg.assist) {
      const radius = cfg.assist.radius[d.levelIndex] || 0;
      const head = scene.enemyHead(sc, 1);
      const dx = head.x - d.cam.x;
      const dy = head.y - d.cam.y;
      if (radius > 0 && Math.hypot(dx, dy) < radius) {
        const k = Math.min(1, cfg.assist.perSec * dt);
        d.pan(-dx * k, -dy * k);
      }
    }
  };

  // 镜片反光：他瞄着你、开枪的火光，或者红圈靠近你时一闪一闪（认人的线索）
  d.glint = function () {
    if (d.state !== 'play' && d.state !== 'hit') return false;
    if (d.drawLeft >= 0 || d.flashSec > 0) return true;
    if (!d.searching() || d.aimingMate() || !d.enemyExposed()) return false;
    return d.seekDist() <= S.glintCells && (d.t * 1.2) % 1 < 0.18;
  };
  // 枪管：他探头找你时露出来
  d.barrel = function () {
    return d.searching() && d.enemyExposed();
  };
  // 焦躁型：缩着时敲窗台
  d.tapping = function () {
    return !!tactic().tap && d.enemy.mode === 'hide' && !d.relocating && d.state === 'play';
  };

  d.result = function () {
    return { win: d.state === 'hit', sec: d.t, blinks: d.blinks, shots: d.shots, wasted: d.wasted, lockedOnce: d.lockedOnce };
  };

  return d;
}

module.exports = { createDuel, COLS, ROWS };
