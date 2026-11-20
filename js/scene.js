// 场景：按 seed 随机生成一片楼，按主题（themes.js）换画法。
// 分三层画出透视：远景（移得慢）、中景楼房（藏人的地方）、近景掩体（移得快）。
const { rng, mix } = require('./util.js');
const themes = require('./themes.js');
const people = require('./people.js');

const WORLD_W = 860;
const WORLD_H = 600;
const GROUND = 530;
const INK = '#1b1530';
const FAR_PARALLAX = 0.55;
const NEAR_PARALLAX = 1.25;

const CLOTH = ['#e84855', '#2e86ab', '#f4f1de', '#f9c74f', '#90be6d'];
const RUGS = ['#8a5a3a', '#5a7a6a', '#6a5a7a', '#9a7a4a', '#4a5a6a'];

// —— 楼怎么排：每张地图一种排法 ——
// 藏身位一律 16 × 22（人影、误导物、判定都按这个大小），只是画出来的样子不一样
const PITCH_X = 30;
const PITCH_Y = 42;

// 一栋楼。bandBottom：只在这条线以上开洞（台阶神庙每层只露出一段）
function makeBuilding(th, r, x, top, w, opt) {
  opt = opt || {};
  const pal = th.pal[Math.floor(r() * th.pal.length)];
  const jagged = th.roof === 'jagged' || th.roof === 'broken';
  const jag = th.roof === 'broken' ? 40 : 20;
  const b = { x, y: top, w, h: GROUND - top, fill: pal[0], shade: pal[1], roof: [], windows: [], tank: r() < 0.7, tankX: r(), kind: opt.kind || 'house' };
  for (let i = 0; i <= 6; i++) b.roof.push(jagged && r() < 0.45 ? r() * jag : 0);
  const cols = Math.floor((w - 20) / PITCH_X);
  const rows = opt.bandBottom ? Math.floor((opt.bandBottom - top - 46) / PITCH_Y) + 1 : Math.floor((b.h - 40) / PITCH_Y);
  const pad = (w - cols * PITCH_X) / 2 + 7;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const wx = x + pad + col * PITCH_X;
      const wy = top + 24 + row * PITCH_Y;
      // 炸塌的楼顶：缺口下面不开洞
      const ri = Math.round(((wx + 8 - x) / w) * 6);
      if (b.roof[ri] > wy - top - 8) continue;
      const domestic = th.win === 'rect' || th.win === 'square';
      // 楼上的杂物：空调外机、阳台栏杆（只是看着乱，不会变）
      const win = { x: wx, y: wy, w: 16, h: 22, bricked: r() < th.bricked, ac: domestic && r() < 0.16, balcony: domestic && r() < 0.12 };
      if (th.win === 'hole') win.jag = [0, 1, 2, 3, 4, 5, 6, 7].map(() => r() * 3.5);
      b.windows.push(win);
    }
  }
  return b;
}

function range(r, a) {
  return a[0] + Math.floor(r() * (a[1] - a[0] + 1));
}

function layoutBuildings(th, r) {
  const L = th.layout;
  const out = [];
  if (L.kind === 'terrace') {
    // 台阶神庙：上面窄的一层在后面，下面宽的一层在前面挡住它的下半截；每层露出两排壁龛
    const cx = 430 + (r() - 0.5) * 60;
    const steps = [[180, 120], [370, 210], [560, 300], [790, 390]];
    steps.forEach(([w, top], i) => {
      const next = steps[i + 1];
      out.push(makeBuilding(th, r, Math.max(8, cx - w / 2), top, Math.min(w, WORLD_W - 16), { kind: 'step', bandBottom: next ? next[1] : null }));
    });
    return removeHidden(out);
  }
  if (L.kind === 'wall') {
    // 城墙加塔：先画一道长墙，再画挡在前面的塔和主堡
    out.push(makeBuilding(th, r, 14, 320 + range(r, [0, 20]), WORLD_W - 28, { kind: 'wall' }));
    const towers = [30, 230, 560, 760];
    const keep = 370 + range(r, [-30, 30]);
    towers.forEach((tx) => out.push(makeBuilding(th, r, tx + range(r, [-10, 10]), range(r, [150, 200]), range(r, [76, 96]), { kind: 'tower' })));
    out.push(makeBuilding(th, r, keep, range(r, [110, 140]), 150, { kind: 'keep' }));
    return removeHidden(out);
  }
  if (L.kind === 'camp') {
    // 营房加瞭望塔：两层营房之间隔一座细高的塔
    let x = 14;
    let n = 0;
    while (x < WORLD_W - 60) {
      const tower = n % 3 === 1;
      const w = tower ? 80 : range(r, [150, 190]);
      if (x + w > WORLD_W - 10) break;
      out.push(makeBuilding(th, r, x, tower ? range(r, [140, 190]) : range(r, [230, 300]), w, { kind: tower ? 'tower' : 'barracks' }));
      x += w + range(r, [10, 24]);
      n++;
    }
    return removeHidden(out);
  }
  if (L.kind === 'towers') {
    // 玻璃高楼：三栋又宽又高的楼
    let x = 16;
    while (x < WORLD_W - 200) {
      const w = Math.min(range(r, [240, 280]), WORLD_W - 16 - x);
      out.push(makeBuilding(th, r, x, range(r, [70, 140]), w, { kind: 'tower' }));
      x += w + range(r, [18, 34]);
    }
    return removeHidden(out);
  }
  // blocks / hill：一排楼。山坡：越往中间越高，像房子一层层爬上山
  let x = 14;
  while (x < WORLD_W - 90) {
    const w = Math.min(range(r, L.bw), WORLD_W - 14 - x);
    let top = range(r, L.top);
    if (L.kind === 'hill') {
      const k = Math.sin(Math.PI * Math.min(1, (x + w / 2) / WORLD_W));
      top = Math.round(L.top[1] - (L.top[1] - L.top[0]) * k + (r() - 0.5) * 40);
    }
    out.push(makeBuilding(th, r, x, top, w));
    x += w + range(r, L.gap);
  }
  if (th.extras && th.extras.bell) {
    // 钟楼：一座细高的塔插在中间
    const bx = 380 + range(r, [-60, 60]);
    out.push(makeBuilding(th, r, bx, 105, 56, { kind: 'bell' }));
  }
  return removeHidden(out);
}

// 后画的楼会挡住先画的楼：被挡住的洞删掉
function removeHidden(list) {
  list.forEach((b, i) => {
    b.windows = b.windows.filter((w) => !list.slice(i + 1).some((o) => w.x + w.w > o.x - 2 && w.x < o.x + o.w + 2 && w.y + w.h > o.y - 4));
  });
  return list;
}

// —— Midjourney 背景图：一张图 + 一份藏身位标记 = 一张地图 ——
// 标记见 bgslots.js：slots 每个藏身位 [x, y, w, h]；tops 每栋楼的楼顶 [左, 右, 高]（鸽子、招牌落在这里）
const ART = {};
function registerArt(id, img, data) {
  ART[id] = { img, slots: data.slots, tops: data.tops || [[0, WORLD_W, 140]] };
}
function artBuildings(art, th, r) {
  const list = art.tops.map(([x1, x2, y]) => ({ x: x1, y, w: x2 - x1, h: GROUND - y, fill: th.pal[0][0], shade: th.pal[0][1], roof: [0, 0, 0, 0, 0, 0, 0], windows: [], tank: false, tankX: 0, kind: 'art' }));
  art.slots.forEach(([x, y, w, h]) => {
    const b = list.find((o) => x + w / 2 >= o.x && x + w / 2 <= o.x + o.w) || list[0];
    b.windows.push({ x, y, w: w || 16, h: h || 22, bricked: false, ac: false, balcony: false });
  });
  void r;
  return list;
}

// 楼顶上、楼边上的东西：旗子、风向标、吊钩、信号灯、烟囱、擦窗吊篮、钟
function buildingExtras(buildings, th, r, out) {
  const ex = th.extras || {};
  buildings.forEach((b, i) => {
    if (ex.flag && (b.kind === 'tower' || b.kind === 'keep')) out.push({ kind: 'flag', x: b.x + b.w / 2, y: b.y - (th.roof === 'crenel' ? 8 : 18), state: r() < 0.5 ? 0 : 1 });
    if (ex.vane && b.w > 150 && r() < 0.7) out.push({ kind: 'vane', x: b.x + b.w / 2, y: b.y - 34, state: r() < 0.5 ? 0 : 1 });
    if (ex.signal && i % 2 === 0) out.push({ kind: 'signal', x: b.x + b.w + 8, y: b.y + 40, state: r() < 0.5 ? 0 : 1 });
    if (ex.chimney && b.kind === 'barracks') out.push({ kind: 'chimney', x: b.x + b.w * 0.7, y: b.y - 22, state: r() < 0.5 ? 0 : 1 });
    if (ex.gondola && b.kind === 'tower') out.push({ kind: 'gondola', x: b.x + b.w - 2, y: b.y + 60 + range(r, [0, 3]) * PITCH_Y, state: 0, x1: b.y });
    if (ex.bell && b.kind === 'bell') out.push({ kind: 'bell', x: b.x + b.w / 2, y: b.y + 22, state: 0 });
  });
  if (ex.hook) {
    [0.3, 0.7].forEach((k) => out.push({ kind: 'hook', x: WORLD_W * k + (r() - 0.5) * 80, y: 120, state: r() < 0.5 ? 0 : 1 }));
  }
}

// 这一点被什么挡着（0 = 看得清，1 = 完全挡住）。blockOnly：只算挡得住视线的（玻璃反光不算）
function coverAt(sc, x, y, blockOnly) {
  let a = 0;
  sc.covers.forEach((c) => {
    if (blockOnly && c.kind === 'glare') return;
    const inside = c.r ? Math.hypot(x - c.x, y - c.y) <= c.r : x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h;
    if (inside) a = Math.max(a, c.a);
  });
  return a;
}

// 藏身位的形状（画洞、人影和误导物都按它裁）
function slotPath(ctx, w, shape, ox, oy) {
  const x = ox + w.x;
  const y = oy + w.y;
  const W = w.w;
  const H = w.h;
  ctx.beginPath();
  const poly = (pts) => {
    ctx.moveTo(x + pts[0][0], y + pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(x + pts[i][0], y + pts[i][1]);
    ctx.closePath();
  };
  if (shape === 'arch') {
    ctx.moveTo(x, y + H);
    ctx.lineTo(x, y + 7);
    ctx.arc(x + W / 2, y + 7, W / 2, Math.PI, 0);
    ctx.lineTo(x + W, y + H);
    ctx.closePath();
  } else if (shape === 'slit') {
    // 箭孔：一道细长竖缝加一道横缝，只露得出头
    poly([[5, 0], [11, 0], [11, 6], [16, 6], [16, 11], [11, 11], [11, 22], [5, 22], [5, 11], [0, 11], [0, 6], [5, 6]]);
  } else if (shape === 'hslit') {
    // 碉堡射击孔：一道横缝
    ctx.rect(x - 1, y + 3, W + 2, 10);
  } else if (shape === 'niche') {
    // 壁龛：石头一层层收上去的顶
    poly([[0, H], [0, 7], [3, 7], [3, 3], [6, 3], [6, 0], [10, 0], [10, 3], [13, 3], [13, 7], [16, 7], [16, H]]);
  } else if (shape === 'hole' && w.jag) {
    // 墙上炸开的洞：边是碎的
    const j = w.jag;
    poly([[-j[0], -j[1] + 2], [W / 2, -j[2]], [W + j[3], 1], [W + j[4], H / 2], [W + j[5] - 1, H], [W / 2, H + j[6]], [-j[7], H - 1], [-2, H / 2]]);
  } else {
    ctx.rect(x, y, W, H);
  }
}

// D：狙击镜直径。藏身点必须能被挪到镜子正中，所以离边太近的窗户不算。
// extra：{ figures 一共几个人影（含狙击手）, decoys 头盔假人几个, night, pigeons, escort }
function build(seed, duelCfg, D, themeId, extra) {
  extra = extra || {};
  const th = themes.get(themeId);
  const r = rng(seed);
  // 有 Midjourney 背景图（已载入）就用图上标好的藏身位，否则按地图的排法随机生成
  const art = th.art && ART[th.art];
  const buildings = art ? artBuildings(art, th, r) : layoutBuildings(th, r);

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
  const taken = (w) => figures.some((f) => Math.abs(f.win.x - w.x) + Math.abs(f.win.y - w.y) < 50);
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
      phone: !isDecoy && r() < 0.35, flashAt: 2 + r() * 5, flashOn: false, // 有的路人拿手机，屏幕也会闪一下（假反光）
    });
  }
  const decoy = figures.find((f) => f.kind === 'decoy') || null;
  // 像人头的东西：花盆、猫、台灯、人体模特、挂着的大衣、鸟笼。跟人影一样的黑剪影
  const PROP_TYPES = th.props; // 每张地图自己的一套（神庙、城堡里是石头人像、陶罐）
  const props = [];
  const propFree = allWindows.filter((w) => !w.bricked && !figures.some((f) => f.win === w));
  for (let i = propFree.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = propFree[i];
    propFree[i] = propFree[j];
    propFree[j] = t;
  }
  propFree.slice(0, extra.props || 0).forEach((w) => {
    props.push({ type: PROP_TYPES[Math.floor(r() * PROP_TYPES.length)], win: w, state: r() < 0.5 ? 0 : 1, x: w.x + 8, y: w.y + 11, color });
  });

  // 干扰：会在你眨眼时变的东西
  const distractors = [];
  const free = allWindows.filter((w) => !w.bricked && !figures.some((f) => f.win === w) && !props.some((p) => p.win === w));
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const tmp = free[i];
    free[i] = free[j];
    free[j] = tmp;
  }
  // 每张地图自己的「会变的东西」：窗帘、挂毯、百叶窗、集装箱门、藤蔓、火把、百叶帘……
  free.slice(0, 16).forEach((w) => {
    const kind = th.changers[Math.floor(r() * th.changers.length)];
    // 挂毯、破布用暗一点的土色：跟人的衣服颜色分开（0.8 认人靠衣服颜色）
    const pal = kind === 'rug' || kind === 'rag' ? RUGS : CLOTH;
    distractors.push({ kind, win: w, state: r() < 0.5 ? 0 : 1, x: w.x + 8, y: w.y + 11, colors: [pal[Math.floor(r() * pal.length)], pal[Math.floor(r() * pal.length)]] });
  });
  const ex = th.extras || {};
  buildingExtras(buildings, th, r, distractors);
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
    props,
    decoy,
    enemy: figures[0], // 狙击手（lift：0 = 缩在窗台下，1 = 探出头）
    night: !!extra.night,
    flocks,
    mate,
    trail: [], // 换位型路过的窗帘
    covers: [], // 挡视线的东西（火车、蒸汽、烟……），duel.js 每帧更新
    ground: GROUND,
    image: art ? art.img : null,
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
  const free = sc.spots.filter((w) => w !== e.win && !slotBusy(sc, w) && !sc.figures.some((f) => f !== e && Math.abs(f.win.x - w.x) + Math.abs(f.win.y - w.y) < 60) && Math.abs(w.x - e.win.x) + Math.abs(w.y - e.win.y) > 90);
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

// 这扇窗里已经有误导物或会变的东西（关着的门、百叶窗……）：他不能换到这里
function slotBusy(sc, w) {
  return sc.props.some((p) => p.win === w) || sc.distractors.some((d) => d.win === w);
}

// 道具的「头」在哪（打中它算打错人）
function propHead(p) {
  const w = p.win;
  const dx = p.type === 'cat' ? (p.state ? 4 : -4) : 0;
  const dy = { plant: 9, cat: 13, lamp: 7, mannequin: 8, coat: 6, cage: 7, jar: 10, bust: 8 }[p.type] || 8;
  return { x: w.x + w.w / 2 + dx, y: w.y + dy };
}

function drawProp(ctx, p, ox, oy, night, shape) {
  const w = p.win;
  const h = propHead(p);
  const x = ox + h.x;
  const y = oy + h.y;
  ctx.save();
  slotPath(ctx, w, shape, ox, oy);
  ctx.clip();
  if (p.type === 'lamp' && p.state) {
    ctx.fillStyle = 'rgba(255,220,130,0.55)';
    ctx.fillRect(ox + w.x, oy + w.y, w.w, w.h);
  }
  ctx.globalAlpha = night ? 0.35 : 1;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  if (p.type === 'plant') {
    // 花盆：一团叶子 + 盆
    ctx.arc(x - 2, y, 3.5, 0, Math.PI * 2);
    ctx.arc(x + 2.5, y - 1, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 4, y + 3, 8, 8);
  } else if (p.type === 'cat') {
    // 猫：圆头 + 两只尖耳朵 + 身子
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.moveTo(x - 3, y - 1);
    ctx.lineTo(x - 2.5, y - 5.5);
    ctx.lineTo(x - 0.5, y - 2.5);
    ctx.moveTo(x + 3, y - 1);
    ctx.lineTo(x + 2.5, y - 5.5);
    ctx.lineTo(x + 0.5, y - 2.5);
    ctx.fill();
    ctx.fillRect(x - 4, y + 2, 9, 6);
  } else if (p.type === 'lamp') {
    // 台灯：梯形灯罩 + 杆
    ctx.moveTo(x - 3, y - 4);
    ctx.lineTo(x + 3, y - 4);
    ctx.lineTo(x + 5, y + 2);
    ctx.lineTo(x - 5, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 0.8, y + 2, 1.6, 10);
  } else if (p.type === 'mannequin') {
    // 人体模特：跟人一模一样的剪影，但从来不动
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 7, y + 5, 14, 12);
  } else if (p.type === 'coat') {
    // 挂着的大衣和帽子：帽檐 + 肩
    ctx.arc(x, y, 3.8, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - 6, y, 12, 1.8);
    ctx.moveTo(x - 6, y + 14);
    ctx.lineTo(x - 4, y + 4);
    ctx.lineTo(x + 4, y + 4);
    ctx.lineTo(x + 6, y + 14);
    ctx.fill();
  } else if (p.type === 'jar') {
    // 陶罐：圆肚子 + 细脖子，远看像个头
    ctx.arc(x, y + 1, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 2, y - 6, 4, 4);
    ctx.fillRect(x - 3.5, y - 7, 7, 1.6);
    ctx.fillRect(x - 5, y + 5, 10, 6);
  } else if (p.type === 'bust') {
    // 石头人像：头 + 肩 + 底座，跟人影几乎一样，但从来不动
    ctx.arc(x, y, 4.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 6, y + 5, 12, 6);
    ctx.fillRect(x - 4, y + 11, 8, 6);
  } else if (p.type === 'cage') {
    // 鸟笼：圆顶 + 竖条
    ctx.arc(x, y + 1, 5, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1;
    for (let i = -4; i <= 4; i += 2) {
      ctx.moveTo(x + i, y + 1);
      ctx.lineTo(x + i, y + 10);
    }
    ctx.stroke();
  }
  ctx.restore();
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
    if (th.far.kind === 'hills' || th.far.kind === 'mountains' || th.far.kind === 'jungle') {
      // 山 / 树冠：圆顶或尖顶的一片
      ctx.beginPath();
      if (th.far.kind === 'mountains') {
        ctx.moveTo(x - f.w * 0.6, base + 60);
        ctx.lineTo(x + f.w / 2, base - f.h - 40);
        ctx.lineTo(x + f.w * 1.6, base + 60);
      } else {
        const rr = th.far.kind === 'jungle' ? f.w * 0.7 : f.w * 1.3;
        ctx.arc(x + f.w / 2, base - f.h * (th.far.kind === 'jungle' ? 0.9 : 0.5) + rr * 0.5, rr, Math.PI, 0);
        ctx.lineTo(x + f.w / 2 + rr, base + 200);
        ctx.lineTo(x + f.w / 2 - rr, base + 200);
      }
      ctx.fill();
      if (th.far.kind === 'mountains' && f.v > 0.4) {
        ctx.fillStyle = '#f4f6fa';
        ctx.beginPath();
        ctx.moveTo(x + f.w / 2, base - f.h - 40);
        ctx.lineTo(x + f.w / 2 - 16, base - f.h - 8);
        ctx.lineTo(x + f.w / 2 + 16, base - f.h - 8);
        ctx.fill();
        ctx.fillStyle = th.far.color;
      }
      return;
    }
    if (th.far.kind === 'pines') {
      // 松树林
      for (let k = 0; k < 3; k++) {
        const px = x + k * (f.w / 3);
        ctx.beginPath();
        ctx.moveTo(px - 12, base + 10);
        ctx.lineTo(px, base - f.h * 0.5 - k * 8);
        ctx.lineTo(px + 12, base + 10);
        ctx.fill();
      }
      ctx.fillRect(x - 12, base + 10, f.w + 24, 200);
      return;
    }
    if (th.far.kind === 'towers' && i % 4 === 1) {
      // 冷却塔：腰细的大筒，比楼高出一大截
      const tw = 130;
      const tx = x;
      const ty = base - f.h - 230;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + tw * 0.22, ty + (f.h + 230) * 0.6, tx - 10, base + 200);
      ctx.lineTo(tx + tw + 10, base + 200);
      ctx.quadraticCurveTo(tx + tw * 0.78, ty + (f.h + 230) * 0.6, tx + tw, ty);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(27,21,48,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }
    if (th.far.kind === 'smoke' && i % 4 === 0) {
      // 远处的烟柱
      ctx.fillRect(x, base - f.h * 0.4, f.w, f.h + 200);
      ctx.fillStyle = 'rgba(80,70,64,0.35)';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(x + f.w / 2 + k * 10, base - f.h * 0.4 - k * 34, 16 + k * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = th.far.color;
      return;
    }
    ctx.fillRect(x, base - f.h * (th.far.kind === 'smoke' || th.far.kind === 'towers' ? 0.4 : 1), f.w, f.h + 200);
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
  else if (th.roof === 'tile' || (th.roof === 'gable' && b.kind !== 'tower')) {
    // 坡屋顶：陶瓦（山城）/ 木板（农场、营房）
    const peak = th.roof === 'tile' ? 14 : Math.min(46, b.w * 0.28);
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 2);
    ctx.lineTo(x + b.w / 2, y - peak);
    ctx.lineTo(x + b.w + 8, y + 2);
    ctx.closePath();
    ctx.fillStyle = th.roof === 'tile' ? '#c4562e' : mix(b.shade, '#000000', 0.25);
    ctx.fill();
    ctx.stroke();
    if (th.roof === 'tile') {
      ctx.strokeStyle = '#8e3a1c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 8; i < b.w; i += 8) {
        ctx.moveTo(x + i, y + 1);
        ctx.lineTo(x + i + (b.w / 2 - i) * 0.25, y - peak * 0.75 + Math.abs(b.w / 2 - i) * (peak / b.w) * 1.5);
      }
      ctx.stroke();
    }
  } else if (th.roof === 'gable' && b.kind === 'tower') {
    // 瞭望塔：小尖顶
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 2);
    ctx.lineTo(x + b.w / 2, y - 22);
    ctx.lineTo(x + b.w + 6, y + 2);
    ctx.closePath();
    ctx.fillStyle = b.shade;
    ctx.fill();
    ctx.stroke();
  } else if (th.roof === 'crenel') {
    // 城垛
    ctx.fillStyle = b.fill;
    const mw = 10;
    for (let i = 0; i + mw <= b.w; i += mw * 2) {
      ctx.fillRect(x + i, y - 9, mw, 10);
      ctx.strokeRect(x + i, y - 9, mw, 10);
    }
  } else if (th.roof === 'pipes') {
    // 电厂：楼顶的大管子和烟囱
    ctx.fillStyle = '#8a8f96';
    ctx.fillRect(x + 6, y - 10, b.w - 12, 8);
    ctx.strokeRect(x + 6, y - 10, b.w - 12, 8);
    if (b.tank) {
      const px = x + 20 + b.tankX * (b.w - 50);
      ctx.fillStyle = '#c9c4bc';
      ctx.fillRect(px, y - 52, 14, 52);
      ctx.strokeRect(px, y - 52, 14, 52);
      ctx.fillStyle = '#e63946';
      ctx.fillRect(px, y - 52, 14, 6);
    }
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
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  if (th.win === 'glass') {
    // 玻璃楼：实心的格子是反光的玻璃（浅），暗的格子才藏得了人
    ctx.fillStyle = w.bricked ? mix(b.fill, '#ffffff', 0.35) : th.winDark;
    ctx.fillRect(x - 4, y - 6, w.w + 8, w.h + 12);
    if (w.bricked) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(x - 2, y + w.h + 2);
      ctx.lineTo(x + 8, y - 4);
      ctx.stroke();
    }
    ctx.strokeStyle = b.shade;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 4, y - 6, w.w + 8, w.h + 12);
    return;
  }
  if (w.bricked && (th.win === 'slit' || th.win === 'hslit' || th.win === 'hole' || th.win === 'niche')) return; // 实心墙：不画洞
  ctx.fillStyle = w.bricked ? b.shade : th.winDark;
  slotPath(ctx, w, th.win, ox, oy);
  ctx.fill();
  ctx.stroke();
  if (th.win === 'door' && w.bricked) {
    // 关着的集装箱门：竖杠
    ctx.strokeStyle = b.fill;
    ctx.beginPath();
    for (let i = 4; i < w.w; i += 4) {
      ctx.moveTo(x + i, y + 2);
      ctx.lineTo(x + i, y + w.h - 2);
    }
    ctx.stroke();
  } else if (th.win === 'door') {
    // 开着的箱门：门扇甩在一边
    ctx.fillStyle = b.shade;
    ctx.fillRect(x + w.w, y, 5, w.h);
    ctx.strokeRect(x + w.w, y, 5, w.h);
  } else if (th.win === 'loft' && !w.bricked) {
    // 草料门：一扇带 X 撑的木门甩在一边
    ctx.fillStyle = b.shade;
    ctx.fillRect(x - 7, y, 6, w.h);
    ctx.strokeRect(x - 7, y, 6, w.h);
    ctx.beginPath();
    ctx.moveTo(x - 7, y);
    ctx.lineTo(x - 1, y + w.h);
    ctx.moveTo(x - 1, y);
    ctx.lineTo(x - 7, y + w.h);
    ctx.stroke();
  } else if (th.win === 'square') {
    // 窗台
    ctx.fillStyle = mix(b.fill, '#ffffff', 0.4);
    ctx.fillRect(x - 3, y + w.h, w.w + 6, 3);
  }
  if (w.ac) {
    ctx.fillStyle = '#c9c4d0';
    ctx.fillRect(x + w.w - 2, y + w.h - 6, 9, 7);
    ctx.lineWidth = 1;
    ctx.strokeStyle = INK;
    ctx.strokeRect(x + w.w - 2, y + w.h - 6, 9, 7);
    ctx.beginPath();
    ctx.arc(x + w.w + 2.5, y + w.h - 2.5, 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (w.balcony) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 3, y + w.h - 7);
    ctx.lineTo(x + w.w + 3, y + w.h - 7);
    for (let i = 0; i <= 5; i++) {
      ctx.moveTo(x - 3 + i * ((w.w + 6) / 5), y + w.h - 7);
      ctx.lineTo(x - 3 + i * ((w.w + 6) / 5), y + w.h + 1);
    }
    ctx.stroke();
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
  const ex = th.extras || {};
  ctx.lineWidth = 1;
  if (th.id === 'temple' || th.id === 'castle') {
    // 石块：一层层横缝
    ctx.strokeStyle = b.shade;
    ctx.beginPath();
    for (let yy = b.y + 14; yy < GROUND; yy += 14) {
      ctx.moveTo(ox + b.x + 2, oy + yy);
      ctx.lineTo(ox + b.x + b.w - 12, oy + yy);
    }
    ctx.stroke();
  } else if (th.id === 'farm' && b.kind !== 'tower') {
    // 木板：竖缝
    ctx.strokeStyle = b.shade;
    ctx.beginPath();
    for (let xx = b.x + 9; xx < b.x + b.w - 10; xx += 9) {
      ctx.moveTo(ox + xx, oy + b.y + 4);
      ctx.lineTo(ox + xx, oy + GROUND);
    }
    ctx.stroke();
  } else if (th.win === 'glass') {
    // 玻璃幕墙的竖框
    ctx.strokeStyle = b.shade;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox + b.x, oy + b.y + 8);
    ctx.lineTo(ox + b.x + b.w, oy + b.y + 8);
    ctx.stroke();
  }
  if (ex.beams) {
    // 土楼墙上伸出来的木梁头
    ctx.fillStyle = '#6a4a2a';
    for (let xx = b.x + 10; xx < b.x + b.w - 14; xx += 22) ctx.fillRect(ox + xx, oy + b.y + 8, 6, 4);
  }
  if (ex.rebar && b.roof.some((v) => v > 12)) {
    // 炸断的楼顶露出钢筋
    ctx.strokeStyle = '#3a2a22';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 1; i < 6; i++) {
      if (b.roof[i] < 12) continue;
      const xx = ox + b.x + (b.w * i) / 6;
      const yy = oy + b.y + b.roof[i];
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx - 3, yy - 9);
      ctx.moveTo(xx + 4, yy);
      ctx.lineTo(xx + 6, yy - 7);
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
      ctx.fillStyle = (th.extras && th.extras.lampLit) || '#ffe28a';
      slotPath(ctx, d.win, th.win, ox, oy);
      ctx.fill();
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
  } else if (d.kind === 'rug' || d.kind === 'rag') {
    // 挂毯（土楼窗下）/ 破布（废墟洞口）：缩头时换颜色
    const w = d.win;
    const c = d.colors[d.state % 2];
    ctx.fillStyle = c;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    if (d.kind === 'rug') {
      ctx.fillRect(ox + w.x - 1, oy + w.y + w.h, w.w + 2, 12);
      ctx.strokeRect(ox + w.x - 1, oy + w.y + w.h, w.w + 2, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(ox + w.x - 1, oy + w.y + w.h + 5, w.w + 2, 2);
    } else {
      ctx.beginPath();
      ctx.moveTo(ox + w.x + w.w - 2, oy + w.y + 2);
      ctx.lineTo(ox + w.x + w.w + 5, oy + w.y + 3);
      ctx.lineTo(ox + w.x + w.w + 3, oy + w.y + 16);
      ctx.lineTo(ox + w.x + w.w, oy + w.y + 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (d.kind === 'shutter') {
    // 百叶窗：开着甩在两边 / 关上一扇
    const w = d.win;
    const col = th.id === 'farm' ? '#7a4a2a' : '#2f8a7a';
    ctx.fillStyle = col;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    const leaf = (lx, lw) => {
      ctx.fillRect(lx, oy + w.y, lw, w.h);
      ctx.strokeRect(lx, oy + w.y, lw, w.h);
      ctx.beginPath();
      for (let yy = 4; yy < w.h; yy += 4) {
        ctx.moveTo(lx + 1, oy + w.y + yy);
        ctx.lineTo(lx + lw - 1, oy + w.y + yy);
      }
      ctx.stroke();
    };
    if (d.state) {
      leaf(ox + w.x, w.w / 2);
      leaf(ox + w.x + w.w + 1, 6);
    } else {
      leaf(ox + w.x - 7, 6);
      leaf(ox + w.x + w.w + 1, 6);
    }
  } else if (d.kind === 'boxdoor') {
    // 集装箱门：关上 / 打开
    const w = d.win;
    if (d.state) {
      ctx.fillStyle = '#7a8a96';
      ctx.fillRect(ox + w.x, oy + w.y, w.w, w.h);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + w.x, oy + w.y, w.w, w.h);
      ctx.beginPath();
      ctx.moveTo(ox + w.x + w.w / 2, oy + w.y);
      ctx.lineTo(ox + w.x + w.w / 2, oy + w.y + w.h);
      ctx.stroke();
    }
  } else if (d.kind === 'hay') {
    // 草料门里的草堆
    if (d.state) {
      const w = d.win;
      ctx.fillStyle = '#e8c45a';
      ctx.beginPath();
      ctx.arc(ox + w.x + 8, oy + w.y + w.h, 8, Math.PI, 0);
      ctx.fill();
    }
  } else if (d.kind === 'vine') {
    // 藤蔓：从壁龛顶上垂下来，缩头时长短会变
    const w = d.win;
    const len = d.state ? 22 : 9;
    ctx.strokeStyle = '#3f8a3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox + w.x - 2, oy + w.y - 4);
    for (let i = 0; i <= len; i += 3) ctx.lineTo(ox + w.x - 2 + Math.sin(i * 0.8) * 1.5, oy + w.y - 4 + i);
    ctx.stroke();
    ctx.fillStyle = '#5cb04a';
    for (let i = 3; i <= len; i += 6) {
      ctx.beginPath();
      ctx.arc(ox + w.x - 4, oy + w.y - 4 + i, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (d.kind === 'flower') {
    const w = d.win;
    ctx.fillStyle = d.state ? '#ff6fa8' : '#ffd23f';
    [2, 8, 14].forEach((k) => {
      ctx.beginPath();
      ctx.arc(ox + w.x + k, oy + w.y + w.h + 1, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (d.kind === 'torch') {
    // 火把：箭孔旁边，点着 / 灭了
    const w = d.win;
    const tx = ox + w.x + w.w + 4;
    const ty = oy + w.y + 8;
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(tx - 1, ty, 3, 10);
    if (d.state) {
      const fl = Math.sin(t * 12 + d.x) * 1.2;
      ctx.fillStyle = 'rgba(255,170,80,0.28)';
      ctx.beginPath();
      ctx.arc(tx, ty - 2, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffb02e';
      ctx.beginPath();
      ctx.moveTo(tx - 3, ty);
      ctx.quadraticCurveTo(tx + fl, ty - 10, tx + 3, ty);
      ctx.fill();
    }
  } else if (d.kind === 'warn') {
    // 警示灯：窗上方一盏，亮 / 灭
    const w = d.win;
    ctx.fillStyle = d.state ? '#ff9f1c' : '#5a5048';
    ctx.beginPath();
    ctx.arc(ox + w.x + w.w / 2, oy + w.y - 4, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (d.kind === 'frost') {
    // 窗下的冰溜子：两根 / 四根
    const w = d.win;
    ctx.fillStyle = '#eaf6ff';
    const n = d.state ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const ix = ox + w.x + 2 + i * 4;
      ctx.beginPath();
      ctx.moveTo(ix, oy + w.y + 14);
      ctx.lineTo(ix + 3, oy + w.y + 14);
      ctx.lineTo(ix + 1.5, oy + w.y + 22);
      ctx.fill();
    }
  } else if (d.kind === 'blind') {
    // 百叶帘：拉上去 / 放下来一半
    const w = d.win;
    const hh = d.state ? w.h * 0.55 : 4;
    ctx.fillStyle = '#dfe6ee';
    ctx.fillRect(ox + w.x, oy + w.y, w.w, hh);
    ctx.strokeStyle = '#9aa6b4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let yy = 2; yy < hh; yy += 3) {
      ctx.moveTo(ox + w.x, oy + w.y + yy);
      ctx.lineTo(ox + w.x + w.w, oy + w.y + yy);
    }
    ctx.stroke();
  } else if (d.kind === 'fire') {
    // 洞里的火光：亮 / 灭（亮的时候会抖）
    if (d.state) {
      const w = d.win;
      ctx.fillStyle = 'rgba(255,' + (120 + Math.floor(Math.sin(t * 9 + d.x) * 30)) + ',40,0.75)';
      ctx.fillRect(ox + w.x + 2, oy + w.y + w.h - 9, w.w - 4, 8);
    }
  } else if (d.kind === 'flag') {
    // 旗子：往左飘 / 往右飘
    const dir = d.state ? 1 : -1;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox + d.x, oy + d.y);
    ctx.lineTo(ox + d.x, oy + d.y - 26);
    ctx.stroke();
    ctx.fillStyle = th.id === 'snow' ? '#e63946' : '#c9a227';
    ctx.beginPath();
    ctx.moveTo(ox + d.x, oy + d.y - 26);
    ctx.quadraticCurveTo(ox + d.x + dir * 10, oy + d.y - 26 + Math.sin(t * 4) * 2, ox + d.x + dir * 18, oy + d.y - 21);
    ctx.lineTo(ox + d.x, oy + d.y - 16);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (d.kind === 'vane') {
    // 风向标：箭头指左 / 指右
    const dir = d.state ? 1 : -1;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox + d.x, oy + d.y + 24);
    ctx.lineTo(ox + d.x, oy + d.y);
    ctx.moveTo(ox + d.x - 10 * dir, oy + d.y + 4);
    ctx.lineTo(ox + d.x + 10 * dir, oy + d.y + 4);
    ctx.lineTo(ox + d.x + 6 * dir, oy + d.y);
    ctx.moveTo(ox + d.x + 10 * dir, oy + d.y + 4);
    ctx.lineTo(ox + d.x + 6 * dir, oy + d.y + 8);
    ctx.stroke();
  } else if (d.kind === 'hook') {
    // 吊车的吊钩：高 / 低
    const y = oy + d.y + (d.state ? 60 : 0);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ox + d.x, oy - 40);
    ctx.lineTo(ox + d.x, y);
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(ox + d.x - 5, y, 10, 7);
    ctx.strokeRect(ox + d.x - 5, y, 10, 7);
  } else if (d.kind === 'signal') {
    // 信号灯：红 / 绿
    ctx.fillStyle = '#20242c';
    ctx.fillRect(ox + d.x - 4, oy + d.y - 12, 8, 18);
    ctx.fillRect(ox + d.x - 1, oy + d.y + 6, 2, 30);
    ctx.fillStyle = d.state ? '#3ef07a' : '#ff4d5e';
    ctx.beginPath();
    ctx.arc(ox + d.x, oy + d.y - (d.state ? 0 : 6), 2.8, 0, Math.PI * 2);
    ctx.fill();
  } else if (d.kind === 'chimney') {
    ctx.fillStyle = '#4a3a30';
    ctx.fillRect(ox + d.x - 4, oy + d.y, 8, 16);
    if (d.state) {
      ctx.fillStyle = 'rgba(230,236,244,0.85)';
      [0, 1, 2].forEach((k) => {
        ctx.beginPath();
        ctx.arc(ox + d.x + k * 5 + Math.sin(t + k) * 2, oy + d.y - 6 - k * 9, 5 + k * 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  } else if (d.kind === 'gondola') {
    // 擦窗吊篮：挂在楼边，上一格 / 下一格
    const y = oy + d.y + (d.state ? PITCH_Y : 0);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox + d.x + 6, oy + d.x1);
    ctx.lineTo(ox + d.x + 6, y);
    ctx.stroke();
    ctx.fillStyle = '#f4a261';
    ctx.fillRect(ox + d.x, y, 14, 7);
    ctx.strokeRect(ox + d.x, y, 14, 7);
  } else if (d.kind === 'bell') {
    // 钟楼里的钟：摆到左边 / 右边
    const k = d.state ? 3 : -3;
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.moveTo(ox + d.x - 6 + k, oy + d.y + 8);
    ctx.quadraticCurveTo(ox + d.x + k, oy + d.y - 6, ox + d.x + 6 + k, oy + d.y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
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
    } else if (th.front === 'fence') {
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(x - 3, base - 34, 6, 44);
      ctx.strokeRect(x - 3, base - 34, 6, 44);
      ctx.fillRect(x - 40, base - 26, 80, 5);
      ctx.fillRect(x - 40, base - 12, 80, 5);
    } else if (th.front === 'bush') {
      ctx.fillStyle = bag.v < 0.5 ? '#2f6a3a' : '#3f8a46';
      ctx.beginPath();
      ctx.arc(x - 14, base - bag.h * 0.6, 16, 0, Math.PI * 2);
      ctx.arc(x + 6, base - bag.h, 20, 0, Math.PI * 2);
      ctx.arc(x + 24, base - bag.h * 0.5, 14, 0, Math.PI * 2);
      ctx.fill();
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

// —— 挡视线的东西：火车、蒸汽、烟雾弹、沙尘、水雾、玻璃反光 ——
const PUFF = { steam: '244,246,248', smoke: '120,118,124', mist: '226,244,238' };
function drawCovers(ctx, sc, ox, oy, t) {
  sc.covers.forEach((c) => {
    if (c.a <= 0.01) return;
    if (c.kind === 'train') {
      // 一列货车：车厢一节节，前面是车头
      const cars = ['#6a3a2e', '#2f4a5a', '#7a6a2a', '#4a3a5a'];
      for (let x = c.x, i = 0; x < c.x + c.w; x += 126, i++) {
        const cw = Math.min(120, c.x + c.w - x);
        ctx.fillStyle = i === 0 ? '#20242c' : cars[i % cars.length];
        ctx.fillRect(ox + x, oy + c.y, cw, c.h - 8);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.strokeRect(ox + x, oy + c.y, cw, c.h - 8);
        ctx.fillStyle = INK;
        [14, cw - 14].forEach((k) => {
          ctx.beginPath();
          ctx.arc(ox + x + k, oy + c.y + c.h - 6, 6, 0, Math.PI * 2);
          ctx.fill();
        });
        if (i === 0) {
          ctx.fillStyle = '#ffe9a8';
          ctx.beginPath();
          ctx.arc(ox + x + cw - 8, oy + c.y + 14, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (c.kind === 'sand') {
      // 沙尘：一大片黄沙从左往右刮过去，中间最浓
      for (let i = 0; i < 12; i++) {
        const k = Math.sin(((i + 0.5) / 12) * Math.PI);
        ctx.fillStyle = 'rgba(226,180,120,' + (c.a * k * 0.95).toFixed(2) + ')';
        ctx.fillRect(ox + c.x + (c.w * i) / 12, oy + c.y, c.w / 12 + 1, c.h);
      }
    } else if (c.kind === 'glare') {
      // 玻璃反光：一道白光扫过，扫到的玻璃格一片白
      ctx.fillStyle = 'rgba(255,255,255,' + (c.a * 0.35).toFixed(2) + ')';
      ctx.beginPath();
      ctx.moveTo(ox + c.x, oy);
      ctx.lineTo(ox + c.x + c.w, oy);
      ctx.lineTo(ox + c.x + c.w - 60, oy + WORLD_H);
      ctx.lineTo(ox + c.x - 60, oy + WORLD_H);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + (c.a * 0.92).toFixed(2) + ')';
      sc.allWindows.forEach((w) => {
        const shift = ((w.y + w.h / 2) / WORLD_H) * 60;
        const cx = w.x + w.w / 2 + shift;
        if (cx >= c.x && cx <= c.x + c.w) ctx.fillRect(ox + w.x - 4, oy + w.y - 6, w.w + 8, w.h + 12);
      });
    } else {
      // 蒸汽 / 烟雾弹 / 瀑布水雾：一团团圆
      const col = PUFF[c.kind] || PUFF.steam;
      ctx.fillStyle = 'rgba(' + col + ',' + (c.a * 0.92).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(ox + c.x, oy + c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(' + col + ',' + (c.a * 0.6).toFixed(2) + ')';
      for (let i = 0; i < 6; i++) {
        const ang = i * 1.05 + (c.seed || 0) + t * 0.15;
        ctx.beginPath();
        ctx.arc(ox + c.x + Math.cos(ang) * c.r * 0.75, oy + c.y + Math.sin(ang) * c.r * 0.6, c.r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

// 丛林神庙：最左边一道瀑布
function drawFalls(ctx, ox, oy, t) {
  ctx.fillStyle = '#9fd8e8';
  ctx.fillRect(ox, oy + 120, 30, GROUND - 120);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const yy = ((t * 90 + i * 83) % (GROUND - 120)) + 120;
    ctx.moveTo(ox + 4 + i * 5, oy + yy);
    ctx.lineTo(ox + 4 + i * 5, oy + yy + 24);
  }
  ctx.stroke();
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
  if (sc.image) {
    // Midjourney 背景图：整张贴上，再把每个藏身位涂成同一种暗色（人影、误导物画在上面）
    ctx.drawImage(sc.image, ox, oy, WORLD_W, WORLD_H);
    ctx.fillStyle = th.winDark;
    sc.allWindows.forEach((w) => {
      if (w.bricked) return;
      slotPath(ctx, w, th.win, ox, oy);
      ctx.fill();
    });
  } else {
    drawFar(ctx, sc, fox, foy);
    // 中景楼房
    sc.buildings.forEach((b) => {
      drawRoof(ctx, b, th, ox, oy);
      drawBody(ctx, b, th, ox, oy);
      b.windows.forEach((w) => drawWindow(ctx, w, b, th, ox, oy));
    });
    if (th.extras && th.extras.falls) drawFalls(ctx, ox, oy, t);
  }
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

  sc.props.forEach((p) => drawProp(ctx, p, ox, oy, sc.night, th.win));
  if (sc.people) people.drawWin(ctx, sc, ox, oy, t, slotPath, th.win); // 0.8：有颜色的人

  // 人影：狙击手、路人、头盔假人，都是一样颜色的剪影
  const drop = opt.enemyDrop || 0;
  sc.figures.forEach((f) => {
    const h = figureHead(f);
    const dy = f === sc.enemy ? drop : 0;
    const dim = sc.night && !f.lit ? 0.32 : 1;
    ctx.save();
    ctx.globalAlpha = dim;
    slotPath(ctx, f.win, th.win, ox, oy);
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

  // 路人的手机屏幕一闪（假反光）
  sc.figures.forEach((f) => {
    if (!f.flashOn || f.lift < 0.5) return;
    const h = figureHead(f);
    ctx.fillStyle = '#e8f4ff';
    ctx.beginPath();
    ctx.arc(ox + h.x + 3, oy + h.y + 3, sc.night ? 3 : 2.2, 0, Math.PI * 2);
    ctx.fill();
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
    const r = sc.night ? 7 : 4.5;
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
  if (sc.people) people.drawStreet(ctx, sc, ox, oy, t);

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

  drawCovers(ctx, sc, ox, oy, t);

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

module.exports = { build, draw, enemyHead, decoyHead, figureHead, propHead, relocateSniper, toggle, coverAt, registerArt, slotBusy, WORLD_W, WORLD_H, GROUND };
