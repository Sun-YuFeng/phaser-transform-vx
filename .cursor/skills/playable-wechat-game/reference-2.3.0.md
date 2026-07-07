# Phaser 2.3.0 / QC / PlaySmart 微信兼容参考

QiCi + Phaser 2.3.0 + JSZip HTML 的 wx 适配要点。  
来源：PlaySmart 试玩迁移实践（2026-06）；对应 `extract:phaser2` → `build:wx:phaser2` → `js/main.js` 管线。

**迁移流程见** `.cursor/rules/playable-wx-2.3.0.mdc`  
**模板入口：** `phaser2.3.0/game.js`（adapter → phaser2-wx-patch → main.js → bootQici）

---

## 补丁文件地图

| 现象域 | 改哪里 | 构建后落在 |
|--------|--------|------------|
| Loader / JSON / xhr / scale | `patchPhaser2ForWx` in `scripts/phaser2-wx-sanitize.mjs` | `phaser.min.js` + `main.js` |
| 图集 / Dom / Node / 触控 / 全屏 | `sanitizeQcCoreForWx` | `qc-core-min.js` + `main.js` |
| gameStart / 黑屏 / 音效 / **掉帧** | `sanitizeGameScriptsForWx` + `sanitizePlayableScript` | `game-scripts.min.js` + `main.js` |
| pl-adapter / 字体 | `sanitizePlAdapterForWx` / `sanitizeResourceLoaderForWx` | `main.js` |
| qici 启动 | `phaser2.3.0/game.js` `bootQici()` | 模板（init:wx 复制） |
| WebAudio / DOM / 触控桥 / CTA | `src/phaser2/wx/phaser-wx-patch.js` | `{wx}/js/libs/phaser2-wx-patch.js` |
| 音效文件位置 | `syncPhaser2WxAudio` in `scripts/copy-wx-phaser2-libs.mjs` | `{wx}/resource/game/audio/*.mp3.bin` |
| `.bin` JSON | `scripts/fix-phaser2-bin.mjs` | `{wx}/resource/**/*.bin` |
| 合并兜底 | `patchBundle` in `scripts/build-phaser2-game-bundle.mjs` | `main.js` |

改 sanitize 或 patch 后必须：`npm run build:wx:phaser2`，微信工具 **清缓存 → 重新编译**。

---

## 问题 → 修改速查

| 序号 | 报错 / 现象 | 根因 | 处理 |
|------|-------------|------|------|
| 1 | 无 Phaser / 卡在 loading | sanitize 去掉 `window load→qici.init` | `game.js` 在 `require main.js` 后调 `bootQici()`；bundle 尾 `__wxQiciBoot` 兜底 |
| 2 | `appendChild` / `Node` @ World | 微信 canvas 非 DOM Node | `patchPhaser2ForWx` addToDOM 走 `linkCanvasParent`/`setWxParent`；`phaser-wx-patch.js` lenient appendChild |
| 3 | `request() is not implemented` | xhrLoad 走 XHR/wx.request | `xhrLoad` → `getFileSystemManager().readFile`；`fileComplete` 识别 string/ArrayBuffer |
| 4 | `json[gameConfig]: Unexpected token u` | readFile 回字符串，仍 `JSON.parse(e.responseText)` | `jsonLoadComplete`/`csvLoadComplete`/`xmlLoadComplete`：`typeof e==="string"` 直接用 `e` |
| 5 | `Invalid key: "gameConfig"` | 上条导致 cache 无 key | 修 #4；确认 `resource/config/gameConfig.json`（copy 自 `gameConfig_json.json`） |
| 6 | `[phaser2] atlas tex iVBORw0KGgo...` | base64 含 `/`，误判为文件路径 | `_parseAtlas`：以 `iVBORw0KGgo`/`/9j/` 或「长串且非 resource/ 路径」→ `data:image/...;base64,`；**勿** `indexOf("/")<0` |
| 7 | `getTexture of null` / ParticleSystem | 图集 #6 失败连锁 | 修 #6；确认 `hasBase64()→false` 且 `assetsPackage=null`（空 `{}` 会误进 data.js 分支） |
| 8 | `data:image/png;base64,image_xxx_png` | 空 assetsPackage 当 truthy | stub `assetsPackage=null`；qc-core：`!D.__wx && (hasBase64() \|\| keys(assetsPackage).length)` |
| 9 | `Parse fail` + `*.bin` | 内嵌 JSON 未转义 / 字面换行 | `fix-phaser2-bin.mjs`（build 自动跑）；手修：`node scripts/fix-phaser2-bin.mjs "{wx}/resource"` |
| 10 | `setPropertyIgnoreLayout of undefined` | start/gamePlay prefab 解析失败连锁 | 修 #8/#9；查 `start.bin` / `gamePlay.bin` inner JSON 能否 `JSON.parse` |
| 11 | 黑屏 / 有 gameReady 无 gameLaunch | `AUTO_GAMESTART:false` + UIRoot 隐藏 | `sanitizeGameScriptsForWx` wx 自动 `gameStart()`；`game.js` `waitGameStart()` |
| 12 | `DraggableItem not exists` | 类名注册不一致 | 双注册 `DraggableItem` / `ps.DraggableItem`；`findClass` 回退 |
| 13 | `createElementNS` / strict | 多文件合并 strict | `disableUseStrict` + 单文件 bundle；`pl-adapter` 去 `with` |
| 14 | 字体 / FontFace 报错 | 微信不适配自定义 TTF | `sanitizeResourceLoaderForWx` stub；build 跳过 font 写出 |
| 15 | 真机 `substr` @ pl-adapter | `location.search` 为 undefined | weapp-adapter 补 `search:''`；pl-adapter/languagesMgr `(location.search\|\|"").substr(1)` |
| 16 | 每帧 `window.scrollTo is not a function` | Phaser `ScaleManager.scrollTop` | `phaser-wx-patch` 补 noop；`patchPhaser2ForWx` wx 下 scrollTop return |
| 17 | `AudioContext is not a constructor` | `bootstrapWxWebAudio` 未在 main 前执行 | patch 加载即 bootstrap；`game.js` 调 `bootstrapPlayableWx`；无 API 时用 stub |
| 18 | `addColorStop with invalid params` | UIText 渐变传 Color 对象 | `bootstrapWxCanvasGradient` + qc-core / patchBundle 改 `_startColor` 字符串 |
| 19 | `does not support webGL` / `_qc` null | wx 误报 webGL + 未绑 canvas | 实测 canvas webgl；失败 fallback Canvas；qc-loading 传 `window.canvas` |
| 20 | `load audio failed` + `.mp3.bin not found` | 音效在 `assets/`，引擎读 `resource/game/audio/` | build 时 `syncPhaser2WxAudio`；`httpLoadAsset` 多路径回退 |
| 21 | `e.catch is not a function` @ decodeAudioData | 微信 `decodeAudioData` 同步返回非 Promise | sanitize/patchBundle：仅 thenable 才 `.catch()` |
| 22 | BGM 无声 / 路径错 | 默认 `bm_bgm0.mp3` 不存在 | 改为 `game/audio/bm_bgm.mp3` |
| 23 | `module 'js/main.js' is not defined` | bundle 语法错误或 data.js 重复 stub | 查 `webGlCreateWx` 括号；`DATA_JS_STUB` 勿重复 `assetsBase64()` |
| 24 | GlobalConfigBg 被 canvas 盖住 | H5 body CSS 背景 wx 不可见 | game-scripts：wx 改 canvas UIImage 背景 |
| 25 | `onShow/onHide not implemented` | playable-libs 期望 MRAID | 可忽略；`bootstrapWxLifecycle` 用 `wx.onAppShow/onAppHide` |
| 26 | 真机点不动 / 拖拽无反应 | Touch 监听 gameDiv 非 document；`_toWorld` 仅改一处 | generator→`document`；touch bridge；**split/join 替换全部 `_toWorld`** |
| 27 | 触控 `world: Infinity` / 静默 miss | `scale.width=0` → `scaleFactor=Infinity` | `updateScalingAndBounds` 补 `windowWidth/Height`；`_toWorld` 有限性回退 |
| 28 | `touch dbg` raw y≈510 → world y≈65 | `scale.width=0` 时 `alignCanvas` 算出 ~445px `margin.top` | wx `alignCanvas` 强制 margin=0；`_toWorld` 在 `!scale.width` 时忽略 margin |
| 29 | `gainFocus` 崩溃阻断 touch | 微信 `document` 无 `focus()` | qc-core `gainFocus` wx 早退 + `generator.focus` 守卫 |
| 30 | `Maximum call stack` @ updateScale/relayout | `_adjustToFullScreen` 内调 `updateScale` 与 `updateGameLayout` 互递归 | `__wxAdjusting` 防重入；**勿**在 refresh 里反复 `setGameSize` |
| 31 | 真机只有背景图 | `_adjustToFullScreen` 被 noop 或未 `setGameSize` | wx fullScreen：`getSystemInfoSync`→`setGameSize`→`updateScale()`；启动后 `_adjustToFullScreen(true)` 补一次 |
| 32 | PC 画面偏移 / 拉伸 | `loadGame` 强行注入 canvas 像素或 refresh 改尺寸 | `loadGame` 保持 `100%`；ScaleAdapter 管布局；**勿** `syncWxPhaserScale` 每帧改尺寸 |
| 33 | CTA 点完无试玩结束页 | H5 `window.install` / `PLAYABLE:install` 无 wx API | `bootstrapWxPlayableInstall` 包装 `window.install` → `notifyMiniProgramPlayableStatus({ isEnd: true })` |
| 34 | `install：undefined` 日志 | DEBUG 下 `InstallType.None` 未传 type | 正常，非报错；CTA 仍走 `window.install` |
| 35 | 拖拽/擦除掉帧（肥皂、刮胡刀等） | `VPHand` / 擦除阶段 log 在 touchmove 刷屏；`checkFilledPercentage` 重复 dispatch；全图像素扫描 | 见下方 **§ 掉帧专章** |
| 36 | 控制台刷 `VPHand: MOVE` | `ps.VPHand.dispatchEvent` 每事件 `console.log` | `sanitizeGameScriptsForWx`：`console.log("VPHand:...")` → `void 0` |
| 37 | 控制台刷 `到达某一阶段` | `EraseComponent` 实时判定 + debug log | 去擦除 log；`_eraseStepCache` 防抖；wx `updateBMDRefrshInterval` 280ms |
| 38 | 拖动手感迟滞但阶段仍触发 | 仅判定节流过重 | 酌情调低 interval（如 180ms），**勿**节流 `eraseController` 轨迹 |
| 39 | `ENOENT ... js/playable/mw-config.js` | build 内联 MW_CONFIG 后 delivery 删文件，devtools 仍缓存该路径 | delivery 留 stub；`packOptions.ignore` 忽略该文件；MW_CONFIG 只在 `main.js` 头 |

---

## 模板：`game.js` 要点

```javascript
import './js/libs/weapp-adapter.js';
require('./js/libs/phaser2-wx-patch.js');
g.__wx = true;
g.canvas = GameGlobal.canvas;
if (typeof g.bootstrapGameDiv === 'function') g.bootstrapGameDiv();
require('./js/main.js');
if (typeof g.bootstrapPlayableWx === 'function') g.bootstrapPlayableWx();
bootQici();        // 勿只靠 document/window load
waitGameStart();   // AUTO_GAMESTART 兜底
```

---

## 构建时补丁详解

### Phaser（`patchPhaser2ForWx` → `phaser.min.js`）

| 补丁 | 说明 |
|------|------|
| IIFE `.call(window/GameGlobal)` | require 下顶层 `this` 为 undefined |
| `window.*` → `GameGlobal.*` | PlaySmart base64 钩子（hasBase64、assetsPackage 等） |
| canvas 复用 | wx 下 `this.canvas = window.canvas`，勿重复 create |
| canvas.style 空指针 | 赋值前判空 |
| World.resize | camera 未就绪 return |
| preUpdate 状态切换 | try/catch 防 pendingState 异常 |
| touch preventDefault | wx 跳过 consumeDocumentTouches / preventDefault（passive） |
| device.touch | `window.__wx` 强制 true |
| Stage.boot | wx 下 `disableVisibilityChange=true` |
| getOffset | wx 返回 `(0,0)`（canvas 全屏） |
| addToDOM / removeFromDOM | wx 走 `linkCanvasParent`，不 appendChild 真 DOM |
| xhrLoad | 本地路径 → `readFile`；扩展名大小写重试 |
| fileComplete | string / ArrayBuffer 直接用 |
| json/csv/xml LoadComplete | `typeof e==="string"` 分支 |
| scrollTop | wx noop |
| webGL 检测 | 实测主 canvas；失败 fallback CanvasRenderer |
| **updateScalingAndBounds** | `scale.width/height` 为 0 时用 `getSystemInfoSync` 的 **逻辑窗口** 宽高补全，再算 scaleFactor |
| **alignCanvas** | wx 下强制 `margin` 全 0 并 return（避免 height=0 时居中算出 ~445px top margin） |

### QC 核心（`sanitizeQcCoreForWx` → `qc-core-min.js`）

| 补丁 | 说明 |
|------|------|
| Node/Input game 回退 | `D.qc_game` 当 phaser.game._qc 缺失 |
| updateGameLayout | phaser.isBooted + world 就绪才调 `_adjustToFullScreen`（**wx 也要调**） |
| container getter | `getWxParent` / `__wxCanvasParent` |
| displayChanged / RAF catch | 避免 null._qc 刷屏 |
| **fullScreen / _adjustToFullScreen** | wx：`getSystemInfoSync`→`setGameSize`→`updateScale()`；`__wxAdjusting` 防递归；**勿 noop** |
| back/frontDomRoot | wx 仍创建 Dom overlay + `wxDomAppend` |
| assetsPackage 分支 | `!D.__wx && keys.length` 才走 data.js |
| _parseAtlas | 见下文「QC 图集」 |
| languagesMgr.getLang | GameGlobal 安全包装 |
| Phaser.Text lineWidth | strict 下补 `var lineWidth` |
| **_toWorld（全部副本）** | wx 用 `scale.offset`+`input.scale`；`!scale.width` 时 margin=0；scale 无效时用 `ph.width/height` 与窗口尺寸回退 |
| **Touch generator** | wx 默认 `document`（与 touch bridge 一致） |
| **BaseInput generator** | wx 默认 `document` |
| **gainFocus** | wx 早退，避免 `document.focus` 崩溃 |
| **Touch enable** | `!device.touch && !D.__wx` 才 disable |
| **processTouchStart/Move** | `clientX/clientY` 缺省时用 `x/y` |

### qc-loading（`sanitizeQcLoadingForWx`）

| 补丁 | 说明 |
|------|------|
| loadGame | 保持 `width/height: '100%'`，**勿**注入 canvas/window 像素（ScaleAdapter 负责布局） |
| init | 恢复调用 `fullScreen()`（wx 走 qc-core 的 wx 分支） |
| create | **勿**额外调 `fullScreen()`（曾导致重复 scale） |

### PlaySmart 脚本（`sanitizeGameScriptsForWx`）

| 补丁 | 说明 |
|------|------|
| babel helper 去重 | `_typeof` 等合并冲突 |
| httpLoadAsset | XHR → readFile；音效多路径回退（见「音频」） |
| onGestureClicked | 绑 `GameGlobal.canvas`（音频 unlock 用） |
| initAudioManager | `bm_bgm0.mp3` → `bm_bgm.mp3` |
| decodeAudioData | 勿对非 Promise 返回值 `.catch()` |
| gameReady → gameStart | wx 无广告 SDK 自动启动 |
| ps/qc_game 导出 | 挂 GameGlobal / window |

### 其他脚本

| 文件 | 补丁 |
|------|------|
| `pl-adapter.js` | 去 `with`；跳过 style-loader；`location.search\|\|""` |
| `resource-loader.js` | 字体加载 stub |
| `webfontloader.js` | 空实现 |
| `languagesMgr.js` | search 安全；cache.checkJSONKey |
| `data.js`（bundle stub） | `assetsPackage=null`；**勿**重复定义 `assetsBase64()` |

### Bundle 兜底（`patchBundle` → `main.js`）

- `hasBase64()` → `false`
- bundle 尾 `__wxQiciBoot` + 导出 Phaser/qc/ps 到 GameGlobal
- 重复应用：jsonLoadComplete、atlas _parseAtlas、scrollTop、addColorStop、canvas 传入、强制 Canvas 渲染、BGM 路径、decodeAudioData 守卫、**_toWorld**、**gainFocus**

### 资源同步（`copy-wx-phaser2-libs.mjs`）

| 项 | 行为 |
|----|------|
| `resource/` | decompiled output 复制 + `fix-phaser2-bin.mjs` |
| `assets/` | `public/assets/` → `{wx}/assets/` |
| `gameConfig.json` | `gameConfig_json.json` → `resource/config/` |
| 音效 | `assets/audio_{hash}_mp3.mp3` → `resource/game/audio/audio_{hash}.mp3.bin` |
| 字体 | wx 跳过 font 写出 |
| 工程 | `disableUseStrict: true` |

---

## 输入专章（QICI + Phaser 2.3.0 触控）

PlaySmart 用 **QICI Input + QC Touch**，不是 Phaser 3 的 `PointerManager`。微信上要同时解决：**事件接到哪**、**坐标怎么换算**、**layout 与 scale 是否一致**。

### H5 与微信差异

| | H5 浏览器 | 微信小游戏 |
|---|-----------|------------|
| 触摸派发 | 真 DOM，`canvas` 上监听 | `weapp-adapter` 派发到 **`document`** |
| QC Touch 默认 `generator` | `canvas.parentNode`（gameDiv） | 与 document **不在同一监听树**，默认收不到 |
| 坐标 | `getBoundingClientRect()` + `scaleFactor` | canvas 无 `clientWidth` → **`scale.width` 常为 0** |
| focus | `document.focus()` 正常 | 无此 API；`gainFocus()` 抛错会 **中断整次 touch 处理** |

### 完整事件链

```
手指/鼠标
  → wx 系统
  → weapp-adapter
  → document.touchstart/move/end
  → [运行时] normalizeTouchEvent（x/y → clientX/clientY）
  → [运行时] touch bridge（document → gameDiv/canvas dispatchEvent）
  → QC Touch.processTouchStart
  → gainFocus（wx 跳过）
  → _toWorld（屏幕坐标 → 游戏世界坐标）
  → _fetchNodeInParent / 命中 DraggableItem 等
  → VPHand: DOWN / CLICK / UP（引擎内部调试日志）
```

启动期应对日志：

```
[phaser2] touch normalize: x/y → clientX/clientY
[phaser2] touch bridge: document → canvas
[phaser2] input ready, touch: true
```

### 三层补丁分工

| 层 | 文件 | 职责 |
|----|------|------|
| **运行时** | `src/phaser2/wx/phaser-wx-patch.js` → `{wx}/js/libs/phaser2-wx-patch.js` | bridge、normalize、refreshWxInput、touch dbg、devtools mouse→touch |
| **Phaser** | `patchPhaser2ForWx` → `phaser.min.js` | `device.touch=true`；touchmove 不 preventDefault；`getOffset→(0,0)`；scrollTop noop；**updateScalingAndBounds** 补窗口宽高；**alignCanvas** margin=0 |
| **QC 核心** | `sanitizeQcCoreForWx` → `main.js` | **两份 `_toWorld` 全替换**；generator→document；gainFocus 跳过；Touch 强制 enable；clientX 缺省用 x/y |

改 sanitize / patch 后：`npm run build:wx:phaser2` + 微信 **清缓存 → 重新编译**。

### 运行时详解（`phaser-wx-patch.js`）

| 函数 | 时机 | 作用 |
|------|------|------|
| `bootstrapWxTouchNormalize` | `bootstrapPlayableWx` | 补全 `clientX/clientY`（微信 touch 可能只有 x/y） |
| `bootstrapWxTouchBridge` | 同上 | document 监听 touch，**转发**到 `canvas.parentNode` / canvas |
| `bootstrapWxMouseBridge` | 同上 | **仅 devtools**：`wx.onMouseDown/Move/Up` 合成 touch |
| `bootstrapWxAudioUnlock` | bridge 内 | 首次触摸 resume WebAudio |
| `refreshWxInput` | boot 后、onAppShow | `device.touch=true`；`_generator=document`；重 enable touch/mouse |
| `bootstrapWxInputAfterGame` | Phaser isBooted 后 | 调 `refreshWxInput`；**一次** `_adjustToFullScreen(true)` 补 layout |
| `bootstrapWxLifecycle` | 同上 | onAppShow 再调 refresh，防切后台后输入失效 |

**勿**在 `refreshWxInput` 里每帧 `setGameSize` / `syncWxPhaserScale`（与 ScaleAdapter 打架，可栈溢出）。

### 构建层：qc-core 输入补丁

| 补丁 | 原因 |
|------|------|
| `_toWorld` wx 分支（**split/join 两处**） | H5 用 `getBoundingClientRect`；wx 用 margin + input.scale；qc-core 压缩后有两份实现，只改一处会「有时能点有时不能」 |
| `generator → document`（BaseInput + Touch） | 与 touch bridge 一致，否则监听 gameDiv 收不到 document 事件 |
| `gainFocus` wx return | `document.focus` 不存在，抛错后 **processTouchStart 后续命中全跳过** |
| `!device.touch && !D.__wx` 才 disable Touch | wx 特征检测可能失败 |
| `clientX!=null?clientX:i.x` | normalize 前的兜底 |

### 构建层：phaser.min 与坐标相关的补丁

| 补丁 | 原因 |
|------|------|
| `updateScalingAndBounds`：width/height 为 0 时用 `getSystemInfoSync` **逻辑窗口** 补全 | 否则 `scaleFactor` 错、`input.scale` 错 |
| `alignCanvas`：wx 强制 `margin=0` 并 return | height=0 时 Phaser 会「居中 0 高 canvas」，算出 **margin.top≈445**，触控 Y 被拉到屏幕上方 |
| `getOffset → (0,0)` | 全屏 canvas，无 DOM 偏移 |

### 坐标换算（`_toWorld`）

正常路径（与 Phaser Pointer 一致）：

```
px = clientX - margin.left
py = clientY - margin.top
worldX = (px - offset.x) * input.scale.x
worldY = (py - offset.y) * input.scale.y
```

scale 无效时的回退（`!scale.width || !input.scale` 有限）：

```
worldX = px * ph.width / cdw
worldY = py * ph.height / cdh
cdw = scale.width || windowWidth
cdh = scale.height || windowHeight
```

**典型坏例（PlaySmart 实测）：**

- `raw y ≈ 510`，`world y ≈ 65`，`sw: 0`
- 链：`scale.width=0` → alignCanvas 误算 margin.top → _toWorld 减 margin → 点在棋盘、命中空气
- 修：alignCanvas margin=0 + updateScalingAndBounds 补宽高 → dbg 里 `sw/sh≈400/889`，`world.y≈raw y`

### 输入 vs 布局（勿混为一谈）

| 维度 | 管什么 | 关键 API |
|------|--------|----------|
| **布局** | UI 节点位置、ScaleAdapter 宽适配 | `_adjustToFullScreen`、`setGameSize`、`updateScale` |
| **输入** | 手指像素 → 游戏世界坐标 | `margin`、`input.scale`、`_toWorld` |

layout 错了坐标也会偏；但 **仅改 layout 不能替代 touch bridge / _toWorld**。反之 noop fullScreen 会导致只有背景，与输入无关但常同时出现。

### 自检：`touch dbg`（前 3 次 touchstart）

```
[phaser2] touch dbg #1 raw … win … world {x,y} scale { inp, sf, sw, sh, margin, gw, gh }
```

| 字段 | 正常 | 异常 |
|------|------|------|
| `sw` / `sh` | ≈ windowWidth/Height | `0` → scale 未补 |
| `margin.top` | `0` | 很大 → alignCanvas 未修 |
| `world.y` vs `raw y` | 接近（宽适配 letterbox 除外） | 差数百 → 坐标链断 |
| 无 dbg | 事件未到 patch | 查 bridge / 启动顺序 |
| 有 **VPHand: DOWN/CLICK/UP** 但无交互 | 坐标或业务脚本 | world 是否在节点 AABB 内 |

### 按现象改哪

| 现象 | 优先查 |
|------|--------|
| 完全点不动、无 touch dbg | `phaser-wx-patch.js` bridge；`bootstrapPlayableWx` 是否在 main.js 之后 |
| 有 dbg，world 离谱 | `phaser.min.js` scaleBounds + alignCanvas；`main.js` 两份 `_toWorld` |
| 切后台回来不能点 | `refreshWxInput` / `onAppShow` |
| PC 模拟器只有鼠标 | `bootstrapWxMouseBridge`（platform===devtools） |
| 能点但拖不动 | 除坐标外查 DraggableItem 配置、Touch move 是否被 preventDefault |

---

## 掉帧 / 高频事件专章

**排查顺序：** 控制台 log 是否刷屏 → 是否重复 dispatch → 是否有全图/像素级重计算 → 再考虑 renderer / 资源体积。

来源：Merge Studio 擦除玩法（肥皂/刮胡刀）微信掉帧优化（2026-06）。

### 典型热路径（PlaySmart 2.3）

| 组件 | 触发频率 | 必须每帧？ | 说明 |
|------|----------|------------|------|
| `ps.VPHand` | 每次 touch DOWN/MOVE/UP | 否（仅 dispatch） | 原版 `dispatchEvent` 内 `console.log("VPHand: ",…)` → 微信极慢 |
| `EraseComponent.eraseController` | 每次 `onPointerMove` | **是** | `mlEliArr.forEach(eraseImg)` 画擦除轨迹，节流会断线 |
| `EraseComponent.checkFilledPercentage` | 实时判定模式下间隔调用 | **否** | 内调 `updateBMD()` → `getFilledPercentage()` 遍历 bitmap 像素 |
| `EraseComponent` 阶段事件 | 每次 check 可能 dispatch | 应防抖 | `eraseReachStep` / `eraseUnReachStep`；原版阶段未变也重复 dispatch |
| touch bridge | 每次 touchmove | 部分 | QC `generator=document` 已收 adapter 事件；**勿**再转发 canvas（双倍输入） |
| `_toWorld` fallback | 每次 touchmove | 可缓存 | 避免每帧 `getSystemInfoSync` → 用 `D.__wxSys`，onShow 清缓存 |

### 擦除玩法链路（REAL_TIME_JUDGMENT）

```
onPointerMove
  → eraseController(point)          // 每帧：bitmap 擦除
  → 累计 deltaTime
  → 达 updateBMDRefrshInterval 才 checkFilledPercentage()
       → integrationArea.updateBMD() // 像素扫描
       → findLeftRightValues(step, filled%)
       → dispatch eraseReachStep / eraseUnReachStep
```

H5 默认 `updateBMDRefrshInterval=100`。微信 build 可改为 **280ms**（仅 wx）。**勿**对 `eraseController` 做同样节流。

### 已落地补丁（`sanitizeGameScriptsForWx`）

| 补丁 | 代码位置 / 搜 |
|------|----------------|
| VPHand log 去除 | `console.log("VPHand: ",t," uuid: ",this.gameObject.uuid)` → `void 0` |
| 擦除 debug log 去除 | `["开始擦除"]` / `["抬手"]` / `["到达某一阶段"]` / `["未到达某一阶段"]` 的 `console.log.apply` → `void 0` |
| 判定间隔（wx） | `updateBMDRefrshInterval=(typeof wx!=="undefined"\|\|window.__wx)?280:100` |
| 阶段事件防抖 | `checkFilledPercentage` 增 `_eraseStepCache`：仅 `reach`/`unreach` **变化**才 dispatch |

### 已落地补丁（`phaser-wx-patch.js` + build）

| 补丁 | 说明 |
|------|------|
| touchmove 不转发 canvas | bridge 内 `if (type === 'touchmove') return`（normalize 后 return） |
| `_toWorld` 缓存 | `D.__wxSys` 缓存窗口尺寸；`onShow` 时 `g.__wxSys = null` |
| renderer | wx 用 `Phaser.AUTO`（WebGL + Canvas 回退），勿强绑 CANVAS |
| `enableDebug: false` | 模板 `game.js` `wx.setEnableDebug` |

改后：`npm run build:wx:phaser2` → 清缓存 → 重新编译。

### 按现象改哪

| 现象 | 优先查 |
|------|--------|
| 拖拽时控制台某字符串刷屏 | 对应 Behaviour 的 `console.log` → sanitize 去掉 |
| 拖肥皂/刮胡刀卡、无 log | `checkFilledPercentage` / `updateBMD` 频率；是否 touch 双倍转发 |
| 阶段推进变慢 | `updateBMDRefrshInterval` 过大 → 酌情调低（180–250ms） |
| 轨迹断线 | 误节流了 `eraseController` → 恢复每帧调用 |

### 自检（main.js）

```bash
node -e "const c=require('fs').readFileSync(require('fs').readFileSync('.wx-project','utf8').trim()+'/js/main.js','utf8'); console.log('vphand-log',c.includes('VPHand: ')); console.log('erase-cache',c.includes('_eraseStepCache')); console.log('bmd-interval',c.includes('updateBMDRefrshInterval=(typeof wx')); console.log('stage-log',c.includes('到达某一阶段'));"
```

期望：`vphand-log` / `stage-log` 为 **false**；`erase-cache` / `bmd-interval` 为 **true**。

---

## 布局 / 全屏（ScaleAdapter + QICI）

PlaySmart 用 `qc.ScaleAdapter` 宽适配（参考 750×1334），Phaser `game` 尺寸由 `_adjustToFullScreen` 设为窗口逻辑像素。

**禁止（PlaySmart 实测踩坑）：**

| 做法 | 后果 |
|------|------|
| `_adjustToFullScreen` noop | 只有背景，UI 不 layout |
| `loadGame` 注入 canvas.width 像素 | PC 偏移、与 ScaleAdapter 打架 |
| refresh 里 `setGameSize` 每帧 | 画面抖动 / 递归 scale |
| `_adjustToFullScreen` 内 `updateScale(true)` 无 `__wxAdjusting` | `Maximum call stack exceeded` |

**正确 wx fullScreen 流程：**

1. `getSystemInfoSync` → `windowWidth/windowHeight`
2. `setGameSize(w,h)` + `container.style` 宽高
3. `updateScale()`（非 force）
4. `__wxAdjusting` 包裹，防 relayout 重入

---

## 试玩 CTA / 结束

H5：`ps.install()` → `window.install({ type })` → pl-adapter 日志 `PLAYABLE:install`。

微信试玩结束 API（仅试玩广告场景存在）：

```javascript
wx.notifyMiniProgramPlayableStatus({ isEnd: true })
```

实现：`bootstrapWxPlayableInstall()` 在 `bootstrapPlayableWx()` 内包装 `window.install`，API 存在才调；日志 `[phaser2] notifyMiniProgramPlayableStatus isEnd:true`。

`install：undefined` 为 DEBUG 下未传 `InstallType` 的类型名，可忽略。

---

## Phaser Loader（readFile）

本地 `resource/...` 路径：

- 非 `http(s)` → `readFile`；`text`/`json` 用 `encoding: 'utf8'`
- 扩展名大小写各试一次（`__wxPaths` 数组）

### jsonLoadComplete（wx）— 关键

```javascript
// 错误：
var i = window.__wx && typeof wx.getSharedCanvas != "function" ? e : JSON.parse(e.responseText);

// 正确：
var i = typeof e === "string" ? JSON.parse(e) : JSON.parse(e.responseText);
```

`csvLoadComplete` / `xmlLoadComplete` 同理。

---

## QC 图集（`_parseAtlas`）

**错误逻辑：** `t.indexOf("/") < 0` 判断 base64 — base64 字母表含 `/`，PNG/JPEG 长串必失败。

**正确逻辑（优先级）：**

1. `t.search("data") === 0` → 直接用
2. `iVBORw0KGgo` / `/9j/` 开头，或长串且**不是** `resource/`、`.png` 路径、`image_*_png` 短 key → `data:image/png;base64,` + t
3. 仅 `resource/...`、`.png`/`.jpg`、短 `image_*_png` key → `readFile` → base64 → Image.src
4. 否则 H5 默认：`data:image/png;base64,` + t

---

## 音频

PlaySmart `SoundEngine` 根路径为 `resource/`，加载 `game/audio/audio_{hash}.mp3` 时实际读磁盘：

```
resource/game/audio/audio_{hash}.mp3.bin
```

extract 产出音效在 `assets/audio_{hash}_mp3.mp3`，**build 必须同步**：

```
assets/audio_82d40170_mp3.mp3  →  resource/game/audio/audio_82d40170.mp3.bin
assets/bm_bgm_mp3.mp3          →  resource/game/audio/bm_bgm.mp3.bin
```

实现：`syncPhaser2WxAudio()` in `copy-wx-phaser2-libs.mjs`（build 日志 `[phaser2] audio → ... (N files)`）。

`httpLoadAsset` wx 分支回退路径（sanitize 已写入 game-scripts）：

1. 原 path / path + `.bin`
2. `resource/game/audio/audio_{hash}.mp3.bin`
3. `assets/audio_{hash}_mp3.mp3`
4. BGM：`resource/game/audio/bm_bgm.mp3.bin`、`assets/bm_bgm_mp3.mp3`

运行时（`phaser-wx-patch.js`）：

- `bootstrapWxWebAudio`：`wx.createWebAudioContext` 或 stub
- `decodeAudioData` 包装：兼容同步返回
- `bootstrapWxAudioUnlock`：首次触摸 resume AudioContext
- `bootstrapWxCanvasGradient`：渐变 Color → rgb 字符串

---

## 运行时 DOM / 输入桩（`phaser-wx-patch.js`）

| 能力 | 说明 |
|------|------|
| `CustomEvent` | pl-adapter / 事件总线 |
| `scrollTo` noop | 配合 Phaser scrollTop |
| `createElement` / appendChild / getElementById | 容错桩 |
| `bootstrapGameDiv` | 注册 gameDiv + proxy 事件到 document |
| `wxDomAppend` / linkCanvasParent | canvas 父链 |
| `bootstrapWxTouchNormalize` | x/y → clientX/clientY（见 **§ 输入专章**） |
| `bootstrapWxTouchBridge` | document → canvas/gameDiv |
| `bootstrapWxMouseBridge` | devtools 鼠标 → 合成 touch |
| `refreshWxInput` / `bootstrapWxInputAfterGame` | boot / onShow 恢复 generator=document |
| `bootstrapWxLifecycle` | onAppShow 恢复 audio/input |
| `syncPlayableGlobals` | require 隔离后同步 ps/qc_game |
| `bootstrapWxAutoGameStart` | 轮询 auto gameStart |
| `bootstrapWxPlayableInstall` | CTA → `notifyMiniProgramPlayableStatus` |

---

## 资源与 data.js

| 项 | 微信构建行为 |
|----|-------------|
| `data.js` | stub：`assetsPackage=null`，`hasBase64()→false` |
| 加载源 | `resource/` 磁盘（decompiled `resource/` 或 extract 产出） |
| `gameConfig.json` | 从 `gameConfig_json.json` 复制到 `resource/config/` |
| `.bin` | JSON 数组 `["meta",{prefab}]`；build 跑 `fix-phaser2-bin.mjs` |
| 音频 `.mp3.bin` | 原始 MP3 二进制，走 `isSound` / `httpLoadAsset`，**不是** JSON 型 `.bin` |

---

## 启动链（正常日志）

```
[phaser2] WebAudio via wx.createWebAudioContext
[phaser2] touch normalize / touch bridge
[phaser2] qici.init()
Phaser v2.3.0 | Canvas | WebAudio
[phaser2] input ready, touch: true
[phaser2] audio → resource/game/audio (N files)   ← build 时
gameReady → gameStart → gameLaunch → mainStart
宽适配 onResize …
```

CTA 点击后期望：

```
[phaser2] notifyMiniProgramPlayableStatus isEnd:true
PLAYABLE:install
```

---

## 自检命令

```bash
# main.js 补丁存在
node -e "const c=require('fs').readFileSync(require('fs').readFileSync('.wx-project','utf8').trim()+'/js/main.js','utf8'); console.log('json-new',c.includes('typeof e===\"string\"?JSON.parse(e)')); console.log('toWorld-wx',c.includes('D.__wx')); console.log('alignCanvas-wx',c.includes('if(window.__wx){this.margin.left')); console.log('scaleBounds-wx',c.includes('windowWidth'));"

# phaser-wx-patch CTA + touch
node -e "const c=require('fs').readFileSync(require('fs').readFileSync('.wx-project','utf8').trim()+'/js/libs/phaser2-wx-patch.js','utf8'); console.log('install-hook',c.includes('notifyMiniProgramPlayableStatus')); console.log('touch-bridge',c.includes('touch bridge'));"

# 音效文件
node -e "const fs=require('fs'),p=require('fs').readFileSync('.wx-project','utf8').trim(); console.log(fs.readdirSync(p+'/resource/game/audio').filter(f=>f.endsWith('.mp3.bin')).length,'mp3.bin files');"
```

---

## 禁止事项（2.3）

- 手改 `{wx}/js/main.js`
- 在已完成 `output/wx/phaser2.3.0_*` 上续改下一局游戏
- 对 2.3 跑 `build:wx` / `extract`（3.x）
- `assetsPackage = {}`（用 `null`）
- 用 `indexOf("/")<0` 区分 base64 与文件路径
- `DATA_JS_STUB` 内重复 `function assetsBase64()`（与 game-scripts 冲突）
- **loadGame 注入 canvas 像素尺寸**（破坏 ScaleAdapter）
- **noop `_adjustToFullScreen` 或跳过 wx 的 updateGameLayout**
- **refreshWxInput 里每帧 setGameSize / syncWxPhaserScale**
- 只改一处 `_toWorld`（qc-core 有多副本）

---

*最后更新：2026-06-30（含 **输入专章**、**掉帧专章**：VPHand/EraseComponent 高频事件、节流与防抖补丁）*
