import fs from 'fs';

const bin = fs.readFileSync(
  'sources/current/2026-06-30_163309_output/resource/scene/gamePlay.bin',
  'utf8',
);

console.log('--- bottomImages / EraseComponent ---');
console.log(bin.slice(bin.indexOf('bottomImages'), bin.indexOf('bottomImages') + 600));

for (const n of ['human_stain', 'human', 'human_acne']) {
  const key = `"name":[7,"${n}"]`;
  const idx = bin.indexOf(key.replace(/"/g, '\\"'));
  if (idx < 0) {
    console.log(n, 'not found');
    continue;
  }
  const chunk = bin.slice(idx, idx + 1500);
  const elt = chunk.match(/eraseLayerType\\":\\\[3,(\d+)\\\]/);
  const tex = chunk.match(/texture\\":\\\[7,\\"([^\\"]+)\\"\]/);
  const vis = chunk.match(/visible\\":\\\[5,(true|false)\]/);
  console.log(n, {
    eraseLayerType: elt?.[1],
    texture: tex?.[1],
    visible: vis?.[1],
  });
}

// VP timeline: vpShowGroup isShow for erase groups at scene1/mainStart
const ids = {
  First_erase: 'c9aa75c0-a083-4b07-a8f3-97f57865902a',
  second_erase: 'b8d437b2-6ac1-4469-a163-dc0ed15772d5',
  third_erase: '63ceefac-6a30-4075-8230-33fad52ed2c3',
};
console.log('\n--- VP vpShowGroup ---');
for (const [name, id] of Object.entries(ids)) {
  let idx = 0;
  while ((idx = bin.indexOf(id, idx + 1)) >= 0) {
    const chunk = bin.slice(Math.max(0, idx - 300), idx + 250);
    if (!chunk.includes('vpShowGroup')) continue;
    const show = chunk.match(/isShow\\":\\\[5,(true|false)\]/);
    const label = chunk.match(/paramLabelUI\\":\\"([^\\"]+)\\"/);
    console.log(name, label?.[1] || '?', 'isShow', show?.[1]);
  }
}

// Compare original vs sanitized deploy
import { sanitizeGameScriptsForWx } from './phaser2-wx-sanitize.mjs';
const raw = fs.readFileSync('src/phaser2/playable/game-scripts.min.js', 'utf8');
const wx = sanitizeGameScriptsForWx(raw);
console.log('\n--- H5 deploy order ---');
console.log('H5 loadTexture BEFORE draw:', raw.includes('loadTexture(this._bmd);t.forEach(function(t){e.draw(t)})'));
console.log('WX loadTexture AFTER draw:', wx.includes('t.forEach(function(t){e.draw(t)});if(typeof wx'));
console.log('WX skip onInit deploy:', wx.includes('_wxDeployChildLayers=[this];return}this.deploy'));
