// 测试机器人：在手机大小的浏览器里把一次网吧赛从开场点到战队页。用法：node test/robot.js
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

  // —— 开场 ——
  await snap('01_开场');
  check((await mode()) === 'title', '打开先是开场界面');
  await clickBtn('team');
  check((await g(() => __vasily.G.toast && __vasily.G.toast.text)) === '赢下第一次网吧赛就知道了', '战队还锁着：点了只给一句悬念');
  await clickBtn('start');
  check((await mode()) === 'story', '点「开始比赛」进第一场');
  await page.waitForTimeout(400);
  await snap('02_第一场');
  await page.mouse.click(195, 300); await page.waitForTimeout(400);
  await snap('03_对手登场');
  await page.mouse.click(195, 300); await page.waitForTimeout(300);
  check((await mode()) === 'play', '点两下跳过「第几场」和对手卡');

  const pose0 = await g(() => __vasily.G.duel.sc.enemy.pose);
  await page.mouse.click(...at(btn.eye));
  await page.waitForTimeout(350);
  check((await g(() => __vasily.G.duel.blinks)) === 1, '点一下眨眼只算一次');
  check((await g(() => __vasily.G.duel.sc.enemy.pose)) !== pose0, '眨眼后对面狙击手挪了');
  const cam0 = await g(() => ({ ...__vasily.G.duel.cam }));
  await page.mouse.move(195, 250); await page.mouse.down(); await page.mouse.move(120, 300, { steps: 5 }); await page.mouse.up();
  const cam1 = await g(() => ({ ...__vasily.G.duel.cam }));
  check(cam1.x !== cam0.x || cam1.y !== cam0.y, '手指拖动能移镜头');
  await snap('04_对狙');

  // 他缩着时瞄准他的头开枪：打不中，提示「他缩着」
  await g(() => { __vasily.G.duel.progress = 0; });
  await page.waitForFunction(() => __vasily.G.duel.enemy.mode === 'hide' && __vasily.G.duel.enemy.timer > 1.2);
  await page.mouse.move(...at(btn.trig)); await page.mouse.down(); await page.waitForTimeout(700);
  await g(() => { const d = __vasily.G.duel; const h = __vasily.scene.enemyHead(d.sc, 1); d.cam.x = h.x - d.sway.x; d.cam.y = h.y - d.sway.y; });
  await page.mouse.up(); await page.waitForTimeout(80);
  const cov = await g(() => { const d = __vasily.G.duel; return { kind: d.impacts.at(-1).kind, m: __vasily.G.mode }; });
  check(cov.m === 'play' && cov.kind === 'covered', '他缩着时打头：打不中，提示「他缩着」，留弹孔');
  const amp = await g(() => ({ a: __vasily.config.breath.amp, r: __vasily.G.duel.hitRadius }));
  check(amp.a > amp.r, '不屏息时准星晃动（' + amp.a + '）比判定圈（' + amp.r + '）大：还是要屏息');

  // 他探头时屏息、松手 → 爆头 → 换点位 → 下一个对手（不同背景）
  async function winDuel(n, label) {
    await g(() => { __vasily.G.duel.progress = 0; });
    await page.waitForFunction(() => { const d = __vasily.G.duel; return d.reloadSec <= 0 && d.recoverSec <= 0 && d.enemy.mode === 'rise' && !d.enemy.fake; }, null, { timeout: 15000, polling: 16 });
    await page.mouse.move(...at(btn.trig)); await page.mouse.down();
    await page.waitForTimeout(700);
    const st = await g(() => ({ s: __vasily.G.duel.steadiness(), e: __vasily.G.duel.exposed() }));
    check(st.s === 'steady' && st.e, label + '：他探头后按住 0.7 秒，准星已经最稳');
    // 手指拖到离头 10 点：吸附会把准星拉过去
    await g(() => { const d = __vasily.G.duel; const h = __vasily.scene.enemyHead(d.sc, 1); d.cam.x = h.x + 8; d.cam.y = h.y + 6; });
    await page.waitForTimeout(500);
    await page.mouse.up();
    await page.waitForTimeout(80);
    check((await mode()) === 'hit', label + '：拖得不太准也能打中（吸附）');
  }
  const themesSeen = [];
  for (let n = 1; n <= 3; n++) {
    themesSeen.push(await g(() => __vasily.G.duel.sc.theme.name));
    await winDuel(n, '第一场对手 ' + n);
    if (n === 1) { await page.waitForTimeout(700); await snap('05_爆头'); }
    if (n < 3) {
      await page.waitForFunction(() => __vasily.G.mode === 'move', null, { timeout: 3000 });
      await page.waitForTimeout(900);
      if (n === 1) await snap('06_换点位');
      check(true, '打死一个：跑去下一个点位');
      await page.waitForFunction(() => __vasily.G.mode === 'intro', null, { timeout: 4000 });
      if (n === 1) { await page.waitForTimeout(300); await snap('07_下一个对手'); }
      await page.waitForFunction(() => __vasily.G.mode === 'play', null, { timeout: 3000 });
    }
  }
  check(new Set(themesSeen).size === 3, '三个对手三张背景：' + themesSeen.join('、'));
  await page.waitForFunction(() => __vasily.G.mode === 'clear', null, { timeout: 3000 });
  await page.waitForTimeout(1500);
  await snap('08_这场拿下');
  check((await g(() => __vasily.team.state().money)) > 0, '打一场有奖金');
  await page.waitForFunction(() => __vasily.G.mode === 'pick', null, { timeout: 3000 });
  await page.waitForTimeout(700);
  await snap('09_选卡');
  const card0 = await g(() => __vasily.G.offer[0].id);
  await clickBtn('card0');
  const after = await g(() => ({ m: __vasily.G.mode, n: __vasily.G.matchNo, c: __vasily.G.cards.slice() }));
  check(after.m === 'story' && after.n === 2 && after.c[0] === card0, '选一张卡，进第二场');

  // —— 第二场：被打死 → 女队友拉起来 → 再死 → 重打这一场（卡还在）——
  await g(() => __vasily.setMode('play'));
  await g(() => { __vasily.G.duel.progress = 0.999; });
  await page.waitForTimeout(200);
  check(await g(() => __vasily.G.duel.locked && __vasily.G.mode === 'play'), '对面找到你后不会马上死：等他下一次探头');
  await page.waitForFunction(() => __vasily.G.duel.drawLeft >= 0, null, { timeout: 15000 });
  await snap('10_他要开枪');
  await page.waitForFunction(() => __vasily.G.mode === 'dead', null, { timeout: 3000 });
  check(true, '没抢在他前面开枪：出局');
  await clickBtn('rescue');
  check((await mode()) === 'ad', '没填广告位时放广告占位');
  await page.waitForFunction(() => __vasily.G.mode === 'rescue', null, { timeout: 5000 });
  await page.waitForTimeout(500); await snap('11a_拉人_倒地');
  await page.waitForTimeout(800); await snap('11b_拉人_握手');
  await page.waitForTimeout(800); await snap('11c_拉人_起来');
  await page.waitForFunction(() => __vasily.G.mode === 'play', null, { timeout: 4000 });
  check((await g(() => __vasily.G.rescuesLeft)) === 0, '拉人动画放完回到对狙，这场拉人次数用掉');
  await g(() => { __vasily.G.duel.progress = 0.999; });
  await page.waitForFunction(() => __vasily.G.mode === 'fail', null, { timeout: 15000 });
  await snap('12_差一点');
  await clickBtn('retry');
  const re = await g(() => ({ m: __vasily.G.mode, n: __vasily.G.matchNo, i: __vasily.G.duelIndex, c: __vasily.G.cards.length }));
  check(re.m === 'story' && re.n === 2 && re.i === 0 && re.c === 1, '重打这一场：还是第二场，从第一个对手开始，卡还在');

  // —— 三场打完：网吧揭晓 → 战队 ——
  await g(() => { const V = __vasily; V.G.matchNo = 3; V.afterClear(); });
  check((await mode()) === 'reveal' && (await g(() => __vasily.team.state().revealed)), '第一次三场全赢：放网吧揭晓，战队解锁');
  await page.waitForTimeout(1000); await snap('13a_揭晓_网吧');
  await page.waitForTimeout(1600); await snap('13b_揭晓_站起来');
  await page.waitForTimeout(2200); await snap('13c_揭晓_队友');
  await page.waitForTimeout(3800); await snap('13d_揭晓_职业战队');
  await clickBtn('toTeam');
  check((await mode()) === 'team', '揭晓完进战队');
  await g(() => { __vasily.team.state().money = 500; });
  await page.waitForTimeout(100);
  await snap('14_战队');
  const before = await g(() => ({ lv: __vasily.team.state().team.cap, m: __vasily.team.state().money, cost: __vasily.team.trainCost(1) }));
  await clickBtn('train_cap');
  const aft = await g(() => ({ lv: __vasily.team.state().team.cap, m: __vasily.team.state().money }));
  check(aft.lv === before.lv + 1 && aft.m === before.m - before.cost, '花奖金练队友：老K 升到 ' + aft.lv + ' 级');
  const saved = await g(() => JSON.parse(localStorage.getItem('vasily_save_v1')).team.cap);
  check(saved === aft.lv, '练级存进存档');
  const mods = await g(() => __vasily.team.mods([]));
  check(mods.peekCue && mods.settleMul < 1, '队友加成生效：观察手报点、指挥让你稳得快');

  // 队友报点：他快探头时提示
  await g(() => { const V = __vasily; V.G.matchNo = 1; V.startMatch(); V.setMode('play'); });
  await page.waitForFunction(() => __vasily.G.duel.peekCue(), null, { timeout: 8000, polling: 16 });
  await snap('15_队友报点');
  check(true, '观察手在他探头前喊「要出来了」');

  // 公平：九张背景、几百个随机局，每个藏身点都能挪到镜子正中
  const fair = await g(() => {
    const { scene, config, D } = __vasily;
    const ids = ['oldtown', 'market', 'tanks', 'port', 'station', 'factory', 'neon', 'desert', 'eaves'];
    let bad = 0, empty = 0;
    for (let s = 1; s <= 300; s++) {
      const sc = scene.build(s * 7, config.duels[2], D, ids[s % 9]);
      if (!sc.spots.length) { empty++; continue; }
      const h = scene.enemyHead(sc, 1);
      if (h.x < D / 2 - 6 || h.x > sc.w - D / 2 + 6 || h.y < D / 2 || h.y > sc.h - D / 2) bad++;
    }
    return { bad, empty };
  });
  check(fair.bad === 0 && fair.empty === 0, '九张背景 300 个随机局里，对面都藏在能瞄到的地方');

  check(errors.length === 0, '没有报错' + (errors.length ? '：' + errors.join(' | ') : ''));
  await browser.close();
  console.log(ok.map((m) => '✓ ' + m).join('\n'));
  console.log('共 ' + ok.length + ' 项');
})().catch((e) => { console.error(e.message); process.exit(1); });
