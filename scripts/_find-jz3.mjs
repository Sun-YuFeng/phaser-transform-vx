import fs from 'fs';
const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];

// All j="data:image assignments
let n = 0;
for (const m of bundle.matchAll(/j="(data:image\/[^"]+)"/g)) {
  n++;
  const idx = m.index;
  const ctx = bundle.slice(Math.max(0, idx - 80), idx + 100);
  console.log(`\n#${n} idx=${idx}:`, ctx.replace(/\n/g, ' '));
}

console.log('\n--- Z ---');
for (const m of bundle.matchAll(/Z="(data:image\/[^"]+)"/g)) {
  const idx = m.index;
  const ctx = bundle.slice(Math.max(0, idx - 80), idx + 100);
  console.log(`idx=${idx}:`, ctx.replace(/\n/g, ' '));
}

// Scene1 preload method
const scene1 = bundle.indexOf('class Ke extends');
const preload = bundle.indexOf('preload()', scene1);
console.log('\npreload snippet:', bundle.slice(preload, preload + 2500).slice(0, 2500));
