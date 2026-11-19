// 地图：每张是一组「画法参数」，scene.js 照着画。加新地图 = 在这里加一项。
// 0.7（Cc 定）：十二张地图。只学 CS 那类「环境类型」，名字、布局、长相都是自己的。
//
// sky：天空三段颜色      dots：网点颜色         far：远景颜色 + 样子
// sun：太阳/月亮         roof：屋顶画法         win：藏身位的样子（窗 / 拱 / 箭孔 / 射击孔 / 壁龛 / 弹孔 / 玻璃……）
// pal：楼的颜色（亮面、暗面）                   winDark：洞里的黑
// weather：天气          ground / front：地面和近处的掩体
// extras：额外的东西（晾衣绳、招牌、灯笼、旗子……）
// layout：楼怎么排（kind：blocks 一排楼 / hill 山坡 / terrace 台阶神庙 / wall 城墙加塔 / camp 营房加塔 / towers 高楼）
// changers：藏身位里缩头会变的东西   props：窗里像人头的误导物
// cover：这张图自带的遮挡（train 火车 / steam 蒸汽 / glare 玻璃反光 / smoke 烟雾弹 / sand 沙尘暴 / mist 水雾）
// bricked：多少藏身位是实心的（玻璃楼里就是反光的玻璃）
// art：有 Midjourney 背景图时填图的 id（见 bgslots.js），没有就代码画

const ALL_PROPS = ['plant', 'cat', 'lamp', 'mannequin', 'coat', 'cage'];

const THEMES = {
  // —— 十二张地图（按第一章出场顺序） ——
  desert: {
    name: '沙漠土楼镇',
    sky: ['#f9a03f', '#fbc96b', '#fde6b0'], dots: 'rgba(190,110,40,0.14)',
    far: { color: '#e3a868', kind: 'dunes' }, sun: { x: 0.35, y: 100, r: 40, color: '#fff6d8' },
    roof: 'dome', win: 'arch', winDark: '#2e1d1a',
    pal: [['#e0b07a', '#a87a4a'], ['#d49a6a', '#9a6a40'], ['#e8c690', '#b0905c']],
    weather: 'dust', ground: '#b88654', front: 'crates', extras: { bird: '#5a3a2a', beams: true },
    layout: { kind: 'blocks', bw: [110, 170], top: [200, 320], gap: [6, 20] },
    changers: ['rug', 'rug', 'lit'], props: ['jar', 'plant', 'cat', 'cage', 'coat'], cover: 'sand',
  },
  med: {
    name: '地中海山城',
    sky: ['#4fb3d9', '#9fd8e8', '#f3e7c9'], dots: 'rgba(40,120,170,0.11)',
    far: { color: '#8fae8a', kind: 'hills' }, sun: { x: 0.8, y: 80, r: 28, color: '#fffbe0' },
    roof: 'tile', win: 'square', winDark: '#2a2030',
    pal: [['#e8b04a', '#b07a2a'], ['#f2e4c4', '#c4b08a'], ['#e07a4a', '#a8502a'], ['#9cc4d8', '#6a94a8']],
    weather: 'none', ground: '#8a7a68', front: 'bags', extras: { bird: '#f4f1de', bell: true },
    layout: { kind: 'hill', bw: [96, 140], top: [130, 330], gap: [4, 12] },
    changers: ['shutter', 'shutter', 'lit'], props: ['plant', 'plant', 'cat', 'cage', 'lamp', 'coat'], cover: null,
  },
  station: {
    name: '雨夜货运站',
    sky: ['#1d2b53', '#2f4a7a', '#4d6a9a'], dots: 'rgba(160,190,255,0.08)',
    far: { color: '#26385f', kind: 'blocks' }, sun: null,
    roof: 'saw', win: 'arch', winDark: '#0f1424',
    pal: [['#8a5a4a', '#5e3a30'], ['#7a6f8f', '#4f4766'], ['#6a7a8a', '#445260']],
    weather: 'rain', ground: '#2a3047', front: 'rail', extras: { clock: true, lampLit: '#ffe9a8', signal: true },
    layout: { kind: 'blocks', bw: [170, 250], top: [170, 290], gap: [14, 30] },
    changers: ['lit', 'lit', 'curtain'], props: ['lamp', 'coat', 'cage', 'cat', 'jar'], cover: 'train',
  },
  port: {
    name: '黄昏码头',
    sky: ['#6a4c93', '#f28482', '#f6bd60'], dots: 'rgba(120,40,90,0.14)',
    far: { color: '#8c5a85', kind: 'cranes' }, sun: { x: 0.55, y: 210, r: 44, color: '#ffcf70' },
    roof: 'container', win: 'door', winDark: '#1e1426',
    pal: [['#e63946', '#9d2730'], ['#2a9d8f', '#1d6d63'], ['#f4a261', '#b06a32'], ['#457b9d', '#2c5470']],
    weather: 'none', ground: '#4a3b4f', front: 'crates', extras: { bird: '#f4f1de', hook: true },
    layout: { kind: 'blocks', bw: [120, 200], top: [150, 300], gap: [6, 20] },
    changers: ['boxdoor', 'boxdoor', 'lit'], props: ['jar', 'coat', 'lamp', 'cat', 'cage'], cover: null,
  },
  oldtown: {
    name: '老城',
    sky: ['#ff9f6b', '#f6c28b', '#f2d8a7'], dots: 'rgba(180,70,60,0.13)',
    far: { color: '#c98a8f', kind: 'blocks' }, sun: { x: 0.7, y: 120, r: 34, color: '#fff1c9' },
    roof: 'jagged', win: 'rect', winDark: '#241a2e',
    pal: [['#c9705a', '#8e4a3d'], ['#d9a05b', '#9b6a35'], ['#7f9c8a', '#4f6b5b'], ['#b48aa8', '#7a5672']],
    weather: 'none', ground: '#6b5a52', front: 'bags', extras: { laundry: true, bird: '#d6d3e0' },
    changers: ['curtain', 'curtain', 'lit'], props: ALL_PROPS, cover: null,
    art: 'oldtown', // Midjourney 城市图（第五关）。图没到就代码画
  },
  farm: {
    name: '山间农场',
    sky: ['#f6b05a', '#f9d48a', '#fbe9c0'], dots: 'rgba(180,110,50,0.12)',
    far: { color: '#9a8fb0', kind: 'mountains' }, sun: { x: 0.2, y: 110, r: 36, color: '#fff3c8' },
    roof: 'gable', win: 'loft', winDark: '#2a1a14',
    pal: [['#b8433a', '#7e2a24'], ['#a8743f', '#744e28'], ['#8a5a3a', '#5e3c26'], ['#b5b0a8', '#7e7a72']],
    weather: 'none', ground: '#8a6a44', front: 'fence', extras: { bird: '#3a2a20', vane: true },
    layout: { kind: 'blocks', bw: [130, 200], top: [170, 290], gap: [10, 24] },
    changers: ['shutter', 'hay', 'lit'], props: ['jar', 'cat', 'coat', 'plant', 'lamp'], cover: null,
  },
  temple: {
    name: '丛林神庙',
    sky: ['#6fbf8a', '#b8e0a0', '#f4f0c0'], dots: 'rgba(40,110,60,0.12)',
    far: { color: '#3f7a4f', kind: 'jungle' }, sun: { x: 0.6, y: 70, r: 30, color: '#fffbd0' },
    roof: 'none', win: 'niche', winDark: '#1e2418',
    pal: [['#b0aa8a', '#767058'], ['#a2a286', '#6a6c54'], ['#9aa08a', '#626a58']],
    weather: 'none', ground: '#6a6450', front: 'bush', extras: { bird: '#f4f1de', vines: true, falls: true },
    layout: { kind: 'terrace' },
    changers: ['vine', 'vine', 'flower'], props: ['bust', 'bust', 'jar', 'plant'], cover: 'mist',
  },
  castle: {
    name: '古堡石墙',
    sky: ['#3d2c5c', '#7a4f7a', '#e08a6a'], dots: 'rgba(255,150,120,0.09)',
    far: { color: '#4a3a5a', kind: 'hills' }, sun: { x: 0.25, y: 90, r: 26, color: '#ffe0c0' },
    roof: 'crenel', win: 'slit', winDark: '#16121c',
    pal: [['#9a96a0', '#66626e'], ['#8a8690', '#5a5662'], ['#a49a8e', '#6e665c']],
    weather: 'none', ground: '#4a4038', front: 'bags', extras: { flag: true, lampLit: '#ffb860' },
    layout: { kind: 'wall' },
    changers: ['torch', 'torch', 'lit'], props: ['bust', 'jar', 'coat', 'cage'], cover: null,
  },
  plant: {
    name: '冷却塔电厂',
    sky: ['#b8c0c8', '#d4d8dc', '#eceef0'], dots: 'rgba(80,90,100,0.1)',
    far: { color: '#8c949c', kind: 'towers' }, sun: null,
    roof: 'pipes', win: 'square', winDark: '#20242c',
    pal: [['#a8a8a0', '#78786f'], ['#c0b89a', '#8a8268'], ['#9aa4a8', '#6a7478']],
    weather: 'none', ground: '#7a7a74', front: 'crates', extras: { warn: true },
    layout: { kind: 'blocks', bw: [170, 250], top: [190, 290], gap: [12, 26] },
    changers: ['warn', 'warn', 'lit'], props: ['lamp', 'coat', 'jar', 'cage'], cover: 'steam',
  },
  snow: {
    name: '雪原军营',
    sky: ['#8fb8e0', '#c4dcf0', '#eef4fa'], dots: 'rgba(60,100,150,0.1)',
    far: { color: '#6f8aa0', kind: 'pines' }, sun: { x: 0.8, y: 100, r: 24, color: '#ffffff' },
    roof: 'gable', win: 'hslit', winDark: '#1a2030',
    pal: [['#7a6a5a', '#54483c'], ['#8a9098', '#5e646c'], ['#6a7a6a', '#485448']],
    weather: 'snow', ground: '#e8eef2', front: 'snowbank', extras: { snowCap: true, flag: true, chimney: true, bird: '#2b2438' },
    layout: { kind: 'camp' },
    changers: ['lit', 'frost'], props: ['coat', 'lamp', 'jar', 'cage'], cover: null,
  },
  glass: {
    name: '玻璃写字楼',
    sky: ['#3a8fd9', '#8cc4ef', '#dceefa'], dots: 'rgba(40,110,190,0.09)',
    far: { color: '#a8c8e0', kind: 'blocks' }, sun: { x: 0.15, y: 70, r: 26, color: '#ffffff' },
    roof: 'flat', win: 'glass', winDark: '#1c2638',
    pal: [['#9cc8e8', '#6a9cc4'], ['#a8d0e0', '#78a8bc'], ['#b4c4dc', '#8494b0']],
    weather: 'none', ground: '#9a9aa4', front: 'crates', extras: { antenna: true, gondola: true },
    layout: { kind: 'towers' }, bricked: 0.42,
    changers: ['blind', 'blind', 'lit'], props: ['plant', 'lamp', 'mannequin', 'coat'], cover: 'glare',
  },
  ruins: {
    name: '战地废墟',
    sky: ['#8a7a6a', '#c49a6a', '#e8c49a'], dots: 'rgba(90,60,40,0.13)',
    far: { color: '#7a6a5e', kind: 'smoke' }, sun: { x: 0.7, y: 110, r: 30, color: '#ffd8a0' },
    roof: 'broken', win: 'hole', winDark: '#1e1814',
    pal: [['#9a948a', '#6a645a'], ['#a89a86', '#786a56'], ['#8a8a84', '#5a5a54']],
    weather: 'dust', ground: '#6a5e52', front: 'bags', extras: { rebar: true },
    layout: { kind: 'blocks', bw: [110, 190], top: [160, 300], gap: [14, 34] }, bricked: 0.18,
    changers: ['fire', 'rag', 'rag'], props: ['jar', 'coat', 'mannequin', 'plant'], cover: 'smoke',
  },

  // —— 城市里的其他街区：先收起来，到「城市赛」一章再用 ——
  market: {
    name: '菜市场屋顶',
    sky: ['#5cc8ff', '#a6e3ff', '#e8f7ff'], dots: 'rgba(40,120,180,0.12)',
    far: { color: '#8fc3d9', kind: 'blocks' }, sun: { x: 0.25, y: 90, r: 30, color: '#fff7b0' },
    roof: 'flat', win: 'rect', winDark: '#22283a',
    pal: [['#f4a259', '#bc6c25'], ['#e9c46a', '#a7852f'], ['#e76f51', '#a3412a'], ['#8ab17d', '#5a7f4c']],
    weather: 'none', ground: '#7d6b5d', front: 'crates', extras: { awning: ['#e63946', '#f1faee'], sign: ['#ffd23f', '#e63946'], bird: '#f4f1de' },
  },
  tanks: {
    name: '水塔天台',
    sky: ['#3ec1c9', '#9be3c9', '#f9f5c0'], dots: 'rgba(30,120,110,0.12)',
    far: { color: '#7fbcb3', kind: 'blocks' }, sun: null,
    roof: 'tank', win: 'rect', winDark: '#1d2430',
    pal: [['#a8a6b8', '#6f6c85'], ['#c9b79c', '#8a7a62'], ['#9cb4c9', '#5f7a94']],
    weather: 'none', ground: '#5e6470', front: 'bags', extras: { antenna: true, bird: '#e8e6f0' },
  },
  factory: {
    name: '雪地工厂',
    sky: ['#c9d6df', '#e2e8ec', '#f4f6f8'], dots: 'rgba(90,110,130,0.1)',
    far: { color: '#a9b8c4', kind: 'chimneys' }, sun: { x: 0.8, y: 110, r: 26, color: '#ffffff' },
    roof: 'saw', win: 'rect', winDark: '#252a36',
    pal: [['#8d6e63', '#5d4037'], ['#90a4ae', '#607d8b'], ['#a1887f', '#6d4c41']],
    weather: 'snow', ground: '#e8eef2', front: 'snowbank', extras: { snowCap: true, bird: '#2b2438' },
  },
  neon: {
    name: '霓虹街',
    sky: ['#120a2e', '#2d1452', '#5a1f6e'], dots: 'rgba(255,80,200,0.08)',
    far: { color: '#26164a', kind: 'blocks' }, sun: { x: 0.2, y: 80, r: 18, color: '#f3e9ff' },
    roof: 'jagged', win: 'rect', winDark: '#0c0818',
    pal: [['#3b2a5c', '#261a40'], ['#2a3a5c', '#1a2640'], ['#4a2a4c', '#301a32']],
    weather: 'none', ground: '#1a1030', front: 'bags', extras: { neon: ['#ff4fd8', '#3ef0ff', '#ffe14f'], lampLit: '#ffd9f4' },
  },
  eaves: {
    name: '古城夜灯',
    sky: ['#3a1c3a', '#8a2f3a', '#e0704a'], dots: 'rgba(255,140,90,0.1)',
    far: { color: '#5a2a3e', kind: 'pagodas' }, sun: { x: 0.75, y: 95, r: 30, color: '#ffd9a0' },
    roof: 'eave', win: 'lattice', winDark: '#1f1016',
    pal: [['#b23a48', '#7a2632'], ['#c9a36a', '#8f7040'], ['#7a5a48', '#523a2e']],
    weather: 'none', ground: '#3e2430', front: 'bags', extras: { lantern: true, bird: '#f4e1c8' },
  },
};

// 十二张地图（擂台、每日挑战从这里抽）
const MAP_ORDER = ['desert', 'med', 'station', 'port', 'oldtown', 'farm', 'temple', 'castle', 'plant', 'snow', 'glass', 'ruins'];
const ORDER = Object.keys(THEMES);

const DEFAULTS = {
  layout: { kind: 'blocks', bw: [130, 210], top: [130, 270], gap: [18, 44] },
  changers: ['curtain', 'curtain', 'lit'],
  props: ALL_PROPS,
  cover: null,
  bricked: 0.12,
};

function get(id) {
  const th = THEMES[id] || THEMES.oldtown;
  if (!th._filled) {
    Object.keys(DEFAULTS).forEach((k) => th[k] === undefined && (th[k] = DEFAULTS[k]));
    th.id = THEMES[id] ? id : 'oldtown';
    th._filled = true;
  }
  return th;
}

module.exports = { THEMES, ORDER, MAP_ORDER, get };
