import fs from 'fs';
const runtime = fs.readFileSync('src/playable/runtime.js', 'utf8');
const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];

// all data: URLs left in runtime (not phaser internal)
const embeds = [...runtime.matchAll(/load\.(image|audio)\([^)]*data:(image|audio)\/[^"]+"/g)];
console.log('load.* with data: still:', embeds.length);
for (const m of embeds) {
  const idx = m.index;
  console.log('\n', runtime.slice(idx, idx + 120));
}

// Wt, Vt, Gt, Z definitions
for (const v of ['Wt', 'Vt', 'Gt', 'Z', 'Zt', 'Kt']) {
  const m = bundle.match(new RegExp(`${v}=([^;,]{0,200})`));
  console.log(`\n${v}=`, m?.[1]?.slice(0, 150));
}

// $t in runtime
console.log('\n$t path:', runtime.match(/load\.image\(\$t,"assets\/[^"]+"/)?.[0]);

// bathroom_bubble_dress
const xt = runtime.match(/load\.image\(Xt,[^)]+\)/)?.[0];
console.log('Xt:', xt);
