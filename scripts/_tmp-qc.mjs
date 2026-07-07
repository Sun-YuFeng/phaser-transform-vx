import fs from 'fs';

const c = fs.readFileSync('src/phaser2/lib/qc-core-min.js', 'utf8');

const patterns = ['atlas.img', 'get atlas', 'atlas:{', 'assets._cache', 'addImage('];
for (const p of patterns) {
  const i = c.indexOf(p);
  if (i >= 0) console.log(p, '->', c.slice(Math.max(0, i - 40), i + 120).replace(/\n/g, ' '));
}

// UIImage texture setter
const u = c.indexOf('UIImage.prototype');
console.log('\nUIImage', c.slice(u, u + 500));
