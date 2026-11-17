// 小工具：可复现的随机数、数学、画图助手。

// 同一个 seed 永远出同一串随机数：好友挑战要靠它让两人抽到同一局。
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// 美漫风的字：黄字粗黑边
function comicText(ctx, text, x, y, size, fill, stroke) {
  ctx.save();
  ctx.font = '900 ' + size + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size / 7);
  ctx.strokeStyle = stroke || '#1b1530';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill || '#ffd23f';
  ctx.fillText(text, x, y);
  ctx.restore();
}

// 爆炸星形（拟声字后面那一圈）
function starburst(ctx, x, y, rOut, rIn, points, fill) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? rIn : rOut;
    const a = (Math.PI * i) / points - Math.PI / 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1b1530';
  ctx.stroke();
}

// 颜色混合：'#rrggbb' 两色按 t 混
function mix(c1, c2, t) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1);
  const b = p(c2);
  const h = (v) => ('0' + Math.round(v).toString(16)).slice(-2);
  return '#' + h(lerp(a[0], b[0], t)) + h(lerp(a[1], b[1], t)) + h(lerp(a[2], b[2], t));
}

module.exports = { rng, clamp, lerp, easeOut, roundRect, comicText, starburst, mix };
