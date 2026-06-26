---
name: playable-wechat-game
description: Migrates PlayableMaker single-file H5 playables (output.html, Phaser 3.90) to WeChat mini games. phaser3.90.0 is the version template; each game builds into phaser{version}_{timestamp}/. Use when porting playables, fixing wx errors, or setting up new WeChat game projects.
---

# PlayableMaker → 微信小游戏

## 工程模型

```
my-phaser-game/
├── sources/
│   ├── current/              # 正在做：output.html + 资源 + def-template.json
│   └── history/              # 已完成归档
├── phaser3.90.0/             # 微信版本模板
├── output/
│   └── wx/phaser3.90.0_{时间}/  # 独立微信工程（产物）
├── .wx-project               # 当前 build:wx 目标（如 output/wx/phaser3.90.0_xxx）
├── public/                   # extract 构建副本
└── src/wx/ + src/playable/
```

## 新游戏迁移流程

```
- [ ] 1. 解码导出 → 全部放入 sources/current/
- [ ] 2. npm run init:wx（可选，新微信工程）
- [ ] 3. npm run extract
- [ ] 4. npm run build:wx
- [ ] 5. 微信开发者工具打开 `output/wx/phaser3.90.0_xxx/`
- [ ] 6. 验证 OK → npm run finish:game（或说「可以了」）
```

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
| CTA | `notifyMiniProgramPlayableStatus`（需存在才调） | runtime `openUrl` |
| document.title 只读 | wx 下跳过赋值 | runtime `initGame` |
| 扩展名大小写 | 复制资源时扩展名小写 | copy-wx-assets |
| 预览/上传 `Unexpected token ?` | `build.target: es2015` + terser `ecma: 5` | vite/config.wx.mjs |
| `wxPerf.now is not a function` | weapp-adapter `getPerformance` fallback | phaser3.90.0/js/libs/weapp-adapter.js |
| 画面拉伸 / `w:undefined h:undefined` | 勿信 `getWindowInfo()`，用 `getSystemInfoSync` + `wxSetupCanvas` | weapp-adapter + game.js + runtime `startGame` |

Runtime 搜稳定**方法名**：`openUrl(`、`loadAssets(`、`startGame(`、`loadFont(`

## bundle 语法兼容（必配）

PlayableMaker runtime 含 `??` / `?.`（ES2020），微信小游戏引擎不支持。`vite/config.wx.mjs` 必须：

- `build.target: 'es2015'`
- `esbuild.supported` 关闭 `nullish-coalescing`、`optional-chain`
- `minify: 'terser'`，`terserOptions.format.ecma: 5`（只降级语法，可 `compress: false`）

**勿**设 `minify: false` 且不配 target，否则预览/上传报 `invalid file: js/playable/bundle.js … SyntaxError: Unexpected token ?`。

`build:wx` 后自检：

```bash
node -e "const c=require('fs').readFileSync(require('fs').readFileSync('.wx-project','utf8').trim()+'/js/playable/bundle.js','utf8'); console.log('??', (c.match(/\?\?/g)||[]).length);"
```

输出 `?? 0` 即可。

## 命令

```bash
npm run init:wx          # 新建 output/wx/phaser3.90.0_{时间}/，写入 .wx-project
npm run extract          # runtime + public/assets
npm run build:wx         # copy-wx-assets → {wx}/assets/ + bundle → js/playable/
npm run probe:output     # 探测 output.html / runtime 关键 API
npm run finish:game    # 可以了：current → history + clean:public
```

## 用户确认「可以了」

运行 `npm run finish:game`：归档 `sources/current/` 到 `sources/history/`，清理 `public/assets/`。

## extract 后验证

```bash
node -e "const c=require('fs').readFileSync('src/playable/runtime.js','utf8');
['notifyMiniProgramPlayableStatus','getFileSystemManager','window.canvas','typeof wx'].forEach(k=>console.log(k,c.includes(k)));"
```

## 禁止事项

- **不要**在某个游戏的工程里改 `phaser3.90.0/` 模板本身
- **不要**把多个游戏共用同一个 `output/wx/phaser3.90.0_xxx/` 目录（新游戏 `init:wx` 新建）
- 构建产物只放 `output/`，根目录只保留模板与源码
- 微信入口用 `require` + CJS，不手动改 `bundle.js`
- 不 assign `GameGlobal.canvas`
- **`vite/config.wx.mjs` 必须 `publicDir: false`** — 资源只放 `{wx}/assets/`，禁止 Vite 再拷 `public/` 到 `js/playable/`

## 详细参考

问题→API 表、错误速查、模板说明：[reference.md](reference.md)
