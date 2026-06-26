/**
 * 探测 output.html 是否可被 extract 识别，以及 runtime 关键 wx API 是否预期存在。
 * 用法: npm run probe:output
 */
import fs from 'fs';

import { findHtmlPath } from './game-sources.mjs';

const htmlPath = process.argv[2] ?? findHtmlPath();
if (!htmlPath) {
  console.error('Missing sources/current/output.html');
  process.exit(1);
}
const c = fs.readFileSync(htmlPath, 'utf8');

console.log('File:', htmlPath, '| Size MB:', (c.length / 1024 / 1024).toFixed(2));

// extract 能否切分（实现细节，非兼容核心）
const formats = [
  { name: 'legacy', ok: c.includes('const bt = "applovin"') && c.includes('function rs() {') },
  { name: 'v2', ok: c.includes('const Tt="applovin"') && c.includes('function Ii(){') },
  { name: 'v3', ok: c.includes('const e="applovin"') && c.includes('const Wt=window||Tt.g') },
  { name: 'phaser2-mw', ok: c.includes('assetsPackage["replace_js"]') && c.includes('qc-core-min.js') },
];
const detected = formats.find((f) => f.ok);
console.log('\nExtract format:', detected?.name ?? 'UNKNOWN — extend locateSections()');
if (detected?.name === 'phaser2-mw') {
  console.log('→ Use: npm run extract:phaser2  (not npm run extract)');
}

// PlayableMaker 稳定方法名（兼容排查用）
const methods = ['openUrl(', 'loadAssets(', 'loadFont(', 'startGame(', 'initGame(', 'useInlineAssets(', 'load.video('];
console.log('\nRuntime methods in HTML:');
for (const m of methods) console.log(' ', m, c.includes(m) ? 'yes' : 'no');

// 若已有 runtime.js，检查关键 wx API
const runtimePath = 'src/playable/runtime.js';
if (fs.existsSync(runtimePath)) {
  const r = fs.readFileSync(runtimePath, 'utf8');
  console.log('\nWx API in runtime.js:');
  const apis = [
    'notifyMiniProgramPlayableStatus',
    'getFileSystemManager',
    'window.canvas',
    'Phaser.WEBGL',
    'typeof wx==="undefined"&&this.load.video',
  ];
  for (const a of apis) console.log(' ', a, r.includes(a) ? 'ok' : 'MISSING');
}
