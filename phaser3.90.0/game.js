require('./js/libs/weapp-adapter.js');

if (typeof GameGlobal.wxSetupCanvas === 'function') {
  GameGlobal.wxSetupCanvas(window.canvas);
}

var bootPlayable = require('./js/playable/bundle.js');

function start() {
  bootPlayable(null);
}

requestAnimationFrame(function () {
  requestAnimationFrame(function () {
    setTimeout(start, 50);
  });
});
