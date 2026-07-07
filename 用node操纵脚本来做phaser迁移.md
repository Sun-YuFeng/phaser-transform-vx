# 用node操纵脚本来做phaser迁移

当前有的：

提取资源脚本（乱，还没整理，且可能效率。。。）

迁移脚本（有的，目前反编译流程都很快，脚本控制）

补丁（补丁真的能做到吗？也许）



## 这套工具在干什么

目标：Cocos H5 试玩 → 可导入微信开发者工具的小游戏工程。

分层很清晰：

| 层     | 职责                                               |
| ------ | -------------------------------------------------- |
| 入口壳 | bat / exe / CLI，处理参数、环境、Windows `&` 转义  |
| 调度器 | `fetch-load-from-link.mjs`：抓链、识别类型、选分支 |
| 提取器 | 各 `extract-*.mjs`：从 HTML/load.js 拿出资源映射   |
| 解码器 | `decode-resmap-to-files.mjs`：映射 → 真实文件树    |
| 合并器 | `merge-wechat-*`：模板壳 + 试玩资源 → 产出工程     |

你现在只有「用户上传 HTML」，相当于别人链路里的 Step 1 后半段；后面「识别 → 提取 → 解码 → 合并」可以照搬思路。

------

## 完整执行流程（从链接到工程）

链接本地 HTML2.x 静态 resMap3.x __res__zip2.3.x 编码包运行时注入Bingo base122用户输入输入类型fetch-load-from-link复制到 output_cases/case/entry.html解析 Insightrackr shortUrl下载 entry.html / load.jsextract-html-from-loader 若有 load.jsoutput.from_loader.html引擎探测 cc.ENGINE_VERSION打包形态路由extract-resmap-from-htmlextract-super-html-ressuper-zip-auto / extract-super-zipextract-v233-from-htmlheadless 抓 resMapPlaywright getResourceinject-main-into-resmapdecode-resmap-to-filesresmap_files/直接 res/ + src/选 Cocoscreatorv*-muban 模板覆盖 assets / src / resCocoscreatorv*-wechat-case/

------

## 各阶段实现要点

### 0. 入口（你可省略大部分）

别人多做了「抓链」；你默认 HTML 上传，等价于：

output_cases/<case>/entry.html  ← 用户上传的文件

output_cases/<case>/output.from_loader.html  ← 通常直接 copy entry.html

对应代码路径：`fetch-load-from-link.mjs` → `runLocalHtmlPipeline` → `build-wechat-from-load.mjs`。

------

### 1. 解壳（load.js → HTML）

若输入是 AppLovin `load.js`，不是 HTML：

- 用 Node `vm` 执行 `load.js`
- 拦截 `al_renderHtml({ html })` 拿到内嵌 HTML
- 可选展开 pako 压缩的 inline script

脚本：`extract-html-from-loader.mjs`

你只有 HTML 时：跳过这步。

------

### 2. 引擎 + 打包识别（路由核心）

在 HTML 全文（或大文件头/中/尾采样）扫特征，决定走哪条提取链：

| 特征                                    | 类型         | 提取方式                     |
| --------------------------------------- | ------------ | ---------------------------- |
| `window.resMap` / `assets` / `res`      | 2.x 经典     | 静态正则 + VM 解析对象字面量 |
| `window.__res` + `src/chunks/bundle.js` | 3.x super    | `extract-super-html-res`     |
| `window.__zip`                          | zip 内嵌资源 | JSZip 解压 + 合并 `__res`    |
| `window["_<16hex>"]` + zip otherScript  | 2.3.x        | `extract-v233-from-html`     |
| 无静态 map，有 Cocos 壳                 | 运行时注入   | Playwright 抓 `window.__res` |
| BingoEngine + base122                   | 特殊 zip     | 浏览器里 `getResource(path)` |
| `window.compressed`                     | pako JSON    | 专用解压链                   |

实现：`playable-packaging-detect.mjs` + `build-wechat-from-load.mjs` 里一串 `if` 路由。

你要抄的重点：先分类，再提取；别假设所有试玩都有 resMap。

------

### 3. 提取（HTML → 资源映射）

统一中间形态：路径 → 内容 的字典（resMap / `__res`），例如：

{

  "main/index.js": "// ...",

  "main/native/xx.png": "data:image/png;base64,...",

  "res/import/xx.json": { "0": 123, "1": 45 }

}

#### 经典 2.x：`extract-resmap-from-html.mjs`

1. 用括号匹配从 HTML 抠 `window.resMap = { ... }`（或 assets/res）
2. 多次赋值时选 key 最多的那份
3. 若有 `window.__zip`，用 JSZip 解压条目 merge 进 map
4. 输出 `resmap.latest.json`

#### 3.x super：`extract-super-html-res.mjs`

1. 抠 `window.__res = { ... }`
2. 解码 `data:` URL、处理 `oasjidx` 干扰位
3. 直接写到 `resmap_files/`（跳过 resmap 中间 JSON 也行）

#### 2.3.x：`extract-v233-from-html.mjs`

1. 解 `window["_<hex>"]` 编码串
2. JSZip 读 `otherScript`
3. 产出 `res/` + `src/project.js` 目录结构

#### 运行时：`fetch_res_headless.py` / `dump-runtime-resmap-headless.mjs`

1. Playwright 打开页面
2. hook `window.res` / `__res` 赋值
3. 把 `blob:` 转成 `data:base64` 再序列化

------

### 4. 解码（映射 → 文件树）

`decode-resmap-to-files.mjs` 遍历每个 key：

| 值类型                      | 处理                         |
| --------------------------- | ---------------------------- |
| `data:image/png;base64,...` | 去干扰位 → 写二进制          |
| 纯 base64 字符串            | `Buffer.from`                |
| `{ "0": 73, "1": 68, ... }` | 当字节数组写 `.bin` / `.mp3` |
| 已是 object（import json）  | 写 `.json`                   |
| `.webp`                     | sharp 转 `.png`（微信兼容）  |
| `.cconb`                    | 写成 `.bin`                  |

输出：`output_cases/<case>/resmap_files/`（或 `resmap_files_full/`）

你别的工具至少要实现这一层，否则只有一大坨 JSON，落不了盘。

------

### 5. 补全 + 合并模板

2.x 经典链还会：

1. `inject-main-into-resmap`：从 HTML 注释块补 `main/index.js`、`internal/index.js`
2. `extract-settings-from-html`：抠 `window._CCSettings`
3. 复制 `Cocoscreatorv{version}-muban` → `*-wechat-<case>/`
4. 只覆盖试玩相关 bundle（`assets/main`、`resources`、`internal` 或 `res/`）
5. 模板非试玩部分保留（adapter、game.js、物理库等）

3.x 用 `merge-wechat-super-from-decoded.mjs`，逻辑类似但目录是 `assets/*/import|native` + `src/`。

------

## 目录约定（建议你也用类似结构）

output_cases/<case>/

  entry.html              # 原始输入

  output.from_loader.html # 解壳后的 HTML（你可与 entry 相同）

  resmap.latest.json      # 提取出的映射

  resmap_files/           # 解码后的文件树

  resmap_decode_report.json

  fetch_load_report.json  # 步骤日志（强烈建议有）

Cocoscreatorv2.4.12-wechat-<case>/   # 最终工程（仓库根）

------

## 给你「只有 HTML 上传」的最小实现清单

按优先级，别的工具可以只做这些：

### Phase 1：能跑通一类试玩

\1. 保存上传 HTML → caseDir/entry.html

\2. 探测引擎版本（扫 cc.ENGINE_VERSION / CocosEngine 注释）

\3. 探测打包类型（resMap / __res / __zip / v233）

\4. 调对应 extract 脚本 → 得到 resmap 或 resmap_files

\5. decode-resmap-to-files（若 extract 只出 JSON）

\6. 打日志 report.json（哪条链、多少 key、失败原因）

最小命令等价：

node tools/build-wechat-from-load.mjs <上传的.html> <案例名>

或：

node tools/fetch-load-from-link.mjs --html-file <上传的.html> <案例名> --build

若你只要资源、不要微信工程，在 `build-wechat-from-load` 里 merge 之前截断即可；或单独调 extract + decode。

### Phase 2：覆盖更多试玩

按上表加分支，顺序建议：

1. `window.resMap` / `assets` / `res`（最多）
2. `window.__res`（3.x / 2.x super）
3. `window.__zip`
4. headless 运行时（Playwright）
5. 2.3.x v233、Bingo 等特殊形态

### Phase 3：产物与体验

- 环境检查（Node、sharp、playwright）
- 上传大小限制 + 采样检测（避免 10MB HTML 卡死）
- 失败时返回「缺哪种特征 / 建议走 headless」
- 可选：只导出 zip（`resmap_files`）不给完整工程

------

## 架构上值得抄的设计

1. 统一中间格式：路径 → 内容 的 map，后面 decode 与引擎版本解耦
2. 先路由再提取：`hasResMap` 只是众多特征之一
3. 静态优先、headless 兜底：能正则抠就不开浏览器
4. 模板只读：产出写到独立目录，不写回 muban
5. 逐步 report：每步写 JSON 日志，方便排查「卡在哪」
6. Windows 参数安全：URL 用环境变量 / url-file，别直接拼 shell

------

## 你当前阶段 vs 完整工具

| 能力         | 本仓库 | 你现在   |
| ------------ | ------ | -------- |
| 链接抓取     | ✅      | ❌ 不需要 |
| HTML 上传    | ✅      | ✅ 已有   |
| 打包识别     | ✅      | 待做     |
| 多分支提取   | ✅      | 待做     |
| decode 落盘  | ✅      | 待做     |
| 合并微信模板 | ✅      | 看需求   |

下一步建议：在上传 HTML 后，先接 `build-wechat-from-load.mjs` 前半段（识别 + extract + decode），先不管 merge；跑通 `resmap_files` 有文件、report 无 error，再考虑是否合并模板或只打包资源 zip。