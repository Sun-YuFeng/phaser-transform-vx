import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import {
  CURRENT_DIR,
  HISTORY_DIR,
  ensureSourceDirs,
  currentHasContent,
  makeHistoryDirName,
  readGameName,
} from './game-sources.mjs';

ensureSourceDirs();

if (!currentHasContent()) {
  console.log('sources/current/ 为空，无需归档。');
  process.exit(0);
}

const gameName = readGameName();
const historyName = process.argv[2] || makeHistoryDirName(gameName);
const dest = join(HISTORY_DIR, historyName);

if (existsSync(dest)) {
  console.error('历史目录已存在:', dest);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });

const archived = [];
for (const name of readdirSync(CURRENT_DIR)) {
  if (name === 'README.md' || name === '.gitkeep') continue;
  const src = join(CURRENT_DIR, name);
  renameSync(src, join(dest, name));
  archived.push(name);
}

writeFileSync(
  join(dest, '_archived.json'),
  JSON.stringify(
    {
      gameName,
      archivedAt: new Date().toISOString(),
      files: archived,
    },
    null,
    2,
  ),
);

console.log(`Archived → sources/history/${historyName}/`);
console.log('Files:', archived.join(', ') || '(none)');
