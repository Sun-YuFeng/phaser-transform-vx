import fs from 'fs';
import path from 'path';
import { buildVarToKeyMap } from './externalize-wx-assets.mjs';

const MANUAL = 'sources/current/2026-06-26_170443_output';
const WX_ASSETS = 'output/wx/phaser3.88.2_2026-06-26_122630/assets';
const PUBLIC_ASSETS = 'public/assets';
const RUNTIME = 'src/playable/runtime.js';

const manifest = JSON.parse(
  fs.readFileSync(path.join(MANUAL, '_webpack_main_manifest.json'), 'utf8'),
);

function listFiles(dir) {
  if (!fs.existsSync(dir)) return new Set();
  const out = new Set();
  function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else out.add(name.replace(/\.(webp|png|m4a|mp3)$/i, ''));
    }
  }
  walk(dir);
  return out;
}

const manualImages = listFiles(path.join(MANUAL, 'images'));
const manualAssets = listFiles(path.join(MANUAL, 'assets'));
const wxAssets = listFiles(WX_ASSETS);
const publicAssets = listFiles(PUBLIC_ASSETS);

// manifest entries: images/foo.webp -> var stem foo, map to texture key
const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];
const varToKey = buildVarToKeyMap(bundle);

const manifestStems = new Map();
for (const rec of manifest.records || []) {
  const norm = rec.path;
  if (!norm) continue;
  const base = path.basename(norm).replace(/\.(webp|m4a|mp3)$/i, '');
  const key = varToKey.get(base) || base;
  manifestStems.set(key, base);
}

// All manual texture keys from images folder (use varToKey)
const manualKeys = new Set();
for (const stem of manualImages) {
  manualKeys.add(varToKey.get(stem) || stem);
}
for (const stem of manualAssets) {
  manualKeys.add(stem); // animation frames use chinese names as keys
}

// Referenced in runtime as assets/xxx.png
const runtime = fs.readFileSync(RUNTIME, 'utf8');
const runtimeRefs = new Set(
  [...runtime.matchAll(/assets\/([^"\\]+?)\.(png|m4a|webp)/g)].map((m) =>
    m[1].replace(/\\/g, '/'),
  ),
);

function missingFromWx(keys) {
  return [...keys].filter((k) => {
    const safe = k; // wx uses wxSafeFilename but most are ascii
    return !wxAssets.has(safe) && !wxAssets.has(k);
  });
}

// Compare manual images keys vs wx
const manualImageKeys = [...manualImages].map((s) => varToKey.get(s) || s);
const missingInWx = manualImageKeys.filter((k) => !wxAssets.has(k));
const missingInPublic = manualImageKeys.filter((k) => !publicAssets.has(k));

console.log('Manual images:', manualImages.size);
console.log('Manual assets (animations):', manualAssets.size);
console.log('WX assets:', wxAssets.size);
console.log('Runtime asset refs:', runtimeRefs.size);

console.log('\n=== Manual images missing from WX output ===');
for (const k of missingInWx.sort()) {
  const stem = [...manualImages].find((s) => (varToKey.get(s) || s) === k) || k;
  console.log(`  ${k} (file: ${stem}.webp)`);
}

console.log('\n=== Manual images missing from public/assets ===');
for (const k of missingInPublic.sort()) {
  const stem = [...manualImages].find((s) => (varToKey.get(s) || s) === k) || k;
  console.log(`  ${k} (file: ${stem}.webp)`);
}

// Runtime refs not in wx
console.log('\n=== Runtime refs missing from WX ===');
const runtimeMissing = [...runtimeRefs].filter((r) => !wxAssets.has(r));
for (const r of runtimeMissing.sort()) console.log(`  ${r}`);

// Manual has but runtime doesn't reference
console.log('\n=== In manual extract but NOT referenced in runtime ===');
const notInRuntime = manualImageKeys.filter((k) => {
  return ![...runtimeRefs].some((r) => r === k || r.endsWith('/' + k));
});
for (const k of notInRuntime.sort()) console.log(`  ${k}`);

// List all manual image files for scene1 / bubble / flag
console.log('\n=== Manual images/ listing ===');
for (const f of [...manualImages].sort()) {
  const key = varToKey.get(f) || f;
  const inWx = wxAssets.has(key) ? 'OK' : 'MISSING';
  console.log(`  [${inWx}] ${f} -> ${key}`);
}
