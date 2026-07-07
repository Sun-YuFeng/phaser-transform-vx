import fs from 'fs';

const bin = fs.readFileSync(
  'sources/current/2026-06-30_163309_output/resource/scene/gamePlay.bin',
  'utf8',
);

const names = [
  'First_erase',
  'second_erase',
  'third_erase',
  'human',
  'human_stain',
  'human_acne',
  'human_stubble',
  'human_hair',
  'bottomImages',
  'maskImages',
  'EraseComponent',
  'EraseGroup',
  'eraseGroupType',
  'eraseLayerType',
];

for (const n of names) {
  let idx = 0;
  let c = 0;
  while ((idx = bin.indexOf(n, idx + 1)) >= 0 && c < 3) {
    const chunk = bin.slice(Math.max(0, idx - 80), idx + 400);
    if (chunk.includes('visible') || chunk.includes('name') || n.includes('erase')) {
      console.log('\n===', n, 'hit', c, '===');
      console.log(chunk.replace(/\\n/g, ' ').slice(0, 450));
    }
    c++;
  }
}

// VP timeline for erase groups at start
const groups = {
  First_erase: 'c9aa75c0-a083-4b07-a8f3-97f57865902a',
  second_erase: 'b8d437b2-6ac1-4469-a163-dc0ed15772d5',
  third_erase: '63ceefac-6a30-4075-8230-33fad52ed2c3',
  bottom: '4c9c7046-c6cf-4b29-958b-0a870c9147ee',
  mask: 'd6859ee0-6524-4c14-93a3-c04ade8b7da1',
};

console.log('\n--- VP isShow per group ---');
for (const [name, id] of Object.entries(groups)) {
  let idx = 0;
  while ((idx = bin.indexOf(id, idx + 1)) >= 0) {
    const chunk = bin.slice(Math.max(0, idx - 250), idx + 200);
    if (chunk.includes('vpShowGroup') || chunk.includes('isShow')) {
      const show = chunk.match(/isShow\\\":\\\[5,(true|false)/);
      console.log(name, show ? show[1] : chunk.slice(0, 120));
    }
  }
}
