// 《瓦西里》原型 · 所有可以调的数都在这里。关卡本身在 levels.js。
// 单位：时间是秒（blinkMs 是毫秒），距离是屏幕上的点（375 宽的手机上量）。

const config = {
  version: '瓦西里 · 原型 0.5',

  // 激励视频广告位 id。空着 = 放「广告占位」倒计时；上线前填后台建的 id。
  rewardedAdUnitId: '',
  fakeAdSec: 3,

  // 局外故事整块开关（类目卡住时关掉，玩法不受影响）
  storyEnabled: true,

  rescuesPerLevel: 1, // 每关最多被女队友拉起几次（观察手练到 3 级 +1）
  ammoAdsPerLevel: 1, // 每关最多让小雨扔一发子弹几次

  breath: {
    periodSec: 3.2, // 一次呼吸多长
    amp: 18, // 不屏息时准星上下晃多大
    holdMinAmp: 1.2, // 屏息最稳时还剩多大
    settleSec: 0.6, // 按住后多久稳下来
    holdMaxSec: 3.0, // 稳住能撑多久，过了就手抖
    tremorPerSec: 14, // 手抖每秒加大多少
    recoverSec: 0.5, // 松手后要喘多久才能再屏息
  },

  // 屏息时，准星离他的头够近，会被轻轻吸过去。按关卡序号（从 0 起）查表，查不到就是 0
  assist: { radius: [10, 10, 8, 6, 5, 4, 3, 0, 0], perSec: 3 },

  // 他的镜子怎么在你这栋楼上找你（画面下方的红圈）
  seek: {
    spread: 0.6, // 他刚开始乱看的范围（1 = 整栋楼）
    dwellSec: 0.7, // 每扇窗看多久
    coolPerSec: 0.1, // 你缩着头时，他对你位置的把握每秒忘掉多少
    glintCells: 1.3, // 红圈离你几扇窗以内，他的镜片会反光（认人的线索）
  },

  heart: {
    perHeat: 0.35, // 他越清楚你在哪，心跳越快（准星晃动倍数）
    perLock: 0.35, // 锁定圈越满，心跳越快
    max: 1.7,
  },

  shot: {
    reloadSec: 1.0, // 开一枪后多久能再开
    wrongPenaltySec: 8, // 打错人扣几秒
  },

  move: { sec: 1.5 }, // 换窗爬过去要几秒
  learn: { warnAt: 2, aimAt: 3 }, // 同一扇窗露头第几次他开始记住、第几次他预先瞄着

  // 对手：招数和破绽。peek 节奏、红圈速度、锁定和开枪时间都在这里
  // still：别人都动只有他不动；tap：缩着时敲窗台；decoy：摆几个头盔假人；mover：被你盯住就换窗
  opponents: {
    patient: { name: '耐心型', tell: '别人都在动，只有他一动不动', hideMin: 2.0, hideMax: 2.4, peekSec: 3.0,
      seekSpeed: 2.5, heatRate: 0.1, lockSec: 0.8, quickDraw: 0.9, poseShift: 3, still: true },
    nervous: { name: '焦躁型', tell: '缩着的时候会敲窗台', hideMin: 1.0, hideMax: 1.8, peekSec: 1.6,
      seekSpeed: 3.4, heatRate: 0.14, lockSec: 0.65, quickDraw: 0.75, poseShift: 3, tap: true },
    sly: { name: '狡猾型', tell: '摆了头盔假人：缩头再起来时，假人不会挪', hideMin: 1.4, hideMax: 2.4, peekSec: 1.8,
      seekSpeed: 3, heatRate: 0.15, lockSec: 0.6, quickDraw: 0.7, poseShift: 2.5, decoy: 1 },
    mover: { name: '换位型', tell: '被你盯住就换窗，路过的窗帘会一扇扇动', hideMin: 1.4, hideMax: 2.2, peekSec: 2.0,
      seekSpeed: 3, heatRate: 0.15, lockSec: 0.65, quickDraw: 0.75, poseShift: 3, mover: true },
    boss: { name: '老枪', tell: '三条命，每挨一枪换一招', hideMin: 1.4, hideMax: 2.2, peekSec: 2.2,
      seekSpeed: 3.2, heatRate: 0.16, lockSec: 0.6, quickDraw: 0.7, poseShift: 3,
      phases: [{ still: true }, { mover: true, seekSpeed: 3.6 }, { decoy: 2, tap: true, seekSpeed: 4, fog: true }] },
  },

  // 地图条件
  conditions: {
    fog: { name: '大雾', thickSec: 5, clearSec: 2.5, heatMul: 0.3 }, // 浓雾时他也看不清你
    night: { name: '夜里', heatMul: 0.8 },
    pigeons: { name: '鸽群', flushHeat: 0.25, backSec: 9 },
  },

  // 掩护队友过街
  escort: { runSec: 2.2, hideSec: [2, 3.2], lockSec: 2.4, speed: 60 },

  // —— 局外：奖金 ——
  money: { perRound: 20, perStar: 10 },
};

module.exports = config;
