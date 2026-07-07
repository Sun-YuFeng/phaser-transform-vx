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

  // 微信 canvas 无 getBoundingClientRect，触控 offset 应为 0
  const getOffsetOld =
    'getOffset:function(t,e){e=e||new L.Point;try{var i=t.getBoundingClientRect()}catch(t){return{top:0,left:0,right:0,bottom:0}}';
  const getOffsetWx =
    'getOffset:function(t,e){e=e||new L.Point;if(window.__wx){e.x=0;e.y=0;return e}try{var i=t.getBoundingClientRect()}catch(t){e.x=0;e.y=0;return e}';
  if (code.includes(getOffsetOld) && !code.includes('if(window.__wx){e.x=0;e.y=0;return e}')) {
    code = code.replace(getOffsetOld, getOffsetWx);
  }

  // 微信 canvas 非 adapter Node，禁止 addToDOM appendChild
  const addToDom =
    'addToDOM:function(t,e,i){var s;if(typeof i==="undefined"){i=true}if(e){if(typeof e==="string"){s=document.getElementById(e)}else if(typeof e==="object"&&e.nodeType===1){s=e}}if(!s){s=document.body}if(i&&s.style){s.style.overflow="hidden"}s.appendChild(t);return t}';
  const addToDomWx =
    'addToDOM:function(t,e,i){if(window.__wx){var s;if(e){if(typeof e==="string"){s=document.getElementById(e)}else if(typeof e==="object"&&e.nodeType===1){s=e}}if(!s){s=document.body}var g=typeof GameGlobal!=="undefined"?GameGlobal:window;if(g.linkCanvasParent&&t&&s){g.linkCanvasParent(t,s)}else if(g.setWxParent&&t){g.setWxParent(t,s||document.body)}return t}var s;if(typeof i==="undefined"){i=true}if(e){if(typeof e==="string"){s=document.getElementById(e)}else if(typeof e==="object"&&e.nodeType===1){s=e}}if(!s){s=document.body}if(i&&s.style){s.style.overflow="hidden"}s.appendChild(t);return t}';
  if (code.includes(addToDom) && !code.includes('if(window.__wx){var s;if(e){if(typeof e==="string"){s=document.getElementById(e)}')) {
    code = code.replace(addToDom, addToDomWx);
  }

  const removeFromDom = 'removeFromDOM:function(t){if(t.parentNode){t.parentNode.removeChild(t)}}';
  const removeFromDomWx = 'removeFromDOM:function(t){if(window.__wx)return;if(t.parentNode){t.parentNode.removeChild(t)}}';
  if (code.includes(removeFromDom) && !code.includes('removeFromDOM:function(t){if(window.__wx)return')) {
    code = code.replace(removeFromDom, removeFromDomWx);
  }

  // 本地 resource/ 走 readFile（wx.request / XHR 在微信不可用）
  const xhrLoadWxRequest =
    'if(window.__wx&&typeof wx.getSharedCanvas!="function"){n=n||this.fileError;var a=wx.request({url:t,dataType:i,success:function(t){try{return s.call(r,e,t.data)}catch(t){if(!r.hasLoaded){r.asyncComplete(e,t.message||"Exception")}else{if(window["console"]){console.error(t)}}}},fail:function(t){try{return n.call(r,e)}catch(t){if(!r.hasLoaded){r.asyncComplete(e,t.message||"Exception")}else{if(window["console"]){console.error(t)}}}}});e.requestObject=a;e.requestUrl=t;return}';
  const xhrLoadReadFile =
    'if(window.__wx&&typeof wx!=="undefined"&&wx.getFileSystemManager){n=n||this.fileError;var __wxUrl=typeof t==="string"?t:(t&&t.url)||"";if(__wxUrl&&!/^https?:\\/\\//i.test(__wxUrl)){var __wxFs=wx.getFileSystemManager();var __wxPath=__wxUrl.replace(/^\\.\\//,"").replace(/^\\//,"");var __wxPaths=[__wxPath];var __wxAlt=__wxPath.replace(/\\.([A-Z0-9]+)$/,function(m,e){return "."+e.toLowerCase()});if(__wxAlt!==__wxPath)__wxPaths.push(__wxAlt);var __wxIdx=0;var __wxRead=function(){var __wxOpt={filePath:__wxPaths[__wxIdx],success:function(__res){try{return s.call(r,e,__res.data)}catch(__err){if(!r.hasLoaded){r.asyncComplete(e,__err.message||"Exception")}else{console.error(__err)}}},fail:function(__err){__wxIdx++;if(__wxIdx<__wxPaths.length){__wxRead();return}try{return n.call(r,e)}catch(__e2){if(!r.hasLoaded){r.asyncComplete(e,(__err&&__err.errMsg)||"readFile fail")}else{console.error(__e2)}}}};if(i==="text"||!i||i==="json"){__wxOpt.encoding="utf8"}__wxFs.readFile(__wxOpt)};__wxRead();e.requestUrl=t;return}}';
  if (code.includes(xhrLoadWxRequest) && !code.includes('__wxPaths=[__wxPath]')) {
    code = code.replace(xhrLoadWxRequest, xhrLoadReadFile);
  } else if (
    code.includes('xhrLoad:function(e,t,i,s,n){var r=this;') &&
    !code.includes('__wxPaths=[__wxPath]')
  ) {
    code = code.replace(
      'xhrLoad:function(e,t,i,s,n){var r=this;',
      'xhrLoad:function(e,t,i,s,n){var r=this;' + xhrLoadReadFile.slice(3),
    );
  }

  const fileCompleteWxOld =
    'if(window.__wx&&typeof wx.getSharedCanvas!="function")i=e;else if(e){if(t.type==="binary"||t.type==="audio"){i=e.response}else{i=e.responseText}}';
  const fileCompleteWxNew =
    'if(window.__wx&&(typeof e==="string"||(typeof ArrayBuffer!=="undefined"&&e instanceof ArrayBuffer)))i=e;else if(window.__wx&&e&&typeof e==="object"&&e.response==null&&e.responseText==null&&typeof e.status!=="number")i=e;else if(e){if(t.type==="binary"||t.type==="audio"){i=e.response}else{i=e.responseText}}';
  if (code.includes(fileCompleteWxOld)) {
    code = code.replace(fileCompleteWxOld, fileCompleteWxNew);
  }

  // readFile 成功时 e 为字符串；勿再读 e.responseText（undefined → JSON.parse 报 Unexpected token u）
  const jsonLoadCompleteOld =
    'jsonLoadComplete:function(t,e){var i=window.__wx&&typeof wx.getSharedCanvas!="function"?e:JSON.parse(e.responseText);';
  const jsonLoadCompleteNew =
    'jsonLoadComplete:function(t,e){var i=typeof e==="string"?JSON.parse(e):JSON.parse(e.responseText);';
  if (code.includes(jsonLoadCompleteOld)) {
    code = code.replace(jsonLoadCompleteOld, jsonLoadCompleteNew);
  }

  const csvLoadCompleteOld =
    'csvLoadComplete:function(t,e){var i=window.__wx&&typeof wx.getSharedCanvas!="function"?e:e.responseText;';
  const csvLoadCompleteNew =
    'csvLoadComplete:function(t,e){var i=typeof e==="string"?e:e.responseText;';
  if (code.includes(csvLoadCompleteOld)) {
    code = code.replace(csvLoadCompleteOld, csvLoadCompleteNew);
  }

  const xmlLoadCompleteOld =
    'xmlLoadComplete:function(t,e){var i=window.__wx&&typeof wx.getSharedCanvas!="function"?e:e.responseText;';
  const xmlLoadCompleteNew =
    'xmlLoadComplete:function(t,e){var i=typeof e==="string"?e:e.responseText;';
  if (code.includes(xmlLoadCompleteOld)) {
    code = code.replace(xmlLoadCompleteOld, xmlLoadCompleteNew);
  }

  // ScaleManager.scrollTop → window.scrollTo；微信无 scrollTo，每帧 preUpdate 刷屏
  const scrollTopOld =
    'scrollTop:function(){var t=this.compatibility.scrollTo;if(t){window.scrollTo(t.x,t.y)}}';
  const scrollTopWx =
    'scrollTop:function(){if(window.__wx)return;var t=this.compatibility.scrollTo;if(t&&typeof window.scrollTo==="function"){window.scrollTo(t.x,t.y)}}';
  if (code.includes(scrollTopOld)) {
    code = code.replace(scrollTopOld, scrollTopWx);
  }

  // wx canvas 无 clientWidth → scale.width=0 → alignCanvas 算出错误 margin、触控 Y 偏移
  const scaleBoundsOld =
    'updateScalingAndBounds:function(){this.scaleFactor.x=this.game.width/this.width;this.scaleFactor.y=this.game.height/this.height;this.scaleFactorInversed.x=this.width/this.game.width;this.scaleFactorInversed.y=this.height/this.game.height';
  const scaleBoundsWx =
    'updateScalingAndBounds:function(){if(window.__wx&&(!this.width||!this.height)){var __wi=(typeof wx!=="undefined"&&wx.getSystemInfoSync)?wx.getSystemInfoSync():null;var __ww=__wi?__wi.windowWidth:(window.innerWidth||375);var __wh=__wi?__wi.windowHeight:(window.innerHeight||667);if(!this.width)this.width=__ww;if(!this.height)this.height=__wh}this.scaleFactor.x=this.width?this.game.width/this.width:1;this.scaleFactor.y=this.height?this.game.height/this.height:1;this.scaleFactorInversed.x=this.game.width?this.width/this.game.width:1;this.scaleFactorInversed.y=this.game.height?this.height/this.game.height:1';
  if (code.includes(scaleBoundsOld)) {
    code = code.replace(scaleBoundsOld, scaleBoundsWx);
  }
  const scaleBoundsWxMinimal =
    'updateScalingAndBounds:function(){this.scaleFactor.x=this.width?this.game.width/this.width:1;this.scaleFactor.y=this.height?this.game.height/this.height:1;this.scaleFactorInversed.x=this.game.width?this.width/this.game.width:1;this.scaleFactorInversed.y=this.game.height?this.height/this.game.height:1';
  if (code.includes(scaleBoundsWxMinimal)) {
    code = code.replace(scaleBoundsWxMinimal, scaleBoundsWx);
  }
  const scaleBoundsWxInject =
    'updateScalingAndBounds:function(){if(window.__wx&&(!this.width||!this.height)){var __c=window.canvas||(typeof GameGlobal!=="undefined"?GameGlobal.canvas:null);if(__c&&__c.width>0){this.width=__c.width;this.height=__c.height}else if(typeof wx!=="undefined"&&wx.getSystemInfoSync){try{var __wi=wx.getSystemInfoSync();if(!this.width)this.width=__wi.windowWidth||375;if(!this.height)this.height=__wi.windowHeight||667}catch(__e){}}}this.scaleFactor.x=this.width?this.game.width/this.width:1;this.scaleFactor.y=this.height?this.game.height/this.height:1;this.scaleFactorInversed.x=this.game.width?this.width/this.game.width:1;this.scaleFactorInversed.y=this.game.height?this.height/this.game.height:1';
  if (code.includes(scaleBoundsWxInject)) {
    code = code.replace(scaleBoundsWxInject, scaleBoundsWx);
  }
  const scaleBoundsWxOld =
    'updateScalingAndBounds:function(){if(window.__wx&&(!this.width||!this.height)&&typeof wx!=="undefined"&&wx.getSystemInfoSync){try{var __wi=wx.getSystemInfoSync();if(!this.width)this.width=__wi.windowWidth||375;if(!this.height)this.height=__wi.windowHeight||667}catch(__e){}}var __dw=this.width||0;var __dh=this.height||0;var __gw=this.game.width||0;var __gh=this.game.height||0;this.scaleFactor.x=__dw?__gw/__dw:1;this.scaleFactor.y=__dh?__gh/__dh:1;this.scaleFactorInversed.x=__gw?__dw/__gw:1;this.scaleFactorInversed.y=__gh?__dh/__gh:1';
  if (code.includes(scaleBoundsWxOld)) {
    code = code.replace(scaleBoundsWxOld, scaleBoundsWx);
  }

  const alignCanvasOld =
    'alignCanvas:function(t,e){var i=this.getParentBounds(this._tempBounds)';
  const alignCanvasWx =
    'alignCanvas:function(t,e){if(window.__wx){this.margin.left=this.margin.right=this.margin.top=this.margin.bottom=0;this.margin.x=this.margin.y=0;return}var i=this.getParentBounds(this._tempBounds)';
  if (code.includes(alignCanvasOld) && !code.includes('if(window.__wx){this.margin.left=this.margin.right')) {
    code = code.replace(alignCanvasOld, alignCanvasWx);
  }

  // 勿在 wx 上谎报 webGL=true；用主 canvas 实测，失败则走 Canvas 渲染
  const webGlDetectBad =
    'n.webGL=function(){try{if(window.__wx)return true;var t=document.createElement("canvas");';
  const webGlDetectWx =
    'n.webGL=function(){try{if(window.__wx){var t=window.canvas||(typeof GameGlobal!=="undefined"?GameGlobal.canvas:null);if(!t)return false;var e={stencil:true};return!!(t.getContext&&(t.getContext("webgl",e)||t.getContext("experimental-webgl",e)))}var t=document.createElement("canvas");';
  if (code.includes(webGlDetectBad)) {
    code = code.replace(webGlDetectBad, webGlDetectWx);
  }

  const setUpRendererWxOld =
    'setUpRenderer:function(){if(window.__wx){this.device.canvas=this.canvas}';
  const setUpRendererWxNew =
    'setUpRenderer:function(){if(window.__wx){if(!this.canvas){this.canvas=window.canvas||(typeof GameGlobal!=="undefined"?GameGlobal.canvas:null)}this.device.canvas=!!this.canvas}';
  if (code.includes(setUpRendererWxOld)) {
    code = code.replace(setUpRendererWxOld, setUpRendererWxNew);
  }

  const webGlCreateOld =
    '}else{this.renderType=L.WEBGL;this.renderer=new PIXI.WebGLRenderer(this.width,this.height,{view:this.canvas,transparent:this.transparent,resolution:this.resolution,antialias:this.antialias,preserveDrawingBuffer:this.preserveDrawingBuffer});this.context=null}';
  const webGlCreateWx =
    '}else{this.renderType=L.WEBGL;try{this.renderer=new PIXI.WebGLRenderer(this.width,this.height,{view:this.canvas,transparent:this.transparent,resolution:this.resolution,antialias:this.antialias,preserveDrawingBuffer:this.preserveDrawingBuffer});this.context=null}catch(__wxGlErr){console.warn("[phaser2] WebGL failed, fallback Canvas",__wxGlErr);this.renderType=L.CANVAS;this.renderer=new PIXI.CanvasRenderer(this.width,this.height,{view:this.canvas,transparent:this.transparent,resolution:this.resolution,clearBeforeRender:true});this.context=this.renderer.context}}';
  if (code.includes(webGlCreateOld) && !code.includes('WebGL failed, fallback Canvas')) {
    code = code.replace(webGlCreateOld, webGlCreateWx);
  }

  if (code === before) return false;
  fs.writeFileSync(filePath, code);
  return true;
}

/** 与 2.3.0 bundle 一致：GameGlobal 优先，避免 PIXI/Phaser 挂 window 而 __wxG 读 GameGlobal */
export const PHASER26_WX_GLOBAL_EXPR =
  'typeof GameGlobal!=="undefined"?GameGlobal:typeof window!=="undefined"?window:this';

/** Phaser 2.6 AppLovin：PIXI/Phaser 通过 .call(this) 挂全局，微信 require 下 this 不是 GameGlobal。 */
export function patchPhaser26ForWx(filePath) {
  if (!fs.existsSync(filePath)) return false;
  let code = fs.readFileSync(filePath, 'utf8');
  const before = code;
  const win = PHASER26_WX_GLOBAL_EXPR;

  if (!code.includes('__wxPhaser26Global')) {
    code = code.replace(
      /function\(\)\{var a=this,b=b\|\|\{\}/,
      `function(){var a=${win},b=b||{};a.__wxPhaser26Global=1`,
    );
    code = code.replace(
      /function\(\)\{function a\(a,b\)\{this\._scaleFactor=a,this\._deltaMode=b,this\.originalEvent=null\}var b=this,c=c\|\|\{VERSION:"2\.6\./,
      `function(){function a(a,b){this._scaleFactor=a,this._deltaMode=b,this.originalEvent=null}var b=${win},c=c||{VERSION:"2.6.`,
    );
    code = code.replace(
      /:a\.PIXI=b,b\}\.call\(this\),function\(\)\{/,
      `:a.PIXI=b,b}.call(${win}),function(){`,
    );
    code = code.replace(
      /:a\.PIXI=b,b\}\.call\(typeof window!=="undefined"\?window:GameGlobal\),function\(\)\{/,
      `:a.PIXI=b,b}.call(${win}),function(){`,
    );
    code = code.replace(
      /:b\.Phaser=c,c\}\.call\(this\);/,
      `:b.Phaser=c,c}.call(${win});`,
    );
    code = code.replace(
      /:b\.Phaser=c,c\}\.call\(typeof window!=="undefined"\?window:GameGlobal\);/,
      `:b.Phaser=c,c}.call(${win});`,
    );
  }

  if (!code.includes('__wxPhaser26Xhr')) {
    const xhr26ReadFile =
      'if(window.__wx&&typeof wx!=="undefined"&&wx.getFileSystemManager){e=e||this.fileError;var __wxUrl=typeof b==="string"?b:(b&&b.url)||"";if(__wxUrl&&!/^https?:\\/\\//i.test(__wxUrl)){var __wxFs=wx.getFileSystemManager();var __wxPath=__wxUrl.replace(/^\\.\\//,"").replace(/^\\//,"");var __wxPaths=[__wxPath];var __wxAlt=__wxPath.replace(/\\.([A-Z0-9]+)$/,function(m,e){return "."+e.toLowerCase()});if(__wxAlt!==__wxPath)__wxPaths.push(__wxAlt);var __wxIdx=0;var g=this;var __wxRead=function(){var __wxOpt={filePath:__wxPaths[__wxIdx],success:function(__res){try{var __fake={responseText:typeof __res.data==="string"?__res.data:"",response:__res.data,status:200,readyState:4};return d.call(g,a,__fake)}catch(__err){g.hasLoaded?window.console&&console.error(__err):g.asyncComplete(a,__err.message||"Exception")}},fail:function(__err){__wxIdx++;if(__wxIdx<__wxPaths.length){__wxRead();return}try{return e.call(g,a,__err)}catch(__e2){g.hasLoaded?window.console&&console.error(__e2):g.asyncComplete(a,(__err&&__err.errMsg)||"readFile fail")}}};if(c==="text"||!c||c==="json"){__wxOpt.encoding="utf8"}__wxFs.readFile(__wxOpt)};__wxRead();a.requestUrl=b;return}}/*__wxPhaser26Xhr*/';
    if (code.includes('xhrLoad:function(a,b,c,d,e){')) {
      code = code.replace(
        'xhrLoad:function(a,b,c,d,e){',
        'xhrLoad:function(a,b,c,d,e){' + xhr26ReadFile,
      );
    }
  }

  if (!code.includes('__wxPhaser26Render')) {
    const canvasPick =
      'this.config.canvas?this.canvas=this.config.canvas:window.__wx&&(window.canvas||(typeof GameGlobal!=="undefined"?GameGlobal.canvas:null))?this.canvas=window.canvas||(typeof GameGlobal!=="undefined"?GameGlobal.canvas:null):this.canvas=c.Canvas.create(this,this.width,this.height,this.config.canvasID,!0)';
    const canvasPickOld =
      'this.config.canvas?this.canvas=this.config.canvas:this.canvas=c.Canvas.create(this,this.width,this.height,this.config.canvasID,!0)';
    if (code.includes(canvasPickOld) && !code.includes('__wxPhaser26Render')) {
      code = code.replace(canvasPickOld, '/*__wxPhaser26Render*/' + canvasPick);
    }

    const styleOld =
      'this.config.canvasStyle?this.canvas.style=this.config.canvasStyle:this.canvas.style["-webkit-full-screen"]="width: 100%; height: 100%"';
    const styleSafe =
      'this.canvas&&this.canvas.style?(this.config.canvasStyle?this.canvas.style=this.config.canvasStyle:this.canvas.style["-webkit-full-screen"]="width: 100%; height: 100%"):""';
    if (code.includes(styleOld) && !code.includes('this.canvas&&this.canvas.style')) {
      code = code.replace(styleOld, styleSafe);
    }

    const addOld =
      'addToDOM:function(a,b,c){var d;return void 0===c&&(c=!0),b&&("string"==typeof b?d=document.getElementById(b):"object"==typeof b&&1===b.nodeType&&(d=b)),d||(d=document.body),c&&d.style&&(d.style.overflow="hidden"),d.appendChild(a),a}';
    const addWx =
      'addToDOM:function(a,b,c){if(window.__wx){var d;if(b){if(typeof b==="string"){d=document.getElementById(b)}else if(typeof b==="object"&&1===b.nodeType){d=b}}if(!d){d=document.body}var g=typeof GameGlobal!=="undefined"?GameGlobal:window;if(g.linkCanvasParent&&a&&d){g.linkCanvasParent(a,d)}else if(g.setWxParent&&a){g.setWxParent(a,d||document.body)}return a}var d;return void 0===c&&(c=!0),b&&("string"==typeof b?d=document.getElementById(b):"object"==typeof b&&1===b.nodeType&&(d=b)),d||(d=document.body),c&&d.style&&(d.style.overflow="hidden"),d.appendChild(a),a}';
    if (code.includes(addOld)) code = code.replace(addOld, addWx);

    const removeOld = 'removeFromDOM:function(a){a.parentNode&&a.parentNode.removeChild(a)}';
    const removeWx = 'removeFromDOM:function(a){if(window.__wx)return;a.parentNode&&a.parentNode.removeChild(a)}';
    if (code.includes(removeOld) && !code.includes('removeFromDOM:function(a){if(window.__wx)return')) {
      code = code.replace(removeOld, removeWx);
    }

    const stageBoot =
      'Stage.prototype.boot=function(){c.DOM.getOffset(this.game.canvas,this.offset),c.Canvas.setUserSelect(this.game.canvas,"none"),c.Canvas.setTouchAction(this.game.canvas,"none"),this.checkVisibility()}';
    const stageBootWx =
      'Stage.prototype.boot=function(){c.DOM.getOffset(this.game.canvas,this.offset),c.Canvas.setUserSelect(this.game.canvas,"none"),c.Canvas.setTouchAction(this.game.canvas,"none"),window.__wx?(this.disableVisibilityChange=!0):this.checkVisibility()}';
    if (code.includes(stageBoot)) code = code.replace(stageBoot, stageBootWx);

    const getOffsetOld = 'getOffset:function(a,b){b=b||new c.Point;var d=a.getBoundingClientRect()';
    const getOffsetWx =
      'getOffset:function(a,b){b=b||new c.Point;if(window.__wx){b.x=0;b.y=0;return b}var d=a.getBoundingClientRect()';
    if (code.includes(getOffsetOld)) code = code.replace(getOffsetOld, getOffsetWx);

    const scrollOld = 'scrollTop:function(){var a=this.compatibility.scrollTo;a&&window.scrollTo(a.x,a.y)}';
    const scrollWx =
      'scrollTop:function(){if(window.__wx)return;var a=this.compatibility.scrollTo;a&&typeof window.scrollTo==="function"&&window.scrollTo(a.x,a.y)}';
    if (code.includes(scrollOld)) code = code.replace(scrollOld, scrollWx);

    const webGlDeviceOld =
      'l.webGL=function(){try{var a=document.createElement("canvas");return a.screencanvas=!1,!!window.WebGLRenderingContext&&(a.getContext("webgl")||a.getContext("experimental-webgl"))}catch(a){return!1}}()';
    const webGlDeviceWx =
      'l.webGL=function(){try{if(window.__wx){var a=window.canvas||(typeof GameGlobal!=="undefined"?GameGlobal.canvas:null);if(!a)return!1;var e={stencil:!0};return!!(a.getContext&&(a.getContext("webgl",e)||a.getContext("experimental-webgl",e)))}var a=document.createElement("canvas");return a.screencanvas=!1,!!window.WebGLRenderingContext&&(a.getContext("webgl")||a.getContext("experimental-webgl"))}catch(a){return!1}}()';
    if (code.includes(webGlDeviceOld) && !code.includes('if(window.__wx){var a=window.canvas')) {
      code = code.replace(webGlDeviceOld, webGlDeviceWx);
    }

    const webGlBranchOld =
      'else this.renderType=c.WEBGL,this.renderer=new PIXI.WebGLRenderer(this),this.context=null,this.canvas.addEventListener("webglcontextlost",this.contextLost.bind(this),!1),this.canvas.addEventListener("webglcontextrestored",this.contextRestored.bind(this),!1)';
    const webGlBranchWx =
      'else try{this.renderType=c.WEBGL,this.renderer=new PIXI.WebGLRenderer(this),this.context=null,this.canvas.addEventListener("webglcontextlost",this.contextLost.bind(this),!1),this.canvas.addEventListener("webglcontextrestored",this.contextRestored.bind(this),!1)}catch(__wxGlErr){console.warn("[phaser26] WebGL failed, fallback Canvas",__wxGlErr);if(!this.device.canvas){if(window.__wx&&this.canvas)this.device.canvas=!0;if(!this.device.canvas)throw new Error("Phaser.Game - Cannot create Canvas or WebGL context, aborting.")}this.renderType=c.CANVAS,this.renderer=new PIXI.CanvasRenderer(this),this.context=this.renderer.context}';
    if (code.includes(webGlBranchOld) && !code.includes('[phaser26] WebGL failed')) {
      code = code.replace(webGlBranchOld, webGlBranchWx);
    }

    const alignOld = 'alignCanvas:function(a,b){var c=this.getParentBounds(this._tempBounds)';
    const alignWx =
      'alignCanvas:function(a,b){if(window.__wx){this.margin.left=this.margin.right=this.margin.top=this.margin.bottom=0;this.margin.x=this.margin.y=0;return}var c=this.getParentBounds(this._tempBounds)';
    if (code.includes(alignOld) && !code.includes('if(window.__wx){this.margin.left=this.margin.right')) {
      code = code.replace(alignOld, alignWx);
    }
  }

  // 微信 EXACT_FIT：只修正 input.scale，不改 scale.width/height（避免画面放大）
  if (!code.includes('__wxPhaser26InpScale')) {
    const scaleV2Block =
      'updateScalingAndBounds:function(){/*__wxPhaser26ScaleV2*/if(window.__wx){try{var __wi=typeof wx!=="undefined"&&wx.getSystemInfoSync?wx.getSystemInfoSync():null;var __ww=__wi&&__wi.windowWidth?__wi.windowWidth:(window.innerWidth||0);var __wh=__wi&&__wi.windowHeight?__wi.windowHeight:(window.innerHeight||0);if(__ww>0)this.width=__ww;if(__wh>0)this.height=__wh}catch(__e){}}this.scaleFactor.x=this.width?this.game.width/this.width:1,this.scaleFactor.y=this.height?this.game.height/this.height:1,this.scaleFactorInversed.x=this.game.width?this.width/this.game.width:1,this.scaleFactorInversed.y=this.height?this.height/this.game.height:1,this.aspectRatio';
    const scaleOld =
      'updateScalingAndBounds:function(){this.scaleFactor.x=this.game.width/this.width,this.scaleFactor.y=this.game.height/this.height,this.scaleFactorInversed.x=this.width/this.game.width,this.scaleFactorInversed.y=this.height/this.game.height';
    const scaleWxOld =
      'updateScalingAndBounds:function(){if(window.__wx&&(!this.width||!this.height)){var __c=window.canvas||(typeof GameGlobal!=="undefined"?GameGlobal.canvas:null);if(__c&&__c.width>0){this.width=__c.width;this.height=__c.height}else if(typeof wx!=="undefined"&&wx.getSystemInfoSync){try{var __wi=wx.getSystemInfoSync();if(!this.width)this.width=__wi.windowWidth||375;if(!this.height)this.height=__wi.windowHeight||667}catch(__e){}}}this.scaleFactor.x=this.width?this.game.width/this.width:1,this.scaleFactor.y=this.height?this.game.height/this.height:1,this.scaleFactorInversed.x=this.game.width?this.width/this.game.width:1,this.scaleFactorInversed.y=this.height?this.height/this.game.height:1,this.aspectRatio';
    const inpScaleTail =
      'this.game.input&&this.game.input.scale&&this.game.input.scale.setTo(this.scaleFactor.x,this.scaleFactor.y)';
    const inpScaleWx =
      'this.game.input&&this.game.input.scale&&(this.game.input.scale.setTo(this.scaleFactor.x,this.scaleFactor.y),window.__wx&&/*__wxPhaser26InpScale*/(function(_inp,_g){try{var __wi=typeof wx!=="undefined"&&wx.getSystemInfoSync?wx.getSystemInfoSync():null;var __ww=__wi&&__wi.windowWidth?__wi.windowWidth:(window.innerWidth||0);var __wh=__wi&&__wi.windowHeight?__wi.windowHeight:(window.innerHeight||0);if(__ww>0&&__wh>0){var __sx=_g.width/__ww,__sy=_g.height/__wh;_inp.setTo(__sx,__sy)}}catch(__e){}})(this.game.input.scale,this.game))';
    if (code.includes(scaleV2Block)) {
      code = code.replace(scaleV2Block, scaleWxOld);
    } else if (code.includes(scaleOld) && !code.includes('__wxPhaser26ScaleV2')) {
      code = code.replace(scaleOld, scaleWxOld);
    }
    if (code.includes(inpScaleTail) && !code.includes('__wxPhaser26InpScale')) {
      code = code.replace(inpScaleTail, inpScaleWx);
    }
  }

  if (!code.includes('__wxPhaser26Touch')) {
    const touch26Old =
      '("ontouchstart"in document.documentElement||window.navigator.maxTouchPoints&&window.navigator.maxTouchPoints>=1)&&(l.touch=!0)';
    const touch26Wx =
      '("ontouchstart"in document.documentElement||window.navigator.maxTouchPoints&&window.navigator.maxTouchPoints>=1)&&(l.touch=!0),window.__wx&&(l.touch=!0)/*__wxPhaser26Touch*/';
    if (code.includes(touch26Old)) {
      code = code.replace(touch26Old, touch26Wx);
    }
  }

  // 微信 EXACT_FIT：触控按 game/inner 比例映射（不依赖 currentScaleMode 时序）
  if (!code.includes('__wxPhaser26PointerV3')) {
    const ptrV2 =
      'this.x=window.__wx?(function(_px,_g,_sm,_d){var _pw=window.innerWidth||1,_ph=window.innerHeight||1;if(_sm.currentScaleMode===0)return _px*(_g.width/_pw);var _mx=Math.max(0,(_pw-_sm.width)/2);return(_px-_mx-_sm.offset.x)*_d.scale.x})(this.pageX,this.game,this.game.scale,d):(this.pageX-this.game.scale.offset.x)*d.scale.x,this.y=window.__wx?(function(_py,_g,_sm,_d){var _pw=window.innerWidth||1,_ph=window.innerHeight||1;if(_sm.currentScaleMode===0)return _py*(_g.height/_ph);var _my=Math.max(0,(_ph-_sm.height)/2);return(_py-_my-_sm.offset.y)*_d.scale.y})(this.pageY,this.game,this.game.scale,d):(this.pageY-this.game.scale.offset.y)*d.scale.y/*__wxPhaser26PointerV2*/';
    const ptrV3 =
      'this.x=window.__wx?(function(_px,_g){var _pw=window.innerWidth||1;return _px*(_g.width/_pw)})(this.pageX,this.game):(this.pageX-this.game.scale.offset.x)*d.scale.x,this.y=window.__wx?(function(_py,_g){var _ph=window.innerHeight||1;return _py*(_g.height/_ph)})(this.pageY,this.game):(this.pageY-this.game.scale.offset.y)*d.scale.y/*__wxPhaser26PointerV3*/';
    if (code.includes(ptrV2)) {
      code = code.replace(ptrV2, ptrV3);
    } else if (!code.includes('__wxPhaser26Pointer')) {
      const ptrV1 =
        'this.x=window.__wx?(function(_px,_sm,_d){var _pw=window.innerWidth||_sm.width,_ph=window.innerHeight||_sm.height,_mx=Math.max(0,(_pw-_sm.width)/2);return(_px-_mx-_sm.offset.x)*_d.scale.x})(this.pageX,this.game.scale,d):(this.pageX-this.game.scale.offset.x)*d.scale.x,this.y=window.__wx?(function(_py,_sm,_d){var _pw=window.innerWidth||_sm.width,_ph=window.innerHeight||_sm.height,_my=Math.max(0,(_ph-_sm.height)/2);return(_py-_my-_sm.offset.y)*_d.scale.y})(this.pageY,this.game.scale,d):(this.pageY-this.game.scale.offset.y)*d.scale.y/*__wxPhaser26Pointer*/';
      if (code.includes(ptrV1)) {
        code = code.replace(ptrV1, ptrV3);
      } else {
        const ptrOld =
          'this.x=(this.pageX-this.game.scale.offset.x)*d.scale.x,this.y=(this.pageY-this.game.scale.offset.y)*d.scale.y';
        if (code.includes(ptrOld)) {
          code = code.replace(ptrOld, ptrV3);
        }
      }
    }
  }

  if (!code.includes('__wxPhaser26TouchDoc')) {
    const touchAddOld =
      'this.game.canvas.addEventListener("touchstart",this._onTouchStart,!1),this.game.canvas.addEventListener("touchmove",this._onTouchMove,!1),this.game.canvas.addEventListener("touchend",this._onTouchEnd,!1),this.game.canvas.addEventListener("touchcancel",this._onTouchCancel,!1)';
    const touchAddWx =
      '/*__wxPhaser26TouchDoc*/(window.__wx?document:this.game.canvas).addEventListener("touchstart",this._onTouchStart,!1),(window.__wx?document:this.game.canvas).addEventListener("touchmove",this._onTouchMove,!1),(window.__wx?document:this.game.canvas).addEventListener("touchend",this._onTouchEnd,!1),(window.__wx?document:this.game.canvas).addEventListener("touchcancel",this._onTouchCancel,!1)';
    if (code.includes(touchAddOld)) {
      code = code.replace(touchAddOld, touchAddWx);
    }

    const touchRmOld =
      'this.game.canvas.removeEventListener("touchstart",this._onTouchStart),this.game.canvas.removeEventListener("touchmove",this._onTouchMove),this.game.canvas.removeEventListener("touchend",this._onTouchEnd),this.game.canvas.removeEventListener("touchenter",this._onTouchEnter),this.game.canvas.removeEventListener("touchleave",this._onTouchLeave),this.game.canvas.removeEventListener("touchcancel",this._onTouchCancel))';
    const touchRmWx =
      '/*__wxPhaser26TouchDoc*/(window.__wx?document:this.game.canvas).removeEventListener("touchstart",this._onTouchStart),(window.__wx?document:this.game.canvas).removeEventListener("touchmove",this._onTouchMove),(window.__wx?document:this.game.canvas).removeEventListener("touchend",this._onTouchEnd),(window.__wx?document:this.game.canvas).removeEventListener("touchenter",this._onTouchEnter),(window.__wx?document:this.game.canvas).removeEventListener("touchleave",this._onTouchLeave),(window.__wx?document:this.game.canvas).removeEventListener("touchcancel",this._onTouchCancel),window.__wx&&(this._onTouchStart=null,this._onTouchMove=null,this._onTouchEnd=null,this._onTouchEnter=null,this._onTouchLeave=null,this._onTouchCancel=null))';
    if (code.includes(touchRmOld)) {
      code = code.replace(touchRmOld, touchRmWx);
    }

    const mouseAddOld = 'var c=this.game.canvas;c.addEventListener("mousedown",this._onMouseDown,!0)';
    const mouseAddWx =
      '/*__wxPhaser26TouchDoc*/var c=window.__wx?document:this.game.canvas;c.addEventListener("mousedown",this._onMouseDown,!0)';
    if (code.includes(mouseAddOld)) {
      code = code.replace(mouseAddOld, mouseAddWx);
    }
  }

  if (!code.includes('__wxPhaser26DeviceCanvas')) {
    const canvasDeviceOld = 'l.canvas=!!window.CanvasRenderingContext2D||l.cocoonJS';
    const canvasDeviceWx =
      'l.canvas=!!window.CanvasRenderingContext2D||l.cocoonJS/*__wxPhaser26DeviceCanvas*/||(window.__wx&&!!(window.canvas||(typeof GameGlobal!=="undefined"?GameGlobal.canvas:null)))';
    if (code.includes(canvasDeviceOld) && !code.includes('__wxPhaser26DeviceCanvas')) {
      code = code.replace(canvasDeviceOld, canvasDeviceWx);
    }

    const setupHeadOld = 'setUpRenderer:function(){if(/*__wxPhaser26Render*/';
    const setupHeadWx =
      'setUpRenderer:function(){if(window.__wx){var __wxCv=window.canvas||(typeof GameGlobal!=="undefined"?GameGlobal.canvas:null);if(__wxCv){this.device.canvas=!0;if(!this.canvas)this.canvas=__wxCv}}if(/*__wxPhaser26Render*/';
    if (code.includes(setupHeadOld)) {
      code = code.replace(setupHeadOld, setupHeadWx);
    }

    const noCanvasThrow =
      'if(!this.device.canvas)throw new Error("Phaser.Game - Cannot create Canvas or WebGL context, aborting.")';
    const noCanvasThrowWx =
      'if(!this.device.canvas){if(window.__wx&&this.canvas)this.device.canvas=!0;if(!this.device.canvas)throw new Error("Phaser.Game - Cannot create Canvas or WebGL context, aborting.")}';
    if (code.includes(noCanvasThrow) && !code.includes('if(window.__wx&&this.canvas)this.device.canvas')) {
      code = code.replaceAll(noCanvasThrow, noCanvasThrowWx);
    }
  }

  if (code === before) return false;
  fs.writeFileSync(filePath, code);
  return true;
}

/** Phaser 2.6 引擎段：PIXI/Phaser 直接挂 GameGlobal；Phaser 命名空间强制新建 c */
export function applyPhaser26EngineShim(code) {
  if (code.includes('__wxPhaser26EngineShim')) return code;

  const wxRoot = PHASER26_WX_GLOBAL_EXPR;
  const marker = /:a\.PIXI=b,b\}\.call\([^)]+\),function\(\)\{/;
  const m = code.match(marker);
  if (!m) return code;

  const idx = code.indexOf(m[0]);
  let head = code.slice(0, idx).replace(/new Phaser\./g, 'new __wxG.Phaser.');
  head = head.replace(
    /if\("object"==typeof exports\)module\.exports=a\(\)/,
    `if("object"==typeof exports&&typeof window!=="undefined"&&window.__wx){(${wxRoot}).p2=a()}else if("object"==typeof exports)module.exports=a()`,
  );

  const exportFix = `:a.PIXI=b,(${wxRoot}).PIXI=b,b}.call(${wxRoot}),function(){`;
  const inject =
    '/*__wxPhaser26EngineShim*/' +
    `var __wxRoot=${wxRoot};` +
    'var PIXI=__wxRoot.PIXI;' +
    'if(!PIXI)throw new Error("[phaser26] PIXI missing on GameGlobal after export");';

  let tail = code.slice(idx + m[0].length);
  tail = tail.replace(
    /var b=typeof GameGlobal!=="undefined"\?GameGlobal:typeof window!=="undefined"\?window:this,c=c\|\|\{VERSION:"2\.6\.2"/,
    'var b=__wxRoot,c={VERSION:"2.6.2"',
  );
  tail = tail.replace(
    /:b\.Phaser=c,c\}\.call\([^)]+\);/,
    `:b.Phaser=c,(__wxRoot).Phaser=c,typeof __wxG!=="undefined"&&(__wxG.Phaser=c),c}.call(${wxRoot});`,
  );

  return `${head}${exportFix}${inject}${tail}`;
}

/** AppLovin 游戏脚本段：模块作用域内裸 Phaser/PIXI → __wxG */
export function applyPhaser26GameScriptsShim(code) {
  if (code.includes('__wxPhaser26GameShim')) return code;
  const out = code
    .replace(/([^.\w$])PIXI\./g, '$1__wxG.PIXI.')
    .replace(/([^.\w$])Phaser\./g, '$1__wxG.Phaser.')
    .replace(/new Phaser\./g, 'new __wxG.Phaser.')
    .replace(/new Phaser\b/g, 'new __wxG.Phaser')
    .replace(/new PIXI\./g, 'new __wxG.PIXI.')
    .replace(/new PIXI\b/g, 'new __wxG.PIXI')
    .replace(/typeof Phaser\b/g, 'typeof __wxG.Phaser')
    .replace(/typeof PIXI\b/g, 'typeof __wxG.PIXI');
  return `/*__wxPhaser26GameShim*/${out}`;
}

/** AppLovin CustomLoader：微信跳过 FontFaceObserver，避免 this.game.add 崩溃 */
export function sanitizePhaser26CustomLoaderForWx(code) {
  if (code.includes('__wxPhaser26CustomLoader')) return code;
  let out = code;
  out = out.replace(
    /if\("webfont"===a\.type\)\{var r=this;new FontFaceObserver\(a\.url\)\.load\(null,1e4\)\.then\(function\(\)\{r\.asyncComplete\(a\)\},function\(\)\{r\.asyncComplete\(a,"Error loading font "\+a\.url\),this\.game\.add\.text\(35,35,"ERROR LOADING FONT",\{font:"60px monospace",fill:"#fff"\}\)\.anchor\.setTo\(\.5\)\}\)\}/,
    'if("webfont"===a.type){var r=this;if(typeof wx!=="undefined"||window.__wx){/*__wxPhaser26CustomLoader*/r.asyncComplete(a)}else{new FontFaceObserver(a.url).load(null,1e4).then(function(){r.asyncComplete(a)},function(){r.asyncComplete(a,"Error loading font "+a.url)})}}',
  );
  return out;
}

/** @deprecated 用 applyPhaser26EngineShim + applyPhaser26GameScriptsShim */
export function applyPhaser26ModuleScopeShim(code) {
  return applyPhaser26EngineShim(code);
}

export const PHASER26_WX_GLOBAL_PRELUDE =
  `var __wxG=${PHASER26_WX_GLOBAL_EXPR};` +
  `if(typeof GameGlobal!=="undefined")GameGlobal.__wxG=__wxG;` +
  `if(typeof window!=="undefined")window.__wxG=__wxG;`;

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

  out = applyHttpLoadAssetWxPatch(out);

  // 微信 canvas 非 GameCanvas id；手势解锁 / 音效 resume 需绑在 canvas 或 document
  out = out.replace(
    'function onGestureClicked(t){var e;var i=(e=document.getElementById("GameCanvas"))!==null&&e!==void 0?e:document;',
    'function onGestureClicked(t){var e;var i=(e=(typeof GameGlobal!=="undefined"&&GameGlobal.canvas)||(typeof window!=="undefined"&&window.canvas)||document.getElementById("GameCanvas"))!==null&&e!==void 0?e:document;',
  );

  // 默认 BGM 回退 bm_bgm0.mp3 在本工程不存在，改为 bm_bgm.mp3
  out = out.replace(
    'o.initAudioManager("game/audio/bm_bgm0.mp3",o.withPlay)',
    'o.initAudioManager("game/audio/bm_bgm.mp3",o.withPlay)',
  );

  // 微信 decodeAudioData 同步返回 WXAudioBuffer，勿对返回值 .catch()
  out = out.replace(
    'e===null||e===void 0?void 0:e.catch(function(t){return console.warn("failed to load Web Audio",t,i)})',
    '(e&&typeof e.catch==="function"?e.catch(function(t){return console.warn("failed to load Web Audio",t,i)}):void 0)',
  );

  // VPHand 每次 DOWN/MOVE/UP 打 log，拖拽时 touchmove 刷屏导致严重掉帧
  out = out.replace(
    'console.log("VPHand: ",t," uuid: ",this.gameObject.uuid)',
    'void 0',
  );

  // 擦除玩法（肥皂/刮胡刀）：阶段判定 + 全图像素扫描，去掉 debug log、加长节流、阶段事件防抖
  out = out.replace(
    'n.updateBMDRefrshInterval=100',
    'n.updateBMDRefrshInterval=(typeof wx!=="undefined"||window.__wx)?400:100',
  );
  out = out.replace(
    'console.log.apply(console,__spreadArray(["开始擦除"],__read(t),false))',
    'void 0',
  );
  out = out.replace(
    'console.log.apply(console,__spreadArray(["抬手"],__read(t),false))',
    'void 0',
  );
  out = out.replace(
    'console.log.apply(console,__spreadArray(["到达某一阶段"],__read(t),false))',
    'void 0',
  );
  out = out.replace(
    'console.log.apply(console,__spreadArray(["未到达某一阶段"],__read(t),false))',
    'void 0',
  );
  const checkFilledOld =
    'checkFilledPercentage=function(){var n=this;this.customEventArr.forEach(function(t){t.integrationArea.updateBMD();var e=t.integrationArea.filledPercentage;var i=n.findLeftRightValues(t.step,e);var r=i[0];var o=i[1];if(r){n.event.dispatch(c.eraseReachStep,n.gameObject.uuid,t.id,r);main.gameEvent.dispatch(c.eraseReachStep,n.gameObject.uuid,t.id,r)}if(o){n.event.dispatch(c.eraseUnReachStep,n.gameObject.uuid,t.id,o);main.gameEvent.dispatch(c.eraseUnReachStep,n.gameObject.uuid,t.id,o)}})}';
  const checkFilledWx =
    'checkFilledPercentage=function(){var n=this;if(!n._eraseStepCache)n._eraseStepCache={};this.customEventArr.forEach(function(t){t.integrationArea.updateBMD();var e=t.integrationArea.filledPercentage;var i=n.findLeftRightValues(t.step,e);var r=i[0];var o=i[1];var h=n._eraseStepCache[t.id]||{};if(r&&h.reach!==r){h.reach=r;if(typeof wx!=="undefined"||window.__wx){var __eg=typeof GameGlobal!=="undefined"?GameGlobal:window;__eg.__wxErasePastStep0=true}n.event.dispatch(c.eraseReachStep,n.gameObject.uuid,t.id,r);main.gameEvent.dispatch(c.eraseReachStep,n.gameObject.uuid,t.id,r)}if(o&&h.unreach!==o){h.unreach=o;n.event.dispatch(c.eraseUnReachStep,n.gameObject.uuid,t.id,o);main.gameEvent.dispatch(c.eraseUnReachStep,n.gameObject.uuid,t.id,o)}n._eraseStepCache[t.id]=h})}';
  if (out.includes(checkFilledOld)) {
    out = out.replace(checkFilledOld, checkFilledWx);
  }

  // 擦除蒙层：H5 中 game=qc_game.phaser，图集在 qc_game.assets._cache（非 game.assets）
  const wxEraseImgFn =
    '(function(__at,__u){var __i=__at&&__at.img;if(__i&&(__i.width|0)>1)return __i;var __qg=typeof qc_game!=="undefined"?qc_game:null;var __e=__qg&&__qg.assets&&__qg.assets._cache&&__qg.assets._cache._images&&__u&&__qg.assets._cache._images[__u];if(__e&&__e.data&&(__e.data.width|0)>1)return __e.data;var __c=game&&game.cache&&__u&&game.cache.getImage&&game.cache.getImage(__u);return __c&&(__c.data||__c.source)||null})';
  out = out.replace(
    's.context.drawImage(game.cache.getImage(e.texture.atlas.url),-o.width/2,-o.height/2,o.width,o.height)',
    `s.context.drawImage((function(){var __at=e.texture&&e.texture.atlas;var __url=__at&&__at.url;return ${wxEraseImgFn}(__at,__url)||game.cache.getImage(e.texture.atlas.url)})(),-o.width/2,-o.height/2,o.width,o.height)`,
  );
  out = out.replace(
    '}else{this._bmd.draw(e.texture.atlas.url,o.x,o.y,o.width,o.height)}break;',
    `}else{if(typeof wx!=="undefined"||window.__wx){var __at=e.texture&&e.texture.atlas;var __url=__at&&__at.url;var __img=${wxEraseImgFn}(__at,__url);var __self=t.gameObject===n.gameObject;var __dx=__self?0:o.x;var __dy=__self?0:o.y;var __dw=__self?n.gameObject.width:o.width;var __dh=__self?n.gameObject.height:o.height;if(__img){this._bmd.context.drawImage(__img,0,0,__img.width,__img.height,__dx,__dy,__dw,__dh)}else{this._bmd.draw(e.texture.atlas.url,__dx,__dy,__dw,__dh)}}else{this._bmd.draw(e.texture.atlas.url,o.x,o.y,o.width,o.height)}}break;`,
  );
  out = out.replace(
    'this._bmd.context.globalCompositeOperation="destination-out"};t.prototype.clearEraseTraces=function(){',
    `this._bmd.context.globalCompositeOperation="destination-out";if(typeof wx!=="undefined"||window.__wx){var __el=this,__ly=t,__bad=false;for(var __wi=0;__wi<__ly.length;__wi++){var __lt=__ly[__wi].eraseLayerType;if(__lt===0||__lt===1){var __g=__ly[__wi].gameObject;var __at=__g&&__g.texture&&__g.texture.atlas;var __url=__at&&__at.url;if(!${wxEraseImgFn}(__at,__url)){__bad=true;break}}}if(__bad||(__el.eraseLayerType!==10&&__el.totalPixels>0&&__el.transparentPixels>=__el.totalPixels)){__el._wxDeployTry=(__el._wxDeployTry||0)+1;if(__el._wxDeployTry<20){setTimeout(function(){__el.deploy(__ly)},100);return}__el._wxDeployTry=0}else{__el._wxDeployTry=0}}};t.prototype.clearEraseTraces=function(){`,
  );
  out = out.replace(
    't.prototype.onPointerMove=function(t,e,i){if(!this.isEnable)return;if(!this.gameObject.worldVisible)return;if(!this.equalId(t))return;var r=new qc.Point(e,i);this.eraseController(r);',
    't.prototype.onPointerMove=function(t,e,i){if(!this.isEnable)return;if(!this.gameObject.worldVisible)return;if(!this.equalId(t))return;if(typeof wx!=="undefined"||window.__wx){this._wxMoveAcc=(this._wxMoveAcc||0)+this.game.time.deltaTime;if(this._wxMoveAcc<36)return;this._wxMoveAcc=0}var r=new qc.Point(e,i);this.eraseController(r);',
  );
  out = out.replace(
    'var n=Math.sqrt(Math.pow(r.width,2)+Math.pow(r.height,2));var a=game.make.bitmapData(n,n);a.context.save();',
    'var n=Math.sqrt(Math.pow(r.width,2)+Math.pow(r.height,2));var a=(typeof wx!=="undefined"||window.__wx)?(this._wxBrushBmd&&this._wxBrushBmd.width===n?this._wxBrushBmd:(this._wxBrushBmd&&this._wxBrushBmd.destroy&&this._wxBrushBmd.destroy(),this._wxBrushBmd=game.make.bitmapData(n,n))):game.make.bitmapData(n,n);if(a.clear)a.clear();a.context.save();',
  );
  out = out.replace(
    'a.context.drawImage(game.cache.getImage(t.customImg.texture.atlas.url),-r.width/2,-r.height/2,r.width,r.height);',
    `a.context.drawImage((function(){var __at=t.customImg&&t.customImg.texture&&t.customImg.texture.atlas;var __url=__at&&__at.url;return ${wxEraseImgFn}(__at,__url)||game.cache.getImage(t.customImg.texture.atlas.url)})(),-r.width/2,-r.height/2,r.width,r.height);`,
  );
  out = out.replace(
    'this._bmd.dirty=true;return this.eraseLayerType!==l.EraseLayerType.INTEGRATE_CUSTOM_JUDGMENT_AREAS};t.prototype.updateBMD=function(){',
    'if(typeof wx!=="undefined"||window.__wx){var __me=this;var __now=Date.now();if(!__me._wxLastBmd||__now-__me._wxLastBmd>48){__me._wxLastBmd=__now;this._bmd.dirty=true;this._bmd.update()}}else{this._bmd.dirty=true}return this.eraseLayerType!==l.EraseLayerType.INTEGRATE_CUSTOM_JUDGMENT_AREAS};t.prototype.updateBMD=function(){',
  );

  return out;
}

/** PlaySmart audioManager：微信本地 resource/ 须 readFile，兼容 concat 与 + 两种 minify */
export function applyHttpLoadAssetWxPatch(out) {
  if (out.includes('readFile fail:')) return out;
  const httpLoadAssetWx =
    'function httpLoadAsset(t,e){if(typeof wx!=="undefined"&&wx.getFileSystemManager&&t&&!/^https?:\\/\\//i.test(t)){var fs=wx.getFileSystemManager();var path=String(t).replace(/^\\.\\//,"").replace(/^\\//,"");var paths=[path];if(!/\\.bin$/i.test(path))paths.push(path+".bin");var am=path.match(/audio_([a-f0-9]+)\\.mp3/i);if(am){var ah=am[1];paths.push("resource/game/audio/audio_"+ah+".mp3.bin");paths.push("assets/audio_"+ah+"_mp3.mp3")}if(/bm_bgm\\.mp3/i.test(path)){paths.push("resource/game/audio/bm_bgm.mp3.bin");paths.push("assets/bm_bgm_mp3.mp3")}var idx=0;var read=function(){fs.readFile({filePath:paths[idx],success:function(res){if(e)e(null,res.data)},fail:function(err){idx++;if(idx<paths.length)return read();if(e)e(new Error((err&&err.errMsg)||"readFile fail: "+paths[idx-1]))}})};read();return}var i=new XMLHttpRequest;var r="download failed: "+t+", status: ";i.open("GET",t,true);i.responseType="arraybuffer";i.onload=function(){if(i.status===200||i.status===0){if(e){e(null,i.response)}}else if(e){e(new Error(""+r+i.status+"(no response)"))}};i.onerror=function(){if(e){e(new Error(""+r+i.status+"(error)"))}};i.ontimeout=function(){if(e){e(new Error(""+r+i.status+"(time out)"))}};i.onabort=function(){if(e){e(new Error(""+r+i.status+"(abort)"))}};i.send(null)}';
  const variants = [
    'function httpLoadAsset(t,e){var i=new XMLHttpRequest;var r="download failed: ".concat(t,", status: ");i.open("GET",t,true);i.responseType="arraybuffer";i.onload=function(){if(i.status===200||i.status===0){if(e){e(null,i.response)}}else if(e){e(new Error("".concat(r).concat(i.status,"(no response)")))}};i.onerror=function(){if(e){e(new Error("".concat(r).concat(i.status,"(error)")))}};i.ontimeout=function(){if(e){e(new Error("".concat(r).concat(i.status,"(time out)")))}};i.onabort=function(){if(e){e(new Error("".concat(r).concat(i.status,"(abort)")))}};i.send(null)}',
    'function httpLoadAsset(t,e){var i=new XMLHttpRequest;var r="download failed: "+t+", status: ";i.open("GET",t,true);i.responseType="arraybuffer";i.onload=function(){if(i.status===200||i.status===0){if(e){e(null,i.response)}}else if(e){e(new Error(""+r+i.status+"(no response)"))}};i.onerror=function(){if(e){e(new Error(""+r+i.status+"(error)"))}};i.ontimeout=function(){if(e){e(new Error(""+r+i.status+"(time out)"))}};i.onabort=function(){if(e){e(new Error(""+r+i.status+"(abort)"))}};i.send(null)}',
    'function httpLoadAsset(t,e){if(typeof wx!=="undefined"&&wx.getFileSystemManager&&t&&!/^https?:\\/\\//i.test(t)){var fs=wx.getFileSystemManager();var path=String(t).replace(/^\\.\\//,"").replace(/^\\//,"");var paths=[path];if(!/\\.bin$/i.test(path))paths.push(path+".bin");var idx=0;var read=function(){fs.readFile({filePath:paths[idx],success:function(res){if(e)e(null,res.data)},fail:function(err){idx++;if(idx<paths.length)return read();if(e)e(new Error((err&&err.errMsg)||"readFile fail: "+path))}})};read();return}var i=new XMLHttpRequest;var r="download failed: ".concat(t,", status: ");i.open("GET",t,true);i.responseType="arraybuffer";i.onload=function(){if(i.status===200||i.status===0){if(e){e(null,i.response)}}else if(e){e(new Error("".concat(r).concat(i.status,"(no response)")))}};i.onerror=function(){if(e){e(new Error("".concat(r).concat(i.status,"(error)")))}};i.ontimeout=function(){if(e){e(new Error("".concat(r).concat(i.status,"(time out)")))}};i.onabort=function(){if(e){e(new Error("".concat(r).concat(i.status,"(abort)")))}};i.send(null)}',
  ];
  for (const old of variants) {
    if (out.includes(old)) {
      out = out.replace(old, httpLoadAssetWx);
      break;
    }
  }
  return out;
}

/** @deprecated use sanitizeGameScriptsForWx */
export function dedupeBabelTypeof(code) {
  return sanitizeGameScriptsForWx(code);
}

export function sanitizeLibScript(name, code) {
  if (name === 'webfontloader.js') {
    return sanitizeWebfontLoaderForWx(code);
  }

  if (name === 'qc-core-min.js') {
    return sanitizeQcCoreForWx(code);
  }

  if (name === 'languagesMgr.js') {
    code = code.replace(
      /window\.location\.search\.substr\(1\)/g,
      '(window.location.search||"").substr(1)',
    );
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
    /parent: 'gameDiv',\r?\n(\s*)state: qici\.splashState,/,
    "parent: 'gameDiv',\n$1canvas: (typeof window!=='undefined'&&window.canvas)||(typeof GameGlobal!=='undefined'&&GameGlobal.canvas),\n$1state: qici.splashState,",
  );
  code = code.replace(
    /renderer: qici\.config\.renderer === 'Canvas' \? Phaser\.CANVAS : Phaser\.AUTO/,
    "renderer: (typeof window!=='undefined'&&window.__wx)?Phaser.AUTO:(qici.config.renderer === 'Canvas' ? Phaser.CANVAS : Phaser.AUTO)",
  );
  code = code.replace(
    /renderer: \(typeof window!=='undefined'&&window\.__wx\)\?Phaser\.CANVAS:/,
    "renderer: (typeof window!=='undefined'&&window.__wx)?Phaser.AUTO:",
  );
  code = code.replace(
    /init: function \(\) \{\s*if \(!window\.__wx\) \{\s*window\[qici\.config\.gameInstance\]\.fullScreen\(\);\s*\}/,
    'init: function () {\n        window[qici.config.gameInstance].fullScreen();',
  );
  code = code.replace(
    /init: function \(\) \{\s*window\[qici\.config\.gameInstance\]\.fullScreen\(\);/,
    'init: function () {\n        window[qici.config.gameInstance].fullScreen();',
  );
  code = code.replace(
    /create: function \(\) \{\s*if \(window\.__wx\) \{\s*window\[qici\.config\.gameInstance\]\.fullScreen\(\);\s*\}\s*var game = window\[qici\.config\.gameInstance\];/,
    'create: function () {\n        var game = window[qici.config.gameInstance];',
  );
  code = code.replace(
    /window\.addEventListener\('load', function \(\) \{ qici\.init\(\); \}\);\s*$/,
    'window.qici=qici;\n',
  );
  // loadGame 保持 100%，由 ScaleAdapter 控制布局，勿强行注入 canvas/window 像素尺寸
  code = code.replace(
    /var width = '100%';\r?\n\s*var height = '100%';\r?\n\s*if \(typeof wx !== 'undefined' \|\| window\.__wx\) \{[\s\S]*?\}\r?\n/,
    "var width = '100%';\n    var height = '100%';\n",
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

  // updateGameLayout：World 未就绪时跳过；wx 同样需 _adjustToFullScreen（setGameSize）
  const updateGameLayoutWx =
    'updateGameLayout=function(t){if(this._adjustToFullScreen&&this.phaser&&this.phaser.isBooted&&this.world){this._adjustToFullScreen(t)}if(this.world&&this.world.updateDomRoot)this.world.updateDomRoot()}';
  out = out.replace(
    /updateGameLayout=function\(t\)\{if\(this\._adjustToFullScreen\)\{this\._adjustToFullScreen\(t\)\}this\.world\.updateDomRoot\(\)\}/,
    updateGameLayoutWx,
  );
  out = out.replace(
    /updateGameLayout=function\(t\)\{if\(this\._adjustToFullScreen&&!D\.__wx&&this\.phaser&&this\.phaser\.isBooted&&this\.world\)\{this\._adjustToFullScreen\(t\)\}if\(this\.world&&this\.world\.updateDomRoot\)this\.world\.updateDomRoot\(\)\}/,
    updateGameLayoutWx,
  );
  out = out.replace(
    /updateGameLayout=function\(t\)\{if\(this\._adjustToFullScreen&&this\.phaser&&this\.phaser\.isBooted&&this\.world\)\{this\._adjustToFullScreen\(t\)\}if\(this\.world&&this\.world\.updateDomRoot\)this\.world\.updateDomRoot\(\)\}/,
    updateGameLayoutWx,
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

  out = out.replace(
    /this\._toWorld\(this\.generator,r\.clientX,r\.clientY\)/g,
    'this._toWorld(this.generator,r.clientX!=null?r.clientX:r.x,r.clientY!=null?r.clientY:r.y)',
  );

  // 微信：与 Phaser Pointer 一致，用 scale.offset + input.scale 映射触控（宽适配含 letterbox）
  const toWorldOld =
    '_toWorld=function(t,e,i){var r=this.game.canvas;var a=this.game.phaser.scale.scaleFactor;var n=r.ownerDocument===(this.generator.ownerDocument||this.generator.document)?r.getBoundingClientRect():this.generator.getBoundingClientRect&&this.generator.getBoundingClientRect()||{left:0,top:0};return{x:(e-n.left)*a.x,y:(i-n.top)*a.y}}';
  const toWorldWxV1 =
    '_toWorld=function(t,e,i){if(D.__wx){var ph=this.game.phaser;var sc=ph.scale;var off=sc.offset||{x:0,y:0};var inp=ph.input&&ph.input.scale?ph.input.scale:sc.scaleFactor;var m=sc.margin||{};var px=(e!=null?e:0)-(m.left||0);var py=(i!=null?i:0)-(m.top||0);return{x:(px-off.x)*inp.x,y:(py-off.y)*inp.y}}var r=this.game.canvas;var a=this.game.phaser.scale.scaleFactor;var n=r.ownerDocument===(this.generator.ownerDocument||this.generator.document)?r.getBoundingClientRect():this.generator.getBoundingClientRect&&this.generator.getBoundingClientRect()||{left:0,top:0};return{x:(e-n.left)*a.x,y:(i-n.top)*a.y}}';
  const toWorldWx =
    '_toWorld=function(t,e,i){if(D.__wx){var ph=this.game.phaser;var sc=ph.scale;var _sw=sc.width||0;var _sh=sc.height||0;var m=(_sw&&_sh)?(sc.margin||{}):{left:0,top:0,right:0,bottom:0};var off=sc.offset||{x:0,y:0};var px=(e!=null?e:0)-(m.left||0);var py=(i!=null?i:0)-(m.top||0);var inp=ph.input&&ph.input.scale;var sx=inp&&isFinite(inp.x)?inp.x:NaN;var sy=inp&&isFinite(inp.y)?inp.y:NaN;if(_sw&&_sh&&(!isFinite(sx)||!isFinite(sy))&&sc.scaleFactor){if(!isFinite(sx)&&isFinite(sc.scaleFactor.x))sx=sc.scaleFactor.x;if(!isFinite(sy)&&isFinite(sc.scaleFactor.y))sy=sc.scaleFactor.y}if(!_sw||!_sh||!isFinite(sx)||!isFinite(sy)||!sx||!sy){var cdw=_sw,cdh=_sh,gww=ph.width||750,gwh=ph.height||1334;if(!cdw||!cdh){var __cv=D.canvas||(typeof GameGlobal!=="undefined"?GameGlobal.canvas:null);if(__cv&&__cv.width>0){cdw=__cv.width;cdh=__cv.height}else{if(!D.__wxSys&&typeof wx!=="undefined"&&wx.getSystemInfoSync){try{var __wi=wx.getSystemInfoSync();D.__wxSys={w:__wi.windowWidth||375,h:__wi.windowHeight||667}}catch(__e){D.__wxSys={w:375,h:667}}}var __s=D.__wxSys||{w:375,h:667};cdw=cdw||__s.w;cdh=cdh||__s.h}}return{x:px*gww/(cdw||1),y:py*gwh/(cdh||1)}}return{x:(px-(off.x||0))*sx,y:(py-(off.y||0))*sy}}var r=this.game.canvas;var a=this.game.phaser.scale.scaleFactor;var n=r.ownerDocument===(this.generator.ownerDocument||this.generator.document)?r.getBoundingClientRect():this.generator.getBoundingClientRect&&this.generator.getBoundingClientRect()||{left:0,top:0};return{x:(e-n.left)*a.x,y:(i-n.top)*a.y}}';
  const toWorldWxPrev3 =
    '_toWorld=function(t,e,i){if(D.__wx){var ph=this.game.phaser;var sc=ph.scale;var m=sc.margin||{};var off=sc.offset||{x:0,y:0};var px=(e!=null?e:0)-(m.left||0);var py=(i!=null?i:0)-(m.top||0);var inp=ph.input&&ph.input.scale;var sx=inp&&isFinite(inp.x)?inp.x:NaN;var sy=inp&&isFinite(inp.y)?inp.y:NaN;if((!isFinite(sx)||!isFinite(sy))&&sc.scaleFactor){if(!isFinite(sx)&&isFinite(sc.scaleFactor.x))sx=sc.scaleFactor.x;if(!isFinite(sy)&&isFinite(sc.scaleFactor.y))sy=sc.scaleFactor.y}if(!isFinite(sx)||!isFinite(sy)||!sx||!sy){var wi=typeof wx!=="undefined"&&wx.getSystemInfoSync?wx.getSystemInfoSync():null;var cdw=sc.width||(wi?wi.windowWidth:(D.innerWidth||375))||1;var cdh=sc.height||(wi?wi.windowHeight:(D.innerHeight||667))||1;var gww=ph.width||750;var gwh=ph.height||1334;return{x:px*gww/cdw,y:py*gwh/cdh}}return{x:(px-(off.x||0))*sx,y:(py-(off.y||0))*sy}}var r=this.game.canvas;var a=this.game.phaser.scale.scaleFactor;var n=r.ownerDocument===(this.generator.ownerDocument||this.generator.document)?r.getBoundingClientRect():this.generator.getBoundingClientRect&&this.generator.getBoundingClientRect()||{left:0,top:0};return{x:(e-n.left)*a.x,y:(i-n.top)*a.y}}';
  const toWorldWxPrev =
    '_toWorld=function(t,e,i){if(D.__wx){var ph=this.game.phaser;var sc=ph.scale;var m=sc.margin||{};var off=sc.offset||{x:0,y:0};var px=(e!=null?e:0)-(m.left||0);var py=(i!=null?i:0)-(m.top||0);var inp=ph.input&&ph.input.scale;var sx=inp&&isFinite(inp.x)?inp.x:NaN;var sy=inp&&isFinite(inp.y)?inp.y:NaN;if((!isFinite(sx)||!isFinite(sy))&&sc.scaleFactor){if(!isFinite(sx)&&isFinite(sc.scaleFactor.x))sx=sc.scaleFactor.x;if(!isFinite(sy)&&isFinite(sc.scaleFactor.y))sy=sc.scaleFactor.y}if(!isFinite(sx)||!isFinite(sy)||!sx||!sy){var wi=typeof wx!=="undefined"&&wx.getSystemInfoSync?wx.getSystemInfoSync():null;var __cv=D.canvas||(typeof GameGlobal!=="undefined"?GameGlobal.canvas:null);var ww=(__cv&&__cv.width)||(wi?wi.windowWidth:(D.innerWidth||375));var wh=(__cv&&__cv.height)||(wi?wi.windowHeight:(D.innerHeight||667));var cdw=sc.width||ww||1;var cdh=sc.height||wh||1;var gww=(sc.game&&sc.game.width)||ww;var gwh=(sc.game&&sc.game.height)||wh;return{x:px*gww/cdw,y:py*gwh/cdh}}return{x:(px-(off.x||0))*sx,y:(py-(off.y||0))*sy}}var r=this.game.canvas;var a=this.game.phaser.scale.scaleFactor;var n=r.ownerDocument===(this.generator.ownerDocument||this.generator.document)?r.getBoundingClientRect():this.generator.getBoundingClientRect&&this.generator.getBoundingClientRect()||{left:0,top:0};return{x:(e-n.left)*a.x,y:(i-n.top)*a.y}}';
  const toWorldWxPrev2 =
    '_toWorld=function(t,e,i){if(D.__wx){var ph=this.game.phaser;var sc=ph.scale;var m=sc.margin||{};var off=sc.offset||{x:0,y:0};var px=(e!=null?e:0)-(m.left||0);var py=(i!=null?i:0)-(m.top||0);var inp=ph.input&&ph.input.scale;var sx=inp&&isFinite(inp.x)?inp.x:NaN;var sy=inp&&isFinite(inp.y)?inp.y:NaN;if((!isFinite(sx)||!isFinite(sy))&&sc.scaleFactor){if(!isFinite(sx)&&isFinite(sc.scaleFactor.x))sx=sc.scaleFactor.x;if(!isFinite(sy)&&isFinite(sc.scaleFactor.y))sy=sc.scaleFactor.y}if(!isFinite(sx)||!isFinite(sy)||!sx||!sy){var wi=typeof wx!=="undefined"&&wx.getSystemInfoSync?wx.getSystemInfoSync():null;var ww=wi?wi.windowWidth:(D.innerWidth||375);var wh=wi?wi.windowHeight:(D.innerHeight||667);var cdw=sc.width||ww||1;var cdh=sc.height||wh||1;var gww=(sc.game&&sc.game.width)||ww;var gwh=(sc.game&&sc.game.height)||wh;return{x:px*gww/cdw,y:py*gwh/cdh}}return{x:(px-(off.x||0))*sx,y:(py-(off.y||0))*sy}}var r=this.game.canvas;var a=this.game.phaser.scale.scaleFactor;var n=r.ownerDocument===(this.generator.ownerDocument||this.generator.document)?r.getBoundingClientRect():this.generator.getBoundingClientRect&&this.generator.getBoundingClientRect()||{left:0,top:0};return{x:(e-n.left)*a.x,y:(i-n.top)*a.y}}';
  if (out.includes(toWorldOld)) {
    out = out.split(toWorldOld).join(toWorldWx);
  } else if (out.includes(toWorldWxV1)) {
    out = out.split(toWorldWxV1).join(toWorldWx);
  } else if (out.includes(toWorldWxPrev)) {
    out = out.split(toWorldWxPrev).join(toWorldWx);
  } else if (out.includes(toWorldWxPrev2)) {
    out = out.split(toWorldWxPrev2).join(toWorldWx);
  } else if (out.includes(toWorldWxPrev3)) {
    out = out.split(toWorldWxPrev3).join(toWorldWx);
  }

  // BaseInput generator 默认 D(window)，微信须 document 才能收到 adapter 触摸
  out = out.replace(
    /generator:\{get:function\(\)\{return this\._generator\|\|D\}/g,
    'generator:{get:function(){return this._generator||(D.__wx&&typeof document!=="undefined"?document:D)}',
  );

  // 微信 document 无 focus()，gainFocus 会抛错阻断 processTouchStart 后续命中
  out = out.replace(
    'gainFocus=function(t){if(this.generator!==D||D.parent&&D.parent!==D){this.generator.focus()}}',
    'gainFocus=function(t){if(D.__wx)return;if(this.generator!==D||D.parent&&D.parent!==D){if(this.generator.focus)this.generator.focus()}}',
  );

  // 微信：Touch/Mouse 默认监听 canvas.parentNode（gameDiv），与 document 触摸总线隔离 → 拖不动
  out = out.replace(
    /generator:\{get:function\(\)\{return this\._generator\|\|this\.game\.canvas\.parentNode\|\|this\.game\.canvas\}/g,
    'generator:{get:function(){return this._generator||(D.__wx?(typeof document!=="undefined"?document:D):(this.game.canvas.parentNode||this.game.canvas))}',
  );

  // 微信下强制启用 QC Touch（device.touch 检测可能失败）
  out = out.replace(
    /if\(!i\.touch\)\{this\._enable=false;return\}/,
    'if(!i.touch&&!D.__wx){this._enable=false;return}',
  );

  // 微信全屏：getSystemInfoSync 设 game 尺寸 + updateScale；__wxAdjusting 防 relayout 递归
  const fullScreenWxBranch =
    'if(D.__wx){var a,n;r._adjustToFullScreen=function(t){if(r.__wxAdjusting)return;if(r.isBooted&&r.input&&r.input.inputting)return;var info=(typeof wx!=="undefined"&&wx.getSystemInfoSync)?wx.getSystemInfoSync():{};var e=info.windowWidth||D.innerWidth||375;var i=info.windowHeight||D.innerHeight||667;if(a===e&&n===i&&!t)return;a=e;n=i;r.__wxAdjusting=true;try{if(r.device&&r.device.iOS){r.setGameSize(e-5,i+5);if(r.phaser&&r.phaser.time&&r.phaser.time.events){r.phaser.time.events.add(1,function(){r.setGameSize(e,i)})}}else{r.setGameSize(e,i)}if(r.container&&r.container.style){r.container.style.width=e+"px";r.container.style.height=i+"px"}r.updateScale()}finally{r.__wxAdjusting=false}};r._adjustToFullScreen();return}';
  out = out.replace(
    /L\.prototype\.fullScreen=function\(\)\{var r=this;if\(r\._adjustToFullScreen\)\{return\}/,
    'L.prototype.fullScreen=function(){var r=this;if(r._adjustToFullScreen){return}' + fullScreenWxBranch,
  );
  out = out.replace(
    /if\(D\.__wx\)\{r\._adjustToFullScreen=function\(\)\{\};return\}/g,
    fullScreenWxBranch,
  );
  out = out.replace(
    /if\(D\.__wx\)\{r\._adjustToFullScreen=function\(\)\{if\(!r\.phaser[\s\S]*?\};r\._adjustToFullScreen\(\);return\}/g,
    fullScreenWxBranch,
  );
  out = out.replace(
    /(?:if\(D\.__wx\)\{var a,n;r\._adjustToFullScreen=function\(t\)\{if\(r\.__wxAdjusting\)return;[\s\S]*?finally\{r\.__wxAdjusting=false\}\};r\._adjustToFullScreen\(\);return\}){2,}/,
    fullScreenWxBranch,
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
    'if(D.__wx){var ctr=e.game.container;if(ctr&&ctr.style)ctr.style.overflow="hidden";e.backDomRoot=document.createElement("div");e.backDomRoot.style.position="absolute";e.backDomRoot.style.left="0px";e.backDomRoot.style.top="0px";e.backDomRoot.style.overflow="hidden";e.frontDomRoot=document.createElement("div");e.frontDomRoot.style.position="absolute";e.frontDomRoot.style.left="0px";e.frontDomRoot.style.top="0px";e.frontDomRoot.style.overflow="hidden";if(D.wxDomAppend&&ctr){D.wxDomAppend(ctr,e.backDomRoot,e.game.canvas);D.wxDomAppend(ctr,e.frontDomRoot)}return}',
  );
  out = out.replace(
    /if\(t===Ne\.POS_BACK\)\{this\.game\.world\.backDomRoot\.appendChild\(this\.div\)/,
    'if(t===Ne.POS_BACK){if(this.game.world.backDomRoot)this.game.world.backDomRoot.appendChild(this.div)',
  );
  out = out.replace(
    /else if\(t===Ne\.POS_FRONT\)\{this\.game\.world\.frontDomRoot\.appendChild\(this\.div\)/,
    'else if(t===Ne.POS_FRONT){if(this.game.world.frontDomRoot)this.game.world.frontDomRoot.appendChild(this.div)',
  );

  // 微信走 resource/ 磁盘，勿因空 assetsPackage{} 误进 data.js 图集分支
  out = out.replace(
    /if\(D\.hasBase64&&D\.hasBase64\(\)\|\|D\.assetsPackage\)\{console\.log\("使用data\.js资源"\)/,
    'if(!D.__wx&&(D.hasBase64&&D.hasBase64()||D.assetsPackage&&Object.keys(D.assetsPackage).length)){console.log("使用data.js资源")',
  );

  // 图集纹理：base64 直挂（含 / 字符）；仅 resource 路径走 readFile
  const atlasTexWx =
    'if(typeof t=="string"){if(t.search("data")==0){b.src=t}else if(D.__wx&&(t.indexOf("iVBORw0KGgo")===0||t.indexOf("/9j/")===0||t.length>80&&!/^resource[/\\\\]/.test(t)&&!/\\.(png|jpg|jpeg|webp|bin)$/i.test(t)&&!(/^image_.+_(png|jpg)$/i.test(t)&&t.length<200)&&/^[A-Za-z0-9+/=]+$/.test(t.slice(0,64)))){b.src=(t.indexOf("/9j/")===0?"data:image/jpeg;base64,":"data:image/png;base64,")+t}else if(D.__wx&&typeof wx!=="undefined"&&wx.getFileSystemManager&&(/^resource[/\\\\]/.test(t)||/\\.(png|jpg|jpeg|webp)$/i.test(t)||(/^image_.+_(png|jpg)$/i.test(t)&&t.length<200))){var __wxImgPath=t;if(!/^resource[/\\\\]/.test(__wxImgPath)){__wxImgPath="resource/game/"+__wxImgPath.replace(/_png$/i,".png").replace(/_jpg$/i,".jpg")}__wxImgPath=__wxImgPath.replace(/^\\.\\//,"").replace(/^\\//,"");wx.getFileSystemManager().readFile({filePath:__wxImgPath,encoding:"base64",success:function(__r){b.src="data:image/png;base64,"+__r.data},fail:function(__e){console.error("[phaser2] atlas tex",__wxImgPath,__e);x()}})}else{b.src="data:image/png;base64,"+t}}else{b=t;w()}';
  out = out.replace(
    /if\(typeof t=="string"\)\{if\(t\.search\("data"\)==0\)\{b\.src=t\}else\{b\.src="data:image\/png;base64,"\+t\}\}else\{b=t;w\(\)\}/,
    atlasTexWx,
  );
  const atlasOldWx =
    'else if(D.__wx&&t.length>80&&t.indexOf("/")<0&&/^[A-Za-z0-9+/=]+$/.test(t)){b.src=(t.indexOf("/9j/")===0?"data:image/jpeg;base64,":"data:image/png;base64,")+t}else if(D.__wx&&typeof wx!=="undefined"&&wx.getFileSystemManager){var __wxImgPath=t;if(__wxImgPath.indexOf("/")<0){__wxImgPath="resource/game/"+__wxImgPath.replace(/_png$/i,".png").replace(/_jpg$/i,".jpg")}__wxImgPath=__wxImgPath.replace(/^\\.\\//,"").replace(/^\\//,"");wx.getFileSystemManager().readFile({filePath:__wxImgPath,encoding:"base64",success:function(__r){b.src="data:image/png;base64,"+__r.data},fail:function(__e){console.error("[phaser2] atlas tex",__wxImgPath,__e);x()}})}';
  const atlasNewWx =
    'else if(D.__wx&&(t.indexOf("iVBORw0KGgo")===0||t.indexOf("/9j/")===0||t.length>80&&!/^resource[/\\\\]/.test(t)&&!/\\.(png|jpg|jpeg|webp|bin)$/i.test(t)&&!(/^image_.+_(png|jpg)$/i.test(t)&&t.length<200)&&/^[A-Za-z0-9+/=]+$/.test(t.slice(0,64)))){b.src=(t.indexOf("/9j/")===0?"data:image/jpeg;base64,":"data:image/png;base64,")+t}else if(D.__wx&&typeof wx!=="undefined"&&wx.getFileSystemManager&&(/^resource[/\\\\]/.test(t)||/\\.(png|jpg|jpeg|webp)$/i.test(t)||(/^image_.+_(png|jpg)$/i.test(t)&&t.length<200))){var __wxImgPath=t;if(!/^resource[/\\\\]/.test(__wxImgPath)){__wxImgPath="resource/game/"+__wxImgPath.replace(/_png$/i,".png").replace(/_jpg$/i,".jpg")}__wxImgPath=__wxImgPath.replace(/^\\.\\//,"").replace(/^\\//,"");wx.getFileSystemManager().readFile({filePath:__wxImgPath,encoding:"base64",success:function(__r){b.src="data:image/png;base64,"+__r.data},fail:function(__e){console.error("[phaser2] atlas tex",__wxImgPath,__e);x()}})}';
  if (out.includes('t.indexOf("/")<0&&/^[A-Za-z0-9+/=]+$/.test(t)')) {
    out = out.replace(atlasOldWx, atlasNewWx);
  }

  // 图集入 Phaser cache，供 BitmapData.draw(url) 与擦除蒙层 deploy 使用
  out = out.replace(
    '_addAtlasToCache:function(t,e,i){var r=t.assets._cache._images[i];var a=new pt.Atlas(e,i,r,{uuid:t.math.uuid(),type:O.ASSET_ATLAS});a.img=r.data;t.assets.cache(e,i,a);return a}',
    '_addAtlasToCache:function(t,e,i){var r=t.assets._cache._images[i];var a=new pt.Atlas(e,i,r,{uuid:t.math.uuid(),type:O.ASSET_ATLAS});a.img=r.data;t.assets.cache(e,i,a);if(D.__wx&&t.phaser&&t.phaser.cache&&r&&r.data){try{if(!t.phaser.cache.checkImageKey(i))t.phaser.cache.addImage(i,i,r.data)}catch(_wxc){}}return a}',
  );

  // qc.UIText 渐变：addColorStop 须 CSS 色串，勿传 Color 对象（微信 canvas 抛 invalid params）
  out = out.replace(
    /this\._grid\.addColorStop\(0,this\.startColor\);this\._grid\.addColorStop\(1,this\.endColor\)/,
    'this._grid.addColorStop(0,this._startColor||(this.startColor&&this.startColor.toString?this.startColor.toString("rgb"):"rgb(255,255,255)"));this._grid.addColorStop(1,this._endColor||(this.endColor&&this.endColor.toString?this.endColor.toString("rgb"):"rgb(255,255,255)"))',
  );

  return out;
}

/** pl-adapter 模板函数含 with(obj||{})，微信编译器 strict 模式会报错 */
export function sanitizePlAdapterForWx(code) {
  code = code.replace(
    /with\(obj\|\|\{\}\)(__p\+)/g,
    'var data=(obj||{}).data||{};$1',
  );
  // 微信无完整 DOM：跳过 webpack style-loader 注入（removeAttribute 崩溃）
  code = code.replace(/t\(6\);function A\(\)/, '/*wx skip pl-adapter css*/function A()');
  // 微信 document.referrer 常为 undefined → indexOf 崩溃
  code = code.replace(/j=document\.referrer,F=/, 'j=document.referrer||"",F=');
  code = code.replace(
    /return j\.indexOf\(e\)>-1/g,
    'return (j||"").indexOf(e)>-1',
  );
  // 微信 location 无 search（weapp-adapter 仅 href）→ pl-adapter preview 检测 substr 崩溃
  code = code.replace(
    /window\.location\.search\.substr\(1\)/g,
    '(window.location.search||"").substr(1)',
  );
  return code;
}

/** 微信跳过自定义 TTF / FontFace（手机端不适配，且易触发加载链错误） */
export function sanitizeResourceLoaderForWx(code) {
  return (
    'window.MW_FONT_LIST={};' +
    'window.MW_LOAD_FONT=function(n,t,e){if(typeof t==="function")try{t([])}catch(r){}if(typeof e==="function")try{e()}catch(r){}};' +
    'window.MW_FONT_LOADER={version:"wx-skip",has:function(){return true},fetch:window.MW_LOAD_FONT,fontList:{}};' +
    'console.log("[phaser2] font loading disabled on wx");'
  );
}

/** webfontloader 走外链/DOM，微信下 stub 为立即 active */
export function sanitizeWebfontLoaderForWx(_code) {
  return (
    '(function(g){g=g||typeof GameGlobal!=="undefined"?GameGlobal:window;' +
    'g.WebFont={load:function(o){var d=o&&o.active,f=o&&o.inactive;setTimeout(function(){try{if(d)d()}catch(e){if(f)f()}},0);}};})();'
  );
}

export function sanitizePlayableScript(name, code) {
  if (name === 'pl-adapter.js') {
    return sanitizePlAdapterForWx(code);
  }
  if (name === 'resource-loader.js' || name === 'resource_loader.js') {
    return sanitizeResourceLoaderForWx(code);
  }
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
