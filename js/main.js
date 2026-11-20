// 《瓦西里》原型主程序：开场 → 三场比赛（每场三个对手）→ 网吧揭晓 → 战队经营。
// 所有画面都画在一张 canvas 上（微信小游戏没有 HTML 按钮）。
//
// 流程（G.mode）：
//   title 开场 → story 第几场 → intro 对手登场 → play 对狙 → hit 爆头
//     → move 换点位（下一个对手）…… 三个打完 → clear 这场拿下 → pick 三选一卡 → 下一场
//     → 三场打完 → reveal 网吧揭晓（第一次）/ champ 冠军（之后）→ team 战队
//   被打死：dead → ad 广告 → rescue 女队友拉起来 → play；拉人次数用完 → fail
const platform = require('./platform.js');
const config = require('./config.js');
const scene = require('./scene.js');
const themes = require('./themes.js');
const team = require('./team.js');
const cut = require('./cutscene.js');
const { createDuel } = require('./duel.js');
const { createMission, briefText } = require('./mission.js');
const people = require('./people.js');
const classic = require('./classic.js');
const { clamp, lerp, easeOut, roundRect, comicText, starburst, rng } = require('./util.js');

const INK = '#1b1530';
const DESIGN_W = 375;

const touches = {};
const P = platform.setup(onTouch);
const scale = P.width / DESIGN_W;
const L = { W: DESIGN_W, H: P.height / scale };
const D = Math.min(L.W * 0.94, L.H * 0.56);
const scopeC = { x: L.W / 2, y: 70 + D / 2 };
// 镜子下面：你这栋楼的小图（他的红圈在上面找你）
const panelR = { x: L.W / 2 - 150, y: scopeC.y + D / 2 + 12, w: 300, h: Math.min(84, Math.max(60, L.H - scopeC.y - D / 2 - 160)) };
const btnY = Math.max(panelR.y + panelR.h + 56, Math.min(L.H - 70, scopeC.y + D / 2 + (L.H - scopeC.y - D / 2) / 2 + 30));
const eyeBtn = { x: L.W * 0.24, y: btnY, r: 38 };
const trigBtn = { x: L.W * 0.73, y: btnY, r: 50 };
const LV = require('./levels.js');
// 0.8 全景：整张场景缩小放在镜子的位置，点一下 = 放大到那里
const WIDE = { x: 0, w: L.W, h: (L.W * 600) / 860 };
WIDE.y = scopeC.y - WIDE.h / 2;
const zoomBtn = { x: scopeC.x + D / 2 - 26, y: scopeC.y + D / 2 - 18, r: 24 };
const TRIGGER_FINE = 0.4; // 按着扳机滑动时，手指走 1 点、准星走 0.4 点

const G = {
  mode: 'title',
  modeT: 0,
  t: 0,
  level: null, // 正在打的关（levels.js）
  roundIdx: 0,
  attempt: 0,
  duel: null,
  results: [],
  card: null, // 关前带的临场卡
  pickCard: null, // 带卡页上选中的
  mods: null,
  rescuesLeft: config.rescuesPerLevel,
  ammoAdsLeft: config.ammoAdsPerLevel,
  stats: null, // 这一关：浪费几发、被瞄准过没有、拉人几次、用时
  adFor: 'rescue', // 广告是为了：rescue 拉人 / ammo 扔子弹
  failReason: '',
  resultInfo: null,
  buttons: [],
  missFlash: 0,
  shake: 0,
  slow: 0, // 慢动作还剩几秒（擦身而过）
  bossHitT: -1,
  toast: null,
  say: null,
  say2: null,
  sfxT: {}, // 每种连续音效上一次响的时间
  metrics: { roundSec: [], retrySec: [] }, // 量一局几秒、死到重开几秒
  failAt: 0,
  near: '',
  seedBase: Math.floor(Math.random() * 100000),
  title: null, // 开场背景
};

const FAIL_TEXT = { dead: '他先开枪了', timeout: '时间到了', dry: '子弹打光了', mateDown: '小雨被打中了', escaped: '目标跑了', boom: '炸弹炸了' };

function setMode(m) {
  G.mode = m;
  G.modeT = 0;
}

function toast(text) {
  G.toast = { text, t: 0 };
}

function sfx(name, vol) {
  platform.sound(name, vol);
}

// 一种连续的声音（滴滴、心跳）：隔 gap 秒才响一次
function sfxEvery(name, gap, vol) {
  const last = G.sfxT[name] || -99;
  if (G.t - last >= gap) {
    G.sfxT[name] = G.t;
    sfx(name, vol);
  }
}

function levelUnlocked(lv) {
  const S = team.state();
  if (lv.legacy || lv.index === 0) return true;
  const prev = LV.LEVELS[lv.index - 1];
  if (S.cleared.indexOf(prev.id) < 0) return false;
  if (lv.needStars && team.totalStars() < lv.needStars) return false;
  return true;
}

function startRound() {
  const R = G.level.rounds[G.roundIdx];
  G.zoom = false; // 目标关先看全景
  if (R.mission) {
    G.duel = createMission({ seed: G.seedBase + G.roundIdx * 37 + G.attempt * 7919, config, scopeD: D, round: R, levelIndex: G.level.index, mods: G.mods });
    return;
  }
  G.duel = createDuel({
    seed: G.seedBase + G.roundIdx * 37 + (G.daily ? 0 : G.attempt * 7919), // 每日挑战重来还是同一局
    config,
    scopeD: D,
    round: G.level.rounds[G.roundIdx],
    levelIndex: G.level.index,
    mods: G.mods,
  });
}

function openLevel(lv) {
  if (!levelUnlocked(lv)) {
    toast(lv.needStars && team.totalStars() < lv.needStars ? '要攒够 ' + lv.needStars + ' 颗星' : '先过前一关');
    return;
  }
  G.level = lv;
  if (lv.city) {
    // 第一座城：不带卡，直接开打（枪的升级在地图页）
    G.pickCard = null;
    startLevel();
    return;
  }
  const cards = team.unlockedCards();
  if (!G.pickCard || !cards.some((c) => c.id === G.pickCard)) G.pickCard = cards.length ? cards[0].id : null;
  setMode('loadout');
}

function startLevel() {
  G.arena = null;
  G.daily = null;
  G.card = G.level.city ? null : G.pickCard;
  G.mods = G.level.city ? team.gunMods() : team.mods(G.card ? [G.card] : []);
  G.rescuesLeft = config.rescuesPerLevel + G.mods.rescueAdd;
  G.ammoAdsLeft = config.ammoAdsPerLevel;
  G.seedBase = Math.floor(Math.random() * 100000); // 以后每日挑战改成固定 seed
  G.roundIdx = 0;
  G.attempt = 0;
  G.results = [];
  G.stats = { wasted: 0, locked: false, rescued: 0, sec: 0, heads: 0, wrong: 0 };
  startRound();
  const S = team.state();
  const mission = !!G.level.rounds[0].mission;
  if (G.level.boss && S.cleared.indexOf(G.level.id) < 0) setMode('bossIntro');
  else if (G.level.teach && !team.taught(G.level.id)) setMode('teach');
  else setMode(mission ? 'brief' : 'intro');
}

// 输了点一下：直接回到这个回合开打（不放说明页、不放回合卡）
function retryRound() {
  if (G.duel) addStats(G.duel);
  G.metrics.retrySec.push(+(G.t - G.failAt).toFixed(2));
  G.attempt += 1;
  startRound();
  setMode('play');
}

function goMap() {
  G.arena = null;
  G.daily = null;
  setMode('map');
}

// —— 擂台：一个接一个打，每赢一个叠一个加难，记最高连胜 ——
function startArena() {
  G.arena = { streak: 0, mods: [], rand: rng(Math.floor(Math.random() * 1e9)), newMod: null };
  G.daily = null;
  G.card = null;
  G.mods = team.mods([]);
  G.rescuesLeft = config.rescuesPerLevel + G.mods.rescueAdd;
  G.ammoAdsLeft = config.ammoAdsPerLevel;
  G.stats = { wasted: 0, locked: false, rescued: 0, sec: 0 };
  nextArenaRound();
}

function nextArenaRound() {
  const A = G.arena;
  G.level = { id: 'arena', name: '擂台', no: 0, index: 8, stars: [], rounds: [LV.arenaRound(A.mods, A.rand)] };
  G.roundIdx = 0;
  G.attempt = 0;
  G.seedBase = Math.floor(A.rand() * 1e6);
  startRound();
  setMode('intro');
}

function arenaWin() {
  const A = G.arena;
  A.streak += 1;
  team.earn('perRound');
  const m = LV.pickArenaMod(A.mods, A.rand);
  A.newMod = m;
  if (m) A.mods.push(m.id);
  A.best = team.recordArena(A.streak);
  sfx('star');
  setMode('arenaNext');
}

function endArena() {
  if (G.arena) team.recordArena(G.arena.streak);
  G.arena = null;
  goTitle();
}

// —— 每日挑战：今天所有人同一局，三个回合，比用时 ——
function dayKey() {
  const n = new Date();
  return n.getFullYear() * 10000 + (n.getMonth() + 1) * 100 + n.getDate();
}

function startDaily() {
  const day = dayKey();
  G.arena = null;
  G.daily = { day, sec: 0 };
  G.card = null;
  G.mods = team.mods([]);
  G.rescuesLeft = 0; // 每日挑战比真本事：不拉人
  G.ammoAdsLeft = 0;
  G.stats = { wasted: 0, locked: false, rescued: 0, sec: 0 };
  G.level = { id: 'daily', name: '每日挑战', no: 0, index: 8, stars: [], rounds: LV.dailyRounds(day, rng) };
  G.roundIdx = 0;
  G.attempt = 0;
  G.seedBase = day;
  startRound();
  setMode('intro');
}

function finishDaily() {
  const sec = G.stats.sec;
  G.daily.sec = sec;
  G.daily.best = team.recordDaily(G.daily.day, sec);
  team.earn('perRound', 3);
  sfx('win');
  setMode('dailyDone');
}

function startClassic() {
  G.classic = classic.createClassic(Math.floor(Math.random() * 99999), D, config);
  setMode('classic');
}

function goTitle() {
  const ids = themes.MAP_ORDER;
  const id = ids[Math.floor(Math.random() * ids.length)];
  G.title = { sc: scene.build(Math.floor(Math.random() * 99999), { poseShift: 3, contrast: 0.2 }, D, id) };
  setMode('title');
}

// —— 输入 ——
function inCircle(b, x, y) {
  return Math.hypot(x - b.x, y - b.y) <= b.r + 8;
}

const TAP_TO_SKIP = { arenaNext: 0.5, bossIntro: 0.5, teach: 0.6, intro: 0.3, brief: 0.5, reveal: 1.0, move: 0.6, hit: 0.5, ammoGift: 0.4 };

// 下面那栋楼的小图上点了哪扇窗
function panelCell(x, y) {
  const p = panelR;
  const d = G.duel;
  if (x < p.x || x > p.x + p.w || y < p.y || y > p.y + p.h) return null;
  const cw = (p.w - 20) / d.COLS;
  const ch = (p.h - 22) / d.ROWS;
  const c = Math.floor((x - p.x - 10) / cw);
  const r = Math.floor((y - p.y - 16) / ch);
  if (c < 0 || c >= d.COLS || r < 0 || r >= d.ROWS) return null;
  return { c, r };
}

function onTouch(type, id, sx, sy) {
  const x = sx / scale;
  const y = sy / scale;
  if (type === 'down') {
    const hitBtn = G.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hitBtn) {
      touches[id] = { role: 'ui' };
      hitBtn.fn();
      return;
    }
    const skip = TAP_TO_SKIP[G.mode];
    if (skip !== undefined) {
      if (G.modeT > skip) skipAhead();
      touches[id] = { role: 'ui' };
      return;
    }
    if (G.mode === 'classic') {
      const c = G.classic;
      if (c.state !== 'play') return;
      if (inCircle(eyeBtn, x, y)) { c.toggle(); touches[id] = { role: 'ui' }; }
      else if (inCircle(trigBtn, x, y)) { c.fire(); sfx(c.wide ? 'wrong' : 'shot'); platform.vibrate(true); touches[id] = { role: 'ui' }; }
      else if (Math.hypot(x - scopeC.x, y - scopeC.y) < D / 2 + 30) touches[id] = { role: 'cpan', x, y };
      return;
    }
    if (G.mode !== 'play') return;
    if (G.duel.kind === 'mission') {
      const d = G.duel;
      // 全景：点一下 = 放大到那里
      if (!G.zoom) {
        if (y >= WIDE.y && y <= WIDE.y + WIDE.h) {
          const k = 860 / WIDE.w;
          d.cam.x = (x - WIDE.x) * k;
          d.cam.y = (y - WIDE.y) * k;
          d.pan(0, 0);
          G.zoom = true;
          sfx('duck', 0.3);
          touches[id] = { role: 'ui' };
        } else if (inCircle(trigBtn, x, y)) toast('先点全景里的一处，放大再开枪');
        return;
      }
      if (inCircle(zoomBtn, x, y)) {
        G.zoom = false;
        d.holding = false;
        touches[id] = { role: 'ui' };
        return;
      }
      if (d.canDuck && inCircle(eyeBtn, x, y)) {
        touches[id] = { role: 'duck' };
        d.duckDown();
      } else if (inCircle(trigBtn, x, y)) {
        touches[id] = { role: 'trigger', x, y };
        d.triggerDown();
      } else if (Math.hypot(x - scopeC.x, y - scopeC.y) < D / 2 + 30) touches[id] = { role: 'pan', x, y };
      return;
    }
    const cell = panelCell(x, y);
    if (cell) {
      touches[id] = { role: 'ui' };
      if (!G.duel.moveWindow(cell.c, cell.r) && G.duel.moving <= 0 && cell.c === G.duel.me.c && cell.r === G.duel.me.r) toast('点别的窗 = 爬过去');
      return;
    }
    if (inCircle(eyeBtn, x, y)) {
      touches[id] = { role: 'duck' };
      G.duel.duckDown();
    } else if (inCircle(trigBtn, x, y)) {
      touches[id] = { role: 'trigger', x, y };
      G.duel.triggerDown();
    } else if (Math.hypot(x - scopeC.x, y - scopeC.y) < D / 2 + 30) {
      touches[id] = { role: 'pan', x, y };
    }
  } else if (type === 'move') {
    const t = touches[id];
    if (t && t.role === 'cpan' && G.mode === 'classic') {
      G.classic.pan(x - t.x, y - t.y);
      t.x = x;
      t.y = y;
    }
    if (t && t.role === 'pan' && G.mode === 'play') {
      G.duel.pan(x - t.x, y - t.y);
      t.x = x;
      t.y = y;
    }
    // 按着扳机滑动 = 微调准星（一根手指：按住稳住、滑一点对准、松手开枪）。手指往哪滑，准星往哪走，走得比拖镜子慢
    if (t && t.role === 'trigger' && G.mode === 'play' && G.duel.holding) {
      G.duel.pan(-(x - t.x) * TRIGGER_FINE, -(y - t.y) * TRIGGER_FINE);
      t.x = x;
      t.y = y;
    }
  } else {
    const t = touches[id];
    delete touches[id];
    if (t && t.role === 'duck' && G.duel) G.duel.duckUp();
    if (t && t.role === 'trigger' && G.mode === 'play') {
      const res = G.duel.triggerUp();
      if (res) {
        platform.vibrate(true);
        G.lastShot = res;
        if (!res.hit) G.missFlash = 1.0;
      }
    }
  }
}

// 点一下跳过过场
function skipAhead() {
  const m = G.mode;
  if (m === 'bossIntro') setMode('teach');
  else if (m === 'teach') { team.markTaught(G.level.id); setMode(G.duel.kind === 'mission' ? 'brief' : 'intro'); }
  else if (m === 'intro' || m === 'brief') setMode('play');
  else if (m === 'move') setMode('intro');
  else if (m === 'hit') afterHit();
  else if (m === 'ammoGift') giveAmmo();
  else if (m === 'arenaNext') nextArenaRound();
  else if (m === 'reveal' && G.modeT < cut.REVEAL_SEC - 1.2) G.modeT = cut.REVEAL_SEC - 1.2;
}

// —— 规则推进 ——
function addStats(d) {
  G.stats.heads += d.headshots || 0;
  G.stats.wrong += d.wrong || 0;
  G.stats.wasted += d.wasted;
  G.stats.locked = G.stats.locked || d.lockedOnce;
  G.stats.sec += d.t;
}

function afterHit() {
  const d = G.duel;
  addStats(d);
  G.metrics.roundSec.push(Math.round(d.t));
  G.results.push(d.result());
  G.attempt = 0;
  if (G.arena) {
    arenaWin();
    return;
  }
  if (G.roundIdx + 1 < G.level.rounds.length) {
    G.roundIdx += 1;
    startRound(); // 下一个点位先建好，换位置动画用它的天色
    setMode('move');
  } else if (G.daily) finishDaily();
  else finishLevel();
}

function finishLevel() {
  const lv = G.level;
  const st = G.stats;
  const check = {
    noMiss: st.wasted === 0,
    noLock: !st.locked,
    noRescue: st.rescued === 0,
    fast: st.sec <= (lv.fastSec || 999),
    head: st.heads > 0,
    noWrong: st.wrong === 0,
  };
  const conds = lv.stars.map((k) => check[k]);
  const stars = 1 + conds.filter(Boolean).length;
  const rec = team.recordLevel(lv.id, stars);
  const money = team.earn('perRound', lv.rounds.length) + team.earn('perStar', rec.newStars) + team.earn('perHead', st.heads);
  const S = team.state();
  const reveal = lv.boss && !S.revealed;
  if (reveal) team.reveal();
  G.resultInfo = { stars, conds, first: rec.first, money, sec: st.sec, reveal, heads: st.heads, cardUnlocked: rec.first && !lv.city ? team.unlockedCards().slice(-1)[0] : null };
  sfx('win');
  setMode('result');
}

function fail(reason) {
  G.failReason = reason;
  G.failAt = G.t;
  G.near = nearMiss(reason);
  sfx('lose');
  platform.vibrate(true);
  setMode('fail');
}

// 输在差一点：算出差多少，写在失败页上
function nearMiss(reason) {
  const d = G.duel;
  if (!d) return '';
  if (d.near) return d.near(reason);
  const head = scene.enemyHead(d.sc, 1);
  if (reason === 'mateDown') {
    const m = d.sc.mate;
    return '小雨只差 ' + (m.covers.length - m.next) + ' 段就过街了';
  }
  if (reason === 'dry') {
    const best = Math.min.apply(null, d.impacts.map((i) => i.dist));
    const gap = Math.max(1, Math.round(best - d.hitRadius));
    return '最近一枪离他的头' + (gap <= 15 ? '只差 ' : '还差 ') + gap + ' 点';
  }
  const aim = d.aimWorld();
  const dist = Math.hypot(aim.x - head.x, aim.y - head.y);
  const gap = Math.max(1, Math.round(dist - d.hitRadius));
  if (dist < D / 2) return '你的准星离他的头' + (gap <= 15 ? '只差 ' : '还差 ') + gap + ' 点';
  return '他就在你镜子外面一点点';
}

function giveAmmo() {
  const d = G.duel;
  d.bullets = 1;
  d.state = 'play';
  setMode('play');
}

// 对狙里发生的事 → 声音、字、震屏
function handleEvents(d) {
  while (d.events.length) {
    const ev = d.events.shift();
    if (ev.kind === 'duck') sfx('duck', 0.35);
    else if (ev.kind === 'crawl') sfx('crawl', 0.5);
    else if (ev.kind === 'shot') {
      sfx('shot');
      if (ev.result === 'wrong' || ev.result === 'decoy') { sfx('wrong'); G.shake = 0.35; }
      else if (ev.result === 'close') { G.slow = 0.5; G.say = { text: '好险！', color: '#ffd23f', t: 0.9 }; }
      else if (ev.result !== 'hit') G.shake = 0.25;
    } else if (ev.kind === 'spotted') G.say2 = { text: '枪口火光：他知道你在哪了', t: 1.3 };
    else if (ev.kind === 'aimed') { sfx('glint', 0.6); platform.vibrate(true); }
    else if (ev.kind === 'helmet') {
      sfx('enemyShot');
      platform.vibrate(true);
      G.say = { text: '头盔被打飞！他在那儿！', color: '#ffd23f', t: 1.8 };
    } else if (ev.kind === 'learned') { sfx('tick'); G.say = { text: '他记住这扇窗了！', color: '#ff8a00', t: 1.4 }; }
    else if (ev.kind === 'wings') sfx('wings', 0.5);
    else if (ev.kind === 'bossHit') {
      sfx('boom');
      G.shake = 0.4;
      G.bossHitT = 0;
      G.say = { text: ev.hp === 1 ? '最后一条命！' : '还没完！', color: '#ff4d5e', t: 1.6 };
    } else if (ev.kind === 'mateSafe') { sfx('coin'); G.say = { text: '小雨安全了！', color: '#90ee90', t: 1.4 }; }
    else if (ev.kind === 'train') sfx('crawl', 0.7);
    else if (ev.kind === 'kill') {
      sfx(ev.head ? 'boom' : 'enemyShot', 0.7);
      G.say = { text: (ev.head ? '爆头！' : '命中！') + (ev.left > 0 ? ' 还剩 ' + ev.left + ' 个' : ''), color: ev.head ? '#ffd23f' : '#f4f1de', t: 1.2 };
    } else if (ev.kind === 'lampOff') { sfx('wrong', 0.5); G.say = { text: '灯灭了：他们看不见你', color: '#90ee90', t: 1.4 }; }
    else if (ev.kind === 'drawGun') sfx('glint', 0.4);
    else if (ev.kind === 'smoke') { sfx('duck', 0.6); G.say2 = { text: '他扔了烟雾弹', t: 1.2 }; }
  }
}

// 连续的声音：红圈靠近滴滴、锁定圈转、心跳
function ambientSound(d) {
  if (d.state !== 'play') return;
  if (d.searching() && !d.aimingMate() && d.exposed()) {
    const dist = d.seekDist();
    // 耳机卡 / 观察手小雨：红圈离你还远就开始滴滴（只帮你保命，不告诉你他在哪）
    const warn = d.mods.peekCue ? 3.5 : 2.2;
    if (d.lock > 0) sfxEvery('tick', 0.14, 0.5);
    else if (dist < warn) sfxEvery('beep', 0.25 + dist * 0.25, d.mods.peekCue ? 0.5 : 0.35);
  }
  if (d.heart > 1.25) sfxEvery('heart', 0.95 / d.heart, 0.5);
  const g = d.glint();
  if (g && !G.wasGlint) sfx('glint', 0.25);
  G.wasGlint = g;
}

function update(dt) {
  G.t += dt;
  G.modeT += dt;
  G.missFlash = Math.max(0, G.missFlash - dt);
  G.shake = Math.max(0, G.shake - dt);
  if (G.toast) {
    G.toast.t += dt;
    if (G.toast.t > 2.2) G.toast = null;
  }
  if (G.say) { G.say.t -= dt; if (G.say.t <= 0) G.say = null; }
  if (G.say2) { G.say2.t -= dt; if (G.say2.t <= 0) G.say2 = null; }
  if (G.bossHitT >= 0) { G.bossHitT += dt; if (G.bossHitT > 1.2) G.bossHitT = -1; }
  const d = G.duel;
  const m = G.mode;
  if (m === 'bossIntro' && G.modeT > 4) setMode('teach');
  else if (m === 'intro' && G.modeT > 1.4) setMode('play');
  else if (m === 'play') {
    // 擦身而过：慢动作
    let k = 1;
    if (G.slow > 0) { G.slow -= dt; k = 0.3; }
    d.update(dt * k);
    handleEvents(d);
    if (d.kind === 'mission') missionSound(d);
    else ambientSound(d);
    if (d.drawLeft >= 0 && d.exposed() && Math.floor(d.t * 6) !== Math.floor((d.t - dt) * 6)) platform.vibrate(false);
    if (d.state === 'hit') { sfx('boom'); setMode('hit'); }
    else if (d.state === 'dead') {
      platform.vibrate(true);
      sfx('enemyShot');
      fail('dead');
    } else if (d.state === 'dry') fail('dry');
    else if (d.state === 'timeout') fail('timeout');
    else if (d.state === 'mateDown') fail('mateDown');
    else if (d.state === 'escaped') fail('escaped');
    else if (d.state === 'boom') { sfx('boom'); G.shake = 0.6; fail('boom'); }
  } else if (m === 'hit') {
    d.update(dt);
    if (G.modeT > 1.5) afterHit();
  } else if (m === 'move' && G.modeT > cut.RELOCATE_SEC) setMode('intro');
  else if (m === 'ad' && G.modeT > config.fakeAdSec) adDone();
  else if (m === 'ammoGift' && G.modeT > 1.4) giveAmmo();
  else if (m === 'arenaNext' && G.modeT > 1.8) nextArenaRound();
  else if (m === 'classic') G.classic.update(dt);
  else if (m === 'rescue' && G.modeT > cut.RESCUE_SEC) {
    addStats(G.duel);
    G.metrics.retrySec.push(+(G.t - G.failAt - cut.RESCUE_SEC).toFixed(2));
    G.rescuesLeft -= 1;
    G.stats.rescued += 1;
    G.attempt += 1;
    startRound(); // 拉起来以后重打这个回合，对面换个地方藏
    setMode('play');
  }
  // 结算页：星星和金币的声音
  if (m === 'result' && G.resultInfo) {
    [0.6, 1.0, 1.4].forEach((at, i) => {
      if (i < G.resultInfo.stars && G.modeT >= at && G.modeT - dt < at) sfx('star');
    });
    if (G.modeT >= 1.9 && G.modeT - dt < 1.9) sfx('coin');
  }
}

// 目标关的声音：心跳、倒计时滴答
function missionSound(d) {
  if (d.state !== 'play') return;
  if (d.heart > 1.25) sfxEvery('heart', 0.95 / d.heart, 0.5);
  if ((d.fuse >= 0 && d.fuse < 8) || (d.drawLeft >= 0 && d.drawLeft < 3 && d.exposed())) sfxEvery('tick', 0.5, 0.5);
}

function adDone() {
  if (G.adFor === 'ammo') {
    G.ammoAdsLeft -= 1;
    setMode('ammoGift');
  } else setMode('rescue');
}

function callTeammate(forWhat) {
  G.adFor = forWhat;
  const real = platform.showRewardedAd(
    config.rewardedAdUnitId,
    adDone,
    () => setMode('fail')
  );
  if (!real) setMode('ad');
  else setMode('adWait');
}

// —— 画：狙击镜 ——
function drawScope(opt) {
  const d = G.duel;
  const ctx = P.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.arc(scopeC.x, scopeC.y, D / 2, 0, Math.PI * 2);
  ctx.clip();
  const cam = opt.cam || d.cam;
  scene.draw(ctx, d.sc, cam, scopeC.x, scopeC.y, D, {
    glint: d.glint(),
    barrel: d.barrel(),
    tap: d.tapping(),
    fog: d.fog,
    enemyDrop: opt.enemyDrop || 0,
    t: G.t,
  });

  // 每一枪的弹孔：打在哪儿都看得见
  d.impacts.forEach((imp) => {
    if (imp.kind === 'hit') return;
    const ix = scopeC.x + imp.x - cam.x;
    const iy = scopeC.y + imp.y - cam.y;
    const age = d.t - imp.t;
    if (age < 0.5) {
      ctx.strokeStyle = 'rgba(240,225,200,' + (1 - age * 2).toFixed(2) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ix, iy, 4 + age * 30, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#120c1c';
    ctx.beginPath();
    ctx.arc(ix, iy, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#120c1c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + 0.4;
      ctx.moveTo(ix + Math.cos(a) * 3, iy + Math.sin(a) * 3);
      ctx.lineTo(ix + Math.cos(a) * 7, iy + Math.sin(a) * 7);
    }
    ctx.stroke();
  });

  if (G.missFlash > 0) {
    ctx.fillStyle = 'rgba(255,220,120,' + (G.missFlash * 0.5).toFixed(2) + ')';
    ctx.fillRect(scopeC.x - D / 2, scopeC.y, D, D / 2);
  }

  const vg = ctx.createRadialGradient(scopeC.x, scopeC.y, D * 0.3, scopeC.x, scopeC.y, D / 2);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(10,5,20,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(scopeC.x - D / 2, scopeC.y - D / 2, D, D);

  // 他开枪的火光（打飞了你的诱饵头盔）：把他自己照出来
  if (d.flashSec > 0) {
    const h = scene.enemyHead(d.sc, 1);
    const k = Math.min(1, d.flashSec / 1.6);
    starburst(ctx, scopeC.x + h.x - cam.x, scopeC.y + h.y - cam.y, 26 * k + 6, 12 * k + 4, 9, '#ffe14f');
  }

  // 他正在瞄你：镜子边缘一圈红光一闪一闪
  if (d.drawLeft >= 0 && d.state === 'play' && d.exposed()) {
    const a = 0.3 + 0.2 * Math.sin(d.t * 20);
    const rg = ctx.createRadialGradient(scopeC.x, scopeC.y, D * 0.4, scopeC.x, scopeC.y, D / 2);
    rg.addColorStop(0, 'rgba(255,0,40,0)');
    rg.addColorStop(1, 'rgba(255,0,40,' + a.toFixed(2) + ')');
    ctx.fillStyle = rg;
    ctx.fillRect(scopeC.x - D / 2, scopeC.y - D / 2, D, D);
  }

  if (!opt.noCross) drawCrosshair(ctx, scopeC.x + d.sway.x, scopeC.y + d.sway.y, d.steadiness());

  // 缩头：掩体（沙袋墙）从下往上盖住镜子
  if (d.duck > 0) drawCover(ctx, d.duck);
  if (d.moving > 0) comicText(ctx, '爬向另一扇窗……', scopeC.x, scopeC.y, 20, '#f4f1de');
  if (opt.tint) {
    ctx.fillStyle = opt.tint;
    ctx.fillRect(scopeC.x - D / 2, scopeC.y - D / 2, D, D);
  }
  ctx.restore();
  scopeRing(ctx, scopeC.x, scopeC.y, D);
}

function drawCover(ctx, k) {
  const top = scopeC.y + D / 2 - (D + 20) * clamp(k * 1.1, 0, 1);
  ctx.fillStyle = '#3a2e2a';
  ctx.fillRect(scopeC.x - D / 2, top, D, D + 40);
  ctx.strokeStyle = '#1b1530';
  ctx.lineWidth = 3;
  for (let row = 0; row < 8; row++) {
    const y = top + 10 + row * 44;
    for (let i = -1; i < 6; i++) {
      const x = scopeC.x - D / 2 + i * 76 + (row % 2) * 38;
      ctx.fillStyle = row % 2 ? '#8a7350' : '#9c8460';
      roundRect(ctx, x, y, 72, 40, 14);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function scopeRing(ctx, x, y, d) {
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#2b2438';
  ctx.beginPath();
  ctx.arc(x, y, d / 2 + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#6d6380';
  ctx.beginPath();
  ctx.arc(x, y, d / 2 + 9, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCrosshair(ctx, x, y, steadiness) {
  const color = steadiness === 'steady' ? '#e3263b' : steadiness === 'tremble' ? '#ff8a00' : '#1b1530';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - D / 2, y);
  ctx.lineTo(x - 8, y);
  ctx.moveTo(x + 8, y);
  ctx.lineTo(x + D / 2, y);
  ctx.moveTo(x, y - D / 2);
  ctx.lineTo(x, y - 8);
  ctx.moveTo(x, y + 8);
  ctx.lineTo(x, y + D / 2);
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 1; i <= 4; i++) {
    ctx.fillRect(x - 1, y + 8 + i * 12, 2, 2);
    ctx.fillRect(x - 8 - i * 12, y - 1, 2, 2);
    ctx.fillRect(x + 8 + i * 12, y - 1, 2, 2);
  }
  ctx.beginPath();
  ctx.arc(x, y, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function pulse(ctx, b) {
  const k = (G.modeT * 1.4) % 1;
  ctx.strokeStyle = 'rgba(255,210,63,' + (1 - k).toFixed(2) + ')';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r + 6 + k * 18, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHud() {
  const ctx = P.ctx;
  const d = G.duel;

  // 左上：第几关、第几回合、子弹
  const lv = G.level;
  text(G.arena ? '擂台 · 连胜 ' + G.arena.streak : G.daily ? '每日挑战' : '第 ' + lv.no + ' 关 · ' + lv.name, 14, 18, 12, '#f4f1de', 'left', 800);
  if (lv.rounds.length > 1) text('回合 ' + (G.roundIdx + 1) + ' / ' + lv.rounds.length, 14, 36, 11, '#c9c2e0', 'left', 700);
  const bulletsMax = d.bulletsMax || d.round.bullets || 3;
  for (let i = 0; i < bulletsMax; i++) drawBullet(ctx, 18 + i * 14, lv.rounds.length > 1 ? 54 : 40, i < d.bullets);
  // Boss 的命
  if (d.bossHp > 0 && d.opp.phases) {
    for (let i = 0; i < d.opp.phases.length; i++) drawHeart(ctx, 26 + i * 20, 76, i < d.bossHp ? 7 : 4);
  }

  // 正中上方：倒计时
  const tl = Math.ceil(d.timeLeft);
  comicText(ctx, String(tl), L.W / 2, 34, tl <= 15 ? 30 + Math.sin(G.t * 12) * 2 : 26, tl <= 15 ? '#ff4d5e' : '#f4f1de');

  // 右上：带的临场卡
  if (G.card) {
    const c = team.CARDS.find((x) => x.id === G.card);
    const cx = L.W - 24;
    roundRect(ctx, cx - 13, 18, 26, 32, 4);
    ctx.fillStyle = '#f2d8a7';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    cut.cardIcon(ctx, c.icon, cx, 34, 0.44);
  }
  // 地图条件、地图自带的遮挡
  const tags = [];
  if (d.cond) tags.push(config.conditions[d.cond].name);
  if (d.coverKind()) tags.push(config.covers[d.coverKind()].name);
  if (tags.length) text(tags.join(' · '), L.W - 46, 34, 11, '#c9c2e0', 'right', 800);

  const mission = d.kind === 'mission';
  if (d.drawLeft >= 0 && G.mode !== 'brief') {
    const sec = mission ? ' ' + d.drawLeft.toFixed(1) : '';
    comicText(ctx, d.exposed() ? '他瞄准你了！' + sec : mission ? '缩着：他找不到你' : '他盯着你的窗口', scopeC.x, scopeC.y - D / 2 + 30, d.exposed() ? 24 : 18, '#ff4d5e');
  }
  if (mission) drawMissionHud(ctx, d);
  else drawPanel(ctx, d);

  // 左下：缩头按钮。点一下 = 缩一下再起来（画面会变）；按住 = 一直缩着（目标关只有「一枪定生死」有）
  if (!mission || d.canDuck) {
  ctx.beginPath();
  ctx.arc(eyeBtn.x, eyeBtn.y, eyeBtn.r, 0, Math.PI * 2);
  ctx.fillStyle = d.duck > 0.5 ? '#6b5a3a' : '#3a3150';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  drawDuckIcon(ctx, eyeBtn.x, eyeBtn.y, d.duck);
  }
  // 右下：扳机。按住屏息，松手开枪
  const st = d.steadiness();
  ctx.beginPath();
  ctx.arc(trigBtn.x, trigBtn.y, trigBtn.r, 0, Math.PI * 2);
  ctx.fillStyle = st === 'steady' ? '#c2263a' : st === 'tremble' ? '#d9730d' : st === 'settling' ? '#7a2d45' : st === 'recover' ? '#26203a' : '#3a3150';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  drawCrossIcon(ctx, trigBtn.x, trigBtn.y, 20);
  if (d.reloadSec > 0) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#f4f1de';
    ctx.beginPath();
    ctx.arc(trigBtn.x, trigBtn.y, trigBtn.r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - d.reloadSec / (config.shot.reloadSec * d.mods.reloadMul)));
    ctx.stroke();
  }

  const beat = Math.pow(Math.max(0, Math.sin(d.t * Math.PI * 2 * (1.1 * d.heart))), 8);
  drawHeart(ctx, trigBtn.x - trigBtn.r - 6, trigBtn.y - trigBtn.r + 2, 9 + beat * 3);

  if (G.level.index === 0 && G.mode === 'play' && !mission) {
    if (d.blinks < 3) pulse(ctx, eyeBtn);
    else if (d.shots === 0 && !d.holding) pulse(ctx, trigBtn);
  }
  if (mission && G.level.index === 0 && G.mode === 'play' && G.zoom && d.shots === 0 && !d.holding) pulse(ctx, trigBtn);
  // 第 3 关教换窗：他记住你以后，下面那栋楼一闪一闪
  if (G.mode === 'play' && d.peeks >= config.learn.warnAt && d.moving <= 0) {
    const k = (G.t * 1.4) % 1;
    roundRect(ctx, panelR.x - 4 - k * 6, panelR.y - 4 - k * 6, panelR.w + 8 + k * 12, panelR.h + 8 + k * 12, 10);
    ctx.strokeStyle = 'rgba(255,138,0,' + (1 - k).toFixed(2) + ')';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  // 掩护关：小雨的状态
  const mate = d.sc.mate;
  if (mate && G.mode === 'play') {
    const mx = L.W / 2 - 60;
    const my = panelR.y + panelR.h + 10;
    text(mate.done ? '小雨安全了' : mate.down ? '' : d.aimingMate() ? '他在瞄小雨！' : '小雨' + (mate.state === 'run' ? '在跑' : '躲着'), mx - 6, my + 5, 11, d.aimingMate() ? '#ff4d5e' : '#90ee90', 'right', 800);
    roundRect(ctx, mx, my, 120, 10, 5);
    ctx.fillStyle = '#2b2438';
    ctx.fill();
    roundRect(ctx, mx, my, 120 * (mate.done ? 1 : mate.next / mate.covers.length), 10, 5);
    ctx.fillStyle = '#2e86ab';
    ctx.fill();
    if (mate.lock > 0 && !mate.done) {
      roundRect(ctx, mx, my + 13, 120 * mate.lock, 5, 2);
      ctx.fillStyle = '#ff4d5e';
      ctx.fill();
    }
  }

  if (G.missFlash > 0 && G.lastShot) {
    const words = { covered: '他缩着！', close: '差一点！', miss: '偏了！', decoy: '是假人！-8秒', wrong: '打错人！-8秒', car: '打在车上！', lamp: '灯灭了！' };
    comicText(ctx, words[G.lastShot.kind] || '偏了！', scopeC.x, scopeC.y + D / 2 - 44, 28, G.lastShot.kind === 'close' ? '#ffd23f' : '#ff4d5e');
    if (!d.mods.silent && !mission) comicText(ctx, '枪口火光：他看见你了', scopeC.x, scopeC.y + D / 2 - 16, 14, '#f4f1de');
  }
  if (G.say && G.mode === 'play') comicText(ctx, G.say.text, scopeC.x, scopeC.y + 40, 22, G.say.color);
  // Boss 挨了一枪：头盔飞出去
  if (G.bossHitT >= 0 && d.hitAt) {
    const k = G.bossHitT;
    const hx = scopeC.x + d.hitAt.x - d.cam.x + k * 90;
    const hy = scopeC.y + d.hitAt.y - d.cam.y - k * 120 + k * k * 160;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(k * 8);
    ctx.fillStyle = '#6b7f4a';
    ctx.beginPath();
    ctx.arc(0, 0, 12, Math.PI, 0);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }
  if (G.say2 && G.mode === 'play' && !G.missFlash) comicText(ctx, G.say2.text, scopeC.x, scopeC.y + D / 2 - 30, 18, '#ff4d5e');
}

// 目标关：镜子下面写目标那句话、还剩几个、炸弹倒计时；放大时右下角有「全景」按钮
function drawMissionHud(ctx, d) {
  const y = (G.zoom ? scopeC.y + D / 2 : WIDE.y + WIDE.h) + 36;
  roundRect(ctx, 20, y, L.W - 40, 40, 10);
  ctx.fillStyle = '#f2d8a7';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  const total = d.targets.length + (d.sc.vehicle ? 1 : 0);
  const left = d.targetsLeft() + (d.sc.vehicle && !d.sc.vehicle.down ? 1 : 0);
  text(briefText(d.M), L.W / 2, y + 14, 13, INK, 'center', 900);
  const sub = [];
  if (total > 1) sub.push('还剩 ' + left + ' / ' + total);
  if (d.fuse >= 0) sub.push('炸弹 ' + d.fuse.toFixed(1) + ' 秒');
  if (d.sc.lamp) sub.push(d.sc.lamp.on ? '探照灯亮着' : '灯灭了');
  if (sub.length) text(sub.join(' · '), L.W / 2, y + 31, 11, d.fuse >= 0 && d.fuse < 8 ? '#c2263a' : '#7a4a2a', 'center', 800);
  if (G.zoom && G.mode === 'play') {
    ctx.beginPath();
    ctx.arc(zoomBtn.x, zoomBtn.y, zoomBtn.r, 0, Math.PI * 2);
    ctx.fillStyle = '#2b2438';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f4f1de';
    ctx.stroke();
    text('全景', zoomBtn.x, zoomBtn.y + 1, 12, '#f4f1de', 'center', 900);
  }
}

// 你这栋楼（从他那边看过来）：一格一扇窗，黄框是你。红圈 = 他的镜子正在看哪
function drawPanel(ctx, d) {
  const p = panelR;
  const cw = (p.w - 20) / d.COLS;
  const ch = (p.h - 22) / d.ROWS;
  const cx = (c) => p.x + 10 + cw * (c + 0.5);
  const cy = (r) => p.y + 16 + ch * (r + 0.5);
  const aiming = d.drawLeft >= 0;
  roundRect(ctx, p.x, p.y, p.w, p.h, 8);
  const warn = d.mods.peekCue && d.searching() && !d.aimingMate() && d.seekDist() < 3.5;
  ctx.fillStyle = aiming && Math.sin(d.t * 18) > 0 ? '#5a1a2a' : warn && Math.sin(d.t * 10) > 0 ? '#3a2030' : '#2b2438';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = '#c9c2e0';
  ctx.font = '700 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const label = aiming ? '他瞄着你！' : d.aimingMate() ? '他在瞄小雨，没看你' : d.searching() ? '你这栋楼 · 他在找你（点别的窗 = 换窗）' : '你这栋楼 · 他缩着，没在看';
  ctx.fillText(label, p.x + 10, p.y + 9);
  // 窗户
  for (let r = 0; r < d.ROWS; r++) {
    for (let c = 0; c < d.COLS; c++) {
      const me = c === d.me.c && r === d.me.r && d.moving <= 0;
      ctx.fillStyle = me ? (d.exposed() ? '#ffd23f' : '#8a7350') : '#1a1428';
      ctx.fillRect(cx(c) - cw * 0.28, cy(r) - ch * 0.32, cw * 0.56, ch * 0.64);
      // 他记住这扇窗了：橙色框
      if (me && d.peeks >= config.learn.warnAt) {
        ctx.strokeStyle = '#ff8a00';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx(c) - cw * 0.34, cy(r) - ch * 0.4, cw * 0.68, ch * 0.8);
      }
      if (me && d.exposed()) {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(cx(c), cy(r) - 2, Math.min(5, ch * 0.18), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // 正在爬向另一扇窗
  if (d.moving > 0 && d.moveTo) {
    const k = 1 - d.moving / config.move.sec;
    const fx = lerp(cx(d.moveTo.from.c), cx(d.moveTo.c), k);
    const fy = lerp(cy(d.moveTo.from.r), cy(d.moveTo.r), k);
    ctx.strokeStyle = '#ffd23f';
    ctx.setLineDash && ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx(d.moveTo.from.c), cy(d.moveTo.from.r));
    ctx.lineTo(cx(d.moveTo.c), cy(d.moveTo.r));
    ctx.stroke();
    ctx.setLineDash && ctx.setLineDash([]);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(fx, fy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // 锁定圈：转满他就瞄准你
  if (d.lock > 0) {
    ctx.strokeStyle = '#ff4d5e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx(d.me.c), cy(d.me.r), Math.min(cw, ch) * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * d.lock);
    ctx.stroke();
  }
  // 他的镜子
  const sx = cx(d.seek.x);
  const sy = cy(d.seek.y);
  const rr = Math.min(cw, ch) * 0.75;
  if (d.aimingMate()) {
    // 他瞄着街上的小雨：红圈不在你楼上
  } else if (d.searching() || aiming) {
    ctx.strokeStyle = '#ff4d5e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sx, sy, rr, 0, Math.PI * 2);
    ctx.moveTo(sx - rr - 4, sy);
    ctx.lineTo(sx + rr + 4, sy);
    ctx.moveTo(sx, sy - rr - 4);
    ctx.lineTo(sx, sy + rr + 4);
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(200,190,220,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBullet(ctx, x, y, full) {
  ctx.fillStyle = full ? '#ffd23f' : '#3a3150';
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 7);
  ctx.lineTo(x - 4, y - 3);
  ctx.quadraticCurveTo(x, y - 12, x + 4, y - 3);
  ctx.lineTo(x + 4, y + 7);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function drawDuckIcon(ctx, x, y, k) {
  // 一个小人头 + 一道墙：缩下去时头躲到墙后
  ctx.fillStyle = '#f4f1de';
  ctx.beginPath();
  ctx.arc(x, y - 6 + k * 12, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9c8460';
  roundRect(ctx, x - 20, y + 2, 40, 14, 5);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function drawCrossIcon(ctx, x, y, s) {
  ctx.strokeStyle = '#f4f1de';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, s * 0.7, 0, Math.PI * 2);
  ctx.moveTo(x - s, y);
  ctx.lineTo(x + s, y);
  ctx.moveTo(x, y - s);
  ctx.lineTo(x, y + s);
  ctx.stroke();
}

function drawHeart(ctx, x, y, s) {
  ctx.fillStyle = '#ff4d5e';
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.2, x - s * 0.6, y - s * 1.2, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.4, y - s * 0.2, x, y + s * 0.9);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// —— 画：按钮和面板 ——
function button(id, label, x, y, w, h, fn, primary, disabled) {
  const ctx = P.ctx;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = disabled ? '#2b2438' : primary ? '#ffd23f' : '#3a3150';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = disabled ? '#6d6380' : primary ? INK : '#f4f1de';
  ctx.font = '800 ' + (h < 40 ? 14 : 18) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  G.buttons.push({ id, x, y, w, h, fn });
}

function text(str, x, y, size, color, align, weight) {
  const ctx = P.ctx;
  ctx.fillStyle = color || '#f4f1de';
  ctx.font = (weight || 600) + ' ' + size + 'px sans-serif';
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function panel(title, sub) {
  const ctx = P.ctx;
  ctx.fillStyle = 'rgba(10,6,18,0.72)';
  ctx.fillRect(0, 0, L.W, L.H);
  comicText(ctx, title, L.W / 2, L.H * 0.3, 44);
  if (sub) text(sub, L.W / 2, L.H * 0.3 + 44, 15);
}

// 漫画格：第几场、对手登场
function comicPanel(title, sub, sub2) {
  const ctx = P.ctx;
  const k = easeOut(clamp(G.modeT / 0.25, 0, 1));
  ctx.fillStyle = 'rgba(10,6,18,0.6)';
  ctx.fillRect(0, 0, L.W, L.H);
  ctx.save();
  ctx.translate(L.W / 2, L.H * 0.42);
  ctx.rotate(-0.05);
  ctx.scale(k, k);
  roundRect(ctx, -150, -80, 300, 160, 6);
  ctx.fillStyle = '#f2d8a7';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,80,60,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 40, Math.sin(a) * 25);
    ctx.lineTo(Math.cos(a) * 170, Math.sin(a) * 100);
    ctx.stroke();
  }
  comicText(ctx, title, 0, -22, 36);
  if (sub) text(sub, 0, 28, 16, INK, 'center', 800);
  if (sub2) text(sub2, 0, 52, 13, INK, 'center', 600);
  ctx.restore();
}

// 打中：三格漫画子弹时间。嘣 → 子弹慢慢飞过去 → 头盔飞了、眼冒金星、「爆头！」
function drawHit() {
  const ctx = P.ctx;
  const d = G.duel;
  const t = G.modeT;
  const aimX = scopeC.x + (d.hitAt.x - d.cam.x);
  const aimY = scopeC.y + (d.hitAt.y - d.cam.y);
  drawScope({ enemyDrop: t > 0.75 ? easeOut(clamp((t - 0.75) / 0.4, 0, 1)) * 14 : 0, noCross: true });
  if (t < 0.25) {
    // 第一格：嘣
    ctx.fillStyle = 'rgba(255,250,220,' + (0.8 * (1 - t / 0.25)).toFixed(2) + ')';
    ctx.fillRect(0, 0, L.W, L.H);
    starburst(ctx, scopeC.x, scopeC.y + D / 2 - 30, 70, 44, 12, '#ffd23f');
    comicText(ctx, '嘣！', scopeC.x, scopeC.y + D / 2 - 30, 40);
  } else if (t < 0.75) {
    // 第二格：子弹慢慢飞过去（速度线）
    const k = (t - 0.25) / 0.5;
    const sx = scopeC.x;
    const sy = scopeC.y + D / 2;
    const bx = sx + (aimX - sx) * k;
    const by = sy + (aimY - sy) * k;
    ctx.strokeStyle = 'rgba(255,240,200,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = Math.atan2(aimY - sy, aimX - sx) + Math.PI + (i - 2.5) * 0.15;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(a) * 10, by + Math.sin(a) * 10);
      ctx.lineTo(bx + Math.cos(a) * 40, by + Math.sin(a) * 40);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffe14f';
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fill();
    drawCrosshair(ctx, aimX, aimY, 'steady');
  } else {
    // 第三格：一格漫画框放大他的头：头盔飞了，眼冒金星
    const k = easeOut(clamp((t - 0.75) / 0.2, 0, 1));
    const px = L.W / 2;
    const py = scopeC.y - 20;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.06);
    ctx.scale(k, k);
    roundRect(ctx, -110, -80, 220, 160, 8);
    ctx.fillStyle = '#f2d8a7';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-106, -76, 212, 152);
    ctx.clip();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.strokeStyle = 'rgba(200,80,60,0.3)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
      ctx.lineTo(Math.cos(a) * 160, Math.sin(a) * 160);
      ctx.stroke();
    }
    const tt = t - 0.75;
    ctx.fillStyle = '#4a3a5a';
    ctx.beginPath();
    ctx.arc(0, 10 + tt * 30, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-45, 36 + tt * 30, 90, 60);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // 头盔飞走
    ctx.save();
    ctx.translate(tt * 160, -20 - tt * 140 + tt * tt * 120);
    ctx.rotate(tt * 9);
    ctx.fillStyle = '#6b7f4a';
    ctx.beginPath();
    ctx.arc(0, 0, 30, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // 金星
    for (let i = 0; i < 3; i++) {
      const a = tt * 8 + (i * Math.PI * 2) / 3;
      starburst(ctx, Math.cos(a) * 34, -18 + tt * 30 + Math.sin(a) * 10, 9, 4, 5, '#ffd23f');
    }
    ctx.restore();
    const kk = easeOut(clamp((t - 0.85) / 0.2, 0, 1));
    starburst(ctx, px + 70, py + 70, 50 * kk, 32 * kk, 12, '#ff4d5e');
    comicText(ctx, d.kind === 'mission' && d.lastKill && !d.lastKill.head ? '命中！' : '爆头！', px + 70, py + 70, 28 * kk);
    if (t > 1.0) comicText(ctx, '点一下继续', L.W / 2, scopeC.y + D / 2 + 26, 12, 'rgba(244,241,222,0.7)');
  }
}

// 目标关：没打倒的目标的头在哪（失败页指给你看）
function missionTargetHead(d) {
  const v = d.sc.vehicle;
  if (v && !v.down) return people.vehicleHead(v);
  const p = d.targets.find((x) => !x.down && !x.gone) || d.targets[0];
  if (!p) return { x: d.cam.x, y: d.cam.y };
  return people.head(p);
}

// 0.8 全景：整张场景缩小，点一下 = 放大到那里（照《Sniper 3D》：先看全景，再开镜）
function drawWide() {
  const ctx = P.ctx;
  const d = G.duel;
  const k = WIDE.w / 860;
  ctx.save();
  ctx.beginPath();
  ctx.rect(WIDE.x, WIDE.y, WIDE.w, WIDE.h);
  ctx.clip();
  ctx.translate(WIDE.x, WIDE.y);
  ctx.scale(k, k);
  scene.draw(ctx, d.sc, { x: 430, y: 300 }, 430, 300, 860, { t: G.t, fog: 0 });
  ctx.restore();
  ctx.strokeStyle = '#2b2438';
  ctx.lineWidth = 4;
  ctx.strokeRect(WIDE.x, WIDE.y, WIDE.w, WIDE.h);
  // 上一次放大的地方
  const r = (D / 2) * k;
  ctx.strokeStyle = 'rgba(255,210,63,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(WIDE.x + d.cam.x * k, WIDE.y + d.cam.y * k, r, 0, Math.PI * 2);
  ctx.stroke();
  if (G.mode === 'play') text('全景 · 点一下 = 放大到那里', L.W / 2, WIDE.y + WIDE.h + 16, 12, '#ffd23f', 'center', 800);
}

// 目标卡上的特征图标：衣服颜色块、帽子、包……
function clueChips(ctx, clue, cx, y) {
  const chips = [];
  if (clue.shirt) chips.push({ color: people.SHIRTS[clue.shirt].color, label: people.SHIRTS[clue.shirt].name });
  if (clue.hair) chips.push({ color: people.HAIRS[clue.hair].color, label: people.HAIRS[clue.hair].name });
  if (clue.hat) chips.push({ color: '#6b4a2a', label: people.HATS[clue.hat].replace('戴', '') });
  if (clue.bag) chips.push({ color: '#5a3a20', label: people.BAGS[clue.bag].replace(/^(背着|提着)/, '') });
  if (clue.glasses) chips.push({ color: '#1b1530', label: '墨镜' });
  if (clue.phone) chips.push({ color: '#dcf0ff', label: '手机' });
  if (clue.gun) chips.push({ color: '#3a3150', label: '枪' });
  if (clue.vest) chips.push({ color: '#b5172b', label: '炸弹包' });
  const w = 78;
  chips.forEach((c, i) => {
    const x = cx + (i - (chips.length - 1) / 2) * (w + 8);
    roundRect(ctx, x - w / 2, y, w, 30, 15);
    ctx.fillStyle = '#f4f1de';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(x - w / 2 + 15, y + 15, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    text(c.label, x + 8, y + 16, 12, INK, 'center', 900);
  });
}

// 开局的目标卡：一句话 + 特征图标
function drawBrief() {
  const ctx = P.ctx;
  const d = G.duel;
  const M = d.M;
  ctx.fillStyle = 'rgba(10,6,18,0.55)';
  ctx.fillRect(0, 0, L.W, L.H);
  const k = easeOut(clamp(G.modeT / 0.3, 0, 1));
  const y = lerp(-200, L.H * 0.22, k);
  ctx.save();
  ctx.translate(L.W / 2, y);
  ctx.rotate(-0.03);
  roundRect(ctx, -165, 0, 330, 170, 10);
  ctx.fillStyle = '#f2d8a7';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
  const lv = G.level;
  text((lv.type || '') + ' · 第 ' + lv.no + ' 关 · ' + lv.name, L.W / 2, y + 24, 13, '#7a4a2a', 'center', 900);
  const say = briefText(M);
  const lines = say.length > 15 ? [say.slice(0, say.indexOf('：') > 0 ? say.indexOf('：') + 1 : 15), say.slice(say.indexOf('：') > 0 ? say.indexOf('：') + 1 : 15)] : [say];
  lines.forEach((l, i) => comicText(ctx, l, L.W / 2, y + 60 + i * 30, lines.length > 1 ? 21 : 24, INK));
  clueChips(ctx, M.clue || {}, L.W / 2, y + 120);
  const R = d.round;
  text(d.bullets + ' 发 · ' + R.time + ' 秒', L.W / 2, y + 190, 12, '#f4f1de', 'center', 800);
  if (G.modeT > 0.5) text('点一下开始', L.W / 2, L.H - 60, 13, 'rgba(244,241,222,0.75)', 'center', 700);
}

// 输了：他在哪 + 回放他的红圈是怎么找到你的
function drawFail() {
  const ctx = P.ctx;
  const d = G.duel;
  const head = d.kind === 'mission' ? missionTargetHead(d) : scene.enemyHead(d.sc, 1);
  const cam = d.kind === 'mission' ? { x: clamp(head.x, 30, d.sc.w - 30), y: clamp(head.y, 60, d.sc.h - 18) } : { x: clamp(head.x, D / 2, d.sc.w - D / 2), y: clamp(head.y, D / 2, d.sc.h - D / 2) };
  drawScope({ cam, noCross: true });
  const ex = scopeC.x + head.x - cam.x;
  const ey = scopeC.y + head.y - cam.y;
  ctx.strokeStyle = '#ff4d5e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(ex, ey + 4, 22 + Math.sin(G.modeT * 6) * 3, 0, Math.PI * 2);
  ctx.stroke();
  comicText(ctx, d.kind === 'mission' ? '目标在这儿！' : '他在这儿！', ex, ey - 40, 22, '#ffffff');
  comicText(ctx, FAIL_TEXT[G.failReason] || '差一点！', L.W / 2, 34, 30, '#ff4d5e');
  // 回放：红圈走过的路
  if (d.kind !== 'mission') drawPanel(ctx, d);
  const trail = d.seekTrail;
  if (trail.length > 1) {
    const p = panelR;
    const cw = (p.w - 20) / d.COLS;
    const ch = (p.h - 22) / d.ROWS;
    const n = Math.max(2, Math.floor(trail.length * clamp(G.modeT / 2.2, 0, 1)));
    ctx.strokeStyle = 'rgba(255,77,94,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    trail.slice(0, n).forEach((pt, i) => {
      const x = p.x + 10 + cw * (pt.x + 0.5);
      const y = p.y + 16 + ch * (pt.y + 0.5);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    text('他的镜子是这样找到你的', p.x + p.w / 2, p.y + p.h + 12, 11, '#c9c2e0', 'center', 700);
  }
  if (G.near) comicText(ctx, G.near, L.W / 2, 70, 17, '#ffd23f');
  // 激励视频只放这一刻：差一点的时候
  const by = L.H - 150;
  if (G.failReason === 'dead' && G.rescuesLeft > 0) button('rescue', '▶ 小雨拉你起来', L.W / 2 - 160, by, 150, 50, () => callTeammate('rescue'));
  if (G.failReason === 'dry' && G.ammoAdsLeft > 0) button('ammo', '▶ 小雨扔一发', L.W / 2 - 160, by, 150, 50, () => callTeammate('ammo'));
  const back = G.arena ? endArena : G.daily ? goTitle : goMap;
  button('retry', '再来', L.W / 2 + 10, by, 150, 50, G.arena ? startArena : G.daily ? startDaily : retryRound, true);
  if (G.arena) text('连胜 ' + G.arena.streak + ' · 最好 ' + Math.max(team.state().arenaBest, G.arena.streak), L.W / 2, 96, 14, '#f4f1de', 'center', 800);
  button('map', G.arena || G.daily ? '主页' : '回地图', L.W / 2 - 60, L.H - 80, 120, 42, back);
}

// —— 关前那一页：这关有什么新东西 ——
function drawTeach() {
  const ctx = P.ctx;
  const lv = G.level;
  ctx.fillStyle = 'rgba(10,6,18,0.86)';
  ctx.fillRect(0, 0, L.W, L.H);
  comicText(ctx, '第 ' + lv.no + ' 关 · ' + lv.name, L.W / 2, 70, 28);
  const lines = [];
  if (lv.index === 0 && lv.legacy) {
    lines.push(['左下按住 = 缩头', '']);
    lines.push(['下面的红圈 = 他在找你', '停在你窗口上就快缩头']);
  }
  lv.teach.forEach((l) => l[0] && lines.push(l));
  lines.forEach(([a, b], i) => {
    const k = clamp((G.modeT - 0.2 - i * 0.25) / 0.3, 0, 1);
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha = k;
    text(a, L.W / 2, 128 + i * 52, 15, '#ffd23f', 'center', 900);
    if (b) text(b, L.W / 2, 128 + i * 52 + 20, 12, '#f4f1de', 'center', 600);
    ctx.restore();
  });
  const y0 = 128 + lines.length * 52 + 10;
  text('子弹 ' + (G.duel.bulletsMax || lv.rounds[0].bullets) + ' 发 · 每回合 ' + lv.rounds[0].time + ' 秒' + (lv.rounds.length > 1 ? ' · ' + lv.rounds.length + ' 个回合' : ''), L.W / 2, y0, 13, '#c9c2e0', 'center', 700);
  if (G.modeT > 0.8) text('点一下开始', L.W / 2, L.H - 60, 13, 'rgba(244,241,222,0.75)', 'center', 700);
}

function drawBossIntro() {
  const ctx = P.ctx;
  const lv = G.level;
  const t = G.modeT;
  ctx.fillStyle = '#1a0a14';
  ctx.fillRect(0, 0, L.W, L.H);
  // 他的剪影从暗里出来
  const k = easeOut(clamp(t / 0.8, 0, 1));
  ctx.save();
  ctx.globalAlpha = k;
  cut.person(ctx, L.W / 2, L.H * 0.62, 2.2, { hair: '#1b1530', jacket: '#2b2030', skin: '#3a2a3a', style: 'cap' }, { back: false, rifle: true });
  ctx.restore();
  if (t > 0.6) {
    const kk = easeOut(clamp((t - 0.6) / 0.3, 0, 1));
    ctx.save();
    ctx.translate(L.W / 2, L.H * 0.16);
    ctx.rotate(-0.05);
    ctx.scale(kk, kk);
    starburst(ctx, 0, 0, 120, 80, 16, '#e3263b');
    comicText(ctx, 'BOSS', 0, -14, 22, '#f4f1de');
    comicText(ctx, config.opponents.boss.name, 0, 16, 40);
    ctx.restore();
  }
  (lv.bossIntro || []).forEach((l, i) => {
    if (t > 1.2 + i * 0.4) text(l, L.W / 2, L.H * 0.74 + i * 26, 15, '#f4f1de', 'center', 800);
  });
}

// 擂台赢了一个：连胜 +1，抽出下一个加难
function drawArenaNext() {
  const ctx = P.ctx;
  const A = G.arena;
  const t = G.modeT;
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(0, 0, L.W, L.H);
  const k = easeOut(clamp(t / 0.3, 0, 1));
  ctx.save();
  ctx.translate(L.W / 2, L.H * 0.3);
  ctx.scale(k, k);
  starburst(ctx, 0, 0, 110, 74, 16, '#e3263b');
  comicText(ctx, '连胜 ' + A.streak, 0, 0, 40);
  ctx.restore();
  if (A.best) text('新纪录！', L.W / 2, L.H * 0.3 + 96, 16, '#ffd23f', 'center', 900);
  if (A.newMod && t > 0.5) {
    comicText(ctx, '加难：' + A.newMod.name, L.W / 2, L.H * 0.52, 26, '#ff8a00');
  }
  const all = A.mods.map((id) => LV.ARENA_MODS.find((m) => m.id === id).name).join(' · ');
  if (all) text('现在：' + all, L.W / 2, L.H * 0.6, 12, '#c9c2e0', 'center', 700);
}

function drawDailyDone() {
  const ctx = P.ctx;
  const D2 = G.daily;
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(0, 0, L.W, L.H);
  comicText(ctx, '每日挑战完成', L.W / 2, 90, 32);
  comicText(ctx, Math.round(D2.sec) + ' 秒', L.W / 2, 180, 48, '#f4f1de');
  const best = team.state().daily[D2.day];
  text(D2.best ? '今天的新纪录！' : '今天最好 ' + best + ' 秒', L.W / 2, 240, 16, '#ffd23f', 'center', 900);
  text('明天会换一局。好友排行等接进微信再做', L.W / 2, 280, 12, '#9a90b0');
  if (G.modeT < 0.8) return;
  button('dailyAgain', '再挑战', L.W / 2 + 10, L.H - 120, 150, 54, startDaily, true);
  button('dailyHome', '主页', L.W / 2 - 160, L.H - 120, 150, 54, goTitle);
}

// —— 章节地图 ——
function drawMap() {
  const ctx = P.ctx;
  const S = team.state();
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(0, 0, L.W, L.H);
  const ch = LV.CITIES[0];
  comicText(ctx, '第一座城 · ' + ch.name, L.W / 2, 40, 24);
  const rk = team.rank();
  text('段位 ' + rk.name + ' · ★ ' + team.totalStars(), 16, 76, 13, '#ffd23f', 'left', 900);
  text('金币 ¥' + S.money, L.W - 16, 76, 13, '#ffd23f', 'right', 900);
  // 二十关排成格子：教学绿、主线蓝、特别任务红；打过的变金色
  const lvs = LV.LEVELS.filter((l) => l.chapter === ch.id);
  const cols = 4;
  const top = 108;
  const cellW = (L.W - 24) / cols;
  const cellH = Math.min(84, (L.H - top - 96) / Math.ceil(lvs.length / cols));
  const TYPE_COLOR = { 教学: '#38b000', 主线: '#3a86ff', 特别任务: '#e3263b' };
  let lastType = '';
  lvs.forEach((lv, i) => {
    const x = 12 + cellW * (i % cols) + cellW / 2;
    const y = top + cellH * Math.floor(i / cols) + 24;
    const open = levelUnlocked(lv);
    const stars = S.stars[lv.id] || 0;
    const r = lv.boss ? 24 : 20;
    if (lv.type !== lastType) {
      text(lv.type, x - r - 4, y - r - 6, 10, TYPE_COLOR[lv.type], 'left', 900);
      lastType = lv.type;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = !open ? '#2b2438' : stars ? '#ffd23f' : TYPE_COLOR[lv.type] || '#e3263b';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (open && !stars) {
      const k = (G.t * 1.2) % 1;
      ctx.strokeStyle = 'rgba(255,210,63,' + (1 - k).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(x, y, r + 4 + k * 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    text(open ? (lv.boss ? '王' : String(lv.no)) : '🔒', x, y + 1, 15, open && stars ? INK : '#f4f1de', 'center', 900);
    text(lv.name, x, y + r + 11, 11, open ? '#f4f1de' : '#6d6380', 'center', 800);
    text('★★★'.slice(0, stars) + '☆☆☆'.slice(0, 3 - stars), x, y + r + 25, 10, '#ffd23f', 'center', 800);
    G.buttons.push({ id: 'lv_' + lv.id, x: x - r, y: y - r, w: r * 2, h: r * 2, fn: () => openLevel(lv) });
  });
  button('mapHome', '主页', 12, L.H - 60, 104, 42, goTitle);
  button('mapGun', '升级枪', L.W / 2 - 52, L.H - 60, 104, 42, () => setMode('gun'), true);
  if (S.revealed) button('mapTeam', '战队', L.W - 116, L.H - 60, 104, 42, () => setMode('team'));
}

// —— 0.8 升级枪（照《Sniper 3D》：金币升级瞄准镜、枪托、弹匣、枪栓） ——
function drawGun() {
  const ctx = P.ctx;
  const S = team.state();
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(0, 0, L.W, L.H);
  comicText(ctx, '升级枪', L.W / 2, 44, 30);
  text('金币 ¥' + S.money, L.W / 2, 80, 15, '#ffd23f', 'center', 900);
  team.GUN_STATS.forEach((g, i) => {
    const lv = S.gun[g.id] || 0;
    const y = 112 + i * 96;
    roundRect(ctx, 16, y, L.W - 32, 84, 10);
    ctx.fillStyle = '#2b2438';
    ctx.fill();
    text(g.name, 32, y + 22, 17, '#f4f1de', 'left', 900);
    for (let k = 0; k < team.GUN_MAX; k++) {
      ctx.beginPath();
      ctx.arc(110 + k * 18, y + 22, 6, 0, Math.PI * 2);
      ctx.fillStyle = k < lv ? '#ffd23f' : '#4a4060';
      ctx.fill();
    }
    text(lv ? '现在：' + g.desc(lv) : '还没升级', 32, y + 48, 12, '#c9c2e0', 'left', 700);
    if (lv < team.GUN_MAX) {
      text('下一级：' + g.desc(lv + 1), 32, y + 66, 12, '#90ee90', 'left', 700);
      const cost = team.gunCost(lv);
      button('gun_' + g.id, '¥' + cost, L.W - 124, y + 22, 96, 40, () => {
        if (team.upgradeGun(g.id)) sfx('coin');
        else toast('金币不够：多打几关，爆头多给');
      }, S.money >= cost, S.money < cost);
    } else text('满级', L.W - 76, y + 42, 14, '#ffd23f', 'center', 900);
  });
  button('gunBack', '回地图', L.W / 2 - 60, L.H - 70, 120, 44, goMap);
}

// —— 关前：看目标、带一张卡 ——
function drawLoadout() {
  const ctx = P.ctx;
  const lv = G.level;
  const S = team.state();
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(0, 0, L.W, L.H);
  comicText(ctx, '第 ' + lv.no + ' 关 · ' + lv.name, L.W / 2, 44, 26);
  let y = 86;
  lv.rounds.forEach((R, i) => {
    const o = config.opponents[R.opp];
    const parts = [o.name, R.figures + ' 个人影', R.bullets + ' 发', R.time + ' 秒'];
    if (R.cond) parts.push(config.conditions[R.cond].name);
    if (R.goal === 'escort') parts.push('掩护小雨');
    text((lv.rounds.length > 1 ? '回合 ' + (i + 1) + '：' : '') + parts.join(' · '), L.W / 2, y, 13, '#f4f1de', 'center', 700);
    y += 22;
  });
  y += 8;
  text('★ 过关', L.W / 2 - 120, y, 13, '#ffd23f', 'left', 800);
  lv.stars.forEach((k, i) => text('★ ' + LV.starText(lv, k), L.W / 2 - 120, y + 22 * (i + 1), 13, '#ffd23f', 'left', 800));
  const best = S.stars[lv.id] || 0;
  if (best) text('最好成绩 ' + '★★★'.slice(0, best), L.W / 2 + 120, y, 12, '#c9c2e0', 'right', 700);
  y += 22 * 3 + 16;
  text('带一张卡进去', L.W / 2, y, 14, '#f4f1de', 'center', 900);
  y += 16;
  const cards = team.unlockedCards();
  const cw = 104;
  const chh = 96;
  const gap = 10;
  const cols = 3;
  const x0 = (L.W - cw * cols - gap * (cols - 1)) / 2;
  cards.forEach((c, i) => {
    const cx = x0 + (i % cols) * (cw + gap);
    const cy = y + Math.floor(i / cols) * (chh + gap);
    const on = G.pickCard === c.id;
    roundRect(ctx, cx, cy, cw, chh, 8);
    ctx.fillStyle = on ? '#ffd23f' : '#f2d8a7';
    ctx.fill();
    ctx.lineWidth = on ? 4 : 2;
    ctx.strokeStyle = on ? '#e3263b' : INK;
    ctx.stroke();
    cut.cardIcon(ctx, c.icon, cx + cw / 2, cy + 30, 0.8);
    text(c.name, cx + cw / 2, cy + 62, 14, INK, 'center', 900);
    text(c.desc, cx + cw / 2, cy + 80, 10, INK, 'center', 700);
    G.buttons.push({ id: 'card_' + c.id, x: cx, y: cy, w: cw, h: chh, fn: () => (G.pickCard = on ? null : c.id) });
  });
  if (cards.length < team.CARDS.length) {
    const rows = Math.ceil(cards.length / cols);
    text('每第一次过一关，多解锁一张卡', L.W / 2, y + rows * (chh + gap) + 6, 11, '#9a90b0');
  }
  button('go', '开打', L.W / 2 + 10, L.H - 76, 150, 54, startLevel, true);
  button('back', '回地图', L.W / 2 - 160, L.H - 76, 150, 54, goMap);
}

// —— 过关结算：星星砸下来，金币飞进奖金栏 ——
function drawResult() {
  const ctx = P.ctx;
  const R = G.resultInfo;
  const lv = G.level;
  const S = team.state();
  const t = G.modeT;
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(0, 0, L.W, L.H);
  comicText(ctx, lv.boss ? (lv.city ? '五个狙击手全倒了！' : '打败了' + config.opponents.boss.name + '！') : '过关！', L.W / 2, lv.boss && lv.city ? 66 : 70, lv.boss && lv.city ? 30 : 38);
  text('第 ' + lv.no + ' 关 · ' + lv.name + ' · 用时 ' + Math.round(R.sec) + ' 秒', L.W / 2, 112, 13, '#c9c2e0', 'center', 700);
  // 三颗星
  for (let i = 0; i < 3; i++) {
    const at = 0.6 + i * 0.4;
    const got = i < R.stars;
    const x = L.W / 2 + (i - 1) * 84;
    const yBase = 190 - (i === 1 ? 14 : 0);
    let k = got ? clamp((t - at) / 0.25, 0, 1) : 1;
    const y = got ? yBase - (1 - easeOut(k)) * 160 : yBase;
    const sz = got ? 34 * (k < 1 ? 1.3 - 0.3 * k : 1) : 30;
    starburst(ctx, x, y, sz, sz * 0.45, 5, got && k > 0 ? '#ffd23f' : '#3a3150');
  }
  // 三条星星条件
  const rows = [['过关', true]].concat(lv.stars.map((k, i) => [LV.starText(lv, k), R.conds[i]]));
  rows.forEach(([str, ok], i) => text((ok ? '✓ ' : '✗ ') + str, L.W / 2 - 110, 262 + i * 26, 14, ok ? '#90ee90' : '#9a90b0', 'left', 800));
  // 金币飞进奖金栏
  const coinT = clamp((t - 1.9) / 0.7, 0, 1);
  if (t > 1.9) {
    for (let i = 0; i < 8; i++) {
      const k = clamp(coinT * 1.4 - i * 0.06, 0, 1);
      if (k <= 0 || k >= 1) continue;
      const x = lerp(L.W / 2, L.W - 40, easeOut(k)) + Math.sin(i * 2) * 20 * (1 - k);
      const y = lerp(370, 40, easeOut(k)) - Math.sin(k * Math.PI) * 30;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }
  comicText(ctx, '+¥' + R.money, L.W / 2, 370, 26, '#90ee90');
  if (R.heads) text('其中爆头 ' + R.heads + ' 次 · 每次多给 ¥' + config.money.perHead, L.W / 2, 396, 12, '#ffd23f', 'center', 800);
  text('奖金 ¥' + (t < 2.4 ? S.money - R.money : S.money), L.W - 16, 40, 14, '#ffd23f', 'right', 900);
  text('段位 ' + team.rank().name, 16, 40, 14, '#ffd23f', 'left', 900);
  if (R.cardUnlocked && t > 2.2) text('解锁新卡：' + R.cardUnlocked.name + '（' + R.cardUnlocked.desc + '）', L.W / 2, 410, 13, '#3ef0ff', 'center', 800);
  if (t < 2.2) return;
  if (R.reveal) {
    button('continue', '继续', L.W / 2 - 100, L.H - 90, 200, 56, () => setMode('reveal'), true);
    return;
  }
  const next = (lv.legacy ? LV.CAFE : LV.LEVELS)[lv.index + 1];
  if (next && levelUnlocked(next)) button('next', '下一关', L.W / 2 + 10, L.H - 140, 150, 54, () => openLevel(next), true);
  button('again', '再打一次', next && levelUnlocked(next) ? L.W / 2 - 160 : L.W / 2 - 75, L.H - 140, 150, 54, () => openLevel(lv), !(next && levelUnlocked(next)));
  button('resMap', '回地图', L.W / 2 - 60, L.H - 72, 120, 44, goMap);
}

// —— 开场 ——
function drawTitle() {
  const ctx = P.ctx;
  const sc = G.title.sc;
  const t = G.modeT;
  const d = Math.min(L.W * 0.82, L.H * 0.42);
  const tc = { x: L.W / 2, y: L.H * 0.3 + d / 2 + 10 };
  // 镜子慢慢扫过一片城
  const cam = { x: sc.w / 2 + Math.sin(t * 0.25) * (sc.w / 2 - d / 2 - 10), y: sc.h / 2 + Math.sin(t * 0.17) * 40 };
  ctx.save();
  ctx.beginPath();
  ctx.arc(tc.x, tc.y, d / 2, 0, Math.PI * 2);
  ctx.clip();
  scene.draw(ctx, sc, cam, tc.x, tc.y, d, { t: G.t, glint: Math.sin(t * 2) > 0.92 });
  ctx.fillStyle = 'rgba(10,5,20,0.15)';
  ctx.fillRect(0, 0, L.W, L.H);
  ctx.strokeStyle = 'rgba(27,21,48,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tc.x - d / 2, tc.y);
  ctx.lineTo(tc.x + d / 2, tc.y);
  ctx.moveTo(tc.x, tc.y - d / 2);
  ctx.lineTo(tc.x, tc.y + d / 2);
  ctx.stroke();
  ctx.restore();
  scopeRing(ctx, tc.x, tc.y, d);
  cut.logo(ctx, L, t);
  text('缩头找人 · 屏息开枪 · 谁先暴露谁死', L.W / 2, L.H * 0.14 + 92, 13, '#f4f1de', 'center', 700);

  const S = team.state();
  const by = Math.min(L.H - 230, tc.y + d / 2 + 24);
  button('start', S.cleared.length ? '继续比赛' : '开始比赛', L.W / 2 - 110, by, 220, 58, goMap, true);
  button('arena', '擂台 · 最好 ' + S.arenaBest, L.W / 2 - 160, by + 70, 150, 44, startArena);
  button('daily', S.daily[dayKey()] ? '每日 · ' + S.daily[dayKey()] + ' 秒' : '每日挑战', L.W / 2 + 10, by + 70, 150, 44, startDaily);
  button('team', S.revealed ? '战队' : '🔒 战队', L.W / 2 - 160, by + 124, 150, 44, () => {
    if (S.revealed) setMode('team');
    else toast('赢下第一次网吧赛就知道了');
  });
  button('classic', '原作玩法样机', L.W / 2 + 10, by + 124, 150, 44, startClassic);
  if (S.money) text('奖金 ¥' + S.money, L.W / 2, by + 186, 13, '#ffd23f', 'center', 800);
}

// —— 原作玩法样机 ——
function drawClassic() {
  const ctx = P.ctx;
  const c = G.classic;
  c.draw(ctx, scopeC.x, scopeC.y, G.t);
  if (!c.wide) scopeRing(ctx, scopeC.x, scopeC.y, D);
  // 上方：血、时间、还剩几个
  for (let i = 0; i < classic.HP; i++) drawHeart(ctx, 22 + i * 24, 30, i < c.hp ? 9 : 5);
  comicText(ctx, String(Math.ceil(c.left)), L.W / 2, 32, 26, c.left < 10 ? '#ff4d5e' : '#f4f1de');
  const alive = c.enemies.filter((e) => !e.dead).length;
  text('还剩 ' + alive + ' 个', L.W - 16, 30, 14, '#f4f1de', 'right', 800);
  if (G.modeT < 4 && c.state === 'play') text(c.wide ? '先用望远镜找人，左下切狙击镜开枪' : '左下切回望远镜', L.W / 2, scopeC.y + D / 2 + 26, 13, '#ffd23f', 'center', 800);
  if (c.say) comicText(ctx, c.say.text, L.W / 2, scopeC.y + D / 2 - 30, 22, '#ffd23f');
  // 左下：望远镜 / 狙击镜；右下：开枪（点一下就开）
  [[eyeBtn, c.wide ? '望远镜' : '狙击镜', '#3a3150'], [trigBtn, '开枪', c.wide ? '#2b2438' : '#c2263a']].forEach(([b, label, fill]) => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    text(label, b.x, b.y, 15, '#f4f1de', 'center', 900);
  });
  text('点左边切换', eyeBtn.x, eyeBtn.y + eyeBtn.r + 14, 10, '#9a90b0');
  if (c.state !== 'play') {
    ctx.fillStyle = 'rgba(10,6,18,0.86)';
    ctx.fillRect(0, 0, L.W, L.H);
    comicText(ctx, c.state === 'win' ? '全清！' : '被打死了', L.W / 2, 90, 40);
    const lines = [
      ['它好玩在：比谁先找到谁', '#ffd23f', 900],
      ['望远镜看得宽、不能开枪；狙击镜能开枪、看得窄', '#f4f1de', 600],
      ['→ 切过去那一下，赌自己找对了', '#c9c2e0', 600],
      ['他探头就在瞄你，镜片一亮 = 快开枪了', '#f4f1de', 600],
      ['→ 你和他在比手快', '#c9c2e0', 600],
      ['打空一枪，他们全知道你在哪', '#f4f1de', 600],
      ['→ 每一枪都要有把握', '#c9c2e0', 600],
      ['', '#fff', 600],
      ['它的毛病', '#ff4d5e', 900],
      ['电脑对手像打靶：只比手快，不比脑子', '#f4f1de', 600],
      ['他找你的过程看不见：紧张只靠倒计时', '#f4f1de', 600],
      ['真正好玩的是网上 1 对 1：对面是真人', '#f4f1de', 600],
    ];
    lines.forEach(([str, col, w], i) => text(str, L.W / 2, 150 + i * 28, 13, col, 'center', w));
    button('classicAgain', '再来一局', L.W / 2 - 160, L.H - 110, 150, 50, startClassic, true);
    button('classicHome', '回主页', L.W / 2 + 10, L.H - 110, 150, 50, goTitle);
  }
}

// —— 战队页 ——
function drawTeam() {
  const ctx = P.ctx;
  const S = team.state();
  ctx.fillStyle = S.base >= 2 ? '#14233a' : S.base === 1 ? '#1e1838' : '#1a1030';
  ctx.fillRect(0, 0, L.W, L.H);
  comicText(ctx, '战队', 60, 44, 32);
  text('奖金 ¥' + S.money, L.W - 16, 34, 16, '#ffd23f', 'right', 900);
  text('粉丝 ' + S.fans + ' · 冠军 ' + S.cups, L.W - 16, 56, 12, '#c9c2e0', 'right', 700);

  // 训练基地
  const base = team.BASES[S.base];
  const next = team.BASES[S.base + 1];
  roundRect(ctx, 14, 78, L.W - 28, 54, 10);
  ctx.fillStyle = '#2b2438';
  ctx.fill();
  text('🏠 ' + base.name, 28, 96, 15, '#f4f1de', 'left', 900);
  text('奖金 ×' + base.mul, 28, 117, 12, '#c9c2e0', 'left', 600);
  if (next) button('base', '升级 ¥' + base.cost, L.W - 130, 88, 106, 34, () => {
    if (!team.upgradeBase()) toast('奖金不够');
    else toast('搬进' + team.BASES[S.base].name + '！');
  }, S.money >= base.cost, S.money < base.cost);
  else text('满级', L.W - 40, 105, 13, '#ffd23f', 'right', 800);

  const top = 146;
  const rowH = Math.min(92, (L.H - top - 80) / team.TEAMMATES.length);
  team.TEAMMATES.forEach((m, i) => {
    const y = top + i * rowH;
    const lv = S.team[m.id] || 0;
    roundRect(ctx, 14, y, L.W - 28, rowH - 8, 10);
    ctx.fillStyle = '#3a3150';
    ctx.fill();
    // 头像
    ctx.save();
    ctx.beginPath();
    ctx.arc(46, y + (rowH - 8) / 2, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#f2d8a7';
    ctx.fill();
    ctx.clip();
    cut.person(ctx, 46, y + (rowH - 8) / 2 + 82, 0.9, m.look, { smile: true, team: '#ffd23f' });
    ctx.restore();
    text(m.name + '  ' + m.role, 82, y + 18, 15, '#f4f1de', 'left', 900);
    text('【' + m.buff + '】' + m.desc(lv), 82, y + 40, 11, '#ffd23f', 'left', 700);
    for (let k = 0; k < team.MAX_LV; k++) {
      ctx.beginPath();
      ctx.arc(88 + k * 14, y + 60, 5, 0, Math.PI * 2);
      ctx.fillStyle = k < lv ? '#ffd23f' : '#2b2438';
      ctx.fill();
    }
    if (lv < team.MAX_LV) {
      const cost = team.trainCost(lv);
      button('train_' + m.id, '练 ¥' + cost, L.W - 100, y + rowH - 46, 76, 32, () => {
        if (!team.train(m.id)) toast('奖金不够');
      }, S.money >= cost, S.money < cost);
    } else text('满级', L.W - 40, y + rowH - 30, 13, '#ffd23f', 'right', 800);
  });

  button('back', '回主页', 20, L.H - 66, 120, 44, goTitle);
  button('replay', '重看揭晓', L.W - 140, L.H - 66, 120, 44, () => setMode('reveal'));
}

// —— 网吧赛赢了 ——
function drawReveal() {
  const ctx = P.ctx;
  const t = G.modeT;
  cut.revealScene(ctx, L, t, team.TEAMMATES, { title: '职业战队！' });
  const done = G.modeT > cut.REVEAL_SEC - 0.6;
  if (!done && G.modeT > 1) text('点一下跳过', L.W - 16, L.H - 20, 11, 'rgba(244,241,222,0.5)', 'right');
  if (done) {
    button('toTeam', '进入战队', L.W / 2 - 110, L.H - 126, 220, 54, () => setMode('team'), true);
    button('home2', '回地图', L.W / 2 - 60, L.H - 62, 120, 40, goMap);
  }
}

function render() {
  const ctx = P.ctx;
  G.buttons = [];
  ctx.setTransform(P.dpr * scale, 0, 0, P.dpr * scale, 0, 0);
  ctx.fillStyle = '#120c1c';
  ctx.fillRect(0, 0, L.W, L.H);
  const m = G.mode;
  // 震屏
  if (G.shake > 0) ctx.translate((Math.random() - 0.5) * 12 * G.shake, (Math.random() - 0.5) * 12 * G.shake);

  if (m === 'title') drawTitle();
  else if (m === 'classic') drawClassic();
  else if (m === 'team') drawTeam();
  else if (m === 'map') drawMap();
  else if (m === 'loadout') drawLoadout();
  else if (m === 'result') drawResult();
  else if (m === 'bossIntro') drawBossIntro();
  else if (m === 'arenaNext') drawArenaNext();
  else if (m === 'dailyDone') drawDailyDone();
  else if (m === 'reveal') drawReveal();
  else if (m === 'move') cut.relocate(ctx, L, G.modeT, G.duel.sc.theme, scopeC, D);
  else if (m === 'rescue') {
    cut.rescue(ctx, L, G.modeT, G.duel.sc.theme);
    const left = cut.RESCUE_SEC - G.modeT;
    if (left < 0.4) cut.iris(ctx, L, scopeC.x, scopeC.y, lerp(D / 2, L.H, left / 0.4));
  } else if (m === 'hit') drawHit();
  else if (m === 'fail') drawFail();
  else if (m === 'gun') drawGun();
  else if (G.duel && G.duel.kind === 'mission' && (!G.zoom || m === 'brief' || m === 'teach')) {
    ctx.fillStyle = '#120c1c';
    ctx.fillRect(0, 0, L.W, L.H);
    drawWide();
  } else drawScope({});

  if (m === 'play' || m === 'hit' || m === 'intro' || m === 'teach' || m === 'ammoGift' || m === 'brief') drawHud();
  if (m === 'teach') drawTeach();
  if (m === 'brief') drawBrief();

  if (m === 'intro') {
    const R = G.duel.round;
    const o = G.duel.opp;
    const ck = G.duel.coverKind();
    const sub = G.duel.sc.theme.name + ' · ' + o.name + (R.cond ? ' · ' + config.conditions[R.cond].name : '') + (ck ? ' · ' + config.covers[ck].name : '');
    const title = G.arena ? '擂台 · 第 ' + (G.arena.streak + 1) + ' 个' : G.level.rounds.length > 1 ? (G.daily ? '每日 ' : '') + '回合 ' + (G.roundIdx + 1) + ' / ' + G.level.rounds.length : '第 ' + G.level.no + ' 关';
    comicPanel(title, sub, '破绽：' + o.tell);
  } else if (m === 'ammoGift') {
    // 小雨从旁边扔来一发子弹
    const k = clamp(G.modeT / 0.8, 0, 1);
    const x = lerp(-20, L.W / 2, k);
    const y = lerp(L.H * 0.3, L.H * 0.5, k) - Math.sin(k * Math.PI) * 120;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(G.modeT * 12);
    drawBullet(ctx, 0, 0, true);
    ctx.restore();
    comicText(ctx, '接着！', L.W / 2, L.H * 0.36, 30);
  } else if (m === 'ad') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, L.W, L.H);
    text('广告占位（上线后换成激励视频）', L.W / 2, L.H / 2 - 10, 16, '#9a90b0');
    text(String(Math.ceil(config.fakeAdSec - G.modeT)), L.W / 2, L.H / 2 + 44, 40, '#9a90b0', 'center', 900);
  } else if (m === 'adWait') {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, L.W, L.H);
  }

  if (G.toast) {
    const a = Math.min(1, (2.2 - G.toast.t) * 3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    roundRect(ctx, L.W / 2 - 140, L.H * 0.8, 280, 40, 20);
    ctx.fillStyle = '#f4f1de';
    ctx.fill();
    text(G.toast.text, L.W / 2, L.H * 0.8 + 20, 14, INK, 'center', 800);
    ctx.restore();
  }

  text(config.version, L.W - 10, L.H - 8, 10, 'rgba(244,241,222,0.35)', 'right', 500);
}

let last = platform.now();
function frame() {
  const t = platform.now();
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  update(dt);
  render();
  platform.nextFrame(frame);
}

// Midjourney 背景图：有标记的就去载图，载到了那张地图就换成图
const bgslots = require('./bgslots.js');
Object.keys(bgslots).forEach((id) => platform.loadImage(bgslots[id].image, (img) => scene.registerArt(id, img, bgslots[id])));

goTitle();
platform.exposeForTest('__vasily', { startArena, startDaily, retryRound, G, config, scene, team, cut, LV, scopeC, D, eyeBtn, trigBtn, panelR, scale, setMode, openLevel, startLevel, startRound, afterHit, finishLevel, goMap, startClassic, levelUnlocked });
platform.nextFrame(frame);
