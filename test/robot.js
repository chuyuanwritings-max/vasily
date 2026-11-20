// 测试机器人：在手机大小的浏览器里把第一章从开场点到 Boss 和战队页。用法：node test/robot.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const shots = path.join(__dirname, 'shots');
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'preview.html'));
  await page.waitForTimeout(600);
  const ok = [];
  const check = (cond, msg) => { if (!cond) throw new Error('没通过：' + msg); ok.push(msg); };
  const g = (fn, arg) => page.evaluate(fn, arg);
  const S = await g(() => __vasily.scale);
  const btn = await g(() => ({ eye: __vasily.eyeBtn, trig: __vasily.trigBtn }));
  const at = (b) => [b.x * S, b.y * S];
  const snap = (n) => page.screenshot({ path: path.join(shots, n + '.png') });
  const clickBtn = async (id) => {
    const b = await g((i) => __vasily.G.buttons.find((x) => x.id === i), id);
    if (!b) throw new Error('找不到按钮 ' + id);
    await page.mouse.click((b.x + b.w / 2) * S, (b.y + b.h / 2) * S);
    await page.waitForTimeout(120);
  };
  const mode = () => g(() => __vasily.G.mode);
  const tap = async () => { await page.mouse.click(195, 300); await page.waitForTimeout(150); };
  // 直接让这一枪打中他（他探着头、准星正对他的头、屏息稳住）
  const shootSniper = () => g(() => {
    const V = __vasily; const d = V.G.duel;
    d.enemy.mode = 'peek'; d.enemy.timer = 9; d.sc.enemy.lift = 1; d.relocating = false;
    const h = V.scene.enemyHead(d.sc, 1);
    d.cam.x = h.x; d.cam.y = h.y; d.sway.x = 0; d.sway.y = 0; d.duck = 0; d.moving = 0;
    d.reloadSec = 0; d.recoverSec = 0; d.holding = true; d.holdSec = 1;
    return d.triggerUp();
  });
  // 打开某一关一直到能开枪
  const enterLevel = async (i) => {
    await g((k) => { const V = __vasily; V.openLevel(V.LV.CAFE[k]); }, i);
    await page.waitForTimeout(100);
    await clickBtn('go');
    await page.waitForTimeout(700);
    if ((await mode()) === 'bossIntro') { await tap(); await page.waitForTimeout(700); }
    await tap(); await page.waitForTimeout(350);
    await tap(); await page.waitForTimeout(200);
  };

  // —— 开场 → 第一座城（0.8 照《Sniper 3D》） ——
  await snap('01_开场');
  check((await mode()) === 'title', '打开先是开场界面');
  await clickBtn('start');
  check((await mode()) === 'map', '点「开始比赛」进第一座城的地图');
  const cityInfo = await g(() => { const L = __vasily.LV.LEVELS; const n = (t) => L.filter((l) => l.type === t).length; return { all: L.length, a: n('教学'), b: n('主线'), c: n('特别任务') }; });
  check(cityInfo.all === 20 && cityInfo.a === 3 && cityInfo.b === 12 && cityInfo.c === 5, '第一座城 20 关：教学 3、主线 12、特别任务 5');
  await snap('02_地图');
  await clickBtn('lv_d2');
  check((await g(() => __vasily.G.toast && __vasily.G.toast.text)) === '先过前一关', '第二关锁着：先过前一关');

  // —— 第一关：目标卡 → 全景 → 点一下放大 → 开枪 ——
  await clickBtn('lv_d1');
  check((await mode()) === 'teach', '第一关不带卡，直接一页说明（点全景放大、按住开枪）');
  await snap('03_说明');
  await page.waitForTimeout(700); await tap(); await page.waitForTimeout(650);
  check((await mode()) === 'brief', '开局一张目标卡：一句话 + 特征图标');
  await snap('04_目标卡');
  check((await g(() => __vasily.G.duel.kind === 'mission' && __vasily.G.duel.targets.length === 1 && __vasily.G.duel.sc.people.length === 4)), '第一关四个人，只有一个穿红衣服');
  await tap(); await page.waitForTimeout(200);
  check((await mode()) === 'play' && !(await g(() => __vasily.G.zoom)), '先看全景');
  await snap('05_全景');
  await page.mouse.click(...at(btn.trig));
  check(!(await g(() => __vasily.G.zoom)) && (await g(() => __vasily.G.duel.shots)) === 0, '全景里不能开枪：要先放大');
  const tp = await g(() => { const V = __vasily; const p = V.G.duel.targets[0]; return p.where === 'win' ? { x: p.x, y: p.y + 8 } : { x: p.x, y: p.y - 30 }; });
  const wideY = await g(() => __vasily.scopeC.y - (375 * 600 / 860) / 2);
  await page.mouse.click((tp.x * 375 / 860) * S, (wideY + tp.y * 375 / 860) * S);
  await page.waitForTimeout(200);
  const zc = await g(() => ({ z: __vasily.G.zoom, x: __vasily.G.duel.cam.x, y: __vasily.G.duel.cam.y }));
  check(zc.z && Math.abs(zc.x - tp.x) < 6 && Math.abs(zc.y - tp.y) < 6, '点全景里的一处：镜子放大到那里');
  await snap('06_放大');
  // 打错人：路人吓得躲起来，扣 8 秒
  const mw = await g(() => {
    const V = __vasily; const d = V.G.duel; const c = d.sc.people.find((p) => p.role === 'civ');
    const h = c.where === 'win' ? { x: c.x, y: c.y + 8 } : { x: c.x, y: c.y - 30 };
    d.cam.x = h.x; d.cam.y = h.y; d.sway.x = 0; d.sway.y = 0; d.reloadSec = 0; d.recoverSec = 0; d.holding = true; d.holdSec = 1;
    const t0 = d.timeLeft; const r = d.triggerUp(); return { kind: r.kind, dt: t0 - d.timeLeft, hid: !!c.hid, down: !!c.down };
  });
  check(mw.kind === 'wrong' && mw.dt >= 7.9 && mw.hid && !mw.down, '打错人：路人吓得躲起来（没有血），扣 8 秒');
  await page.waitForTimeout(150); await snap('07_打错人');
  const mh = await g(() => {
    const V = __vasily; const d = V.G.duel; const p = d.targets[0]; const h = p.where === 'win' ? { x: p.x, y: p.y + 8 } : { x: p.x, y: p.y - 30 };
    d.cam.x = h.x; d.cam.y = h.y; d.sway.x = 0; d.sway.y = 0; d.reloadSec = 0; d.recoverSec = 0; d.holding = true; d.holdSec = 1; return d.triggerUp();
  });
  check(mh.hit && mh.head, '准星对着他的头：爆头');
  await page.waitForTimeout(700); await snap('08_爆头');
  await page.waitForFunction(() => __vasily.G.mode === 'result', null, { timeout: 4000 });
  await page.waitForTimeout(2500); await snap('09_结算');
  const mr = await g(() => ({ r: __vasily.G.resultInfo, s: __vasily.team.state(), next: __vasily.levelUnlocked(__vasily.LV.LEVELS[1]) }));
  check(mr.r.conds[0] && !mr.r.conds[1] && mr.r.stars === 2 && mr.r.heads === 1, '结算：爆头那颗星拿到，打错过人那颗没拿到');
  check(mr.s.money >= 20 + 10 * 2 + 15 && mr.next, '金币：过关 + 星星 + 爆头另外多给；开下一关');

  // —— 升级枪 ——
  await clickBtn('resMap');
  await g(() => { __vasily.team.state().money += 500; });
  await clickBtn('mapGun');
  check((await mode()) === 'gun', '地图页「升级枪」');
  await clickBtn('gun_zoom'); await clickBtn('gun_clip');
  await snap('10_升级枪');
  const gun = await g(() => { const V = __vasily; const S = V.team.state(); return { z: S.gun.zoom, c: S.gun.clip, m: V.team.gunMods() }; });
  check(gun.z === 1 && gun.c === 1 && gun.m.hitRadiusAdd > 0 && gun.m.clipAdd === 1, '升级瞄准镜、弹匣：判定圈变大、每关多一发');
  await clickBtn('gunBack');

  // —— 二十关都能生成，而且线索只对得上目标 ——
  const uniq = await g(() => {
    const V = __vasily; const { createMission } = __require('')('./js/mission.js'); const people = __require('')('./js/people.js');
    let bad = [], n = 0;
    V.LV.LEVELS.forEach((lv) => lv.rounds.forEach((R) => {
      if (!R.mission) return;
      for (let s = 0; s < 40; s++) {
        const d = createMission({ seed: s * 31 + 7, config: V.config, scopeD: V.D, round: R, levelIndex: lv.index });
        const keys = Object.keys(R.mission.clue || {});
        const want = R.mission.targets === undefined ? 1 : R.mission.targets;
        if (d.targets.length !== want) bad.push(lv.id + ' 目标数 ' + d.targets.length);
        if (keys.length) {
          const m = d.sc.people.filter((p) => people.matches(p.traits, R.mission.clue)).length;
          if (m !== want) bad.push(lv.id + ' 对得上线索的 ' + m);
        }
        n++;
      }
    }));
    return { bad: bad.slice(0, 5), n };
  });
  check(uniq.bad.length === 0, '每关 40 个随机局（共 ' + uniq.n + ' 局）：对得上线索的只有目标' + (uniq.bad.length ? '：' + uniq.bad.join(' | ') : ''));

  // —— 各种花样 ——
  const kinds = await g(() => {
    const V = __vasily; const { createMission } = __require('')('./js/mission.js'); const people = __require('')('./js/people.js');
    const mk = (id) => { const lv = V.LV.LEVELS.find((l) => l.id === id); return createMission({ seed: 77, config: V.config, scopeD: V.D, round: lv.rounds[0], levelIndex: lv.index }); };
    const run = (d, sec, each) => { for (let i = 0; i < sec * 60 && d.state === 'play'; i++) { d.update(1 / 60); if (each) each(d); } return d.state; };
    const shoot = (d, h) => { d.cam.x = h.x; d.cam.y = h.y; d.sway = { x: 0, y: 0 }; d.reloadSec = 0; d.recoverSec = 0; d.holding = true; d.holdSec = 1; d.duck = 0; return d.triggerUp(); };
    const out = {};
    out.runner = run(mk('d3'), 60);
    out.bomber = run(mk('d11'), 30);
    const du = mk('d5'); out.duelDead = run(du, 10);
    const du2 = mk('d5'); run(du2, 3, (d) => { d.duckHeld = true; }); out.duelDuck = du2.drawLeft > 6 && du2.state === 'play';
    out.car = run(mk('s1'), 60);
    const lt = mk('s4'); shoot(lt, people.head(lt.targets[0])); out.lightFlee = run(lt, 6);
    const lt2 = mk('s4'); const L = lt2.sc.lamp; shoot(lt2, { x: L.x, y: L.y - 4 }); const lampOff = !L.on;
    lt2.targets.forEach((p) => shoot(lt2, people.head(p))); out.lightWin = lampOff && lt2.state === 'hit';
    const as = mk('d12'); let gunSeen = false; run(as, 15, (d) => { if (d.targets[0].traits.gun) gunSeen = true; }); out.assassin = gunSeen;
    const mu = mk('d8'); const r1 = shoot(mu, people.head(mu.targets[0])); out.multi = r1.hit && mu.state === 'play' && mu.targetsLeft() === 4;
    const dk = mk('s2'); let lit = false; run(dk, 6, (d) => { if (d.targets.some((p) => p.lighter > 0)) lit = true; }); out.dark = lit && dk.sc.night;
    return out;
  });
  check(kinds.runner === 'escaped', '会跑：他跑出画面就输');
  check(kinds.bomber === 'boom', '炸弹包：倒计时到零就炸，输');
  check(kinds.duelDead === 'dead' && kinds.duelDuck, '一枪定生死：露着头他的倒计时就走，缩着头他慢慢丢了你');
  check(kinds.car === 'escaped', '追车：车开出画面就跑了');
  check(kinds.lightFlee === 'escaped' && kinds.lightWin, '先打灯：灯亮着打倒一个其他人就跑；先打灭灯就能一个个打');
  check(kinds.assassin, '装成路人：他会突然掏枪');
  check(kinds.multi, '限时多杀：打倒一个还剩四个，接着打');
  check(kinds.dark, '暗处交易：夜里，看打火机的光');
  check(await g(() => { const s5 = __vasily.LV.LEVELS.find((l) => l.id === 's5'); const s3 = __vasily.LV.LEVELS.find((l) => l.id === 's3'); return s5.rounds.length === 5 && !s5.rounds[0].mission && s3.rounds[0].goal === 'escort'; }), '特别任务三、五是对狙：掩护小雨、五个藏着的狙击手');

  // —— 0.7 的网吧赛对狙：规则照旧（不在地图上，第二章可能拿回来） ——
  await enterLevel(0);
  check((await mode()) === 'play', '点两下进对狙');
  check((await g(() => __vasily.G.duel.sc.figures.length)) === 4, '第一关对面四个人影，只有一个是狙击手');
  check((await g(() => __vasily.G.duel.sc.props.length)) >= 6, '窗里还有像人头的东西（花盆、猫、台灯、模特……）');
  const propShot = await g(() => {
    const V = __vasily; const d = V.G.duel; const p = d.sc.props[0]; const h = V.scene.propHead(p);
    d.cam.x = h.x; d.cam.y = h.y; d.sway.x = 0; d.sway.y = 0; d.reloadSec = 0; d.recoverSec = 0; d.holding = true; d.holdSec = 1;
    const r = d.triggerUp(); d.bullets += 1; d.timeLeft += 8; return r.kind;
  });
  check(propShot === 'wrong', '打中花盆、模特这些东西：算打错人');

  // 缩头 = 眨眼
  const pose0 = await g(() => __vasily.G.duel.sc.enemy.pose);
  await page.mouse.click(...at(btn.eye));
  await page.waitForTimeout(450);
  check((await g(() => __vasily.G.duel.sc.enemy.pose)) !== pose0, '缩一下头再起来，他挪了一点');
  await page.mouse.move(...at(btn.eye)); await page.mouse.down(); await page.waitForTimeout(300);
  await g(() => __vasily.G.duel.triggerDown());
  check(!(await g(() => __vasily.G.duel.holding)), '缩着头不能开枪');
  await page.mouse.up(); await page.waitForTimeout(300);

  // 认出他：红圈靠近你、他探着头时镜片反光
  const gl = await g(() => { const d = __vasily.G.duel; d.enemy.mode = 'peek'; d.enemy.timer = 9; d.sc.enemy.lift = 1; d.seek.x = d.seek.tx = d.me.c + 1 > 5 ? d.me.c - 1 : d.me.c + 1; d.seek.y = d.seek.ty = d.me.r; d.seek.dwell = 9; let seen = false; for (let i = 0; i < 60; i++) { d.t += 1 / 60; if (d.glint()) seen = true; } return seen; });
  check(gl, '红圈靠近你时，他的镜片会反光（认人的线索）');
  await page.waitForTimeout(100);
  await snap('06_镜片反光');

  // 打错人：子弹少一发、扣 8 秒
  const wrong = await g(() => {
    const V = __vasily; const d = V.G.duel; const civ = d.sc.figures.find((f) => f.kind === 'civ');
    civ.lift = 1; civ.away = false; civ.timer = 9; const h = V.scene.figureHead(civ);
    d.cam.x = h.x; d.cam.y = h.y; d.sway.x = 0; d.sway.y = 0; d.reloadSec = 0; d.recoverSec = 0; d.holding = true; d.holdSec = 1;
    const b0 = d.bullets; const t0 = d.timeLeft; const r = d.triggerUp();
    return { kind: r.kind, db: b0 - d.bullets, dt: t0 - d.timeLeft };
  });
  check(wrong.kind === 'wrong' && wrong.db === 1 && wrong.dt >= 7.9, '打错人：少一发子弹，扣 8 秒');
  await page.waitForTimeout(120);
  await snap('07_打错人');

  // 换窗：点下面那栋楼的另一扇窗
  const me0 = await g(() => ({ ...__vasily.G.duel.me }));
  const cell = await g(() => { const V = __vasily; const p = V.panelR; const d = V.G.duel; const c = (d.me.c + 3) % 6; const cw = (p.w - 20) / 6; const ch = (p.h - 22) / 3; return { x: p.x + 10 + cw * (c + 0.5), y: p.y + 16 + ch * (d.me.r + 0.5), c }; });
  await page.mouse.click(cell.x * S, cell.y * S);
  await page.waitForTimeout(300);
  check((await g(() => __vasily.G.duel.moving)) > 0, '点另一扇窗：开始爬过去');
  await snap('08_换窗');
  await page.waitForTimeout(1500);
  const me1 = await g(() => ({ me: { ...__vasily.G.duel.me }, heat: __vasily.G.duel.heat }));
  check(me1.me.c === cell.c && me1.me.c !== me0.c && me1.heat < 0.1, '爬到新窗：他对你位置的把握清零');

  // 他会学你：同一扇窗露头三次，他预先瞄着
  await g(() => { const d = __vasily.G.duel; d.peeks = 0; d.enemy.mode = 'hide'; d.enemy.timer = 9; });
  for (let i = 0; i < 3; i++) { await page.mouse.click(...at(btn.eye)); await page.waitForTimeout(400); }
  const learned = await g(() => { const d = __vasily.G.duel; return { peeks: d.peeks, onMe: d.onMe(), heat: d.heat }; });
  check(learned.peeks >= 3 && learned.onMe && learned.heat >= 0.9, '同一扇窗露头三次：他记住了，红圈直接等在你窗口');

  // 打空：他缩回去换窗
  const win0 = await g(() => __vasily.G.duel.sc.enemy.win.x + ',' + __vasily.G.duel.sc.enemy.win.y);
  await g(() => { const d = __vasily.G.duel; d.lock = 0; d.heat = 0; d.cam.x = 200; d.cam.y = 200; d.sway.x = 0; d.sway.y = 0; d.reloadSec = 0; d.recoverSec = 0; d.holding = true; d.holdSec = 1; d.triggerUp(); });
  await page.waitForFunction(() => !__vasily.G.duel.relocating, null, { timeout: 4000 });
  const win1 = await g(() => __vasily.G.duel.sc.enemy.win.x + ',' + __vasily.G.duel.sc.enemy.win.y);
  check(win1 !== win0, '打空一发：他缩回去，换一扇窗重新藏');

  // 子弹打光 → 小雨扔一发（广告占位）
  await g(() => { const d = __vasily.G.duel; d.lock = 0; d.heat = 0; d.drawLeft = -1; d.cam.x = 600; d.cam.y = 200; d.sway.x = 0; d.sway.y = 0; d.reloadSec = 0; d.recoverSec = 0; d.duck = 0; d.holding = true; d.holdSec = 1; d.triggerUp(); });
  await page.waitForTimeout(150);
  await page.waitForFunction(() => ['fail', 'play'].includes(__vasily.G.mode), null, { timeout: 3000 });
  check((await mode()) === 'fail' && (await g(() => __vasily.G.failReason)) === 'dry', '三发都浪费了：子弹打光');
  check((await g(() => __vasily.G.near)).indexOf('最近一枪') === 0, '失败页写清差多少：' + (await g(() => __vasily.G.near)));
  await snap('09_子弹打光');
  await clickBtn('ammo');
  check((await mode()) === 'ad', '让小雨扔子弹：先放广告占位');
  await page.waitForFunction(() => __vasily.G.mode === 'ammoGift', null, { timeout: 5000 });
  await page.waitForTimeout(400); await snap('10_小雨扔子弹');
  await page.waitForFunction(() => __vasily.G.mode === 'play', null, { timeout: 3000 });
  check((await g(() => __vasily.G.duel.bullets)) === 1, '接住一发，接着打');

  // 打中：三格子弹时间 → 结算星星
  const hit = await shootSniper();
  check(hit.hit, '打中狙击手');
  await page.waitForTimeout(150); await snap('11a_嘣');
  await page.waitForTimeout(350); await snap('11b_子弹飞');
  await page.waitForTimeout(500); await snap('11c_爆头');
  await page.waitForFunction(() => __vasily.G.mode === 'result', null, { timeout: 4000 });
  await page.waitForTimeout(2500);
  await snap('12_结算');
  const res = await g(() => ({ r: __vasily.G.resultInfo, s: __vasily.team.state() }));
  check(res.r.stars >= 1 && res.s.stars.c1 === res.r.stars && res.s.money > 0, '过关：记下星星（' + res.r.stars + ' 颗）、拿奖金');
  check(!res.r.conds[0], '浪费了子弹：「一发没浪费」那颗星没拿到');
  check(await g(() => __vasily.team.state().cleared.indexOf('c1') >= 0), '对狙过关也记账');

  // —— 第三关：两个回合，中间换点位；焦躁型敲窗台 ——
  await g(() => { __vasily.team.state().cleared.push('c2'); });
  await enterLevel(2);
  check((await mode()) === 'play' && (await g(() => __vasily.G.level.rounds.length)) === 2, '第三关两个回合');
  const tapSeen = await g(() => { const d = __vasily.G.duel; d.enemy.mode = 'hide'; d.enemy.timer = 9; return d.tapping(); });
  check(tapSeen, '焦躁型缩着时敲窗台（他的破绽）');
  await shootSniper();
  await page.waitForFunction(() => __vasily.G.mode === 'move', null, { timeout: 4000 });
  check(true, '打完一个回合：跑去下一个点位');
  await page.waitForFunction(() => __vasily.G.mode === 'intro', null, { timeout: 4000 });
  await tap();
  check((await g(() => __vasily.G.roundIdx)) === 1, '进第二个回合');
  // 被瞄准 → 叫小雨拉起来 → 重打这个回合
  await g(() => { const d = __vasily.G.duel; d.helmets = 0; d.enemy.mode = 'peek'; d.enemy.timer = 9; d.seek.x = d.seek.tx = d.me.c; d.seek.y = d.seek.ty = d.me.r; d.seek.dwell = 9; d.lock = 0.95; });
  await page.waitForFunction(() => __vasily.G.duel.drawLeft >= 0, null, { timeout: 3000 });
  await snap('13_他瞄准你');
  await page.waitForFunction(() => __vasily.G.mode === 'fail', null, { timeout: 3000 });
  check((await g(() => __vasily.G.near)).length > 0, '被打死：失败页写差多少，「小雨拉你起来」就在这一页');
  await clickBtn('rescue');
  await page.waitForFunction(() => __vasily.G.mode === 'rescue', null, { timeout: 5000 });
  await page.waitForFunction(() => __vasily.G.mode === 'play', null, { timeout: 5000 });
  check(await g(() => __vasily.G.attempt === 1 && __vasily.G.stats.rescued === 1), '被打死：小雨拉起来，重打这个回合');
  await shootSniper();
  await page.waitForFunction(() => __vasily.G.mode === 'result', null, { timeout: 4000 });
  check(await g(() => !__vasily.G.resultInfo.conds[1]), '叫了拉人：「没叫队友拉人」那颗星没拿到');

  // —— 第四关：大雾一阵一阵 ——
  await g(() => { const s = __vasily.team.state(); ['c3'].forEach((id) => s.cleared.indexOf(id) < 0 && s.cleared.push(id)); });
  await enterLevel(3);
  const fogs = await g(() => { const d = __vasily.G.duel; let lo = 9, hi = 0; for (let i = 0; i < 600; i++) { d.t += 1 / 60; d.update(0); lo = Math.min(lo, d.fog); hi = Math.max(hi, d.fog); } return { lo, hi }; });
  check(fogs.hi > 0.8, '大雾：会浓到看不清');
  await page.waitForTimeout(200); await snap('14_大雾');

  // —— 第五关：假人 ——
  await g(() => { __vasily.team.state().cleared.push('c4'); });
  await enterLevel(4);
  const dk = await g(() => { const V = __vasily; const d = V.G.duel; const q = d.sc.figures.find((f) => f.kind === 'decoy'); if (!q) return 'none'; q.lift = 1; q.up = true; q.timer = 9; const h = V.scene.figureHead(q); d.cam.x = h.x; d.cam.y = h.y; d.sway.x = 0; d.sway.y = 0; d.reloadSec = 0; d.recoverSec = 0; d.holding = true; d.holdSec = 1; return d.triggerUp().kind; });
  check(dk === 'decoy', '狡猾型摆了头盔假人：打中假人算打错');

  // —— 第六关：掩护小雨 ——
  await g(() => { __vasily.team.state().cleared.push('c5'); });
  await enterLevel(5);
  const esc = await g(() => { const d = __vasily.G.duel; const m = d.sc.mate; m.state = 'run'; m.timer = 9; d.enemy.mode = 'peek'; d.enemy.timer = 99; return d.aimingMate(); });
  check(esc, '小雨在街上跑、他探着头：他瞄的是小雨，不是你');
  await page.waitForTimeout(300); await snap('15_掩护小雨');
  await g(() => { const m = __vasily.G.duel.sc.mate; m.lock = 0.98; m.state = 'run'; m.covers = [m.x, m.x + 2000]; m.next = 1; });
  await page.waitForFunction(() => __vasily.G.mode === 'fail', null, { timeout: 4000 });
  check((await g(() => __vasily.G.failReason)) === 'mateDown', '小雨被锁定满了：这关输');
  await page.waitForTimeout(2300); await snap('16_输了回放');

  // —— 第七关：鸽子 + 换位型 ——
  await g(() => { __vasily.team.state().cleared.push('c6'); });
  await enterLevel(6);
  const pig = await g(() => { const d = __vasily.G.duel; d.enemy.mode = 'hide'; d.enemy.timer = 0.01; d.update(0.05); d.update(0.05); return d.sc.flocks.some((f) => f.state === 'fly'); });
  check(pig, '他探头：那栋楼顶的鸽子飞起来（线索）');
  const mv = await g(() => { const V = __vasily; const d = V.G.duel; const w0 = d.sc.enemy.win; d.enemy.mode = 'peek'; d.enemy.timer = 9; d.sc.enemy.lift = 1; const h = V.scene.enemyHead(d.sc, 1); d.cam.x = h.x; d.cam.y = h.y; d.duck = 0; for (let i = 0; i < 120; i++) { d.update(1 / 60); d.cam.x = V.scene.enemyHead(d.sc, 1).x; } return { moved: d.sc.enemy.win !== w0, trail: d.sc.trail.length }; });
  check(mv.moved && mv.trail > 0, '换位型被你盯住就换窗，路过的窗帘一扇扇动');

  // —— 第八关：夜里，一发子弹 ——
  await g(() => { __vasily.team.state().cleared.push('c7'); });
  await enterLevel(7);
  check(await g(() => __vasily.G.duel.sc.night && __vasily.G.duel.bullets === 1), '夜里、每回合只有一发子弹');
  await page.waitForTimeout(200); await snap('17_夜里');
  // 时间到
  await g(() => { __vasily.G.duel.timeLeft = 0.05; });
  await page.waitForFunction(() => __vasily.G.mode === 'fail', null, { timeout: 3000 });
  check((await g(() => __vasily.G.failReason)) === 'timeout', '倒计时到了：输');
  await page.waitForTimeout(300);
  await clickBtn('retry');
  check((await mode()) === 'play', '输了点一下「再来」：直接回到这个回合开打（不放说明页）');
  const rs = await g(() => __vasily.G.metrics.retrySec.slice(-1)[0]);
  check(rs < 3, '死到重开 ' + rs + ' 秒（≤ 3 秒）');

  // —— Boss：三条命，每挨一枪换一招 ——
  await g(() => { const s = __vasily.team.state(); s.cleared.push('c8'); ['c1', 'c2', 'c3', 'c4', 'c5'].forEach((id) => (s.stars[id] = 2)); });
  await enterLevel(8);
  check((await mode()) === 'play' && (await g(() => __vasily.G.duel.bossHp)) === 3, 'Boss 关：先放出场动画，再开打；他有三条命');
  const b1 = await shootSniper();
  const st1 = await g(() => ({ hp: __vasily.G.duel.bossHp, ph: __vasily.G.duel.phase, st: __vasily.G.duel.state, b: __vasily.G.duel.bullets }));
  check(b1.boss && st1.hp === 2 && st1.ph === 1 && st1.st === 'play' && st1.b === 3, 'Boss 挨第一枪：还没完，换第二招，子弹重给三发');
  await page.waitForTimeout(250); await snap('18_Boss还没完');
  await page.waitForFunction(() => !__vasily.G.duel.relocating, null, { timeout: 4000 });
  await shootSniper();
  await page.waitForFunction(() => !__vasily.G.duel.relocating, null, { timeout: 4000 });
  check(await g(() => __vasily.G.duel.sc.figures.filter((f) => f.kind === 'decoy').length >= 2 && __vasily.G.duel.tactic().cover === 'steam'), 'Boss 第三段：摆两个假人，还放蒸汽');
  await shootSniper();
  await page.waitForFunction(() => __vasily.G.mode === 'result', null, { timeout: 5000 });
  await page.waitForTimeout(2500);
  check(await g(() => __vasily.G.resultInfo.reveal && __vasily.team.state().revealed), '第一次打败 Boss：网吧揭晓，战队解锁');
  await snap('19_Boss结算');
  await clickBtn('continue');
  check((await mode()) === 'reveal', '继续：放网吧揭晓');

  // 擂台：赢一个叠一个加难，输了从头来
  await g(() => __vasily.startArena());
  await page.waitForTimeout(450);
  await tap();
  check((await mode()) === 'play' && (await g(() => __vasily.G.arena.streak)) === 0, '擂台：开打');
  await shootSniper();
  await page.waitForFunction(() => __vasily.G.mode === 'arenaNext', null, { timeout: 4000 });
  check(await g(() => __vasily.G.arena.streak === 1 && __vasily.G.arena.mods.length === 1), '擂台赢一个：连胜 1，叠一个加难');
  await page.waitForTimeout(400); await snap('20_擂台连胜');
  await page.waitForFunction(() => __vasily.G.mode === 'intro', null, { timeout: 4000 });
  await page.waitForTimeout(450);
  await tap();
  await g(() => { __vasily.G.duel.timeLeft = 0.05; });
  await page.waitForFunction(() => __vasily.G.mode === 'fail', null, { timeout: 3000 });
  check((await g(() => __vasily.team.state().arenaBest)) >= 1, '擂台输了：记下最高连胜');
  await clickBtn('retry');
  check(await g(() => __vasily.G.arena.streak === 0 && __vasily.G.arena.mods.length === 0), '擂台再来：从头打');

  // 每日挑战：今天同一局，重来还是同一局
  await g(() => __vasily.startDaily());
  const layout1 = await g(() => __vasily.G.duel.sc.figures.map((f) => f.win.x + ',' + f.win.y).join('|'));
  await g(() => __vasily.startDaily());
  const layout2 = await g(() => __vasily.G.duel.sc.figures.map((f) => f.win.x + ',' + f.win.y).join('|'));
  check(layout1 === layout2 && (await g(() => __vasily.G.level.rounds.length)) === 3, '每日挑战：今天所有人同一局（三个回合），重来也一样');
  await page.waitForTimeout(450);
  await tap();
  for (let i = 0; i < 3; i++) {
    await shootSniper();
    if (i < 2) { await page.waitForFunction(() => __vasily.G.mode === 'move', null, { timeout: 4000 }); await g(() => { __vasily.G.mode = 'play'; }); }
  }
  await page.waitForFunction(() => __vasily.G.mode === 'dailyDone', null, { timeout: 5000 });
  await page.waitForTimeout(900); await snap('21_每日挑战完成');
  check((await g(() => Object.keys(__vasily.team.state().daily).length)) === 1, '每日挑战打完：记下今天的用时');

  // 原作玩法样机还在
  await g(() => __vasily.startClassic());
  await page.mouse.click(...at(btn.trig));
  check((await g(() => __vasily.G.classic.shots)) === 0, '原作样机：望远镜状态下不能开枪');

  // 公平：十二张地图、几百个随机局，每个人影都在能瞄到的地方，也不跟误导物、会变的东西挤一扇窗
  const fair = await g(() => {
    const { scene, D } = __vasily;
    const ids = __require('')('./js/themes.js').MAP_ORDER;
    let bad = 0, short = 0, clash = 0;
    for (let s = 1; s <= 600; s++) {
      const sc = scene.build(s * 7, { poseShift: 3, contrast: 0.2 }, D, ids[s % ids.length], { figures: 8, decoys: 2, props: 14 });
      if (sc.figures.length < 10) short++;
      sc.figures.forEach((f) => {
        const h = scene.figureHead(f, 1);
        if (h.x < D / 2 - 8 || h.x > sc.w - D / 2 + 8 || h.y < D / 2 || h.y > sc.h - D / 2) bad++;
        if (scene.slotBusy(sc, f.win)) clash++;
      });
    }
    return { bad, short, clash, n: ids.length };
  });
  check(fair.n === 12 && fair.bad === 0 && fair.short === 0 && fair.clash === 0, '十二张地图 600 个随机局：八个人影加两个假人都摆得下、都能瞄到，不跟误导物挤一扇窗');

  // 第一章换了地图：沙漠土楼镇开场，城市在第五关（Cc 定）
  const maps = await g(() => __vasily.LV.CAFE.map((lv) => lv.rounds[0].theme).join(','));
  check(maps === 'desert,med,station,port,oldtown,farm,temple,castle,plant', '对狙九关九张地图：沙漠开场，城市在第五关，Boss 在电厂');

  // 遮挡：火车挡住他那扇窗时他看不见你，子弹也打在车厢上；玻璃反光只晃你的眼，不挡他
  const cov = await g(() => {
    const config = __vasily.config;
    const { createDuel } = __require('')('./js/duel.js');
    const scene = __vasily.scene;
    const R = { opp: 'patient', theme: 'station', figures: 4, props: 6, goal: 'kill', bullets: 3, time: 80, hitR: 7, cover: 'train' };
    const d = createDuel({ seed: 5, config, scopeD: __vasily.D, round: R, levelIndex: 2 });
    const h = scene.enemyHead(d.sc, 1);
    d.sc.covers.push({ kind: 'train', x: h.x - 100, y: h.y - 40, w: 300, h: 80, a: 1, age: 0 });
    const blind = d.enemyBlind();
    d.sc.enemy.lift = 1;
    d.cam.x = h.x; d.cam.y = h.y; d.sway = { x: 0, y: 0 };
    d.update = () => {};
    d.holding = true;
    const shot = d.triggerUp();
    const g2 = createDuel({ seed: 5, config, scopeD: __vasily.D, round: Object.assign({}, R, { theme: 'glass', cover: 'glare' }), levelIndex: 2 });
    const h2 = scene.enemyHead(g2.sc, 1);
    g2.sc.covers.push({ kind: 'glare', x: h2.x - 30, y: 0, w: 60, h: 600, a: 1, age: 0 });
    // 烟雾弹：废墟里打一阵，烟扔在他附近
    const r3 = createDuel({ seed: 9, config, scopeD: __vasily.D, round: Object.assign({}, R, { theme: 'ruins', cover: 'auto' }), levelIndex: 2 });
    let near = false;
    for (let i = 0; i < 60 * 25 && !near; i++) {
      r3.update(1 / 60); r3.state = 'play'; r3.timeLeft = 80; r3.duck = 1; r3.duckHeld = true;
      const e = r3.sc.enemy.win;
      near = r3.sc.covers.some((c) => c.kind === 'smoke' && Math.hypot(c.x - e.x, c.y - e.y) < 160);
    }
    // 地图自带的遮挡：擂台、每日从十二张里抽，都带上
    const kinds = __require('')('./js/themes.js').MAP_ORDER.map((id) => createDuel({ seed: 1, config, scopeD: __vasily.D, round: Object.assign({}, R, { theme: id, cover: 'auto' }), levelIndex: 2 }).coverKind()).filter(Boolean).length;
    return { blind, shot: shot && shot.kind, glareBlind: g2.enemyBlind(), smoke: near, kinds };
  });
  check(cov.blind && cov.shot === 'covered', '火车开过：挡住他那扇窗时他看不见你，子弹打在车厢上');
  check(!cov.glareBlind, '玻璃反光只晃你的眼，不挡他的视线');
  check(cov.smoke, '战地废墟：他把烟雾弹扔在自己附近');
  check(cov.kinds === 6, '六张地图自带遮挡：火车、蒸汽、烟雾弹、沙尘暴、水雾、玻璃反光');

  // Midjourney 背景图接口：一张图 + 藏身位标记 = 一张地图（这里拿一张假图试）
  const art = await g(() => {
    const { scene, D } = __vasily;
    const ref = scene.build(3, { poseShift: 3, contrast: 0.2 }, D, 'oldtown', { figures: 8, decoys: 0, props: 14 });
    const slots = ref.allWindows.filter((w) => !w.bricked).map((w) => [w.x, w.y, w.w, w.h]);
    const tops = ref.buildings.map((b) => [b.x, b.x + b.w, b.y]);
    const c = document.createElement('canvas');
    c.width = 860; c.height = 600;
    const x = c.getContext('2d');
    x.fillStyle = '#c9705a'; x.fillRect(0, 0, 860, 600);
    scene.registerArt('oldtown', c, { slots, tops });
    const sc = scene.build(4, { poseShift: 3, contrast: 0.2 }, D, 'oldtown', { figures: 8, decoys: 2, props: 14 });
    const key = (w) => w.x + ',' + w.y;
    const set = new Set(slots.map((s) => s[0] + ',' + s[1]));
    const inside = sc.figures.every((f) => set.has(key(f.win))) && sc.props.every((p) => set.has(key(p.win)));
    const cv = document.createElement('canvas');
    cv.width = 400; cv.height = 400;
    scene.draw(cv.getContext('2d'), sc, { x: 430, y: 300 }, 200, 200, 352, { t: 1, fog: 0 });
    return { img: !!sc.image, inside, n: sc.figures.length };
  });
  check(art.img && art.inside && art.n === 10, '背景图接口：有图就贴图，人影和误导物都放进标好的藏身位');

  check(errors.length === 0, '没有报错' + (errors.length ? '：' + errors.join(' | ') : ''));
  await browser.close();
  console.log(ok.map((m) => '✓ ' + m).join('\n'));
  console.log('共 ' + ok.length + ' 项');
})().catch((e) => { console.error(e.message); process.exit(1); });
