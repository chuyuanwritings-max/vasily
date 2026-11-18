// 场景：按 seed 随机生成一片楼，按主题（themes.js）换画法。
// 分三层画出透视：远景（移得慢）、中景楼房（藏人的地方）、近景掩体（移得快）。
const { rng, mix } = require('./util.js');
const themes = require('./themes.js');

const WORLD_W = 860;
const WORLD_H = 600;
const GROUND = 530;
const INK = '#1b1530';
const FAR_PARALLAX = 0.55;
const NEAR_PARALLAX = 1.25;

const CLOTH = ['#e84855', '#2e86ab', '#f4f1de', '#f9c74f', '#90be6d'];

// D：狙击镜直径。藏身点必须能被挪到镜子正中，所以离边太近的窗户不算。
// extra：{ figures 一共几个人影（含狙击手）, decoys 头盔假人几个, night, pigeons, escort }
function build(seed, duelCfg, D, themeId, extra) {
  extra = extra || {};
  const th = themes.get(themeId);
  const r = rng(seed);
  const buildings = [];
  const flatTop = th.roof !== 'jagged';
  let x = 18;
  while (x < WORLD_W - 110) {
    const w = 130 + Math.floor(r() * 80);
    const top = 130 + Math.floor(r() * 140);
    const pal = th.pal[Math.floor(r() * th.pal.length)];
    const b = { x, y: top, w, h: GROUND - top, fill: pal[0], shade: pal[1], roof: [], windows: [], tank: r() < 0.7, tankX: r() };
    for (let i = 0; i <= 6; i++) b.roof.push(!flatTop && r() < 0.45 ? r() * 20 : 0);
    const cols = Math.floor((w - 20) / 30);
    const rows = Math.floor((b.h - 40) / 42);
    const pad = (w - cols * 30) / 2 + 7;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        b.windows.push({ x: x + pad + col * 30, y: top + 24 + row * 42, w: 16, h: 22, bricked: r() < 0.12 });
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
  const color = mix(th.winDark, '#8a7a98', (duelCfg.contrast || 0.2) * 3);
  // 人影：第一个是狙击手，后面是路人和头盔假人。互相隔开一点
  const figures = [{ kind: 'sniper', win: spot, lift: 0, pose: r() < 0.5 ? 0 : 1, shift: duelCfg.poseShift || 3, color, sway: 0, swayOn: true, phase: r() * 6 }];
  const nFig = Math.max(1, extra.figures || 1);
  const nDecoy = extra.decoys || 0;
  const taken = (w) => figures.some((f) => Math.abs(f.win.x - w.x) + Math.abs(f.win.y - w.y) < 70);
  const pool = spots.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  for (const w of pool) {
    if (figures.length >= nFig + nDecoy) break;
    if (taken(w)) continue;
    const isDecoy = figures.length >= nFig;
    figures.push({
      kind: isDecoy ? 'decoy' : 'civ', win: w, lift: isDecoy ? 0 : 1, pose: r() < 0.5 ? 0 : 1, shift: 3, color,
      sway: 0, swayOn: !isDecoy, phase: r() * 6, stick: !isDecoy && r() < 0.35, timer: 1 + r() * 3, lit: false,
    });
  }
  const decoy = figures.find((f) => f.kind === 'decoy') || null;

  // 干扰：会在你眨眼时变的东西
  const distractors = [];
  const free = allWindows.filter((w) => !w.bricked && !figures.some((f) => f.win === w));
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const tmp = free[i];
    free[i] = free[j];
    free[j] = tmp;
  }
  free.slice(0, 16).forEach((w) => {
    const kind = r() < 0.65 ? 'curtain' : 'lit';
    distractors.push({ kind, win: w, state: r() < 0.5 ? 0 : 1, x: w.x + 8, y: w.y + 11 });
  });
  const ex = th.extras || {};
  buildings.forEach((b) => {
    if (ex.bird && r() < 0.6) distractors.push({ kind: 'pigeon', x: b.x + 20 + r() * (b.w - 40), y: b.y - 2, state: 0 });
    const signColors = ex.neon || ex.sign;
    if (signColors && r() < 0.75) {
      const sw = Math.min(70, b.w * 0.5);
      distractors.push({ kind: 'sign', x: b.x + 10 + r() * (b.w - sw - 20), y: b.y + 5, w: sw, h: 13, colors: signColors, state: Math.floor(r() * 2), neon: !!ex.neon });
    }
    if (ex.lantern) {
      [b.x + 8, b.x + b.w - 8].forEach((lx) => distractors.push({ kind: 'lantern', x: lx, y: b.y + 14, state: r() < 0.5 ? 0 : 1 }));
    }
  });
  if (ex.laundry) {
    for (let i = 0; i < buildings.length - 1; i++) {
      const a = buildings[i];
      const b = buildings[i + 1];
      const y = Math.max(a.y, b.y) + 40 + r() * 60;
      if (y < GROUND - 40) {
        const colors = [0, 1, 2].map(() => CLOTH[Math.floor(r() * CLOTH.length)]);
        distractors.push({ kind: 'laundry', x1: a.x + a.w, x2: b.x, x: (a.x + a.w + b.x) / 2, y, colors, state: 0 });
      }
    }
  }

  const far = [];
  let fx = -40;
  while (fx < WORLD_W * FAR_PARALLAX + 400) {
    const fw = 40 + r() * 70;
    far.push({ x: fx, w: fw, h: 120 + r() * 160, v: r() });
    fx += fw + 6;
  }

  const bags = [];
  for (let bx = -60; bx < WORLD_W * NEAR_PARALLAX + 200; bx += 46 + r() * 30) bags.push({ x: bx, h: 18 + r() * 22, v: r() });

  // 鸽群：每栋楼顶一群。楼里有人探头、或者子弹打在这栋楼上，它们就飞
  const flocks = extra.pigeons
    ? buildings.map((b, i) => ({ b: i, x: b.x + b.w * (0.3 + r() * 0.4), y: b.y - 2, n: 4 + Math.floor(r() * 3), state: 'sit', t: 0 }))
    : [];
  // 掩护队友过街：街上的掩体
  const mate = extra.escort ? { x: 40, y: GROUND - 2, state: 'hide', timer: 1.5, lock: 0, covers: [40, 200, 360, 520, 680, 820], next: 1, done: false, down: false } : null;

  const flakes = [];
  for (let i = 0; i < 60; i++) flakes.push({ x: r(), y: r(), s: 0.5 + r() });

  return {
    seed,
    theme: th,
    w: WORLD_W,
    h: WORLD_H,
    buildings,
    spots,
    distractors,
    far,
    bags,
    flakes,
    allWindows,
    figures,
    decoy,
    enemy: figures[0], // 狙击手（lift：0 = 缩在窗台下，1 = 探出头）
    night: !!extra.night,
    flocks,
    mate,
    trail: [], // 换位型路过的窗帘
  };
}

// 头的位置：探头时在窗口上部，缩着时降到窗台下（被窗框挡住）
// lift 不传就用他现在的高度；传 1 = 「探出头时会在哪」（瞄准、判定都用这个）
const DUCK = 15;
function figureHead(f, lift) {
  const l = lift === undefined ? f.lift : lift;
  const dx = f.kind === 'decoy' ? 0 : f.pose ? f.shift : -f.shift;
  return { x: f.win.x + f.win.w / 2 + dx + (f.sway || 0), y: f.win.y + 8 + (1 - l) * DUCK };
}

function enemyHead(sc, lift) {
  return figureHead(sc.enemy, lift);
}

function decoyHead(sc) {
  return figureHead(sc.decoy);
}

// 换位型 / Boss 换窗：挑一扇离得够远、没人的窗；返回路过的几扇窗（窗帘会一扇扇动）
function relocateSniper(sc, rand, D, now) {
  const e = sc.enemy;
  const half = D / 2 + 4;
  const free = sc.spots.filter((w) => w !== e.win && !sc.figures.some((f) => f !== e && Math.abs(f.win.x - w.x) + Math.abs(f.win.y - w.y) < 60) && Math.abs(w.x - e.win.x) + Math.abs(w.y - e.win.y) > 90);
  if (!free.length) return;
  const to = free[Math.floor(rand() * free.length)];
  const from = e.win;
  sc.trail = [];
  for (let k = 1; k <= 4; k++) {
    const px = from.x + ((to.x - from.x) * k) / 5;
    const py = from.y + ((to.y - from.y) * k) / 5;
    let best = null;
    let bd = 1e9;
    sc.allWindows.forEach((w) => {
      const dd = Math.abs(w.x - px) + Math.abs(w.y - py);
      if (!w.bricked && dd < bd) { bd = dd; best = w; }
    });
    if (best && bd < 50) sc.trail.push({ win: best, t0: now + k * 0.25 });
  }
  e.win = to;
  e.pose = rand() < 0.5 ? 0 : 1;
  void half;
}

function toggle(d) {
  if (d.kind === 'laundry') d.colors.push(d.colors.shift());
  else d.state = 1 - d.state;
}

// —— 一块一块画 ——
function drawFar(ctx, sc, fox, foy) {
  const th = sc.theme;
  ctx.fillStyle = th.far.color;
  const base = foy + GROUND - 40;
  sc.far.forEach((f, i) => {
    const x = fox + f.x;
    if (th.far.kind === 'dunes') {
      ctx.beginPath();
      ctx.ellipse ? ctx.ellipse(x + f.w / 2, base + 60, f.w * 1.2, f.h * 0.5, 0, Math.PI, 0) : ctx.arc(x + f.w / 2, base + 60, f.w, Math.PI, 0);
      ctx.fill();
      return;
    }
    ctx.fillRect(x, base - f.h, f.w, f.h + 200);
    if (th.far.kind === 'cranes' && i % 4 === 1) {
      // 港口吊车
      ctx.fillRect(x + f.w / 2 - 3, base - f.h - 90, 6, 90);
      ctx.fillRect(x + f.w / 2 - 50, base - f.h - 90, 110, 6);
      ctx.fillRect(x + f.w / 2 + 40, base - f.h - 84, 2, 40);
    } else if (th.far.kind === 'chimneys' && i % 3 === 0) {
      ctx.fillRect(x + 8, base - f.h - 70, 12, 70);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(x + 14, base - f.h - 82, 10, 0, Math.PI * 2);
      ctx.arc(x + 24, base - f.h - 96, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = th.far.color;
    } else if (th.far.kind === 'pagodas' && i % 3 === 0) {
      for (let k = 0; k < 3; k++) {
        const ww = f.w + 20 - k * 12;
        ctx.beginPath();
        ctx.moveTo(x + f.w / 2 - ww / 2 - 6, base - f.h - k * 26);
        ctx.quadraticCurveTo(x + f.w / 2, base - f.h - k * 26 - 22, x + f.w / 2 + ww / 2 + 6, base - f.h - k * 26);
        ctx.fill();
      }
    }
  });
}

function drawRoof(ctx, b, th, ox, oy) {
  const x = ox + b.x;
  const y = oy + b.y;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  if (th.roof === 'tank' && b.tank) {
    const tx = x + 20 + b.tankX * (b.w - 60);
    ctx.fillStyle = b.shade;
    ctx.fillRect(tx + 4, y - 14, 3, 14);
    ctx.fillRect(tx + 26, y - 14, 3, 14);
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(tx, y - 44, 34, 30);
    ctx.strokeRect(tx, y - 44, 34, 30);
    ctx.beginPath();
    ctx.moveTo(tx - 2, y - 44);
    ctx.lineTo(tx + 17, y - 56);
    ctx.lineTo(tx + 36, y - 44);
    ctx.closePath();
    ctx.fillStyle = '#5a4030';
    ctx.fill();
    ctx.stroke();
  } else if (th.roof === 'eave') {
    ctx.beginPath();
    ctx.moveTo(x - 14, y + 4);
    ctx.quadraticCurveTo(x + b.w * 0.2, y - 4, x + b.w * 0.3, y - 18);
    ctx.lineTo(x + b.w * 0.7, y - 18);
    ctx.quadraticCurveTo(x + b.w * 0.8, y - 4, x + b.w + 14, y + 4);
    ctx.closePath();
    ctx.fillStyle = '#2b2030';
    ctx.fill();
    ctx.stroke();
  } else if (th.roof === 'dome' && b.tank) {
    ctx.beginPath();
    ctx.arc(x + b.w / 2, y, b.w * 0.22, Math.PI, 0);
    ctx.fillStyle = b.fill;
    ctx.fill();
    ctx.stroke();
  } else if (th.roof === 'saw') {
    ctx.fillStyle = b.shade;
    ctx.beginPath();
    const n = 4;
    ctx.moveTo(x, y);
    for (let i = 0; i < n; i++) {
      ctx.lineTo(x + (b.w * i) / n, y - 16);
      ctx.lineTo(x + (b.w * (i + 1)) / n, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (th.extras && th.extras.antenna && b.tankX > 0.5) {
    ctx.beginPath();
    ctx.moveTo(x + b.w - 20, y);
    ctx.lineTo(x + b.w - 20, y - 40);
    ctx.moveTo(x + b.w - 30, y - 30);
    ctx.lineTo(x + b.w - 10, y - 30);
    ctx.stroke();
  }
  if (th.extras && th.extras.snowCap) {
    ctx.fillStyle = '#f8fbff';
    ctx.fillRect(x - 2, y - 4, b.w + 4, 7);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 2, y - 4, b.w + 4, 7);
  }
}

function drawWindow(ctx, w, b, th, ox, oy) {
  const x = ox + w.x;
  const y = oy + w.y;
  ctx.fillStyle = w.bricked ? b.shade : th.winDark;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  if (th.win === 'arch') {
    ctx.beginPath();
    ctx.moveTo(x, y + w.h);
    ctx.lineTo(x, y + 7);
    ctx.arc(x + w.w / 2, y + 7, w.w / 2, Math.PI, 0);
    ctx.lineTo(x + w.w, y + w.h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x, y, w.w, w.h);
    ctx.strokeRect(x, y, w.w, w.h);
  }
  if (th.extras && th.extras.awning && !w.bricked) {
    const c = th.extras.awning;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = c[i % 2];
      ctx.fillRect(x - 3 + i * 5.5, y - 6, 5.5, 5);
    }
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 3, y - 6, 22, 5);
  }
}

function drawLattice(ctx, w, ox, oy) {
  // 古城的窗格子：画在人前面，人从格子后面露头
  ctx.strokeStyle = 'rgba(120,70,50,0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox + w.x + w.w / 2, oy + w.y);
  ctx.lineTo(ox + w.x + w.w / 2, oy + w.y + 6);
  ctx.moveTo(ox + w.x, oy + w.y + w.h - 5);
  ctx.lineTo(ox + w.x + w.w, oy + w.y + w.h - 5);
  ctx.stroke();
}

function drawBody(ctx, b, th, ox, oy) {
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
  if (th.roof === 'container') {
    // 集装箱：一层一层，竖条纹
    ctx.strokeStyle = b.shade;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let yy = b.y + 42; yy < GROUND; yy += 42) {
      ctx.moveTo(ox + b.x, oy + yy - 2);
      ctx.lineTo(ox + b.x + b.w, oy + yy - 2);
    }
    for (let xx = b.x + 6; xx < b.x + b.w; xx += 7) {
      ctx.moveTo(ox + xx, oy + b.y + 4);
      ctx.lineTo(ox + xx, oy + b.y + 16);
    }
    ctx.stroke();
  }
}

function drawDistractor(ctx, d, th, ox, oy, t) {
  if (d.kind === 'curtain') {
    const w = d.win;
    ctx.fillStyle = th.win === 'slit' ? '#c9c2b0' : '#e9d8b4';
    const cw = w.w * 0.55;
    ctx.fillRect(ox + w.x + (d.state ? w.w - cw : 0), oy + w.y, cw, w.h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + w.x + (d.state ? w.w - cw : 0), oy + w.y, cw, w.h);
  } else if (d.kind === 'lit') {
    if (d.state) {
      const w = d.win;
      ctx.fillStyle = (th.extras && th.extras.lampLit) || '#ffe28a';
      ctx.fillRect(ox + w.x + 1, oy + w.y + 1, w.w - 2, w.h - 2);
    }
  } else if (d.kind === 'pigeon') {
    const px = ox + d.x + (d.state ? 9 : 0);
    const py = oy + d.y;
    ctx.fillStyle = th.extras.bird;
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
  } else if (d.kind === 'sign') {
    const c = d.colors[d.state % d.colors.length];
    if (d.neon) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(ox + d.x, oy + d.y, d.w, d.h);
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(ox + d.x + 2, oy + d.y + 2, d.w - 4, d.h - 4);
      ctx.fillStyle = c;
      for (let i = 0; i < 3; i++) ctx.fillRect(ox + d.x + 8 + i * (d.w / 3), oy + d.y + 5, d.w / 5, 3);
    } else {
      ctx.fillStyle = c;
      ctx.fillRect(ox + d.x, oy + d.y, d.w, d.h);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + d.x, oy + d.y, d.w, d.h);
      ctx.fillStyle = INK;
      for (let i = 0; i < 3; i++) ctx.fillRect(ox + d.x + 8 + i * (d.w / 3), oy + d.y + 5, d.w / 6, 3);
    }
  } else if (d.kind === 'lantern') {
    const sw = Math.sin(t * 1.5 + d.x) * 1.5;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox + d.x, oy + d.y - 10);
    ctx.lineTo(ox + d.x + sw, oy + d.y - 4);
    ctx.stroke();
    ctx.fillStyle = d.state ? '#ff5a3c' : '#5a2a2a';
    ctx.beginPath();
    ctx.ellipse ? ctx.ellipse(ox + d.x + sw, oy + d.y + 2, 5, 6.5, 0, 0, Math.PI * 2) : ctx.arc(ox + d.x + sw, oy + d.y + 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (d.state) {
      ctx.fillStyle = 'rgba(255,200,120,0.25)';
      ctx.beginPath();
      ctx.arc(ox + d.x + sw, oy + d.y + 2, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFront(ctx, sc, nox, noy) {
  const th = sc.theme;
  const base = noy + WORLD_H - 8;
  sc.bags.forEach((bag) => {
    const x = nox + bag.x;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    if (th.front === 'crates') {
      const s = 26 + bag.h * 0.6;
      ctx.fillStyle = bag.v < 0.5 ? '#a0703c' : '#8a5a2c';
      ctx.fillRect(x - s / 2, base - s, s, s + 10);
      ctx.strokeRect(x - s / 2, base - s, s, s + 10);
      ctx.beginPath();
      ctx.moveTo(x - s / 2, base - s);
      ctx.lineTo(x + s / 2, base);
      ctx.stroke();
    } else if (th.front === 'rail') {
      ctx.fillStyle = '#3a3f5a';
      ctx.fillRect(x - 2, base - 30, 4, 40);
      ctx.fillRect(x - 40, base - 30, 80, 4);
      ctx.fillRect(x - 40, base - 14, 80, 3);
    } else {
      ctx.fillStyle = th.front === 'snowbank' ? '#f4f8fc' : '#a8946b';
      ctx.beginPath();
      ctx.ellipse ? ctx.ellipse(x, base, 30, bag.h, 0, Math.PI, 0) : ctx.arc(x, base, 30, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
    }
  });
}

function drawWeather(ctx, sc, cam, cx, cy, D, t) {
  const kind = sc.theme.weather;
  if (kind === 'none') return;
  const x0 = cx - D / 2;
  const y0 = cy - D / 2;
  sc.flakes.forEach((f) => {
    if (kind === 'rain') {
      const x = x0 + (((f.x * D - cam.x * 0.3 + t * 60) % D) + D) % D;
      const y = y0 + (((f.y * D + t * 520 * f.s) % D) + D) % D;
      ctx.strokeStyle = 'rgba(190,210,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 14);
      ctx.stroke();
    } else if (kind === 'snow') {
      const x = x0 + (((f.x * D - cam.x * 0.3 + Math.sin(t + f.y * 9) * 12) % D) + D) % D;
      const y = y0 + (((f.y * D + t * 40 * f.s - cam.y * 0.3) % D) + D) % D;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + f.s, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'dust') {
      const x = x0 + (((f.x * D + t * 90 * f.s - cam.x * 0.3) % D) + D) % D;
      const y = y0 + f.y * D;
      ctx.strokeStyle = 'rgba(255,230,180,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18, y);
      ctx.stroke();
    }
  });
}

// cam：镜子正中对着的世界坐标；(cx, cy)：镜子正中在屏幕上的位置
function draw(ctx, sc, cam, cx, cy, D, opt) {
  const th = sc.theme;
  const t = opt.t || 0;
  const ox = cx - cam.x;
  const oy = cy - cam.y;

  // 天空
  const sky = ctx.createLinearGradient(0, cy - D / 2, 0, cy + D / 2);
  sky.addColorStop(0, th.sky[0]);
  sky.addColorStop(0.6, th.sky[1]);
  sky.addColorStop(1, th.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(cx - D / 2, cy - D / 2, D, D);
  // 网点（美漫味道）
  ctx.fillStyle = th.dots;
  const step = 9;
  const sx0 = cx - D / 2 - ((ox % step) + step) % step;
  for (let y = cy - D / 2; y < cy + D / 2; y += step) {
    for (let x = sx0; x < cx + D / 2; x += step) {
      ctx.fillRect(x - 1.4, y - 1.4, 2.8, 2.8);
    }
  }

  // 远景：移得慢，就有了深度
  const fox = cx - cam.x * FAR_PARALLAX;
  const foy = cy - cam.y * 0.8;
  if (th.sun) {
    ctx.fillStyle = th.sun.color;
    ctx.beginPath();
    ctx.arc(fox + th.sun.x * WORLD_W * FAR_PARALLAX + 100, foy + th.sun.y, th.sun.r, 0, Math.PI * 2);
    ctx.fill();
  }
  drawFar(ctx, sc, fox, foy);

  // 中景楼房
  sc.buildings.forEach((b) => {
    drawRoof(ctx, b, th, ox, oy);
    drawBody(ctx, b, th, ox, oy);
    b.windows.forEach((w) => drawWindow(ctx, w, b, th, ox, oy));
  });
  if (th.extras && th.extras.clock && sc.buildings[1]) {
    const b = sc.buildings[1];
    ctx.fillStyle = '#f4f1de';
    ctx.beginPath();
    ctx.arc(ox + b.x + b.w / 2, oy + b.y + 10, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox + b.x + b.w / 2, oy + b.y + 10);
    ctx.lineTo(ox + b.x + b.w / 2, oy + b.y + 4);
    ctx.moveTo(ox + b.x + b.w / 2, oy + b.y + 10);
    ctx.lineTo(ox + b.x + b.w / 2 + 5, oy + b.y + 11);
    ctx.stroke();
  }

  // 干扰物
  sc.distractors.forEach((d) => drawDistractor(ctx, d, th, ox, oy, t));

  // 夜里：整片压暗，只留亮灯的窗
  if (sc.night) {
    ctx.fillStyle = 'rgba(4,4,18,0.8)';
    ctx.fillRect(cx - D / 2, cy - D / 2, D, D);
    const glow = (w) => {
      ctx.fillStyle = 'rgba(255,214,120,0.22)';
      ctx.fillRect(ox + w.x - 5, oy + w.y - 5, w.w + 10, w.h + 10);
      ctx.fillStyle = '#ffd97a';
      ctx.fillRect(ox + w.x, oy + w.y, w.w, w.h);
    };
    sc.distractors.forEach((d) => d.kind === 'lit' && d.state && glow(d.win));
    sc.figures.forEach((f) => f.lit && glow(f.win));
  }

  // 人影：狙击手、路人、头盔假人，都是一样颜色的剪影
  const drop = opt.enemyDrop || 0;
  sc.figures.forEach((f) => {
    const h = figureHead(f);
    const dy = f === sc.enemy ? drop : 0;
    const dim = sc.night && !f.lit ? 0.32 : 1;
    ctx.save();
    ctx.globalAlpha = dim;
    ctx.beginPath();
    ctx.rect(ox + f.win.x, oy + f.win.y, f.win.w, f.win.h);
    ctx.clip();
    ctx.fillStyle = sc.night && f.lit ? '#1b1530' : f.color;
    if (f.kind === 'decoy') {
      // 假人：头盔挑在杆子上。头顶是平弧、没有肩膀、没有枪管
      ctx.beginPath();
      ctx.arc(ox + h.x, oy + h.y + 1, 5.5, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(ox + h.x - 6.5, oy + h.y, 13, 2);
      ctx.fillRect(ox + h.x - 1, oy + h.y + 2, 2, 20);
    } else {
      ctx.beginPath();
      ctx.arc(ox + h.x, oy + h.y + dy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(ox + h.x - 7, oy + h.y + 5 + dy, 14, 12);
    }
    ctx.restore();
    // 长条：狙击手探头找你时露出枪管；有的路人拿着拖把
    const showBarrel = f === sc.enemy ? opt.barrel && !drop : f.stick && f.lift > 0.5;
    if (showBarrel) {
      ctx.save();
      ctx.globalAlpha = dim;
      ctx.strokeStyle = sc.night && f.lit ? '#1b1530' : f.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ox + h.x + 2, oy + h.y + 7);
      ctx.lineTo(ox + h.x - 4 - (f.pose ? 7 : 4), oy + f.win.y + f.win.h + 2);
      ctx.stroke();
      ctx.restore();
    }
  });

  // 焦躁型缩着时敲窗台：窗台上两个小指节一上一下
  if (opt.tap) {
    const w = sc.enemy.win;
    const k = Math.sin(t * 14) > 0 ? 1.5 : 0;
    ctx.fillStyle = sc.enemy.color;
    ctx.fillRect(ox + w.x + 4, oy + w.y + w.h - 4 - k, 3, 4 + k);
    ctx.fillRect(ox + w.x + 9, oy + w.y + w.h - 4 - (1.5 - k), 3, 4 + (1.5 - k));
  }

  // 换位型路过的窗帘：一扇扇晃一下
  sc.trail.forEach((tr) => {
    const age = t - tr.t0;
    if (age < 0 || age > 0.9) return;
    const w = tr.win;
    ctx.fillStyle = '#f4ead0';
    ctx.beginPath();
    ctx.moveTo(ox + w.x, oy + w.y);
    for (let i = 0; i <= 6; i++) ctx.lineTo(ox + w.x + w.w * 0.5 + Math.sin(age * 20 + i) * 3, oy + w.y + (w.h * i) / 6);
    ctx.lineTo(ox + w.x, oy + w.y + w.h);
    ctx.closePath();
    ctx.fill();
  });

  if (th.win === 'lattice') {
    sc.buildings.forEach((b) => b.windows.forEach((w) => !w.bricked && drawLattice(ctx, w, ox, oy)));
  }
  if (opt.glint) {
    const head = enemyHead(sc);
    const gx = ox + head.x - 2;
    const gy = oy + head.y + 1;
    const r = sc.night ? 10 : 7;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(gx, gy - r);
    ctx.lineTo(gx + 1.5, gy - 1.5);
    ctx.lineTo(gx + r, gy);
    ctx.lineTo(gx + 1.5, gy + 1.5);
    ctx.lineTo(gx, gy + r);
    ctx.lineTo(gx - 1.5, gy + 1.5);
    ctx.lineTo(gx - r, gy);
    ctx.lineTo(gx - 1.5, gy - 1.5);
    ctx.closePath();
    ctx.fill();
  }

  // 鸽群：坐着 / 飞走
  sc.flocks.forEach((fl) => {
    if (fl.state === 'gone') return;
    for (let i = 0; i < fl.n; i++) {
      let bx = ox + fl.x + i * 7 - fl.n * 3.5;
      let by = oy + fl.y;
      if (fl.state === 'fly') {
        const a = t - fl.t;
        bx += (i - fl.n / 2) * a * 30 + Math.sin(a * 9 + i) * 3;
        by -= a * (60 + i * 12);
      }
      ctx.fillStyle = sc.night ? '#8a8aa0' : '#e8e6f0';
      ctx.beginPath();
      if (fl.state === 'fly') {
        const wing = Math.sin((t - fl.t) * 30 + i) * 3;
        ctx.moveTo(bx - 5, by - wing);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + 5, by - wing);
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.stroke();
      } else {
        ctx.arc(bx, by - 3, 3, 0, Math.PI * 2);
        ctx.arc(bx + 3, by - 6, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

  // 地面
  ctx.fillStyle = th.ground;
  ctx.fillRect(cx - D / 2, oy + GROUND, D, D);

  // 掩护队友：街上的箱子掩体和跑过去的队友
  if (sc.mate) {
    const m = sc.mate;
    m.covers.forEach((x) => {
      ctx.fillStyle = '#8a5a2c';
      ctx.fillRect(ox + x - 14, oy + GROUND - 22, 28, 22);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + x - 14, oy + GROUND - 22, 28, 22);
    });
    if (!m.down) {
      const mx = ox + m.x + (m.state === 'hide' ? 16 : 0);
      const my = oy + GROUND;
      const run = m.state === 'run' ? Math.sin(t * 18) * 4 : 0;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(mx, my - 12);
      ctx.lineTo(mx - 3 + run, my);
      ctx.moveTo(mx, my - 12);
      ctx.lineTo(mx + 3 - run, my);
      ctx.stroke();
      ctx.fillStyle = '#2e86ab';
      ctx.fillRect(mx - 5, my - 24, 10, 13);
      ctx.fillStyle = '#f1c6a8';
      ctx.beginPath();
      ctx.arc(mx, my - 28, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f6f78';
      ctx.fillRect(mx - 5, my - 33, 10, 4);
      if (m.lock > 0) {
        ctx.strokeStyle = '#ff4d5e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, my - 18, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * m.lock);
        ctx.stroke();
      }
    }
  }

  // 大雾：一层灰白，浓淡一阵一阵
  if (opt.fog > 0) {
    ctx.fillStyle = 'rgba(222,226,232,' + (opt.fog * 0.88).toFixed(2) + ')';
    ctx.fillRect(cx - D / 2, cy - D / 2, D, D);
    ctx.fillStyle = 'rgba(240,242,246,' + (opt.fog * 0.5).toFixed(2) + ')';
    for (let i = 0; i < 6; i++) {
      const fx = cx - D / 2 + (((i * 97 + t * 14 - cam.x * 0.4) % (D + 120)) + D + 120) % (D + 120) - 60;
      const fy = cy - D / 2 + ((i * 61) % D);
      ctx.beginPath();
      ctx.arc(fx, fy, 50, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 近景掩体：移得快
  const nox = cx - cam.x * NEAR_PARALLAX;
  const noy = cy - cam.y * NEAR_PARALLAX + WORLD_H * (NEAR_PARALLAX - 1) * 0.5;
  drawFront(ctx, sc, nox, noy);

  if (sc.night) {
    ctx.fillStyle = 'rgba(4,4,18,0.45)';
    ctx.fillRect(cx - D / 2, oy + GROUND - 40, D, D);
  }
  drawWeather(ctx, sc, cam, cx, cy, D, t);
}

module.exports = { build, draw, enemyHead, decoyHead, figureHead, relocateSniper, toggle, WORLD_W, WORLD_H, GROUND };
