# 微信小游戏模板（归档）

与根目录 **`phaser3.90.0/`** 骨架一致。活模板以 `phaser3.90.0/` 为准。

## 新游戏

```bash
npm run init:wx              # 从 phaser3.90.0 复制 → phaser3.90.0_{时间}/
npm run extract sources/...  # 提取 runtime + 资源
npm run build:wx             # 构建到 .wx-project 目录
```

微信开发者工具打开 **`phaser3.90.0_xxx/`**，不是 `phaser3.90.0/`。

## 工程命名

`phaser{package.json 中 phaser 版本}_{YYYY-MM-DD_HHmmss}`

例：`phaser3.90.0_2026-06-24_101530`

## 关键约束

| 项 | 要求 |
|----|------|
| 模块格式 | CJS，`require('./js/playable/bundle.js')` |
| bundle 文件名 | 必须 `bundle.js` |
| canvas | 只读 `window.canvas` |
| 资源 | 外置 `assets/`，扩展名小写 |
| 主包 | `bigPackageSizeSupport: true` |

详见 `.cursor/skills/playable-wechat-game/SKILL.md`。
