// 《瓦西里》原型主程序：一关三次对狙、按钮、动画、女队友拉人。
// 所有画面都画在一张 canvas 上（微信小游戏没有 HTML 按钮）。
const platform = require('./platform.js');
const config = require('./config.js');
const scene = require('./scene.js');
const { createDuel } = require('./duel.js');
const { clamp, easeOut, roundRect, comicText, starburst } = require('./util.js');

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

const G = {
  mode: 'story',
  modeT: 0,
  levelNo: 1,
  duelIndex: 0,
  attempt: 0,
  duel: null,
  results: [],
  rescuesLeft: config.rescuesPerLevel,
  buttons: [],
  missFlash: 0,
  seedBase: Math.floor(Math.random() * 100000),
};

function setMode(m) {
  G.mode = m;
  G.modeT = 0;
}

function startDuel() {
  G.duel = createDuel({
    seed: G.seedBase + G.levelNo * 1009 + G.duelIndex * 37 + G.attempt * 7919,
    levelNo: G.levelNo,
    duelIndex: G.duelIndex,
    config,
    scopeD: D,
  });
}

function startLevel() {
  G.seedBase = Math.floor(Math.random() * 100000); // 以后好友挑战改成固定 seed
  G.duelIndex = 0;
  G.attempt = 0;
  G.results = [];
  G.rescuesLeft = config.rescuesPerLevel;
  startDuel();
  setMode(config.storyEnabled ? 'story' : 'intro');
}

// —— 输入 ——
function inCircle(b, x, y) {
  return Math.hypot(x - b.x, y - b.y) <= b.r + 8;
}

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
    if (G.mode === 'story' || G.mode === 'intro') {
      if (G.modeT > 0.3) setMode(G.mode === 'story' ? 'intro' : 'play');
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
        if (!res.hit) G.missFlash = 0.8;
      }
    }
  }
}

// —— 规则推进 ——
function update(dt) {
  G.modeT += dt;
  G.missFlash = Math.max(0, G.missFlash - dt);
  const d = G.duel;
  if (G.mode === 'story' && G.modeT > 1.6) setMode('intro');
  else if (G.mode === 'intro' && G.modeT > 1.1) setMode('play');
  else if (G.mode === 'play') {
    d.update(dt);
    if (d.state === 'hit') setMode('hit');
    else if (d.state === 'dead') {
      platform.vibrate(true);
      setMode(G.rescuesLeft > 0 ? 'dead' : 'fail');
    }
  } else if (G.mode === 'hit') {
    if (G.modeT > 1.6) {
      G.results.push(d.result());
      G.duelIndex += 1;
      G.attempt = 0;
      if (G.duelIndex >= config.duelsPerLevel) setMode('win');
      else {
        startDuel();
        setMode('intro');
      }
    }
  } else if (G.mode === 'ad' && G.modeT > config.fakeAdSec) setMode('rescue');
  else if (G.mode === 'rescue' && G.modeT > 1.9) {
    G.rescuesLeft -= 1;
    G.attempt += 1;
    startDuel(); // 拉起来以后重打这一次，对面换个地方藏
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

// —— 画 ——
function drawScope(opt) {
  const d = G.duel;
  const ctx = P.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.arc(scopeC.x, scopeC.y, D / 2, 0, Math.PI * 2);
  ctx.clip();
  scene.draw(ctx, d.sc, opt.cam || d.cam, scopeC.x, scopeC.y, D, {
    glint: d.glint(),
    enemyDrop: opt.enemyDrop || 0,
  });

  // 打空：枪口火光照亮镜头下沿
  if (G.missFlash > 0) {
    ctx.fillStyle = 'rgba(255,220,120,' + (G.missFlash * 0.5).toFixed(2) + ')';
    ctx.fillRect(scopeC.x - D / 2, scopeC.y, D, D / 2);
  }

  // 镜片暗角
  const vg = ctx.createRadialGradient(scopeC.x, scopeC.y, D * 0.3, scopeC.x, scopeC.y, D / 2);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(10,5,20,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(scopeC.x - D / 2, scopeC.y - D / 2, D, D);

  if (!opt.noCross) drawCrosshair(ctx, scopeC.x + d.sway.x, scopeC.y + d.sway.y, d.steadiness());

  // 眨眼：上下眼皮合上再张开
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

  // 镜筒外圈
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#2b2438';
  ctx.beginPath();
  ctx.arc(scopeC.x, scopeC.y, D / 2 + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#6d6380';
  ctx.beginPath();
  ctx.arc(scopeC.x, scopeC.y, D / 2 + 9, 0, Math.PI * 2);
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

  // 左上：这一关第几个对手
  for (let i = 0; i < config.duelsPerLevel; i++) {
    const px = 24 + i * 22;
    ctx.beginPath();
    ctx.arc(px, 40, 7, 0, Math.PI * 2);
    ctx.fillStyle = i < G.results.length ? '#ffd23f' : i === G.duelIndex ? '#f4f1de' : '#4a4060';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

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
  const danger = d.progress >= config.glintAt;
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
  ctx.fillStyle = st === 'steady' ? '#c2263a' : st === 'tremble' ? '#d9730d' : st === 'settling' ? '#7a2d45' : '#3a3150';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  drawCrossIcon(ctx, trigBtn.x, trigBtn.y, 20);
  if (d.reloadSec > 0) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#f4f1de';
    ctx.beginPath();
    ctx.arc(trigBtn.x, trigBtn.y, trigBtn.r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - d.reloadSec / config.shot.reloadSec));
    ctx.stroke();
  }

  // 扳机左上：心跳
  const beat = Math.pow(Math.max(0, Math.sin(d.t * Math.PI * 2 * (1.1 * d.heart))), 8);
  drawHeart(ctx, trigBtn.x - trigBtn.r - 6, trigBtn.y - trigBtn.r + 2, 9 + beat * 3);

  if (G.levelNo === 1 && G.duelIndex === 0 && G.mode === 'play') {
    if (d.blinks < 2) pulse(ctx, eyeBtn);
    else if (d.shots === 0 && !d.holding) pulse(ctx, trigBtn);
  }

  if (G.missFlash > 0) comicText(ctx, '暴露！', scopeC.x, scopeC.y + D / 2 - 30, 26, '#ff4d5e');
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

function button(id, label, x, y, w, h, fn, primary) {
  const ctx = P.ctx;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = primary ? '#ffd23f' : '#3a3150';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = primary ? INK : '#f4f1de';
  ctx.font = '800 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  G.buttons.push({ id, x, y, w, h, fn });
}

function panel(title, sub) {
  const ctx = P.ctx;
  ctx.fillStyle = 'rgba(10,6,18,0.72)';
  ctx.fillRect(0, 0, L.W, L.H);
  comicText(ctx, title, L.W / 2, L.H * 0.3, 44);
  if (sub) {
    ctx.fillStyle = '#f4f1de';
    ctx.font = '600 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sub, L.W / 2, L.H * 0.3 + 44);
  }
}

// 漫画格：开场和对手登场（以后换成戴夫式贴图快动画）
function comicPanel(title, sub) {
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
  comicText(ctx, title, 0, -10, 36);
  if (sub) {
    ctx.fillStyle = INK;
    ctx.font = '700 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sub, 0, 40);
  }
  ctx.restore();
}

function drawHit() {
  const ctx = P.ctx;
  const d = G.duel;
  const t = G.modeT;
  const aimX = scopeC.x + (d.hitAt.x - d.cam.x);
  const aimY = scopeC.y + (d.hitAt.y - d.cam.y);
  drawScope({ enemyDrop: t > 0.45 ? easeOut(clamp((t - 0.45) / 0.5, 0, 1)) * 14 : 0, noCross: t > 0.45 });
  if (t < 0.45) {
    // 子弹慢镜头
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
  }
}

function drawRescue() {
  // 第一人称：倒在地上往上看，女队友伸手把你拉起来
  const ctx = P.ctx;
  const t = G.modeT;
  const lift = t > 1.2 ? easeOut(clamp((t - 1.2) / 0.6, 0, 1)) : 0;
  ctx.save();
  ctx.translate(0, -lift * 40);
  drawScope({ noCross: true, tint: 'rgba(60,60,70,' + (0.65 * (1 - lift)).toFixed(2) + ')' });
  ctx.restore();
  const k = easeOut(clamp(t / 0.7, 0, 1));
  const hx = L.W + 40 - (L.W * 0.55 + 40) * k;
  const hy = -40 + (scopeC.y - 10 + 40) * k - lift * 60;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(-0.6);
  ctx.fillStyle = '#2e86ab';
  ctx.fillRect(0, -22, 220, 44);
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.strokeRect(0, -22, 220, 44);
  ctx.fillStyle = '#e84855';
  ctx.fillRect(-6, -20, 10, 40);
  ctx.fillStyle = '#f1c6a8';
  ctx.beginPath();
  ctx.arc(-26, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const grip = t > 0.75 ? 1 : 0;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-50 + grip * 10, -16 + i * 11, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  if (t > 0.4) {
    const bx = 26;
    const by = scopeC.y + D / 2 - 40;
    roundRect(ctx, bx, by, 210, 46, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = '800 19px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('起来，还没完！', bx + 105, by + 24);
  }
}

function drawFail() {
  const ctx = P.ctx;
  const d = G.duel;
  const head = scene.enemyHead(d.sc);
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
  comicText(ctx, '差一点！', L.W / 2, scopeC.y + D / 2 + 46, 40);
  button('retry', '再试一次', L.W / 2 - 90, L.H - 110, 180, 54, () => startLevel(), true);
}

function drawWin() {
  const ctx = P.ctx;
  panel('拿下！', '第 ' + G.levelNo + ' 关');
  ctx.font = '600 16px sans-serif';
  ctx.fillStyle = '#f4f1de';
  ctx.textAlign = 'center';
  G.results.forEach((r, i) => {
    ctx.fillText('对手 ' + (i + 1) + '　' + r.sec.toFixed(1) + ' 秒　眨眼 ' + r.blinks + ' 次', L.W / 2, L.H * 0.45 + i * 30);
  });
  button(
    'next',
    '下一关',
    L.W / 2 - 90,
    L.H - 120,
    180,
    54,
    () => {
      G.levelNo += 1;
      startLevel();
    },
    true
  );
}

function render() {
  const ctx = P.ctx;
  G.buttons = [];
  ctx.setTransform(P.dpr * scale, 0, 0, P.dpr * scale, 0, 0);
  ctx.fillStyle = '#120c1c';
  ctx.fillRect(0, 0, L.W, L.H);
  const m = G.mode;

  if (m === 'hit') drawHit();
  else if (m === 'rescue') drawRescue();
  else if (m === 'fail') drawFail();
  else if (m !== 'win') drawScope({ tint: m === 'dead' ? 'rgba(120,20,30,0.45)' : null });

  if (m === 'play' || m === 'hit' || m === 'intro' || m === 'story') drawHud();

  if (m === 'story') comicPanel('第 ' + G.levelNo + ' 场', '废墟之城 · 三个狙击手');
  else if (m === 'intro') comicPanel('对手 ' + (G.duelIndex + 1) + ' / ' + config.duelsPerLevel, '眨眼找他，按住屏息，松手开枪');
  else if (m === 'dead') {
    panel('你出局了');
    button('rescue', '▶ 叫队友拉你', L.W / 2 - 110, L.H * 0.52, 220, 58, callTeammate, true);
    button('giveup', '不了', L.W / 2 - 60, L.H * 0.52 + 76, 120, 44, () => setMode('fail'));
  } else if (m === 'ad') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.fillStyle = '#9a90b0';
    ctx.font = '600 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('广告占位（上线后换成激励视频）', L.W / 2, L.H / 2 - 10);
    ctx.font = '900 40px sans-serif';
    ctx.fillText(String(Math.ceil(config.fakeAdSec - G.modeT)), L.W / 2, L.H / 2 + 44);
  } else if (m === 'adWait') {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, L.W, L.H);
  } else if (m === 'win') drawWin();

  ctx.fillStyle = 'rgba(244,241,222,0.35)';
  ctx.font = '500 10px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(config.version, L.W - 10, L.H - 10);
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

startLevel();
platform.exposeForTest('__vasily', { G, config, scene, scopeC, D, eyeBtn, trigBtn, scale, setMode, startLevel });
platform.nextFrame(frame);
