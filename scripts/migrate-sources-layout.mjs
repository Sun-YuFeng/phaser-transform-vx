/**
 * 一次性迁移：旧版 sources 扁平结构 → current/ + history/
 * 用法: node scripts/migrate-sources-layout.mjs
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'fs';
import { join } from 'path';
import {
  CURRENT_DIR,
  HISTORY_DIR,
  ensureSourceDirs,
  makeHistoryDirName,
  readGameName,
} from './game-sources.mjs';

ensureSourceDirs();

const legacyHtml = join('sources', 'output.html');
if (existsSync(legacyHtml)) {
  cpSync(legacyHtml, join(CURRENT_DIR, 'output.html'), { force: true });
  console.log('Moved sources/output.html → sources/current/');
}

const legacyExports = readdirSync('sources').filter(
  (n) =>
    n !== 'current' &&
    n !== 'history' &&
    n !== 'README.md' &&
    (n.startsWith('export-') || n.includes('_output') || n.includes('_101146')),
);

for (const folder of legacyExports) {
  const src = join('sources', folder);
  for (const file of readdirSync(src)) {
    if (file === '_webpack_exports_manifest.json') continue;
    cpSync(join(src, file), join(CURRENT_DIR, file), { force: true });
  }
  rmSync(src, { recursive: true, force: true });
  console.log('Merged', folder, '→ sources/current/');
}

if (existsSync(join(CURRENT_DIR, 'def-template.json'))) {
  const name = makeHistoryDirName(readGameName(CURRENT_DIR));
  const dest = join(HISTORY_DIR, name);
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
    for (const file of readdirSync(CURRENT_DIR)) {
      if (file === 'README.md') continue;
      renameSync(join(CURRENT_DIR, file), join(dest, file));
    }
    console.log('Archived working copy → sources/history/' + name + '/');
  }
}

console.log('Migration done. Put next game in sources/current/');
