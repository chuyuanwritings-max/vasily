// 0.8 目标关：照《Sniper 3D》做的一关。开局一句话 + 一眼看得见的特征，找到他，开枪。
// 对外长得跟 duel.js 一样（main.js 的镜子、扳机、倒计时、失败页都能直接用），只是规则换成「认目标」。
//
// 关的花样（M.kind）：
//   one 认一个人        runner 会跑（跑出画面就输）    multi 限时打一群
//   bomber 炸弹包（倒计时前打中）   assassin 装成路人、突然掏枪   duel1 一枪定生死（他在瞄你，可以缩头）
//   car 打移动的车里的司机    dark 暗处的两个人（看打火机的光）   light 先打灭灯，再打四个拿枪的
const scene = require('./scene.js');
const people = require('./people.js');
const { clamp, lerp, rng } = require('./util.js');

const NO_MODS = {
  hitRadiusAdd: 0, settleMul: 1, holdMaxAdd: 0, heartMul: 1, quickDrawAdd: 0,
  enemyRateMul: 1, reloadMul: 1, peekCue: false, silent: false, helmets: 0, rescueAdd: 0, clipAdd: 0,
};

function createMission(opts) {
  const cfg = opts.config;
  const R = opts.round;
  const M = R.mission;
  const mods = Object.assign({}, NO_MODS, opts.mods || {});
  const rand = rng(opts.seed ^ 0x7f4a7c15);
  const sc = scene.build(opts.seed, { poseShift: 2, contrast: 0.2 }, opts.scopeD, R.theme, {
    figures: 1,
    decoys: 0,
    night: M.kind === 'dark',
    props: R.props === undefined ? 8 : R.props,
  });
  // 目标关里没有黑剪影：只有有颜色的人。街上的人要看得见：去掉最前面的沙袋和晾衣绳（彩色衣服会跟人混）
  sc.figures = [];
  sc.bags = [];
  sc.distractors = sc.distractors.filter((x) => x.kind !== 'laundry');
  sc.decoy = null;
  sc.people = people.populate(sc, M, opts.seed, (w) => scene.slotBusy(sc, w));
  const targets = sc.people.filter((p) => p.role === 'target');
  // 一枪定生死：他在窗里拿枪瞄你；暗处交易：两个人手里有打火机
  targets.forEach((p) => {
    if (M.kind === 'duel1') p.traits.gun = true;
    if (M.kind === 'dark') p.lighterAt = 0.5 + rand() * 2;
  });
  if (M.kind === 'car') {
    const dir = rand() < 0.5 ? 1 : -1;
    sc.vehicle = { x: dir > 0 ? -60 : sc.w + 60, y: sc.ground + 46, dir, speed: M.carSpeed || 46, color: M.carColor || '#ffd23f', down: false };
  }
  if (M.kind === 'light') sc.lamp = { x: 200 + rand() * 460, y: sc.ground - 120, base: sc.ground + 34, on: true };

  const bulletsMax = (R.bullets || 3) + (mods.clipAdd || 0);
  const d = {
    kind: 'mission',
    sc,
    M,
    round: R,
    opp: { name: '目标' },
    mods,
    cond: null,
    levelIndex: opts.levelIndex || 0,
    COLS: 6,
    ROWS: 3,
    phase: 0,
    bossHp: 0,
    hitRadius: (R.hitR || 7) + mods.hitRadiusAdd,
    cam: { x: sc.w / 2, y: sc.h / 2 },
    t: 0,
    state: 'play',
    bullets: bulletsMax,
    bulletsMax,
    timeLeft: R.time || 60,
    me: { c: 2, r: 1 },
    duck: 0,
    duckHeld: false,
    moving: 0,
    helmets: 0,
    heat: 0,
    lock: 0,
    drawLeft: M.kind === 'duel1' ? M.aimSec || 6 : -1, // 一枪定生死：他还有几秒开枪
    watch: 0,
    flashSec: 0,
    stare: 0,
    relocating: false,
    fog: 0,
    heart: 1,
    holding: false,
    holdSec: 0,
    recoverSec: 0,
    breath: 0,
    sway: { x: 0, y: 0 },
    reloadSec: 0,
    shots: 0,
    wasted: 0,
    wrong: 0,
    headshots: 0,
    kills: 0,
    lockedOnce: M.kind === 'duel1',
    impacts: [],
    hitAt: null,
    lastKill: null,
    events: [],
    seekTrail: [],
    fuse: M.kind === 'bomber' ? M.fuse || 25 : -1,
    alertAt: -1, // 先打灯那关：灯还亮着时打倒一个，其他人几秒后跑
    enemy: { mode: 'peek', timer: 99 },
    canDuck: M.kind === 'duel1',
  };
  d.targets = targets;
  d.targetsLeft = () => targets.filter((p) => !p.down).length;

  // —— 跟 duel.js 一样的接口（main.js 用） ——
  d.pan = function (dx, dy) {
    d.cam.x = clamp(d.cam.x - dx, 30, sc.w - 30);
    d.cam.y = clamp(d.cam.y - dy, 60, sc.h - 18);
  };
  d.exposed = () => d.duck < 0.5;
  d.enemyExposed = () => true;
  d.searching = () => false;
  d.aimingMate = () => false;
  d.onMe = () => false;
  d.seekDist = () => 99;
  d.glint = () => false;
  d.barrel = () => false;
  d.tapping = () => false;
  d.tactic = () => ({});
  d.coverKind = () => null;
  d.enemyBlind = () => false;
  d.moveWindow = () => false;
  d.aimWorld = () => ({ x: d.cam.x + d.sway.x, y: d.cam.y + d.sway.y });
  d.duckDown = function () {
    if (d.canDuck && d.state === 'play') {
      d.duckHeld = true;
      d.holding = false;
    }
  };
  d.duckUp = function () {
    d.duckHeld = false;
  };

  // —— 呼吸和手抖：跟对狙一样 ——
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

  d.triggerDown = function () {
    if (d.state !== 'play' || d.duck > 0 || d.reloadSec > 0 || d.recoverSec > 0 || d.bullets <= 0) return;
    d.holding = true;
    d.holdSec = 0;
  };
  d.triggerUp = function () {
    if (!d.holding) return null;
    d.holding = false;
    d.recoverSec = cfg.breath.recoverSec;
    return fire();
  };

  // 被惊动：街上的跑向近的那边，窗里的缩下去、换一扇窗再出来
  function alert(p) {
    if (p.down || p.alerted) return;
    p.alerted = true;
    if (p.where === 'street') {
      p.running = true;
      p.moving = true;
      p.dir = p.x < sc.w / 2 ? -1 : 1;
      p.speed = M.runSpeed || 80;
    } else {
      p.duckWant = 1;
      p.relocAt = d.t + 2.2;
    }
  }

  // 瞄准点打中了谁：先看头（爆头），再看身子
  function whoIsHit(aim) {
    let best = null;
    sc.people.forEach((p) => {
      if (p.down || p.gone || p.hid || (p.duckK || 0) > 0.5) return;
      const h = people.head(p);
      const dist = Math.hypot(aim.x - h.x, aim.y - h.y);
      const b = people.body(p);
      const inBody = aim.x >= b.x - 1 && aim.x <= b.x + b.w + 1 && aim.y >= b.y && aim.y <= b.y + b.h;
      const head = dist <= Math.max(h.r + 0.8, d.hitRadius * 0.72);
      if (head && (!best || !best.head || dist < best.dist)) best = { p, head: true, dist };
      else if (inBody && !best) best = { p, head: false, dist };
    });
    return best;
  }

  function nearestTargetDist(aim) {
    let m = 1e9;
    targets.forEach((p) => {
      if (p.down) return;
      const h = people.head(p);
      m = Math.min(m, Math.hypot(aim.x - h.x, aim.y - h.y));
    });
    if (sc.vehicle && !sc.vehicle.down) {
      const h = people.vehicleHead(sc.vehicle);
      m = Math.min(m, Math.hypot(aim.x - h.x, aim.y - h.y));
    }
    return m;
  }

  function fire() {
    d.shots += 1;
    d.bullets -= 1;
    d.reloadSec = cfg.shot.reloadSec * mods.reloadMul;
    const aim = d.aimWorld();
    const near = nearestTargetDist(aim);
    let kind = 'miss';
    let headShot = false;
    // 先打灯
    const L = sc.lamp;
    if (L && L.on && Math.hypot(aim.x - L.x, aim.y - (L.y - 4)) <= 9) {
      L.on = false;
      sc.night = true;
      kind = 'lamp';
      d.events.push({ kind: 'lampOff' });
    }
    // 车里的司机
    const v = sc.vehicle;
    if (kind === 'miss' && v && !v.down) {
      const h = people.vehicleHead(v);
      if (Math.hypot(aim.x - h.x, aim.y - h.y) <= Math.max(h.r + 1, d.hitRadius * 0.8)) {
        v.down = true;
        v.speed *= 0.3;
        kind = 'hit';
        headShot = true;
      } else if (aim.x > v.x - 52 && aim.x < v.x + 52 && aim.y > v.y - 36 && aim.y < v.y) {
        kind = 'car';
        v.speed *= 1.4; // 打在车上：他加速
      }
    }
    if (kind === 'miss') {
      const who = whoIsHit(aim);
      if (who && who.p.role === 'target') {
        who.p.down = true;
        who.p.downT = 0;
        kind = 'hit';
        headShot = who.head;
        if (sc.lamp && sc.lamp.on && d.alertAt < 0) d.alertAt = d.t + 2; // 灯还亮着：其他人看见了
      } else if (who) {
        // 打错人：路人吓得躲起来（窗里的缩下去，街上的跑开），没有血；扣时间
        const c = who.p;
        c.hid = true;
        if (c.where === 'win') c.duckWant = 1;
        else {
          c.running = true;
          c.moving = true;
          c.dir = c.x < sc.w / 2 ? -1 : 1;
          c.speed = 90;
        }
        kind = 'wrong';
      } else if (near <= d.hitRadius * 2.5) kind = 'close';
    }
    if (kind === 'hit') {
      d.kills += 1;
      if (headShot) d.headshots += 1;
      d.lastKill = { head: headShot, at: aim };
      d.events.push({ kind: 'kill', head: headShot, left: d.targetsLeft() + (v && !v.down ? 1 : 0) });
      const left = d.targetsLeft() + (v && !v.down ? 1 : 0);
      if (left === 0 || (M.kind === 'car' && v && v.down)) {
        d.state = 'hit';
        d.hitAt = aim;
      }
    } else if (kind !== 'lamp') {
      d.wasted += 1;
      if (kind === 'wrong') {
        d.wrong += 1;
        d.timeLeft = Math.max(0.5, d.timeLeft - cfg.shot.wrongPenaltySec);
      }
      // 枪声惊动了离得近的目标
      targets.forEach((p) => {
        const h = people.head(p);
        if (!p.down && Math.hypot(aim.x - h.x, aim.y - h.y) < 70 && (M.kind === 'runner' || M.kind === 'one' || M.kind === 'assassin')) alert(p);
      });
    }
    d.impacts.push({ x: aim.x, y: aim.y, t: d.t, kind: kind === 'hit' ? 'hit' : kind, dist: near });
    d.events.push({ kind: 'shot', result: kind === 'hit' ? 'hit' : kind === 'lamp' ? 'miss' : kind });
    if (d.state === 'play' && d.bullets <= 0) d.state = M.kind === 'duel1' ? 'dead' : 'dry'; // 一枪定生死：没打中，他就开枪了
    return { hit: kind === 'hit', kind, dist: near, head: headShot };
  }

  // —— 每一帧 ——
  function updatePeople(dt) {
    sc.people.forEach((p) => {
      if (p.down) {
        p.downT = (p.downT || 0) + dt;
        return;
      }
      p.phase += dt;
      // 手机屏幕一闪
      if (p.traits.phone) {
        p.flashAt -= dt;
        if (p.flashAt <= 0) {
          p.flash = 0.35;
          p.flashAt = 1.2 + rand() * 1.6;
        }
        p.flash = Math.max(0, p.flash - dt);
      }
      // 打火机一闪
      if (p.lighterAt !== undefined) {
        p.lighterAt -= dt;
        if (p.lighterAt <= 0) {
          p.lighter = 0.7;
          p.lighterAt = 2 + rand() * 2;
        }
        p.lighter = Math.max(0, (p.lighter || 0) - dt);
        p.lit = p.lighter > 0;
      }
      // 窗里：缩下去 / 起来；被惊动的换一扇窗
      if (p.where === 'win') {
        const want = p.duckWant || 0;
        p.duckK = clamp((p.duckK || 0) + clamp(want - (p.duckK || 0), -dt * 4, dt * 4), 0, 1);
        if (p.relocAt && d.t >= p.relocAt) {
          p.relocAt = 0;
          if (p.flee) p.gone = true;
          else {
            const free = sc.allWindows.filter((w) => !w.bricked && !scene.slotBusy(sc, w) && !sc.people.some((o) => o.win === w) && w.x > 40 && w.x < sc.w - 56 && w.y > 60);
            if (free.length) {
              const w = free[Math.floor(rand() * free.length)];
              p.win = w;
              p.x = w.x + 8;
              p.y = w.y;
            }
            p.duckWant = 0;
            p.alerted = false;
          }
        }
        return;
      }
      // 街上：走走停停，走到头掉头；被惊动的一直跑
      if (p.running) {
        p.x += p.dir * p.speed * dt;
        p.step += dt;
        if (p.x < -14 || p.x > sc.w + 14) p.gone = true;
        return;
      }
      p.pause -= dt;
      if (p.pause > 0) {
        p.moving = false;
        return;
      }
      p.moving = true;
      p.step += dt;
      p.x += p.dir * p.speed * dt;
      if (p.x < 30 || p.x > sc.w - 30) p.dir *= -1;
      if (rand() < dt * 0.25) p.pause = 1 + rand() * 2;
    });
  }

  function updateKind(dt) {
    // 会跑：过几秒他就开始跑
    if (M.kind === 'runner' && d.t >= (M.runAt || 4)) targets.forEach((p) => p.where === 'street' && !p.running && alert(p));
    // 装成路人：每隔几秒掏一下枪
    if (M.kind === 'assassin') {
      targets.forEach((p) => {
        if (p.down) return;
        p.gunT = (p.gunT === undefined ? 3 + rand() * 3 : p.gunT) - dt;
        if (p.gunT <= 0) {
          p.traits.gun = !p.traits.gun;
          p.gunT = p.traits.gun ? 2.2 : 4 + rand() * 3;
          if (p.traits.gun) d.events.push({ kind: 'drawGun' });
        }
      });
    }
    // 炸弹包：倒计时
    if (d.fuse >= 0) {
      d.fuse -= dt;
      if (d.fuse <= 0) {
        d.fuse = 0;
        d.state = 'boom';
      }
    }
    // 一枪定生死：你露着头，他的倒计时就走；缩着头，他慢慢丢了你
    if (M.kind === 'duel1') {
      const full = M.aimSec || 6;
      if (d.exposed()) d.drawLeft -= dt;
      else d.drawLeft = Math.min(full, d.drawLeft + dt * 0.5);
      if (d.drawLeft <= 0) {
        d.drawLeft = 0;
        d.state = 'dead';
      }
    }
    // 车：一直往前开，开出画面就跑了
    const v = sc.vehicle;
    if (v && !v.down) {
      v.x += v.dir * v.speed * dt;
      if (v.x < -70 || v.x > sc.w + 70) d.state = 'escaped';
    }
    // 先打灯那关：灯亮着时打倒一个，剩下的两秒后都跑
    if (d.alertAt >= 0 && d.t >= d.alertAt && sc.lamp && sc.lamp.on) {
      d.alertAt = -1;
      targets.forEach((p) => {
        if (p.down) return;
        p.flee = true;
        if (p.where === 'win') { p.duckWant = 1; p.relocAt = d.t + 0.8; } else alert(p);
      });
    }
    if (targets.some((p) => p.gone && !p.down)) d.state = 'escaped';
  }

  d.update = function (dt) {
    d.t += dt;
    if (d.state !== 'play') {
      sc.people.forEach((p) => p.down && (p.downT = (p.downT || 0) + dt));
      return;
    }
    d.timeLeft -= dt;
    if (d.timeLeft <= 0) {
      d.timeLeft = 0;
      d.state = 'timeout';
      return;
    }
    const want = d.duckHeld ? 1 : 0;
    d.duck = clamp(d.duck + clamp(want - d.duck, -dt * 8, dt * 8), 0, 1);
    updatePeople(dt);
    updateKind(dt);
    if (d.state !== 'play') return;

    const rise = (d.drawLeft >= 0 && d.drawLeft < 3 ? 0.5 : 0) + (d.fuse >= 0 && d.fuse < 8 ? 0.35 : 0) + (d.timeLeft < 10 ? 0.25 : 0);
    d.heart = Math.min(cfg.heart.max, 1 + rise * mods.heartMul);
    if (d.reloadSec > 0) d.reloadSec = Math.max(0, d.reloadSec - dt);
    if (d.recoverSec > 0 && !d.holding) d.recoverSec = Math.max(0, d.recoverSec - dt);
    if (d.holding) d.holdSec += dt;
    d.breath += (dt * (d.holding ? 0.3 : 1) * Math.PI * 2) / cfg.breath.periodSec;
    const amp = swayAmp();
    const tremor = d.steadiness() === 'tremble' ? Math.sin(d.t * 37) * amp * 0.3 : 0;
    d.sway.y = amp * Math.sin(d.breath);
    d.sway.x = amp * 0.35 * Math.sin(d.breath * 2 + 0.7) + tremor;
  };

  // 失败页：差多少
  d.near = function (reason) {
    const left = d.targetsLeft() + (sc.vehicle && !sc.vehicle.down ? 1 : 0);
    const total = targets.length + (sc.vehicle ? 1 : 0);
    if (total > 1 && left < total) return '还差 ' + left + ' 个就打完了';
    if (reason === 'boom') return '炸弹炸了：你离他' + (d.impacts.length ? '最近的一枪差 ' + Math.max(1, Math.round(Math.min.apply(null, d.impacts.map((i) => i.dist)) - d.hitRadius)) + ' 点' : '一枪都还没开');
    if (!d.impacts.length) return '一枪都还没开：先在全景里找' + (M.say ? '「' + M.say + '」' : '');
    const best = Math.min.apply(null, d.impacts.map((i) => i.dist));
    const gap = Math.max(1, Math.round(best - d.hitRadius));
    return '最近一枪离目标' + (gap <= 15 ? '只差 ' : '还差 ') + gap + ' 点';
  };

  d.result = function () {
    return { win: d.state === 'hit', sec: d.t, blinks: 0, shots: d.shots, wasted: d.wasted, lockedOnce: d.lockedOnce, headshots: d.headshots, wrong: d.wrong };
  };

  return d;
}

// 目标卡上的话：关卡写了 say 就用它，没写就用线索拼
function briefText(M) {
  if (M.say) return M.say;
  const c = people.clueText(M.clue || {});
  if (M.kind === 'multi') return '打掉所有' + c + '的人';
  return '目标' + c;
}

module.exports = { createMission, briefText };
