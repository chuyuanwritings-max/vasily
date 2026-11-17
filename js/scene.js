// 场景：一张「废墟之城」，按 seed 随机生成。
// 分三层画出透视：远景天际线（移得慢）、中景楼房（藏人的地方）、近景沙袋（移得快）。
const { rng, mix } = require('./util.js');

const WORLD_W = 860;
const WORLD_H = 600;
const GROUND = 530;
const INK = '#1b1530';
const WIN_DARK = '#241a2e';
const FAR_PARALLAX = 0.55;
const NEAR_PARALLAX = 1.25;

const PALETTE = [
  ['#c9705a', '#8e4a3d'],
  ['#d9a05b', '#9b6a35'],
  ['#7f9c8a', '#4f6b5b'],
  ['#b48aa8', '#7a5672'],
  ['#cfbf8a', '#8f8250'],
];
const CLOTH = ['#e84855', '#2e86ab', '#f4f1de', '#f9c74f', '#90be6d'];

// D：狙击镜直径。藏身点必须能被挪到镜子正中，所以离边太近的窗户不算。
function build(seed, duelCfg, D) {
  const r = rng(seed);
  const buildings = [];
  let x = 18;
  while (x < WORLD_W - 110) {
    const w = 130 + Math.floor(r() * 80);
    const top = 120 + Math.floor(r() * 150);
    const pal = PALETTE[Math.floor(r() * PALETTE.length)];
    const b = { x, y: top, w, h: GROUND - top, fill: pal[0], shade: pal[1], roof: [], windows: [] };
    for (let i = 0; i <= 6; i++) b.roof.push(r() < 0.45 ? r() * 20 : 0);
    const cols = Math.floor((w - 20) / 30);
    const rows = Math.floor((b.h - 40) / 42);
    const pad = (w - cols * 30) / 2 + 7;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        b.windows.push({
          x: x + pad + col * 30,
          y: top + 24 + row * 42,
          w: 16,
          h: 22,
          bricked: r() < 0.12,
        });
      }
    }
    buildings.push(b);
    x += w + 18 + Math.floor(r() * 26);
  }

  const half = D / 2 + 4;
  const allWindows = [];
  buildings.forEach((b) => b.windows.forEach((w) => allWindows.push(w)));
  const spots = allWindows.filter(
    (w) =>
      !w.bricked &&
      w.x + w.w / 2 > half &&
      w.x + w.w / 2 < WORLD_W - half &&
      w.y + w.h / 2 > half &&
      w.y + w.h / 2 < WORLD_H - half
  );
  const spot = spots[Math.floor(r() * spots.length)];

  // 干扰：会在你眨眼时变的东西
  const distractors = [];
  const free = allWindows.filter((w) => !w.bricked && w !== spot);
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const tmp = free[i];
    free[i] = free[j];
    free[j] = tmp;
  }
  free.slice(0, 16).forEach((w) => {
    const kind = r() < 0.7 ? 'curtain' : 'lit';
    distractors.push({ kind, win: w, state: r() < 0.5 ? 0 : 1, x: w.x + 8, y: w.y + 11 });
  });
  buildings.forEach((b) => {
    if (r() < 0.6) {
      const px = b.x + 20 + r() * (b.w - 40);
      distractors.push({ kind: 'pigeon', x: px, y: b.y - 2, state: 0 });
    }
  });
  for (let i = 0; i < buildings.length - 1; i++) {
    const a = buildings[i];
    const b = buildings[i + 1];
    const y = Math.max(a.y, b.y) + 40 + r() * 60;
    if (y < GROUND - 40) {
      const colors = [0, 1, 2].map(() => CLOTH[Math.floor(r() * CLOTH.length)]);
      distractors.push({ kind: 'laundry', x1: a.x + a.w, x2: b.x, x: (a.x + a.w + b.x) / 2, y, colors, state: 0 });
    }
  }

  const far = [];
  let fx = -40;
  while (fx < WORLD_W * FAR_PARALLAX + 400) {
    const fw = 40 + r() * 70;
    far.push({ x: fx, w: fw, h: 120 + r() * 160 });
    fx += fw + 6;
  }

  const bags = [];
  for (let bx = -60; bx < WORLD_W * NEAR_PARALLAX + 200; bx += 46 + r() * 30) bags.push({ x: bx, h: 18 + r() * 22 });

  return {
    seed,
    w: WORLD_W,
    h: WORLD_H,
    buildings,
    spots,
    distractors,
    far,
    bags,
    enemy: {
      win: spot,
      pose: r() < 0.5 ? 0 : 1,
      shift: duelCfg.poseShift,
      color: mix(WIN_DARK, '#7a6a88', duelCfg.contrast * 3),
    },
  };
}

function enemyHead(sc) {
  const e = sc.enemy;
  const dx = e.pose ? e.shift : -e.shift;
  return { x: e.win.x + e.win.w / 2 + dx, y: e.win.y + 8 };
}

function toggle(d) {
  if (d.kind === 'laundry') d.colors.push(d.colors.shift());
  else d.state = 1 - d.state;
}

// cam：镜子正中对着的世界坐标；(cx, cy)：镜子正中在屏幕上的位置
function draw(ctx, sc, cam, cx, cy, D, opt) {
  const ox = cx - cam.x;
  const oy = cy - cam.y;

  // 天空
  const sky = ctx.createLinearGradient(0, cy - D / 2, 0, cy + D / 2);
  sky.addColorStop(0, '#ff9f6b');
  sky.addColorStop(0.6, '#f6c28b');
  sky.addColorStop(1, '#f2d8a7');
  ctx.fillStyle = sky;
  ctx.fillRect(cx - D / 2, cy - D / 2, D, D);
  // 网点（美漫味道）
  ctx.fillStyle = 'rgba(180,70,60,0.13)';
  const step = 9;
  const sx0 = cx - D / 2 - ((ox % step) + step) % step;
  for (let y = cy - D / 2; y < cy + D / 2; y += step) {
    for (let x = sx0; x < cx + D / 2; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 远景：移得慢，就有了深度
  const fox = cx - cam.x * FAR_PARALLAX;
  const foy = cy - cam.y * 0.8;
  ctx.fillStyle = '#c98a8f';
  sc.far.forEach((f) => {
    ctx.fillRect(fox + f.x, foy + GROUND - 40 - f.h, f.w, f.h + 200);
  });

  // 中景楼房
  sc.buildings.forEach((b) => {
    ctx.beginPath();
    ctx.moveTo(ox + b.x, oy + GROUND);
    for (let i = 0; i <= 6; i++) ctx.lineTo(ox + b.x + (b.w * i) / 6, oy + b.y + b.roof[i]);
    ctx.lineTo(ox + b.x + b.w, oy + GROUND);
    ctx.closePath();
    ctx.fillStyle = b.fill;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = b.shade;
    ctx.fillRect(ox + b.x + b.w - 10, oy + b.y + 18, 8, b.h - 18);
    b.windows.forEach((w) => {
      ctx.fillStyle = w.bricked ? b.shade : WIN_DARK;
      ctx.fillRect(ox + w.x, oy + w.y, w.w, w.h);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.strokeRect(ox + w.x, oy + w.y, w.w, w.h);
    });
  });

  // 干扰物
  sc.distractors.forEach((d) => {
    if (d.kind === 'curtain') {
      const w = d.win;
      ctx.fillStyle = '#e9d8b4';
      const cw = w.w * 0.55;
      ctx.fillRect(ox + w.x + (d.state ? w.w - cw : 0), oy + w.y, cw, w.h);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + w.x + (d.state ? w.w - cw : 0), oy + w.y, cw, w.h);
    } else if (d.kind === 'lit') {
      if (d.state) {
        const w = d.win;
        ctx.fillStyle = '#ffe28a';
        ctx.fillRect(ox + w.x + 1, oy + w.y + 1, w.w - 2, w.h - 2);
      }
    } else if (d.kind === 'pigeon') {
      const px = ox + d.x + (d.state ? 9 : 0);
      const py = oy + d.y;
      ctx.fillStyle = '#d6d3e0';
      ctx.beginPath();
      ctx.arc(px, py - 4, 4, 0, Math.PI * 2);
      ctx.arc(px + 4, py - 8, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (d.kind === 'laundry') {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox + d.x1, oy + d.y);
      ctx.quadraticCurveTo(ox + d.x, oy + d.y + 8, ox + d.x2, oy + d.y);
      ctx.stroke();
      const span = d.x2 - d.x1;
      d.colors.forEach((c, i) => {
        const lx = ox + d.x1 + (span * (i + 1)) / 4 - 4;
        ctx.fillStyle = c;
        ctx.fillRect(lx, oy + d.y + 3, 8, 11);
        ctx.strokeRect(lx, oy + d.y + 3, 8, 11);
      });
    }
  });

  // 对面的狙击手：一个比窗里黑暗稍亮一点的剪影
  const e = sc.enemy;
  const head = enemyHead(sc);
  const drop = opt.enemyDrop || 0;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox + e.win.x, oy + e.win.y, e.win.w, e.win.h);
  ctx.clip();
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(ox + head.x, oy + head.y + drop, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(ox + head.x - 7, oy + head.y + 5 + drop, 14, 12);
  ctx.restore();
  if (!drop) {
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ox + head.x + 2, oy + head.y + 7);
    ctx.lineTo(ox + head.x - 4 - (e.pose ? 7 : 4), oy + e.win.y + e.win.h + 2);
    ctx.stroke();
  }
  if (opt.glint) {
    const gx = ox + head.x - 2;
    const gy = oy + head.y + 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(gx, gy - 7);
    ctx.lineTo(gx + 1.5, gy - 1.5);
    ctx.lineTo(gx + 7, gy);
    ctx.lineTo(gx + 1.5, gy + 1.5);
    ctx.lineTo(gx, gy + 7);
    ctx.lineTo(gx - 1.5, gy + 1.5);
    ctx.lineTo(gx - 7, gy);
    ctx.lineTo(gx - 1.5, gy - 1.5);
    ctx.closePath();
    ctx.fill();
  }

  // 地面
  ctx.fillStyle = '#6b5a52';
  ctx.fillRect(cx - D / 2, oy + GROUND, D, D);

  // 近景沙袋：移得快
  const nox = cx - cam.x * NEAR_PARALLAX;
  const noy = cy - cam.y * NEAR_PARALLAX + WORLD_H * (NEAR_PARALLAX - 1) * 0.5;
  sc.bags.forEach((bag) => {
    ctx.fillStyle = '#a8946b';
    ctx.beginPath();
    ctx.ellipse
      ? ctx.ellipse(nox + bag.x, noy + WORLD_H - 8, 30, bag.h, 0, Math.PI, 0)
      : ctx.arc(nox + bag.x, noy + WORLD_H - 8, 30, Math.PI, 0);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  });
}

module.exports = { build, draw, enemyHead, toggle, WORLD_W, WORLD_H };
