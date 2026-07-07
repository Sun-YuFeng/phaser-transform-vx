import fs from 'fs';
import path from 'path';

const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];
const runtime = fs.readFileSync('src/playable/runtime.js', 'utf8');

const wxFiles = new Set(
  fs.readdirSync('output/wx/phaser3.88.2_2026-06-26_122630/assets'),
);

const runtimeRefs = new Set(
  [...runtime.matchAll(/assets\/([^"\\]+?)\.(png|m4a)/g)].map((m) => m[1]),
);

const newM = JSON.parse(
  fs.readFileSync('sources/current/2026-06-26_170443_output/_webpack_main_manifest.json', 'utf8'),
);

const newPaths = new Set(newM.records.map((r) => r.path));
console.log('Manual manifest:', newM.records.length);

// Runtime refs not in either manifest
function basenameToPath(name) {
  if (name.endsWith('.m4a')) return `audio/${name}`;
  if (/[\u4e00-\u9fff]/.test(name)) return `assets/${name.replace('.png', '.webp')}`;
  return `images/${name.replace('.png', '.webp')}`;
}

console.log('\n=== Runtime refs NOT in manual manifest ===');
for (const ref of [...runtimeRefs].sort()) {
  const guess = basenameToPath(ref);
  const inNew = newPaths.has(guess) || [...newPaths].some((p) => p.endsWith(path.basename(guess)));
  if (!inNew) console.log(`  ${ref} (guess path: ${guess})`);
}

// Check 女主_00004
console.log('\n女主_00004 in bundle:', bundle.includes('女主_00004'));
console.log('女主_00004 in runtime:', runtime.includes('女主_00004'));
console.log('女主_00004 in wx:', wxFiles.has('女主_00004.png'));

// webpack module map for 女主 animation
const mods = [...bundle.matchAll(/"\.\/(女主_\d+\.webp)":(\d+)/g)];
const frames = mods.map((m) => m[1]);
console.log('\n女主 frames in bundle webpack map:', frames.length);
console.log('First:', frames[0], 'Has 00004:', frames.includes('女主_00004.webp'));

const missingFrames = frames.filter((f) => !wxFiles.has(f.replace('.webp', '.png')));
console.log('女主 frames missing from wx:', missingFrames.length);
for (const f of missingFrames) console.log(' ', f);

// Audio vars in bundle
const audioVars = [...bundle.matchAll(/([A-Za-z]{2})="base_scene_[^"]+"/g)];
console.log('\nAudio texture keys sample:', audioVars.slice(0, 5));

// Find all load.audio and embedded audio in bundle
const audioLoads = [...bundle.matchAll(/load\.audio\(([^,)]+)/g)].map((m) => m[1]);
console.log('\nload.audio keys:', [...new Set(audioLoads)]);

// Extra audio files in manual folder
const manualAudio = fs.readdirSync('sources/current/2026-06-26_170443_output/audio');
console.log('\nManual audio files:', manualAudio.sort().join(', '));
console.log('Manual audio NOT in wx:');
for (const a of manualAudio) {
  const stem = a.replace('.m4a', '');
  if (!wxFiles.has(a)) console.log(' ', a, '- in manifest:', newPaths.has(`audio/${a}`));
}
