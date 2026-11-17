// 过场动画：全部用代码画，Flash 那个级别——几块颜色、粗黑边、动起来。
// 每个函数都吃 (ctx, L, t, …)：L 是画面大小，t 是这段动画开始后过了几秒。
// 以后换成美术画的贴图，只要换这里，main.js 不用动。
const { clamp, lerp, easeOut, roundRect, comicText, starburst } = require('./util.js');

const INK = '#1b1530';
const ME = { hair: '#1b1530', jacket: '#3a3150', skin: '#e9b48a', style: 'beanie', scarf: '#e3263b' };

const ease = (t) => easeOut(clamp(t, 0, 1));
const pop = (t) => {
  // 弹一下：冲过头再回来
  const k = clamp(t, 0, 1);
  return k < 0.7 ? easeOut(k / 0.7) * 1.15 : 1.15 - 0.15 * ((k - 0.7) / 0.3);
};

function ink(ctx, w) {
  ctx.lineWidth = w || 3;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

// —— 画一个人 ——
// (x, y) 是脚底中点，s 是比例（1 = 大约 120 点高）
// o.pose：'stand' | 'run' | 'sit' ；o.back：背对镜头 ；o.phase：跑步的步子 ；o.headset：戴耳机
function person(ctx, x, y, s, look, o) {
  o = o || {};
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const ph = o.phase || 0;
  const run = o.pose === 'run';
  const sit = o.pose === 'sit';
  ink(ctx, 3 / Math.max(0.6, s));

  // 腿
  ctx.strokeStyle = INK;
  ctx.lineWidth = 9;
  if (run) {
    const a = Math.sin(ph) * 0.9;
    [a, -a].forEach((ang) => {
      ctx.beginPath();
      ctx.moveTo(0, -48);
      const kx = Math.sin(ang) * 22;
      ctx.lineTo(kx, -26);
      ctx.lineTo(kx + Math.sin(ang - 0.6) * 18, -4 + Math.max(0, Math.cos(ang)) * -6);
      ctx.stroke();
    });
  } else if (!sit) {
    ctx.beginPath();
    ctx.moveTo(-7, -48);
    ctx.lineTo(-9, 0);
    ctx.moveTo(7, -48);
    ctx.lineTo(9, 0);
    ctx.stroke();
  }

  const lean = run ? 0.25 : 0;
  ctx.rotate(lean);
  const by = sit ? -38 : -48; // 身子底
  // 围巾飘起来
  if (look.scarf) {
    ctx.fillStyle = look.scarf;
    const fl = run ? Math.sin(ph * 2) * 5 : 0;
    ctx.beginPath();
    ctx.moveTo(-6, by - 46);
    ctx.quadraticCurveTo(-30, by - 46 + fl, -44, by - 38 + fl);
    ctx.lineTo(-40, by - 32 + fl);
    ctx.quadraticCurveTo(-26, by - 38, -4, by - 38);
    ctx.closePath();
    ctx.fill();
    ink(ctx, 2.5);
    ctx.stroke();
  }
  // 枪背在背上
  if (o.rifle) {
    ctx.strokeStyle = '#2b2438';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-18, by - 10);
    ctx.lineTo(22, by - 62);
    ctx.stroke();
    ctx.fillStyle = '#2b2438';
    ctx.fillRect(2, by - 50, 12, 6);
  }
  // 身子（外套）
  roundRect(ctx, -17, by - 48, 34, 50, 10);
  ctx.fillStyle = look.jacket;
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  if (o.team) {
    // 队服胸口一道条
    ctx.fillStyle = o.team;
    ctx.fillRect(-17, by - 30, 34, 6);
  }
  // 胳膊
  ctx.strokeStyle = look.jacket;
  ctx.lineWidth = 9;
  const armA = run ? Math.sin(ph + Math.PI) * 0.9 : o.cheer ? -2.6 : 0.15;
  const armB = run ? Math.sin(ph) * 0.9 : o.cheer ? 2.6 : -0.15;
  [[-15, armA], [15, armB]].forEach(([sx, ang]) => {
    ctx.beginPath();
    ctx.moveTo(sx, by - 42);
    ctx.lineTo(sx + Math.sin(ang) * 26, by - 42 + Math.cos(ang) * 26);
    ctx.stroke();
  });
  // 头
  const hy = by - 64;
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(0, hy, 15, 0, Math.PI * 2);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  hair(ctx, hy, look, o.back);
  if (!o.back) {
    ctx.fillStyle = INK;
    ctx.fillRect(-7, hy - 1, 3, 4);
    ctx.fillRect(4, hy - 1, 3, 4);
    if (o.smile) {
      ctx.beginPath();
      ctx.arc(0, hy + 4, 5, 0.2, Math.PI - 0.2);
      ink(ctx, 2);
      ctx.stroke();
    }
  }
  if (o.headset) {
    ink(ctx, 4);
    ctx.beginPath();
    ctx.arc(0, hy - 2, 17, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.fillStyle = '#2b2438';
    ctx.fillRect(-20, hy - 6, 7, 12);
    ctx.fillRect(13, hy - 6, 7, 12);
  }
  ctx.restore();
}

function hair(ctx, hy, look, back) {
  ctx.fillStyle = look.hair;
  ink(ctx, 2.5);
  ctx.beginPath();
  if (look.style === 'beanie') {
    ctx.arc(0, hy - 2, 16, Math.PI, 0);
    ctx.lineTo(16, hy + 1);
    ctx.lineTo(-16, hy + 1);
    ctx.closePath();
    ctx.fillStyle = '#3a3150';
  } else if (look.style === 'ponytail') {
    ctx.arc(0, hy - 2, 16, Math.PI * 0.9, Math.PI * 2.1);
    ctx.quadraticCurveTo(24, hy + 4, 20, hy + 26);
    ctx.quadraticCurveTo(14, hy + 8, 12, hy - 4);
    ctx.lineTo(-14, hy - 2);
    ctx.closePath();
  } else if (look.style === 'spiky') {
    ctx.moveTo(-16, hy - 2);
    for (let i = 0; i <= 6; i++) ctx.lineTo(-16 + i * 5.3, hy - (i % 2 ? 26 : 14));
    ctx.lineTo(16, hy - 2);
    ctx.closePath();
  } else if (look.style === 'cap') {
    ctx.arc(0, hy - 3, 16, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(back ? -22 : -4, hy - 6, 26, 5);
  } else if (look.style === 'buzz') {
    ctx.arc(0, hy - 3, 15.5, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
  } else {
    ctx.arc(0, hy - 3, 16, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
  }
  if (back) {
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, hy, 15, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
}

function sky(ctx, L, stops, y0, y1, x0) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, stops[0]);
  g.addColorStop(0.6, stops[1]);
  g.addColorStop(1, stops[2]);
  ctx.fillStyle = g;
  ctx.fillRect(x0 || 0, y0, L.W - 2 * (x0 || 0), y1 - y0);
}

function speedLines(ctx, L, t, color) {
  ctx.strokeStyle = color || 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const y = ((i * 97) % L.H);
    const x = L.W - (((t * 900 + i * 173) % (L.W + 200)));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 60 + (i % 3) * 30, y);
    ctx.stroke();
  }
}

// 圆形转场：黑幕从四周收成狙击镜的圆（k=0 全开，k=1 收到镜子那么大）
function iris(ctx, L, cx, cy, r) {
  // 用一圈很粗的描边当黑幕（微信的 canvas 不一定支持 evenodd 挖洞）
  const R = Math.hypot(L.W, L.H) + 20;
  if (r >= R) return;
  ctx.save();
  ctx.strokeStyle = '#120c1c';
  ctx.lineWidth = R - r;
  ctx.beginPath();
  ctx.arc(cx, cy, r + (R - r) / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// —— 开场：标题字 ——
function logo(ctx, L, t) {
  const k = pop(t / 0.6);
  ctx.save();
  ctx.translate(L.W / 2, L.H * 0.14);
  ctx.rotate(-0.06);
  ctx.scale(k, k);
  starburst(ctx, 0, 0, 112, 78, 16, '#e3263b');
  comicText(ctx, '瓦西里', 0, -2, 54);
  ctx.restore();
}

// —— 换位置：从上一个点跑到下一个点（约 2.4 秒）——
// th：下一个点的主题（用它的天空和楼的颜色）
const RELOCATE_SEC = 2.4;
function relocate(ctx, L, t, th, scopeC, D) {
  sky(ctx, L, th.sky, 0, L.H);
  const roofY = L.H * 0.64;
  // 远处的楼往后跑
  ctx.fillStyle = th.far.color;
  for (let i = 0; i < 10; i++) {
    const w = 50 + ((i * 37) % 40);
    const h = 80 + ((i * 53) % 120);
    const x = ((i * 70 - t * 120) % (L.W + 140) + L.W + 140) % (L.W + 140) - 70;
    ctx.fillRect(x, roofY - h - 30, w, h + 40);
  }
  // 脚下的屋顶：两栋楼中间有个缺口，要跳过去
  const scroll = t * 260;
  const gapX = L.W * 0.55 + 260 * 1.05 - scroll; // 约 1.05 秒时缺口跑到人脚下
  const pal = th.pal[0];
  ctx.fillStyle = pal[1];
  ctx.fillRect(-10, roofY, gapX + 10, L.H);
  ctx.fillRect(gapX + 70, roofY - 10, L.W * 3, L.H);
  ink(ctx, 3);
  ctx.strokeRect(-10, roofY, gapX + 10, L.H);
  ctx.strokeRect(gapX + 70, roofY - 10, L.W * 3, L.H);
  ctx.fillStyle = pal[0];
  for (let i = 0; i < 12; i++) {
    const wx = ((i * 55 - scroll) % 660 + 660) % 660 - 40;
    if ((wx > -20 && wx < gapX - 30) || wx > gapX + 80) ctx.fillRect(wx, roofY + 40, 18, 24);
  }
  speedLines(ctx, L, t);

  // 人：跑、在缺口处跳、落地蹲下举枪
  const px = L.W * 0.38;
  let py = roofY;
  let pose = 'run';
  const jumpT = (t - 0.75) / 0.6;
  if (jumpT > 0 && jumpT < 1) py = roofY - 10 * jumpT - Math.sin(jumpT * Math.PI) * 70;
  else if (jumpT >= 1) py = roofY - 10;
  if (t > 1.75) pose = 'sit';
  person(ctx, px, py, 0.9, ME, { pose, phase: t * 16, rifle: true });
  if (jumpT > 0.95 && jumpT < 1.3) {
    comicText(ctx, '咚', px + 40, py - 20, 26 * ease((jumpT - 0.95) / 0.1));
  }

  comicText(ctx, '换个点位', L.W / 2, 70, 30 * pop(t / 0.4));

  // 最后收成狙击镜
  if (t > 1.9) {
    const k = ease((t - 1.9) / 0.5);
    iris(ctx, L, scopeC.x, scopeC.y, lerp(L.H, D / 2, k));
  }
}

// —— 一场打完（约 3 秒）：网吧大屏亮比分，观众跳 ——
const CLEAR_SEC = 3;
function matchClear(ctx, L, t, matchNo, total, crowd) {
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(0, 0, L.W, L.H);
  // 大屏
  const sw = L.W * 0.84;
  const sh = 170;
  const sx = (L.W - sw) / 2;
  const sy = L.H * 0.16;
  ctx.fillStyle = 'rgba(120,200,255,' + (0.15 + 0.1 * Math.sin(t * 8)).toFixed(2) + ')';
  ctx.fillRect(sx - 14, sy - 14, sw + 28, sh + 28);
  roundRect(ctx, sx, sy, sw, sh, 8);
  ctx.fillStyle = '#0d2238';
  ctx.fill();
  ink(ctx, 5);
  ctx.stroke();
  // 比分翻牌
  const flip = ease((t - 0.3) / 0.35);
  ctx.save();
  ctx.translate(L.W / 2, sy + sh / 2 + 10);
  ctx.scale(1, Math.abs(Math.cos((1 - flip) * Math.PI)) || 0.02);
  const shown = flip < 0.5 ? matchNo - 1 : matchNo;
  comicText(ctx, shown + ' : 0', 0, 0, 64, '#ffffff', '#0d2238');
  ctx.restore();
  // 三个点：第几场
  for (let i = 0; i < total; i++) {
    ctx.beginPath();
    ctx.arc(L.W / 2 - (total - 1) * 16 + i * 32, sy + 30, 8, 0, Math.PI * 2);
    ctx.fillStyle = i < matchNo ? '#ffd23f' : '#33445a';
    ctx.fill();
    ink(ctx, 2);
    ctx.stroke();
  }
  // 一排排电脑屏
  for (let row = 0; row < 3; row++) {
    const y = L.H * 0.56 + row * 60;
    const n = 5 + row;
    for (let i = 0; i < n; i++) {
      const w = (L.W / n) * 0.7;
      const x = (L.W / n) * (i + 0.15);
      ctx.fillStyle = 'rgba(90,200,255,' + (0.35 + row * 0.15).toFixed(2) + ')';
      ctx.fillRect(x, y, w, 26 + row * 6);
      ink(ctx, 2);
      ctx.strokeRect(x, y, w, 26 + row * 6);
    }
  }
  // 观众的头，一起跳
  const heads = Math.min(18, 8 + Math.floor(crowd / 20));
  for (let i = 0; i < heads; i++) {
    const x = ((i + 0.5) / heads) * L.W;
    const jump = Math.max(0, Math.sin(t * 9 + i * 1.3)) * 14 * ease((t - 0.5) / 0.3);
    const y = L.H - 40 - (i % 2) * 18 - jump;
    ctx.fillStyle = '#0a0612';
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 22, y + 12, 44, 60);
    if (i % 3 === 0) {
      ctx.fillRect(x + 12, y - 30 - jump * 0.5, 6, 30);
    }
  }
  // 彩纸
  for (let i = 0; i < 40; i++) {
    const x = (i * 83) % L.W;
    const y = ((t - 0.4) * (140 + (i % 5) * 40) + ((i * 47) % 200) - 200);
    if (t < 0.4 || y > L.H) continue;
    ctx.fillStyle = ['#ffd23f', '#e3263b', '#3ef0ff', '#f4f1de'][i % 4];
    ctx.save();
    ctx.translate(x + Math.sin(t * 4 + i) * 10, y);
    ctx.rotate(t * 5 + i);
    ctx.fillRect(-4, -2, 8, 4);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(L.W / 2, L.H * 0.47);
  ctx.rotate(-0.05);
  const k = pop((t - 0.8) / 0.4);
  ctx.scale(k, k);
  comicText(ctx, '第 ' + matchNo + ' 场 拿下！', 0, 0, 36);
  ctx.restore();
}

// —— 女队友把你拉起来（约 3.4 秒，第一人称）——
// drawWorld(ctx)：画你倒下时看到的狙击镜画面（由 main.js 传进来）
const RESCUE_SEC = 3.4;
const HER = { hair: '#1f6f78', jacket: '#2e86ab', skin: '#f1c6a8', style: 'ponytail' };
function rescue(ctx, L, t, th) {
  // 倒在地上往上看：天是斜的；被拉起来时转正
  const pull = ease((t - 1.35) / 0.7);
  const tilt = lerp(-0.42, 0, pull);
  const rise = lerp(L.H * 0.25, 0, pull);
  const shake = t > 1.2 && t < 1.45 ? Math.sin(t * 90) * 6 : 0;
  ctx.save();
  ctx.translate(L.W / 2 + shake, L.H / 2 + rise);
  ctx.rotate(tilt);
  ctx.translate(-L.W / 2, -L.H / 2);
  sky(ctx, L, th.sky, -L.H * 0.4, L.H * 1.4, -L.W * 0.6);
  // 屋顶边和远处的楼
  ctx.fillStyle = th.far.color;
  for (let i = 0; i < 8; i++) ctx.fillRect(-100 + i * 80, L.H * 0.5 - ((i * 53) % 90), 60, L.H);
  ctx.fillStyle = th.pal[0][1];
  ctx.fillRect(-200, L.H * 0.72, L.W * 2, L.H);
  ink(ctx, 4);
  ctx.strokeRect(-200, L.H * 0.72, L.W * 2, L.H);

  // 她：从右上探进来，弯腰往下看你（人在转的画面里，跟着天一起转正）
  const inK = ease((t - 0.25) / 0.6);
  const herX = lerp(L.W + 160, L.W * 0.68, inK);
  const herY = L.H * 0.3 + 235 + pull * 40; // 脚底；头大约在 L.H*0.3
  ctx.save();
  ctx.translate(herX, herY);
  ctx.rotate(-0.28 * (1 - pull) - 0.08);
  person(ctx, 0, 0, 2.1, HER, { headset: true, smile: t > 2.0, team: '#ffd23f' });
  ctx.restore();
  ctx.restore();

  // 她伸过来的手：从她肩膀伸到画面中下，越伸越近（越来越大）
  const reach = ease((t - 0.6) / 0.6);
  const handS = lerp(0.5, 1.15, reach) * (1 - pull * 0.2);
  const handX = lerp(L.W * 0.72, L.W * 0.46, reach);
  const handY = lerp(L.H * 0.42, L.H * 0.62, reach) - pull * 60;
  const shX = herX - 40;
  const shY = L.H * 0.3 + 110 + rise * 0.5;
  if (t > 0.55) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 34 * handS + 8;
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(handX + 10, handY - 6);
    ctx.stroke();
    ctx.strokeStyle = HER.jacket;
    ctx.lineWidth = 34 * handS;
    ctx.stroke();
    ctx.save();
    ctx.translate(handX, handY);
    ctx.scale(handS, handS);
    ctx.fillStyle = HER.skin;
    ink(ctx, 4);
    ctx.beginPath();
    ctx.arc(10, -4, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const grip = t > 1.2 ? 1 : 0;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-16 + grip * 12, -26 + i * 14, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  // 你的手（从下面伸上去握住）
  if (t > 1.0) {
    const k = ease((t - 1.0) / 0.25);
    ctx.save();
    ctx.translate(handX - 30, lerp(L.H + 60, handY + 34, k));
    ctx.rotate(0.15);
    ctx.fillStyle = ME.jacket;
    ctx.fillRect(-26, 0, 52, 200);
    ink(ctx, 4);
    ctx.strokeRect(-26, 0, 52, 200);
    ctx.fillStyle = ME.skin;
    ctx.beginPath();
    ctx.arc(0, -6, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (t > 1.2 && t < 1.7) {
    const k = ease((t - 1.2) / 0.12);
    starburst(ctx, handX, handY, 60 * k, 36 * k, 10, '#ffd23f');
    comicText(ctx, '啪！', handX, handY, 30 * k);
  }

  // 刚倒下：一圈暗、心跳一缩一缩
  const dark = 1 - ease(t / 1.6);
  if (dark > 0) {
    const beat = 0.5 + 0.5 * Math.sin(t * 9);
    const vg = ctx.createRadialGradient(L.W / 2, L.H / 2, L.W * (0.2 + beat * 0.05), L.W / 2, L.H / 2, L.H * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(60,0,10,' + (0.9 * dark).toFixed(2) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.fillStyle = 'rgba(80,80,90,' + (0.45 * dark).toFixed(2) + ')';
    ctx.fillRect(0, 0, L.W, L.H);
  }

  // 她说话
  if (t > 1.7) {
    const k = pop((t - 1.7) / 0.3);
    ctx.save();
    ctx.translate(L.W * 0.36, L.H * 0.12);
    ctx.scale(k, k);
    roundRect(ctx, -110, -28, 220, 56, 18);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ink(ctx, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(50, 26);
    ctx.lineTo(80, 52);
    ctx.lineTo(70, 24);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = '900 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('起来，还没完！', 0, 1);
    ctx.restore();
  }
}

// —— 第一次拿下网吧赛：从网吧椅子上站起来，原来身边坐的都是队友 ——
// 背面（0~3.4 秒）→ 唰 → 正面（队友一个个站起来）→ 横幅
const REVEAL_SEC = 8.5;
function revealScene(ctx, L, t, mates, opts) {
  opts = opts || {};
  const front = t > 3.4;
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(0, 0, L.W, L.H);
  // 墙上的霓虹招牌
  const flick = Math.sin(t * 23) > -0.8 ? 1 : 0.3;
  ctx.save();
  ctx.globalAlpha = flick;
  roundRect(ctx, L.W / 2 - 90, 40, 180, 50, 10);
  ctx.strokeStyle = '#ff4fd8';
  ctx.lineWidth = 4;
  ctx.stroke();
  comicText(ctx, '星光网吧', L.W / 2, 66, 26, '#ffd9f4', '#ff4fd8');
  ctx.restore();

  if (!front) {
    // 背后看：一排电脑，你在中间。前景是网吧里别的客人（黑影）
    const deskY = L.H * 0.5;
    const n = 6;
    const meIdx = 2;
    // 天花板的灯管和墙上的海报
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = 'rgba(200,230,255,0.75)';
      ctx.fillRect(30 + i * ((L.W - 120) / 2), 120, 60, 6);
    }
    [[24, 150, '#e3263b'], [L.W - 84, 160, '#3ef0ff']].forEach(([x, y, c]) => {
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x, y, 60, 80);
      ctx.globalAlpha = 1;
      ink(ctx, 2);
      ctx.strokeRect(x, y, 60, 80);
    });
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * L.W;
      ctx.fillStyle = i === meIdx ? '#ffe9a8' : 'rgba(90,200,255,0.6)';
      ctx.fillRect(x - 28, deskY - 110, 56, 44);
      ink(ctx, 2.5);
      ctx.strokeRect(x - 28, deskY - 110, 56, 44);
      if (i === meIdx && t < 1.4) comicText(ctx, '嘣', x, deskY - 88, 18);
    }
    ctx.fillStyle = '#3a2a4a';
    ctx.fillRect(0, deskY - 64, L.W, 16);
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * L.W;
      if (i === meIdx) continue;
      // 旁边的人：帽衫兜帽戴着，看不出是谁
      const m = mates[i < meIdx ? i : i - 1];
      person(ctx, x, deskY + 22, 0.85, { hair: '#2b2438', jacket: '#2b2438', skin: m.look.skin, style: 'short' }, { pose: 'sit', back: true });
    }
    // 你：慢慢站起来，摘耳机
    const mx = ((meIdx + 0.5) / n) * L.W;
    const up = ease((t - 1.3) / 0.8);
    person(ctx, mx, deskY + 22 + up * 40, 0.85 + up * 0.25, ME, { pose: up > 0.5 ? 'stand' : 'sit', back: true, headset: t < 2.3 });
    if (t > 2.3) {
      const hk = ease((t - 2.3) / 0.4);
      ctx.save();
      ctx.translate(mx + 50 * hk, deskY - 60 - 60 * hk);
      ink(ctx, 5);
      ctx.beginPath();
      ctx.arc(0, 0, 16, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#2b2438';
      ctx.fillRect(-20, -2, 8, 14);
      ctx.fillRect(12, -2, 8, 14);
      ctx.restore();
    }
    // 前景：网吧里别的客人，转过头来，头上冒「！」
    for (let i = 0; i < 5; i++) {
      const x = 20 + i * ((L.W - 40) / 4);
      const y = L.H - 70 + (i % 2) * 24;
      ctx.fillStyle = '#0a0612';
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 50, y + 26, 100, 120);
      if (t > 2.0) {
        const k = pop((t - 2.0 - i * 0.12) / 0.3);
        comicText(ctx, '！', x, y - 62, 40 * k);
      }
    }
    if (t > 3.1) {
      // 唰：白光扫过
      const k = ease((t - 3.1) / 0.3);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * k).toFixed(2) + ')';
      ctx.fillRect(0, 0, L.W, L.H);
    }
    return;
  }

  // 正面：你站中间，五个队友从两边一个个站起来
  const ft = t - 3.4;
  const flash = 1 - ease(ft / 0.3);
  const baseY = L.H * 0.7;
  // 光束
  ctx.fillStyle = 'rgba(255,230,150,0.12)';
  ctx.beginPath();
  ctx.moveTo(L.W / 2 - 40, 0);
  ctx.lineTo(L.W / 2 + 40, 0);
  ctx.lineTo(L.W / 2 + 140, baseY);
  ctx.lineTo(L.W / 2 - 140, baseY);
  ctx.fill();
  // 前排四个（你两边各两个），替补站后排
  const slots = [
    { x: L.W * 0.1, y: baseY, s: 0.85 },
    { x: L.W * 0.3, y: baseY, s: 0.9 },
    { x: L.W * 0.7, y: baseY, s: 0.9 },
    { x: L.W * 0.9, y: baseY, s: 0.85 },
    { x: L.W * 0.62, y: baseY - 46, s: 0.7 },
  ];
  const order = [4, 1, 2, 0, 3]; // 谁先站起来
  const drawOne = (mi, j, tagOnly) => {
    const m = mates[mi];
    const sl = slots[mi];
    const k = ease((ft - 0.5 - j * 0.45) / 0.35);
    if (k <= 0) return;
    if (!tagOnly) {
      person(ctx, sl.x, sl.y + 30 - k * 30, sl.s, m.look, { pose: k > 0.6 ? 'stand' : 'sit', smile: true, cheer: ft > 3.4, team: '#ffd23f' });
      return;
    }
    if (k > 0.8) {
      const tagY = mi === 4 ? sl.y - 150 : sl.y + 8;
      roundRect(ctx, sl.x - 30, tagY, 60, 34, 6);
      ctx.fillStyle = '#f4f1de';
      ctx.fill();
      ink(ctx, 2);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 13px sans-serif';
      ctx.fillText(m.name, sl.x, tagY + 11);
      ctx.font = '600 10px sans-serif';
      ctx.fillText(m.role, sl.x, tagY + 25);
    }
  };
  drawOne(4, 0, false); // 后排先画，被前排挡住一点
  order.forEach((mi, j) => mi !== 4 && drawOne(mi, j, false));
  person(ctx, L.W / 2, baseY, 1.1, ME, { smile: true, cheer: ft > 3.4, team: '#ffd23f' });
  order.forEach((mi, j) => drawOne(mi, j, true));

  if (ft > 3.0) {
    const k = pop((ft - 3.0) / 0.45);
    ctx.save();
    ctx.translate(L.W / 2, L.H * 0.3);
    ctx.rotate(-0.05);
    ctx.scale(k, k);
    starburst(ctx, 0, 0, 125, 82, 18, '#e3263b');
    comicText(ctx, opts.title || '职业战队！', 0, 0, 36);
    ctx.restore();
  }
  if (flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * flash).toFixed(2) + ')';
    ctx.fillRect(0, 0, L.W, L.H);
  }
}

// —— 卡牌上的小图 ——
function cardIcon(ctx, icon, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ink(ctx, 3);
  ctx.fillStyle = '#e3263b';
  ctx.beginPath();
  if (icon === 'lung') {
    ctx.ellipse ? ctx.ellipse(-10, 4, 10, 16, 0.2, 0, Math.PI * 2) : ctx.arc(-10, 4, 12, 0, Math.PI * 2);
    ctx.moveTo(20, 4);
    ctx.ellipse ? ctx.ellipse(10, 4, 10, 16, -0.2, 0, Math.PI * 2) : ctx.arc(10, 4, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#ff8fa3';
  } else if (icon === 'scope') {
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#3ef0ff';
  } else if (icon === 'ear') {
    ctx.arc(0, -2, 18, Math.PI, 0);
    ctx.rect(-22, -4, 10, 16);
    ctx.rect(12, -4, 10, 16);
    ctx.fillStyle = '#2e86ab';
  } else if (icon === 'heart') {
    ctx.moveTo(0, 16);
    ctx.bezierCurveTo(-26, -2, -12, -22, 0, -8);
    ctx.bezierCurveTo(12, -22, 26, -2, 0, 16);
  } else if (icon === 'bullet') {
    ctx.rect(-6, -6, 12, 22);
    ctx.moveTo(-6, -6);
    ctx.quadraticCurveTo(0, -24, 6, -6);
    ctx.fillStyle = '#ffd23f';
  } else if (icon === 'leaf') {
    ctx.moveTo(-18, 14);
    ctx.quadraticCurveTo(-16, -18, 18, -16);
    ctx.quadraticCurveTo(16, 16, -18, 14);
    ctx.fillStyle = '#90be6d';
  } else if (icon === 'charm') {
    ctx.rect(-12, -16, 24, 32);
    ctx.fillStyle = '#ffd23f';
  } else {
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#f9c74f';
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

module.exports = {
  ME, HER, person, logo, iris,
  relocate, RELOCATE_SEC,
  matchClear, CLEAR_SEC,
  rescue, RESCUE_SEC,
  revealScene, REVEAL_SEC,
  cardIcon,
};
