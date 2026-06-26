# PlayableMaker → 微信小游戏

PlayableMaker 单文件 H5 试玩还原为 Vite 工程，并打包为微信小游戏。

## 目录结构

```
my-phaser-game/
├── docs/                    # 文档
│   └── wechat-migration.md  # 微信适配笔记
├── sources/                 # 原始素材（不参与构建）
│   ├── output.html          # PlayableMaker 单文件源
│   └── export-*/            # 导出的资源包
├── vendor/                  # 第三方归档
│   └── weapp-adapter.zip
├── public/                  # H5 运行时资源
│   ├── assets/
│   └── def-template.json
├── src/
│   ├── main.js              # H5 入口
│   ├── playable/runtime.js  # PlayableMaker 运行时
│   └── wx/                  # 微信打包源码
│       ├── main.js
│       └── phaser-wx-patch.js
├── scripts/
│   ├── extract-runtime.mjs  # 从 output.html 提取 runtime
│   └── copy-wx-assets.mjs   # 同步微信资源
├── vite/
│   └── config.wx.mjs        # 微信 bundle 构建
├── templates/wechat-minigame/  # 新游戏可复制骨架
├── phaser3.90.0/            # 微信开发者工具打开此目录
└── .cursor/                 # AI Skill & Rule
```

## 命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | H5 本地预览（http://localhost:8080） |
| `npm run build` | H5 生产构建 → `dist/` |
| `npm run build:wx` | 同步资源 + 打包微信 bundle |
| `node scripts/extract-runtime.mjs` | 从 `sources/output.html` 重新提取 runtime |

## 微信小游戏

```bash
npm run build:wx
```

微信开发者工具导入 **`phaser3.90.0/`**：

- 勾选「不校验合法域名」
- `project.private.config.json` 已开启 `bigPackageSizeSupport`

## 新游戏迁移

1. 放入 `sources/output.html` 和资源导出目录（如 `sources/export-xxx/`）
2. `node scripts/extract-runtime.mjs sources/export-xxx`
3. 确认 `src/wx/phaser-wx-patch.js` 完整
4. `npm run build:wx`

详细流程见 `.cursor/skills/playable-wechat-game/SKILL.md`。

## 技术栈

- Phaser **3.90.0**
- Vite 6
- PlayableMaker 试玩 runtime
- weapp-adapter（`phaser3.90.0/js/libs/weapp-adapter.js`，来自微信 demo 副本）

## bundle 体积说明

`bundle.js` ~7MB 主要是 **Phaser 完整版未压缩**，资源已在 `assets/` 外置。可改用 `phaser-arcade-physics.min.js` + minify 压到 ~1.2MB。
