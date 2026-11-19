// 战队经营（局外成长）+ 临场卡牌（局内 buff）。
// 只管数，不管画：画在 main.js 的战队页和选卡页。
//
// 两层成长：
//   局外 = 五个队友各自练级（花奖金），训练基地升级（奖金多拿）。存档，一直有。
//   局内 = 每打完一场，三选一张临场卡，只管这一次网吧赛。像《赵云与阿斗》的道具。
// 两层加成最后合成一个 mods，交给 duel.js。
const platform = require('./platform.js');
const config = require('./config.js');

const SAVE_KEY = 'vasily_save_v1';
const MAX_LV = 5;

// 五个队友：名字、长相都是占位，等 Cc 定用不用剧里的人
const TEAMMATES = [
  { id: 'cap', name: '老K', role: '指挥', buff: '稳得快', look: { hair: '#2b2438', jacket: '#e63946', skin: '#e9b48a', style: 'short' },
    desc: (lv) => '屏息稳下来快 ' + lv * 8 + '%', mods: (lv) => ({ settleMul: 1 - 0.08 * lv }) },
  { id: 'spot', name: '小雨', role: '观察手', buff: '报点', female: true, look: { hair: '#1f6f78', jacket: '#2e86ab', skin: '#f1c6a8', style: 'ponytail' },
    desc: (lv) => '红圈靠近你提前报警' + (lv >= 3 ? '·每关多拉一次' : '·3级多拉一次'),
    mods: (lv) => ({ peekCue: lv >= 1, rescueAdd: lv >= 3 ? 1 : 0 }) },
  { id: 'entry', name: '阿豆', role: '突破手', buff: '冷静', look: { hair: '#6b3e26', jacket: '#f4a261', skin: '#d99a6c', style: 'buzz' },
    desc: (lv) => '心跳慢 ' + lv * 12 + '%', mods: (lv) => ({ heartMul: 1 - 0.12 * lv }) },
  { id: 'free', name: '铁头', role: '自由人', buff: '快枪', look: { hair: '#f4f1de', jacket: '#2a9d8f', skin: '#e9b48a', style: 'spiky' },
    desc: (lv) => '对枪多 ' + (lv * 0.1).toFixed(1) + ' 秒', mods: (lv) => ({ quickDrawAdd: 0.1 * lv }) },
  { id: 'sub', name: '小新', role: '替补', buff: '藏得好', look: { hair: '#c77dff', jacket: '#6a4c93', skin: '#f1c6a8', style: 'cap' },
    desc: (lv) => '他找你慢 ' + lv * 6 + '%', mods: (lv) => ({ enemyRateMul: 1 - 0.06 * lv }) },
];

// 训练基地：越好，奖金拿得越多
const BASES = [
  { name: '网吧角落', mul: 1, cost: 300 },
  { name: '训练室', mul: 1.25, cost: 800 },
  { name: '战队基地', mul: 1.5, cost: 0 },
];

// 临场卡：关前带一张。按 CARD_ORDER 每第一次过一关解锁一张
const CARDS = [
  { id: 'breath', name: '深呼吸', desc: '稳住多撑 1 秒', icon: 'lung', mods: { holdMaxAdd: 1 } },
  { id: 'scope', name: '好镜子', desc: '判定圈大一圈', icon: 'scope', mods: { hitRadiusAdd: 3 } },
  { id: 'ear', name: '耳机', desc: '红圈靠近提前报警', icon: 'ear', mods: { peekCue: true } },
  { id: 'gum', name: '口香糖', desc: '心跳慢一半', icon: 'heart', mods: { heartMul: 0.5 } },
  { id: 'silencer', name: '消音器', desc: '打空不暴露', icon: 'bullet', mods: { silent: true } },
  { id: 'helmet', name: '诱饵头盔', desc: '替你挨一枪，照出他', icon: 'helmet', mods: { helmets: 1 } },
  { id: 'ghillie', name: '伪装网', desc: '他找你慢三成', icon: 'leaf', mods: { enemyRateMul: 0.7 } },
  { id: 'charm', name: '护身符', desc: '每关多拉一次', icon: 'charm', mods: { rescueAdd: 1 } },
  { id: 'hand', name: '快手', desc: '对枪多 0.3 秒', icon: 'hand', mods: { quickDrawAdd: 0.3 } },
];

const CARD_ORDER = ['breath', 'scope', 'ear', 'silencer', 'ghillie', 'helmet', 'gum', 'hand', 'charm'];
const START_CARDS = 2;

// 段位：按一共拿了几颗星
const RANKS = [
  { name: '新人', stars: 0 },
  { name: '业余', stars: 6 },
  { name: '半职业', stars: 14 },
  { name: '职业', stars: 22 },
];

const ADD = ['hitRadiusAdd', 'holdMaxAdd', 'quickDrawAdd', 'rescueAdd', 'helmets'];
const MUL = ['settleMul', 'heartMul', 'enemyRateMul', 'reloadMul'];

function fresh() {
  const team = {};
  TEAMMATES.forEach((m) => (team[m.id] = 1));
  return { money: 0, fans: 0, cups: 0, revealed: false, team, base: 0, stars: {}, cleared: [], taught: [], arenaBest: 0, daily: {} };
}

let S = Object.assign(fresh(), platform.load(SAVE_KEY) || {});
if (!S.stars) S.stars = {};
if (!S.cleared) S.cleared = [];
if (!S.taught) S.taught = [];
if (!S.arenaBest) S.arenaBest = 0;
if (!S.daily) S.daily = {};

function save() {
  platform.save(SAVE_KEY, S);
}

function reset() {
  S = fresh();
  save();
}

function combine(list) {
  const out = { hitRadiusAdd: 0, holdMaxAdd: 0, quickDrawAdd: 0, rescueAdd: 0, helmets: 0, settleMul: 1, heartMul: 1, enemyRateMul: 1, reloadMul: 1, peekCue: false, silent: false };
  list.forEach((m) => {
    ADD.forEach((k) => m[k] && (out[k] += m[k]));
    MUL.forEach((k) => m[k] !== undefined && (out[k] *= m[k]));
    if (m.peekCue) out.peekCue = true;
    if (m.silent) out.silent = true;
  });
  return out;
}

// 这一局所有加成：队友（揭晓身份以后才有）+ 手里的临场卡
function mods(cardIds) {
  const list = [];
  if (S.revealed) TEAMMATES.forEach((m) => list.push(m.mods(S.team[m.id] || 0)));
  (cardIds || []).forEach((id) => {
    const c = CARDS.find((x) => x.id === id);
    if (c) list.push(c.mods);
  });
  return combine(list);
}

// 练一级要花多少奖金。lv：现在几级（1~4），返回升到下一级的价钱。
function trainCost(lv) {
  // TODO(human): 写练级价钱的曲线。一关大约拿 20×回合数 + 10×星星，第一章全三星约 600。
  return 100 * lv;
}

function train(id) {
  const lv = S.team[id] || 0;
  if (lv >= MAX_LV) return false;
  const cost = trainCost(lv);
  if (S.money < cost) return false;
  S.money -= cost;
  S.team[id] = lv + 1;
  save();
  return true;
}

function upgradeBase() {
  const b = BASES[S.base];
  if (!b.cost || S.money < b.cost) return false;
  S.money -= b.cost;
  S.base += 1;
  save();
  return true;
}

// 拿奖金：times 份 config.money[kind]，乘训练基地倍数
function earn(kind, times) {
  const n = Math.round(config.money[kind] * (times === undefined ? 1 : times) * BASES[S.base].mul);
  S.money += n;
  save();
  return n;
}

// 过关记账：星星只记最好成绩；第一次过关加粉丝。返回 { first, newStars }
function recordLevel(id, stars) {
  const first = S.cleared.indexOf(id) < 0;
  if (first) {
    S.cleared.push(id);
    S.fans += 10;
  }
  const old = S.stars[id] || 0;
  if (stars > old) S.stars[id] = stars;
  save();
  return { first, newStars: Math.max(0, stars - old) };
}

// 关前说明页只看一次
function taught(id) {
  return S.taught.indexOf(id) >= 0;
}
function markTaught(id) {
  if (!taught(id)) {
    S.taught.push(id);
    save();
  }
}

// 擂台最高连胜；每日挑战每天的最好用时
function recordArena(streak) {
  const best = streak > S.arenaBest;
  if (best) S.arenaBest = streak;
  save();
  return best;
}
function recordDaily(day, sec) {
  const old = S.daily[day];
  const best = !old || sec < old;
  if (best) S.daily[day] = Math.round(sec);
  save();
  return best;
}

function totalStars() {
  return Object.keys(S.stars).reduce((a, k) => a + S.stars[k], 0);
}

function rank() {
  const n = totalStars();
  let r = RANKS[0];
  RANKS.forEach((x) => n >= x.stars && (r = x));
  return r;
}

// 已解锁的临场卡
function unlockedCards() {
  const n = Math.min(CARD_ORDER.length, START_CARDS + S.cleared.length);
  return CARD_ORDER.slice(0, n).map((id) => CARDS.find((c) => c.id === id));
}

function reveal() {
  S.revealed = true;
  save();
}

// 三选一：从没拿过的卡里随机抽三张
function drawCards(owned, rand) {
  const pool = CARDS.filter((c) => owned.indexOf(c.id) < 0);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  return pool.slice(0, 3);
}

module.exports = {
  TEAMMATES, BASES, CARDS, MAX_LV,
  state: () => S,
  save, reset, mods, trainCost, train, upgradeBase, earn, reveal, drawCards,
  recordLevel, totalStars, rank, unlockedCards, RANKS, taught, markTaught, recordArena, recordDaily,
};
