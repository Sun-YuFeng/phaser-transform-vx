/**
 * 将 extract:phaser2 产出同步到当前 .wx-project 工程。
 */
import { cpSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { findHtmlPath, findDecompiledOutputDir } from './game-sources.mjs';
import { getWxProjectDir, getWxProjectName } from './wx-project.mjs';
import { patchPhaser2ForWx } from './patch-phaser2-for-wx.mjs';
import {
  extractMwConfigFromHtml,
  sanitizePlayableScript,
  sanitizeLibScript,
  loadAssetsPackageFromDataJs,
  writeFontFilesFromAssetsPackage,
} from './phaser2-wx-sanitize.mjs';

function patchWxProjectConfig(wxRoot) {
  const cfgPath = join(wxRoot, 'project.config.json');
  if (!existsSync(cfgPath)) return;
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  cfg.setting = cfg.setting || {};
  cfg.setting.disableUseStrict = true;
  cfg.setting.babelSetting = cfg.setting.babelSetting || {};
  cfg.setting.babelSetting.ignore = ['js/playable/lib/**', 'js/playable/scripts/**'];
  cfg.packOptions = cfg.packOptions || {};
  cfg.packOptions.ignore = [
    { type: 'folder', value: 'js/playable/lib' },
    { type: 'folder', value: 'js/playable/scripts' },
    { type: 'file', value: 'js/playable/mw-config.js' },
  ];
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
}

const ROOT = resolve(import.meta.dirname, '..');
const wxRoot = getWxProjectDir();
const libSrc = join(ROOT, 'src/phaser2/lib');
const playableSrc = join(ROOT, 'src/phaser2/playable');
const assetsSrc = join(ROOT, 'public/assets');
const libDest = join(wxRoot, 'js/playable/lib');
const scrDest = join(wxRoot, 'js/playable/scripts');
const resourceDest = join(wxRoot, 'resource');

if (!existsSync(libSrc)) {
  console.error('Missing src/phaser2/lib — run npm run extract:phaser2 first');
  process.exit(1);
}

mkdirSync(libDest, { recursive: true });
mkdirSync(scrDest, { recursive: true });
mkdirSync(resourceDest, { recursive: true });

for (const name of readdirSync(libSrc)) {
  const dest = join(libDest, name);
  let code = readFileSync(join(libSrc, name), 'utf8');
  code = sanitizeLibScript(name, code);
  writeFileSync(dest, code);
  if (name === 'phaser.min.js' || name === 'qc-core-min.js') {
    patchPhaser2ForWx(dest);
  }
}

if (existsSync(playableSrc)) {
  let dataJsSanitized = null;
  for (const name of readdirSync(playableSrc)) {
    if (name === 'mw-config-snippet.js') continue;
    let code = readFileSync(join(playableSrc, name), 'utf8');
    code = sanitizePlayableScript(name, code);
    writeFileSync(join(scrDest, name), code);
    if (name === 'data.js') dataJsSanitized = code;
  }
  if (dataJsSanitized) {
    try {
      const pkg = loadAssetsPackageFromDataJs(dataJsSanitized);
      const fontDir = join(wxRoot, 'resource/font');
      // 微信端不加载自定义 TTF，跳过字体文件写出
      console.log('[phaser2] skip font export on wx (use system fonts)');
    } catch (e) {
      console.warn('[phaser2] font extract failed:', e.message);
    }
  }
}

cpSync(
  join(ROOT, 'src/phaser2/wx/phaser-wx-patch.js'),
  join(wxRoot, 'js/libs/phaser2-wx-patch.js'),
  { force: true },
);

const htmlPath = findHtmlPath();
const mwSnippet = join(playableSrc, 'mw-config-snippet.js');
let mwConfig = htmlPath ? extractMwConfigFromHtml(readFileSync(htmlPath, 'utf8')) : null;
if (!mwConfig && existsSync(mwSnippet)) {
  mwConfig = readFileSync(mwSnippet, 'utf8');
  const cut = mwConfig.indexOf('</script>');
  if (cut >= 0) mwConfig = mwConfig.slice(0, cut).trim() + ';\n';
}
// MW_CONFIG 只打进 js/main.js，不在 wx 工程落盘 mw-config.js（避免 devtools 编译 ENOENT）

const decompiled = findDecompiledOutputDir();
if (decompiled) {
  const decResource = join(decompiled, 'resource');
  if (existsSync(decResource)) {
    // 换游戏时必须整目录替换，避免上一局 resource/ 残留
    if (existsSync(resourceDest)) {
      rmSync(resourceDest, { recursive: true, force: true });
    }
    cpSync(decResource, resourceDest, { recursive: true, force: true });
    console.log('Resource →', resourceDest, '(from decompiled output, replaced)');
    execSync(`node scripts/fix-phaser2-bin.mjs "${resourceDest}"`, {
      cwd: ROOT,
      stdio: 'inherit',
    });
  }
}

function syncGameConfigJson() {
  const configDir = join(resourceDest, 'config');
  const dest = join(configDir, 'gameConfig.json');
  const candidates = [
    join(decompiled || '', 'assets', 'gameConfig_json.json'),
    join(assetsSrc, 'gameConfig_json.json'),
    join(playableSrc, 'gameConfig_json.json'),
  ].filter((p) => p && existsSync(p));
  if (!candidates.length) {
    console.warn('[phaser2] gameConfig_json.json not found — skip resource/config/gameConfig.json');
    return;
  }
  mkdirSync(configDir, { recursive: true });
  cpSync(candidates[0], dest, { force: true });
  console.log('[phaser2] gameConfig →', dest);
}

/** PlaySmart 音效：assets/audio_HASH_mp3.mp3 → resource/game/audio/audio_HASH.mp3.bin */
function wxAudioDestName(fileName) {
  const hashMp3 = fileName.match(/^audio_([a-f0-9]+)_mp3\.mp3$/i);
  if (hashMp3) return `audio_${hashMp3[1]}.mp3.bin`;
  if (/^bm_bgm_mp3\.mp3$/i.test(fileName)) return 'bm_bgm.mp3.bin';
  return null;
}

function syncPhaser2WxAudio(assetDirs, audioDest) {
  mkdirSync(audioDest, { recursive: true });
  const seen = new Set();
  let count = 0;
  for (const dir of assetDirs) {
    if (!dir || !existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!/\.mp3$/i.test(name)) continue;
      const destName = wxAudioDestName(name);
      if (!destName || seen.has(destName)) continue;
      cpSync(join(dir, name), join(audioDest, destName), { force: true });
      seen.add(destName);
      count++;
    }
  }
  if (count) console.log(`[phaser2] audio → ${audioDest} (${count} files)`);
}

syncGameConfigJson();

const audioAssetDirs = [
  assetsSrc,
  decompiled ? join(decompiled, 'assets') : null,
].filter(Boolean);
syncPhaser2WxAudio(audioAssetDirs, join(resourceDest, 'game/audio'));

execSync('node scripts/build-phaser2-game-bundle.mjs', { cwd: ROOT, stdio: 'inherit' });

patchWxProjectConfig(wxRoot);

execSync('node scripts/clean-wx-phaser2-delivery.mjs', { cwd: ROOT, stdio: 'inherit' });

console.log('Wx project:', getWxProjectName());
console.log('Libs →', libDest, '(build only, delivery 已清理)');
console.log('Scripts →', scrDest, '(build only, delivery 已清理)');
console.log('Runtime assets →', resourceDest, '(不含冗余 assets/)');
