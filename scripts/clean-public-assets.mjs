import path from 'path';
import { readdirSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { collectAssetFiles } from './collect-asset-files.mjs';
import { wxSafeFilename } from './normalize-asset-names.mjs';

const publicDir = path.resolve('public');
const assetsDir = path.join(publicDir, 'assets');
const defPath = path.join(publicDir, 'def-template.json');

if (!existsSync(defPath)) {
  console.error('Missing public/def-template.json');
  process.exit(1);
}

if (!existsSync(assetsDir)) {
  console.log('public/assets/ does not exist, nothing to clean.');
  process.exit(0);
}

const def = JSON.parse(readFileSync(defPath, 'utf8'));
const needed = new Set();

for (const file of collectAssetFiles(def)) {
  needed.add(file);
  needed.add(wxSafeFilename(file));
}

let removed = 0;
for (const file of readdirSync(assetsDir)) {
  if (needed.has(file)) continue;
  unlinkSync(path.join(assetsDir, file));
  removed++;
  console.log('Removed:', file);
}

console.log(`Cleaned public/assets/: removed ${removed}, kept ${needed.size} referenced file(s).`);
