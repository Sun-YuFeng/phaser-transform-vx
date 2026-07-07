/**
 * Phaser 2 微信运行时补丁（game.js require，CJS）。
 */
(function (g) {
  if (!g || g.__phaser2WxPatch) return;
  g.__phaser2WxPatch = true;

  // 微信无 CustomEvent，pl-adapter / PlaySmart 事件总线依赖
  if (typeof g.CustomEvent === 'undefined') {
    g.CustomEvent = function CustomEvent(type, params) {
      params = params || {};
      var ev = {
        type: String(type),
        detail: params.detail,
        bubbles: !!params.bubbles,
        cancelable: !!params.cancelable,
        preventDefault: function () {},
        stopPropagation: function () {},
      };
      if (typeof document !== 'undefined' && document.createEvent) {
        try {
          var domEv = document.createEvent('Event');
          domEv.initEvent(type, ev.bubbles, ev.cancelable);
          domEv.detail = params.detail;
          return domEv;
        } catch (e) {}
      }
      return ev;
    };
    if (typeof globalThis !== 'undefined') globalThis.CustomEvent = g.CustomEvent;
    if (typeof window !== 'undefined') window.CustomEvent = g.CustomEvent;
  }

  // QC / PlaySmart 内置微信分支（跳过 DOM overlay、走 wx 资源与存储 API）
  g.__wx = true;

  // weapp-adapter 的 document 无 focus，QC Keyboard.gainFocus 会抛错
  if (typeof document !== 'undefined' && typeof document.focus !== 'function') {
    document.focus = function () {};
  }
  if (g.canvas && typeof g.canvas.focus !== 'function') {
    g.canvas.focus = function () {};
  }

  // 微信无 window.scrollTo；Phaser ScaleManager.scrollTop 每帧调用会刷屏报错
  if (typeof g.scrollTo !== 'function') {
    g.scrollTo = function () {};
  }

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

  /** style/link 等节点需 setAttribute/removeAttribute，否则 pl-adapter css 注入崩溃 */
  g.bootstrapWxDomCreateElement = function () {
    if (g.__wxDomCreatePatched || typeof document === 'undefined') return;
    var doc = document;
    if (!doc || typeof doc.createElement !== 'function') return;
    g.__wxDomCreatePatched = true;
    var orig = doc.createElement.bind(doc);
    function makeDomEl(tag) {
      var el = {
        tagName: String(tag || '').toUpperCase(),
        type: '',
        style: {},
        childNodes: [],
        parentNode: null,
        innerHTML: '',
        innerText: '',
        setAttribute: function (k, v) {
          this[k] = v;
        },
        removeAttribute: function (k) {
          delete this[k];
        },
        appendChild: function (c) {
          if (c) {
            c.parentNode = this;
            this.childNodes.push(c);
          }
          return c;
        },
        removeChild: function (c) {
          var i = this.childNodes.indexOf(c);
          if (i >= 0) this.childNodes.splice(i, 1);
          if (c) c.parentNode = null;
          return c;
        },
        insertBefore: function (c, ref) {
          return this.appendChild(c);
        },
        addEventListener: function () {},
        removeEventListener: function () {},
      };
      if (tag === 'style') {
        el.styleSheet = { cssText: '' };
      }
      return el;
    }
    doc.createElement = function (tag) {
      var t = String(tag || '').toLowerCase();
      if (t === 'style' || t === 'link') return makeDomEl(t);
      try {
        return orig(tag);
      } catch (e) {
        return makeDomEl(t);
      }
    };
    if (!doc.head) doc.head = makeDomEl('head');
    if (!doc.body) doc.body = makeDomEl('body');
  };
  g.bootstrapWxDomCreateElement();

  /** 微信 canvas / 垫片节点可能不是 adapter Node，放宽 appendChild */
  g.wxDomAppend = function (parent, child, before) {
    if (!parent || !child) return child;
    if (before && typeof parent.insertBefore === 'function') {
      try {
        parent.insertBefore(child, before);
        return child;
      } catch (e) {}
    }
    if (typeof parent.appendChild === 'function') {
      try {
        parent.appendChild(child);
        return child;
      } catch (e) {}
    }
    parent.childNodes = parent.childNodes || [];
    if (parent.childNodes.indexOf(child) < 0) parent.childNodes.push(child);
    try {
      child.parentNode = parent;
    } catch (e2) {}
    if (g.setWxParent) g.setWxParent(child, parent);
    return child;
  };

  g.bootstrapWxNodeAppendChild = function () {
    if (g.__wxNodeAppendPatched || typeof document === 'undefined') return;
    var sample;
    try {
      sample = document.createElement('div');
    } catch (e) {
      return;
    }
    if (!sample) return;
    var proto = Object.getPrototypeOf(sample);
    while (proto && typeof proto.appendChild !== 'function') {
      proto = Object.getPrototypeOf(proto);
    }
    if (!proto || proto.__wxAppendChildPatched) return;
    var orig = proto.appendChild;
    proto.appendChild = function (node) {
      if (node == null) return node;
      try {
        return orig.call(this, node);
      } catch (e) {
        var msg = String(e && e.message ? e.message : e);
        if (msg.indexOf('appendChild') < 0 && msg.indexOf('Node') < 0) throw e;
        this.childNodes = this.childNodes || [];
        if (this.childNodes.indexOf(node) < 0) this.childNodes.push(node);
        try {
          node.parentNode = this;
        } catch (e2) {}
        return node;
      }
    };
    proto.__wxAppendChildPatched = true;
    g.__wxNodeAppendPatched = true;
  };

  g.bootstrapWxGetElementById = function () {
    if (g.__wxGetElementByIdPatched || typeof document === 'undefined') return;
    var doc = document;
    if (!doc || typeof doc.getElementById !== 'function') return;
    g.__wxGetElementByIdPatched = true;
    var orig = doc.getElementById.bind(doc);
    doc.getElementById = function (id) {
      if (g.__wxElementById && g.__wxElementById[id]) return g.__wxElementById[id];
      return orig(id);
    };
  };

  g.bootstrapGameDiv = function () {
    if (g.__wxGameDivDone || typeof document === 'undefined') return;
    g.__wxGameDivDone = true;
    g.bootstrapWxNodeAppendChild();
    g.bootstrapWxGetElementById();
    var gameDiv = document.createElement('div');
    gameDiv.id = 'gameDiv';
    gameDiv.style.width = '100%';
    gameDiv.style.height = '100%';
    gameDiv.style.position = 'relative';
    g.registerWxElement(gameDiv);
    g.proxyWxDomEvents(gameDiv);
    if (document.body) g.wxDomAppend(document.body, gameDiv);
    if (g.canvas) g.linkCanvasParent(g.canvas, gameDiv);
    console.log('[phaser2] gameDiv ready');
  };

  g.bootstrapWxNodeAppendChild();
  g.bootstrapWxGetElementById();

  if (typeof document !== 'undefined') {
    try {
      if (document.referrer == null) {
        Object.defineProperty(document, 'referrer', {
          get: function () { return ''; },
          configurable: true,
        });
      }
    } catch (e) {
      try { document.referrer = ''; } catch (e2) {}
    }
  }

  /**
   * 微信无浏览器 Web Audio 全局对象；用 wx.createWebAudioContext 对接 PlaySmart audioManager。
   */
  g.bootstrapWxWebAudio = function () {
    if (g.__wxWebAudioDone) return;
    g.__wxWebAudioDone = true;

    function noopGain() {
      return {
        gain: { value: 1 },
        connect: function () {},
        disconnect: function () {},
      };
    }

    function stubAudioContext() {
      return {
        destination: noopGain(),
        createGain: noopGain,
        createGainNode: noopGain,
        createBufferSource: function () {
          return {
            connect: function () {},
            disconnect: function () {},
            start: function () {},
            stop: function () {},
            buffer: null,
            loop: false,
            onended: null,
          };
        },
        decodeAudioData: function (_buf, ok, fail) {
          if (typeof ok === 'function') {
            setTimeout(function () {
              try { ok({ length: 0, numberOfChannels: 0, sampleRate: 44100 }); } catch (e) {}
            }, 0);
          }
          return undefined;
        },
        suspend: function () {
          return Promise.resolve();
        },
        resume: function () {
          return Promise.resolve();
        },
        close: function () {
          return Promise.resolve();
        },
        sampleRate: 44100,
        currentTime: 0,
      };
    }

    if (typeof g.AudioBuffer === 'undefined') {
      g.AudioBuffer = function AudioBuffer() {};
    }

    var Factory;
    if (typeof wx !== 'undefined' && typeof wx.createWebAudioContext === 'function') {
      function patchWxAudioContext(ctx) {
        if (!ctx || ctx.__wxAudioPatched) return ctx;
        ctx.__wxAudioPatched = true;
        if (typeof ctx.decodeAudioData === 'function') {
          var origDecode = ctx.decodeAudioData.bind(ctx);
          ctx.decodeAudioData = function (arrayBuffer, successCallback, errorCallback) {
            try {
              var ret = origDecode(arrayBuffer, successCallback, errorCallback);
              // 微信同步返回 WXAudioBuffer（非 Promise）；PlaySmart 会对返回值 .catch()
              if (ret && typeof ret.then === 'function') return ret;
              return undefined;
            } catch (err) {
              if (typeof errorCallback === 'function') {
                try { errorCallback(err); } catch (e2) {}
              }
              return undefined;
            }
          };
        }
        return ctx;
      }

      Factory = function WxAudioContext() {
        try {
          var ctx = wx.createWebAudioContext();
          if (ctx && typeof ctx.createGain === 'function') {
            patchWxAudioContext(ctx);
            if (typeof ctx.resume === 'function') {
              setTimeout(function () {
                try { ctx.resume(); } catch (e) {}
              }, 0);
            }
            return ctx;
          }
        } catch (e) {
          console.warn('[phaser2] createWebAudioContext failed', e);
        }
        return stubAudioContext();
      };
      console.log('[phaser2] WebAudio via wx.createWebAudioContext');
    } else {
      Factory = function WxAudioContext() {
        return stubAudioContext();
      };
      console.warn('[phaser2] WebAudio stub — 无 wx.createWebAudioContext，音效可能无声');
    }

    g.AudioContext = Factory;
    g.webkitAudioContext = Factory;
    g.mozAudioContext = Factory;
    if (typeof globalThis !== 'undefined') {
      globalThis.AudioContext = Factory;
      globalThis.webkitAudioContext = Factory;
      globalThis.mozAudioContext = Factory;
      globalThis.AudioBuffer = g.AudioBuffer;
    }
    if (typeof window !== 'undefined') {
      window.AudioContext = Factory;
      window.webkitAudioContext = Factory;
      window.mozAudioContext = Factory;
      window.AudioBuffer = g.AudioBuffer;
    }
  };

  // 必须在 main.js / SoundEngine 之前注册 AudioContext
  g.bootstrapWxWebAudio();

  /** 微信 canvas 对 addColorStop 参数更严：qc.UIText 曾传入 Color 对象导致 Parse scene fail */
  g.bootstrapWxCanvasGradient = function () {
    if (g.__wxGradientPatch) return;
    g.__wxGradientPatch = true;
    try {
      var canvas = g.canvas || (typeof GameGlobal !== 'undefined' && GameGlobal.canvas);
      if (!canvas || typeof canvas.getContext !== 'function') return;
      var ctx = canvas.getContext('2d');
      if (!ctx || typeof ctx.createLinearGradient !== 'function') return;
      var grd = ctx.createLinearGradient(0, 0, 1, 1);
      if (!grd || typeof grd.addColorStop !== 'function') return;
      var proto = Object.getPrototypeOf(grd);
      if (!proto || proto.__wxColorStopPatched) return;
      var orig = proto.addColorStop;
      proto.addColorStop = function (offset, color) {
        var o = Number(offset);
        if (!isFinite(o)) o = 0;
        if (o < 0) o = 0;
        if (o > 1) o = 1;
        if (color && typeof color === 'object' && typeof color.toString === 'function') {
          try {
            color = color.toString('rgb');
          } catch (e1) {
            color = 'rgb(255,255,255)';
          }
        }
        if (typeof color !== 'string' || !color) color = 'rgb(255,255,255)';
        if (/NaN/i.test(color)) color = 'rgb(255,255,255)';
        try {
          return orig.call(this, o, color);
        } catch (e2) {
          return orig.call(this, o, 'rgb(255,255,255)');
        }
      };
      proto.__wxColorStopPatched = true;
      console.log('[phaser2] CanvasGradient.addColorStop patched');
    } catch (e) {
      console.warn('[phaser2] gradient patch skipped', e);
    }
  };

  g.bootstrapWxCanvasGradient();

  /**
   * 真机 WebAudio 须用户手势 resume；PlaySmart onGestureClicked 可能未触发。
   */
  g.bootstrapWxAudioUnlock = function () {
    if (g.__wxAudioUnlock) return;
    g.__wxAudioUnlock = true;
    var doc = typeof document !== 'undefined' ? document : null;
    if (!doc || typeof doc.addEventListener !== 'function') return;

    function unlock() {
      try {
        if (typeof wx !== 'undefined' && typeof wx.createWebAudioContext === 'function') {
          var ctx = wx.createWebAudioContext();
          if (ctx && typeof ctx.resume === 'function') ctx.resume();
        }
      } catch (e) {}
      try {
        var am = g.ps && g.ps.audioManager;
        if (am && am.audioContext && typeof am.audioContext.resume === 'function') {
          am.audioContext.resume();
          if (am.enableSounds === false) am.enableSounds = true;
        }
      } catch (e2) {}
    }

    var types = ['touchstart', 'touchend'];
    for (var i = 0; i < types.length; i++) {
      (function (type) {
        doc.addEventListener(type, function () {
          unlock();
        });
      })(types[i]);
    }
    console.log('[phaser2] audio unlock on first touch');
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
      if (list.length == null && list[0]) list = Array.prototype.slice.call(list);
      if (lists[li] === 'changedTouches' && (!list || !list.length) && ev.touches && ev.touches.length) {
        list = ev.touches;
        ev.changedTouches = list;
      }
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
    try {
      var sys = wx.getSystemInfoSync && wx.getSystemInfoSync();
      if (!sys || sys.platform !== 'devtools') return;
    } catch (e) {
      return;
    }
    // 开发者工具里 wx.onMouseDown 等为 stub，注册会刷 not implemented
    if (typeof wx.onMouseDown === 'function' && /not implemented/i.test(String(wx.onMouseDown))) return;
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

    try {
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
    } catch (e) {
      g.__wxMouseBridge = false;
    }
  };

  /**
   * weapp-adapter 把触摸派发到 document。
   * QC：部分逻辑监听 gameDiv/canvas，需 document → parent/canvas 转发。
   * Phaser 2.6 + adapter：canvas.addEventListener 已代理到 document，禁止 canvas.dispatchEvent（无 EventTarget，会抛错）。
   */
  g.bootstrapWxTouchBridge = function () {
    if (g.__wxTouchBridge || typeof wx === 'undefined') return;
    g.__wxTouchBridge = true;
    g.bootstrapWxMouseBridge();
    g.bootstrapWxAudioUnlock();
    var canvas = g.canvas || (g.window && g.window.canvas);
    var doc = typeof document !== 'undefined' ? document : null;
    if (!doc || typeof doc.addEventListener !== 'function') return;

    var docOnly = !!g.__wxPhaser26DocumentTouch;
    if (!docOnly && canvas && doc && canvas.addEventListener === doc.addEventListener) {
      docOnly = true;
      g.logPhaser26 && g.logPhaser26('touch bridge: adapter redirect detected → document-only');
    }

    var types = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
    for (var i = 0; i < types.length; i++) {
      (function (type) {
        doc.addEventListener(type, function (ev) {
          normalizeTouchEvent(ev);
          if (g.__phaser26Debug !== false && type === 'touchstart') {
            g.__phaser26DocTouch = (g.__phaser26DocTouch || 0) + 1;
            if (g.__phaser26DocTouch <= 30) {
              var pt = ev.changedTouches && ev.changedTouches[0];
              g.logPhaser26(
                'doc-touch #' + g.__phaser26DocTouch,
                'x', pt && (pt.pageX != null ? pt.pageX : pt.x),
                'y', pt && (pt.pageY != null ? pt.pageY : pt.y),
              );
            }
          }
          if (docOnly) return;
          if (type === 'touchmove') return;
          var parent = canvas && (canvas.parentNode || g.__wxCanvasParent);
          if (parent && parent.dispatchEvent) {
            try {
              parent.dispatchEvent(ev);
            } catch (e) {}
          }
          if (canvas && canvas.dispatchEvent) {
            try {
              canvas.dispatchEvent(ev);
            } catch (e2) {
              if (g.__phaser26Debug !== false) {
                g.logPhaser26('bridge→canvas error', e2 && e2.message ? e2.message : e2);
              }
            }
          }
        });
      })(types[i]);
    }
    console.log('[phaser2] touch bridge:', docOnly ? 'document-only (phaser26)' : 'document → canvas');
    if (g.__phaser26Debug !== false && doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('mousedown', function (e) {
        g.__phaser26Mouse = (g.__phaser26Mouse || 0) + 1;
        if (g.__phaser26Mouse <= 20) {
          g.logPhaser26(
            'doc-mousedown #' + g.__phaser26Mouse,
            'x', e.clientX != null ? e.clientX : e.x,
            'y', e.clientY != null ? e.clientY : e.y,
          );
        }
      });
    }
  };

  g.refreshWxInput = function () {
    var game = g.qc_game;
    if (!game || !game.phaser || !game.phaser.isBooted) return;
    try {
      var ph = game.phaser;
      var doc = typeof document !== 'undefined' ? document : null;
      if (ph.device) ph.device.touch = true;
      if (ph.stage) ph.stage.disableVisibilityChange = true;
      if (game.input) {
        if (game.input.touch && doc) {
          game.input.touch._generator = doc;
          game.input.touch.enable = false;
          game.input.touch.enable = true;
        }
        if (game.input.mouse && doc) {
          game.input.mouse._generator = doc;
          game.input.mouse.enable = false;
          game.input.mouse.enable = true;
        }
      }
      if (ph.input) {
        ph.input.enabled = true;
        if (ph.input.touch && ph.input.touch._setEnable) ph.input.touch._setEnable(true);
        if (ph.input.mouse && ph.input.mouse._setEnable) ph.input.mouse._setEnable(true);
      }
    } catch (e) {
      console.warn('[phaser2] refreshWxInput', e);
    }
  };

  g.bootstrapWxInputAfterGame = function () {
    if (g.__wxInputAfterGame) return;
    var game = g.qc_game;
    if (!game || !game.phaser || !game.phaser.isBooted) return;
    g.__wxInputAfterGame = true;
    g.refreshWxInput();
    try {
      if (game._adjustToFullScreen && !g.__wxLayoutDone) {
        g.__wxLayoutDone = true;
        game._adjustToFullScreen(true);
      }
    } catch (layoutErr) {
      console.warn('[phaser2] wx layout after boot', layoutErr);
    }
    try {
      var ph = game.phaser;
      console.log('[phaser2] input ready, touch:', !!(ph.device && ph.device.touch));
    } catch (e) {
      g.__wxInputAfterGame = false;
      console.warn('[phaser2] input after game skipped', e);
    }
  };

  g.bootstrapWxLifecycle = function () {
    if (g.__wxLifecycle || typeof wx === 'undefined') return;
    g.__wxLifecycle = true;

    function onShowHandler() {
      g.__wxSys = null;
      g.refreshWxInput();
      g.refreshPhaser26Input();
      g.bootstrapWxInputAfterGame();
      try {
        if (g.ps && g.ps.audioManager && g.ps.audioManager.audioContext) {
          var ac = g.ps.audioManager.audioContext;
          if (typeof ac.resume === 'function') ac.resume();
        }
      } catch (e) {}
      var game = g.qc_game;
      if (game && game.phaser && game.phaser.isPaused) {
        try { game.phaser.paused = false; } catch (e) {}
      }
    }

    function onHideHandler() {
      var game = g.qc_game;
      if (game && game.phaser && game.phaser.stage) {
        game.phaser.stage.disableVisibilityChange = true;
      }
    }

    var showBound = false;
    var hideBound = false;
    if (typeof wx.onShow === 'function') {
      try { wx.onShow(onShowHandler); showBound = true; } catch (e) {}
    }
    if (!showBound && typeof wx.onAppShow === 'function') {
      try { wx.onAppShow(onShowHandler); showBound = true; } catch (e) {}
    }
    if (typeof wx.onHide === 'function') {
      try { wx.onHide(onHideHandler); hideBound = true; } catch (e) {}
    }
    if (!hideBound && typeof wx.onAppHide === 'function') {
      try { wx.onAppHide(onHideHandler); hideBound = true; } catch (e) {}
    }
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
      if (psObj && psObj.hasStart) {
        g.refreshWxInput();
      }
      if (g.qc_game && g.qc_game.phaser && g.qc_game.phaser.isBooted) {
        g.bootstrapWxInputAfterGame();
      }
      if (tries < 600) setTimeout(poll, 100);
    };
    setTimeout(poll, 300);
  };

  /** 试玩 CTA / install → wx.notifyMiniProgramPlayableStatus({ isEnd: true }) */
  g.bootstrapWxPlayableInstall = function () {
    if (g.__wxPlayableInstallHooked) return;
    if (typeof wx === 'undefined' || typeof wx.notifyMiniProgramPlayableStatus !== 'function') {
      return;
    }
    var win = typeof window !== 'undefined' ? window : g;
    if (typeof win.install !== 'function') return;
    g.__wxPlayableInstallHooked = true;
    var origInstall = win.install;
    win.install = function wxPlayableInstall() {
      try {
        wx.notifyMiniProgramPlayableStatus({ isEnd: true });
        console.log('[phaser2] notifyMiniProgramPlayableStatus isEnd:true');
      } catch (e) {
        console.warn('[phaser2] notifyMiniProgramPlayableStatus', e);
      }
      return origInstall.apply(this, arguments);
    };
  };

  /** 注册微信侧缺失的全局 behaviour / 入口 */
  g.bootstrapPlayableWx = function () {
    g.bootstrapWxWebAudio();
    g.bootstrapWxTouchBridge();
    g.bootstrapWxLifecycle();
    g.bootstrapWxPlayableInstall();
    g.schedulePhaser26AfterBoot();
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

  g.__phaser26Debug = true;

  g.logPhaser26 = function (tag) {
    if (g.__phaser26Debug === false) return;
    var args = Array.prototype.slice.call(arguments, 1);
    args.unshift('[phaser26] ' + tag);
    console.log.apply(console, args);
  };

  g.dumpPhaser26Input = function (game, tag) {
    if (!game || !game.input) return;
    var inp = game.input;
    var touch = inp.touch;
    var mouse = inp.mouse;
    g.logPhaser26(
      'input-state' + (tag ? ' ' + tag : ''),
      'enabled', inp.enabled,
      'pollLocked', inp.pollLocked,
      'device.touch', !!(game.device && game.device.touch),
      'touch.enable', !!(touch && touch.enabled),
      'touch._onTouchStart', !!(touch && touch._onTouchStart),
      'mouse.enable', !!(mouse && mouse.enabled),
      'mouse._onMouseDown', !!(mouse && mouse._onMouseDown),
      'scale', game.scale && game.scale.width, game.scale && game.scale.height,
      'inp.scale', inp.scale && inp.scale.x, inp.scale && inp.scale.y,
      'state', game.state && game.state.current,
    );
  };

  /** 轮询直到 Phaser.Game boot 完成再刷 layout（仅 scale，不碰 input） */
  g.schedulePhaser26AfterBoot = function () {
    if (g.__wxPhaser26LayoutDone) return;
    if (g.__wxPhaser26LayoutPoll) return;
    g.__wxPhaser26LayoutPoll = true;
    var tries = 0;
    function poll() {
      tries++;
      var ok = typeof g.bootstrapPhaser26AfterBoot === 'function' && g.bootstrapPhaser26AfterBoot();
      if (ok || g.__wxPhaser26LayoutDone) {
        g.__wxPhaser26LayoutPoll = false;
        return;
      }
      if (tries < 200) setTimeout(poll, 100);
      else {
        g.__wxPhaser26LayoutPoll = false;
        console.warn('[phaser26] layout poll timeout');
      }
    }
    poll();
  };

  /** AppLovin Phaser 2.6：刷新触控；rebind 时才 stop/start 监听 */
  g.refreshPhaser26Input = function (opts) {
    opts = opts || {};
    var game = g.__wxPhaser26Game;
    if (!game && g.Phaser && g.Phaser.GAMES && g.Phaser.GAMES.length) {
      game = g.Phaser.GAMES[0];
      g.__wxPhaser26Game = game;
    }
    if (!game || !game.isBooted || !game.input) return;
    try {
      if (game.device) game.device.touch = true;
      if (game.stage) game.stage.disableVisibilityChange = true;
      game.input.enabled = true;
      if (opts.rebind) {
        var touch = game.input.touch;
        var mouse = game.input.mouse;
        if (touch) {
          if (touch._onTouchStart) {
            touch._onTouchStart = null;
            touch._onTouchMove = null;
            touch._onTouchEnd = null;
            touch._onTouchEnter = null;
            touch._onTouchLeave = null;
            touch._onTouchCancel = null;
          }
          if (typeof touch.stop === 'function') touch.stop();
          if (typeof touch.start === 'function') touch.start();
        }
        if (mouse) {
          if (mouse._onMouseDown) {
            mouse._onMouseDown = null;
            mouse._onMouseMove = null;
            mouse._onMouseUp = null;
            mouse._onMouseUpGlobal = null;
          }
          if (typeof mouse.stop === 'function') mouse.stop();
          if (typeof mouse.start === 'function') mouse.start();
        }
        g.logPhaser26('input rebind done');
      }
      g.dumpPhaser26Input(game, opts.tag || (opts.rebind ? 'rebind' : 'refresh'));
    } catch (e) {
      console.warn('[phaser26] refreshPhaser26Input', e);
    }
  };

  g.toPhaser26GameY = function (pageY, game) {
    var gh = (game && game.height) || 1138;
    var ph = window.innerHeight || 1;
    return pageY * (gh / ph);
  };

  g.toPhaser26GameX = function (pageX, game) {
    var gw = (game && game.width) || 640;
    var pw = window.innerWidth || 1;
    return pageX * (gw / pw);
  };

  g.installPhaser26WxChoiceTap = function (state) {
    if (!state || !state.game || !state.game.input) return;
    g.__wxPhaser26State = state;
    if (g.__wxPhaser26ChoiceTap) return;
    g.__wxPhaser26ChoiceTap = true;
    var game = state.game;
    game.input.onDown.add(function (p) {
      var st = g.__wxPhaser26State;
      if (!st || !st.touchAllowed || st.isRM) return;
      var gx;
      var gy;
      if (typeof wx !== 'undefined') {
        gx = g.toPhaser26GameX(p.pageX != null ? p.pageX : p.x, game);
        gy = g.toPhaser26GameY(p.pageY != null ? p.pageY : p.y, game);
      } else {
        gx = typeof p.x === 'number' ? p.x : g.toPhaser26GameX(p.pageX, game);
        gy = typeof p.y === 'number' ? p.y : g.toPhaser26GameY(p.pageY, game);
      }
      var list = st.turn === 0
        ? [st.f_hair1, st.f_hair2]
        : [st.f_choice1, st.f_choice2, st.f_choice3];
      for (var i = 0; i < list.length; i++) {
        var ch = list[i];
        if (!ch || !ch.f_touch || !ch.f_touch.exists) continue;
        var b = ch.f_touch.getBounds();
        if (b && b.width > 0 && b.height > 0 && b.contains(gx, gy)) {
          g.logPhaser26('wx-tap choice', ch.num, 'ptr', Math.round(gx), Math.round(gy));
          ch.signalOnSelect.dispatch(ch);
          return;
        }
      }
      if (g.__phaser26Debug !== false) {
        g.__phaser26TapMiss = (g.__phaser26TapMiss || 0) + 1;
        if (g.__phaser26TapMiss <= 15) {
          var h1 = st.f_hair1 && st.f_hair1.f_touch;
          var b1 = h1 && h1.getBounds && h1.getBounds();
          g.logPhaser26(
            'wx-tap miss #' + g.__phaser26TapMiss,
            'ptr', Math.round(gx), Math.round(gy),
            'raw', p.pageX, p.pageY,
            'win', window.innerWidth, window.innerHeight,
            'game', game.width, game.height,
            'inp', game.input.scale && game.input.scale.x, game.input.scale && game.input.scale.y,
            'hair1-bounds', b1 && [Math.round(b1.x), Math.round(b1.y), Math.round(b1.width), Math.round(b1.height)],
          );
        }
      }
    });
    g.logPhaser26('wx choice tap fallback installed');
  };

  /** Level create 完成后：重绑输入 + 挂调试钩子（布局交给 AppLovin.handleOrientation） */
  g.hookPhaser26LevelReady = function (state) {
    var game = (state && state.game) || g.__wxPhaser26Game;
    if (!game) return;
    g.__wxPhaser26Game = game;
    g.logPhaser26('level-ready', game.state && game.state.current);
    try {
      var wi = typeof wx !== 'undefined' && wx.getSystemInfoSync ? wx.getSystemInfoSync() : null;
      if (wi) {
        window.innerWidth = wi.windowWidth || window.innerWidth;
        window.innerHeight = wi.windowHeight || window.innerHeight;
      }
      g.logPhaser26(
        'post-orient',
        'game', game.width, game.height,
        'scale', game.scale && game.scale.width, game.scale && game.scale.height,
        'mode', game.scale && game.scale.currentScaleMode,
        'inp', game.input && game.input.scale && game.input.scale.x, game.input && game.input.scale && game.input.scale.y,
        'win', window.innerWidth, window.innerHeight,
      );
    } catch (layoutErr) {
      g.logPhaser26('level-ready layout err', layoutErr && layoutErr.message ? layoutErr.message : layoutErr);
    }
    g.refreshPhaser26Input({ rebind: true, tag: 'level-ready' });
    if (game.input && game.input.mouse) {
      game.input.mouse.enabled = false;
      if (typeof game.input.mouse.stop === 'function') game.input.mouse.stop();
    }
    g.attachPhaser26InputDebug(game);
    g.installPhaser26WxChoiceTap(state);
    if (game.input && game.input.interactiveItems) {
      g.logPhaser26('interactiveItems.total', game.input.interactiveItems.total);
    }
    if (state && state.f_hair1) {
      try {
        var h1 = state.f_hair1.f_touch;
        var wb = h1 && h1.getBounds && h1.getBounds();
        g.logPhaser26(
          'choice-bounds hair1',
          'inputEnabled', !!(h1 && h1.inputEnabled),
          'world', h1 && h1.world && h1.world.x, h1 && h1.world && h1.world.y,
          'bounds', wb && Math.round(wb.x), wb && Math.round(wb.y), wb && Math.round(wb.width), wb && Math.round(wb.height),
        );
      } catch (bErr) {
        g.logPhaser26('choice-bounds err', bErr && bErr.message ? bErr.message : bErr);
      }
    }
  };

  g.attachPhaser26InputDebug = function (game) {
    if (!game || !game.input || g.__phaser26InputDbgHooked) return;
    g.__phaser26InputDbgHooked = true;
    var inp = game.input;
    if (inp.onDown) {
      inp.onDown.add(function (p) {
        g.__phaser26PhaserDown = (g.__phaser26PhaserDown || 0) + 1;
        g.logPhaser26(
          'phaser-onDown #' + g.__phaser26PhaserDown,
          'world', Math.round(p.x), Math.round(p.y),
          'raw', p.pageX, p.pageY,
          'enabled', inp.enabled,
          'interactive', inp.interactiveItems && inp.interactiveItems.total,
        );
      });
    }
    if (inp.onUp) {
      inp.onUp.add(function (p) {
        g.__phaser26PhaserUp = (g.__phaser26PhaserUp || 0) + 1;
        if (g.__phaser26PhaserUp <= 30) {
          g.logPhaser26('phaser-onUp #' + g.__phaser26PhaserUp, Math.round(p.x), Math.round(p.y));
        }
      });
    }
    g.logPhaser26('input debug hooks attached');
  };

  /** AppLovin Phaser 2.6：启动后刷新 ScaleManager + 输入；返回 true 表示已完成 */
  g.bootstrapPhaser26AfterBoot = function () {
    if (g.__wxPhaser26LayoutDone) return true;
    var game = g.__wxPhaser26Game;
    if (!game && g.Phaser && g.Phaser.GAMES && g.Phaser.GAMES.length) {
      game = g.Phaser.GAMES[0];
      g.__wxPhaser26Game = game;
    }
    if (!game || !game.isBooted || !game.scale) return false;
    g.__wxPhaser26LayoutDone = true;
    try {
      var Phaser = g.Phaser;
      var wi = typeof wx !== 'undefined' && wx.getSystemInfoSync ? wx.getSystemInfoSync() : null;
      if (wi) {
        window.innerWidth = wi.windowWidth || window.innerWidth;
        window.innerHeight = wi.windowHeight || window.innerHeight;
      }
      if (game.stage) game.stage.disableVisibilityChange = true;
      var inp = game.input;
      var sm = game.scale;
      g.logPhaser26(
        'layout',
        'game', game.width, game.height,
        'scale', sm.width, sm.height,
        'mode', sm.currentScaleMode,
        'inp', inp && inp.scale ? inp.scale.x + ',' + inp.scale.y : '-',
        'touch', !!(game.device && game.device.touch),
        'state', game.state && game.state.current,
      );
      g.dumpPhaser26Input(game, 'layout-only');
      return true;
    } catch (e) {
      g.__wxPhaser26LayoutDone = false;
      console.warn('[phaser26] layout', e);
      return false;
    }
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

  console.log('[phaser2] Function/eval unavailable — PlaySmart 使用系统字体与静态脚本');
})(typeof GameGlobal !== 'undefined' ? GameGlobal : typeof window !== 'undefined' ? window : this);
