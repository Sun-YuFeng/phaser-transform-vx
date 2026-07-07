# 路线图

## P0 — 一键调度（当前 v1）✅

- [x] `detect-playable-format.mjs` 统一探测
- [x] `migrate-from-html.mjs` 串联 init → extract → build
- [x] `migrate-report.json` 结构化日志
- [x] `npm run migrate`

**试用**：`npm run migrate -- your.html`

## P1 — webpack_main 纯 HTML 自洽

- [ ] 从 HTML/bundle 自动生成 `_webpack_main_manifest.json`（去掉对 `*_output/` 侧车依赖）
- [ ] 报告里区分「bundle 内嵌资源」vs「磁盘 manifest 资源」数量
- [ ] 大 HTML 采样探测（头/尾扫描），避免整文件卡死

## P2 — PlayableMaker 3.90 只传 HTML

- [ ] 从 HTML 解析或还原 `def-template.json`
- [ ] 从 HTML 提取外链/内联资源 → `public/assets/`
- [ ] 支持 `useInlineAssets` 分支

## P3 — Phaser 2.3 只传 HTML

- [ ] 从 JSZip 解出完整 `resource/`（场景 `.bin` 等）
- [ ] 无侧车时仍生成可玩 `resource/config/gameConfig.json`

## P4 — 产品与验收

- [ ] 环境检查脚本（Node、sharp）
- [ ] 上传大小限制
- [ ] 失败时「缺哪种特征 / 建议补什么文件」
- [ ] 可选：产出 zip 供下载
- [ ] 可选：Playwright / 微信 CLI 冒烟（L2「可玩」验收）

## 成功标准

| 阶段 | L1 可导入工程 | L2 打开可玩 |
|------|---------------|-------------|
| P0 | 已知格式 + 侧车齐全 | webpack_main 高概率 |
| P1 | webpack_main 仅 HTML | webpack_main 多数可玩 |
| P2 | 3.90 仅 HTML | 视试玩而定 |
| P3 | 2.3 仅 HTML | 视 zip 内容而定 |
