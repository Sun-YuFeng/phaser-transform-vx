require('./js/libs/weapp-adapter.js');
require('./js/libs/dom-parser.js');

// 3.88 内嵌 Phaser：勿在此 wxSetupCanvas，由 Phaser 自己设 canvas 尺寸（见 WX_MIGRATION 5.3）
// 调试：GameGlobal.__WX_DEBUG_RESIZE__ = true  — scale resize 频率
// 调试：GameGlobal.__WX_DEBUG_INPUT__ = true   — 触摸是否命中 canvas

var bootPlayable = require('./js/playable/bundle.js');

function start() {
  bootPlayable(null);
}

requestAnimationFrame(function () {
  requestAnimationFrame(function () {
    setTimeout(start, 50);
  });
});
