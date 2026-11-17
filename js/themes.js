// 九张背景：一场比赛三个对手，每个对手一张。
// 只是一组「画法参数」，scene.js 照着画。加新地图 = 在这里加一项。
//
// sky：天空三段颜色      dots：网点颜色         far：远景颜色 + 样子
// sun：太阳/月亮         roof：屋顶画法         win：窗户画法
// pal：楼的颜色（亮面、暗面）                   winDark：窗里的黑
// weather：天气          ground / front：地面和近处的掩体
// extras：额外的东西（晾衣绳、招牌、灯笼……）

const THEMES = {
  oldtown: {
    name: '晨雾老城',
    sky: ['#ff9f6b', '#f6c28b', '#f2d8a7'], dots: 'rgba(180,70,60,0.13)',
    far: { color: '#c98a8f', kind: 'blocks' }, sun: { x: 0.7, y: 120, r: 34, color: '#fff1c9' },
    roof: 'jagged', win: 'rect', winDark: '#241a2e',
    pal: [['#c9705a', '#8e4a3d'], ['#d9a05b', '#9b6a35'], ['#7f9c8a', '#4f6b5b'], ['#b48aa8', '#7a5672']],
    weather: 'none', ground: '#6b5a52', front: 'bags', extras: { laundry: true, bird: '#d6d3e0' },
  },
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
  port: {
    name: '黄昏港口',
    sky: ['#6a4c93', '#f28482', '#f6bd60'], dots: 'rgba(120,40,90,0.14)',
    far: { color: '#8c5a85', kind: 'cranes' }, sun: { x: 0.55, y: 210, r: 44, color: '#ffcf70' },
    roof: 'container', win: 'slit', winDark: '#1e1426',
    pal: [['#e63946', '#9d2730'], ['#2a9d8f', '#1d6d63'], ['#f4a261', '#b06a32'], ['#457b9d', '#2c5470']],
    weather: 'none', ground: '#4a3b4f', front: 'crates', extras: { bird: '#f4f1de' },
  },
  station: {
    name: '雨夜车站',
    sky: ['#1d2b53', '#2f4a7a', '#4d6a9a'], dots: 'rgba(160,190,255,0.08)',
    far: { color: '#26385f', kind: 'blocks' }, sun: null,
    roof: 'jagged', win: 'arch', winDark: '#0f1424',
    pal: [['#5d6f8f', '#3c4a66'], ['#7a6f8f', '#4f4766'], ['#6a8a8a', '#445e5e']],
    weather: 'rain', ground: '#2a3047', front: 'rail', extras: { clock: true, lampLit: '#ffe9a8' },
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
  desert: {
    name: '沙漠小镇',
    sky: ['#f9a03f', '#fbc96b', '#fde6b0'], dots: 'rgba(190,110,40,0.14)',
    far: { color: '#e3a868', kind: 'dunes' }, sun: { x: 0.35, y: 100, r: 40, color: '#fff6d8' },
    roof: 'dome', win: 'arch', winDark: '#2e1d1a',
    pal: [['#e0b07a', '#a87a4a'], ['#d49a6a', '#9a6a40'], ['#e8c690', '#b0905c']],
    weather: 'dust', ground: '#b88654', front: 'crates', extras: { bird: '#5a3a2a' },
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

const ORDER = Object.keys(THEMES);

function get(id) {
  return THEMES[id] || THEMES.oldtown;
}

module.exports = { THEMES, ORDER, get };
