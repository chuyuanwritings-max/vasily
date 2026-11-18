// 原作玩法样机：把 2009 年那类「对楼狙击」手游的核心玩法搭一遍，给 Cc 对比用。
// 只还原玩法规则，画面、名字、关卡都是我们自己的（不复制原作素材）。
//
// 规则（按当年的评测和介绍整理）：
//   1. 对面一栋楼里藏着好几个狙击手。
//   2. 望远镜看得宽，但不能开枪；狙击镜能开枪，但视野很窄。要来回切。
//   3. 他们探出头来就在瞄你，瞄够几秒就开枪，你掉一格血。快开枪前镜片会反光。
//   4. 打空一枪，他们知道你在哪，开枪更快。
//   5. 限时内全部打死就赢；血掉光或时间到就输。点一下就开枪，没有屏息。
const scene = require('./scene.js');
const { clamp, rng, comicText, roundRect } = require('./util.js');

const ZOOM_WIDE = 0.42; // 望远镜：看得宽
const N_ENEMY = 3;
const HP = 3;
const TIME = 60;
const AIM_SEC = 3.2; // 他探头后瞄你多久开枪
const GLINT_SEC = 1.0; // 开枪前多久镜片反光
const HIT_R = 8;

function createClassic(seed, D, config) {
  const r = rng(seed);
  const sc = scene.build(seed, config.duels[0], D, 'oldtown');
  // 场景自带的那个敌人藏到画外，我们自己摆三个
  sc.enemy.win = { x: -999, y: -999, w: 16, h: 22 };
  const spots = sc.spots.slice();
  const enemies = [];
  while (enemies.length < N_ENEMY && spots.length) {
    const w = spots.splice(Math.floor(r() * spots.length), 1)[0];
    if (enemies.some((e) => Math.abs(e.win.x - w.x) + Math.abs(e.win.y - w.y) < 90)) continue;
    enemies.push({ win: w, lift: 0, mode: 'hide', timer: 1 + r() * 4, aim: 0, dead: false });
  }
  const c = {
    sc,
    enemies,
    wide: true,
    cam: { x: sc.w / 2, y: sc.h / 2 },
    hp: HP,
    left: TIME,
    t: 0,
    hurt: 0,
    shots: 0,
    state: 'play', // play → win / lose
    flash: 0,
    say: null,
  };

  function view() {
    return c.wide ? D / ZOOM_WIDE : D;
  }
  function clampCam() {
    const h = view() / 2;
    c.cam.x = h * 2 >= sc.w ? sc.w / 2 : clamp(c.cam.x, h, sc.w - h);
    c.cam.y = h * 2 >= sc.h ? sc.h / 2 : clamp(c.cam.y, h, sc.h - h);
  }
  clampCam();

  c.pan = function (dx, dy) {
    const z = c.wide ? ZOOM_WIDE : 1;
    c.cam.x -= dx / z;
    c.cam.y -= dy / z;
    clampCam();
  };
  c.toggle = function () {
    c.wide = !c.wide;
    clampCam();
  };
  c.fire = function () {
    if (c.state !== 'play') return;
    if (c.wide) {
      c.say = { text: '望远镜不能开枪', t: 1 };
      return;
    }
    c.shots += 1;
    c.flash = 0.25;
    const target = c.enemies.find((e) => !e.dead && e.lift > 0.5 && Math.hypot(head(e).x - c.cam.x, head(e).y - c.cam.y) < HIT_R);
    if (target) {
      target.dead = true;
      c.say = { text: '爆头！', t: 0.8 };
      if (c.enemies.every((e) => e.dead)) c.state = 'win';
    } else {
      // 打空：他们都知道你在哪了，瞄你更快
      c.enemies.forEach((e) => (e.aim = Math.min(AIM_SEC - 0.4, e.aim + 1.2)));
      c.say = { text: '打空！他们发现你了', t: 1 };
    }
  };

  function head(e) {
    return { x: e.win.x + e.win.w / 2, y: e.win.y + 8 + (1 - e.lift) * 15 };
  }
  c.head = head;

  c.update = function (dt) {
    c.t += dt;
    if (c.say) { c.say.t -= dt; if (c.say.t <= 0) c.say = null; }
    c.hurt = Math.max(0, c.hurt - dt);
    c.flash = Math.max(0, c.flash - dt);
    if (c.state !== 'play') return;
    c.left -= dt;
    if (c.left <= 0) { c.left = 0; c.state = 'lose'; return; }
    c.enemies.forEach((e) => {
      if (e.dead) { e.lift = Math.max(0, e.lift - dt * 3); return; }
      e.timer -= dt;
      if (e.mode === 'hide' && e.timer <= 0) { e.mode = 'peek'; e.timer = 2.5 + r() * 2.5; }
      else if (e.mode === 'peek' && e.timer <= 0 && e.aim < AIM_SEC - GLINT_SEC) { e.mode = 'hide'; e.timer = 1.5 + r() * 3; }
      const target = e.mode === 'peek' ? 1 : 0;
      e.lift += clamp(target - e.lift, -dt * 4, dt * 4);
      if (e.mode === 'peek' && e.lift > 0.9) {
        e.aim += dt;
        if (e.aim >= AIM_SEC) {
          e.aim = 0;
          c.hp -= 1;
          c.hurt = 0.6;
          c.say = { text: '中弹！', t: 0.8 };
          if (c.hp <= 0) c.state = 'lose';
        }
      }
    });
  };

  c.glinting = function (e) {
    return !e.dead && e.mode === 'peek' && e.aim > AIM_SEC - GLINT_SEC;
  };

  // 画：镜子里的世界（望远镜就缩小画）
  c.draw = function (ctx, cx, cy, t) {
    const z = c.wide ? ZOOM_WIDE : 1;
    ctx.save();
    ctx.beginPath();
    if (c.wide) {
      // 望远镜：两个圆连在一起
      ctx.arc(cx - D * 0.22, cy, D * 0.36, 0, Math.PI * 2);
      ctx.moveTo(cx + D * 0.22 + D * 0.36, cy);
      ctx.arc(cx + D * 0.22, cy, D * 0.36, 0, Math.PI * 2);
    } else ctx.arc(cx, cy, D / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);
    scene.draw(ctx, sc, c.cam, cx, cy, view(), { t });
    const ox = cx - c.cam.x;
    const oy = cy - c.cam.y;
    c.enemies.forEach((e) => {
      const h = head(e);
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox + e.win.x, oy + e.win.y, e.win.w, e.win.h);
      ctx.clip();
      ctx.fillStyle = e.dead ? '#3a2a3a' : '#6a5a78';
      ctx.beginPath();
      ctx.arc(ox + h.x, oy + h.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(ox + h.x - 7, oy + h.y + 5, 14, 12);
      ctx.restore();
      if (c.glinting(e) && Math.sin(t * 20) > -0.3) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ox + h.x - 2, oy + h.y + 1, 3 / z, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 / z;
        ctx.beginPath();
        ctx.moveTo(ox + h.x - 2 - 9 / z, oy + h.y + 1);
        ctx.lineTo(ox + h.x - 2 + 9 / z, oy + h.y + 1);
        ctx.moveTo(ox + h.x - 2, oy + h.y + 1 - 9 / z);
        ctx.lineTo(ox + h.x - 2, oy + h.y + 1 + 9 / z);
        ctx.stroke();
      }
    });
    ctx.restore();
    if (!c.wide) {
      ctx.strokeStyle = '#1b1530';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx - D / 2, cy);
      ctx.lineTo(cx + D / 2, cy);
      ctx.moveTo(cx, cy - D / 2);
      ctx.lineTo(cx, cy + D / 2);
      ctx.stroke();
    }
    if (c.flash > 0) {
      ctx.fillStyle = 'rgba(255,220,120,' + (c.flash * 2).toFixed(2) + ')';
      ctx.fillRect(cx - D / 2, cy, D, D / 2);
    }
    if (c.hurt > 0) {
      ctx.fillStyle = 'rgba(220,20,40,' + (c.hurt * 0.7).toFixed(2) + ')';
      ctx.fillRect(0, 0, 2000, 2000);
    }
  };

  return c;
}

module.exports = { createClassic, HP, TIME };
