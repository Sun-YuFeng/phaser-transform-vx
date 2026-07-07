# Phaser 3.88.2 微信兼容参考

内嵌 Phaser 3.88 webpack bundle（`webpack_main` 格式）的 wx 适配要点。  
来源：Beauty Tiles 试玩迁移实践；在本仓库中对应 `extract` → `src/playable/runtime.js` → `build:wx` → `bundle.js` 管线。

**模板层**（`init:wx --template phaser3.88.2` 已复制，一般无需再改）：

- `phaser3.88.2/game.js`：adapter → **dom-parser** → bundle（**勿** wxSetupCanvas）
- `phaser3.88.2/js/libs/dom-parser.js`：位图字体 XML
- `phaser3.88.2/js/libs/weapp-adapter.js`：`document.elementFromPoint` → `window.canvas`

**运行时层**（extract 后在 `src/playable/runtime.js` 搜关键字改，改完 `build:wx`）：

---

## 问题 → 修改速查

| 序号 | 报错 / 现象 | 搜索关键字 | 处理方式 |
|------|-------------|-----------|----------|
| 1 | `HTMLVideoElement is not defined` | `HTMLVideoElement`、`requestVideoFrameCallback` | 注释整个 polyfill 模块体（微信无 `<video>`，即使用 `&&` 也会 ReferenceError） |
| 2 | `appendChild is not a function` | `document.documentElement.appendChild`、iOS 视口测量 | 注释函数体，或改为 `return window.innerHeight` |
| 3 | `Framebuffer Incomplete Attachment` | `this.phaserConfig = {`、`Phaser.Game` 配置 | `type: WEBGL`（非 AUTO）；加 `canvas: window.canvas`；`width/height` 用 `window.innerWidth/innerHeight`，勿用 `document.documentElement.clientWidth/Height` |
| 4 | `getElementsByTagName of null` | `Phaser.DOM.ParseXML`、`loadBitmapFonts` | 保持 ParseXML 逻辑；确认模板 `game.js` 已 require `dom-parser.js` |
| 5 | 卡在 preload / `request() is not implemented` | `const Ee =`、路径加载开关 | 微信必须 `const Ee = false`（用内嵌 base64，勿 `./assets/bitmapFont/...` + wx.request） |
| 6 | `loading.style of null` | `getElementById("loading")` | 删除或注释 `onComponentsReady` 里隐藏 loading 的行（微信无 HTML 页面） |
| 7 | `elementFromPoint is not a function` | — | 模板 weapp-adapter 已 polyfill；若缺失见下文 |
| 8 | 无报错但画面/触摸冻结 | `pauseOnBlur`、`visibilityState` | extract：`pauseOnBlur:!1`；PlayableSDK 门闩 wx 下直接 `F()` |
| 9 | 动画抖、UI 位置被 resize 打断 | `scale.on("resize")`、yoyo tween | extract：resize 去重 + `{from,to}` 浮动 tween |
| 10 | 开发者工具有反应、**真机只有 Play 能点** | `downElement`、`elementFromPoint`、`setCanvasOver` | 见下文「交互：电脑端 vs 手机端」 |
| 11 | `assets/` 有文件但 bundle 仍含 base64 | `load.image(...,"data:...")` | extract 自动 `externalize-wx-assets.mjs` |
| 12 | 换左下角 logo 无效 | `st.zh` / `logo_zh` | 改 manifest 源文件后 `extract` + `build:wx` |

---

## 模板：`game.js`

```javascript
require('./js/libs/weapp-adapter.js');
require('./js/libs/dom-parser.js');   // 必需：微信无 DOMParser
// 勿 wxSetupCanvas — Phaser 自行设 canvas 尺寸
require('./js/playable/bundle.js');
```

---

## 模板：`weapp-adapter.js` — elementFromPoint

全屏单 canvas 试玩：**不要做** `innerWidth/innerHeight` 边界判断——真机 touch 坐标与逻辑像素可能不一致，会导致 `isOver=false` → `touchmove` 不派发 → 拖拽失效。

```javascript
elementFromPoint: function elementFromPoint(x, y) {
  return window.canvas || null;
},
```

同文件 **`Audio.play()`** 需 `return Promise.resolve()`（H5 代码普遍 `play().catch(...)`，微信 `InnerAudioContext.play()` 无返回值）。

触摸 `changedTouches` 建议 `normalizeTouchPoint` 补全 `target: window.canvas`（模板已含则跳过）。

---

## runtime.js：`phaserConfig` 与尺寸

**搜索：** `this.phaserConfig = {`、`setGameSize`、`getScreenWidth`、`getScreenHeight`

```javascript
// phaserConfig
type: Phaser.WEBGL,           // 或内联变量 .WEBGL，勿 AUTO
canvas: window.canvas,
width: window.innerWidth,
height: window.innerHeight,

// setGameSize
this.phaserGame.scale.resize(window.innerWidth, window.innerHeight);

// getScreenWidth / getScreenHeight
return window.innerWidth;
return window.innerHeight;
```

**勿**用 `document.documentElement.clientWidth/Height`（微信为 `undefined` → WebGL 帧缓冲异常）。

**勿**在 `game.js` 调 `wxSetupCanvas`（与 3.90 不同）。

---

## runtime.js：位图字体

**搜索：** `loadBitmapFonts`、`Phaser.DOM.ParseXML`、`selectedBitmapFontsInfo`

| 要点 | 说明 |
|------|------|
| 格式 | 多为 **XML + PNG** 内嵌在 bundle，不是 JSON |
| ParseXML | **保持**原始 ParseXML + ParseXMLBitmapFont，不要抄其他游戏写死的 `chars` |
| dom-parser | 必须；否则 ParseXML 返回 null → `getElementsByTagName of null` |
| `const Ee` | 微信固定 **`false`**：`true` 走路径 + `wx.request` 会卡死 |

内嵌资源通常在 bundle 末尾以 Map 注册（如 `zs.set("allLetters_PNG", ...)`）；可用工具导出 png/xml 作备份，**不要**在微信里用文件路径加载位图字体。

---

## runtime.js：HTMLVideoElement polyfill

**搜索：** `HTMLVideoElement`

将整个 webpack 模块体注释为空函数。微信无 `HTMLVideoElement` 全局，引用即报错。

---

## runtime.js：视口测量模块

**搜索：** `document.documentElement.appendChild`、iOS viewport 技巧

注释整个函数体，或替换为：

```javascript
return window.innerHeight;
```

---

## runtime.js：loading 遮罩

**搜索：** `getElementById("loading")`

删除或注释：

```javascript
document.getElementById("loading").style.display = "none"
```

该元素只在浏览器 `output.html` 存在，微信无 DOM。

---

## 资源外置（externalize）

**现象：** `copy-wx-assets` 已复制 `assets/*.png`，但 `bundle.js` 仍含大量 `data:image/png;base64`（体积大、改磁盘文件不生效）。

**根因：** `webpack_main` extract 原样保留 PlayableMaker 内嵌 URL；`load.image("key",...)` 与 `load.image(st.zh,...)` 等变量 key 未被替换。

**处理（已自动化）：** `scripts/externalize-wx-assets.mjs`，由 `extract-webpack-main.mjs` 在 webp→png 之后调用：

| 类型 | 替换为 |
|------|--------|
| `this.load.image("foo","data:...")` | `assets/foo.png` |
| `this.load.image(st.zh,"data:...")` 等 | `assets/st.zh.png`（logo / 引导图） |
| `this.load.image(nt|rt|ot,"data:...")` | `assets/nt.png` 等 |
| `lt` / `ct` 棋子映射 | `assets/levelN_itemM.png` |
| `playClickSound` 等 + `startBgm` | `assets/*.mp3` |
| 仅存在于 bundle 的帧（如 `tutorial_anim_2`） | 解码写入 `public/assets/` |

manifest 中 **mime 为 webp 但无 `.webp` 后缀**（如 `st.zh`）在 `collectWebpackAssets` 里按 webp 转 png。

**验证：**

```bash
npm run extract
node -e "const c=require('fs').readFileSync('src/playable/runtime.js','utf8'); console.log('game png embeds', (c.match(/data:image\/png;base64,/g)||[]).length);"
```

游戏资源 base64 应接近 0（仅剩 Phaser 引擎内部白图等）。

---

## Logo / 多语言角标

左下角「好莱坞合成」类 logo 在 manifest 中常为 **无扩展名 webp**：

| 文件 | 纹理 key | 说明 |
|------|----------|------|
| `images/st.zh` | `logo_zh` | 中文 |
| `images/st.en` | `logo_en` | 英文 |
| `images/st.ja` / `st.ko` | `logo_ja` / `logo_ko` | 其他语言 |

**换图：** 替换 `sources/current/*_output/images/st.zh`（或对应语言）→ `npm run extract` → `npm run build:wx`。须先完成 externalize，否则仍读 bundle 内嵌。

---

## 交互：电脑端（开发者工具）vs 手机真机

实践来源：`webpack_main` 合成试玩（2026-06，Phaser 3.88.2）。

### 电脑端 / 模拟器常见问题

| 现象 | 根因 | 补丁层 | 搜索关键字 |
|------|------|--------|-----------|
| 无报错但卡住、动画不跑 | `pauseOnBlur` 默认 true，微信 blur 语义异常 | extract `WX_GAME_CONFIG` | `pauseOnBlur:typeof wx` |
| Phaser / SDK 永不启动 | PlayableSDK 等 `visibilityState==='visible'` | extract `applyWxBundlePatches` | `document.visibilityState&&F` |
| 动画流畅但点不了（早期） | touch 无 `target` → 无 `POINTER_DOWN` | extract + `apply-phaser-wx-patches.js` | `downElement` |
| 浮动 UI 抽搐 | resize 每帧 `layoutScene` 重置 y | extract | `__wxLastLayout`、`startTutorialFloatAnimation` |
| yoyo tween 异常 | 单值 `y: y-10` 与 layout 冲突 | extract | `y:{from:s-10,to:s+10}` |
| `play().catch of undefined` | 微信 Audio 无 Promise | 模板 weapp-adapter | `Audio.prototype.play` |
| CTA 无反应 | `window.open` / SDK 变量名 | extract | `jumpToStore`、`notifyMiniProgramPlayableStatus` |

### 手机真机特有问题

**现象：** 开发者工具正常；**真机只有 Play Now（`setInteractive` 按钮）有反应**，点空白不进教程、棋子拖不动、无报错。

**根因（三层叠加）：**

1. **`POINTER_DOWN` 不发** — `processDownEvents` 要求 `pointer.downElement === game.canvas`；真机 `touch.target` 常非 canvas → 只发 `POINTER_DOWN_OUTSIDE`，场景级 `input.once("pointerdown")` 不触发。
2. **`touchmove` 断链** — `TouchManager.onTouchMove` 用 `elementFromPoint(clientX,clientY)===canvas` 维护 `isOver`；边界判断失败则 `pointer.touchmove` 不执行 → **拖拽失效**。
3. **假关全屏遮罩** — `isFake` 关卡 `installOverlay`（depth 30 全屏 `setInteractive`）在 H5 用于点进商店，会吃掉棋盘触摸。

**处理（分层）：**

| 层 | 文件 | 做法 |
|----|------|------|
| Phaser 补丁 | `src/wx/apply-phaser-wx-patches.js` | `Pointer.touchstart`：强制 `touch.target=canvas`、`downElement=canvas`；`TouchManager.onTouchStart/Move`：wx 下 `setCanvasOver` |
| extract 内嵌 Phaser | `scripts/extract-webpack-main.mjs` | `processDownEvents`：wx 强制 `t.downElement=canvas`；wx 跳过 `installOverlay`；wx 允许 `isFake` 关 `handlePieceDragStart` |
| 模板 adapter | `phaser3.88.2/js/libs/weapp-adapter.js` | `elementFromPoint` 直接返回 `window.canvas` |

**调试（`game.js` 注释已说明）：**

```javascript
GameGlobal.__WX_DEBUG_INPUT__ = true;   // [wx] pointer touchstart ...
GameGlobal.__WX_DEBUG_RESIZE__ = true;  // scale resize 频率
```

**自检（`build:wx` 后）：**

```bash
node -e "const b=require('fs').readFileSync(require('fs').readFileSync('.wx-project','utf8').trim()+'/js/playable/bundle.js','utf8'); ['wxTouchStart','downElement=this.manager.game.canvas','typeof wx===\"undefined\"&&(this.installOverlay'].forEach(k=>console.log(k,b.includes(k)));"
```

---

## extract 自动化补丁（`applyWxBundlePatches`）

以下在 **`npm run extract`** 时写入内嵌 bundle，**重新 extract 不会丢失**（无需手改 `runtime.js`）：

- Phaser wx 钩子、`WX_GAME_CONFIG`（WEBGL、canvas、pauseOnBlur、resize）
- PlayableSDK 可见性 / load 门闩
- resize 去重、教程浮动 tween
- CTA → `notifyMiniProgramPlayableStatus`
- 触摸：`downElement`、`installOverlay`、`handlePieceDragStart`
- 资源 **externalize**（见上）

**仍可能需手改或随 HTML 变化失效的**（搜关键字核对）：

1. HTMLVideoElement polyfill 模块（正则替换）
2. iOS 视口 `57811` 模块（若 webpack id 变了）
3. 个别游戏特有的 DOM / 位图字体 `Ee`（若 extract 未覆盖）

**不受 extract 影响**（模板 `init:wx` 复制，改模板后新工程生效；**当前工程**需同步 `{wx}/js/libs/weapp-adapter.js`）：

- `game.js`、`dom-parser.js`、`weapp-adapter.js`（elementFromPoint、Audio.play）

改共享层 `src/wx/` 或 extract 脚本后：`npm run extract`（若改了 sources）+ `npm run build:wx`。

---

## 调试建议

1. 微信开发者工具 → 详情 → 本地设置 → 不校验合法域名（开发阶段）
2. 卡住时看控制台**最后一条**日志，对照速查表
3. 位图字体：确认 `Ee === false` 且内嵌 png/xml 仍在 bundle 末尾
4. 改 `runtime.js` 后必须 `npm run build:wx`，**不要**手改 `output/wx/.../bundle.js`

---

## 与 PlayableMaker 3.90 的差异

| 项目 | 3.90 PlayableMaker | 3.88.2 webpack bundle |
|------|-------------------|-------------------------|
| game.js | wxSetupCanvas + bundle | dom-parser + bundle，**无** wxSetupCanvas |
| Phaser | runtime 外链 | bundle **内嵌** |
| 位图字体 | 视游戏 | 常需 dom-parser + `Ee=false` |
| 改入口 | `src/wx/` + runtime 方法名 | 同上，但 phaserConfig/尺寸/Ee 等多处 webpack 模块 |
