require('./js/libs/weapp-adapter.js');
require('./js/libs/phaser2-wx-patch.js');

if (typeof GameGlobal.bootstrapWxTouchBridge === 'function') {
  GameGlobal.bootstrapWxTouchBridge();
}
if (typeof GameGlobal.bootstrapWxWebAudio === 'function') {
  GameGlobal.bootstrapWxWebAudio();
}

if (typeof GameGlobal.wxSetupCanvas === 'function') {
  GameGlobal.wxSetupCanvas(window.canvas);
}

console.log('[phaser2] adapter OK, canvas:', !!window.canvas, window.canvas && window.canvas.width);

// MW 配置 + 游戏容器（QC 引擎需要 #gameDiv）
require('./js/playable/mw-config.js');

if (!document.getElementById('gameDiv')) {
  var gameDiv = document.createElement('div');
  gameDiv.id = 'gameDiv';
  gameDiv.style.width = '100%';
  gameDiv.style.height = '100%';
  if (typeof GameGlobal.proxyWxDomEvents === 'function') {
    GameGlobal.proxyWxDomEvents(gameDiv);
  }
  if (typeof GameGlobal.registerWxElement === 'function') {
    GameGlobal.registerWxElement(gameDiv);
  } else if (typeof GameGlobal.__wxElementById === 'object') {
    GameGlobal.__wxElementById.gameDiv = gameDiv;
  }
  document.body.appendChild(gameDiv);
}

if (window.canvas) {
  var canvasParent = document.getElementById('gameDiv');
  if (canvasParent && typeof GameGlobal.linkCanvasParent === 'function') {
    GameGlobal.linkCanvasParent(window.canvas, canvasParent);
  } else if (canvasParent) {
    GameGlobal.__wxCanvasParent = canvasParent;
    if (canvasParent.childNodes.indexOf(window.canvas) < 0) {
      canvasParent.childNodes.push(window.canvas);
    }
  }
}

var lib = './js/playable/lib/';
var scr = './js/playable/scripts/';

require(lib + 'phaser.min.js');
console.log('[phaser2] Phaser', typeof Phaser !== 'undefined' ? Phaser.VERSION : 'MISSING');

require(lib + 'webfontloader.js');
require(lib + 'qc-core-min.js');
require(lib + 'qc-webgl.js');
console.log('[phaser2] qc', typeof qc !== 'undefined' ? 'OK' : 'MISSING');

require(scr + 'globalUrlMap.js');
require(lib + 'PlaySmartEditorData.js');
require(scr + 'picDesc.js');
require(scr + 'data.js');
require(scr + 'resource-loader.js');
require(scr + 'resource_loader.js');
require(scr + 'assetCountMap.js');
require(scr + 'game-scripts.min.js');
require(lib + 'qc-loading-debug.js');
require(lib + 'languagesMgr.js');

if (typeof GameGlobal.syncPlayableGlobals === 'function') {
  GameGlobal.syncPlayableGlobals();
}
if (typeof GameGlobal.bootstrapPlayableWx === 'function') {
  GameGlobal.bootstrapPlayableWx();
}

console.log(
  '[phaser2] scripts loaded, qici:',
  typeof window.qici !== 'undefined',
  'gameStart:',
  typeof GameGlobal.gameStart,
);

function startGame() {
  var q = typeof qici !== 'undefined' ? qici : window.qici;
  if (q && q.init) {
    q.init();
    console.log('[phaser2] qici.init() called');
  } else {
    console.error('[phaser2] qici.init missing');
  }
}

requestAnimationFrame(function () {
  requestAnimationFrame(function () {
    setTimeout(startGame, 50);
  });
});
