---
name: playable-wechat-game
description: PlayableMaker / Phaser 微信小游戏导入兼容排错。3.88.2 见 reference-3.88.2.md；2.6.0 AppLovin 见 reference-2.6.0.md；2.3.0 QC/MW 见 reference-2.3.0.md。按堆栈与现象查问题→API 对照，改 patch/runtime 层。迁移流程与命令见各版本 rule。Use when fixing wx load errors, canvas/DOM issues, bundle syntax, or runtime compatibility — not for choosing extract/build commands.
---

# 微信导入兼容排错

## 与本 skill 的分工

| 文档 | 职责 |
|------|------|
| `.cursor/rules/playable-project.mdc` | 工程结构、**版本路由**、finish:game |
| `.cursor/rules/playable-wx-3.90.0.mdc` 等 | **各版本迁移**流程、架构、构建命令 |
| **本 skill** | 导入后**兼容问题**排错（现象 → API → 改哪一层） |

**Agent 必须先按 `playable-project.mdc` 路由到正确版本 rule，再用本 skill 排错。**

## 更新治理（必读）

- **禁止**擅自增删改本 skill 或 `.cursor/rules/` 下 rule 文件
- 某堆栈/报错已解决且解法可复用时：**先问用户**「是否写入 skill 或 reference？」，用户确认后再更新
- 一次性、游戏特有的 hack **不要**写入 skill

## 兼容核心：按「问题 + 关键 API」

压缩变量名无所谓，记问题与 API：

| 问题 | 关键 wx/Phaser API | 补丁层 |
|------|-------------------|--------|
| 包内资源 XHR 失败 | `getFileSystemManager().readFile` | phaser-wx-patch |
| Loader 卡死 | `loader.nextFile` | phaser-wx-patch |
| Canvas / DOM | `window.canvas`、`WEBGL` | phaser-wx-patch + runtime `startGame` |
| mp4 | 跳过 `load.video`；`Video.load/play` emit COMPLETE | runtime + phaser-wx-patch |
| 字体 | readFile + base64 `FontFace` | runtime `loadFont` |
| matchMedia | wx early return | runtime `updatePixelRatioEvent` |
| CTA | `notifyMiniProgramPlayableStatus`（需存在才调） | runtime `openUrl`；**2.3** `window.install` 包装 |
| document.title 只读 | wx 下跳过赋值 | runtime `initGame` |
| 扩展名大小写 | 复制资源时扩展名小写 | copy-wx-assets |
| 预览/上传 `Unexpected token ?` | `build.target: es2015` + terser `ecma: 5` | vite/config.wx.mjs |
| `wxPerf.now is not a function` | weapp-adapter `getPerformance` fallback | 模板 `js/libs/weapp-adapter.js` |
| 画面拉伸 / `w:undefined`（3.90） | `wxSetupCanvas` + `getSystemInfoSync` | weapp-adapter + game.js + runtime |
| DOMParser / 位图字体（3.88） | `dom-parser.js` 垫片 | 模板 game.js 引入 |
| `elementFromPoint`（3.88） | 全屏单 canvas 直接返回 `window.canvas` | weapp-adapter |
| 真机只有 Play 能点 / 拖不动 | `downElement`、`setCanvasOver`、`POINTER_DOWN` | apply-phaser-wx-patches + extract + weapp-adapter |
| bundle 内嵌 base64 与 assets 重复 | `externalize-wx-assets.mjs` → `assets/` | extract-webpack-main |
| 3.88 专表（交互、外置、logo 等） | 见 [reference-3.88.2.md](reference-3.88.2.md) | runtime + extract + 模板 |
| **2.6** 能渲染点不动 / `wx-tap miss` | EXACT_FIT 下 page≠world；`inp.scale` 1,1 | PointerV3 + InpScale；**勿** ScaleV2 改 scale 宽高 | `patchPhaser26ForWx` + phaser-wx-patch |
| **2.6** `touchstart of undefined` | `canvas.dispatchEvent` | `__wxPhaser26DocumentTouch` + TouchDoc 监听 document | `phaser2.6.0/game.js` + sanitize |
| **2.6** 画面放大 | ScaleV2 强制 scale.width=window | 回退；仅 InpScale 修正 input.scale | `phaser2-wx-sanitize.mjs` |
| **2.6** `phaser-onDown` 双发 | touch + mouse | level-ready 禁 `input.mouse` | `hookPhaser26LevelReady` |
| **2.6** 进关卡后触控失效 | touch.stop 未重绑 | `refreshPhaser26Input({rebind:true})` | phaser-wx-patch |
| **2.6** 黑屏 / 双 boot | `window.onload` 竞争 | `__wxPhaser26Boot` + 延迟 onload | `build-phaser26-game-bundle.mjs` + game.js |
| **2.6** Loader 本地资源 | xhr | readFile + 扩展名大小写 | `patchPhaser26ForWx` |
| **2.3** `qici.init` 不跑 / 卡 loading | `game.js` `bootQici()` | 模板 `phaser2.3.0/game.js` |
| **2.3** `json[gameConfig]: Unexpected token u` | `jsonLoadComplete`：`typeof e==="string"` | `patchPhaser2ForWx` → phaser.min |
| **2.3** atlas `iVBORw0KGgo` readFile 失败 | base64 含 `/`；`iVBORw0KGgo` → data URL | `sanitizeQcCoreForWx` `_parseAtlas` |
| **2.3** `Parse fail` + `.bin` | `fix-phaser2-bin.mjs` 内嵌 JSON | `resource/` + build 自动 |
| **2.3** 黑屏无 gameLaunch | `waitGameStart` + wx `gameStart` | game.js + game-scripts sanitize |
| **2.3** `substr` @ pl-adapter | `location.search` 为 undefined | weapp-adapter + pl-adapter sanitize |
| **2.3** `scrollTo is not a function` | ScaleManager.scrollTop 每帧调用 | phaser-wx-patch noop + phaser.min patch |
| **2.3** `AudioContext is not a constructor` | `bootstrapWxWebAudio` 未执行 | phaser-wx-patch；`game.js` `bootstrapPlayableWx` |
| **2.3** `load audio failed` / `.mp3.bin not found` | 音效在 `assets/`，引擎读 `resource/game/audio/` | `syncPhaser2WxAudio` + `httpLoadAsset` 回退 |
| **2.3** `e.catch is not a function` @ decodeAudioData | 微信同步返回非 Promise | sanitize + patchBundle 守卫 |
| **2.3** BGM 路径 `bm_bgm0.mp3` | 工程无该文件 | 改为 `game/audio/bm_bgm.mp3` |
| **2.3** `addColorStop` invalid params | Color 对象传给 canvas | `bootstrapWxCanvasGradient` + patchBundle |
| **2.3** webGL 误报 / 黑屏 | 未绑 canvas / 创建失败 | 实测 webgl + Canvas fallback；qc-loading 传 canvas |
| **2.3** `module main.js not defined` | bundle 语法 / data.js 重复 stub | 查 webGlCreateWx 括号；DATA_JS_STUB 勿重复 assetsBase64 |
| **2.3** 真机点不动 / world.y 偏移 | `scale.width=0` → 错误 margin；`_toWorld` 未全量替换 | 见 [reference-2.3.0.md § 输入专章](reference-2.3.0.md) | phaser2-wx-sanitize + phaser-wx-patch |
| **2.3** 有 VPHand 日志但拖拽无效 | 坐标 world 与 raw 偏差大 | 查 `touch dbg` 的 sw/margin/world | 同上 |
| **2.3** `Maximum call stack` @ updateScale | `_adjustToFullScreen` 调 `updateScale` 与 relayout 互递归 | `__wxAdjusting` 防重入；勿 noop 全屏；`loadGame` 保持 `100%` | sanitizeQcCoreForWx fullScreen |
| **2.3** 真机只有背景 | `_adjustToFullScreen` 被 noop / 未 setGameSize | wx fullScreen 用 `getSystemInfoSync` + `setGameSize` + `updateScale()` | sanitize + phaser-wx-patch 启动后补 layout |
| **2.3** CTA / `PLAYABLE:install` 无试玩结束 | H5 `window.install` 无 wx API | `bootstrapWxPlayableInstall` → `notifyMiniProgramPlayableStatus({ isEnd: true })` | phaser-wx-patch |
| **2.3** 拖拽/擦除掉帧 | 热路径高频 `console.log` / 重复 dispatch / 像素扫描 | 见 [reference-2.3.0.md § 掉帧专章](reference-2.3.0.md) | sanitizeGameScriptsForWx + phaser-wx-patch |
| 2.3 专表（**输入/触控**、布局、CTA、**掉帧**） | 见 [reference-2.3.0.md](reference-2.3.0.md) | phaser2-wx-sanitize + phaser-wx-patch + copy-wx-phaser2-libs |
| **2.6** 专表（**触控坐标**、EXACT_FIT、boot、Loader） | 见 [reference-2.6.0.md](reference-2.6.0.md) | phaser2-wx-sanitize + phaser-wx-patch + build:wx:phaser26 |

2.3 输入排错优先读 reference **§ 输入专章**；**拖拽/擦除卡顿**读 **§ 掉帧专章**。  
2.6 触控排错优先读 [reference-2.6.0.md](reference-2.6.0.md) **§ 触摸链路** 与 **§ 问题速查**。

## 掉帧 / 高频事件（通用排查）

**优先假设：某 Behaviour 在 `touchmove` / `frameLoop` / `onUpdate` 里反复触发事件或重计算**，而不是先动渲染或资源。

| 步骤 | 做什么 |
|------|--------|
| 1 | 开发者工具控制台：拖拽/滑动时是否某条 log **刷屏**（如 `VPHand:`、`到达某一阶段`） |
| 2 | 区分 **必须每帧** vs **可节流**：轨迹绘制、跟手位移 → 每帧；阶段判定、覆盖率扫描、Hit 检测 → 可节流/防抖 |
| 3 | 查 **重复派发**：同一 touch 被 bridge 转发两次；状态未变仍 `dispatch` |
| 4 | 查 **微信特有开销**：`console.log`、`getSystemInfoSync`、全图 `getImageData`/像素遍历 |

| 手段 | 适用 |
|------|------|
| 去掉热路径 debug log | 输入/擦除/拖拽脚本（`sanitizeGameScriptsForWx` 等） |
| 事件防抖（状态变了才 dispatch） | 阶段判定、Hit/Away 切换 |
| 加长判定间隔 | 像素扫描、覆盖率（如 `updateBMDRefrshInterval`） |
| 减少 touch 重复转发 | `phaser-wx-patch` touch bridge |
| 缓存 sync API | `_toWorld` 内 `getSystemInfoSync` → `D.__wxSys` |

版本专表：2.3 擦除/VPHand 见 [reference-2.3.0.md § 掉帧专章](reference-2.3.0.md)。

Runtime 搜稳定**方法名**：`openUrl(`、`loadAssets(`、`startGame(`、`loadFont(`（3.x）；2.3 另搜 `bootQici`、`gameStart`、`qici.init`。

## bundle 语法兼容（Phaser 3 管线）

PlayableMaker runtime 含 `??` / `?.`（ES2020），微信引擎不支持。`vite/config.wx.mjs` 必须：

- `build.target: 'es2015'`
- `esbuild.supported` 关闭 `nullish-coalescing`、`optional-chain`
- `minify: 'terser'`，`terserOptions.format.ecma: 5`

**勿**设 `minify: false` 且不配 target。

`build:wx` 后自检：

```bash
node -e "const c=require('fs').readFileSync(require('fs').readFileSync('.wx-project','utf8').trim()+'/js/playable/bundle.js','utf8'); console.log('??', (c.match(/\?\?/g)||[]).length);"
```

输出 `?? 0` 即可。

## extract 后快速验证（3.x PlayableMaker）

```bash
node -e "const c=require('fs').readFileSync('src/playable/runtime.js','utf8');
['notifyMiniProgramPlayableStatus','getFileSystemManager','window.canvas','typeof wx'].forEach(k=>console.log(k,c.includes(k)));"
```

## 禁止事项（兼容层）

- 不 assign `GameGlobal.canvas`
- 微信入口用 `require` + CJS，不手动改 `bundle.js`
- **`vite/config.wx.mjs` 必须 `publicDir: false`** — 资源只放 `{wx}/assets/`

## 详细参考

- 通用问题→API：[reference.md](reference.md)
- **Phaser 3.88.2 内嵌 bundle**：[reference-3.88.2.md](reference-3.88.2.md)
- **Phaser 2.6.0 AppLovin + main.js bundle**：[reference-2.6.0.md](reference-2.6.0.md)
- **Phaser 2.3.0 QC/MW + main.js bundle**：[reference-2.3.0.md](reference-2.3.0.md)
