# Phaser3.9.0，换衣服的试玩



# PlayableMaker 网页试玩 → 微信小游戏：改造总结

你这次是把 PlayableMaker 导出的网页 playable（`new/js/main.js`）迁到 微信小游戏。副本项目（`wx1bea7d16b6a4c0bd-playable - 副本`）是已跑通的参照。下面按问题 → 原因 → 改法整理，以后同类项目可照着做。

------

## 一、项目结构（两边一致）

game.js              → import weapp-adapter → import main.js

game.json

js/main.js           → 7MB+ 打包产物（内联 base64 资源 + Phaser + 平台逻辑）

js/libs/weapp-adapter.js

js/libs/base64.js

核心逻辑在 `main.js` 末尾：加载资源 → `initGame()` → Phaser 启动 → 场景运行。

------

## 二、改造总流程（建议顺序）

| 步骤 | 做什么                                              | 为何                          |
| ---- | --------------------------------------------------- | ----------------------------- |
| 1    | 去掉 `addEventListener("load")`                     | 小游戏没有网页 load           |
| 2    | Phaser `getParent` 注释 DOM 操作                    | 无 `document.documentElement` |
| 3    | `startGame` 改用 `canvas` + `WEBGL`                 | 用 `wx.createCanvas()`        |
| 4    | 注释 `document.title` 等网页 API                    | 只读/不存在                   |
| 5    | Video `loadHandler` 加方法判断                      | 伪 DOM 无 `removeAttribute`   |
| 6    | 注释内联 mp4（可选 mp3）                            | 微信不支持 inline 视频        |
| 7    | 注释 `matchMedia`                                   | 小游戏无此 API                |
| 8    | Video `play()` 直接 `emit VIDEO_COMPLETE`           | 不播视频也要走完流程          |
| 9    | `openUrl` 换成 `wx.notifyMiniProgramPlayableStatus` | 无 `window.open`              |

原则： 网页 API 在小游戏里要么删掉，要么用 `wx.*` / `canvas` 替代；对照副本搜相同函数名最省事。

------

## 三、逐项说明

### 1. 卡在 `Created with PlayableMaker.com`

现象： 只打印品牌 log，后面不动。

原因： 初始化包在 `addEventListener("load", ...)` 里，微信里 `load` 常不触发。

改法（搜 `Created with PlayableMaker.com`）：

// 错误：等 load

addEventListener("load", () => {

  gi(te).then(...).catch(...);

});

// 正确：直接执行

gi(te)

  .then((R) => {

​    Et.getInstance().setInlineAssets(te);

​    Et.getInstance().setGameDef(R);

​    Et.getInstance().initGame();

  })

  .catch((R) => {

​    console.log(R);

​    console.error("Cannot set def-template.");

  });

括号： 若前面有 `(Tt == x.FB ? ... : Zt(441)),` 这种逗号表达式，结尾要 `}));`（两个 `)`）。

------

### 2. `Cannot set property 'height' of undefined`（getParent）

原因： Phaser Scale 里操作 `document.documentElement.style.height`，微信没有完整 DOM。

改法（搜 `getParent: function`）： 像副本一样整段注释，只留空函数或 log。

------

### 3. `startGame` / Phaser 启动

改法（搜 `Run game: w:` 或 `startGame`）：

// 网页

type: Phaser.AUTO,

parent: this.parentElement,

// 微信（canvas 来自 weapp-adapter）

type: Phaser.WEBGL,

canvas: canvas,

parent: canvas,

------

### 4. `document.title` / `Expression expected`

原因： `document.title` 只读；只注释逗号表达式后半段会语法错误。

改法（搜 `initGame` + `document.title`）：

this.platform.setStoreUris(...);

// 不要：k?.name && (document.title = k.name)

// 不要留下 (setStoreUris(...),  // 注释的第二项) 这种悬空逗号

------

### 5. `removeAttribute is not a function`（Video loadHandler）

改法（搜 `loadHandler: function`）：

// autoplay 分支

I.removeAttribute && I.removeAttribute("autoplay"),

// crossorigin：有值 set，无值才 remove

v

  ? I.setAttribute("crossorigin", v)

  : I.removeAttribute && I.removeAttribute("crossorigin"),

I.load && I.load(),

------

### 6. `No supported video format` / 不播视频

改法 A（推荐）： 文件最前 module 441 内联资源里，注释所有 mp4：

// "_3_big.mp4":

//   "data:video/mp4;base64,...",

改法 B（必做）： 搜 `play: function`，在函数开头：

play: function (u, l, v) {

  this.emit(r.VIDEO_COMPLETE, this);

  return;

  // 后面原逻辑保留不删

}

否则场景等 `videoEnded`，会卡在 `Video not loaded`。

------

### 7. `matchMedia is not defined`

改法（搜 `updatePixelRatioEvent`）： 函数体整段注释，留空函数；`create()` 里仍可调用。

------

### 8. `window.open is not a function`（CTA / 结束）

改法（搜 `openUrl()`，平台基类 class A）：

openUrl() {

  wx.notifyMiniProgramPlayableStatus({

​    isEnd: true,

  });

  // 原 mraid / window.open 整段注释

}

在试玩结束、点下载等节点调用；`isEnd: true` 会出试玩结束页。

------

## 四、易误导的日志（别被带偏）

| 控制台                      | 实际含义                                                     |
| --------------------------- | ------------------------------------------------------------ |
| `Cannot set def-template.`  | 多是 `initGame` / Phaser 抛错进了 `.catch`，不一定是模板坏了 |
| `mraid is not defined!!!!`  | 正常，可忽略                                                 |
| `Video not loaded`          | 没内联视频时的 warn；配合 `play()` 里 `VIDEO_COMPLETE` 可继续玩 |
| `No video in cache for key` | 注释 mp4 后常见，一般可忽略                                  |

------

## 五、配置与其它

- `project.private.config.json`：`"bigPackageSizeSupport": true`（主包约 7MB 需要）
- `game.js` 里 `audio/song.mp3`：两项目都可能没有 `audio/` 目录，不影响主流程，要音乐就补文件或注释播放代码
- 体积： 注释 mp3/mp4/超大 png 可减 `main.js`、加快 devtools 编译
- 副本里的 `xxxxxxxxxxxx` log：标的是已手改过的微信适配点，新包可逐项对照

------

## 六、以后新游戏的检查清单

□ 去掉 load / DOMContentLoaded 再 init

□ getParent 不操作 document

□ Phaser：WEBGL + canvas + parent: canvas

□ 不 assign document.title

□ Video：removeAttribute / load 前判断存在

□ 不内联 mp4；play() 直接 VIDEO_COMPLETE

□ 不用 matchMedia

□ openUrl → wx.notifyMiniProgramPlayableStatus({ isEnd: true })

□ 对照副本搜：openUrl、getParent、startGame、loadHandler、updatePixelRatioEvent、play: function

------

## 七、调试习惯

1. 看第一个 TypeError，不要先看 `.catch` 里的文案。
2. 报错带 `main.js:行号` → 在文件里跳转，对照副本同一函数。
3. 网页能跑、微信不能跑 → 优先怀疑：DOM / window / 视频 / 打开链接。
4. 改一处保存编译一次，避免一次改太多不好定位。

------

你这次从「打不开 / 卡 PlayableMaker」到「能玩 + CTA 结束」的完整路径就是上面这些点。下次新 `main.js`：先和副本比结构，再按清单从启动链 → Phaser → 视频 → CTA 顺序改。若你愿意，可以把当前 `main.js` 里已改的几处行号记在项目 README 里，以后复制项目更快。