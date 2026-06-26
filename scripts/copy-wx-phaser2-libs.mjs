/**
 * 将 extract:phaser2 产出同步到当前 .wx-project 工程。
 */
import { cpSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { findHtmlPath } from './game-sources.mjs';
import { getWxProjectDir, getWxProjectName } from './wx-project.mjs';
import { patchPhaser2ForWx } from './patch-phaser2-for-wx.mjs';
import {
  extractMwConfigFromHtml,
  sanitizePlayableScript,
  sanitizeLibScript,
  loadAssetsPackageFromDataJs,
  writeFontFilesFromAssetsPackage,
} from './phaser2-wx-sanitize.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const wxRoot = getWxProjectDir();
const libSrc = join(ROOT, 'src/phaser2/lib');
const playableSrc = join(ROOT, 'src/phaser2/playable');
const assetsSrc = join(ROOT, 'public/assets');
const libDest = join(wxRoot, 'js/playable/lib');
const scrDest = join(wxRoot, 'js/playable/scripts');
const assetsDest = join(wxRoot, 'assets');

if (!existsSync(libSrc)) {
  console.error('Missing src/phaser2/lib — run npm run extract:phaser2 first');
  process.exit(1);
}

mkdirSync(libDest, { recursive: true });
mkdirSync(scrDest, { recursive: true });
mkdirSync(assetsDest, { recursive: true });

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
      const fontCount = writeFontFilesFromAssetsPackage(pkg, fontDir);
      console.log('Fonts →', fontDir, `(${fontCount} files)`);
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
if (mwConfig) {
  writeFileSync(join(wxRoot, 'js/playable/mw-config.js'), mwConfig);
}

let copied = 0;
if (existsSync(assetsSrc)) {
  for (const name of readdirSync(assetsSrc)) {
    cpSync(join(assetsSrc, name), join(assetsDest, name), { force: true });
    copied++;
  }
}

console.log('Wx project:', getWxProjectName());
console.log('Libs →', libDest);
console.log('Scripts →', scrDest);
console.log(`Assets: ${copied} files →`, assetsDest);
