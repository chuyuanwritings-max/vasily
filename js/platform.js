// 平台层：只有这个文件知道自己跑在微信里还是浏览器里。
// 微信小游戏：wx.createCanvas / wx.onTouchStart / wx.createRewardedVideoAd
// 浏览器预览：一张 <canvas id="game">，用 pointer 事件（只用一种事件，免得一次点击被算两次）
const isWx = typeof wx !== 'undefined' && wx && typeof wx.createCanvas === 'function';

function setup(onTouch) {
  let canvas, width, height, dpr;
  if (isWx) {
    canvas = wx.createCanvas();
    const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
    width = info.windowWidth;
    height = info.windowHeight;
    dpr = info.pixelRatio || 2;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const send = (type) => (e) => {
      const list = e.changedTouches || [];
      for (let i = 0; i < list.length; i++) {
        onTouch(type, list[i].identifier, list[i].clientX, list[i].clientY);
      }
    };
    wx.onTouchStart((e) => {
      unlockAudio();
      send('down')(e);
    });
    wx.onTouchMove(send('move'));
    wx.onTouchEnd(send('up'));
    wx.onTouchCancel(send('up'));
  } else {
    canvas = document.getElementById('game');
    // 电脑上预览时装成一部手机大小；手机浏览器里就占满屏
    const phone = window.innerWidth > 520;
    width = phone ? 390 : window.innerWidth;
    height = phone ? Math.min(844, window.innerHeight - 20) : window.innerHeight;
    dpr = window.devicePixelRatio || 2;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      unlockAudio();
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      onTouch('down', e.pointerId, p[0], p[1]);
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e);
      onTouch('move', e.pointerId, p[0], p[1]);
    });
    const up = (e) => {
      const p = pos(e);
      onTouch('up', e.pointerId, p[0], p[1]);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }
  return { canvas, ctx: canvas.getContext('2d'), width, height, dpr };
}

function now() {
  return Date.now();
}

function nextFrame(fn) {
  return requestAnimationFrame(fn);
}

function vibrate(strong) {
  if (isWx && wx.vibrateShort) {
    wx.vibrateShort({ type: strong ? 'heavy' : 'light', fail() {} });
  } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(strong ? 30 : 10);
  }
}

// 激励视频。填了广告位 id 且在微信里才放真广告，返回 true；
// 否则返回 false，由游戏自己放「广告占位」倒计时。
let rewardedAd = null;
function showRewardedAd(adUnitId, onReward, onSkip) {
  if (!isWx || !adUnitId || !wx.createRewardedVideoAd) return false;
  if (!rewardedAd) rewardedAd = wx.createRewardedVideoAd({ adUnitId });
  rewardedAd.offClose();
  rewardedAd.onClose((res) => {
    // 旧版基础库 res 为 undefined，算看完
    if (!res || res.isEnded) onReward();
    else onSkip();
  });
  rewardedAd.show().catch(() => {
    rewardedAd.load().then(() => rewardedAd.show()).catch(() => onReward());
  });
  return true;
}

// 音效：WebAudio（微信 wx.createWebAudioContext，浏览器 AudioContext）。放不出来就安静，不报错
const sfx = require('./sfx.js');
let audio = null;
const buffers = {};
let muted = false;
function audioCtx() {
  if (audio !== null) return audio;
  try {
    if (isWx && wx.createWebAudioContext) audio = wx.createWebAudioContext();
    else if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) audio = new (window.AudioContext || window.webkitAudioContext)();
    else audio = false;
  } catch (e) {
    audio = false;
  }
  return audio;
}
// 浏览器要在手指点下去的那一刻打开声音
function unlockAudio() {
  const a = audioCtx();
  if (a && a.state === 'suspended' && a.resume) a.resume();
}
function sound(name, volume) {
  if (muted) return;
  const a = audioCtx();
  if (!a) return;
  try {
    if (!buffers[name]) {
      const sr = 22050;
      const data = sfx.make(name, sr);
      if (!data) return;
      const buf = a.createBuffer(1, data.length, sr);
      buf.getChannelData(0).set(data);
      buffers[name] = buf;
    }
    const src = a.createBufferSource();
    src.buffer = buffers[name];
    const g = a.createGain();
    g.gain.value = volume === undefined ? 0.6 : volume;
    src.connect(g);
    g.connect(a.destination);
    src.start(0);
  } catch (e) {
    // 放不出声音就算了
  }
}
function setMuted(v) {
  muted = !!v;
}

// 存档：微信用 wx.setStorageSync，浏览器用 localStorage
function load(key) {
  try {
    const raw = isWx ? wx.getStorageSync(key) : window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function save(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (isWx) wx.setStorageSync(key, raw);
    else window.localStorage.setItem(key, raw);
  } catch (e) {
    // 存不了就算了：原型里不影响玩
  }
}

// 载入一张图（Midjourney 背景）。载不到就不回调：游戏照样用代码画
function loadImage(src, onLoad) {
  try {
    const img = isWx ? wx.createImage() : new Image();
    img.onload = () => onLoad(img);
    img.onerror = () => {};
    img.src = src;
  } catch (e) {
    // 没有图就算了
  }
}

function exposeForTest(name, value) {
  if (!isWx && typeof window !== 'undefined') window[name] = value;
}

module.exports = { isWx, setup, now, nextFrame, vibrate, showRewardedAd, load, save, exposeForTest, sound, unlockAudio, setMuted, loadImage };
