// 《瓦西里》原型 · 所有可以调的数都在这里。
// 单位：时间是秒（blinkMs 是毫秒），距离是屏幕上的点（375 宽的手机上量）。

const config = {
  version: '瓦西里 · 原型 0.4',

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
  // radius：第 1、2、3 场各多近才吸（第三场不吸）；perSec：吸得多快
  assist: { radius: [10, 5, 0], perSec: 3 },

  // 他的镜子怎么在你这栋楼上找你（画面下方的红圈）
  seek: {
    spread: 0.6, // 他刚开始乱看的范围（1 = 整栋楼）
    dwellSec: 0.7, // 每扇窗看多久
    coolPerSec: 0.1, // 你缩着头时，他对你位置的把握每秒忘掉多少
    perMatch: 0.15, // 每过一场，他找得快多少
  },

  heart: {
    perHeat: 0.35, // 他越清楚你在哪，心跳越快（准星晃动倍数）
    perLock: 0.35, // 锁定圈越满，心跳越快
    max: 1.7,
  },

  shot: {
    reloadSec: 1.0, // 开一枪后多久能再开
  },

  // 一场里第 1、2、3 个对手（index 0、1、2）
  // 他的节奏：缩着 hideMin~hideMax 秒 → 探头 peekSec 秒（探头时才在找你，也才打得到他）→ 缩回去
  // seekSpeed：红圈每秒挪几扇窗；heatRate：你露着头时他每秒多清楚你在哪；
  // lockSec：红圈停在你窗口上多久锁定你；quickDraw：锁定后几秒开枪；decoy：会摆假人
  duels: [
    { name: '耐心型', sub: '探得少，但一探就是好久', distractors: 2, blinkMs: 260, poseShift: 3.5, contrast: 0.24,
      hideMin: 2.0, hideMax: 2.0, peekSec: 3.0, seekSpeed: 2.5, heatRate: 0.1, lockSec: 0.8, quickDraw: 0.9, decoy: false },
    { name: '焦躁型', sub: '探得勤，红圈跑得快', distractors: 3, blinkMs: 240, poseShift: 3, contrast: 0.2,
      hideMin: 1.0, hideMax: 1.8, peekSec: 1.6, seekSpeed: 3.4, heatRate: 0.14, lockSec: 0.65, quickDraw: 0.75, decoy: false },
    { name: '狡猾型', sub: '摆了个假人骗你开枪', distractors: 4, blinkMs: 220, poseShift: 2.5, contrast: 0.16,
      hideMin: 1.4, hideMax: 2.4, peekSec: 1.8, seekSpeed: 3, heatRate: 0.16, lockSec: 0.6, quickDraw: 0.65, decoy: true },
  ],

  // —— 局外：奖金 ——
  money: { perKill: 20, perMatch: 50, perCup: 200 },
};

// 开枪判定圈：松手时，准星离他的头多近算打中（单位：点）。只在他探头时算。头的半径约 4.5。
// 第一场 10、9.5、9；第二场 8.5、8、7.5；第三场 7、6.5、6。
config.hitRadius = function (duelIndex, levelNo) {
  return Math.max(6, 10 - duelIndex * 0.5 - (levelNo - 1) * 1.5);
};

module.exports = config;
