import fs from 'fs';

const bin = fs.readFileSync(
  'sources/current/2026-06-30_163309_output/resource/scene/gamePlay.bin',
  'utf8',
);

for (const name of ['human_stain', 'human', 'human_acne', 'human_stubble', 'human_hair']) {
  const idx = bin.indexOf(`name\\":[7,\\"${name}\\"]`);
  if (idx < 0) continue;
  const c = bin.slice(idx, idx + 700);
  const tex = c.match(/texture\\":\\\[10,\\"([^\\"]+)/);
  console.log(name, 'tex=', tex?.[1]);
}

// EraseLayer script data - find eraseLayerType in __json
for (const id of [
  '6b734f96-8bc6-4181-ac89-a4ff1542ea5b',
  'b699005b-cb50-4630-a00f-4c86d92d46c3',
]) {
  const j = bin.indexOf(`"class\\":\\"ps.EraseLayer\\"`);
}
const layers = [];
let pos = 0;
while ((pos = bin.indexOf('"class\\":\\"ps.EraseLayer\\"', pos + 1)) >= 0) {
  const chunk = bin.slice(pos, pos + 500);
  const type = chunk.match(/eraseLayerType\\":\\\[3,(\d+)\\\]/);
  const uuid = chunk.match(/uuid\\":\\\[7,\\"([^\\"]+)\\"\]/);
  if (type) layers.push({ type: type[1], uuid: uuid?.[1] });
}
console.log('\nEraseLayer types:', layers.slice(0, 12));

const gs = fs.readFileSync('src/phaser2/playable/game-scripts.min.js', 'utf8');
const ei = gs.indexOf('EraseLayerType.MONGOLIAN');
console.log('\nEnum context:', gs.slice(ei - 200, ei + 350));
