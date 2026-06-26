# PlayableMaker 微信移植 — 问题与 API 参考

## 微信工程命名与模板

| 路径 | 用途 |
|------|------|
| `phaser3.90.0/` | 版本模板（骨架），**不要**在此 build 某个游戏 |
| `phaser3.90.0_{YYYY-MM-DD_HHmmss}/` | 独立游戏工程，微信开发者工具打开此目录 |
| `.wx-project` | 一行文本，记录当前 `build:wx` 输出目录名 |

```bash
npm run init:wx                              # 自动命名
npm run init:wx -- phaser3.90.0_2026-06-24_101530   # 手动命名
WX_PROJECT=phaser3.90.0_xxx npm run build:wx # 临时指定输出
```

命名由 `scripts/wx-project.mjs` 读取 `package.json` 的 `phaser` 版本生成。

---

## 原则

兼容知识按 **「什么问题 → 缺什么 API → 用什么替代 → 改哪一层」** 组织。

PlayableMaker 每次导出压缩变量名不同，**不必记**。方法名（`openUrl`、`startGame`、`loadAssets`）和 Phaser/wx API 是稳定的。

---

## 问题 → API 对照表（核心储备）

### 1. 包内资源加载失败

| | |
|---|---|
| **现象** | `!Load Error: undefined` 刷屏；或 `response of null` |
| **根因** | Phaser Loader 走 XHR，微信读不了 `assets/xxx.png` |
| **H5 API** | `XMLHttpRequest` / fetch |
| **wx 替代** | `wx.getFileSystemManager().readFile` |
| **补丁层** | Phaser — `File.prototype.load` |
| **要点** | 图片 base64 → `Image.src`；音频伪造 xhrLoader；完成后 `loader.nextFile(file, true)` |

### 2. Loader 卡死，只有 Try start game

| | |
|---|---|
| **现象** | 有 `Try start game`，无 `DATA LOADED` |
| **根因** | 图片 load 完成没走 `nextFile`，inflight 不归零 |
| **关键 API** | `file.useImageElementLoad`、`loader.nextFile` |
| **补丁层** | Phaser — `wxFinishImageLoad` |

### 3. Canvas / 渲染起不来

| | |
|---|---|
| **现象** | `Cannot assign to read only property 'canvas'`；黑屏 |
| **根因** | weapp-adapter 的 canvas 只读；不能用 DOM parent |
| **H5 API** | `document.createElement('canvas')`、`parent: div` |
| **wx 替代** | `window.canvas`（只读使用）、`Phaser.WEBGL`、`wx.getWindowInfo()` |
| **补丁层** | Phaser `getParent=noop` + runtime `startGame` |
| **禁止** | `GameGlobal.canvas = ...`、`window.canvas = ...` |

### 4. mp4 视频

| | |
|---|---|
| **现象** | `VideoFile: No supported format` |
| **根因** | 微信小游戏不支持 mp4 |
| **H5 API** | `load.video()`、`<video>` |
| **wx 替代** | runtime 跳过 `load.video`；`Video.play()` 直接 `emit(COMPLETE)` |
| **补丁层** | runtime `loadAssets` + Phaser `Video.play` / `LoaderPlugin.video` |

### 5. 字体加载

| | |
|---|---|
| **现象** | 文字不显示或 font load 报错 |
| **根因** | `FontFace(url('./assets/x.ttf'))` 路径在 wx 无效 |
| **H5 API** | `FontFace` + url 路径 |
| **wx 替代** | `readFile` base64 → `FontFace(name, 'url(data:font/ttf;base64,...')` |
| **补丁层** | runtime `loadFont` |

### 13. 预览/上传 bundle 语法错误

| | |
|---|---|
| **现象** | `invalid file: js/playable/bundle.js`；`SyntaxError: Unexpected token ?` |
| **根因** | PlayableMaker runtime 含 `??` / `?.`（ES2020）；微信小游戏 JS 引擎不支持 |
| **H5 API** | 现代浏览器原生支持 nullish coalescing / optional chaining |
| **wx 替代** | 构建时降级：`vite/config.wx.mjs` → `target: es2015` + terser `format.ecma: 5` |
| **补丁层** | `vite/config.wx.mjs`（勿改 bundle.js 手工替换） |
| **搜** | `??`、`?.`；`build.target`、`nullish-coalescing` |
| **验证** | `build:wx` 后 bundle 中 `(c.match(/\?\?/g)||[]).length === 0` |
| **搜** | `loadFont(` |

### 6. matchMedia / DPR

| | |
|---|---|
| **现象** | `matchMedia is not defined` |
| **根因** | 小游戏无 `window.matchMedia` |
| **wx 替代** | wx 分支直接 return，不注册 listener |
| **补丁层** | runtime `updatePixelRatioEvent` |
| **搜** | `updatePixelRatioEvent(`、`matchMedia(` |

### 7. CTA / 跳转商店

| | |
|---|---|
| **现象** | `window.open is not a function`；点击 PLAY NOW 无反应 |
| **根因** | 各渠道 SDK（mraid、FbPlayableAd、硬编码 store URL）在 wx 不存在 |
| **H5 API** | `window.open`、`mraid.open`、`FbPlayableAd.onCTAClick` |
| **wx 替代** | `wx.notifyMiniProgramPlayableStatus({ isEnd: true })`（需存在才调用；开发者工具普通小游戏无此 API） |
| **补丁层** | runtime `openUrl` — 方法入口：`wx.notifyMiniProgramPlayableStatus && wx.notifyMiniProgramPlayableStatus(...)` |
| **搜** | `openUrl(` |

### 11. document.title 只读

| | |
|---|---|
| **现象** | `Cannot assign to read only property 'title'` → `Cannot set def-template.` |
| **根因** | weapp-adapter 的 `document.title` 是只读 getter |
| **wx 替代** | wx 下跳过 `document.title = ...` |
| **补丁层** | runtime `initGame` |
| **搜** | `document.title=` |

### 12. 资源扩展名大小写

| | |
|---|---|
| **现象** | `[wx] read fail: assets/xxx.MP3 {}`；`.mp3` 正常 |
| **根因** | 微信包内路径大小写敏感 |
| **wx 替代** | 复制资源时扩展名统一小写；def-template 引用同步小写 |
| **补丁层** | `copy-wx-assets.mjs` + `phaser-wx-patch.js` readFile 路径 fallback |
| **搜** | `.MP3`、`.PNG` |

### 8. 启动 / bootstrap

| | |
|---|---|
| **现象** | 白屏；`Use Inline Assets: true` |
| **根因** | 原版等 `load` 事件 + webpack inline base64 |
| **wx 替代** | 外置 `assets/`；`initPlayableGame(null, gameDef)`；`useInlineAssets() === false` |
| **补丁层** | extract bootstrap + `src/wx/main.js` import JSON |

### 9. 模块系统

| | |
|---|---|
| **现象** | `module 'bundle.js' is not defined` |
| **根因** | 微信不支持 ES module 作入口 |
| **wx 替代** | `require('./js/playable/bundle.js')`，vite 输出 CJS |
| **补丁层** | `game.js`、`vite/config.wx.mjs` |

### 10. getParent DOM 操作

| | |
|---|---|
| **现象** | `Cannot set property 'height' of undefined` |
| **根因** | ScaleManager 操作 `document.documentElement` |
| **wx 替代** | `getParent` 返回空 |
| **补丁层** | Phaser — `ScaleManager.prototype.getParent` |

---

## 错误速查（症状 → 问题编号）

| 控制台 | → 问题 # |
|--------|----------|
| `!Load Error: undefined` | 1 |
| 只有 Try start game | 2 |
| `read only property 'canvas'` | 3 |
| `VideoFile: No supported format` | 4 |
| `matchMedia is not defined` | 6 |
| `window.open is not a function` | 7 |
| `Use Inline Assets: true` 且无加载 | 8 |
| `module 'bundle.js' is not defined` | 9 |
| `Cannot set property 'height'` | 10 |
| `Cannot set def-template.` | 看**第一个** TypeError，对照上表 |

---

## Phaser 层代码要点（phaser-wx-patch.js）

```javascript
// 本地文件 → readFile
FileProto.load = function () {
  this.src = GetURL(this, this.loader.baseURL);
  if (!/^https?:\/\//i.test(this.src) && !this.base64) {
    wx.getFileSystemManager().readFile({ ... });
    return;
  }
  return originalFileLoad.call(this);
};

// 图片 success
file.loader.nextFile(file, true);

// 音频 success
file.xhrLoader = { response: res.data, readyState: 4, status: 200 };
file.onLoad(file.xhrLoader, { target: { status: 200 } });
```

---

## Runtime 层：按方法名定位

不管变量叫 `q`/`et`/`R`，搜方法名：

| 方法 | wx 要做什么 | 验证关键词 |
|------|------------|-----------|
| `openUrl(` | 入口加 notifyMiniProgramPlayableStatus | `notifyMiniProgram` |
| `loadAssets(` | video 类型跳过 load.video | `typeof wx==="undefined"&&this.load.video` |
| `loadFont(` | readFile + FontFace base64 | `getFileSystemManager` |
| `startGame(` | WEBGL + window.canvas + screenSize | `window.canvas`、`Phaser.WEBGL` |
| `updatePixelRatioEvent(` | wx return | `updatePixelRatioEvent(){if(typeof wx` |

---

## game.js 模板

```javascript
require('./js/libs/weapp-adapter.js');

var windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
var canvas = window.canvas;
if (canvas) {
  canvas.width = windowInfo.screenWidth;
  canvas.height = windowInfo.screenHeight;
}

var bootPlayable = require('./js/playable/bundle.js');
function start() { bootPlayable(null); }

requestAnimationFrame(function () {
  requestAnimationFrame(function () { setTimeout(start, 50); });
});
```

---

## 微信开发者工具

```json
{ "setting": { "bigPackageSizeSupport": true, "urlCheck": false } }
```

---

## 资源导出

export 目录需含二进制文件（png/mp3/…），不能只有 manifest。mp4 可选（wx 构建跳过）。

---

## 追加新兼容项（模板）

遇到新问题时，按此格式记入本文：

```markdown
### N. 简短问题名
| | |
|---|---|
| **现象** | 控制台报错 / 行为 |
| **根因** | 为什么 H5 行、wx 不行 |
| **H5 API** | 原版用的 |
| **wx 替代** | 用什么 |
| **补丁层** | Phaser / runtime / extract / game.js |
| **搜** | 稳定方法名或 API 名 |
```

---

## extract 脚本（实现细节，非核心知识）

`extract-runtime.mjs` 负责：切分 output.html、`_t(853)`/`Zt(853)` → Phaser、替换 bootstrap、自动注入 runtime 层 wx 补丁。

格式 marker（legacy/v2）会随 PlayableMaker 版本变，**不必背** — extract 失败时 `npm run probe:output`，扩展 `locateSections()` 即可。

---

## bundle 体积与构建

`vite/config.wx.mjs` 当前策略：

| 项 | 值 | 原因 |
|---|---|---|
| `build.target` | `es2015` | 降级 runtime 的 `??` / `?.` |
| `esbuild.supported` | 关闭 nullish-coalescing、optional-chain | 同上 |
| `minify` | `terser`，`format.ecma: 5` | 微信引擎兼容；`compress: false` 仅语法降级 |
| Phaser alias | 完整 `phaser.js` | 默认 ~7MB bundle；可换 `phaser-arcade-physics.min.js` 压到 ~1.2MB |

**禁止** `minify: false` 且无 target——本地 Node 能跑，微信预览/上传会失败。
