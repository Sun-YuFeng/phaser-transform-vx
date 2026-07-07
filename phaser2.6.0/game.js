import './js/libs/weapp-adapter.js';
require('./js/libs/phaser2-wx-patch.js');

var g = typeof GameGlobal !== 'undefined' ? GameGlobal : window;
g.__wx = true;
g.__wxG = g;
/** Phaser 2.6：adapter 已把 canvas.addEventListener 转到 document，勿再 forward canvas.dispatchEvent */
g.__wxPhaser26DocumentTouch = true;
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

function bootAppLovinPlayable() {
  if (!(g.__wxPhaser26Booted || window.__wxPhaser26Booted)) {
    if (typeof window.onload === 'function') {
      try {
        window.onload();
        console.log('[phaser26] window.onload()');
      } catch (e) {
        console.error('[phaser26] window.onload failed', e);
      }
    } else {
      console.error('[phaser26] window.onload not found after main.js');
    }
  }
  if (typeof g.schedulePhaser26AfterBoot === 'function') {
    g.schedulePhaser26AfterBoot();
  } else if (typeof g.bootstrapPhaser26AfterBoot === 'function') {
    g.bootstrapPhaser26AfterBoot();
  }
}

setTimeout(bootAppLovinPlayable, 150);

wx.setEnableDebug({
  enableDebug: false,
});
