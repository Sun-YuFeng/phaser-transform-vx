/**
 * 将 extract:phaser26 产出同步到当前 .wx-project，并生成 js/main.js
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { getWxProjectDir, getWxProjectName } from './wx-project.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const wxRoot = getWxProjectDir();
const srcRoot = join(ROOT, 'src/phaser26');
const publicAssets = join(ROOT, 'public/playableAssets');
const assetsDest = join(wxRoot, 'playableAssets');

function patchWxProjectConfig() {
  const cfgPath = join(wxRoot, 'project.config.json');
  if (!existsSync(cfgPath)) return;
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  cfg.setting = cfg.setting || {};
  cfg.setting.disableUseStrict = true;
  cfg.setting.babelSetting = cfg.setting.babelSetting || {};
  cfg.setting.babelSetting.ignore = ['js/playable/**'];
  cfg.packOptions = cfg.packOptions || {};
  cfg.packOptions.ignore = [
    { type: 'folder', value: 'js/playable' },
  ];
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
}

if (!existsSync(srcRoot)) {
  console.error('Missing src/phaser26 — run npm run extract:phaser26 first');
  process.exit(1);
}

cpSync(
  join(ROOT, 'src/phaser2/wx/phaser-wx-patch.js'),
  join(wxRoot, 'js/libs/phaser2-wx-patch.js'),
  { force: true },
);

cpSync(join(ROOT, 'phaser2.6.0/game.js'), join(wxRoot, 'game.js'), { force: true });

if (existsSync(publicAssets)) {
  if (existsSync(assetsDest)) rmSync(assetsDest, { recursive: true, force: true });
  cpSync(publicAssets, assetsDest, { recursive: true, force: true });
  const count = readdirSync(assetsDest).length;
  console.log('playableAssets →', assetsDest, `(${count} files)`);
} else {
  console.warn('[phaser26] public/playableAssets missing — game may lack assets');
}

mkdirSync(join(wxRoot, 'js/playable'), { recursive: true });
cpSync(srcRoot, join(wxRoot, 'js/playable/phaser26-src'), { recursive: true, force: true });

execSync('node scripts/build-phaser26-game-bundle.mjs', { cwd: ROOT, stdio: 'inherit' });
patchWxProjectConfig();

console.log('Wx project:', getWxProjectName());
console.log('Runtime → js/main.js + playableAssets/');
