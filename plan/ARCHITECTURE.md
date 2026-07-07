# 架构：HTML 上传 → 微信工程

## 目标

用户只提供 **一个 Phaser 试玩 HTML**，脚本自动产出 **可导入微信开发者工具** 的工程目录。

```
┌──────────────┐     ┌─────────────────────────┐     ┌────────────────────┐
│  game.html   │────▶│ migrate-from-html.mjs   │────▶│ output/wx/...      │
│  (用户上传)   │     │  detect → init → extract │     │ migrate-report.json │
└──────────────┘     │  → build                │     └────────────────────┘
                     └─────────────────────────┘
```

## 分层（对齐 Node 管线思路）

| 层 | 脚本 | 职责 |
|----|------|------|
| 入口 | `migrate-from-html.mjs` | 参数、落盘、调度、报告 |
| 探测 | `detect-playable-format.mjs` | HTML 特征 → 格式 + 模板 + 命令 |
| 提取 | `extract-runtime.mjs` / `extract-phaser2-html.mjs` | HTML → runtime + public/assets |
| 合并 | `init-wx-project.mjs` + `build:wx*` | 模板壳 + 资源 + bundle |
| 补丁 | `src/wx/*`、`phaser2-wx-sanitize.mjs` 等 | 微信运行时兼容（extract/build 内嵌） |

## 格式路由表

| 探测名 | HTML 特征（摘要） | 微信模板 | extract | build |
|--------|-------------------|----------|---------|-------|
| `phaser2-mw` | `assetsPackage["replace_js"]` + `qc-core-min.js` | `phaser2.3.0` | `extract:phaser2` | `build:wx:phaser2` |
| `webpack_main` | `PlayableSDK` + `new Phaser.Game`，无 PlayableMaker 水印 | `phaser3.88.2` | `extract` | `build:wx` |
| `legacy` / `v2` / `v3` | PlayableMaker `applovin` + tail 函数 | `phaser3.90.0` | `extract` | `build:wx` |
| `UNKNOWN` | — | — | 失败，写 report | — |

探测顺序：**phaser2-mw → webpack_main → legacy → v2 → v3**（避免 marker 误判）。

## 目录约定

```
sources/current/output.html    ← migrate 写入（用户 HTML）
public/assets/                 ← extract 产出
src/playable/runtime.js      ← 3.x extract 产出
src/phaser2/                 ← 2.3 extract 产出
output/wx/phaser{ver}_{ts}/  ← 最终微信工程（.wx-project 指向此处）
plan/reports/migrate-report.json
```

## 报告字段

见 `scripts/migrate-from-html.mjs` 内 `writeReport()`。核心：

- `ok` — 全流程是否成功
- `detected` — 格式与路由
- `warnings` — 缺 def-template、缺 resource、缺 manifest 等
- `wxProject` — 产出路径

## 设计原则

1. **先路由再提取** — 不假设所有试玩同一结构
2. **模板只读** — 产出写到独立 `output/wx/...`，不改 `phaser3.x.x/` 骨架
3. **静态优先** — v1 不做 Playwright；headless 放 P4
4. **每步可观测** — report.json 记录步骤与警告
