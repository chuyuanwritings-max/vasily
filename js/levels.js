// 第一章 · 网吧赛：8 关 + Boss。一关 = 1~3 个回合（每个回合一个狙击手，中间换点位）。
// 手工排的顺序：每种新东西第一次出现时单独教（teach 是关前那一页的几句话）。
//
// 回合字段：opp 对手（config.opponents）；theme 背景（themes.js）；figures 对面一共几个人影（含狙击手）；
//   cond 地图条件 fog / night / pigeons；goal 目标 kill / escort；bullets 子弹；time 秒；hitR 判定圈
// 星星：每关两条附加条件，加上过关一颗
//   noMiss 一发没浪费；noLock 没被他瞄准过；noRescue 没叫队友拉人；fast 总用时 ≤ fastSec 秒

const STAR_TEXT = {
  noMiss: '一发子弹都没浪费',
  noLock: '一次都没被他瞄准',
  noRescue: '没叫队友拉人',
  fast: (lv) => lv.fastSec + ' 秒内过关',
};

const CHAPTERS = [
  {
    id: 'cafe',
    name: '网吧赛',
    levels: [
      {
        id: 'c1', name: '第一枪',
        teach: [['只有一个是狙击手', '缩一下头，看谁挪了']],
        stars: ['noMiss', 'noLock'],
        rounds: [{ opp: 'patient', theme: 'oldtown', figures: 4, goal: 'kill', bullets: 3, time: 90, hitR: 7, props: 6 }],
      },
      {
        id: 'c2', name: '谁在闪',
        teach: [['红圈压到你身边时，他的镜片会闪', '路人的手机也会闪']],
        stars: ['noMiss', 'fast'], fastSec: 50,
        rounds: [{ opp: 'patient', theme: 'market', figures: 6, goal: 'kill', bullets: 3, time: 80, hitR: 7, props: 10 }],
      },
      {
        id: 'c3', name: '换个窗',
        teach: [['点下面的另一扇窗 = 换窗', '同一扇窗露头三次，他就记住了']],
        stars: ['noLock', 'noRescue'],
        rounds: [
          { opp: 'nervous', theme: 'tanks', figures: 6, goal: 'kill', bullets: 3, time: 75, hitR: 6.5, props: 10 },
          { opp: 'nervous', theme: 'tanks', figures: 6, goal: 'kill', bullets: 3, time: 75, hitR: 6.5, props: 10 },
        ],
      },
      {
        id: 'c4', name: '起雾了',
        teach: [['浓雾时他也看不清你', '']],
        stars: ['noMiss', 'noLock'],
        rounds: [
          { opp: 'patient', theme: 'port', figures: 6, cond: 'fog', goal: 'kill', bullets: 3, time: 80, hitR: 6.5, props: 12 },
          { opp: 'nervous', theme: 'port', figures: 7, cond: 'fog', goal: 'kill', bullets: 3, time: 80, hitR: 6.5, props: 12 },
        ],
      },
      {
        id: 'c5', name: '假人',
        teach: [['头盔假人：缩头再起来时它不挪', '打错扣 8 秒']],
        stars: ['noMiss', 'fast'], fastSec: 110,
        rounds: [
          { opp: 'sly', theme: 'station', figures: 6, goal: 'kill', bullets: 3, time: 75, hitR: 6, props: 12 },
          { opp: 'sly', theme: 'station', figures: 7, goal: 'kill', bullets: 3, time: 75, hitR: 6, props: 12 },
        ],
      },
      {
        id: 'c6', name: '掩护小雨',
        teach: [['掩护街上的小雨', '他瞄小雨时没在看你']],
        stars: ['noLock', 'noRescue'],
        rounds: [{ opp: 'nervous', theme: 'factory', figures: 6, goal: 'escort', bullets: 3, time: 90, hitR: 6, props: 10 }],
      },
      {
        id: 'c7', name: '鸽子',
        teach: [['鸽子飞起来的那栋楼：他就在里面', '']],
        stars: ['noMiss', 'noLock'],
        rounds: [
          { opp: 'mover', theme: 'desert', figures: 7, cond: 'pigeons', goal: 'kill', bullets: 3, time: 80, hitR: 5.5, props: 14 },
          { opp: 'mover', theme: 'desert', figures: 8, cond: 'pigeons', goal: 'kill', bullets: 3, time: 80, hitR: 5.5, props: 14 },
        ],
      },
      {
        id: 'c8', name: '一枪定胜负',
        teach: [['夜里看反光', '每回合只有一发']],
        stars: ['noLock', 'fast'], fastSec: 100,
        rounds: [
          { opp: 'patient', theme: 'neon', figures: 6, cond: 'night', goal: 'kill', bullets: 1, time: 80, hitR: 5.5, props: 12 },
          { opp: 'sly', theme: 'neon', figures: 7, cond: 'night', goal: 'kill', bullets: 1, time: 80, hitR: 5.5, props: 12 },
        ],
      },
      {
        id: 'c9', name: 'Boss · 老枪', boss: true, needStars: 10,
        bossIntro: ['网吧里没人赢过他', '三条命：每挨一枪，他换一招'],
        teach: [['三条命，每挨一枪换一招', '']],
        stars: ['noRescue', 'noLock'],
        rounds: [{ opp: 'boss', theme: 'eaves', figures: 8, goal: 'kill', bullets: 3, time: 120, hitR: 5, props: 14 }],
      },
    ],
  },
];

// —— 擂台：一个接一个打，每赢一个叠一个加难 ——
const ARENA_MODS = [
  { id: 'crowd', name: '人更多', f: (R) => { R.figures += 2; R.props += 4; } },
  { id: 'ammo', name: '少一发子弹', f: (R) => { R.bullets = Math.max(1, R.bullets - 1); } },
  { id: 'small', name: '判定圈小一圈', f: (R) => { R.hitR = Math.max(4, R.hitR - 1); } },
  { id: 'time', name: '少 15 秒', f: (R) => { R.time = Math.max(35, R.time - 15); } },
  { id: 'fast', name: '他找得更快', f: (R) => { R.seekMul = (R.seekMul || 1) * 1.25; } },
  { id: 'fog', name: '大雾', cond: true, f: (R) => { R.cond = 'fog'; } },
  { id: 'night', name: '夜里', cond: true, f: (R) => { R.cond = 'night'; } },
  { id: 'pigeons', name: '鸽群', cond: true, f: (R) => { R.cond = 'pigeons'; } },
  { id: 'crowd2', name: '人再多一点', f: (R) => { R.figures += 1; R.props += 4; } },
  { id: 'fast2', name: '他找得再快一点', f: (R) => { R.seekMul = (R.seekMul || 1) * 1.2; } },
];
const RANDOM_OPPS = ['patient', 'nervous', 'sly', 'mover'];
const RANDOM_THEMES = ['oldtown', 'market', 'tanks', 'port', 'station', 'factory', 'neon', 'desert', 'eaves'];

// 擂台的下一个回合：随机对手和背景，再叠上已经攒下的加难
function arenaRound(modIds, rand) {
  const R = { opp: RANDOM_OPPS[Math.floor(rand() * RANDOM_OPPS.length)], theme: RANDOM_THEMES[Math.floor(rand() * RANDOM_THEMES.length)], figures: 5, props: 10, goal: 'kill', bullets: 3, time: 70, hitR: 6.5 };
  modIds.forEach((id) => ARENA_MODS.find((m) => m.id === id).f(R));
  return R;
}

// 赢了一个：从还没用过的加难里抽一个（天气只叠一种）
function pickArenaMod(modIds, rand) {
  const hasCond = modIds.some((id) => ARENA_MODS.find((m) => m.id === id).cond);
  const pool = ARENA_MODS.filter((m) => modIds.indexOf(m.id) < 0 && !(hasCond && m.cond));
  if (!pool.length) return null;
  return pool[Math.floor(rand() * pool.length)];
}

// —— 每日挑战：同一天所有人同一局（三个回合），比用时 ——
function dailyRounds(day, rngFn) {
  const r = rngFn(day);
  const conds = [null, 'fog', 'night', 'pigeons'];
  return [0, 1, 2].map((i) => ({
    opp: RANDOM_OPPS[Math.floor(r() * RANDOM_OPPS.length)],
    theme: RANDOM_THEMES[Math.floor(r() * RANDOM_THEMES.length)],
    cond: i === 0 ? null : conds[Math.floor(r() * conds.length)],
    figures: 6 + i, props: 12, goal: 'kill', bullets: 3, time: 75, hitR: 6,
  }));
}

function allLevels() {
  const out = [];
  CHAPTERS.forEach((ch) => ch.levels.forEach((lv, i) => out.push(Object.assign({ chapter: ch.id, index: out.length, no: i + 1 }, lv))));
  return out;
}

const LEVELS = allLevels();

function starText(lv, key) {
  const t = STAR_TEXT[key];
  return typeof t === 'function' ? t(lv) : t;
}

module.exports = { CHAPTERS, LEVELS, starText, ARENA_MODS, arenaRound, pickArenaMod, dailyRounds };
