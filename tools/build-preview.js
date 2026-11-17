// 把微信小游戏的代码（game.js + js/*.js，CommonJS）打包成一个能直接双击打开的 preview.html。
// 用法：node tools/build-preview.js
// 游戏代码本身一行不改，微信里跑的和浏览器里看的是同一份。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = ['game.js'].concat(
  fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)
);

const defs = files
  .map((f) => {
    const code = fs.readFileSync(path.join(root, f), 'utf8');
    return '__def(' + JSON.stringify(f) + ', function (module, exports, require) {\n' + code + '\n});';
  })
  .join('\n');

const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>瓦西里</title>
<style>
  html, body { margin: 0; height: 100%; background: #07040c; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  canvas { display: block; touch-action: none; border-radius: 18px; box-shadow: 0 0 0 1px #2b2438; }
  @media (max-width: 520px) { canvas { border-radius: 0; box-shadow: none; } }
</style>
</head>
<body>
<canvas id="game"></canvas>
<script>
// 极简 CommonJS：模拟微信小游戏的 require
var __m = {}, __c = {};
function __def(name, fn) { __m[name] = fn; }
function __resolve(from, p) {
  var parts = (from.indexOf('/') >= 0 ? from.slice(0, from.lastIndexOf('/')) : '').split('/').filter(Boolean);
  p.split('/').forEach(function (s) { if (s === '..') parts.pop(); else if (s && s !== '.') parts.push(s); });
  var k = parts.join('/');
  return __m[k] ? k : k + '.js';
}
function __require(from) {
  return function (p) {
    var k = __resolve(from, p);
    if (__c[k]) return __c[k].exports;
    if (!__m[k]) throw new Error('找不到模块 ' + k);
    var module = { exports: {} };
    __c[k] = module;
    __m[k](module, module.exports, __require(k));
    return module.exports;
  };
}
${defs}
__require('')('./game.js');
</script>
</body>
</html>
`;

// preview.html 给本地双击；index.html 给 GitHub Pages 当首页（内容一样）
fs.writeFileSync(path.join(root, 'preview.html'), html);
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('写好了 preview.html 和 index.html（' + files.length + ' 个文件）');
