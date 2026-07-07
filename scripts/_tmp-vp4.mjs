import fs from 'fs';

const gs = fs.readFileSync('src/phaser2/playable/game-scripts.min.js', 'utf8');

// Broader VP extract with surrounding context
let idx = 0;
let n = 0;
while ((idx = gs.indexOf('vpShowGroup({', idx + 1)) >= 0 && n < 30) {
  console.log(gs.slice(Math.max(0, idx - 120), idx + 120).replace(/\n/g, ' '));
  console.log('---');
  n++;
}

// initLayer - does it reorder children?
const il = gs.indexOf('initLayer=function');
console.log('\ninitLayer:', gs.slice(il, il + 600));

// EraseComponent onInit - child order
const oi = gs.indexOf('initIntegrateCustomJudgmentArea=function');
console.log('\ninitIntegrate (setChildIndex):', gs.slice(oi, oi + 400));
