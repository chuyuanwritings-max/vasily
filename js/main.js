// 《瓦西里》原型主程序：开场 → 三场比赛（每场三个对手）→ 网吧揭晓 → 战队经营。
// 所有画面都画在一张 canvas 上（微信小游戏没有 HTML 按钮）。
//
// 流程（G.mode）：
//   title 开场 → story 第几场 → intro 对手登场 → play 对狙 → hit 爆头
//     → move 换点位（下一个对手）…… 三个打完 → clear 这场拿下 → pick 三选一卡 → 下一场
//     → 三场打完 → reveal 网吧揭晓（第一次）/ champ 冠军（之后）→ team 战队
//   被打死：dead → ad 广告 → rescue 女队友拉起来 → play；拉人次数用完 → fail
const platform = require('./platform.js');
const config = require('./config.js');
const scene = require('./scene.js');
const themes = require('./themes.js');
const team = require('./team.js');
const cut = require('./cutscene.js');
const { createDuel } = require('./duel.js');
const { clamp, lerp, easeOut, roundRect, comicText, starburst, rng } = require('./util.js');

const INK = '#1b1530';
const DESIGN_W = 375;

const touches = {};
const P = platform.setup(onTouch);
const scale = P.width / DESIGN_W;
const L = { W: DESIGN_W, H: P.height / scale };
const D = Math.min(L.W * 0.94, L.H * 0.56);
const scopeC = { x: L.W / 2, y: 70 + D / 2 };
const btnY = Math.min(L.H - 70, scopeC.y + D / 2 + (L.H - scopeC.y - D / 2) / 2);
const eyeBtn = { x: L.W * 0.24, y: btnY, r: 38 };
const trigBtn = { x: L.W * 0.73, y: btnY, r: 50 };
const MATCHES = config.matches.length;

const G = {
  mode: 'title',
  modeT: 0,
  t: 0,
  matchNo: 1, // 第几场（1~3），也是难度
  duelIndex: 0,
  attempt: 0,
  duel: null,
  results: [],
  cards: [], // 这一次网吧赛拿到的临场卡
  offer: [], // 选卡页上的三张
  mods: null,
  rescuesLeft: config.rescuesPerLevel,
  earned: 0, // 这一次网吧赛拿了多少奖金
  buttons: [],
  missFlash: 0,
  toast: null,
  seedBase: Math.floor(Math.random() * 100000),
  title: null, // 开场背景
};

function setMode(m) {
  G.mode = m;
  G.modeT = 0;
}

function toast(text) {
  G.toast = { text, t: 0 };
}

function match() {
  return config.matches[G.matchNo - 1];
}

function themeId(duelIndex) {
  const ids = match().themes;
  return ids[Math.min(duelIndex, ids.length - 1)];
}

function startDuel() {
  G.duel = createDuel({
    seed: G.seedBase + G.matchNo * 1009 + G.duelIndex * 37 + G.attempt * 7919,
    levelNo: G.matchNo,
    duelIndex: G.duelIndex,
    config,
    scopeD: D,
    theme: themeId(G.duelIndex),
    mods: G.mods,
  });
}

// 一场比赛：三个对手。打输了重打这一场，手里的卡留着。
function startMatch() {
  G.seedBase = Math.floor(Math.random() * 100000); // 以后好友挑战改成固定 seed
  G.duelIndex = 0;
  G.attempt = 0;
  G.results = [];
  G.mods = team.mods(G.cards);
  G.rescuesLeft = config.rescuesPerLevel + G.mods.rescueAdd;
  startDuel();
  setMode(config.storyEnabled ? 'story' : 'intro');
}

// 一次网吧赛：三场。
function startRun() {
  G.matchNo = 1;
  G.cards = [];
  G.earned = 0;
  startMatch();
}

function goTitle() {
  const ids = themes.ORDER;
  const id = ids[Math.floor(Math.random() * ids.length)];
  G.title = { sc: scene.build(Math.floor(Math.random() * 99999), config.duels[0], D, id) };
  setMode('title');
}

// —— 输入 ——
function inCircle(b, x, y) {
  return Math.hypot(x - b.x, y - b.y) <= b.r + 8;
}

const TAP_TO_SKIP = { story: 0.3, intro: 0.3, clear: 1.0, reveal: 1.0, move: 0.6 };

function onTouch(type, id, sx, sy) {
  const x = sx / scale;
  const y = sy / scale;
  if (type === 'down') {
    const hitBtn = G.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hitBtn) {
      touches[id] = { role: 'ui' };
      hitBtn.fn();
      return;
    }
    const skip = TAP_TO_SKIP[G.mode];
    if (skip !== undefined) {
      if (G.modeT > skip) skipAhead();
      touches[id] = { role: 'ui' };
      return;
    }
    if (G.mode !== 'play') return;
    if (inCircle(eyeBtn, x, y)) {
      touches[id] = { role: 'eye' };
      G.duel.blink();
    } else if (inCircle(trigBtn, x, y)) {
      touches[id] = { role: 'trigger' };
      G.duel.triggerDown();
    } else if (Math.hypot(x - scopeC.x, y - scopeC.y) < D / 2 + 30) {
      touches[id] = { role: 'pan', x, y };
    }
  } else if (type === 'move') {
    const t = touches[id];
    if (t && t.role === 'pan' && G.mode === 'play') {
      G.duel.pan(x - t.x, y - t.y);
      t.x = x;
      t.y = y;
    }
  } else {
    const t = touches[id];
    delete touches[id];
    if (t && t.role === 'trigger' && G.mode === 'play') {
      const res = G.duel.triggerUp();
      if (res) {
        platform.vibrate(true);
        G.lastShot = res;
        if (!res.hit) G.missFlash = 1.0;
      }
    }
  }
}

// 点一下跳过过场
function skipAhead() {
  const m = G.mode;
  if (m === 'story') setMode('intro');
  else if (m === 'intro') setMode('play');
  else if (m === 'move') afterMove();
  else if (m === 'clear') afterClear();
  else if (m === 'reveal' && G.modeT < cut.REVEAL_SEC - 1.2) G.modeT = cut.REVEAL_SEC - 1.2;
}

// —— 规则推进 ——
function afterHit() {
  G.results.push(G.duel.result());
  G.earned += team.earn('perKill');
  G.attempt = 0;
  if (G.duelIndex + 1 < config.duelsPerLevel) {
    G.duelIndex += 1;
    startDuel(); // 下一个点位先建好，换位置动画用它的天色
    setMode('move');
  } else {
    G.earned += team.earn('perMatch');
    setMode('clear');
  }
}

function afterMove() {
  setMode('intro');
}

function afterClear() {
  if (G.matchNo < MATCHES) {
    G.offer = team.drawCards(G.cards, rng(G.seedBase + 3));
    setMode('pick');
  } else {
    G.earned += team.earn('perCup');
    if (!team.state().revealed) {
      team.reveal();
      setMode('reveal');
    } else setMode('champ');
  }
}

function pickCard(id) {
  G.cards.push(id);
  G.matchNo += 1;
  startMatch();
}

function update(dt) {
  G.t += dt;
  G.modeT += dt;
  G.missFlash = Math.max(0, G.missFlash - dt);
  if (G.toast) {
    G.toast.t += dt;
    if (G.toast.t > 2.2) G.toast = null;
  }
  const d = G.duel;
  const m = G.mode;
  if (m === 'story' && G.modeT > 1.8) setMode('intro');
  else if (m === 'intro' && G.modeT > 1.4) setMode('play');
  else if (m === 'play') {
    d.update(dt);
    if (d.state === 'hit') setMode('hit');
    else if (d.state === 'dead') {
      platform.vibrate(true);
      setMode(G.rescuesLeft > 0 ? 'dead' : 'fail');
    }
  } else if (m === 'hit') {
    d.update(dt);
    if (G.modeT > 1.6) afterHit();
  } else if (m === 'move' && G.modeT > cut.RELOCATE_SEC) afterMove();
  else if (m === 'clear' && G.modeT > cut.CLEAR_SEC) afterClear();
  else if (m === 'ad' && G.modeT > config.fakeAdSec) setMode('rescue');
  else if (m === 'rescue' && G.modeT > cut.RESCUE_SEC) {
    G.rescuesLeft -= 1;
    G.attempt += 1;
    startDuel(); // 拉起来以后重打这一个，对面换个地方藏
    setMode('play');
  }
}

function callTeammate() {
  const real = platform.showRewardedAd(
    config.rewardedAdUnitId,
    () => setMode('rescue'),
    () => setMode('fail')
  );
  if (!real) setMode('ad');
  else setMode('adWait');
}

// —— 画：狙击镜 ——
function drawScope(opt) {
  const d = G.duel;
  const ctx = P.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.arc(scopeC.x, scopeC.y, D / 2, 0, Math.PI * 2);
  ctx.clip();
  const cam = opt.cam || d.cam;
  scene.draw(ctx, d.sc, cam, scopeC.x, scopeC.y, D, {
    glint: d.glint(),
    enemyDrop: opt.enemyDrop || 0,
    t: G.t,
  });

  // 每一枪的弹孔：打在哪儿都看得见
  d.impacts.forEach((imp) => {
    if (imp.kind === 'hit') return;
    const ix = scopeC.x + imp.x - cam.x;
    const iy = scopeC.y + imp.y - cam.y;
    const age = d.t - imp.t;
    if (age < 0.5) {
      ctx.strokeStyle = 'rgba(240,225,200,' + (1 - age * 2).toFixed(2) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ix, iy, 4 + age * 30, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#120c1c';
    ctx.beginPath();
    ctx.arc(ix, iy, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#120c1c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + 0.4;
      ctx.moveTo(ix + Math.cos(a) * 3, iy + Math.sin(a) * 3);
      ctx.lineTo(ix + Math.cos(a) * 7, iy + Math.sin(a) * 7);
    }
    ctx.stroke();
  });

  if (G.missFlash > 0) {
    ctx.fillStyle = 'rgba(255,220,120,' + (G.missFlash * 0.5).toFixed(2) + ')';
    ctx.fillRect(scopeC.x - D / 2, scopeC.y, D, D / 2);
  }

  const vg = ctx.createRadialGradient(scopeC.x, scopeC.y, D * 0.3, scopeC.x, scopeC.y, D / 2);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(10,5,20,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(scopeC.x - D / 2, scopeC.y - D / 2, D, D);

  // 他正在瞄你：镜子边缘一圈红光一闪一闪
  if (d.drawLeft >= 0 && d.state === 'play') {
    const a = 0.3 + 0.2 * Math.sin(d.t * 20);
    const rg = ctx.createRadialGradient(scopeC.x, scopeC.y, D * 0.4, scopeC.x, scopeC.y, D / 2);
    rg.addColorStop(0, 'rgba(255,0,40,0)');
    rg.addColorStop(1, 'rgba(255,0,40,' + a.toFixed(2) + ')');
    ctx.fillStyle = rg;
    ctx.fillRect(scopeC.x - D / 2, scopeC.y - D / 2, D, D);
  }

  if (!opt.noCross) drawCrosshair(ctx, scopeC.x + d.sway.x, scopeC.y + d.sway.y, d.steadiness());

  if (d.blinkMs >= 0) {
    const half = d.dcfg.blinkMs / 2;
    const k = d.blinkMs < half ? d.blinkMs / half : 1 - (d.blinkMs - half) / half;
    const lid = (D / 2) * clamp(k * 1.15, 0, 1);
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(scopeC.x - D / 2, scopeC.y - D / 2, D, lid);
    ctx.fillRect(scopeC.x - D / 2, scopeC.y + D / 2 - lid, D, lid);
  }
  if (opt.tint) {
    ctx.fillStyle = opt.tint;
    ctx.fillRect(scopeC.x - D / 2, scopeC.y - D / 2, D, D);
  }
  ctx.restore();
  scopeRing(ctx, scopeC.x, scopeC.y, D);
}

function scopeRing(ctx, x, y, d) {
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#2b2438';
  ctx.beginPath();
  ctx.arc(x, y, d / 2 + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#6d6380';
  ctx.beginPath();
  ctx.arc(x, y, d / 2 + 9, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCrosshair(ctx, x, y, steadiness) {
  const color = steadiness === 'steady' ? '#e3263b' : steadiness === 'tremble' ? '#ff8a00' : '#1b1530';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - D / 2, y);
  ctx.lineTo(x - 8, y);
  ctx.moveTo(x + 8, y);
  ctx.lineTo(x + D / 2, y);
  ctx.moveTo(x, y - D / 2);
  ctx.lineTo(x, y - 8);
  ctx.moveTo(x, y + 8);
  ctx.lineTo(x, y + D / 2);
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 1; i <= 4; i++) {
    ctx.fillRect(x - 1, y + 8 + i * 12, 2, 2);
    ctx.fillRect(x - 8 - i * 12, y - 1, 2, 2);
    ctx.fillRect(x + 8 + i * 12, y - 1, 2, 2);
  }
  ctx.beginPath();
  ctx.arc(x, y, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawEyeIcon(ctx, x, y, s, closed) {
  ctx.strokeStyle = '#f4f1de';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.quadraticCurveTo(x, y - (closed ? 2 : s * 0.9), x + s, y);
  ctx.quadraticCurveTo(x, y + s * 0.9, x - s, y);
  ctx.stroke();
  if (!closed) {
    ctx.fillStyle = '#f4f1de';
    ctx.beginPath();
    ctx.arc(x, y, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
}

function pulse(ctx, b) {
  const k = (G.modeT * 1.4) % 1;
  ctx.strokeStyle = 'rgba(255,210,63,' + (1 - k).toFixed(2) + ')';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r + 6 + k * 18, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHud() {
  const ctx = P.ctx;
  const d = G.duel;

  // 左上：第几场、这一场第几个对手
  ctx.fillStyle = '#f4f1de';
  ctx.font = '800 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('第 ' + G.matchNo + ' 场', 16, 20);
  for (let i = 0; i < config.duelsPerLevel; i++) {
    const px = 24 + i * 22;
    ctx.beginPath();
    ctx.arc(px, 42, 7, 0, Math.PI * 2);
    ctx.fillStyle = i < G.results.length ? '#ffd23f' : i === G.duelIndex ? '#f4f1de' : '#4a4060';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  // 右上：手里的临场卡
  G.cards.forEach((id, i) => {
    const c = team.CARDS.find((x) => x.id === id);
    const cx = L.W - 22 - i * 30;
    roundRect(ctx, cx - 12, 28, 24, 30, 4);
    ctx.fillStyle = '#f2d8a7';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    cut.cardIcon(ctx, c.icon, cx, 43, 0.42);
  });

  // 正中上方：对面的镜片，越红越快找到你
  const mx = L.W / 2;
  const my = 40;
  ctx.beginPath();
  ctx.arc(mx, my, 15, 0, Math.PI * 2);
  ctx.fillStyle = '#2b2438';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.arc(mx, my, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * d.progress);
  ctx.closePath();
  const danger = d.progress >= config.glintAt || d.locked;
  ctx.fillStyle = danger && Math.sin(G.modeT * 12) > 0 ? '#ff4d5e' : '#c2263a';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#6d6380';
  ctx.beginPath();
  ctx.arc(mx, my, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(mx - 5, my - 5, 3, 0, Math.PI * 2);
  ctx.fill();
  if (d.locked) comicText(ctx, d.drawLeft >= 0 ? '他要开枪！' : '他找到你了', mx, scopeC.y - D / 2 + 34, d.drawLeft >= 0 ? 24 : 16, '#ff4d5e');
  else if (d.peekCue()) {
    // 观察手（或耳机卡）报点
    const k = Math.min(1, G.modeT * 8);
    roundRect(ctx, mx - 74, scopeC.y - D / 2 + 16, 148, 30, 15);
    ctx.fillStyle = '#2e86ab';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎧 要出来了！', mx, scopeC.y - D / 2 + 31 + (1 - k) * 4);
  }

  // 左下：眨眼按钮，外圈是眼睛酸度
  ctx.beginPath();
  ctx.arc(eyeBtn.x, eyeBtn.y, eyeBtn.r, 0, Math.PI * 2);
  ctx.fillStyle = '#3a3150';
  ctx.fill();
  const sore = d.eyeOpenSec / config.eye.openMaxSec;
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#2b2438';
  ctx.beginPath();
  ctx.arc(eyeBtn.x, eyeBtn.y, eyeBtn.r - 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = sore > 0.75 ? '#ff4d5e' : '#f9c74f';
  ctx.beginPath();
  ctx.arc(eyeBtn.x, eyeBtn.y, eyeBtn.r - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sore);
  ctx.stroke();
  drawEyeIcon(ctx, eyeBtn.x, eyeBtn.y, 17, d.blinkMs >= 0);

  // 右下：扳机。按住屏息，松手开枪
  const st = d.steadiness();
  ctx.beginPath();
  ctx.arc(trigBtn.x, trigBtn.y, trigBtn.r, 0, Math.PI * 2);
  ctx.fillStyle = st === 'steady' ? '#c2263a' : st === 'tremble' ? '#d9730d' : st === 'settling' ? '#7a2d45' : st === 'recover' ? '#26203a' : '#3a3150';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  drawCrossIcon(ctx, trigBtn.x, trigBtn.y, 20);
  if (d.reloadSec > 0) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#f4f1de';
    ctx.beginPath();
    ctx.arc(trigBtn.x, trigBtn.y, trigBtn.r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - d.reloadSec / (config.shot.reloadSec * d.mods.reloadMul)));
    ctx.stroke();
  }

  const beat = Math.pow(Math.max(0, Math.sin(d.t * Math.PI * 2 * (1.1 * d.heart))), 8);
  drawHeart(ctx, trigBtn.x - trigBtn.r - 6, trigBtn.y - trigBtn.r + 2, 9 + beat * 3);

  if (G.matchNo === 1 && G.duelIndex === 0 && G.mode === 'play') {
    if (d.blinks < 2) pulse(ctx, eyeBtn);
    else if (d.shots === 0 && !d.holding) pulse(ctx, trigBtn);
  }

  if (G.missFlash > 0 && G.lastShot) {
    const words = { covered: '他缩着！', close: '差一点！', miss: '偏了！' };
    comicText(ctx, words[G.lastShot.kind] || '偏了！', scopeC.x, scopeC.y + D / 2 - 44, 28, G.lastShot.kind === 'close' ? '#ffd23f' : '#ff4d5e');
    if (!d.locked) comicText(ctx, '位置暴露', scopeC.x, scopeC.y + D / 2 - 16, 15, '#f4f1de');
  }
}

function drawCrossIcon(ctx, x, y, s) {
  ctx.strokeStyle = '#f4f1de';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, s * 0.7, 0, Math.PI * 2);
  ctx.moveTo(x - s, y);
  ctx.lineTo(x + s, y);
  ctx.moveTo(x, y - s);
  ctx.lineTo(x, y + s);
  ctx.stroke();
}

function drawHeart(ctx, x, y, s) {
  ctx.fillStyle = '#ff4d5e';
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.2, x - s * 0.6, y - s * 1.2, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.4, y - s * 0.2, x, y + s * 0.9);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// —— 画：按钮和面板 ——
function button(id, label, x, y, w, h, fn, primary, disabled) {
  const ctx = P.ctx;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = disabled ? '#2b2438' : primary ? '#ffd23f' : '#3a3150';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = disabled ? '#6d6380' : primary ? INK : '#f4f1de';
  ctx.font = '800 ' + (h < 40 ? 14 : 18) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  G.buttons.push({ id, x, y, w, h, fn });
}

function text(str, x, y, size, color, align, weight) {
  const ctx = P.ctx;
  ctx.fillStyle = color || '#f4f1de';
  ctx.font = (weight || 600) + ' ' + size + 'px sans-serif';
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function panel(title, sub) {
  const ctx = P.ctx;
  ctx.fillStyle = 'rgba(10,6,18,0.72)';
  ctx.fillRect(0, 0, L.W, L.H);
  comicText(ctx, title, L.W / 2, L.H * 0.3, 44);
  if (sub) text(sub, L.W / 2, L.H * 0.3 + 44, 15);
}

// 漫画格：第几场、对手登场
function comicPanel(title, sub, sub2) {
  const ctx = P.ctx;
  const k = easeOut(clamp(G.modeT / 0.25, 0, 1));
  ctx.fillStyle = 'rgba(10,6,18,0.6)';
  ctx.fillRect(0, 0, L.W, L.H);
  ctx.save();
  ctx.translate(L.W / 2, L.H * 0.42);
  ctx.rotate(-0.05);
  ctx.scale(k, k);
  roundRect(ctx, -150, -80, 300, 160, 6);
  ctx.fillStyle = '#f2d8a7';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,80,60,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 40, Math.sin(a) * 25);
    ctx.lineTo(Math.cos(a) * 170, Math.sin(a) * 100);
    ctx.stroke();
  }
  comicText(ctx, title, 0, -22, 36);
  if (sub) text(sub, 0, 28, 16, INK, 'center', 800);
  if (sub2) text(sub2, 0, 52, 13, INK, 'center', 600);
  ctx.restore();
}

function drawHit() {
  const ctx = P.ctx;
  const d = G.duel;
  const t = G.modeT;
  const aimX = scopeC.x + (d.hitAt.x - d.cam.x);
  const aimY = scopeC.y + (d.hitAt.y - d.cam.y);
  drawScope({ enemyDrop: t > 0.45 ? easeOut(clamp((t - 0.45) / 0.5, 0, 1)) * 14 : 0, noCross: true });
  if (t < 0.9) drawCrosshair(ctx, aimX, aimY, 'steady');
  if (t < 0.45) {
    const k = t / 0.45;
    const sx = scopeC.x;
    const sy = scopeC.y + D / 2;
    ctx.strokeStyle = 'rgba(255,240,200,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (aimX - sx) * k, sy + (aimY - sy) * k);
    ctx.stroke();
  } else {
    const k = easeOut(clamp((t - 0.45) / 0.2, 0, 1));
    starburst(ctx, aimX, aimY, 70 * k, 42 * k, 12, '#ff4d5e');
    comicText(ctx, '嘣！', aimX, aimY, 44 * k);
    comicText(ctx, '爆头', aimX, aimY + 52, 18 * k, '#f4f1de');
    if (t > 0.8) comicText(ctx, '+¥' + Math.round(config.money.perKill * team.BASES[team.state().base].mul), L.W / 2, scopeC.y + D / 2 + 26, 20, '#90ee90');
  }
}

function drawFail() {
  const ctx = P.ctx;
  const d = G.duel;
  const head = scene.enemyHead(d.sc, 1);
  const cam = { x: clamp(head.x, D / 2, d.sc.w - D / 2), y: clamp(head.y, D / 2, d.sc.h - D / 2) };
  drawScope({ cam, noCross: true });
  const ex = scopeC.x + head.x - cam.x;
  const ey = scopeC.y + head.y - cam.y;
  ctx.strokeStyle = '#ff4d5e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(ex, ey + 4, 22 + Math.sin(G.modeT * 6) * 3, 0, Math.PI * 2);
  ctx.stroke();
  comicText(ctx, '他在这儿！', ex, ey - 40, 22, '#ffffff');
  comicText(ctx, '差一点！', L.W / 2, scopeC.y + D / 2 + 40, 40);
  button('retry', '重打这一场', L.W / 2 - 100, L.H - 150, 200, 54, () => startMatch(), true);
  button('home', '回主页', L.W / 2 - 60, L.H - 84, 120, 42, goTitle);
}

// —— 开场 ——
function drawTitle() {
  const ctx = P.ctx;
  const sc = G.title.sc;
  const t = G.modeT;
  const d = Math.min(L.W * 0.82, L.H * 0.42);
  const tc = { x: L.W / 2, y: L.H * 0.3 + d / 2 + 10 };
  // 镜子慢慢扫过一片城
  const cam = { x: sc.w / 2 + Math.sin(t * 0.25) * (sc.w / 2 - d / 2 - 10), y: sc.h / 2 + Math.sin(t * 0.17) * 40 };
  ctx.save();
  ctx.beginPath();
  ctx.arc(tc.x, tc.y, d / 2, 0, Math.PI * 2);
  ctx.clip();
  scene.draw(ctx, sc, cam, tc.x, tc.y, d, { t: G.t, glint: Math.sin(t * 2) > 0.92 });
  ctx.fillStyle = 'rgba(10,5,20,0.15)';
  ctx.fillRect(0, 0, L.W, L.H);
  ctx.strokeStyle = 'rgba(27,21,48,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tc.x - d / 2, tc.y);
  ctx.lineTo(tc.x + d / 2, tc.y);
  ctx.moveTo(tc.x, tc.y - d / 2);
  ctx.lineTo(tc.x, tc.y + d / 2);
  ctx.stroke();
  ctx.restore();
  scopeRing(ctx, tc.x, tc.y, d);
  cut.logo(ctx, L, t);
  text('眨眼找人 · 屏息开枪', L.W / 2, L.H * 0.14 + 92, 14, '#f4f1de', 'center', 700);

  const S = team.state();
  const by = Math.min(L.H - 150, tc.y + d / 2 + 30);
  button('start', S.cups ? '再打一次网吧赛' : '开始比赛', L.W / 2 - 110, by, 220, 58, startRun, true);
  button('team', S.revealed ? '战队' : '🔒 战队', L.W / 2 - 80, by + 74, 160, 44, () => {
    if (S.revealed) setMode('team');
    else toast('赢下第一次网吧赛就知道了');
  });
  if (S.money) text('奖金 ¥' + S.money, L.W / 2, by + 136, 13, '#ffd23f', 'center', 800);
}

// —— 选卡：三选一 ——
function drawPick() {
  const ctx = P.ctx;
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(0, 0, L.W, L.H);
  comicText(ctx, '选一张', L.W / 2, L.H * 0.16, 38);
  text('带进下一场（这次网吧赛一直有效）', L.W / 2, L.H * 0.16 + 38, 13);
  const cw = 108;
  const ch = 170;
  const gap = 10;
  const x0 = (L.W - cw * 3 - gap * 2) / 2;
  const y0 = L.H * 0.32;
  G.offer.forEach((c, i) => {
    const k = easeOut(clamp((G.modeT - i * 0.12) / 0.3, 0, 1));
    if (k <= 0) return;
    const x = x0 + i * (cw + gap);
    const y = y0 + (1 - k) * 60;
    ctx.save();
    ctx.globalAlpha = k;
    roundRect(ctx, x, y, cw, ch, 10);
    ctx.fillStyle = '#f2d8a7';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    cut.cardIcon(ctx, c.icon, x + cw / 2, y + 52, 1.1);
    text(c.name, x + cw / 2, y + 108, 17, INK, 'center', 900);
    text(c.desc, x + cw / 2, y + 136, 12, INK, 'center', 700);
    ctx.restore();
    if (k >= 1) G.buttons.push({ id: 'card' + i, x, y, w: cw, h: ch, fn: () => pickCard(c.id) });
  });
  if (G.cards.length) {
    text('已经有：' + G.cards.map((id) => team.CARDS.find((x) => x.id === id).name).join('、'), L.W / 2, y0 + ch + 40, 13, '#c9c2e0');
  }
}

// —— 战队页 ——
function drawTeam() {
  const ctx = P.ctx;
  const S = team.state();
  ctx.fillStyle = S.base >= 2 ? '#14233a' : S.base === 1 ? '#1e1838' : '#1a1030';
  ctx.fillRect(0, 0, L.W, L.H);
  comicText(ctx, '战队', 60, 44, 32);
  text('奖金 ¥' + S.money, L.W - 16, 34, 16, '#ffd23f', 'right', 900);
  text('粉丝 ' + S.fans + ' · 冠军 ' + S.cups, L.W - 16, 56, 12, '#c9c2e0', 'right', 700);

  // 训练基地
  const base = team.BASES[S.base];
  const next = team.BASES[S.base + 1];
  roundRect(ctx, 14, 78, L.W - 28, 54, 10);
  ctx.fillStyle = '#2b2438';
  ctx.fill();
  text('🏠 ' + base.name, 28, 96, 15, '#f4f1de', 'left', 900);
  text('奖金 ×' + base.mul, 28, 117, 12, '#c9c2e0', 'left', 600);
  if (next) button('base', '升级 ¥' + base.cost, L.W - 130, 88, 106, 34, () => {
    if (!team.upgradeBase()) toast('奖金不够');
    else toast('搬进' + team.BASES[S.base].name + '！');
  }, S.money >= base.cost, S.money < base.cost);
  else text('满级', L.W - 40, 105, 13, '#ffd23f', 'right', 800);

  const top = 146;
  const rowH = Math.min(92, (L.H - top - 80) / team.TEAMMATES.length);
  team.TEAMMATES.forEach((m, i) => {
    const y = top + i * rowH;
    const lv = S.team[m.id] || 0;
    roundRect(ctx, 14, y, L.W - 28, rowH - 8, 10);
    ctx.fillStyle = '#3a3150';
    ctx.fill();
    // 头像
    ctx.save();
    ctx.beginPath();
    ctx.arc(46, y + (rowH - 8) / 2, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#f2d8a7';
    ctx.fill();
    ctx.clip();
    cut.person(ctx, 46, y + (rowH - 8) / 2 + 82, 0.9, m.look, { smile: true, team: '#ffd23f' });
    ctx.restore();
    text(m.name + '  ' + m.role, 82, y + 18, 15, '#f4f1de', 'left', 900);
    text('【' + m.buff + '】' + m.desc(lv), 82, y + 40, 11, '#ffd23f', 'left', 700);
    for (let k = 0; k < team.MAX_LV; k++) {
      ctx.beginPath();
      ctx.arc(88 + k * 14, y + 60, 5, 0, Math.PI * 2);
      ctx.fillStyle = k < lv ? '#ffd23f' : '#2b2438';
      ctx.fill();
    }
    if (lv < team.MAX_LV) {
      const cost = team.trainCost(lv);
      button('train_' + m.id, '练 ¥' + cost, L.W - 100, y + rowH - 46, 76, 32, () => {
        if (!team.train(m.id)) toast('奖金不够');
      }, S.money >= cost, S.money < cost);
    } else text('满级', L.W - 40, y + rowH - 30, 13, '#ffd23f', 'right', 800);
  });

  button('back', '回主页', 20, L.H - 66, 120, 44, goTitle);
  button('replay', '重看揭晓', L.W - 140, L.H - 66, 120, 44, () => setMode('reveal'));
}

// —— 网吧赛赢了 ——
function drawReveal(champ) {
  const ctx = P.ctx;
  const t = champ ? 3.4 + Math.min(G.modeT, 4) + 0.6 : G.modeT;
  cut.revealScene(ctx, L, t, team.TEAMMATES, { title: champ ? '冠军！' : '职业战队！' });
  const done = champ ? G.modeT > 1.2 : G.modeT > cut.REVEAL_SEC - 0.6;
  if (!champ && !done && G.modeT > 1) text('点一下跳过', L.W - 16, L.H - 20, 11, 'rgba(244,241,222,0.5)', 'right');
  if (done) {
    text('这次网吧赛奖金 ¥' + G.earned, L.W / 2, L.H - 150, 15, '#ffd23f', 'center', 900);
    button('toTeam', '进入战队', L.W / 2 - 110, L.H - 126, 220, 54, () => setMode('team'), true);
    button('home2', '回主页', L.W / 2 - 60, L.H - 62, 120, 40, goTitle);
  }
}

function render() {
  const ctx = P.ctx;
  G.buttons = [];
  ctx.setTransform(P.dpr * scale, 0, 0, P.dpr * scale, 0, 0);
  ctx.fillStyle = '#120c1c';
  ctx.fillRect(0, 0, L.W, L.H);
  const m = G.mode;

  if (m === 'title') drawTitle();
  else if (m === 'team') drawTeam();
  else if (m === 'pick') drawPick();
  else if (m === 'reveal') drawReveal(false);
  else if (m === 'champ') drawReveal(true);
  else if (m === 'clear') cut.matchClear(ctx, L, G.modeT, G.matchNo, MATCHES, team.state().fans);
  else if (m === 'move') cut.relocate(ctx, L, G.modeT, G.duel.sc.theme, scopeC, D);
  else if (m === 'rescue') {
    cut.rescue(ctx, L, G.modeT, G.duel.sc.theme);
    const left = cut.RESCUE_SEC - G.modeT;
    if (left < 0.4) cut.iris(ctx, L, scopeC.x, scopeC.y, lerp(D / 2, L.H, left / 0.4));
  } else if (m === 'hit') drawHit();
  else if (m === 'fail') drawFail();
  else drawScope({ tint: m === 'dead' ? 'rgba(120,20,30,0.45)' : null });

  if (m === 'play' || m === 'hit' || m === 'intro' || m === 'story') drawHud();

  if (m === 'story') {
    const mt = match();
    comicPanel(mt.name, mt.place + ' · 三个狙击手', G.cards.length ? '带着 ' + G.cards.length + ' 张卡' : '');
  } else if (m === 'intro') {
    const dc = G.duel.dcfg;
    comicPanel('对手 ' + (G.duelIndex + 1) + ' / ' + config.duelsPerLevel, G.duel.sc.theme.name + ' · ' + dc.name, dc.sub);
  } else if (m === 'dead') {
    panel('你出局了');
    button('rescue', '▶ 叫队友拉你', L.W / 2 - 110, L.H * 0.52, 220, 58, callTeammate, true);
    button('giveup', '不了', L.W / 2 - 60, L.H * 0.52 + 76, 120, 44, () => setMode('fail'));
  } else if (m === 'ad') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, L.W, L.H);
    text('广告占位（上线后换成激励视频）', L.W / 2, L.H / 2 - 10, 16, '#9a90b0');
    text(String(Math.ceil(config.fakeAdSec - G.modeT)), L.W / 2, L.H / 2 + 44, 40, '#9a90b0', 'center', 900);
  } else if (m === 'adWait') {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, L.W, L.H);
  }

  if (G.toast) {
    const a = Math.min(1, (2.2 - G.toast.t) * 3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    roundRect(ctx, L.W / 2 - 140, L.H * 0.8, 280, 40, 20);
    ctx.fillStyle = '#f4f1de';
    ctx.fill();
    text(G.toast.text, L.W / 2, L.H * 0.8 + 20, 14, INK, 'center', 800);
    ctx.restore();
  }

  text(config.version, L.W - 10, L.H - 8, 10, 'rgba(244,241,222,0.35)', 'right', 500);
}

let last = platform.now();
function frame() {
  const t = platform.now();
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  update(dt);
  render();
  platform.nextFrame(frame);
}

goTitle();
startMatch(); // 先把第一场备好（开场背后不画它），点「开始比赛」再从头开
setMode('title');
platform.exposeForTest('__vasily', { _sd: startDuel, G, config, scene, team, cut, scopeC, D, eyeBtn, trigBtn, scale, setMode, startRun, startMatch, afterClear });
platform.nextFrame(frame);
