import fs from 'fs';

const gs = fs.readFileSync('src/phaser2/playable/game-scripts.min.js', 'utf8');
const showTrue = (gs.match(/vpShowGroup\(\{actionGroup:"[^"]+",isShow:true\}\)/g) || []);
const showFalse = (gs.match(/vpShowGroup\(\{actionGroup:"[^"]+",isShow:false\}\)/g) || []);
console.log('vpShowGroup true:', showTrue.length, showTrue);
console.log('vpShowGroup false:', showFalse.length);

// vpShowHide for groups?
const showHide = (gs.match(/vpShowHide\(\{isShow:(true|false)\}\)/g) || []);
console.log('vpShowHide:', showHide.slice(0, 10));

// gamePlay scene - child order under gamePlay node for face related
const bin = fs.readFileSync(
  'sources/current/2026-06-30_163309_output/resource/scene/gamePlay.bin',
  'utf8',
);
// bottomImages group uuid - find its index among siblings if possible
console.log('\nAll three erase groups default visible=true in scene (from earlier parse)');
