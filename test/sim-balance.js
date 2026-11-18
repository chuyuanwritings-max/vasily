const config = require('./js/config.js');
const scene = require('./js/scene.js');
const { createDuel } = require('./js/duel.js');
const dt = 1 / 60;
// 一直露着头：多久被锁定、被打死
function careless(seed, m, i) {
  const d = createDuel({ seed, levelNo: m, duelIndex: i, config, scopeD: 353, theme: 'oldtown' });
  let t = 0, lockedAt = -1;
  while (t < 60 && d.state === 'play') { d.update(dt); t += dt; if (lockedAt < 0 && d.drawLeft >= 0) lockedAt = t; }
  return lockedAt;
}
// 玩家：需要缩头 need 次才找到他（每次看 look 秒）；smart = 红圈在动又离你近时缩头躲
function player(seed, m, i, smart, aimErr) {
  const d = createDuel({ seed, levelNo: m, duelIndex: i, config, scopeD: 353, theme: 'oldtown' });
  const need = 3 + Math.floor(Math.random() * 4);
  let t = 0, nextDuck = 1.2, ducks = 0, found = false, pressAt = -1, releaseAt = -1, reacted = -1;
  const head = scene.enemyHead(d.sc, 1);
  while (t < 90 && d.state === 'play') {
    const near = Math.hypot(d.seek.x - d.me.c, d.seek.y - d.me.r) < 1.6;
    const danger = smart && d.searching() && (near || d.lock > 0.2) && !found;
    if (d.drawLeft >= 0) {
      // 被瞄准：看到反光 0.3 秒后反应——找到他了就抢枪，没找到就缩
      if (reacted < 0) reacted = t;
      if (t > reacted + 0.3) {
        if (found && !d.holding && pressAt < 0) { d.triggerDown(); pressAt = t; releaseAt = t + 0.6; }
        else if (!found) d.duckDown();
      }
    } else reacted = -1;
    if (danger) d.duckDown(); else if (d.drawLeft < 0 && d.duckHeld && !(found && false)) d.duckUp();
    if (!found && !danger && t >= nextDuck && d.exposed()) { d.duckDown(); setTimeout; d.duckHeld = true; ducks++; nextDuck = t + 1.4; }
    if (d.duckHeld && !danger && d.drawLeft < 0 && d.duck >= 1) d.duckUp();
    if (ducks >= need && !found) { found = true; const a = Math.random() * 6.28, r = Math.random() * aimErr; d.cam.x = head.x + Math.cos(a) * r; d.cam.y = head.y + Math.sin(a) * r; }
    if (found && d.drawLeft < 0 && pressAt < 0 && d.enemy.mode === 'rise' && d.exposed()) { pressAt = t + 0.3; releaseAt = pressAt + 0.5 + Math.random() * 0.6; }
    if (pressAt >= 0 && t >= pressAt && !d.holding && d.reloadSec <= 0 && d.recoverSec <= 0 && t < releaseAt) d.triggerDown();
    if (pressAt >= 0 && t >= releaseAt) { if (d.holding) d.triggerUp(); pressAt = -1; }
    d.update(dt); t += dt;
  }
  return { win: d.state === 'hit', dead: d.state === 'dead', t };
}
for (let m = 1; m <= 3; m++) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    let lk = 0, n = 0; for (let s = 0; s < 300; s++) { const r = careless(s * 13 + i, m, i); if (r > 0) { lk += r; n++; } }
    const st = (smart, err) => { let w = 0; for (let s = 0; s < 300; s++) if (player(s * 7 + i + m * 1000, m, i, smart, err).win) w++; return Math.round(w / 3); };
    out.push(`对手${i + 1}: 一直露头 ${(lk / n).toFixed(1)}秒被锁 | 乱来 ${st(false, 12)}% | 会躲 ${st(true, 12)}%`);
  }
  console.log('第' + m + '场  ' + out.join('   '));
}
