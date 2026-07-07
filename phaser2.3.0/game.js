import './js/libs/weapp-adapter.js';
require('./js/libs/phaser2-wx-patch.js');

var g = typeof GameGlobal !== 'undefined' ? GameGlobal : window;
g.__wx = true;
if (g.canvas == null && typeof GameGlobal !== 'undefined') {
  g.canvas = GameGlobal.canvas;
  g.window = g.window || g;
  g.window.canvas = g.canvas;
}

if (typeof g.bootstrapGameDiv === 'function') {
  g.bootstrapGameDiv();
}

require('./js/main.js');

if (typeof g.bootstrapPlayableWx === 'function') {
  g.bootstrapPlayableWx();
}

function bootQici() {
  if (g.__wxQiciInited) return;
  var q = g.qici;
  if (!q && typeof qici !== 'undefined') q = qici;
  if (!q || typeof q.init !== 'function') {
    console.error('[phaser2] qici.init not found after main.js');
    return;
  }
  g.__wxQiciInited = true;
  try {
    q.init();
    console.log('[phaser2] qici.init()');
  } catch (e) {
    console.error('[phaser2] qici.init failed', e);
  }
}

bootQici();

function waitGameStart() {
  var tries = 0;
  var poll = function () {
    tries++;
    var ps = g.ps;
    if (typeof g.gameStart === 'function' && ps && ps.hasReady && !ps.hasStart) {
      try {
        g.gameStart();
        console.log('[phaser2] gameStart() via waitGameStart');
      } catch (e) {
        console.error('[phaser2] waitGameStart', e);
      }
      return;
    }
    if (tries < 400) setTimeout(poll, 100);
  };
  setTimeout(poll, 500);
}

waitGameStart();

wx.setEnableDebug({
  enableDebug: false,
});
