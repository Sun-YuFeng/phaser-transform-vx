import path from 'path';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, unlinkSync, existsSync, rmSync } from 'fs';
import { normalizeDefAssetRefs, wxSafeFilename } from './normalize-asset-names.mjs';
import { collectAssetFiles } from './collect-asset-files.mjs';
import { getWxProjectDir, getWxProjectName } from './wx-project.mjs';
import { convertWebpFileToPng, convertWebpFilesInDir } from './webp-to-png.mjs';

const wxRoot = getWxProjectDir();
const assetsSrc = path.resolve('public/assets');
const assetsDest = path.join(wxRoot, 'assets');
const defSrc = path.resolve('public/def-template.json');

const def = JSON.parse(readFileSync(defSrc, 'utf8'));
const normalized = normalizeDefAssetRefs(def);
const copyAll = def._meta?.format === 'webpack_main';

if (existsSync(assetsSrc)) {
  const sweptSrc = await convertWebpFilesInDir(assetsSrc);
  if (sweptSrc > 0) {
    console.log(`Sweep webp→png in public/assets: ${sweptSrc} files`);
  }
}

let needed;
if (copyAll && existsSync(assetsSrc)) {
  needed = new Set(
    readdirSync(assetsSrc).filter((f) => existsSync(path.join(assetsSrc, f))),
  );
} else {
  needed = collectAssetFiles(normalized);
}

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
  const stem = file.replace(/\.(webp|png)$/i, '');
  const hasPng = needed.has(`${stem}.png`) || needed.has(stem + '.png');
  const hasWebp = needed.has(`${stem}.webp`);
  if (!needed.has(file) && !(file.toLowerCase().endsWith('.webp') && hasPng)) {
    unlinkSync(path.join(assetsDest, file));
  } else if (file.toLowerCase().endsWith('.webp') && hasPng) {
    unlinkSync(path.join(assetsDest, file));
  }
}

let copied = 0;
let pngConverted = 0;
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

  if (srcPath.toLowerCase().endsWith('.webp') || file.toLowerCase().endsWith('.webp')) {
    const pngName = wxSafeFilename(file.replace(/\.webp$/i, '.png'));
    await convertWebpFileToPng(srcPath, path.join(assetsDest, pngName), { removeSource: false });
    pngConverted++;
  } else {
    copyFileSync(srcPath, path.join(assetsDest, destName));
  }
  copied++;
}

const sweptDest = await convertWebpFilesInDir(assetsDest);
if (sweptDest > 0) pngConverted += sweptDest;

console.log(`Copied ${copied} assets -> ${getWxProjectName()}/assets/ (${pngConverted} webp→png)`);
