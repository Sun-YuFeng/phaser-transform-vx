import fs from 'fs';
const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];
const preloadIdx = bundle.indexOf('preload(){');
const preloadEnd = bundle.indexOf('create(){', preloadIdx);
const preload = bundle.slice(preloadIdx, preloadEnd);

// every load.image in preload
const loads = [...preload.matchAll(/this\.load\.image\(([^,]+),([^)]+)\)/g)];
console.log('preload load.image count:', loads.length);
for (const m of loads) {
  const key = m[1].trim();
  const val = m[2].trim().slice(0, 50);
  if (val.includes('data:') || key.includes('[') || key.includes('.') || key === 't') {
    console.log(`  KEY=${key} VAL=${val}...`);
  }
}

// Vt
const vi = bundle.indexOf('Vt={');
console.log('\nVt:', bundle.slice(vi, vi + 300));

// Wt array full
const wi = bundle.indexOf('Wt=["');
console.log('\nWt:', bundle.slice(wi, wi + 200));

// Xt, Z for bathroom bubble dress
const preloadXt = preload.match(/load\.image\(Xt,[^)]+\)/)?.[0];
console.log('\nXt load:', preloadXt);

// Gt.top load
const gtTop = preload.match(/load\.image\(Gt\.top,[^)]+\)/)?.[0];
console.log('\nGt.top:', gtTop);

// all Gt loads
for (const m of preload.matchAll(/load\.image\(Gt\.\w+,[^)]+\)/g)) {
  console.log(' ', m[0].slice(0, 90));
}

// all Ee loads  
for (const m of preload.matchAll(/load\.image\(Ee\.\w+,[^)]+\)/g)) {
  console.log(' ', m[0].slice(0, 90));
}
