import fs from 'fs';
const runtime = fs.readFileSync('src/playable/runtime.js', 'utf8');
const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];
const assets = new Set(fs.readdirSync('public/assets'));

const varToKey = new Map();
for (const m of bundle.matchAll(/(?:\b|(?<=[,;(]))([A-Za-z_$][\w$]{1,3})="([a-z][a-z0-9_]+)"/g)) {
  varToKey.set(m[1], m[2]);
}
// also $t explicitly
for (const m of bundle.matchAll(/\$t="([a-z][a-z0-9_]+)"/g)) {
  varToKey.set('$t', m[1]);
}

const loads = [...runtime.matchAll(/load\.image\(([a-zA-Z_$][\w$]*),"assets\/([^"]+)"/g)];
console.log('=== MISSING load.image assets ===');
for (const [, v, file] of loads) {
  if (!assets.has(file)) console.log(`  ${v} (${varToKey.get(v)}) -> ${file}`);
}

const idx = runtime.indexOf('load.image(Xt,');
console.log('Xt load:', runtime.slice(idx, idx + 80));

const idx2 = runtime.indexOf('load.image($t,');
console.log('$t load:', runtime.slice(idx2, idx2 + 80));

const idx3 = runtime.indexOf('load.image(t,');
console.log('t load:', runtime.slice(idx3, idx3 + 100));

// q() frame sequences - what keys use Te Re De
const assign = bundle.match(/Te=Ze\(i\(\d+\)\),Re=Ze\(i\(\d+\)\),De=Ze\(i\(\d+\)\)/);
console.log('\nTe,Re,De assign:', assign?.[0]);

// search window hero sequence usage
for (const name of ['Te', 'Re', 'De', 'Qe', 'ze', 'Le', 'Oe']) {
  const seq = bundle.match(new RegExp(`${name}\\w*Sequence=q\\(this\\.load,\\{key:(\\w+),frameSources:${name}`));
  console.log(`${name} sequence key var:`, seq?.[1], '->', varToKey.get(seq?.[1]));
}

// all keys from q() calls
const qCalls = [...bundle.matchAll(/q\(this\.load,\{key:(\w+),frameSources:(\w+)/g)];
console.log('\n=== animation sequences ===');
for (const [, keyVar, srcVar] of qCalls) {
  console.log(`  key=${varToKey.get(keyVar) || keyVar} frames=${srcVar}`);
}

// check ut ct in bundle usage beyond definition
for (const v of ['ut', 'ct']) {
  const re = new RegExp(`[^a-zA-Z]${v}[^a-zA-Z]`, 'g');
  const n = (bundle.match(re) || []).length;
  console.log(`\n${v} (${varToKey.get(v)}) usage count:`, n);
}
