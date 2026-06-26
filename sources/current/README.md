# 当前游戏工作区

把 **PlayableMaker 的 output.html** 和解码导出的 **资源** 放这里。

必需：
- `output.html`
- `def-template.json`

资源文件（png/mp3/…）平铺在本目录，或放在 `assets/` 子目录。

完成后说「可以了」，或运行：

```bash
npm run finish:game
```

内容会归档到 `sources/history/`，本目录清空供下一个游戏使用。
