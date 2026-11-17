// 《瓦西里》原型 · 所有可以调的数都在这里。
// 单位：时间是秒（blinkMs 是毫秒），距离是屏幕上的点（375 宽的手机上量）。

const config = {
  version: '瓦西里 · 原型 0.3',

  // 激励视频广告位 id。空着 = 放「广告占位」倒计时；上线前填后台建的 id。
  rewardedAdUnitId: '',
  fakeAdSec: 3,

  // 局外故事整块开关（类目卡住时关掉，玩法不受影响）
  storyEnabled: true,

  duelsPerLevel: 3, // 一场比赛打几个对手
  rescuesPerLevel: 1, // 每场最多被女队友拉起几次（观察手练到 3 级 +1）

  // 一次网吧赛 = 三场比赛，每场三个对手，每个对手一张不同的背景（主题名见 themes.js）
  matches: [
    { name: '第一场', place: '老城区', themes: ['oldtown', 'market', 'tanks'] },
    { name: '第二场', place: '港口和车站', themes: ['port', 'station', 'factory'] },
    { name: '第三场', place: '夜里的城', themes: ['neon', 'desert', 'eaves'] },
  ],

  eye: {
    openMaxSec: 7, // 不眨眼最多撑几秒，满了强制眨一下
  },

  breath: {
    periodSec: 3.2, // 一次呼吸多长
    amp: 18, // 不屏息时准星上下晃多大
    holdMinAmp: 1.2, // 屏息最稳时还剩多大
    settleSec: 0.6, // 按住后多久稳下来
    holdMaxSec: 3.0, // 稳住能撑多久，过了就手抖
    tremorPerSec: 14, // 手抖每秒加大多少
    recoverSec: 0.5, // 松手后要喘多久才能再屏息
  },

  // 屏息时，准星离他的头够近，会被轻轻吸过去（手机上手指拖不了那么准）
  // radius：第 1、2、3 场各多近才吸；perSec：吸得多快
  assist: { radius: [30, 20, 12], perSec: 3 },

  heart: {
    perBlink: 0.04, // 每眨一次眼，心跳加多少（准星晃动倍数）
    perProgress: 0.4, // 对面找到你的进度越高，心跳越快
    max: 1.7,
  },

  shot: {
    reloadSec: 1.0, // 开一枪后多久能再开
    missCost: 0.15, // 打空一枪，对面搜索进度涨多少（位置暴露）
  },

  glintAt: 0.8, // 对面搜索进度到这里，镜片开始反光（最后警告，也是线索）

  // 对面找到你之后：他下一次探头就开枪。镜片一闪起，你有这么久先开枪。
  quickDrawSec: [1.4, 1.2, 1.0],

  // 一场里第 1、2、3 个对手（index 0、1、2）
  // 探头节奏：缩着 hideMin~hideMax 秒 → 探头 peekSec 秒 → 缩回去。fakeChance：假探头（露一下就缩）的机会
  duels: [
    { name: '耐心型', sub: '探得少，但探得久', distractors: 2, blinkMs: 150, enemyRate: 0.014, blinkCost: 0.03, poseShift: 3.5, contrast: 0.24, hideMin: 2.6, hideMax: 2.6, peekSec: 2.8, fakeChance: 0 },
    { name: '焦躁型', sub: '探得勤，缩得快', distractors: 3, blinkMs: 180, enemyRate: 0.02, blinkCost: 0.04, poseShift: 3, contrast: 0.2, hideMin: 1.4, hideMax: 2.2, peekSec: 1.8, fakeChance: 0 },
    { name: '狡猾型', sub: '会假探头骗你', distractors: 4, blinkMs: 210, enemyRate: 0.025, blinkCost: 0.05, poseShift: 2.5, contrast: 0.16, hideMin: 1.6, hideMax: 3.0, peekSec: 1.6, fakeChance: 0.25 },
  ],

  // 每过一场，探头时间缩短多少（0.06 = 6%），最短缩到原来的几成
  peekShrinkPerLevel: 0.06,
  peekMinScale: 0.7,

  // —— 局外：奖金 ——
  money: { perKill: 20, perMatch: 50, perCup: 200 },
};

// 开枪判定圈：松手时，准星离对面狙击手的头多近算打中（单位：点）。只在他探头时算。
// 第一场第一个对手 15，之后每个对手 −1，每场再 −1.5，最小 8。头的半径约 4.5。
config.hitRadius = function (duelIndex, levelNo) {
  return Math.max(8, 15 - duelIndex - (levelNo - 1) * 1.5);
};

module.exports = config;
