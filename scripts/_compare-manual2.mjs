import fs from 'fs';
import path from 'path';
import { buildVarToKeyMap, destNameForManifestAsset } from './externalize-wx-assets.mjs';

const MANUAL = 'sources/current/2026-06-26_170443_output';
const WX_ASSETS = 'output/wx/phaser3.88.2_2026-06-26_122630/assets';

const manifest = JSON.parse(
  fs.readFileSync(path.join(MANUAL, '_webpack_main_manifest.json'), 'utf8'),
);
const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];
const varToKey = buildVarToKeyMap(bundle);

const wxFiles = new Set(fs.readdirSync(WX_ASSETS));

function expectedDest(rel) {
  return destNameForManifestAsset(rel, varToKey);
}

// Member expr files from manual extract (misnamed by extractor)
const MEMBER_EXPR_MAP = {
  'Gt.middle': 'scene1_bubble_middle.png',
  'Ee.scene1_bubble_middle': 'scene1_icon_card.png',
  'Ee.scene1_bubble_bottom': 'scene1_icon_shoes.png',
};

console.log('=== Manifest records vs WX (by expected dest name) ===\n');
const missing = [];
const ok = [];
for (const rec of manifest.records) {
  const rel = rec.path.replace(/\\/g, '/');
  let dest = expectedDest(rel);
  const base = path.basename(rel).replace(/\.(webp|m4a|mp3)$/i, '');
  if (MEMBER_EXPR_MAP[base]) dest = MEMBER_EXPR_MAP[base];
  const found = wxFiles.has(dest) || wxFiles.has(dest.replace('.png', '.webp'));
  if (found) ok.push({ rel, dest });
  else missing.push({ rel, dest, base });
}

console.log(`OK: ${ok.length}, Missing: ${missing.length}`);
for (const m of missing) {
  console.log(`  MISSING: ${m.rel} -> expected ${m.dest}`);
}

// Extra files in manual images not in manifest
const manifestPaths = new Set(manifest.records.map((r) => r.path.replace(/\\/g, '/')));
const manualAll = [];
function walk(d, prefix = '') {
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    if (fs.statSync(p).isDirectory()) walk(p, prefix + name + '/');
    else manualAll.push((prefix + name).replace(/\\/g, '/'));
  }
}
walk(MANUAL);

const notInManifest = manualAll.filter(
  (f) => !f.endsWith('manifest.json') && !f.endsWith('.html') && !manifestPaths.has(f),
);
console.log('\n=== Files on disk not in manifest ===');
for (const f of notInManifest) console.log(`  ${f}`);

// Compare animation frame counts
const manualAnim = manifest.records.filter((r) => r.path.startsWith('assets/'));
const wxAnim = [...wxFiles].filter((f) => /[\u4e00-\u9fff]/.test(f));
console.log(`\nAnimation frames: manual manifest ${manualAnim.length}, wx chinese-named ${wxAnim.length}`);

const manualAnimNames = new Set(manualAnim.map((r) => path.basename(r.path).replace(/\.webp$/i, '.png')));
const wxAnimMissing = [...manualAnimNames].filter((n) => !wxFiles.has(n));
console.log(`\nAnimation frames in manual but not wx (${wxAnimMissing.length}):`);
for (const n of wxAnimMissing.slice(0, 30)) console.log(`  ${n}`);
if (wxAnimMissing.length > 30) console.log(`  ... and ${wxAnimMissing.length - 30} more`);

// bathroom_dress_option and cta labels in manual?
const labels = manualAll.filter((f) => f.includes('dress') || f.includes('scene1') || f.includes('bubble'));
console.log('\n=== scene1/bathroom related in manual ===');
for (const f of labels.sort()) console.log(`  ${f}`);
