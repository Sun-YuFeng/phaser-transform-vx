# Phaser 2.3.0 微信小游戏 — 版本模板

**此目录是 QC/MW 引擎（Phaser 2.3.0）的骨架模板，不是某个游戏的运行工程。**

与 `phaser3.90.0`（PlayableMaker + Phaser 3）并行，流程类似但 extract / 补丁层不同。

## 新游戏

```bash
# 1. output.html + 解码资源 → sources/current/
npm run extract:phaser2          # HTML zip → src/phaser2/ + public/assets/

# 2. 新建独立微信工程（可选）
npm run init:wx -- --template phaser2.3.0

# 3. 构建
npm run build:wx:phaser2         # lib + assets + boot.js → .wx-project
```

微信开发者工具打开 **`.wx-project` 指向的 `phaser2.3.0_xxx/`** 目录。

## 与 3.90 的差异

| 项目 | Phaser 3.90 | Phaser 2.3 |
|------|-------------|------------|
| HTML 格式 | PlayableMaker runtime | MW/QC + JSZip base64 |
| extract | `npm run extract` | `npm run extract:phaser2` |
| 运行时 | `src/playable/runtime.js` | `src/phaser2/lib` + `playable/` |
| wx 补丁 | `src/wx/phaser-wx-patch.js` | `src/phaser2/wx/phaser-wx-patch.js` |
| 入口 bundle | `bundle.js`（含 Phaser 3） | `boot.js` + 外链 `lib/*.js` |
| game.js | adapter → bundle | adapter → phaser/qc lib → boot |

## 模板包含

- `game.js` — adapter → phaser/qc libs → boot.js
- `js/libs/weapp-adapter.js`
- `game.json` / `project.config.json`

## 不应出现在模板里

- `assets/`、`js/playable/lib/`、`js/playable/boot.js`（由 build 写入工程目录）

## 当前进度

- [x] HTML zip 提取（14 个 JS + assets）
- [x] 双模板 wx-project 切换（`.wx-template`）
- [ ] QC runtime 挂载与 wx 资源加载补丁
- [ ] boot.js 串联 game-scripts / resource-loader

详细见 `.cursor/skills/playable-wechat-game/SKILL.md`（后续补充 2.3 章节）。
