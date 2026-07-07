# Phaser 试玩 → 微信小游戏：一键迁移 Plan

本目录存放「纯脚本、用户只传 HTML」产品化方案与阶段记录。

## 快速试用（v1 / P0）

```bash
# 项目根目录，传入任意路径的 Phaser 试玩 HTML
npm run migrate -- path/to/game.html

# 或
node scripts/migrate-from-html.mjs path/to/game.html
```

成功后在终端看到微信工程路径，并生成 `plan/reports/migrate-report.json`。

用**微信开发者工具**打开 `output/wx/phaser*_时间/` 目录。

### 可选参数

| 参数 | 说明 |
|------|------|
| `--name <工程名>` | 自定义 `output/wx/` 下目录名（默认按模板版本+时间戳） |
| `--fresh` | 迁移前清空 `sources/current/`（仅保留本次 HTML） |
| `--dry-run` | 只探测格式与路由，不执行 extract/build |

## 当前版本能力（v1）

| 格式 | 只传 HTML | 说明 |
|------|-----------|------|
| `webpack_main` | ✅ 优先支持 | PlayableSDK + 内嵌 Phaser 3.88 |
| `legacy` / `v2` / `v3` | ⚠️ 需侧车文件 | 还要 `def-template.json` + 资源文件 |
| `phaser2-mw` | ⚠️ 需侧车文件 | 脚本在 HTML 内；`resource/` 场景常需 `*_output/` |

v1 **承诺**：产出可导入的微信工程 + 结构化报告。  
「打开就能玩」对 `webpack_main` 成功率最高；其余格式见 [ROADMAP.md](./ROADMAP.md)。

## 文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 管线分层与路由表
- [ROADMAP.md](./ROADMAP.md) — P0～P4 阶段与缺口
- `reports/` — 每次 `migrate` 写入的 JSON 报告

## 与现有命令的关系

`migrate` **不替代** 手工排错流程；它只是把下面几步串成一条：

```
探测格式 → init:wx → extract → build:wx
```

排错仍用各版本 rule + `.cursor/skills/playable-wechat-game/`。
