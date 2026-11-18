// 音效：全部用代码合成（不用音频文件），微信和浏览器都用 WebAudio 播放。
// 以后换成正式音效，只要换这里。make(name, sr) 返回一串 -1..1 的采样。

function env(t, a, d) {
  // a 秒起音，d 秒衰减
  return t < a ? t / a : Math.exp(-(t - a) / d);
}

function noise(seed) {
  let s = seed || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1;
  };
}

const RECIPES = {
  // 你开枪：一声闷响 + 沙沙的尾巴
  shot: { len: 0.4, f: (t, n) => n() * env(t, 0.002, 0.07) * 0.9 + Math.sin(2 * Math.PI * 70 * t) * env(t, 0.002, 0.12) * 0.8 },
  // 爆头：更重、更长
  boom: { len: 0.6, f: (t, n) => n() * env(t, 0.002, 0.12) * 0.8 + Math.sin(2 * Math.PI * (120 - 80 * t) * t) * env(t, 0.003, 0.2) },
  // 红圈靠近你：滴
  beep: { len: 0.07, f: (t) => Math.sin(2 * Math.PI * 1400 * t) * env(t, 0.003, 0.03) * 0.5 },
  // 锁定圈在转：低一点的滴
  tick: { len: 0.06, f: (t) => Math.sin(2 * Math.PI * 900 * t) * env(t, 0.002, 0.025) * 0.5 },
  // 心跳：咚咚
  heart: { len: 0.4, f: (t) => { const k = t < 0.18 ? t : t - 0.18; const a = t < 0.18 ? 1 : 0.7; return Math.sin(2 * Math.PI * 55 * k) * env(k, 0.01, 0.05) * a; } },
  // 金币
  coin: { len: 0.22, f: (t) => Math.sign(Math.sin(2 * Math.PI * (t < 0.07 ? 1320 : 1760) * t)) * env(t < 0.07 ? t : t - 0.07, 0.002, 0.06) * 0.25 },
  // 星星：一串往上的音
  star: { len: 0.3, f: (t) => { const i = Math.min(2, Math.floor(t / 0.08)); const k = t - i * 0.08; return Math.sin(2 * Math.PI * [880, 1175, 1568][i] * t) * env(k, 0.003, 0.08) * 0.45; } },
  // 打错 / 打空：嗡
  wrong: { len: 0.3, f: (t) => Math.sign(Math.sin(2 * Math.PI * (140 + Math.sin(t * 60) * 10) * t)) * env(t, 0.005, 0.12) * 0.22 },
  // 缩头：衣服蹭墙
  duck: { len: 0.1, f: (t, n) => n() * env(t, 0.01, 0.03) * 0.25 },
  // 爬过去
  crawl: { len: 0.5, f: (t, n) => n() * (0.5 + 0.5 * Math.sin(t * 40)) * env(t, 0.05, 0.25) * 0.2 },
  // 镜片反光：叮
  glint: { len: 0.12, f: (t) => Math.sin(2 * Math.PI * 3200 * t) * env(t, 0.001, 0.03) * 0.3 },
  // 鸽子飞：扑棱
  wings: { len: 0.7, f: (t, n) => n() * (0.5 + 0.5 * Math.sin(t * 70)) * env(t, 0.02, 0.3) * 0.35 },
  // 赢
  win: { len: 0.7, f: (t) => { const i = Math.min(3, Math.floor(t / 0.12)); const k = t - i * 0.12; return Math.sin(2 * Math.PI * [523, 659, 784, 1047][i] * t) * env(k, 0.005, i === 3 ? 0.25 : 0.1) * 0.4; } },
  // 输
  lose: { len: 0.7, f: (t) => Math.sin(2 * Math.PI * (440 - 260 * t) * t) * env(t, 0.01, 0.3) * 0.4 },
  // 他开枪（打飞头盔）
  enemyShot: { len: 0.5, f: (t, n) => n() * env(t, 0.002, 0.1) * 0.7 + Math.sin(2 * Math.PI * 90 * t) * env(t, 0.002, 0.15) * 0.6 },
};

function make(name, sr) {
  const r = RECIPES[name];
  if (!r) return null;
  const n = Math.floor(r.len * sr);
  const out = new Float32Array(n);
  const rnd = noise(name.length * 7919);
  for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, r.f(i / sr, rnd)));
  return out;
}

module.exports = { make, NAMES: Object.keys(RECIPES) };
