/**
 * Phaser 2 微信运行时补丁（game.js require，CJS）。
 */
(function (g) {
  if (!g || g.__phaser2WxPatch) return;
  g.__phaser2WxPatch = true;

  // QC / PlaySmart 内置微信分支（跳过 DOM overlay、走 wx 资源与存储 API）
  g.__wx = true;

  g.__wxElementById = g.__wxElementById || {};

  g.registerWxElement = function (el) {
    if (el && el.id) g.__wxElementById[el.id] = el;
    return el;
  };

  g.__wxParentMap = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  g.__wxCanvasParent = null;

  g.setWxParent = function (node, parent) {
    if (!node) return;
    if (g.__wxParentMap) g.__wxParentMap.set(node, parent || null);
    try {
      node.parentNode = parent;
    } catch (e) {}
  };

  g.getWxParent = function (node) {
    if (!node) return null;
    var mapped = g.__wxParentMap ? g.__wxParentMap.get(node) : null;
    if (mapped) return mapped;
    try {
      if (node.parentNode) return node.parentNode;
    } catch (e) {}
    if (node === g.canvas || (g.window && node === g.window.canvas)) {
      return g.__wxCanvasParent;
    }
    return null;
  };

  g.linkCanvasParent = function (canvas, parent) {
    if (!canvas || !parent) return;
    g.__wxCanvasParent = parent;
    g.setWxParent(canvas, parent);
    if (parent.childNodes && parent.childNodes.indexOf(canvas) < 0) {
      parent.childNodes.push(canvas);
    }
  };

  function ensureCanvasStyle(canvas) {
    if (!canvas) return canvas;
    if (!canvas.style || typeof canvas.style !== 'object') {
      canvas.style = { width: '100%', height: '100%' };
    }
    return canvas;
  }

  if (g.canvas) ensureCanvasStyle(g.canvas);
  else if (g.window && g.window.canvas) ensureCanvasStyle(g.window.canvas);

  /**
   * 微信无浏览器 Web Audio 全局对象；用 wx.createWebAudioContext 对接 PlaySmart audioManager。
   */
  g.bootstrapWxWebAudio = function () {
    if (typeof wx === 'undefined' || g.__wxWebAudioDone) return;
    g.__wxWebAudioDone = true;

    if (typeof g.AudioBuffer === 'undefined') {
      g.AudioBuffer = function AudioBuffer() {};
    }

    if (typeof wx.createWebAudioContext === 'function') {
      var Factory = function WxAudioContext() {
        var ctx = wx.createWebAudioContext();
        if (ctx && typeof ctx.resume === 'function') {
          setTimeout(function () {
            try { ctx.resume(); } catch (e) {}
          }, 0);
        }
        return ctx;
      };
      g.AudioContext = Factory;
      g.webkitAudioContext = Factory;
      g.mozAudioContext = Factory;
      if (typeof globalThis !== 'undefined') {
        globalThis.AudioContext = Factory;
        globalThis.webkitAudioContext = Factory;
        globalThis.AudioBuffer = g.AudioBuffer;
      }
      if (typeof window !== 'undefined') {
        window.AudioContext = Factory;
        window.webkitAudioContext = Factory;
        window.AudioBuffer = g.AudioBuffer;
      }
      console.log('[phaser2] WebAudio via wx.createWebAudioContext');
    } else {
      console.warn('[phaser2] wx.createWebAudioContext 不可用，BGM 可能无声');
    }
  };

  /** 微信 Touch 只有 x/y，QC/Phaser 读 clientX/clientY → 擦除坐标 NaN */
  function normalizeTouchPoint(t) {
    if (!t) return t;
    if (t.clientX == null && t.x != null) t.clientX = t.x;
    if (t.clientY == null && t.y != null) t.clientY = t.y;
    if (t.pageX == null && t.x != null) t.pageX = t.x;
    if (t.pageY == null && t.y != null) t.pageY = t.y;
    if (t.identifier == null && t.id != null) t.identifier = t.id;
    return t;
  }

  function normalizeTouchEvent(ev) {
    if (!ev || !ev.type || ev.type.indexOf('touch') !== 0) return ev;
    var lists = ['touches', 'changedTouches', 'targetTouches'];
    for (var li = 0; li < lists.length; li++) {
      var list = ev[lists[li]];
      if (!list) continue;
      for (var i = 0; i < list.length; i++) normalizeTouchPoint(list[i]);
    }
    return ev;
  }

  /** 让 gameDiv 的 addEventListener 走 document 总线（QC 默认监听 parentNode） */
  g.proxyWxDomEvents = function (node) {
    if (!node || node.__wxDomProxy) return node;
    node.__wxDomProxy = true;
    var doc = typeof document !== 'undefined' ? document : null;
    if (!doc || typeof doc.addEventListener !== 'function') return node;
    node.addEventListener = function (type, listener) {
      doc.addEventListener(type, listener);
    };
    node.removeEventListener = function (type, listener) {
      if (doc.removeEventListener) doc.removeEventListener(type, listener);
    };
    return node;
  };

  /**
   * 微信 document.dispatchEvent 只读，不能覆盖；用最早注册的 listener 就地归一化坐标。
   */
  g.bootstrapWxTouchNormalize = function () {
    if (g.__wxTouchNormalize || typeof wx === 'undefined') return;
    g.__wxTouchNormalize = true;
    var doc = typeof document !== 'undefined' ? document : null;
    if (!doc || typeof doc.addEventListener !== 'function') return;
    var types = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
    for (var i = 0; i < types.length; i++) {
      (function (type) {
        doc.addEventListener(type, function (ev) {
          normalizeTouchEvent(ev);
        });
      })(types[i]);
    }
    console.log('[phaser2] touch normalize: x/y → clientX/clientY');
  };

  /**
   * Windows 开发者工具走鼠标时，合成 touch 事件喂给 QC Input。
   */
  g.bootstrapWxMouseBridge = function () {
    if (g.__wxMouseBridge || typeof wx === 'undefined') return;
    if (typeof wx.onMouseDown !== 'function') return;
    g.__wxMouseBridge = true;
    var doc = typeof document !== 'undefined' ? document : null;
    if (!doc || typeof doc.dispatchEvent !== 'function') return;

    var mouseId = 4096;
    var down = false;

    function synth(type, e) {
      var x = e.x != null ? e.x : e.clientX;
      var y = e.y != null ? e.y : e.clientY;
      if (x == null || y == null) return;
      var pt = { identifier: mouseId, x: x, y: y, clientX: x, clientY: y, pageX: x, pageY: y };
      var ev = {
        type: type,
        touches: down ? [pt] : [],
        changedTouches: [pt],
        targetTouches: down ? [pt] : [],
        preventDefault: function () {},
        stopPropagation: function () {},
      };
      doc.dispatchEvent(ev);
    }

    wx.onMouseDown(function (e) {
      down = true;
      synth('touchstart', e);
    });
    wx.onMouseMove(function (e) {
      if (!down) return;
      synth('touchmove', e);
    });
    wx.onMouseUp(function (e) {
      if (!down) return;
      down = false;
      synth('touchend', e);
    });
    console.log('[phaser2] mouse bridge → touch (devtools)');
  };

  /**
   * weapp-adapter 把触摸派发到 document，Phaser 2 监听 canvas。
   * 将 document 触摸转发到 canvas，保证 QC / Phaser 输入能收到。
   */
  g.bootstrapWxTouchBridge = function () {
    if (g.__wxTouchBridge || typeof wx === 'undefined') return;
    g.__wxTouchBridge = true;
    g.bootstrapWxTouchNormalize();
    g.bootstrapWxMouseBridge();
    var canvas = g.canvas || (g.window && g.window.canvas);
    var doc = typeof document !== 'undefined' ? document : null;
    if (!canvas || !doc || typeof doc.addEventListener !== 'function') return;
    var types = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
    for (var i = 0; i < types.length; i++) {
      (function (type) {
        doc.addEventListener(type, function (ev) {
          normalizeTouchEvent(ev);
          var parent = canvas.parentNode || g.__wxCanvasParent;
          if (parent && parent.dispatchEvent) {
            try {
              parent.dispatchEvent(ev);
            } catch (e) {}
          }
          if (canvas.dispatchEvent) {
            try {
              canvas.dispatchEvent(ev);
            } catch (e) {}
          }
        });
      })(types[i]);
    }
    console.log('[phaser2] touch bridge: document → canvas');
  };

  /** 游戏启动后：强制触控、禁止 visibility 误暂停 */
  g.bootstrapWxInputAfterGame = function () {
    if (g.__wxInputAfterGame) return;
    var game = g.qc_game;
    if (!game || !game.phaser || !game.phaser.isBooted) return;
    g.__wxInputAfterGame = true;
    var ph = game.phaser;
    var win = g.window || g;
    if (ph.device) ph.device.touch = true;
    if (ph.stage) ph.stage.disableVisibilityChange = true;
    if (game.input) {
      if (game.input.touch && game.input.touch.generator !== win) {
        game.input.touch.generator = win;
      }
      if (game.input.mouse && game.input.mouse.generator !== win) {
        game.input.mouse.generator = win;
      }
      if (game.input.touch && game.input.touch._setEnable) {
        game.input.touch._setEnable(true);
      }
      if (game.input.mouse && game.input.mouse._setEnable) {
        game.input.mouse._setEnable(true);
      }
    }
    console.log('[phaser2] input ready, touch:', !!(ph.device && ph.device.touch));
  };

  g.bootstrapWxLifecycle = function () {
    if (g.__wxLifecycle || typeof wx === 'undefined') return;
    g.__wxLifecycle = true;
    wx.onShow(function () {
      g.bootstrapWxInputAfterGame();
      var game = g.qc_game;
      if (game && game.phaser && game.phaser.isPaused) {
        try { game.phaser.paused = false; } catch (e) {}
      }
    });
    wx.onHide(function () {
      var game = g.qc_game;
      if (game && game.phaser && game.phaser.stage) {
        game.phaser.stage.disableVisibilityChange = true;
      }
    });
  };

  /** require 模块隔离后，把 PlaySmart 全局同步到 window（phaser xhr 钩子读 window.*） */
  g.syncPlayableGlobals = function () {
    var win = typeof window !== 'undefined' ? window : null;
    var keys = [
      'hasBase64', 'getAssestByKey', 'getAssestByUrl', 'getKeyByUrl',
      'assetsPackage', 'assetsBase64', 'ps', 'languagesMgr', 'qc_game', 'gameStart',
    ];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (typeof g[k] !== 'undefined' && win) win[k] = g[k];
      if (win && typeof win[k] !== 'undefined' && typeof g[k] === 'undefined') g[k] = win[k];
    }
  };

  /**
   * H5 试玩由广告 SDK 调 gameStart() 后才会 UIRoot.visible=true。
   * 微信开发者工具无 SDK，资源就绪后自动 gameStart。
   */
  g.bootstrapWxAutoGameStart = function () {
    if (typeof wx === 'undefined' || g.__wxAutoGameStartDone) return;
    var tries = 0;
    var poll = function () {
      tries++;
      g.syncPlayableGlobals();
      var psObj = g.ps;
      var gs = typeof g.gameStart === 'function' ? g.gameStart : null;
      if (psObj && psObj.hasReady && gs && !psObj.hasStart) {
        g.__wxAutoGameStartDone = true;
        try {
          gs();
          console.log('[phaser2] auto gameStart() — UIRoot 已显示');
        } catch (e) {
          console.error('[phaser2] auto gameStart failed', e);
        }
        g.bootstrapWxInputAfterGame();
        return;
      }
      if (g.qc_game && g.qc_game.phaser && g.qc_game.phaser.isBooted) {
        g.bootstrapWxInputAfterGame();
      }
      if (tries < 300) setTimeout(poll, 100);
    };
    setTimeout(poll, 300);
  };

  /** 注册微信侧缺失的全局 behaviour / 入口 */
  g.bootstrapPlayableWx = function () {
    g.bootstrapWxWebAudio();
    g.bootstrapWxTouchBridge();
    g.bootstrapWxLifecycle();
    var win = typeof window !== 'undefined' ? window : g;
    if (typeof g.gameStart === 'function') win.gameStart = g.gameStart;
    var qcApi = g.qc || (typeof qc !== 'undefined' ? qc : null);
    if (qcApi && !g.StartBeh) {
      var StartBeh = function (node) { qcApi.Behaviour.call(this, node); };
      StartBeh.prototype = Object.create(qcApi.Behaviour.prototype);
      StartBeh.prototype.constructor = StartBeh;
      qcApi.registerBehaviour('StartBeh', StartBeh);
      g.StartBeh = StartBeh;
      win.StartBeh = StartBeh;
    }
    g.bootstrapWxAutoGameStart();
  };

  var nativeFn = g.Function;
  var nativeWorks = false;

  if (typeof nativeFn === 'function') {
    try {
      nativeWorks = new nativeFn('return 1')() === 1;
    } catch (e1) {
      try {
        var t = nativeFn('return 1');
        nativeWorks = typeof t === 'function' && t() === 1;
      } catch (e2) {}
    }
  }

  if (nativeWorks) {
    g.Function = nativeFn;
    return;
  }

  var indirectEval = null;
  try {
    indirectEval = (0, eval);
    if (indirectEval('1+1') !== 2) indirectEval = null;
  } catch (e) {
    indirectEval = null;
  }

  if (indirectEval) {
    g.Function = function Function() {
      var args = Array.prototype.slice.call(arguments);
      var body = String(args.pop() || '');
      var params = args.join(',');
      var src = params
        ? '(function(' + params + '){' + body + '})'
        : '(function(){' + body + '})';
      return indirectEval(src);
    };
    console.log('[phaser2] Function polyfill via eval');
    return;
  }

  console.warn('[phaser2] Function/eval unavailable — PlaySmart 动态脚本可能受限');
})(typeof GameGlobal !== 'undefined' ? GameGlobal : typeof window !== 'undefined' ? window : this);
