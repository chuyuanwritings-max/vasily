// 第一章 · 网吧赛：8 关 + Boss。一关 = 1~3 个回合（每个回合一个狙击手，中间换点位）。
// 手工排的顺序：每种新东西第一次出现时单独教（teach 是关前那一页的几句话）。
//
// 回合字段：opp 对手（config.opponents）；theme 地图（themes.js）；cover 遮挡（config.covers，'auto' = 地图自带的）；figures 对面一共几个人影（含狙击手）；
//   cond 地图条件 fog / night / pigeons；goal 目标 kill / escort；bullets 子弹；time 秒；hitR 判定圈
// 星星：每关两条附加条件，加上过关一颗
//   noMiss 一发没浪费；noLock 没被他瞄准过；noRescue 没叫队友拉人；fast 总用时 ≤ fastSec 秒

const STAR_TEXT = {
  head: '至少一次爆头',
  noWrong: '一个都没打错',
  noMiss: '一发子弹都没浪费',
  noLock: '一次都没被他瞄准',
  noRescue: '没叫队友拉人',
  fast: (lv) => lv.fastSec + ' 秒内过关',
};

// 0.7 的网吧赛九关：0.8 换成「第一座城」，这些先留着（对狙的规则测试还在用，第二章可能拿回来）
const CAFE_CHAPTERS = [
  {
    id: 'cafe',
    name: '网吧赛',
    levels: [
      {
        id: 'c1', name: '第一枪',
        teach: [['只有一个是狙击手', '缩一下头，看谁挪了']],
        stars: ['noMiss', 'noLock'],
        rounds: [{ opp: 'patient', theme: 'desert', figures: 4, goal: 'kill', bullets: 3, time: 90, hitR: 7, props: 6 }],
      },
      {
        id: 'c2', name: '谁在闪',
        teach: [['红圈压到你身边时，他的镜片会闪', '路人的手机也会闪']],
        stars: ['noMiss', 'fast'], fastSec: 50,
        rounds: [{ opp: 'patient', theme: 'med', figures: 6, goal: 'kill', bullets: 3, time: 80, hitR: 7, props: 10 }],
      },
      {
        id: 'c3', name: '换个窗',
        teach: [['点下面的另一扇窗 = 换窗', '同一扇窗露头三次，他就记住了']], // 地图：雨夜货运站，火车开过挡住下面几排
        stars: ['noLock', 'noRescue'],
        rounds: [
          { opp: 'nervous', theme: 'station', figures: 6, goal: 'kill', bullets: 3, time: 75, hitR: 6.5, props: 10, cover: 'train' },
          { opp: 'nervous', theme: 'station', figures: 6, goal: 'kill', bullets: 3, time: 75, hitR: 6.5, props: 10, cover: 'train' },
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
          { opp: 'sly', theme: 'oldtown', figures: 6, goal: 'kill', bullets: 3, time: 75, hitR: 6, props: 12 },
          { opp: 'sly', theme: 'oldtown', figures: 7, goal: 'kill', bullets: 3, time: 75, hitR: 6, props: 12 },
        ],
      },
      {
        id: 'c6', name: '掩护小雨',
        teach: [['掩护街上的小雨', '他瞄小雨时没在看你']],
        stars: ['noLock', 'noRescue'],
        rounds: [{ opp: 'nervous', theme: 'farm', figures: 6, goal: 'escort', bullets: 3, time: 90, hitR: 6, props: 10 }],
      },
      {
        id: 'c7', name: '鸽子',
        teach: [['鸟飞起来的地方：他就在那附近', '']],
        stars: ['noMiss', 'noLock'],
        rounds: [
          { opp: 'mover', theme: 'temple', figures: 7, cond: 'pigeons', goal: 'kill', bullets: 3, time: 80, hitR: 5.5, props: 14 },
          { opp: 'mover', theme: 'temple', figures: 8, cond: 'pigeons', goal: 'kill', bullets: 3, time: 80, hitR: 5.5, props: 14 },
        ],
      },
      {
        id: 'c8', name: '一枪定胜负',
        teach: [['夜里看反光', '每回合只有一发']],
        stars: ['noLock', 'fast'], fastSec: 100,
        rounds: [
          { opp: 'patient', theme: 'castle', figures: 6, cond: 'night', goal: 'kill', bullets: 1, time: 80, hitR: 5.5, props: 12 },
          { opp: 'sly', theme: 'castle', figures: 7, cond: 'night', goal: 'kill', bullets: 1, time: 80, hitR: 5.5, props: 12 },
        ],
      },
      {
        id: 'c9', name: 'Boss · 老枪', boss: true, needStars: 10,
        bossIntro: ['网吧里没人赢过他', '三条命：每挨一枪，他换一招'],
        teach: [['三条命，每挨一枪换一招', '最后一招：蒸汽']],
        stars: ['noRescue', 'noLock'],
        rounds: [{ opp: 'boss', theme: 'plant', figures: 8, goal: 'kill', bullets: 3, time: 120, hitR: 5, props: 14 }],
      },
    ],
  },
];


// —— 0.8：照《Sniper 3D》的第一座城（拆解见 对狙/模仿_Sniper3D_关卡拆解.md） ——
// 一关 = 开局一句话（目标卡）+ 找到他、开枪。mission 字段见 mission.js
// type：教学 / 主线 / 特别任务。特别任务按顺序打完开下一座城；第三、第五个是对狙（缩头、红圈都在）
const D = 'desert';
const m = (kind, o) => Object.assign({ kind }, o);
const r1 = (mission, o) => Object.assign({ theme: D, bullets: 3, time: 60, hitR: 7, props: 8, mission }, o || {});
const CITIES = [
  {
    id: 'desert',
    name: '沙漠土楼镇',
    levels: [
      { id: 'd1', type: '教学', name: '红衣服', stars: ['head', 'noWrong'], teach: [['点一下全景 = 放大到那里', '按住右下稳住，松手开枪']],
        rounds: [r1(m('one', { clue: { shirt: 'red' }, say: '对手穿红衣服', win: 2, street: 2 }), { hitR: 8, time: 75 })] },
      { id: 'd2', type: '教学', name: '碰头', stars: ['head', 'noWrong'],
        rounds: [r1(m('one', { clue: { shirt: 'blue' }, say: '对手穿蓝衣服', win: 4, street: 4 }), { hitR: 7.5 })] },
      { id: 'd3', type: '教学', name: '别让他跑', stars: ['head', 'noWrong'], teach: [['他会跑：跑出画面就输', '']],
        rounds: [r1(m('runner', { clue: { bag: 'duffel' }, say: '他背着行李袋，要跑了', where: 'street', win: 2, street: 6, runAt: 6, runSpeed: 55 }))] },
      { id: 'd4', type: '主线', name: '背包客', stars: ['head', 'noWrong'],
        rounds: [r1(m('one', { clue: { bag: 'backpack' }, say: '对手背着背包', win: 5, street: 5 }))] },
      { id: 'd5', type: '主线', name: '楼上的枪', stars: ['head', 'noWrong'], teach: [['他已经在瞄你：只有一发', '按住左下 = 缩头，他会慢慢丢了你']],
        rounds: [r1(m('duel1', { clue: { gun: true }, say: '楼上有人拿枪瞄着你：一枪解决他', where: 'win', win: 7, street: 3, aimSec: 7 }), { bullets: 1, time: 45 })] },
      { id: 'd6', type: '主线', name: '通缉', stars: ['head', 'noWrong'], teach: [['两个特征都对上才是他', '']],
        rounds: [r1(m('one', { clue: { hair: 'red', bag: 'suitcase' }, say: '通缉：红头发，提着手提箱', half: 3, win: 3, street: 8 }))] },
      { id: 'd7', type: '主线', name: '宽檐帽', stars: ['head', 'noWrong'],
        rounds: [r1(m('one', { clue: { hat: 'hat' }, say: '对手戴宽檐帽', win: 6, street: 5 }), { hitR: 6.5 })] },
      { id: 'd8', type: '主线', name: '越狱', stars: ['head', 'fast'], fastSec: 40, teach: [['限时：打掉所有穿橙衣服的', '']],
        rounds: [r1(m('multi', { clue: { shirt: 'orange' }, say: '穿橙衣服的全是逃犯：打掉 5 个', targets: 5, win: 7, street: 7 }), { bullets: 8, time: 60, hitR: 7 })] },
      { id: 'd9', type: '主线', name: '打电话', stars: ['head', 'noWrong'],
        rounds: [r1(m('one', { clue: { phone: true }, say: '对手正在打电话：看手机屏幕的光', win: 7, street: 5 }), { hitR: 6.5 })] },
      { id: 'd10', type: '主线', name: '墨镜', stars: ['head', 'noWrong'],
        rounds: [r1(m('one', { clue: { glasses: true, shirt: 'black' }, say: '戴墨镜、穿黑衣服', half: 4, win: 6, street: 6 }), { hitR: 6.5 })] },
      { id: 'd11', type: '主线', name: '炸弹包', stars: ['head', 'fast'], fastSec: 15, teach: [['倒计时到零，炸弹就炸', '']],
        rounds: [r1(m('bomber', { clue: { vest: true }, say: '有人背着炸弹包：25 秒内打中他', win: 7, street: 6, fuse: 25 }), { time: 60, hitR: 6.5 })] },
      { id: 'd12', type: '主线', name: '掏枪', stars: ['head', 'noWrong'], teach: [['他长得跟路人一样，只有掏枪那两秒露馅', '']],
        rounds: [r1(m('assassin', { clue: {}, say: '有人装成路人，会突然掏枪', win: 7, street: 6 }), { time: 70, hitR: 6.5 })] },
      { id: 'd13', type: '主线', name: '快跑', stars: ['head', 'noWrong'],
        rounds: [r1(m('runner', { clue: { bag: 'suitcase', shirt: 'white' }, say: '穿白衣服、提手提箱的要跑了', half: 3, where: 'street', win: 4, street: 8, runAt: 4, runSpeed: 85 }), { hitR: 6.5 })] },
      { id: 'd14', type: '主线', name: '三把枪', stars: ['head', 'fast'], fastSec: 30,
        rounds: [r1(m('multi', { clue: { gun: true }, say: '打掉三个拿枪的', targets: 3, win: 8, street: 6 }), { bullets: 5, time: 45, hitR: 6.5 })] },
      { id: 'd15', type: '主线', name: '一枪定生死', stars: ['head', 'noWrong'],
        rounds: [r1(m('duel1', { clue: { gun: true }, say: '他已经瞄准你了：只有一发', where: 'win', win: 9, street: 5, aimSec: 4.5 }), { bullets: 1, time: 40, hitR: 6 })] },
      // 特别任务：规则最花，按顺序打完开下一座城
      { id: 's1', type: '特别任务', name: '追车', stars: ['head', 'noWrong'], teach: [['打驾驶室里的司机', '车开出画面就跑了']],
        rounds: [r1(m('car', { clue: {}, targets: 0, say: '他抢了一辆黄色三轮车：打司机', win: 5, street: 4, carSpeed: 40 }), { time: 40 })] },
      { id: 's2', type: '特别任务', name: '暗处交易', stars: ['head', 'noWrong'],
        rounds: [r1(m('dark', { clue: {}, targets: 2, say: '两个人在暗处交易：看打火机的光', where: 'win', win: 9, street: 0 }), { bullets: 4, time: 70, hitR: 6.5 })] },
      { id: 's3', type: '特别任务', name: '掩护小雨', stars: ['noLock', 'noRescue'], teach: [['掩护街上的小雨', '他瞄小雨时没在看你']],
        rounds: [{ opp: 'nervous', theme: D, figures: 6, goal: 'escort', bullets: 3, time: 90, hitR: 6, props: 10 }] },
      { id: 's4', type: '特别任务', name: '先打灯', stars: ['head', 'noWrong'], teach: [['灯亮着打倒一个，其他人就跑', '先打灭探照灯']],
        rounds: [r1(m('light', { clue: { gun: true }, say: '先打灭探照灯，再打掉四个拿枪的', targets: 4, win: 7, street: 4 }), { bullets: 7, time: 70, hitR: 6.5 })] },
      { id: 's5', type: '特别任务', name: '五个狙击手', boss: true, stars: ['noRescue', 'noLock'], bossIntro: ['城里藏了五个狙击手', '一个一个找出来'],
        teach: [['缩头、看红圈：谁先暴露谁死', '']],
        rounds: ['patient', 'nervous', 'sly', 'mover', 'patient'].map((opp, i) => ({ opp, theme: D, figures: 4 + Math.min(2, i), goal: 'kill', bullets: 3, time: 50, hitR: 6, props: 8 })) },
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
// 0.7：擂台、每日挑战从十二张地图里抽，地图自带的遮挡（火车、蒸汽……）也一起来
const RANDOM_THEMES = require('./themes.js').MAP_ORDER;

// 擂台的下一个回合：随机对手和背景，再叠上已经攒下的加难
function arenaRound(modIds, rand) {
  const R = { opp: RANDOM_OPPS[Math.floor(rand() * RANDOM_OPPS.length)], theme: RANDOM_THEMES[Math.floor(rand() * RANDOM_THEMES.length)], figures: 5, props: 10, goal: 'kill', bullets: 3, time: 70, hitR: 6.5, cover: 'auto' };
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
    figures: 6 + i, props: 12, goal: 'kill', bullets: 3, time: 75, hitR: 6, cover: 'auto',
  }));
}

function allLevels(list, extra) {
  const out = [];
  list.forEach((ch) => ch.levels.forEach((lv, i) => out.push(Object.assign({ chapter: ch.id, index: out.length, no: i + 1 }, extra || {}, lv))));
  return out;
}

const LEVELS = allLevels(CITIES, { city: true }); // 主线：一座城一座城打
const CAFE = allLevels(CAFE_CHAPTERS, { legacy: true }); // 0.7 的网吧赛（不在地图上）
const CHAPTERS = CITIES;

function starText(lv, key) {
  const t = STAR_TEXT[key];
  return typeof t === 'function' ? t(lv) : t;
}

module.exports = { CHAPTERS, CITIES, LEVELS, CAFE, starText, ARENA_MODS, arenaRound, pickArenaMod, dailyRounds };
