// 精简版对决（Cc 2026-11-21：「狙击手跟狙击手之间拼的不是耐心吗？」「太复杂了」）。
// 照原作《狙击手对决》只做一件事：望远镜找 → 开镜等 → 一枪定胜负。节奏放慢，像《兵临城下》。
//
// 规则：
//   1. 对面藏着一个狙击手。他大部分时间缩着，很久才探一次头。
//   2. 他探头前，附近会有一点小动静（窗帘一动 / 烟头一闪 / 灰尘落下）。这是唯一的线索。
//   3. 望远镜看得宽，不能开枪；点一下想看的地方，换狙击镜对准那里。
//   4. 开着狙击镜你就露着。他探头时也在找你：你镜子开得越久，他的镜片越亮；亮到发白，他就开枪。
//      收镜（回到望远镜）他就慢慢丢了你。
//   5. 他探着头时打中他就赢。打空或者他缩着时开枪，枪声暴露你：他换个地方藏，而且更快找到你。
// 局里不写字，只靠画面和声音。
const scene = require('./scene.js');
const { clamp, lerp, rng } = require('./util.js');

const ZOOM_WIDE = 0.42; // 望远镜：看得宽（缩小）

function createStandoff(opts) {
  const cfg = opts.config;
  const S = cfg.standoff;
  const L = opts.level; // { theme, tell, hideSec, peekSec, noticeSec, bullets, decoys, night }
  const r = rng(opts.seed ^ 0x3c6ef372);
  const D = opts.scopeD;
  const sc = scene.build(opts.seed, { poseShift: 0, contrast: 0.2 }, D, L.theme, { figures: 1, decoys: L.decoys || 0, props: L.props === undefined ? 6 : L.props, night: !!L.night });
  const enemy = sc.enemy;
  enemy.lift = 0;
  enemy.swayOn = false;
  const B = cfg.missionBreath || cfg.breath; // 开镜手感：按住就稳

  const d = {
    sc,
    level: L,
    wide: true, // 望远镜
    cam: { x: sc.w / 2, y: sc.h / 2 },
    t: 0,
    state: 'play', // play → hit / dead / dry
    bullets: L.bullets || 2,
    bulletsMax: L.bullets || 2,
    notice: 0, // 他多清楚你在哪（0..1）：满了他开枪
    maxNotice: 0,
    exposedSec: 0,
    shots: 0,
    misses: 0,
    hitAt: null,
    // 他的节奏：hide → tell（小动静）→ rise → peek → fall → hide
    mode: 'hide',
    timer: lerp(L.hideSec[0], L.hideSec[1], r()),
    ambient: 2, // 别处的小动静（窗帘、亮灯）：假线索，要看仔细
    tellAt: null, // 小动静出现在哪、什么样
    // 开枪
    holding: false,
    holdSec: 0,
    recoverSec: 0,
    reloadSec: 0,
    breath: 0,
    sway: { x: 0, y: 0 },
    heart: 1,
    flash: 0, // 你开枪的火光
    events: [],
    impacts: [],
  };

  function view() {
    return d.wide ? D / ZOOM_WIDE : D;
  }
  function clampCam() {
    const h = view() / 2;
    d.cam.x = h * 2 >= sc.w ? sc.w / 2 : clamp(d.cam.x, Math.min(h, sc.w / 2), Math.max(sc.w - h, sc.w / 2));
    d.cam.y = h * 2 >= sc.h ? sc.h / 2 : clamp(d.cam.y, Math.min(h, sc.h / 2), Math.max(sc.h - h, sc.h / 2));
  }
  clampCam();
  d.view = view;
  d.ZOOM_WIDE = ZOOM_WIDE;

  d.pan = function (dx, dy) {
    const z = d.wide ? ZOOM_WIDE : 1;
    d.cam.x -= dx / z;
    d.cam.y -= dy / z;
    clampCam();
  };
  // 望远镜里点一下：换狙击镜，对准点的地方（屏幕坐标相对镜子中心的偏移）
  d.zoomAt = function (offX, offY) {
    if (!d.wide || d.state !== 'play') return;
    d.cam.x += offX / ZOOM_WIDE;
    d.cam.y += offY / ZOOM_WIDE;
    d.wide = false;
    clampCam();
    d.events.push({ kind: 'scopeIn' });
  };
  // 收镜：回到望远镜（他慢慢丢了你）
  d.scopeOut = function () {
    if (d.wide) return;
    d.wide = true;
    d.holding = false;
    clampCam();
    d.events.push({ kind: 'scopeOut' });
  };
  d.exposed = () => !d.wide;
  d.enemyUp = () => enemy.lift > 0.45;

  function head(lift) {
    return scene.figureHead(enemy, lift === undefined ? enemy.lift : lift);
  }
  d.head = head;

  // —— 开枪：按住稳住，松手开枪 ——
  d.triggerDown = function () {
    if (d.state !== 'play' || d.wide || d.reloadSec > 0 || d.recoverSec > 0 || d.bullets <= 0) return;
    d.holding = true;
    d.holdSec = 0;
  };
  d.triggerUp = function () {
    if (!d.holding) return null;
    d.holding = false;
    d.recoverSec = B.recoverSec;
    return fire();
  };
  d.aimWorld = () => ({ x: d.cam.x + d.sway.x, y: d.cam.y + d.sway.y });
  d.steadiness = function () {
    if (d.recoverSec > 0 && !d.holding) return 'recover';
    if (!d.holding) return 'free';
    if (d.holdSec < B.settleSec) return 'settling';
    if (d.holdSec < B.holdMaxSec) return 'steady';
    return 'tremble';
  };

  function fire() {
    d.shots += 1;
    d.bullets -= 1;
    d.reloadSec = cfg.shot.reloadSec;
    d.flash = 0.25;
    const aim = d.aimWorld();
    const h = head(1);
    const dist = Math.hypot(aim.x - h.x, aim.y - h.y);
    let kind = 'miss';
    if (d.enemyUp() && dist <= L.hitR) kind = 'hit';
    else if (!d.enemyUp() && dist <= L.hitR + 6) kind = 'covered';
    else if (dist <= L.hitR * 2.5) kind = 'close';
    // 打中钢盔假人：也算打空（还暴露了自己）
    if (kind !== 'hit' && sc.decoy) {
      const q = scene.figureHead(sc.decoy, 1);
      if (Math.hypot(aim.x - q.x, aim.y - q.y) <= L.hitR) kind = 'decoy';
    }
    d.impacts.push({ x: aim.x, y: aim.y, t: d.t, kind, dist });
    d.events.push({ kind: 'shot', result: kind });
    if (kind === 'hit') {
      d.state = 'hit';
      d.hitAt = aim;
      return { hit: true, kind, dist };
    }
    // 枪声暴露你：他缩回去换地方，而且更快找到你
    d.misses += 1;
    d.notice = Math.min(0.95, d.notice + S.missNotice);
    if (d.mode !== 'hide') { d.mode = 'fall'; d.timer = 0.25; }
    d.relocate = true;
    if (d.bullets <= 0) d.state = 'dry';
    return { hit: false, kind, dist };
  }

  // 他探头前的小动静：在他那扇窗附近
  function makeTell() {
    const w = enemy.win;
    const kind = L.tell === 'mix' ? ['curtain', 'ember', 'dust'][Math.floor(r() * 3)] : L.tell;
    d.tellAt = { kind, x: w.x + w.w / 2 + (r() - 0.5) * 10, y: w.y + (kind === 'dust' ? -2 : 6), t: d.t };
  }

  function relocate() {
    const before = enemy.win;
    scene.relocateSniper(sc, r, D, d.t);
    sc.trail = []; // 精简版不放窗帘轨迹
    d.relocate = false;
    if (enemy.win === before) return;
  }

  d.update = function (dt) {
    d.t += dt;
    d.flash = Math.max(0, d.flash - dt);
    if (d.state !== 'play') {
      if (d.state === 'hit') enemy.lift = Math.max(0, enemy.lift - dt * 2);
      return;
    }
    // —— 别处的小动静：隔几秒有一扇窗的窗帘动一下、灯亮一下（假线索） ——
    d.ambient -= dt;
    if (d.ambient <= 0 && sc.distractors.length) {
      scene.toggle(sc.distractors[Math.floor(r() * sc.distractors.length)]);
      d.ambient = 2.5 + r() * 3;
    }
    // —— 他的节奏 ——
    d.timer -= dt;
    if (d.mode === 'hide' && d.timer <= 0) {
      if (d.relocate) relocate();
      d.mode = 'tell';
      d.timer = S.tellSec;
      makeTell();
    } else if (d.mode === 'tell' && d.timer <= 0) {
      d.mode = 'rise';
      d.timer = 0.4;
    } else if (d.mode === 'rise' && d.timer <= 0) {
      d.mode = 'peek';
      d.timer = lerp(L.peekSec[0], L.peekSec[1], r());
      d.events.push({ kind: 'peek' });
    } else if (d.mode === 'peek' && d.timer <= 0 && d.notice < 0.75) {
      // 他快确定你在哪时不缩回去，盯着你
      d.mode = 'fall';
      d.timer = 0.4;
    } else if (d.mode === 'fall' && d.timer <= 0) {
      d.mode = 'hide';
      d.timer = lerp(L.hideSec[0], L.hideSec[1], r()) * (d.relocate ? 0.7 : 1);
      d.tellAt = null;
    }
    const want = d.mode === 'peek' || d.mode === 'rise' ? 1 : 0;
    enemy.lift = clamp(enemy.lift + clamp(want - enemy.lift, -dt * 3, dt * 3), 0, 1);

    // —— 他找你：你开着镜子、他探着头，他的把握就涨 ——
    if (!d.wide) d.exposedSec += dt;
    if (d.mode === 'peek' && !d.wide) d.notice = Math.min(1, d.notice + dt / L.noticeSec);
    else if (d.wide) d.notice = Math.max(0, d.notice - dt * S.forgetPerSec);
    d.maxNotice = Math.max(d.maxNotice, d.notice);
    if (d.notice >= 1) {
      d.state = 'dead';
      d.holding = false;
      d.events.push({ kind: 'enemyShot' });
      return;
    }

    // —— 呼吸和手：按住就稳 ——
    d.heart = 1 + d.notice * 0.8;
    if (d.reloadSec > 0) d.reloadSec = Math.max(0, d.reloadSec - dt);
    if (d.recoverSec > 0 && !d.holding) d.recoverSec = Math.max(0, d.recoverSec - dt);
    if (d.holding) d.holdSec += dt;
    d.breath += (dt * (d.holding ? 0.3 : 1) * Math.PI * 2) / B.periodSec;
    let amp = B.amp * d.heart;
    if (d.holding) {
      const steady = B.holdMinAmp * Math.sqrt(d.heart);
      if (d.holdSec < B.settleSec) { const k = d.holdSec / B.settleSec; amp = lerp(amp, steady, k * k); }
      else if (d.holdSec < B.holdMaxSec) amp = steady;
      else amp = steady + (d.holdSec - B.holdMaxSec) * B.tremorPerSec;
    }
    d.sway.y = amp * Math.sin(d.breath);
    d.sway.x = amp * 0.35 * Math.sin(d.breath * 2 + 0.7);
  };

  // 他的镜片有多亮（0..1）：探头时随他的把握变亮。你看见它越亮，越该收镜
  d.glint = function () {
    if (d.state === 'dead') return 1;
    if (d.mode !== 'peek' && d.mode !== 'rise') return 0;
    return 0.15 + 0.85 * d.notice;
  };

  d.result = () => ({ win: d.state === 'hit', sec: d.t, shots: d.shots, misses: d.misses, maxNotice: d.maxNotice });
  return d;
}

module.exports = { createStandoff, ZOOM_WIDE };
