import fs from 'fs';

const gs = fs.readFileSync('src/phaser2/playable/game-scripts.min.js', 'utf8');
const re = /vpShowGroup\(\{actionGroup:"([a-f0-9-]+)",isShow:(true|false)\}\)/g;
const names = {
  c9aa75c0: 'First_erase',
  b8d437b2: 'second_erase',
  '63ceefac': 'third_erase',
  '4c9c7046': 'bottomImages',
  d6859ee0: 'maskImages',
};
console.log('VP vpShowGroup calls:');
let m;
while ((m = re.exec(gs))) {
  const prefix = m[1].slice(0, 8);
  console.log(names[prefix] || prefix, 'isShow=' + m[2]);
}

const bin = fs.readFileSync(
  'sources/current/2026-06-30_163309_output/resource/scene/gamePlay.bin',
  'utf8',
);

// Erase parent structure: search bottomImages uuid and list siblings
const bottomId = '4c9c7046-c6cf-4b29-958b-0a870c9147ee';
const firstId = 'c9aa75c0-a083-4b07-a8f3-97f57865902a';
const stainTex = 'image_31508ab01d';

console.log('\nScene default visible for key nodes:');
for (const label of ['First_erase', 'second_erase', 'third_erase', 'human_stain', 'human']) {
  const key = `name\\\\":[7,\\\\"${label}\\\\"]`;
  const i = bin.indexOf(key);
  if (i < 0) {
    console.log(label, 'not found');
    continue;
  }
  const vis = bin.slice(i, i + 250).match(/visible\\\\":\\\\\[5,(true|false)/);
  console.log(label, vis ? vis[1] : '?');
}

// Z-order hint: children array order in EraseComponent - find customLayerGroup before/after bottomImages in JSON
const ecCfg = bin.indexOf('bottomImages\\\\":[18,\\\\"4c9c7046');
console.log('\nComponent field order (bottom vs custom):');
console.log(bin.slice(ecCfg - 80, ecCfg + 350));
