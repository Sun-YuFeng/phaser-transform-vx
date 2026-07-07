/**
 * 2.3.0 微信工程交付清理：运行时只依赖 resource/ + js/main.js + js/libs/。
 * 去掉 extract 冗余副本 assets/ 与已打进 main.js 的 build 源码。
 */
import { existsSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getWxProjectDir, getWxProjectName } from './wx-project.mjs';

const wxRoot = getWxProjectDir();

const REMOVE_PATHS = [
  'assets',
  'js/playable/lib',
  'js/playable/scripts',
  'js/playable/mw-config.js',
];

const MW_CONFIG_STUB = `/**
 * PlaySmart MW_CONFIG 已内联在 js/main.js 文件头。
 * 本文件仅为微信开发者工具编译缓存占位，勿 require。
 */
`;

let removed = 0;
for (const rel of REMOVE_PATHS) {
  const p = join(wxRoot, rel);
  if (!existsSync(p)) continue;
  rmSync(p, { recursive: true, force: true });
  console.log('[phaser2] removed', rel);
  removed++;
}

const playableDir = join(wxRoot, 'js/playable');
if (existsSync(playableDir) && readdirSync(playableDir).length === 0) {
  rmSync(playableDir, { recursive: true, force: true });
  console.log('[phaser2] removed js/playable (empty)');
  removed++;
}

// devtools 会缓存 js/playable/mw-config.js；build 后删除会 ENOENT，留 stub
mkdirSync(playableDir, { recursive: true });
writeFileSync(join(playableDir, 'mw-config.js'), MW_CONFIG_STUB);
console.log('[phaser2] stub js/playable/mw-config.js (MW_CONFIG in main.js)');

console.log(`[phaser2] delivery clean: ${getWxProjectName()} (${removed} removed)`);
