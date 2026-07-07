import fs from 'fs';
const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];
const assets = new Set(fs.readdirSync('public/assets'));

// textures loaded in preload
const preloadIdx = bundle.indexOf('preload(){');
const preloadEnd = bundle.indexOf('create(){', preloadIdx);
const preload = bundle.slice(preloadIdx, preloadEnd);

const varToKey = new Map();
for (const m of bundle.matchAll(/\b([A-Za-z_$][\w$]{1,3})="([a-z][a-z0-9_]+)"/g)) {
  varToKey.set(m[1], m[2]);
}

const loadVars = [...preload.matchAll(/load\.image\(([a-zA-Z_$][\w$]*),/g)];
console.log('=== preload load.image ===');
for (const m of loadVars) {
  console.log(`  ${m[1]} -> ${varToKey.get(m[1])}`);
}

// textures.exists checks without load
const existsChecks = [...preload.matchAll(/textures\.exists\(([a-zA-Z_$][\w$]*)\)/g)];
console.log('\n=== textures.exists only ===');
for (const m of existsChecks) {
  const v = m[1];
  const loaded = preload.includes(`load.image(${v},`);
  console.log(`  ${v} -> ${varToKey.get(v)} loaded:${loaded}`);
}

// window hero keys
for (const k of ['ut', 'ct', 'Xt', 't', 'Z']) {
  console.log(`\n${k}: key=${varToKey.get(k)}`);
  const used = bundle.includes(`load.image(${k},`) || bundle.includes(`textures.exists(${k})`);
  console.log('  used in bundle:', used);
}

// 橱窗女主 on disk
const windowFrames = [...assets].filter((f) => f.includes('橱窗'));
console.log('\n橱窗女主 frames on disk:', windowFrames.length);
console.log('sample:', windowFrames.slice(0, 5));

// standalone modules 8,33 - what image?
for (const id of ['8', '33', '49', '163']) {
  const m = bundle.match(new RegExp(`${id}:t=>\\{"use strict";t\\.exports="data:image/[^"]+"`));
  if (!m) {
    const ext = bundle.match(new RegExp(`${id}:t=>\\{"use strict";t\\.exports="assets/([^"]+)"`));
    console.log(`module ${id}:`, ext?.[1] || '?');
  }
}

// search flag_banner usage
const bi = bundle.indexOf('flag_banner');
console.log('\nflag_banner ctx:', bundle.slice(bi - 100, bi + 200));

// scene background setTexture
for (const key of ['base_scene_window_hero', 'base_scene_background_landscape', 'base_scene_background_bathroom']) {
  const i = bundle.indexOf(key);
  console.log(`\n${key} refs:`, bundle.split(key).length - 1);
}

// load.image with variable t or Z
const oddLoads = [...bundle.matchAll(/load\.image\(([a-zA-Z_$][\w$]*),"(data:|assets\/)/g)];
for (const m of oddLoads) {
  if (!varToKey.has(m[1]) || m[1].length <= 1) console.log('odd load:', m[0].slice(0, 80));
}
