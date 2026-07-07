import fs from 'fs';
const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];

function extractObj(name) {
  const start = bundle.indexOf(`${name}={`);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + name.length + 1; i < start + 50000; i++) {
    if (bundle[i] === '{') depth++;
    if (bundle[i] === '}') {
      depth--;
      if (depth === 0) return bundle.slice(start, i + 1);
    }
  }
  return null;
}

for (const name of ['Wt', 'Gt', 'Ee', 'Vt']) {
  const obj = extractObj(name);
  console.log(`\n=== ${name} ===`);
  if (!obj) {
    console.log('not found');
    continue;
  }
  console.log(obj.slice(0, 500));
  const dataUrls = (obj.match(/data:image/g) || []).length;
  console.log('data:image count:', dataUrls);
  const keys = [...obj.matchAll(/([a-zA-Z0-9_]+):"/g)].map((m) => m[1]);
  console.log('keys:', keys.slice(0, 20));
}

// Xt and Z
const zi = bundle.indexOf('Xt="');
console.log('\nXt def:', bundle.slice(zi, zi + 80));
const zDef = bundle.match(/,Z=C\+p/);
console.log('Z=C+p near:', bundle.slice(zDef?.index - 50, zDef?.index + 80));

// load.image patterns not yet externalized
const patterns = [
  /load\.image\(Wt\[\d+\],"data:image\/[^"]+"\)/g,
  /load\.image\(Gt\.\w+,"data:image\/[^"]+"\)/g,
  /load\.image\(Ee\.\w+,"data:image\/[^"]+"\)/g,
  /load\.image\(\w+,"data:image\/[^"]+"\)/g,
];
for (const re of patterns) {
  const m = bundle.match(re);
  if (m) console.log('\npattern', re.source.slice(0, 40), ':', m.length, m[0]?.slice(0, 60));
}
