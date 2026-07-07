import fs from 'fs';

const bin = fs.readFileSync(
  'sources/current/2026-06-30_163309_output/resource/scene/gamePlay.bin',
  'utf8',
);

// EraseLayer script data for stain
for (const id of [
  '6b734f96-8bc6-4181-ac89-a4ff1542ea5b', // human_stain EraseLayer
  'b699005b-cb50-4630', // partial - find full
]) {
  const i = bin.indexOf(id);
  if (i >= 0) console.log('\nEraseLayer data', id, bin.slice(i, i + 350));
}

// Find all EraseLayer eraseLayerType in __json section
const re = /"class":"ps\.EraseLayer"[^}]+eraseLayerType\\":\\\[3,(\d+)\\\][^}]+uuid\\":\\\[7,\\"([^\\"]+)\\"\]/g;
let m;
const layers = [];
while ((m = re.exec(bin))) layers.push({ type: m[1], uuid: m[2] });
console.log('\nEraseLayer types count', layers.length);
console.log(layers.slice(0, 15));

// human bottom texture
for (const term of ['human\\"],\\"uniqueName', '4c9c7046-c6cf-4b29-958b-0a870c9147ee']) {
  const i = bin.indexOf(term.includes('4c9c') ? term : 'name\\":[7,\\"human\\"]');
}
let idx = 0;
while ((idx = bin.indexOf('name\\":[7,\\"human\\"]', idx + 1)) >= 0) {
  const c = bin.slice(idx, idx + 600);
  if (c.includes('texture')) {
    console.log('\nhuman node:', c.match(/texture\\":\\\[10,\\"([^\\"]+)/)?.[1]);
    console.log('position', c.match(/position\\":\\\[([^\]]+)\]/)?.[1]?.slice(0, 80));
  }
}

// First_erase children order
const fe = bin.indexOf('name\\":[7,\\"First_erase\\"]');
console.log('\nFirst_erase context:', bin.slice(fe, fe + 2000).match(/name\\":\\\[7,\\"[^\\"]+\\"\]/g)?.slice(0, 20));

// VP at game start - search scene1 onStart actions
for (const term of ['sendPSScenescene1', 'mainStart', 'onStart']) {
  let i = 0,
    n = 0;
  while ((i = bin.indexOf(term, i + 1)) >= 0 && n < 2) {
    console.log('\nVP term', term, bin.slice(i, i + 200));
    n++;
  }
}

// Multiple EraseComponents - customLayerGroup config
const ec = bin.indexOf('65094db0-646b-40e2-9a42-910ad9d9debf');
console.log('\nEraseComponent uuid context:', bin.slice(ec - 50, ec + 400));
