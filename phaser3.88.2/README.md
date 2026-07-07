# Phaser 3.90.0 微信小游戏 — 版本模板

**此目录是骨架模板，不是某个游戏的运行工程。**

新游戏请：

```bash
npm run init:wx    # 生成 phaser3.90.0_{YYYY-MM-DD_HHmmss}/
npm run extract
npm run build:wx
```

然后在微信开发者工具中打开 **新生成的 `phaser3.90.0_xxx/` 目录**。

## 模板包含

| 文件 | 说明 |
|------|------|
| `game.js` | 入口：adapter → bundle |
| `game.json` | 竖屏等配置 |
| `project.config.json` / `project.private.config.json` | 工程配置 |
| `js/libs/weapp-adapter.js` | 微信 DOM/API 适配 |

## 不应出现在模板里

- `assets/` 游戏资源
- `def-template.json` 游戏配置
- `js/playable/bundle.js` 构建产物

上述文件由 `npm run build:wx` 写入 **`.wx-project` 指向的独立工程目录**。

## 源码（项目根目录）

```
src/wx/phaser-wx-patch.js
src/wx/main.js
src/playable/runtime.js
scripts/init-wx-project.mjs
scripts/wx-project.mjs
```

AI 流程见 `.cursor/skills/playable-wechat-game/SKILL.md`。
