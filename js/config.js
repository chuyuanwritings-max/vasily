// 《瓦西里》原型 · 所有可以调的数都在这里。
// 单位：时间是秒（blinkMs 是毫秒），距离是屏幕上的点（375 宽的手机上量）。

const config = {
  version: '瓦西里 · 原型 0.2',

  // 激励视频广告位 id。空着 = 放「广告占位」倒计时；上线前填后台建的 id。
  rewardedAdUnitId: '',
  fakeAdSec: 3,

  // 局外故事整块开关（类目卡住时关掉，玩法不受影响）
  storyEnabled: true,

  duelsPerLevel: 3,
  rescuesPerLevel: 1, // 每关最多被女队友拉起几次

  eye: {
    openMaxSec: 7, // 不眨眼最多撑几秒，满了强制眨一下
  },

  breath: {
    periodSec: 3.2, // 一次呼吸多长
    amp: 22, // 不屏息时准星上下晃多大（比打头的判定圈大得多：不屏息基本打不中）
    holdMinAmp: 1.8, // 屏息最稳时还剩多大
    settleSec: 0.9, // 按住后多久稳下来
    holdMaxSec: 2.0, // 稳住能撑多久，过了就手抖
    tremorPerSec: 18, // 手抖每秒加大多少
    recoverSec: 0.8, // 松手后要喘多久才能再屏息
  },

  heart: {
    perBlink: 0.06, // 每眨一次眼，心跳加多少（准星晃动倍数）
    perProgress: 0.6, // 对面找到你的进度越高，心跳越快
    max: 2.0,
  },

  shot: {
    reloadSec: 1.2, // 开一枪后多久能再开
    missCost: 0.3, // 打空一枪，对面搜索进度涨多少（位置暴露）
  },

  glintAt: 0.8, // 对面搜索进度到这里，镜片开始反光（最后警告，也是线索）

  // 对面找到你之后：他下一次探头就开枪。镜片一闪起，你有这么久先开枪。
  quickDrawSec: [0.9, 0.75, 0.6],

  // 一关里第 1、2、3 个对手（index 0、1、2）
  // 探头节奏：缩着 hideMin~hideMax 秒 → 探头 peekSec 秒 → 缩回去。fakeChance：假探头（露一下就缩）的机会
  duels: [
    { name: '耐心型', sub: '探得少，但探得久', distractors: 2, blinkMs: 150, enemyRate: 0.02, blinkCost: 0.04, poseShift: 3.5, contrast: 0.22, hideMin: 3.2, hideMax: 3.2, peekSec: 1.8, fakeChance: 0 },
    { name: '焦躁型', sub: '探得勤，缩得快', distractors: 3, blinkMs: 190, enemyRate: 0.028, blinkCost: 0.05, poseShift: 3, contrast: 0.16, hideMin: 1.6, hideMax: 2.4, peekSec: 1.0, fakeChance: 0 },
    { name: '狡猾型', sub: '会假探头骗你', distractors: 5, blinkMs: 230, enemyRate: 0.035, blinkCost: 0.06, poseShift: 2.5, contrast: 0.11, hideMin: 1.8, hideMax: 3.6, peekSec: 0.9, fakeChance: 0.4 },
  ],

  // 每过一关，探头时间缩短多少（0.06 = 6%），最短缩到原来的几成
  peekShrinkPerLevel: 0.06,
  peekMinScale: 0.6,
};

// 开枪判定圈：松手时，准星离对面狙击手的头多近算打中（单位：点）。只在他探头时算。
// 参考尺寸：头的半径约 4.5；不屏息时准星晃动约 22，屏息最稳时约 2。
// duelIndex：这一关第几个对手（0、1、2）；levelNo：第几关（从 1 开始）。
config.hitRadius = function (duelIndex, levelNo) {
  // TODO(human): 写出「前几关宽一点、后面越来越窄」的曲线，返回一个数。
  return 7;
};

module.exports = config;
