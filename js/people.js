// 0.8：有颜色的人（照《Sniper 3D》：开局一句话 + 一眼看得见的特征）。
// 两种人：窗里的（只露上半身）和街上走的（全身）。特征：衣服颜色、头发、帽子、包、墨镜、手机、枪、炸弹包。
// 只管生成和画，规则在 mission.js。
const { rng } = require('./util.js');

const INK = '#1b1530';

// 特征词表：名字（目标卡上的字）+ 颜色
const SHIRTS = {
  red: { name: '红衣服', color: '#e63946' },
  blue: { name: '蓝衣服', color: '#3a86ff' },
  green: { name: '绿衣服', color: '#38b000' },
  yellow: { name: '黄衣服', color: '#ffd23f' },
  orange: { name: '橙衣服', color: '#ff7b00' },
  white: { name: '白衣服', color: '#f4f1de' },
  black: { name: '黑衣服', color: '#2b2438' },
  purple: { name: '紫衣服', color: '#9b5de5' },
};
const HAIRS = {
  black: { name: '黑头发', color: '#2b2438' },
  brown: { name: '棕头发', color: '#7a4a2a' },
  red: { name: '红头发', color: '#e8590c' },
  blonde: { name: '金头发', color: '#f2c14e' },
};
const HATS = { cap: '戴棒球帽', hat: '戴宽檐帽' };
const BAGS = { backpack: '背着背包', duffel: '背着行李袋', suitcase: '提着手提箱' };
const SKINS = ['#f1c6a8', '#e9b48a', '#d99a6c', '#a8714a'];
const STREET_ONLY_BAGS = ['duffel', 'suitcase']; // 窗里只露上半身，看不见这两种

function pick(r, list) {
  return list[Math.floor(r() * list.length)];
}

// 一个人随机的样子。avoid：这个人不能长成什么样（不能撞上目标的特征）
function randomTraits(r, where) {
  const bags = where === 'street' ? ['none', 'none', 'backpack', 'duffel', 'suitcase'] : ['none', 'none', 'none', 'backpack'];
  return {
    shirt: pick(r, Object.keys(SHIRTS)),
    hair: pick(r, ['black', 'black', 'brown', 'brown', 'blonde', 'red']),
    hat: pick(r, ['none', 'none', 'none', 'cap', 'hat']),
    bag: pick(r, bags),
    glasses: r() < 0.15,
    phone: false,
    gun: false,
    vest: false,
    skin: pick(r, SKINS),
  };
}

// 这个人符合线索吗（线索里每一条都对上才算）
function matches(tr, clue) {
  return Object.keys(clue).every((k) => tr[k] === clue[k]);
}

// 线索 → 目标卡上的一句话
function clueText(clue) {
  const parts = [];
  if (clue.shirt) parts.push('穿' + SHIRTS[clue.shirt].name);
  if (clue.hair) parts.push(HAIRS[clue.hair].name);
  if (clue.hat) parts.push(HATS[clue.hat]);
  if (clue.bag) parts.push(BAGS[clue.bag]);
  if (clue.glasses) parts.push('戴墨镜');
  if (clue.phone) parts.push('在打电话');
  if (clue.gun) parts.push('拿着枪');
  if (clue.vest) parts.push('背着炸弹包');
  return parts.join('、');
}

// 把人放进场景：窗里 nWin 个，街上 nStreet 个；targets 个目标符合 clue
// M：{ clue, targets, where: 'win' | 'street' | 'any', win, street, half（只对上一半线索的路人几个）, civTraits（路人额外的特征，如拿枪的路人） }
function populate(sc, M, seed, busy) {
  const r = rng(seed ^ 0x2c1b3c6d);
  const people = [];
  const clue = M.clue || {};
  const used = new Set();
  // 窗：离场景边远一点、互相隔开、没有误导物和会变的东西
  const wins = sc.allWindows.filter((w) => !w.bricked && !busy(w) && w.x > 40 && w.x < sc.w - 56 && w.y > 60);
  for (let i = wins.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = wins[i];
    wins[i] = wins[j];
    wins[j] = t;
  }
  const takeWin = () => {
    const w = wins.find((x) => !used.has(x) && ![...used].some((u) => Math.abs(u.x - x.x) + Math.abs(u.y - x.y) < 40));
    if (w) used.add(w);
    return w;
  };
  const streetY = () => sc.ground + 22 + Math.floor(r() * 18);
  const streetX = () => 50 + r() * (sc.w - 100);
  const needStreet = clue.bag && STREET_ONLY_BAGS.indexOf(clue.bag) >= 0;

  const make = (role, where, traits) => {
    let p;
    if (where === 'win') {
      const w = takeWin();
      if (!w) return null;
      p = { where, win: w, x: w.x + 8, y: w.y };
    } else {
      p = { where: 'street', x: streetX(), y: streetY(), dir: r() < 0.5 ? -1 : 1, speed: 8 + r() * 14, step: r() * 6, pause: r() * 3 };
    }
    // 窗里看不见行李袋、手提箱
    if (p.where === 'win' && STREET_ONLY_BAGS.indexOf(traits.bag) >= 0) traits.bag = 'none';
    Object.assign(p, { role, traits, down: false, phase: r() * 6, flash: 0, flashAt: 1 + r() * 4 });
    people.push(p);
    return p;
  };

  // 目标
  const nT = M.targets === undefined ? 1 : M.targets;
  for (let i = 0; i < nT; i++) {
    const where = needStreet || M.where === 'street' ? 'street' : M.where === 'win' ? 'win' : r() < 0.55 ? 'win' : 'street';
    const tr = Object.assign(randomTraits(r, where), M.targetTraits || {}, clue);
    make('target', where, tr);
  }
  // 只对上一半线索的路人（两条线索的关：红头发但没提箱子、提箱子但不是红头发）
  const keys = Object.keys(clue);
  const nHalf = keys.length > 1 ? M.half || 0 : 0;
  for (let i = 0; i < nHalf; i++) {
    const k = keys[i % keys.length];
    const where = needStreet ? 'street' : r() < 0.5 ? 'win' : 'street';
    const tr = randomTraits(r, where);
    tr[k] = clue[k];
    keys.forEach((o) => {
      if (o !== k) tr[o] = otherValue(o, clue[o], r);
    });
    make('civ', where, tr);
  }
  // 普通路人：跟目标不一样（单条线索的关里，路人一个都不能有那个特征）
  const fill = (n, where) => {
    for (let i = 0; i < n; i++) {
      const tr = Object.assign(randomTraits(r, where), M.civTraits && r() < (M.civShare || 0.4) ? M.civTraits : {});
      keys.forEach((k) => {
        if (keys.length === 1 && tr[k] === clue[k]) tr[k] = otherValue(k, clue[k], r);
      });
      if (keys.length > 1 && matches(tr, clue)) tr[keys[0]] = otherValue(keys[0], clue[keys[0]], r);
      make('civ', where, tr);
    }
  };
  const haveWin = people.filter((p) => p.where === 'win').length;
  const haveStreet = people.length - haveWin;
  fill(Math.max(0, (M.win || 0) - haveWin), 'win');
  fill(Math.max(0, (M.street || 0) - haveStreet), 'street');
  return people;
}

// 换一个跟 v 不一样的值
function otherValue(k, v, r) {
  if (k === 'shirt') return pick(r, Object.keys(SHIRTS).filter((x) => x !== v));
  if (k === 'hair') return pick(r, Object.keys(HAIRS).filter((x) => x !== v));
  if (k === 'hat') return v === 'none' ? 'cap' : 'none';
  if (k === 'bag') return v === 'none' ? 'backpack' : 'none';
  return !v; // glasses / phone / gun / vest
}

// —— 头和身子在哪（判定用） ——
function head(p) {
  if (p.where === 'win') return { x: p.x + (p.duckK || 0) * 0, y: p.y + 8 + (p.duckK || 0) * 15, r: 4.6 };
  return { x: p.x, y: p.y - 30, r: 5 };
}
function body(p) {
  if (p.where === 'win') return { x: p.x - 7, y: p.y + 13, w: 14, h: 9 };
  return { x: p.x - 6, y: p.y - 25, w: 12, h: 24 };
}

// —— 画 ——
function drawHead(ctx, p, hx, hy, R, dim) {
  const tr = p.traits;
  ctx.fillStyle = tr.skin;
  ctx.beginPath();
  ctx.arc(hx, hy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();
  // 头发：头顶一片
  ctx.fillStyle = HAIRS[tr.hair].color;
  ctx.beginPath();
  ctx.arc(hx, hy - 0.5, R, Math.PI * 1.05, Math.PI * 1.95);
  ctx.closePath();
  ctx.fill();
  if (tr.glasses) {
    ctx.fillStyle = INK;
    ctx.fillRect(hx - R * 0.8, hy - 0.5, R * 1.6, 1.8);
  }
  if (tr.hat === 'cap') {
    ctx.fillStyle = '#2f4a7a';
    ctx.beginPath();
    ctx.arc(hx, hy - 1, R, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(hx - 1, hy - 2, R + 3, 1.8);
  } else if (tr.hat === 'hat') {
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(hx - R - 2.5, hy - 2.5, R * 2 + 5, 1.8);
    ctx.fillRect(hx - R * 0.65, hy - R - 2.5, R * 1.3, R + 0.5);
  }
  // 打电话：手机贴在脸边，屏幕一闪一闪
  if (tr.phone) {
    ctx.fillStyle = INK;
    ctx.fillRect(hx + R - 1, hy - 1, 2.6, 4.5);
    if (p.flash > 0) {
      ctx.fillStyle = 'rgba(220,240,255,0.95)';
      ctx.beginPath();
      ctx.arc(hx + R + 0.3, hy + 1, dim ? 3.5 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 打火机：一闪一点橙光（暗处交易的人）
  if (p.lighter > 0) {
    ctx.fillStyle = 'rgba(255,170,60,0.9)';
    ctx.beginPath();
    ctx.arc(hx - R - 1, hy + 4, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,170,60,0.25)';
    ctx.beginPath();
    ctx.arc(hx - R - 1, hy + 2, 9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTorso(ctx, p, x, y, w, h) {
  const tr = p.traits;
  ctx.fillStyle = SHIRTS[tr.shirt].color;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  if (tr.vest) {
    // 炸弹包：几根红色的管子 + 一根线
    ctx.fillStyle = '#b5172b';
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 2 + i * (w - 4) / 3, y + 1, (w - 4) / 3 - 1, Math.min(h - 2, 8));
    ctx.strokeStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(x + 1, y + 2);
    ctx.lineTo(x + w - 1, y + Math.min(h - 1, 8));
    ctx.stroke();
  }
  if (tr.bag === 'backpack') {
    // 背包带：两条斜带
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x + 3, y);
    ctx.lineTo(x + 3, y + h);
    ctx.moveTo(x + w - 3, y);
    ctx.lineTo(x + w - 3, y + h);
    ctx.stroke();
  }
}

function drawWinPerson(ctx, p, ox, oy, t, clip, dim) {
  if (p.down && p.downT > 0.6) return;
  const k = p.duckK || 0;
  const hx = ox + p.x;
  const hy = oy + p.y + 8 + k * 15 + (p.down ? p.downT * 30 : 0);
  ctx.save();
  clip();
  ctx.clip();
  ctx.globalAlpha = dim && !p.lit ? 0.35 : 1;
  drawTorso(ctx, p, hx - 7, hy + 5, 14, 14);
  drawHead(ctx, p, hx, hy, 4.6, dim);
  ctx.restore();
  // 枪：枪管从窗台伸出来
  if (p.traits.gun && !p.down && k < 0.5) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx + 3, hy + 8);
    ctx.lineTo(hx - 11, oy + p.win.y + p.win.h + 3);
    ctx.stroke();
  }
}

function drawStreetPerson(ctx, p, ox, oy, t, dim) {
  if (p.down && p.downT > 0.6) return;
  const tr = p.traits;
  const x = ox + p.x;
  const y = oy + p.y + (p.down ? p.downT * 10 : 0);
  ctx.save();
  ctx.globalAlpha = dim && !p.lit ? 0.4 : 1;
  const moving = p.moving ? Math.sin(p.step * (p.running ? 18 : 9)) * (p.running ? 5 : 3) : 0;
  // 腿
  ctx.strokeStyle = '#3a3150';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(x - 2, y - 13);
  ctx.lineTo(x - 2 + moving, y);
  ctx.moveTo(x + 2, y - 13);
  ctx.lineTo(x + 2 - moving, y);
  ctx.stroke();
  // 包
  const d = p.dir || 1;
  if (tr.bag === 'backpack') {
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(x - d * 9 - 2.5, y - 25, 5, 11);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - d * 9 - 2.5, y - 25, 5, 11);
  }
  drawTorso(ctx, p, x - 6, y - 25, 12, 13);
  if (tr.bag === 'duffel') {
    ctx.fillStyle = '#2f6a5a';
    ctx.beginPath();
    ctx.ellipse ? ctx.ellipse(x + d * 8, y - 13, 6, 4, 0, 0, Math.PI * 2) : ctx.arc(x + d * 8, y - 13, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - d * 4, y - 24);
    ctx.lineTo(x + d * 8, y - 16);
    ctx.stroke();
  } else if (tr.bag === 'suitcase') {
    ctx.fillStyle = '#5a3a20';
    ctx.fillRect(x + d * 8 - 4, y - 15, 8, 9);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + d * 8 - 4, y - 15, 8, 9);
    ctx.beginPath();
    ctx.moveTo(x + d * 8 - 2, y - 15);
    ctx.lineTo(x + d * 8 - 2, y - 17);
    ctx.lineTo(x + d * 8 + 2, y - 17);
    ctx.lineTo(x + d * 8 + 2, y - 15);
    ctx.stroke();
  }
  if (tr.gun) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + d * 3, y - 20);
    ctx.lineTo(x + d * 14, y - 22);
    ctx.stroke();
  }
  drawHead(ctx, p, x, y - 30, 5, dim);
  ctx.restore();
}

// 车：一辆三轮货车，司机的头在驾驶室窗里
function drawVehicle(ctx, v, ox, oy) {
  if (!v) return;
  const x = ox + v.x;
  const y = oy + v.y;
  const d = v.dir;
  ctx.fillStyle = v.color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  // 车斗
  ctx.fillRect(x - d * 30 - 18, y - 22, 36, 16);
  ctx.strokeRect(x - d * 30 - 18, y - 22, 36, 16);
  // 驾驶室
  ctx.fillRect(x - 12, y - 34, 24, 28);
  ctx.strokeRect(x - 12, y - 34, 24, 28);
  ctx.fillStyle = '#9fd8e8';
  ctx.fillRect(x - 8 + d * 2, y - 31, 16, 10);
  // 司机
  if (!v.down) {
    ctx.fillStyle = '#e9b48a';
    ctx.beginPath();
    ctx.arc(x + d * 2, y - 25, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2438';
    ctx.beginPath();
    ctx.arc(x + d * 2, y - 25.5, 4.4, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
  }
  ctx.strokeRect(x - 8 + d * 2, y - 31, 16, 10);
  ctx.fillStyle = INK;
  [x - d * 38, x - d * 22, x + d * 6].forEach((wx) => {
    ctx.beginPath();
    ctx.arc(wx, y - 4, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}
function vehicleHead(v) {
  return { x: v.x + v.dir * 2, y: v.y - 25, r: 4.4 };
}

// 探照灯：立在街边的高杆上
function drawLamp(ctx, L, ox, oy) {
  if (!L) return;
  const x = ox + L.x;
  const y = oy + L.y;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, oy + L.base);
  ctx.stroke();
  if (L.on) {
    ctx.fillStyle = 'rgba(255,240,170,0.16)';
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x - 180, y - 160);
    ctx.lineTo(x + 180, y - 160);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = L.on ? '#fff3b0' : '#4a4a52';
  ctx.beginPath();
  ctx.arc(x, y - 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// 场景里画人（scene.draw 调它）：窗里的先画（在楼上），街上的等地面画完再画
function drawWin(ctx, sc, ox, oy, t, slotPath, shape) {
  const dim = sc.night;
  sc.people.forEach((p) => {
    if (p.where === 'win') drawWinPerson(ctx, p, ox, oy, t, () => slotPath(ctx, p.win, shape, ox, oy), dim);
  });
}
function drawStreet(ctx, sc, ox, oy, t) {
  const dim = sc.night;
  drawLamp(ctx, sc.lamp, ox, oy);
  sc.people.forEach((p) => {
    if (p.where === 'street') drawStreetPerson(ctx, p, ox, oy, t, dim);
  });
  drawVehicle(ctx, sc.vehicle, ox, oy);
}

module.exports = { SHIRTS, HAIRS, HATS, BAGS, populate, matches, clueText, head, body, drawWin, drawStreet, vehicleHead };
