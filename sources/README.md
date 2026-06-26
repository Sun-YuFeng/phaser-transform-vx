# sources — 游戏素材

## 目录

```
sources/
├── current/     ← 正在做的游戏：output.html + 资源 + def-template.json
└── history/     ← 已完成归档（你说「可以了」后自动移入）
```

## 当前游戏放哪里

把解码工具导出的东西 **全部丢进 `sources/current/`** 即可：

```
sources/current/
├── output.html           # 必须
├── def-template.json     # 必须
├── logo.png              # 资源可平铺
├── Bubble-01.mp3
└── ...                   # 或放在 assets/ 子目录也行
```

## 命令

```bash
npm run extract      # 从 sources/current/ 提取 → runtime + public/
npm run build:wx     # 构建微信工程
npm run finish:game  # 可以了：归档 current → history + 清理 public
```

## 历史归档

`npm run finish:game` 会把 `current/` 整包移到：

```
sources/history/{游戏名}_{YYYY-MM-DD_HHmmss}/
```

游戏名来自 `def-template.json` 的 `general.name`。

## history/

已完成试玩按游戏名+时间保存，仅作备份，不参与构建。
