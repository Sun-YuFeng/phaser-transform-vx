import fs from 'fs';
import path from 'path';

const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];
const runtime = fs.readFileSync('src/playable/runtime.js', 'utf8');
const assets = new Set(fs.readdirSync('public/assets'));

// scene-related texture keys
const varToKey = new Map();
for (const m of bundle.matchAll(/\b([A-Za-z_$][\w$]{1,3})="([a-z][a-z0-9_]+)"/g)) {
  varToKey.set(m[1], m[2]);
}

const sceneKeys = [...varToKey.values()].filter(
  (k) =>
    k.includes('scene') ||
    k.includes('bathroom') ||
    k.includes('window') ||
    k.includes('board') ||
    k.includes('flag') ||
    k.includes('background'),
);
console.log('=== scene/background texture keys ===');
for (const k of sceneKeys.sort()) console.log(' ', k);

// purple / bar / bottom UI
for (const needle of ['purple', 'bar', 'bottom', 'banner', 'strip', 'dock', 'tab', 'progress', 'violet', '紫']) {
  const hits = [...varToKey.entries()].filter(([, v]) => v.toLowerCase().includes(needle));
  if (hits.length) console.log(`\n${needle}:`, hits);
}

// search bundle for purple color or bar-related
for (const p of ['0x', 'purple', '#6', '#7', '#8', 'banner', 'flag_banner', 'scene1', 'scene2', 'Scene1', 'Scene2']) {
  const n = (bundle.match(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
  if (n) console.log(`bundle "${p}" count:`, n);
}

// load.image paths in runtime
const loads = [...runtime.matchAll(/load\.image\(([a-zA-Z_$][\w$]*),"assets\/([^"]+)"/g)];
console.log('\n=== load.image -> file ===');
for (const [, v, file] of loads) {
  const key = varToKey.get(v) || v;
  const ok = assets.has(file) ? 'OK' : 'MISSING';
  console.log(`  [${ok}] ${key} <- ${file}`);
}

// data URLs still in runtime
const pngLeft = (runtime.match(/data:image\/png;base64,/g) || []).length;
console.log('\npng base64 left in runtime:', pngLeft);

// manifest vs bundle images folder
const manifest = JSON.parse(
  fs.readFileSync('sources/current/2026-06-26_101408_output/_webpack_main_manifest.json', 'utf8'),
);
const manifestImages = manifest.records.filter((r) => r.path.startsWith('images/'));
console.log('\nmanifest images count:', manifestImages.length);
for (const r of manifestImages) {
  const base = path.basename(r.path).replace(/\.webp$/i, '');
  const key = varToKey.get(base);
  const dest = key ? `${key}.png` : `${base}.png`;
  if (!assets.has(dest)) console.log('  MISSING on disk:', r.path, '->', dest);
}

// Ze() context lists - animation groups
const zeCalls = [...bundle.matchAll(/(\w+)=Ze\(i\((\d+)\)\)/g)];
console.log('\n=== animation context modules ===');
for (const [, name, modId] of zeCalls) {
  const ctxStart = bundle.indexOf(`${modId}:(t,e,i)=>{var s={`);
  if (ctxStart < 0) continue;
  const chunk = bundle.slice(ctxStart, ctxStart + 500);
  const first = chunk.match(/"\.\/([^"]+\.webp)"/);
  console.log(`  ${name} (i(${modId})): first frame ${first?.[1] || '?'}`);
}
