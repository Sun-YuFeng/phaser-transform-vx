import fs from 'fs';
const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];

// find preload function - search for Gt.top context with more range
const pi = bundle.indexOf('load.image(Gt.top,j)');
const chunk = bundle.slice(pi - 2000, pi + 800);
// find j= and Z= assignments with data URLs in this chunk
for (const m of chunk.matchAll(/([,;])(j|Z)="(data:image[^"]+)"/g)) {
  console.log(m[2], 'len', m[3].length, 'start', m[3].slice(0, 60));
}

// Also search for const j= pattern in wider range
const wider = bundle.slice(pi - 5000, pi + 500);
const jm = wider.match(/j="(data:image\/webp;base64,[^"]+)"/);
const zm = wider.match(/Z="(data:image\/webp;base64,[^"]+)"/);
console.log('\nj found:', !!jm, jm?.[1]?.slice(0, 80));
console.log('Z found:', !!zm, zm?.[1]?.slice(0, 80));

// What is Je function - for Vt load
const je = bundle.match(/function Je\([^)]*\)\{[^}]{0,200}/);
console.log('\nJe:', je?.[0]);

// Find Je definition
const jeIdx = bundle.indexOf('function Je(');
if (jeIdx >= 0) console.log('Je full:', bundle.slice(jeIdx, jeIdx + 400));
