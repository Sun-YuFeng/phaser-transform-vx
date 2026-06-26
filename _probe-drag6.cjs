const fs = require('fs');
const gs = fs.readFileSync('src/phaser2/playable/game-scripts.min.js', 'utf8');
// DraggableItem onStart onAwake interactive
const i = gs.indexOf('registerBehaviour("ps.DraggableItem"');
console.log('reg', i);
const j = gs.lastIndexOf('t.prototype.on', i);
// find prototype methods for DraggableItem
const start = gs.indexOf('s.DraggableItem');
const classStart = gs.lastIndexOf('var t=function(i){__extends(t,i);function t(t){var e=i.call(this,t)||this;e.itemEvent', start - 5000);
console.log(gs.slice(classStart, classStart + 8000));
