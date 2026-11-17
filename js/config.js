// 《瓦西里》原型 · 所有可以调的数都在这里。
// 单位：时间是秒（blinkMs 是毫秒），距离是屏幕上的点（375 宽的手机上量）。

const config = {
  version: '瓦西里 · 原型 0.1',

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
    amp: 13, // 不屏息时准星上下晃多大
    holdMinAmp: 2.2, // 屏息最稳时还剩多大
    settleSec: 0.9, // 按住后多久稳下来
    holdMaxSec: 2.4, // 稳住能撑多久，过了就手抖
    tremorPerSec: 16, // 手抖每秒加大多少
  },

  heart: {
    perBlink: 0.07, // 每眨一次眼，心跳加多少（准星晃动倍数）
    perProgress: 0.8, // 对面找到你的进度越高，心跳越快
    max: 2.2,
  },

  shot: {
    reloadSec: 1.4, // 打空后多久能再开枪
    missCost: 0.3, // 打空一枪，对面搜索进度涨多少（位置暴露）
  },

  glintAt: 0.8, // 对面搜索进度到这里，镜片开始反光（最后警告，也是线索）

  // 一关里第 1、2、3 次对狙（index 0、1、2）
  duels: [
    { distractors: 2, blinkMs: 150, enemyRate: 0.02, blinkCost: 0.04, poseShift: 3.5, contrast: 0.22 },
    { distractors: 3, blinkMs: 190, enemyRate: 0.028, blinkCost: 0.05, poseShift: 3, contrast: 0.16 },
    { distractors: 5, blinkMs: 230, enemyRate: 0.035, blinkCost: 0.06, poseShift: 2.5, contrast: 0.11 },
  ],
};

// 开枪窗口：松手时，准星离对面狙击手的头多近算打中（单位：点）。
// 参考尺寸：头的半径约 4.5，肩膀宽约 14，整个窗口高约 22。
// duelIndex：这一关第几次对狙（0、1、2）；levelNo：第几关（从 1 开始）。
config.hitRadius = function (duelIndex, levelNo) {
  // TODO(human): 写出「前几关窗口很大、后面越来越窄」的曲线，返回一个数。
  return 24;
};

module.exports = config;
