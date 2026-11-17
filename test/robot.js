// 测试机器人：在手机大小的浏览器里把一关从头点到尾。用法：node test/robot.js
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
  await page.waitForTimeout(300);
  const ok = [];
  const check = (cond, msg) => { if (!cond) throw new Error('没通过：' + msg); ok.push(msg); };
  const g = (fn) => page.evaluate(fn);
  const S = await g(() => __vasily.scale);
  const btn = await g(() => ({ eye: __vasily.eyeBtn, trig: __vasily.trigBtn }));
  const at = (b) => [b.x * S, b.y * S];
  const snap = (n) => page.screenshot({ path: path.join(shots, n + '.png') });

  await snap('1_开场');
  check((await g(() => __vasily.G.mode)) === 'story', '打开就自动进开场，不用找菜单');
  await page.mouse.click(195, 300); await page.waitForTimeout(400);
  await page.mouse.click(195, 300); await page.waitForTimeout(300);
  check((await g(() => __vasily.G.mode)) === 'play', '点两下跳过开场和对手卡');
  await snap('2_对狙');

  const pose0 = await g(() => __vasily.G.duel.sc.enemy.pose);
  await page.mouse.click(...at(btn.eye));
  await page.waitForTimeout(60);
  await snap('3_眨眼中');
  await page.waitForTimeout(300);
  check((await g(() => __vasily.G.duel.blinks)) === 1, '点一下眨眼只算一次');
  check((await g(() => __vasily.G.duel.sc.enemy.pose)) !== pose0, '眨眼后对面狙击手挪了');

  // 拖动镜头
  const cam0 = await g(() => ({ ...__vasily.G.duel.cam }));
  await page.mouse.move(195, 250); await page.mouse.down(); await page.mouse.move(120, 300, { steps: 5 }); await page.mouse.up();
  const cam1 = await g(() => ({ ...__vasily.G.duel.cam }));
  check(cam1.x !== cam0.x || cam1.y !== cam0.y, '手指拖动能移镜头');

  // 不眨眼撑 7 秒会强制眨眼
  const b0 = await g(() => __vasily.G.duel.blinks);
  await page.waitForTimeout(7400);
  check((await g(() => __vasily.G.duel.blinks)) > b0, '眼睛酸满了会强制眨眼');

  // 他缩着时瞄准他的头开枪：打不中，提示「他缩着」，留弹孔
  await g(() => { __vasily.G.duel.progress = 0; });
  await page.waitForFunction(() => __vasily.G.duel.enemy.mode === 'hide' && __vasily.G.duel.enemy.timer > 1.2);
  const p0 = await g(() => __vasily.G.duel.progress);
  await page.mouse.move(...at(btn.trig)); await page.mouse.down(); await page.waitForTimeout(950);
  await g(() => { const d = __vasily.G.duel; const h = __vasily.scene.enemyHead(d.sc); d.cam.x = h.x - d.sway.x; d.cam.y = h.y - d.sway.y; });
  await page.mouse.up(); await page.waitForTimeout(80);
  const cov = await g(() => { const d = __vasily.G.duel; return { kind: d.impacts.at(-1).kind, n: d.impacts.length, p: d.progress, m: __vasily.G.mode }; });
  check(cov.m === 'play' && cov.kind === 'covered' && cov.n === 1, '他缩着时打头：打不中，提示「他缩着」，留弹孔');
  check(cov.p > p0 + 0.25, '打空一枪：位置暴露，对面进度大涨');
  await snap('4_他缩着');

  // 不屏息时晃动比判定圈大得多
  const amp = await g(() => ({ a: __vasily.config.breath.amp, r: __vasily.G.duel.hitRadius }));
  check(amp.a > amp.r * 2.5, '不屏息时准星晃动（' + amp.a + '）远大于判定圈（' + amp.r + '）：必须屏息');

  // 等他要探头时提前按住，稳住后松手 → 命中。连赢三个对手（耐心型、焦躁型、狡猾型）
  async function winDuel(n) {
    await g(() => { __vasily.G.duel.progress = 0; });
    await page.waitForTimeout(1300);
    await page.waitForFunction(() => { const e = __vasily.G.duel.enemy; return e.mode === 'rise' && !e.fake; }, null, { timeout: 15000, polling: 16 });
    await page.mouse.move(...at(btn.trig)); await page.mouse.down();
    await page.waitForTimeout(920);
    const st = await g(() => ({ s: __vasily.G.duel.steadiness(), e: __vasily.G.duel.exposed() }));
    check(st.s === 'steady' && st.e, '对手 ' + n + '：提前按住，他探头时准星正好最稳');
    if (n === 1) await snap('5_他探头_你最稳');
    await g(() => { const d = __vasily.G.duel; const h = __vasily.scene.enemyHead(d.sc); d.cam.x = h.x - d.sway.x; d.cam.y = h.y - d.sway.y; });
    await page.mouse.up();
    await page.waitForTimeout(80);
    check((await g(() => __vasily.G.mode)) === 'hit', '对手 ' + n + '：松手爆头');
    if (n === 1) { await page.waitForTimeout(250); await snap('6a_回放准星'); await page.waitForTimeout(400); await snap('6b_嘣'); }
    await page.waitForTimeout(1800);
    if (n < 3) { const mm = await g(() => ({ m: __vasily.G.mode, i: __vasily.G.duelIndex })); check(mm.i === n && (mm.m === 'intro' || mm.m === 'play'), '自动进下一个对手'); if (n === 1 && mm.m === 'intro') await snap('6c_对手性格'); await page.waitForFunction(() => __vasily.G.mode === 'play'); }
  }
  for (let n = 1; n <= 3; n++) await winDuel(n);
  check((await g(() => __vasily.G.mode)) === 'win', '连赢三个就过关');
  await snap('7_过关');

  // 下一关：被打死 → 叫队友 → 广告占位 → 拉起来 → 再死就失败
  await page.mouse.click(195, (await g(() => __vasily.G.buttons[0].y + 20)) * S);
  await page.waitForTimeout(200);
  check((await g(() => __vasily.G.levelNo)) === 2, '进第 2 关');
  await g(() => __vasily.setMode('play'));
  await g(() => { __vasily.G.duel.progress = 0.999; });
  await page.waitForTimeout(200);
  check((await g(() => __vasily.G.duel.locked && __vasily.G.mode === 'play')), '对面找到你后不会马上死：等他下一次探头');
  await page.waitForFunction(() => __vasily.G.duel.drawLeft >= 0, null, { timeout: 15000 });
  check(await g(() => __vasily.G.duel.glint()), '他探头要开枪：镜片一直亮');
  await snap('8a_他要开枪');
  await page.waitForFunction(() => __vasily.G.mode === 'dead', null, { timeout: 3000 });
  check(true, '没抢在他前面开枪：出局');
  await snap('8_出局');
  const rb = await g(() => __vasily.G.buttons.find((b) => b.id === 'rescue'));
  await page.mouse.click((rb.x + rb.w / 2) * S, (rb.y + rb.h / 2) * S);
  await page.waitForTimeout(200);
  check((await g(() => __vasily.G.mode)) === 'ad', '没填广告位时放广告占位');
  await page.waitForTimeout(3600);
  await snap('9_队友拉人');
  await page.waitForTimeout(1500);
  const st2 = await g(() => ({ m: __vasily.G.mode, r: __vasily.G.rescuesLeft, a: __vasily.G.attempt, i: __vasily.G.duelIndex }));
  check(st2.m === 'play' && st2.r === 0 && st2.a === 1 && st2.i === 0, '拉起来后重打这一次，每关只能拉一次');
  await g(() => { __vasily.G.duel.progress = 0.999; });
  await page.waitForFunction(() => __vasily.G.mode === 'fail', null, { timeout: 15000 });
  check(true, '用过队友再死：这关失败');
  await snap('10_差一点');

  // 公平：几百个随机局，每个藏身点都能挪到镜子正中
  const fair = await g(() => {
    const { scene, config, D } = __vasily;
    let bad = 0, empty = 0;
    for (let s = 1; s <= 300; s++) {
      const sc = scene.build(s * 7, config.duels[2], D);
      if (!sc.spots.length) empty++;
      sc.enemy.lift = 1; // 探头时的位置才是要瞄的地方
      const h = scene.enemyHead(sc);
      if (h.x < D / 2 - 6 || h.x > sc.w - D / 2 + 6 || h.y < D / 2 || h.y > sc.h - D / 2) bad++;
    }
    return { bad, empty };
  });
  check(fair.bad === 0 && fair.empty === 0, '300 个随机局里，对面都藏在能瞄到的地方');

  check(errors.length === 0, '没有报错' + (errors.length ? '：' + errors.join(' | ') : ''));
  await browser.close();
  console.log(ok.map((m) => '✓ ' + m).join('\n'));
})().catch((e) => { console.error(e.message); process.exit(1); });
