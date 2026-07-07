import fs from 'fs';

const bin = fs.readFileSync(
  'sources/current/2026-06-30_163309_output/resource/scene/gamePlay.bin',
  'utf8',
);

// Erase Component1 uuid
const ecUuid = '65094db0-646b-40e2-9a42-910ad9d9debf';
const idx = bin.indexOf(ecUuid);
const chunk = bin.slice(idx, idx + 8000);

// Extract child names in order under Erase Component
const childNames = [...chunk.matchAll(/name\\":\\\[7,\\"([^\\"]+)\\"\]/g)].map((m) => m[1]);
console.log('Nodes near EraseComponent (first 25 names):');
console.log(childNames.slice(0, 25));

// bottomImages vs customLayerGroup refs on main EraseComponent config
const cfg = bin.indexOf('bottomImages\\":[18,\\"4c9c7046');
console.log('\nEraseComponent config snippet:');
console.log(bin.slice(cfg, cfg + 500));

// Find bottomImages group children
const bottomUuid = '4c9c7046-c6cf-4b29-958b-0a870c9147ee';
let bi = 0;
while ((bi = bin.indexOf(bottomUuid, bi + 1)) >= 0) {
  const c = bin.slice(bi, bi + 1500);
  if (c.includes('bottomImages') || c.includes('human')) {
    const names = [...c.matchAll(/name\\":\\\[7,\\"([^\\"]+)\\"\]/g)].map((m) => m[1]);
    if (names.includes('human') || names.length > 2) {
      console.log('\nbottomImages group child names:', names.slice(0, 10));
      break;
    }
  }
}

// First_erase children order
const fe = bin.indexOf('name\\":[7,\\"First_erase\\"]');
const feChunk = bin.slice(fe, fe + 4000);
const feChildren = [...feChunk.matchAll(/name\\":\\\[7,\\"([^\\"]+)\\"\]/g)].map((m) => m[1]);
console.log('\nFirst_erase subtree names (order):', feChildren.slice(0, 15));

// Compare visible defaults for groups
for (const g of ['First_erase', 'second_erase', 'third_erase', 'human_stain', 'human']) {
  const gi = bin.indexOf(`name\\":[7,\\"${g}\\"]`);
  const vis = bin.slice(gi, gi + 300).match(/visible\\":\\\[5,(true|false)\]/);
  console.log(g, 'visible=', vis?.[1]);
}
