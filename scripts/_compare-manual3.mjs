import fs from 'fs';
import path from 'path';
import { buildVarToKeyMap, destNameForManifestAsset } from './externalize-wx-assets.mjs';

const MANUAL = 'sources/current/2026-06-26_170443_output';
const WX = 'output/wx/phaser3.88.2_2026-06-26_122630/assets';
const manifest = JSON.parse(
  fs.readFileSync(path.join(MANUAL, '_webpack_main_manifest.json'), 'utf8'),
);
const manifestPaths = new Set(manifest.records.map((r) => r.path.replace(/\\/g, '/')));
const wxFiles = new Set(fs.readdirSync(WX));
const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];
const varToKey = buildVarToKeyMap(bundle);

// Files on disk in manual folder but NOT in manifest
const diskFiles = [];
function walk(d, prefix = '') {
  for (const name of fs.readdirSync(d)) {
    const rel = (prefix + name).replace(/\\/g, '/');
    const p = path.join(d, name);
    if (fs.statSync(p).isDirectory()) walk(p, rel + '/');
    else if (!rel.endsWith('manifest.json') && !rel.endsWith('.html'))
      diskFiles.push(rel);
  }
}
walk(MANUAL);

const notInManifest = diskFiles.filter((f) => !manifestPaths.has(f));
console.log('=== On disk but NOT in manual manifest ===\n');
for (const f of notInManifest.sort()) {
  const base = path.basename(f).replace(/\.(webp|m4a|png)$/i, '');
  const key = varToKey.get(base) || base;
  const dest = destNameForManifestAsset(f, varToKey);
  const inWx = wxFiles.has(dest) || wxFiles.has(dest.replace('.png', '.webp'));
  console.log(`  ${f}`);
  console.log(`    -> key: ${key}, wx: ${dest} [${inWx ? 'OK' : 'MISSING'}]`);
}

// Audio var mapping
const audioMap = {
  Ae: 'base_scene_bgm',
  le: 'base_scene_button_failure',
  ue: 'base_scene_button_success',
  ce: 'base_scene_bubble_click',
  de: 'base_scene_merge_success',
  fe: 'base_scene_repair_success',
  ge: 'base_scene_game_win',
};
console.log('\n=== Audio var -> wx file ===');
for (const [v, key] of Object.entries(audioMap)) {
  const wxName = `${key}.m4a`;
  console.log(`  ${v}.m4a -> ${wxName}: ${wxFiles.has(wxName) ? 'OK' : 'MISSING'}`);
}

// 女主_00004 specifically
console.log('\n女主_00004.webp in bundle module map:', bundle.includes('女主_00004'));
console.log('女主_00004.png in wx:', wxFiles.has('女主_00004.png'));
console.log('女主_00000.png in wx:', wxFiles.has('女主_00000.png'));

// Count webpack 女主 frames in bundle vs wx
const frames = [...bundle.matchAll(/"\.\/(女主_\d+\.webp)"/g)].map((m) => m[1]);
const wx女主 = [...wxFiles].filter((f) => f.startsWith('女主_'));
console.log(`\n女主 frames: bundle ${frames.length}, wx ${wx女主.length}`);
const missing女主 = frames.filter((f) => !wxFiles.has(f.replace('.webp', '.png')));
console.log('Missing 女主 frames in wx:', missing女主);

// Embedded-only resources (in runtime but not manual manifest)
const runtime = fs.readFileSync('src/playable/runtime.js', 'utf8');
const runtimeRefs = [...runtime.matchAll(/assets\/([^"\\]+?)\.(png|m4a)/g)].map((m) => m[1]);

const manifestDests = new Set();
for (const rec of manifest.records) {
  manifestDests.add(destNameForManifestAsset(rec.path, varToKey).replace(/\.(png|m4a)$/, ''));
}

const embeddedOnly = runtimeRefs.filter((r) => !manifestDests.has(r));
console.log(`\n=== In runtime but NOT in manual manifest (${embeddedOnly.length}) ===`);
for (const r of embeddedOnly.sort()) console.log(`  ${r}`);
