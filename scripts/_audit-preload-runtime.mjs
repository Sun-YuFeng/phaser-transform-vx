import fs from 'fs';
const runtime = fs.readFileSync('src/playable/runtime.js', 'utf8');
const i = runtime.indexOf('preload(){');
const end = runtime.indexOf('create(){', i);
const preload = runtime.slice(i, end);

const loads = [...preload.matchAll(/load\.image\(([^,]+),([^)]+)\)/g)];
console.log('Still problematic loads:');
for (const m of loads) {
  const key = m[1];
  const val = m[2];
  if (
    val.includes('data:') ||
    val === 'j' ||
    val === 'Z' ||
    key.includes('$') ||
    key === 't' ||
    key.includes('[') ||
    key.includes('.')
  ) {
    const stem = val.includes('data:') ? '(embedded)' : val;
    console.log(`  ${key} <- ${stem}`);
  }
}

// Vt still embedded?
const vi = runtime.indexOf('Vt={');
console.log('\nVt in runtime:', runtime.slice(vi, vi + 120));
