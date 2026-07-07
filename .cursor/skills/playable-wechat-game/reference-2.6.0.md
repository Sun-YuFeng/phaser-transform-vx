# Phaser 2.6.0 / AppLovin 微信兼容参考

AppLovin + Phaser 2.6.2 单文件 HTML 的 wx 适配要点。  
来源：Fashion IQ 等试玩迁移实践（2026-07）；对应 `extract:phaser26` → `build:wx:phaser26` → `js/main.js` 管线。

**迁移流程见** `.cursor/rules/playable-wx-2.6.0.mdc`  
**模板入口：** `phaser2.6.0/game.js`（adapter → phaser2-wx-patch → main.js → `window.onload`）

与 2.3.0 共用 `src/phaser2/wx/phaser-wx-patch.js`，但 2.6 走 **`__wxPhaser26DocumentTouch`** 与 `hookPhaser26LevelReady` 等专用分支，**勿混用 QC 的 qici / gameDiv 触控逻辑**。

---

## 补丁文件地图

| 现象域 | 改哪里 | 构建后落在 |
|--------|--------|------------|
| Phaser 引擎 / 触控坐标 / Loader | `patchPhaser26ForWx` in `scripts/phaser2-wx-sanitize.mjs` | `src/phaser26/lib/phaser.js` → `main.js` |
| 引擎 IIFE / GameGlobal | `applyPhaser26EngineShim` | `main.js` 内 phaser 段 |
| Boot / CTA / innerWidth | `applyWxBootPatches` in `build-phaser26-game-bundle.mjs` | `main.js` |
| 游戏脚本 wx 分支 | `applyPhaser26GameScriptsShim`、`17-state-patch.js` 等 | `src/phaser26/scripts/` → `main.js` |
| 触摸桥 / 输入重绑 / tap 兜底 | `src/phaser2/wx/phaser-wx-patch.js`（`phaser26` 函数） | `{wx}/js/libs/phaser2-wx-patch.js` |
| qici 启动 | — | **2.6 无 qici** |
| 资源 | `extract-phaser26-html.mjs` + `copy-wx-phaser26-libs.mjs` | `{wx}/playableAssets/` |

改 sanitize、patch 或 `src/phaser26` 后必须：`npm run build:wx:phaser26`，微信工具 **清缓存 → 重新编译**。

---

## 触摸链路（必读）

```
wx.onTouchStart
  → weapp-adapter（canvas.addEventListener 代理到 document）
  → document.dispatchEvent
  → Phaser.Input.Touch._onTouchStart     [__wxPhaser26TouchDoc：监听 document]
  → Pointer.move(pageX, pageY)
       └ wx: world = page × (game / inner)   [__wxPhaser26PointerV3]
  → game.input.onDown
       ├ Phaser hitTest（sprite.inputEnabled + hitArea）
       └ installPhaser26WxChoiceTap 手动 bounds 兜底
```

**诊断日志（`__phaser26Debug` 默认开）：**

| 日志 | 含义 |
|------|------|
| `doc-touch x y` | 微信原始触点 |
| `phaser-onDown world / raw` | Phaser 指针；`world` 应已缩放 |
| `wx-tap miss ptr … hair1-bounds` | 兜底未命中；对比 ptr 与 bounds |
| `post-orient game scale inp win` | 布局与 input.scale |

---

## 问题 → 修改速查

| 序号 | 报错 / 现象 | 根因 | 处理 |
|------|-------------|------|------|
| 1 | 黑屏 / 双 Phaser.Game | `window.onload` 与 boot 竞争 | `__wxPhaser26Boot`；`game.js` 延迟调 `window.onload`；bundle 内固定 canvas 父级 |
| 2 | `touchstart of undefined` | `canvas.dispatchEvent` 无 EventTarget | `game.js` `__wxPhaser26DocumentTouch=true`；touch bridge **doc-only** |
| 3 | 全局 onDown 有、sprite 不响应 | EXACT_FIT 下 page 1:1 进 world | **PointerV3**：`pageY * (game.height/innerHeight)` |
| 4 | `inp.scale` 为 1,1 | scale.width 已是 game 尺寸，未映射窗口 | **InpScale**：仅覆写 `input.scale`，**不改** scale.width/height |
| 5 | 画面放大 + 触控更乱 | ScaleV2 强制 `scale.width=window` | **禁止**；回退旧 `updateScalingAndBounds` 宽度逻辑 |
| 6 | `wx-tap miss` world y≈raw y | Pointer 补丁未打入 bundle | 构建后查 `__wxPhaser26PointerV3`；重 `build:wx:phaser26` |
| 7 | `phaser-onDown` #5/#6 双发 | touch + mouse 同时 | `hookPhaser26LevelReady` 禁用 `input.mouse` |
| 8 | 首屏能点、进关卡后不能点 | `touch.stop()` 后未重绑 | `refreshPhaser26Input({rebind:true})`；清空 `_onTouch*` 再 `start` |
| 9 | level 后布局错乱 | `hookPhaser26LevelReady` 叠 `refresh`+`handleOrientation` | 布局交给 `AppLovin.handleOrientation`（`afterCreate` 已调）；hook 只重绑输入 |
| 10 | `interactiveItems.total=0` | choice 未 `inputEnabled` | `12-choice.js` hitArea；`init` 里 `f_touch.inputEnabled` |
| 11 | 有交互但不进流程 | `curButton=0` | `17-state-patch.js` `initPlayable` 设 `curButton=1` |
| 12 | `request() is not implemented` | Loader xhr | `patchPhaser26ForWx` readFile + 扩展名大小写 |
| 13 | WebGL 报错 | 微信 canvas 上下文 | WebGL 实测 + Canvas fallback |
| 14 | `scrollTo is not a function` | ScaleManager.scrollTop | wx noop（与 2.3 同） |
| 15 | CTA 无效 | `window.open` | boot patch → `notifyMiniProgramPlayableStatus` |
| 16 | EXACT_FIT 朝向 | AppLovin 逻辑 | `Level_p`/`Level_l` init + `handleOrientation` wx 分支 EXACT_FIT |

---

## 模板：`game.js` 要点

```javascript
import './js/libs/weapp-adapter.js';
require('./js/libs/phaser2-wx-patch.js');
g.__wx = true;
g.__wxPhaser26DocumentTouch = true;  // 禁止 canvas.dispatchEvent 转发
require('./js/main.js');
g.bootstrapPlayableWx && g.bootstrapPlayableWx();
setTimeout(() => window.onload(), 150);  // AppLovin boot 在 main 内
```

---

## Phaser 补丁（`patchPhaser26ForWx` → `lib/phaser.js`）

| 标记 | 说明 |
|------|------|
| `__wxPhaser26Global` | IIFE 挂 `GameGlobal` / `__wxG` |
| `__wxPhaser26Xhr` | 本地路径 `readFile` |
| `__wxPhaser26Render` | 复用 `window.canvas`；style 空指针守卫 |
| `__wxPhaser26Touch` | `device.touch` 强制 true |
| `__wxPhaser26TouchDoc` | touch/mouse 监听 **document** |
| `__wxPhaser26PointerV3` | wx 下 `x=pageX*(game.width/innerWidth)`，`y` 同理 |
| `__wxPhaser26InpScale` | 仅修正 `input.scale`，不碰 scale 显示宽高 |
| `getOffset` wx | 返回 `(0,0)` |
| `alignCanvas` wx | margin 全 0 |
| WebGL 分支 | try/catch → CanvasRenderer |

**Scale 补丁治理：** `__wxPhaser26ScaleV2`（每帧把 `scale.width/height` 设为窗口）已废弃——会导致画面放大。新补丁须放在 **`!includes('__wxPhaser26Render')` 之外** 的独立块，避免 Render 已打标后 scale 补丁永不执行。

---

## 运行时垫片（`phaser-wx-patch.js` phaser26 API）

| 函数 | 时机 | 作用 |
|------|------|------|
| `bootstrapWxTouchBridge` | 启动 | document-only 触摸；`doc-touch` 日志 |
| `schedulePhaser26AfterBoot` | main 后 | 轮询 `isBooted`，`disableVisibilityChange` |
| `hookPhaser26LevelReady` | `afterCreate` 末 | 同步 innerWidth/Height；重绑 touch；禁 mouse；choice tap 兜底 |
| `refreshPhaser26Input` | level-ready | 清 touch handler → `stop`/`start` |
| `installPhaser26WxChoiceTap` | level-ready | `onDown` + `getBounds` 手动命中 `signalOnSelect` |
| `toPhaser26GameX/Y` | 兜底用 | `page * game / inner` |

`17-state-patch.js` 在 `afterCreate` 末尾：

```javascript
__wxRoot.hookPhaser26LevelReady && __wxRoot.hookPhaser26LevelReady(this);
```

---

## 构建自检

```bash
node -e "const c=require('fs').readFileSync('src/phaser26/lib/phaser.js','utf8');
console.log('PointerV3',c.includes('__wxPhaser26PointerV3'));
console.log('InpScale',c.includes('__wxPhaser26InpScale'));
console.log('TouchDoc',c.includes('__wxPhaser26TouchDoc'));
console.log('ScaleV2(应 false)',c.includes('__wxPhaser26ScaleV2'));"
```

期望：`PointerV3` / `InpScale` / `TouchDoc` 均为 true；**无** `ScaleV2`。

触控正常时单次点击日志近似：

```
[phaser26] phaser-onDown world 256 937 raw 256 695
[phaser26] wx-tap choice 0 ptr 256 937
```

（`937 ≈ 695 × 1138/844`，随设备窗口变化。）

---

## 与 2.3.0 共用代码的注意点

| 共用 | 2.6 差异 |
|------|----------|
| `phaser2-wx-patch.js` | 2.6 用 `__wxPhaser26DocumentTouch`，勿走 canvas 转发 |
| `phaser2-wx-sanitize.mjs` | `patchPhaser26ForWx` ≠ `patchPhaser2ForWx`；改 2.6 只测 `build:wx:phaser26` |
| `main.js` 单文件 | 2.6 无 qc-core / resource/.bin |

---

## 掉帧 / 日志

- 正式交付可将 `__phaser26Debug = false`（`phaser-wx-patch.js`）减少 `doc-touch` / `phaser-onDown` 刷屏。
- `State.update` 每帧 `AppLovin.handleOrientation` 为原游戏行为；勿在此基础上再叠 `scale.refresh`。
