# output — 构建产物

本目录存放**所有由命令生成的输出**，与源码、模板、素材分离。

## 目录约定

```
output/
├── wx/                          # 微信小游戏独立工程
│   └── phaser{版本}_{时间}/     # init:wx 生成，微信开发者工具打开此目录
└── h5/                          # H5 生产构建（npm run build）
    └── dist/
```

## 什么放这里

| 子目录 | 来源命令 | 说明 |
|--------|----------|------|
| `output/wx/phaser3.90.0_*` | `npm run init:wx` + `build:wx` | PlayableMaker / Phaser 3 微信工程 |
| `output/wx/phaser2.3.0_*` | `npm run init:wx:phaser2` + `build:wx:phaser2` | Phaser 2 微信工程 |
| `output/h5/dist/` | `npm run build` | H5 Vite 生产包 |

## 什么不放这里

| 路径 | 性质 |
|------|------|
| `phaser3.90.0/`、`phaser2.3.0/` | 微信**版本模板**（骨架），不是产物 |
| `sources/` | 原始素材与归档 |
| `public/` | extract 中间副本，供 H5 / wx 构建读取 |
| `src/` | 源码 |

## 指针文件

根目录 `.wx-project` 记录当前活跃的微信工程名（相对项目根），例如：

```
output/wx/phaser3.90.0_2026-06-26_094249
```

`npm run build:wx` 按此路径写入 bundle 与 assets。

## 迁移说明

根目录若仍有旧的 `phaser3.90.0_{时间}/` 等产物，应移入 `output/wx/` 并更新 `.wx-project`。
