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
        teach: [['对面有两个人影，只有一个是狙击手', '他探头找你的时候，镜片会反光'], ['左下点一下 = 缩一下头再起来', '画面会变一处：找出他']],
        stars: ['noMiss', 'noLock'],
        rounds: [{ opp: 'patient', theme: 'oldtown', figures: 2, goal: 'kill', bullets: 3, time: 90, hitR: 10 }],
      },
      {
        id: 'c2', name: '谁在闪',
        teach: [['人多了：四个人影', '下面红圈靠近你时，对面谁在闪，谁就是他'], ['路人会动来动去', '耐心型一动不动']],
        stars: ['noMiss', 'fast'], fastSec: 50,
        rounds: [{ opp: 'patient', theme: 'market', figures: 4, goal: 'kill', bullets: 3, time: 80, hitR: 10 }],
      },
      {
        id: 'c3', name: '换个窗',
        teach: [['同一扇窗露头三次，他就记住了', '点下面那栋楼的另一扇窗 = 爬过去'], ['焦躁型：缩着的时候会敲窗台', '']],
        stars: ['noLock', 'noRescue'],
        rounds: [
          { opp: 'nervous', theme: 'tanks', figures: 4, goal: 'kill', bullets: 3, time: 75, hitR: 9.5 },
          { opp: 'nervous', theme: 'tanks', figures: 4, goal: 'kill', bullets: 3, time: 75, hitR: 9.5 },
        ],
      },
      {
        id: 'c4', name: '起雾了',
        teach: [['大雾一阵一阵地散', '浓雾时他也看不清你：趁雾大多看几眼'], ['', '']],
        stars: ['noMiss', 'noLock'],
        rounds: [
          { opp: 'patient', theme: 'port', figures: 4, cond: 'fog', goal: 'kill', bullets: 3, time: 80, hitR: 9 },
          { opp: 'nervous', theme: 'port', figures: 5, cond: 'fog', goal: 'kill', bullets: 3, time: 80, hitR: 9 },
        ],
      },
      {
        id: 'c5', name: '假人',
        teach: [['狡猾型挑了个头盔当假人', '缩头再起来时，假人不会挪；打中它算打错'], ['打错人扣 8 秒', '']],
        stars: ['noMiss', 'fast'], fastSec: 110,
        rounds: [
          { opp: 'sly', theme: 'station', figures: 4, goal: 'kill', bullets: 3, time: 75, hitR: 8.5 },
          { opp: 'sly', theme: 'station', figures: 5, goal: 'kill', bullets: 3, time: 75, hitR: 8.5 },
        ],
      },
      {
        id: 'c6', name: '掩护小雨',
        teach: [['小雨要从街上跑过去', '他瞄着小雨时就不在找你：趁这时候打他'], ['小雨被锁定满了就输', '']],
        stars: ['noLock', 'noRescue'],
        rounds: [{ opp: 'nervous', theme: 'factory', figures: 4, goal: 'escort', bullets: 3, time: 90, hitR: 8.5 }],
      },
      {
        id: 'c7', name: '鸽子',
        teach: [['屋顶的鸽子一受惊就飞', '他探头时鸽子飞了：他就在那附近'], ['换位型：被你盯住就换窗', '路过的窗帘会一扇扇动']],
        stars: ['noMiss', 'noLock'],
        rounds: [
          { opp: 'mover', theme: 'desert', figures: 4, cond: 'pigeons', goal: 'kill', bullets: 3, time: 80, hitR: 8 },
          { opp: 'mover', theme: 'desert', figures: 5, cond: 'pigeons', goal: 'kill', bullets: 3, time: 80, hitR: 8 },
        ],
      },
      {
        id: 'c8', name: '一枪定胜负',
        teach: [['夜里只有亮灯的窗看得清', '他不会站在亮灯的窗里：看反光'], ['这一关每回合只有一发子弹', '']],
        stars: ['noLock', 'fast'], fastSec: 100,
        rounds: [
          { opp: 'patient', theme: 'neon', figures: 4, cond: 'night', goal: 'kill', bullets: 1, time: 80, hitR: 8 },
          { opp: 'sly', theme: 'neon', figures: 5, cond: 'night', goal: 'kill', bullets: 1, time: 80, hitR: 8 },
        ],
      },
      {
        id: 'c9', name: 'Boss · 老枪', boss: true, needStars: 10,
        bossIntro: ['网吧里没人赢过他', '三条命：每挨一枪，他换一招'],
        teach: [['第一段：一动不动', '第二段：被你盯住就换窗'], ['第三段：摆两个假人，还起雾', '每一段子弹重新给三发']],
        stars: ['noRescue', 'noLock'],
        rounds: [{ opp: 'boss', theme: 'eaves', figures: 5, goal: 'kill', bullets: 3, time: 120, hitR: 8 }],
      },
    ],
  },
];

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

module.exports = { CHAPTERS, LEVELS, starText };
