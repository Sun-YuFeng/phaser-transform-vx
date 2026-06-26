import path from 'path';
import { cpSync, mkdirSync, readdirSync, readFileSync, unlinkSync, existsSync, rmSync } from 'fs';
import { normalizeDefAssetRefs, wxSafeFilename } from './normalize-asset-names.mjs';
import { collectAssetFiles } from './collect-asset-files.mjs';
import { getWxProjectDir, getWxProjectName } from './wx-project.mjs';

const wxRoot = getWxProjectDir();
const assetsSrc = path.resolve('public/assets');
const assetsDest = path.join(wxRoot, 'assets');
const defSrc = path.resolve('public/def-template.json');

const def = normalizeDefAssetRefs(JSON.parse(readFileSync(defSrc, 'utf8')));
const needed = collectAssetFiles(def);

mkdirSync(assetsDest, { recursive: true });

// 清理旧构建遗留的冗余文件
for (const stale of [
  path.join(wxRoot, 'def-template.json'),
  path.join(wxRoot, 'js', 'playable', 'assets'),
  path.join(wxRoot, 'js', 'playable', 'def-template.json'),
]) {
  if (!existsSync(stale)) continue;
  rmSync(stale, { recursive: true, force: true });
}

for (const file of readdirSync(assetsDest)) {
  if (!needed.has(file)) {
    unlinkSync(path.join(assetsDest, file));
  }
}

let copied = 0;
for (const file of needed) {
  if (file.endsWith('.mp4')) {
    continue;
  }

  const destName = wxSafeFilename(file);
  const srcPath = [path.join(assetsSrc, file), path.join(assetsSrc, destName)].find((p) =>
    existsSync(p),
  );
  if (!srcPath) {
    console.warn('Missing asset:', file);
    continue;
  }

  cpSync(srcPath, path.join(assetsDest, destName), { force: true });
  copied++;
}

console.log(`Copied ${copied} assets -> ${getWxProjectName()}/assets/`);
