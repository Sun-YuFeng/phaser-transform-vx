import fs from 'fs';
const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];

const defs = [
  'Wt=', 'Gt=', 'Ee=', 'Vt=', '$t=', 'Xt=', 'qt=',
  ',j=', ';j=', ',Z=', ';Z=',
];
for (const d of defs) {
  const i = bundle.indexOf(d);
  if (i >= 0) console.log(`\n=== ${d} ===\n`, bundle.slice(i, i + 300));
}

// $t assignment
for (const m of bundle.matchAll(/\$t="([^"]+)"/g)) console.log('$t key:', m[1]);

// Wt array
const wm = bundle.match(/Wt=\[([^\]]+)\]/);
console.log('\nWt:', wm?.[1]);

// preload loads
const loads = [...bundle.matchAll(/this\.load\.image\(([^)]+)\)/g)];
console.log('\nAll load.image:', loads.map((m) => m[1].slice(0, 120)));
