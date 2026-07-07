/**
 * 从 MW/QC 单文件 HTML（JSZip + base64）提取 embedded 脚本与资源索引。
 * 用法: npm run extract:phaser2
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { mkdirSync, writeFileSync, cpSync, existsSync, readdirSync } from 'fs';
import { findHtmlPath, listResourceFiles, findDecompiledOutputDir } from './game-sources.mjs';
import { wxSafeFilename } from './normalize-asset-names.mjs';
import { patchPhaser2ForWx } from './patch-phaser2-for-wx.mjs';
import {
  extractMwConfigFromHtml,
  sanitizePlayableScript,
} from './phaser2-wx-sanitize.mjs';

const SCRIPT_LIST = [
  'replace_js/pl-adapter.js',
  'replace_js/Assets/meta/globalUrlMap.js',
  'replace_js/lib/phaser.min.js',
  'replace_js/lib/webfontloader.js',
  'replace_js/lib/qc-core-min.js',
  'replace_js/lib/qc-webgl.js',
  'replace_js/lib/PlaySmartEditorData.js',
  'replace_js/picDesc.js',
  'replace_js/data.js',
  'replace_js/js/resource-loader.js',
  'replace_js/js/resource_loader.js', // 部分包无此文件
  'replace_js/Assets/meta/assetCountMap.js',
  'replace_js/js/game-scripts.min.js',
  'replace_js/lib/qc-loading-debug.js',
  'replace_js/libs/expand/languagesMgr/languagesMgr.js',
];

const htmlPath = findHtmlPath();
if (!htmlPath) {
  console.error('Missing sources/current/output.html');
  process.exit(1);
}

const content = fs.readFileSync(htmlPath, 'utf8');

if (!content.includes('assetsPackage["replace_js"]') && !content.includes('assetsPackage["replace_js"]')) {
  console.error('Not MW/QC zip format (expected assetsPackage["replace_js"])');
  process.exit(1);
}

function extractZipBase64(html) {
  const re = /assetsPackage\s*\[\s*["']replace_js["']\s*\]\s*=\s*["']([A-Za-z0-9+/=]+)["']/;
  const m = html.match(re);
  if (!m) throw new Error('Cannot find assetsPackage["replace_js"] base64 string');
  return m[1];
}

function extractMwConfig(html) {
  return extractMwConfigFromHtml(html);
}

const zipB64 = extractZipBase64(content);
const zipBuf = Buffer.from(zipB64, 'base64');
const zip = await JSZip.loadAsync(zipBuf);

const outRoot = path.resolve('src/phaser2');
const outLib = path.join(outRoot, 'lib');
const outPlayable = path.join(outRoot, 'playable');
const publicAssets = path.resolve('public/assets');
mkdirSync(outLib, { recursive: true });
mkdirSync(outPlayable, { recursive: true });
mkdirSync(publicAssets, { recursive: true });

let ok = 0;
const missing = [];

const OPTIONAL_SCRIPTS = new Set(['replace_js/js/resource_loader.js']);

for (const key of SCRIPT_LIST) {
  const entry = zip.file(key);
  if (!entry) {
    if (!OPTIONAL_SCRIPTS.has(key)) missing.push(key);
    continue;
  }
  const code = await entry.async('string');
  const base = key.split('/').pop();
  const isLib =
    key.includes('/lib/') ||
    base === 'phaser.min.js' ||
    base === 'webfontloader.js' ||
    base === 'languagesMgr.js';
  const dest = path.join(isLib ? outLib : outPlayable, base);
  writeFileSync(dest, code);
  console.log('Extracted', base, (code.length / 1024).toFixed(1), 'KB');
  ok++;
}

const phaserPath = path.join(outLib, 'phaser.min.js');
const qcPath = path.join(outLib, 'qc-core-min.js');
if (patchPhaser2ForWx(phaserPath)) console.log('Patched phaser.min.js for wx');
if (patchPhaser2ForWx(qcPath)) console.log('Patched qc-core-min.js for wx');

// 保存 boot 段与 zip 内全部路径清单
const mwConfig = extractMwConfig(content);
if (mwConfig) {
  writeFileSync(path.join(outPlayable, 'mw-config-snippet.js'), mwConfig);
}

const allPaths = Object.keys(zip.files).filter((k) => !zip.files[k].dir);
writeFileSync(
  path.join(outRoot, 'zip-manifest.json'),
  JSON.stringify({ paths: allPaths, scriptList: SCRIPT_LIST }, null, 2),
);

// 同步 sources/current/assets → public/assets（QC bin.json 资源）
let copied = 0;
for (const { src, rel } of listResourceFiles()) {
  const destName = wxSafeFilename(rel.includes('/') ? rel.split('/').pop() : rel);
  cpSync(src, path.join(publicAssets, destName), { force: true });
  copied++;
}

const decompiled = findDecompiledOutputDir();
if (decompiled) {
  const decAssets = path.join(decompiled, 'assets');
  if (existsSync(decAssets)) {
    for (const name of readdirSync(decAssets)) {
      cpSync(path.join(decAssets, name), path.join(publicAssets, wxSafeFilename(name)), {
        force: true,
      });
      copied++;
    }
  }
  console.log('Decompiled output:', decompiled);
}

console.log(`\nDone: ${ok}/${SCRIPT_LIST.length} scripts from zip`);
console.log(`Copied ${copied} assets → public/assets/`);

if (missing.length) {
  console.warn('Missing in zip:', missing.join(', '));
  process.exit(1);
}

// 探测 Phaser 版本
const phaserCode = fs.readFileSync(phaserPath, 'utf8');
const ver = phaserCode.match(/VERSION[^'"]*['"]([\d.]+)['"]/);
console.log('Phaser version:', ver ? ver[1] : 'unknown');
