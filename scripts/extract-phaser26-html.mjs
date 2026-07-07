/**
 * AppLovin + Phaser 2.6 单文件 HTML → src/phaser26 + public/playableAssets
 * 用法: npm run extract:phaser26
 */
import fs from 'fs';
import path from 'path';
import { cpSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'fs';
import {
  findHtmlPath,
  findPlayableAssetsOutputDir,
  CURRENT_DIR,
} from './game-sources.mjs';
import { patchPhaser26ForWx } from './patch-phaser2-for-wx.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_ROOT = path.join(ROOT, 'src/phaser26');
const OUT_LIB = path.join(OUT_ROOT, 'lib');
const OUT_SCRIPTS = path.join(OUT_ROOT, 'scripts');
const PUBLIC_ASSETS = path.join(ROOT, 'public/playableAssets');
const MANIFEST_NAME = '_phaser_pack_manifest.json';

const htmlPath = findHtmlPath();
if (!htmlPath) {
  console.error('Missing sources/current/output.html');
  process.exit(1);
}

const content = fs.readFileSync(htmlPath, 'utf8');
if (!content.includes('packJSONObj') || !/Phaser v2\.6\./.test(content)) {
  console.error('Not AppLovin Phaser 2.6 HTML (expected packJSONObj + Phaser v2.6.x)');
  process.exit(1);
}

function extractScriptBlocks(html) {
  const blocks = [];
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) blocks.push(m[1]);
  return blocks;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function externalizePackJsonObj(code, records) {
  let out = code;
  for (const rec of records) {
    const key = rec.asset_key;
    const filePath = rec.path.replace(/\\/g, '/');
    if (rec.field === 'urls_0') {
      const re = new RegExp(`(key:"${escapeRegExp(key)}",urls:\\[)"data:[^"]+"`, 'g');
      out = out.replace(re, `$1"${filePath}"`);
    } else {
      const re = new RegExp(`(key:"${escapeRegExp(key)}",url:)"data:[^"]+"`, 'g');
      out = out.replace(re, `$1"${filePath}"`);
    }
  }
  return out;
}

function loadManifestRecords(sidecarDir) {
  const manifestPath = path.join(sidecarDir, MANIFEST_NAME);
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.records || null;
}

const scripts = extractScriptBlocks(content);
if (scripts.length < 25) {
  console.error(`Expected >=25 script blocks, got ${scripts.length}`);
  process.exit(1);
}

mkdirSync(OUT_LIB, { recursive: true });
mkdirSync(OUT_SCRIPTS, { recursive: true });
mkdirSync(PUBLIC_ASSETS, { recursive: true });

const SCRIPT_NAMES = [
  '00-global.js',
  '01-util.js',
  '02-debug.js',
  '03-aly.js',
  '04-analytics.js',
  '05-tools.js',
  '07-brain-meter.js',
  '08-rm.js',
  '09-confetti.js',
  '10-button.js',
  '11-girl.js',
  '12-choice.js',
  '13-geo-image.js',
  '14-webfont-loader.js',
  '15-custom-loader.js',
  '16-line-patch.js',
  '17-state-patch.js',
  '18-level-l.js',
  '19-level-p.js',
  '20-webfont-text.js',
  '22-debug-btn.js',
  '23-applovin.js',
  '24-boot.js',
];

writeFileSync(path.join(OUT_LIB, 'phaser.js'), scripts[6]);
console.log('Extracted phaser.js', (scripts[6].length / 1024).toFixed(1), 'KB');

const phaserPath = path.join(OUT_LIB, 'phaser.js');
if (patchPhaser26ForWx(phaserPath)) console.log('Patched phaser.js for wx (2.6 globals)');

const scriptMap = [
  [0, '00-global.js'],
  [1, '01-util.js'],
  [2, '02-debug.js'],
  [3, '03-aly.js'],
  [4, '04-analytics.js'],
  [5, '05-tools.js'],
  [7, '07-brain-meter.js'],
  [8, '08-rm.js'],
  [9, '09-confetti.js'],
  [10, '10-button.js'],
  [11, '11-girl.js'],
  [12, '12-choice.js'],
  [13, '13-geo-image.js'],
  [14, '14-webfont-loader.js'],
  [15, '15-custom-loader.js'],
  [16, '16-line-patch.js'],
  [17, '17-state-patch.js'],
  [18, '18-level-l.js'],
  [19, '19-level-p.js'],
  [20, '20-webfont-text.js'],
  // script[21] duplicates script[13] (GEOImage) — skip
  [22, '22-debug-btn.js'],
  [23, '23-applovin.js'],
];

for (const [idx, name] of scriptMap) {
  writeFileSync(path.join(OUT_SCRIPTS, name), scripts[idx]);
  console.log('Extracted', name, (scripts[idx].length / 1024).toFixed(1), 'KB');
}

let boot = scripts[24];
const sidecar = findPlayableAssetsOutputDir(CURRENT_DIR);
let records = sidecar ? loadManifestRecords(sidecar) : null;

if (sidecar && existsSync(path.join(sidecar, 'playableAssets'))) {
  cpSync(path.join(sidecar, 'playableAssets'), PUBLIC_ASSETS, { recursive: true, force: true });
  const count = readdirSync(PUBLIC_ASSETS).length;
  console.log('playableAssets →', PUBLIC_ASSETS, `(${count} files from sidecar)`);
}

if (records?.length) {
  boot = externalizePackJsonObj(boot, records);
  console.log('Externalized packJSONObj URLs:', records.length);
} else {
  console.warn('[phaser26] No _phaser_pack_manifest.json — boot.js keeps inline base64');
}

writeFileSync(path.join(OUT_SCRIPTS, '24-boot.js'), boot);
console.log('Extracted 24-boot.js', (boot.length / 1024).toFixed(1), 'KB');

writeFileSync(
  path.join(OUT_ROOT, 'bundle-order.json'),
  JSON.stringify(['lib/phaser.js', ...SCRIPT_NAMES.map((n) => `scripts/${n}`)], null, 2),
);

console.log('Done. src/phaser26 ready.');
