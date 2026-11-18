// 平衡模拟：每一关每个回合，一个「一直露着头、从不缩」的玩家多久会被他锁定。
// 数字越小，这一回合越逼你缩头、换窗。用法：node test/sim-balance.js
const config = require('../js/config.js');
const { LEVELS } = require('../js/levels.js');
const { createDuel } = require('../js/duel.js');

const dt = 1 / 60;
LEVELS.forEach((lv) => {
  const out = lv.rounds.map((R, i) => {
    let sum = 0;
    let n = 0;
    for (let s = 0; s < 200; s++) {
      const d = createDuel({ seed: s * 13 + i, config, scopeD: 353, round: R, levelIndex: lv.index });
      let t = 0;
      while (t < R.time && d.drawLeft < 0 && d.state === 'play') { d.update(dt); t += dt; }
      if (d.drawLeft >= 0) { sum += t; n++; }
    }
    return '回合' + (i + 1) + ' ' + (n ? (sum / n).toFixed(1) + ' 秒被锁' : '没被锁');
  });
  console.log(('第' + lv.no + '关 ' + lv.name).padEnd(12, '　') + out.join('   '));
});
