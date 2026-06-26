/**
 * Phaser 2 微信构建前的 JS 清理 / 补丁。
 */
import fs from 'fs';
import path from 'path';
import { mkdirSync } from 'fs';

export function patchPhaser2ForWx(filePath) {
  if (!fs.existsSync(filePath)) return false;
  let code = fs.readFileSync(filePath, 'utf8');
  const before = code;
  const win = 'typeof window!=="undefined"?window:GameGlobal';

  if (code.includes('.call(this,this,Object)')) {
    code = code.replace(/\.call\(this,this,Object\)/g, `.call(${win},${win},Object)`);
  }
  code = code.replace(/\}\)\.call\(this\);?\s*$/, `}).call(${win});`);

  // PlaySmart base64 资源：xhr 钩子读 window.*，微信下与 GameGlobal 对齐
  const wxG = '(typeof GameGlobal!=="undefined"?GameGlobal:window)';
  code = code.replace(/window\.hasBase64&&window\.hasBase64\(\)/g, `${wxG}.hasBase64&&${wxG}.hasBase64()`);
  code = code.replace(/window\.getKeyByUrl\(/g, `${wxG}.getKeyByUrl(`);
  code = code.replace(/window\.getAssestByKey\(/g, `${wxG}.getAssestByKey(`);
  code = code.replace(/else if\(window\.assetsPackage\)/g, `else if(${wxG}.assetsPackage)`);
  code = code.replace(/window\.assetsPackage\[/g, `${wxG}.assetsPackage[`);

  const wxCanvasCreate =
    'if(!window.__wx){if(this.config["canvasID"]){this.canvas=L.Canvas.create(this.width,this.height,this.config["canvasID"])}else{this.canvas=L.Canvas.create(this.width,this.height)}}';
  const wxCanvasCreatePatched =
    'if(!window.__wx){if(this.config["canvasID"]){this.canvas=L.Canvas.create(this.width,this.height,this.config["canvasID"])}else{this.canvas=L.Canvas.create(this.width,this.height)}}else if(!this.canvas){this.canvas=window.canvas}';
  if (code.includes(wxCanvasCreate) && !code.includes('else if(!this.canvas){this.canvas=window.canvas}')) {
    code = code.replace(wxCanvasCreate, wxCanvasCreatePatched);
  }

  const styleBlock =
    'if(this.config["canvasStyle"]){this.canvas.style=this.config["canvasStyle"]}else{this.canvas.style["-webkit-full-screen"]="width: 100%; height: 100%"}';
  const styleBlockSafe =
    'if(this.canvas&&this.canvas.style){if(this.config["canvasStyle"]){this.canvas.style=this.config["canvasStyle"]}else{this.canvas.style["-webkit-full-screen"]="width: 100%; height: 100%"}}';
  if (code.includes(styleBlock) && !code.includes('if(this.canvas&&this.canvas.style)')) {
    code = code.replace(styleBlock, styleBlockSafe);
  }

  const worldResize = 'World.prototype.resize=function(t,e){if(this._definedSize)';
  const worldResizeSafe =
    'World.prototype.resize=function(t,e){if(!this.game||!this.game.camera)return;if(this._definedSize)';
  if (code.includes(worldResize) && !code.includes('if(!this.game||!this.game.camera)return')) {
    code = code.replace(worldResize, worldResizeSafe);
  }

  const statePreUpdate =
    'preUpdate:function(){if(this._pendingState&&this.game.isBooted){this.clearCurrentState();this.setCurrentState(this._pendingState);';
  const statePreUpdateSafe =
    'preUpdate:function(){if(this._pendingState&&this.game.isBooted){try{this.clearCurrentState();this.setCurrentState(this._pendingState);';
  if (code.includes(statePreUpdate) && !code.includes('try{this.clearCurrentState()')) {
    code = code.replace(
      statePreUpdate,
      statePreUpdateSafe,
    );
    code = code.replace(
      '}else{this.loadComplete()}}',
      '}else{this.loadComplete()}}catch(__wxStateErr){console.error("[phaser2] state",__wxStateErr);this._pendingState=null}}',
    );
  }

  // 微信 passive touch：禁止 consumeDocumentTouches 与 preventDefault 刷屏/阻断操作
  if (!code.includes('consumeDocumentTouches:function(){if(window.__wx)return')) {
    code = code.replace(
      /consumeDocumentTouches:function\(\)\{this\._documentTouchMove=function\(t\)\{t\.preventDefault\(\)\};document\.addEventListener\("touchmove",this\._documentTouchMove,false\)\}/,
      'consumeDocumentTouches:function(){if(window.__wx)return;this._documentTouchMove=function(t){t.preventDefault()};document.addEventListener("touchmove",this._documentTouchMove,false)}',
    );
  }
  if (!code.includes('preventDefault&&!window.__wx')) {
    code = code.replace(
      /if\(this\.preventDefault\)\{t\.preventDefault\(\)\}/g,
      'if(this.preventDefault&&!window.__wx){t.preventDefault()}',
    );
    code = code.replace(
      /if\(this\.capture\)\{t\.preventDefault\(\)\}/g,
      'if(this.capture&&!window.__wx){t.preventDefault()}',
    );
  }

  // 微信环境强制识别为触控设备（注意分号，避免 trueif 粘连）
  if (!code.includes('window.__wx)n.touch=true;')) {
    code = code.replace(
      /if\("ontouchstart"in document\.documentElement\|\|window\.navigator\.maxTouchPoints&&window\.navigator\.maxTouchPoints>=1\)\{n\.touch=true\}/,
      'if("ontouchstart"in document.documentElement||window.navigator.maxTouchPoints&&window.navigator.maxTouchPoints>=1){n.touch=true}if(window.__wx)n.touch=true;',
    );
  }

  // 微信无 Page Visibility API：避免 checkVisibility 误暂停
  if (!code.includes('disableVisibilityChange=true;if(window.__wx)')) {
    code = code.replace(
      /L\.Stage\.prototype\.boot=function\(\)\{L\.DOM\.getOffset\(this\.game\.canvas,this\.offset\);L\.Canvas\.setUserSelect\(this\.game\.canvas,"none"\);L\.Canvas\.setTouchAction\(this\.game\.canvas,"none"\);this\.checkVisibility\(\)\}/,
      'L.Stage.prototype.boot=function(){L.DOM.getOffset(this.game.canvas,this.offset);L.Canvas.setUserSelect(this.game.canvas,"none");L.Canvas.setTouchAction(this.game.canvas,"none");if(window.__wx){this.disableVisibilityChange=true}else{this.checkVisibility()}}',
    );
  }

  if (code === before) return false;
  fs.writeFileSync(filePath, code);
  return true;
}

/** 从 HTML 精确截取 window.MW_CONFIG = { ... } */
export function extractMwConfigFromHtml(html) {
  const start = html.indexOf('window.MW_CONFIG');
  if (start < 0) return null;

  const braceStart = html.indexOf('{', html.indexOf('=', start));
  if (braceStart < 0) return null;

  let depth = 0;
  let inStr = null;
  let esc = false;

  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return `${html.slice(start, i + 1)};\n`;
      }
    }
  }
  return null;
}

/** 从 function name 起按花括号配对截取完整函数体 */
function findFunctionEnd(code, start) {
  const fnIdx = code.indexOf('function', start);
  if (fnIdx < 0 || fnIdx > start + 20) return -1;
  const brace = code.indexOf('{', fnIdx);
  if (brace < 0) return -1;

  let depth = 0;
  let inStr = null;
  let esc = false;

  for (let i = brace; i < code.length; i++) {
    const ch = code[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** 同一文件内重复的 top-level function，微信编译器会报错 */
function dedupeFunctionDeclaration(code, funcName) {
  const pattern = `function ${funcName}`;
  let out = '';
  let pos = 0;
  let kept = false;

  while (pos < code.length) {
    const idx = code.indexOf(pattern, pos);
    if (idx < 0) {
      out += code.slice(pos);
      break;
    }
    out += code.slice(pos, idx);
    const end = findFunctionEnd(code, idx);
    if (end < 0) {
      out += code.slice(idx);
      break;
    }
    if (!kept) {
      out += code.slice(idx, end);
      kept = true;
    }
    pos = end;
  }
  return out;
}

const GAME_SCRIPT_HELPERS = [
  '_typeof',
  '_regeneratorRuntime',
  '_asyncToGenerator',
  'asyncGeneratorStep',
];

/** game-scripts.min.js 多段脚本拼接，babel helper 重复声明 */
export function sanitizeGameScriptsForWx(code) {
  let out = code;

  out = out.replace(
    /Function\("r","regeneratorRuntime = r"\)\(runtime\)/g,
    '(typeof GameGlobal!=="undefined"?GameGlobal:window).regeneratorRuntime=runtime',
  );

  for (const name of GAME_SCRIPT_HELPERS) {
    if (name === '_typeof') {
      // 精确匹配 babel typeof helper，避免误伤
      const helper =
        /function _typeof\(t\)\{"@babel\/helpers - typeof";return _typeof="function"==typeof Symbol&&"symbol"==typeof Symbol\.iterator\?function\(t\)\{return typeof t\}:function\(t\)\{return t&&"function"==typeof Symbol&&t\.constructor===Symbol&&t!==Symbol\.prototype\?"symbol":typeof t\},_typeof\(t\)\}/g;
      let first = true;
      out = out.replace(helper, (m) => {
        if (first) {
          first = false;
          return m;
        }
        return '';
      });
      continue;
    }
    out = dedupeFunctionDeclaration(out, name);
  }
  return out;
}

/** @deprecated use sanitizeGameScriptsForWx */
export function dedupeBabelTypeof(code) {
  return sanitizeGameScriptsForWx(code);
}

export function sanitizeLibScript(name, code) {
  if (name === 'qc-core-min.js') {
    return sanitizeQcCoreForWx(code);
  }

  if (name === 'languagesMgr.js') {
    code = code.replace(
      /languagesMgr\.getRes = function \(\) \{\s*var res;/,
      `languagesMgr.getRes = function () {
        var res;
        var __qcfg = (typeof qici !== 'undefined' && qici.config) || (typeof GameGlobal !== 'undefined' && GameGlobal.qici && GameGlobal.qici.config) || (typeof window !== 'undefined' && window.qici && window.qici.config);
        if (__qcfg && __qcfg.useLanguages === false) { return null; }`,
    );
    code = code.replace(
      /res = game\.cache\.getJSON\("languages"\);/,
      'if (game.cache.checkJSONKey && game.cache.checkJSONKey("languages")) { res = game.cache.getJSON("languages"); }',
    );
    code = code.replace(
      /res = __qc\.phaser\.cache\.getJSON\('languages'\);/g,
      `var __cache = __qc.phaser.cache;
                if (__cache.checkJSONKey && __cache.checkJSONKey('languages')) {
                    res = __cache.getJSON('languages');
                }`,
    );
    code = code.replace(
      /} else \{\s*languagesMgr\._notFoundResWarn\(\);\s*\}/,
      `} else {
            var __g = typeof GameGlobal !== 'undefined' ? GameGlobal : window;
            var __inst = (__g.qici && __g.qici.config && __g.qici.config.gameInstance) || 'qc_game';
            var __qc = __g[__inst] || __g.qc_game;
            if (__qc && __qc.phaser && __qc.phaser.cache && __qc.phaser.cache.getJSON) {
                var __cache = __qc.phaser.cache;
                if (__cache.checkJSONKey && __cache.checkJSONKey('languages')) {
                    res = __cache.getJSON('languages');
                }
            }
            if (!res && __g.hasBase64 && __g.hasBase64() && __g.assetsBase64) {
                var raw = __g.assetsBase64()['languages_json'];
                if (raw) {
                    try { res = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {}
                }
            }
            if (!res) languagesMgr._notFoundResWarn();
        }`,
    );
    if (!code.includes('__wxG.languagesMgr=languagesMgr')) {
      code =
        code.trimEnd() +
        '\nvar __wxG=typeof GameGlobal!=="undefined"?GameGlobal:typeof window!=="undefined"?window:this;' +
        'if(typeof languagesMgr!=="undefined")__wxG.languagesMgr=languagesMgr;\n';
    }
    return code;
  }

  if (name !== 'qc-loading-debug.js') return code;

  code = code.replace(/^_pluginVariables_\s*=\s*\{\}/m, 'window._pluginVariables_={}');
  code = code.replace(/^var qici = \{\}/m, 'var qici=window.qici=window.qici||{}');
  code = code.replace(
    /document\.getElementById\('gameDiv'\)\.style\.display = 'none';/,
    "var __gd=document.getElementById('gameDiv');if(__gd&&__gd.style)__gd.style.display='none';",
  );
  code = code.replace(
    /parent: 'gameDiv',\n(\s*)state: qici\.splashState,/,
    "parent: 'gameDiv',\n$1canvas: window.canvas,\n$1state: qici.splashState,",
  );
  code = code.replace(
    /init: function \(\) \{\s*window\[qici\.config\.gameInstance\]\.fullScreen\(\);/,
    'init: function () {\n        if (!window.__wx) {\n            window[qici.config.gameInstance].fullScreen();\n        }',
  );
  code = code.replace(
    /create: function \(\) \{\s*var game = window\[qici\.config\.gameInstance\];/,
    'create: function () {\n        if (window.__wx) {\n            window[qici.config.gameInstance].fullScreen();\n        }\n        var game = window[qici.config.gameInstance];',
  );
  code = code.replace(
    /window\.addEventListener\('load', function \(\) \{ qici\.init\(\); \}\);\s*$/,
    'window.qici=qici;\n',
  );
  if (!code.includes('window.qici=qici')) {
    code += '\nwindow.qici=qici;\n';
  }
  code = code.replace(
    /document\.getElementById\('gameDiv'\)\.style\.display = 'block';/,
    "var __gd2=document.getElementById('gameDiv');if(__gd2&&__gd2.style)__gd2.style.display='block';",
  );
  code = code.replace(
    /parent\.postMessage\('scene-init-finished', '\*'\);/,
    "if(typeof parent!=='undefined'&&parent&&typeof parent.postMessage==='function')parent.postMessage('scene-init-finished','*');",
  );
  return code;
}

/** qc-core 微信运行时补丁 */
export function sanitizeQcCoreForWx(code) {
  let out = code;

  // pt.Node / pt.Input：微信下 phaser 对象可能无 game，回退 D.qc_game
  out = out.replace(
    /pt\.Node=function\(e,t,i\)\{var r=this;r\.game=e\.game\._qc;r\.phaser=e;e\._qc=this;r\.uuid=i\|\|r\.game\.math\.uuid\(\)/,
    'pt.Node=function(e,t,i){var r=this;var pg=e&&e.game;r.game=(pg&&pg._qc)||D.qc_game;if(e&&!e.game&&r.game&&r.game.phaser)e.game=r.game.phaser;r.phaser=e;e._qc=r;r.uuid=i||(r.game&&r.game.math?r.game.math.uuid():String(Date.now()))',
  );
  out = out.replace(
    /e\.phaser=t;e\.game=t\.game\._qc;/,
    'e.phaser=t;e.game=(t.game&&t.game._qc)||D.qc_game;if(t&&!t.game&&e.game&&e.game.phaser)t.game=e.game.phaser;',
  );

  // updateGameLayout：World 未就绪时跳过
  out = out.replace(
    /updateGameLayout=function\(t\)\{if\(this\._adjustToFullScreen\)\{this\._adjustToFullScreen\(t\)\}this\.world\.updateDomRoot\(\)\}/,
    'updateGameLayout=function(t){if(this._adjustToFullScreen&&this.phaser&&this.phaser.isBooted&&this.world){this._adjustToFullScreen(t)}if(this.world&&this.world.updateDomRoot)this.world.updateDomRoot()}',
  );

  // container：微信 canvas.parentNode 只读，回退 __wxCanvasParent
  out = out.replace(
    /container:\{get:function\(\)\{return this\.phaser\.canvas\.parentNode\}\}/,
    'container:{get:function(){var c=this.phaser.canvas;return(c&&D.getWxParent&&D.getWxParent(c))||(c&&c.parentNode)||D.__wxCanvasParent}}',
  );

  // PIXI 对象常无 game，stage 亦无 game → 每帧 displayChanged 刷 _qc of null
  out = out.replace(
    /else if\(this\.stage\)\{this\.stage\.game\._qc&&this\.stage\.game\._qc\.dirtyRectangle\.redirectDirty\(this\._currWorldBounds\)\}/,
    'else if(this.stage&&this.stage.game&&this.stage.game._qc){this.stage.game._qc.dirtyRectangle.redirectDirty(this._currWorldBounds)}',
  );

  // RAF 错误处理：避免 catch 里再访问 null._qc 刷屏
  out = out.replace(
    /catch\(t\)\{this\.game\._qc\.log\.error\("Error：\{0\}",t\)\}/g,
    'catch(err){var qc=this.game&&this.game._qc;if(qc)qc.log.error("Error：{0}",err);else console.error("[phaser2]",err)}',
  );

  // 微信 passive listener：QC 输入不再 preventDefault
  out = out.replace(
    /if\(!this\.input\.ignoreDomEvent\(t\)&&this\.capture\)t\.preventDefault\(\)/g,
    'if(!this.input.ignoreDomEvent(t)&&this.capture&&!D.__wx)t.preventDefault()',
  );

  // 微信 Touch 对象无 clientX/clientY，只有 x/y
  out = out.replace(
    /this\._toWorld\(this\.generator,i\.clientX,i\.clientY\)/g,
    'this._toWorld(this.generator,i.clientX!=null?i.clientX:i.x,i.clientY!=null?i.clientY:i.y)',
  );
  out = out.replace(
    /this\._toWorld\(this\.generator,t\.clientX,t\.clientY\)/g,
    'this._toWorld(this.generator,t.clientX!=null?t.clientX:t.x,t.clientY!=null?t.clientY:t.y)',
  );

  // 微信：Touch/Mouse 默认监听 canvas.parentNode（gameDiv），与 document 触摸总线隔离 → 拖不动
  out = out.replace(
    /generator:\{get:function\(\)\{return this\._generator\|\|this\.game\.canvas\.parentNode\|\|this\.game\.canvas\}/g,
    'generator:{get:function(){return this._generator||(D.__wx?D:(this.game.canvas.parentNode||this.game.canvas))}',
  );

  // 微信下强制启用 QC Touch（device.touch 检测可能失败）
  out = out.replace(
    /if\(!i\.touch\)\{this\._enable=false;return\}/,
    'if(!i.touch&&!D.__wx){this._enable=false;return}',
  );

  // 微信全屏：用窗口尺寸，跳过 DOM scroll / container 操作
  out = out.replace(
    /L\.prototype\.fullScreen=function\(\)\{var r=this;if\(r\._adjustToFullScreen\)\{return\}/,
    'L.prototype.fullScreen=function(){var r=this;if(r._adjustToFullScreen){return}if(D.__wx){r._adjustToFullScreen=function(){if(!r.phaser||!r.phaser.isBooted||!r.phaser.world||!r.phaser.world.game)return;if(r.isBooted&&r.input&&r.input.inputting)return;var info=(typeof wx!=="undefined"&&wx.getSystemInfoSync)?wx.getSystemInfoSync():{};var w=info.windowWidth||D.innerWidth||375;var h=info.windowHeight||D.innerHeight||667;r.setGameSize(w,h);r.updateScale(true)};r._adjustToFullScreen();return}',
  );

  // QC 对 Phaser.Text.updateText 的补丁在 strict 下漏了 var lineWidth
  out = out.replace(
    /for\(var o=0;o<s;o\+\+\)\{lineWidth=this\.measureLine/,
    'for(var o=0;o<s;o++){var lineWidth=this.measureLine',
  );

  // languagesMgr 在独立 require 模块内；updateText 在 IIFE 外
  const wxSafeLang =
    '(function(){var g=typeof GameGlobal!=="undefined"?GameGlobal:typeof window!=="undefined"?window:{};var lm=g.languagesMgr,l=lm&&lm.getLang?lm.getLang():null;return l?String(l).toLocaleLowerCase():""})()';
  out = out.replace(
    /languagesMgr\.getLang\(\)\?languagesMgr\.getLang\(\)\.toLocaleLowerCase\(\):""/g,
    wxSafeLang,
  );
  out = out.replace(
    /\(D\.languagesMgr&&D\.languagesMgr\.getLang\)\?D\.languagesMgr\.getLang\(\)\.toLocaleLowerCase\(\):""/g,
    wxSafeLang,
  );
  out = out.replace(
    /\(\(typeof GameGlobal!=="undefined"\?GameGlobal:typeof window!=="undefined"\?window:\{\}\)\.languagesMgr&&\(\(typeof GameGlobal!=="undefined"\?GameGlobal:window\)\.languagesMgr\.getLang\)\?\(typeof GameGlobal!=="undefined"\?GameGlobal:window\)\.languagesMgr\.getLang\(\)\.toLocaleLowerCase\(\):""\)/g,
    wxSafeLang,
  );

  // 微信下仍需 Dom overlay 容器，否则 qc.Dom appendChild 崩溃
  out = out.replace(
    /if\(D\.__wx\)\{e\.backDomRoot=null;e\.frontDomRoot=null;return\}/,
    'if(D.__wx){var ctr=e.game.container;if(ctr&&ctr.style)ctr.style.overflow="hidden";e.backDomRoot=document.createElement("div");e.backDomRoot.style.position="absolute";e.backDomRoot.style.left="0px";e.backDomRoot.style.top="0px";e.backDomRoot.style.overflow="hidden";if(ctr&&e.game.canvas){try{ctr.insertBefore(e.backDomRoot,e.game.canvas)}catch(__wxDomErr){if(ctr.appendChild)ctr.appendChild(e.backDomRoot)}}e.frontDomRoot=document.createElement("div");e.frontDomRoot.style.position="absolute";e.frontDomRoot.style.left="0px";e.frontDomRoot.style.top="0px";e.frontDomRoot.style.overflow="hidden";if(ctr&&ctr.appendChild)ctr.appendChild(e.frontDomRoot);return}',
  );
  out = out.replace(
    /if\(t===Ne\.POS_BACK\)\{this\.game\.world\.backDomRoot\.appendChild\(this\.div\)/,
    'if(t===Ne.POS_BACK){if(this.game.world.backDomRoot)this.game.world.backDomRoot.appendChild(this.div)',
  );
  out = out.replace(
    /else if\(t===Ne\.POS_FRONT\)\{this\.game\.world\.frontDomRoot\.appendChild\(this\.div\)/,
    'else if(t===Ne.POS_FRONT){if(this.game.world.frontDomRoot)this.game.world.frontDomRoot.appendChild(this.div)',
  );

  return out;
}

export function sanitizePlayableScript(name, code) {
  if (name === 'game-scripts.min.js') {
    let out = sanitizeGameScriptsForWx(code);
    // 微信 require 模块隔离：ps / qc_game 需挂到 GameGlobal
    out = out.replace(
      /o\.init=function\(\)\{if\(o\.hasLaunch\)return;game=qc_game\["phaser"\]/,
      'o.init=function(){if(o.hasLaunch)return;var __g=typeof GameGlobal!=="undefined"?GameGlobal:typeof window!=="undefined"?window:{};qc_game=qc_game||__g.qc_game;game=qc_game&&qc_game["phaser"]',
    );
    out = out.replace(
      /box2d=qc_game\["box2d"\]/,
      'box2d=qc_game&&qc_game["box2d"]',
    );
    // GlobalConfigBg：H5 用 body CSS 背景，微信 canvas 会盖住 DOM → 改 canvas UIImage
    out = out.replace(
      /t\.prototype\.initBg=function\(\)\{var t=this;var e=false;for\(var i in qc_game\.assets\._uuid2UrlConf\)\{if\(qc_game\.assets\._uuid2UrlConf\[i\]===this\.bgUrl\.replace\(\/\\\.\(\.\*\)\$\/,"\.bin"\)\)\{e=true\}\}if\(!e\)\{t\.moduleReady\(\);return\}var r=document\.querySelector\("\.vPlayer"\)\|\|document\.body;/,
      't.prototype.initBg=function(){var t=this;var e=false;for(var i in qc_game.assets._uuid2UrlConf){if(qc_game.assets._uuid2UrlConf[i]===this.bgUrl.replace(/\\.(.*)$/,".bin")){e=true}}if(!e){t.moduleReady();return}if(typeof wx!=="undefined"||window.__wx){var binUrl=t.bgUrl.replace(/\\.(.*)$/,".bin");qc_game.assets.load(binUrl,function(__a){if(!__a){t.moduleReady();return}try{var __p=typeof UIRoot!=="undefined"&&UIRoot?UIRoot:(t.gameObject&&t.gameObject.parent)||qc_game.world;var __bg=qc_game.add.image(__p);__bg.name="__wxGlobalBg__";__bg.ignoreDestroy=true;__bg.texture=__a;__bg.setAnchor(new qc.Point(0,0),new qc.Point(1,1));__bg.left=0;__bg.right=0;__bg.top=0;__bg.bottom=0;if(__p.setChildIndex)__p.setChildIndex(__bg,0);t._wxBgNode=__bg}catch(__err){console.error("[phaser2] wx bg",__err)}t.moduleReady()});return}var r=document.querySelector(".vPlayer")||document.body;',
    );
    out = out.replace(
      /if\(i instanceof AudioBuffer\)\{r=new Float32Array\(e\.length\)/,
      'if(i&&typeof i.copyToChannel==="function"&&typeof i.copyFromChannel==="function"&&i.numberOfChannels){r=new Float32Array(e.length)',
    );
    // 微信无广告 SDK：gameReady 后自动 gameStart（否则 UIRoot 一直 visible=false）
    const wxLaunchHook =
      'if(typeof wx!=="undefined"&&typeof gameStart==="function"&&!o.hasStart){try{gameStart()}catch(__wxGsErr){console.error("[phaser2] gameStart",__wxGsErr);o.checkLaunch()}}else{o.checkLaunch()}';
    out = out.replace(
      /o\.Print\.green\("gameReady"\);n=true;if\(window\["gameReady"\]\)\{try\{window\["gameReady"\]\(\)\}catch\(t\)\{console\.error\(t\)\}\}o\.checkLaunch\(\)/,
      `o.Print.green("gameReady");n=true;if(window["gameReady"]){try{window["gameReady"]()}catch(t){console.error(t)}}${wxLaunchHook}`,
    );
    out = out.replace(
      /if\(A\.hasReady&&A\.hasVideosReady\)\{A\.Print\.green\("gameReady"\);if\(window\["gameReady"\]\)\{try\{window\["gameReady"\]\(\)\}catch\(t\)\{console\.error\(t\)\}\}\}A\.checkLaunch\(\)/,
      `if(A.hasReady&&A.hasVideosReady){A.Print.green("gameReady");if(window["gameReady"]){try{window["gameReady"]()}catch(t){console.error(t)}}}if(typeof wx!=="undefined"&&typeof gameStart==="function"&&!A.hasStart){try{gameStart()}catch(__wxGsErr){console.error("[phaser2] gameStart",__wxGsErr);A.checkLaunch()}}else{A.checkLaunch()}`,
    );
    out = out.replace(
      /if\(typeof gameStart!=="undefined"\)__wxG\.gameStart=gameStart;/g,
      'if(typeof gameStart!=="undefined"){__wxG.gameStart=gameStart;if(typeof window!=="undefined")window.gameStart=gameStart;}',
    );
    const wxExportTail =
      '\nvar __wxG=typeof GameGlobal!=="undefined"?GameGlobal:typeof window!=="undefined"?window:this;' +
      'if(typeof ps!=="undefined"){__wxG.ps=__wxG.ps||{};for(var __pk in ps)if(Object.prototype.hasOwnProperty.call(ps,__pk))__wxG.ps[__pk]=ps[__pk];}' +
      'if(typeof getAssestByKey!=="undefined")__wxG.getAssestByKey=getAssestByKey;' +
      'if(typeof getAssestByUrl!=="undefined")__wxG.getAssestByUrl=getAssestByUrl;' +
      'if(typeof getKeyByUrl!=="undefined")__wxG.getKeyByUrl=getKeyByUrl;' +
      'if(typeof hasBase64!=="undefined")__wxG.hasBase64=hasBase64;' +
      'if(typeof assetsBase64!=="undefined")__wxG.assetsBase64=assetsBase64;' +
      'if(typeof gameStart!=="undefined"){__wxG.gameStart=gameStart;if(typeof window!=="undefined")window.gameStart=gameStart;}\n';
    if (!out.includes('__wxG.ps=__wxG.ps||{}')) {
      out = out.replace(
        /if\(typeof gameStart!=="undefined"\)__wxG\.gameStart=gameStart;/,
        'if(typeof gameStart!=="undefined"){__wxG.gameStart=gameStart;if(typeof window!=="undefined")window.gameStart=gameStart;}',
      );
      out = out.replace(
        /if\(typeof ps!=="undefined"\)__wxG\.ps=ps;/,
        'if(typeof ps!=="undefined"){__wxG.ps=__wxG.ps||{};for(var __pk in ps)if(Object.prototype.hasOwnProperty.call(ps,__pk))__wxG.ps[__pk]=ps[__pk];}',
      );
      if (!out.includes('__wxG.ps=__wxG.ps||{}')) {
        out = out.trimEnd() + wxExportTail;
      }
    }
    return out;
  }
  if (name === 'data.js') {
    if (!code.includes('__wxG.assetsPackage=assetsPackage')) {
      code =
        code.trimEnd() +
        '\nvar __wxG=typeof GameGlobal!=="undefined"?GameGlobal:typeof window!=="undefined"?window:this;' +
        '__wxG.assetsPackage=assetsPackage;' +
        'if(typeof window!=="undefined")window.assetsPackage=assetsPackage;\n';
    }
    return code;
  }
  return code;
}

/** 执行 data.js 得到 assetsPackage（构建时提取字体等） */
export function loadAssetsPackageFromDataJs(dataJs) {
  const fn = new Function(`${dataJs}\n;return typeof assetsPackage!=="undefined"?assetsPackage:{};`);
  return fn();
}

/** 从 assetsPackage 写出 resource/font/*.ttf */
export function writeFontFilesFromAssetsPackage(assetsPackage, destDir) {
  mkdirSync(destDir, { recursive: true });
  let n = 0;
  for (const key of Object.keys(assetsPackage)) {
    if (!key.endsWith('_ttf')) continue;
    const name = key.slice(0, -4);
    const data = assetsPackage[key];
    if (typeof data !== 'string' || data.length < 64) continue;
    const b64 = data.replace(/^data:[^;]+;base64,/, '');
    try {
      fs.writeFileSync(path.join(destDir, name + '.ttf'), Buffer.from(b64, 'base64'));
      n++;
    } catch (e) {
      console.warn('[phaser2] font skip', name, e.message);
    }
  }
  return n;
}
