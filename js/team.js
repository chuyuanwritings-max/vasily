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
    desc: (lv) => '他探头前耳机里喊你' + (lv >= 3 ? '·每场多拉一次' : '·3级多拉一次'),
    mods: (lv) => ({ peekCue: lv >= 1, rescueAdd: lv >= 3 ? 1 : 0 }) },
  { id: 'entry', name: '阿豆', role: '突破手', buff: '冷静', look: { hair: '#6b3e26', jacket: '#f4a261', skin: '#d99a6c', style: 'buzz' },
    desc: (lv) => '心跳慢 ' + lv * 12 + '%', mods: (lv) => ({ heartMul: 1 - 0.12 * lv }) },
  { id: 'free', name: '铁头', role: '自由人', buff: '快枪', look: { hair: '#f4f1de', jacket: '#2a9d8f', skin: '#e9b48a', style: 'spiky' },
    desc: (lv) => '对枪多 ' + (lv * 0.1).toFixed(1) + ' 秒', mods: (lv) => ({ quickDrawAdd: 0.1 * lv }) },
  { id: 'sub', name: '小新', role: '替补', buff: '藏得好', look: { hair: '#c77dff', jacket: '#6a4c93', skin: '#f1c6a8', style: 'cap' },
    desc: (lv) => '对面找你慢 ' + lv * 6 + '%', mods: (lv) => ({ enemyRateMul: 1 - 0.06 * lv, blinkCostMul: 1 - 0.08 * lv }) },
];

// 训练基地：越好，奖金拿得越多
const BASES = [
  { name: '网吧角落', mul: 1, cost: 300 },
  { name: '训练室', mul: 1.25, cost: 800 },
  { name: '战队基地', mul: 1.5, cost: 0 },
];

// 临场卡：打完一场三选一
const CARDS = [
  { id: 'breath', name: '深呼吸', desc: '稳住多撑 1 秒', icon: 'lung', mods: { holdMaxAdd: 1 } },
  { id: 'scope', name: '好镜子', desc: '判定圈大一圈', icon: 'scope', mods: { hitRadiusAdd: 3 } },
  { id: 'ear', name: '耳机', desc: '他探头前有提示', icon: 'ear', mods: { peekCue: true } },
  { id: 'gum', name: '口香糖', desc: '心跳慢一半', icon: 'heart', mods: { heartMul: 0.5 } },
  { id: 'mag', name: '快速换弹', desc: '换弹快一半', icon: 'bullet', mods: { reloadMul: 0.5 } },
  { id: 'ghillie', name: '伪装网', desc: '他找你慢三成', icon: 'leaf', mods: { enemyRateMul: 0.7 } },
  { id: 'charm', name: '护身符', desc: '每场多拉一次', icon: 'charm', mods: { rescueAdd: 1 } },
  { id: 'hand', name: '快手', desc: '对枪多 0.3 秒', icon: 'hand', mods: { quickDrawAdd: 0.3 } },
];

const ADD = ['hitRadiusAdd', 'holdMaxAdd', 'quickDrawAdd', 'rescueAdd'];
const MUL = ['settleMul', 'heartMul', 'enemyRateMul', 'blinkCostMul', 'reloadMul'];

function fresh() {
  const team = {};
  TEAMMATES.forEach((m) => (team[m.id] = 1));
  return { money: 0, fans: 0, cups: 0, revealed: false, team, base: 0 };
}

let S = Object.assign(fresh(), platform.load(SAVE_KEY) || {});

function save() {
  platform.save(SAVE_KEY, S);
}

function reset() {
  S = fresh();
  save();
}

function combine(list) {
  const out = { hitRadiusAdd: 0, holdMaxAdd: 0, quickDrawAdd: 0, rescueAdd: 0, settleMul: 1, heartMul: 1, enemyRateMul: 1, blinkCostMul: 1, reloadMul: 1, peekCue: false };
  list.forEach((m) => {
    ADD.forEach((k) => m[k] && (out[k] += m[k]));
    MUL.forEach((k) => m[k] !== undefined && (out[k] *= m[k]));
    if (m.peekCue) out.peekCue = true;
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
  // TODO(human): 写练级价钱的曲线。一场全赢大约拿 60 + 50 = 110，一次网吧赛全赢约 530。
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

function earn(kind) {
  const n = Math.round(config.money[kind] * BASES[S.base].mul);
  S.money += n;
  if (kind === 'perMatch') S.fans += 10;
  if (kind === 'perCup') {
    S.fans += 100;
    S.cups += 1;
  }
  save();
  return n;
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
};
