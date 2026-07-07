/**
 * 将 sanitize 后的 replace_js 合并为微信工程 js/main.js（单文件 bundle）。
 */
import fs from 'fs';
import path from 'path';
import { findHtmlPath } from './game-sources.mjs';
import { extractMwConfigFromHtml } from './phaser2-wx-sanitize.mjs';
import { getWxProjectDir } from './wx-project.mjs';
import { patchPhaser2ForWx } from './patch-phaser2-for-wx.mjs';
import {
  sanitizeLibScript,
  sanitizePlayableScript,
  sanitizeQcCoreForWx,
  sanitizeGameScriptsForWx,
  applyHttpLoadAssetWxPatch,
} from './phaser2-wx-sanitize.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const wxRoot = getWxProjectDir();
const libDir = path.join(wxRoot, 'js/playable/lib');
const scrDir = path.join(wxRoot, 'js/playable/scripts');
const outPath = path.join(wxRoot, 'js/main.js');

/** 与 output.html 内 list 顺序一致 */
const BUNDLE_FILES = [
  { dir: scrDir, name: 'pl-adapter.js', optional: true },
  { dir: scrDir, name: 'globalUrlMap.js' },
  { dir: libDir, name: 'phaser.min.js', sanitize: 'lib' },
  { dir: libDir, name: 'webfontloader.js', sanitize: 'lib' },
  { dir: libDir, name: 'qc-core-min.js', sanitize: 'lib', patchWx: true },
  { dir: libDir, name: 'qc-webgl.js', sanitize: 'lib' },
  { dir: libDir, name: 'PlaySmartEditorData.js', sanitize: 'lib' },
  { dir: scrDir, name: 'picDesc.js' },
  { dir: scrDir, name: 'data.js', stub: true },
  { dir: scrDir, name: 'resource-loader.js' },
  { dir: scrDir, name: 'assetCountMap.js' },
  { dir: scrDir, name: 'game-scripts.min.js', sanitize: 'game' },
  { dir: libDir, name: 'qc-loading-debug.js', sanitize: 'lib' },
  { dir: libDir, name: 'languagesMgr.js', sanitize: 'lib' },
];

const DATA_JS_STUB = `
var assetsPackage = null;
var assetsPackageB64 = [];
var __wxG = typeof GameGlobal !== 'undefined' ? GameGlobal : typeof window !== 'undefined' ? window : this;
__wxG.assetsPackage = assetsPackage;
if (typeof window !== 'undefined') window.assetsPackage = assetsPackage;
`.trim();

function readPart(entry) {
  const filePath = path.join(entry.dir, entry.name);
  if (!fs.existsSync(filePath)) {
    if (entry.optional) return '';
    throw new Error(`Missing bundle part: ${filePath}`);
  }
  if (entry.stub) return DATA_JS_STUB;
  let code = fs.readFileSync(filePath, 'utf8');
  if (entry.sanitize === 'lib') code = sanitizeLibScript(entry.name, code);
  else if (entry.sanitize === 'game') code = sanitizeGameScriptsForWx(code);
  else code = sanitizePlayableScript(entry.name, code);
  return code;
}

function patchBundle(code) {
  // 强制磁盘 resource/ 加载
  code = code.replace(
    /function hasBase64\(\)\{if\(_hasBase64==void 0\)_hasBase64=!ps\.Tools\.objIsNull\(assetsBase64\(\)\);return _hasBase64\}/g,
    'function hasBase64(){return false}',
  );
  code = code.replace(/_hasBase64=!ps\.Tools\.objIsNull\(assetsBase64\(\)\)/g, '_hasBase64=false');

  // sanitize 已移除 qc-loading 的 window load → qici.init，bundle 尾仅作兜底
  if (!code.includes('__wxQiciBoot')) {
    code += `
;(function(){
  var __g = typeof GameGlobal !== 'undefined' ? GameGlobal : window;
  if (__g.__wxQiciBoot || __g.__wxQiciInited) return;
  __g.__wxQiciBoot = true;
  var __q = __g.qici || (typeof qici !== 'undefined' ? qici : null);
  if (__q && typeof __q.init === 'function') {
    setTimeout(function(){
      if (__g.__wxQiciInited) return;
      __g.__wxQiciInited = true;
      try { __q.init(); console.log('[phaser2] qici.init() via bundle tail'); }
      catch (e) { console.error('[phaser2] qici.init', e); }
    }, 0);
  }
})();
`;
  }

  const tail =
    '\n;var __wxG=typeof GameGlobal!=="undefined"?GameGlobal:typeof window!=="undefined"?window:this;' +
    'if(typeof Phaser!=="undefined")__wxG.Phaser=Phaser;' +
    'if(typeof qc!=="undefined")__wxG.qc=qc;' +
    'if(typeof ps!=="undefined"){__wxG.ps=__wxG.ps||{};for(var __k in ps)if(Object.prototype.hasOwnProperty.call(ps,__k))__wxG.ps[__k]=ps[__k];}' +
    'if(typeof assetsPackage!=="undefined")__wxG.assetsPackage=assetsPackage;\n';

  if (!code.includes('__wxG.Phaser=Phaser')) code += tail;

  // 兜底：bundle 内联后仍可能残留旧 json / atlas 补丁
  code = code.replace(
    'jsonLoadComplete:function(t,e){var i=window.__wx&&typeof wx.getSharedCanvas!="function"?e:JSON.parse(e.responseText);',
    'jsonLoadComplete:function(t,e){var i=typeof e==="string"?JSON.parse(e):JSON.parse(e.responseText);',
  );
  const atlasOldWx =
    'else if(D.__wx&&t.length>80&&t.indexOf("/")<0&&/^[A-Za-z0-9+/=]+$/.test(t)){b.src=(t.indexOf("/9j/")===0?"data:image/jpeg;base64,":"data:image/png;base64,")+t}else if(D.__wx&&typeof wx!=="undefined"&&wx.getFileSystemManager){var __wxImgPath=t;if(__wxImgPath.indexOf("/")<0){__wxImgPath="resource/game/"+__wxImgPath.replace(/_png$/i,".png").replace(/_jpg$/i,".jpg")}__wxImgPath=__wxImgPath.replace(/^\\.\\//,"").replace(/^\\//,"");wx.getFileSystemManager().readFile({filePath:__wxImgPath,encoding:"base64",success:function(__r){b.src="data:image/png;base64,"+__r.data},fail:function(__e){console.error("[phaser2] atlas tex",__wxImgPath,__e);x()}})}';
  const atlasNewWx =
    'else if(D.__wx&&(t.indexOf("iVBORw0KGgo")===0||t.indexOf("/9j/")===0||t.length>80&&!/^resource[/\\\\]/.test(t)&&!/\\.(png|jpg|jpeg|webp|bin)$/i.test(t)&&!(/^image_.+_(png|jpg)$/i.test(t)&&t.length<200)&&/^[A-Za-z0-9+/=]+$/.test(t.slice(0,64)))){b.src=(t.indexOf("/9j/")===0?"data:image/jpeg;base64,":"data:image/png;base64,")+t}else if(D.__wx&&typeof wx!=="undefined"&&wx.getFileSystemManager&&(/^resource[/\\\\]/.test(t)||/\\.(png|jpg|jpeg|webp)$/i.test(t)||(/^image_.+_(png|jpg)$/i.test(t)&&t.length<200))){var __wxImgPath=t;if(!/^resource[/\\\\]/.test(__wxImgPath)){__wxImgPath="resource/game/"+__wxImgPath.replace(/_png$/i,".png").replace(/_jpg$/i,".jpg")}__wxImgPath=__wxImgPath.replace(/^\\.\\//,"").replace(/^\\//,"");wx.getFileSystemManager().readFile({filePath:__wxImgPath,encoding:"base64",success:function(__r){b.src="data:image/png;base64,"+__r.data},fail:function(__e){console.error("[phaser2] atlas tex",__wxImgPath,__e);x()}})}';
  if (code.includes('t.indexOf("/")<0&&/^[A-Za-z0-9+/=]+$/.test(t)')) {
    code = code.replace(atlasOldWx, atlasNewWx);
  }
  code = code.replace(
    /window\.location\.search\.substr\(1\)/g,
    '(window.location.search||"").substr(1)',
  );
  code = code.replace(
    'scrollTop:function(){var t=this.compatibility.scrollTo;if(t){window.scrollTo(t.x,t.y)}}',
    'scrollTop:function(){if(window.__wx)return;var t=this.compatibility.scrollTo;if(t&&typeof window.scrollTo==="function"){window.scrollTo(t.x,t.y)}}',
  );
  code = code.replace(
    /this\._grid\.addColorStop\(0,this\.startColor\);this\._grid\.addColorStop\(1,this\.endColor\)/,
    'this._grid.addColorStop(0,this._startColor||(this.startColor&&this.startColor.toString?this.startColor.toString("rgb"):"rgb(255,255,255)"));this._grid.addColorStop(1,this._endColor||(this.endColor&&this.endColor.toString?this.endColor.toString("rgb"):"rgb(255,255,255)"))',
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

  if (code.includes('o.initAudioManager("game/audio/bm_bgm0.mp3"')) {
    code = code.replace(
      'o.initAudioManager("game/audio/bm_bgm0.mp3",o.withPlay)',
      'o.initAudioManager("game/audio/bm_bgm.mp3",o.withPlay)',
    );
  }

  code = code.replace(
    'e===null||e===void 0?void 0:e.catch(function(t){return console.warn("failed to load Web Audio",t,i)})',
    '(e&&typeof e.catch==="function"?e.catch(function(t){return console.warn("failed to load Web Audio",t,i)}):void 0)',
  );

  code = applyHttpLoadAssetWxPatch(code);

  const toWorldOld =
    '_toWorld=function(t,e,i){var r=this.game.canvas;var a=this.game.phaser.scale.scaleFactor;var n=r.ownerDocument===(this.generator.ownerDocument||this.generator.document)?r.getBoundingClientRect():this.generator.getBoundingClientRect&&this.generator.getBoundingClientRect()||{left:0,top:0};return{x:(e-n.left)*a.x,y:(i-n.top)*a.y}}';
  const toWorldWxV1 =
    '_toWorld=function(t,e,i){if(D.__wx){var ph=this.game.phaser;var sc=ph.scale;var off=sc.offset||{x:0,y:0};var inp=ph.input&&ph.input.scale?ph.input.scale:sc.scaleFactor;var m=sc.margin||{};var px=(e!=null?e:0)-(m.left||0);var py=(i!=null?i:0)-(m.top||0);return{x:(px-off.x)*inp.x,y:(py-off.y)*inp.y}}var r=this.game.canvas;var a=this.game.phaser.scale.scaleFactor;var n=r.ownerDocument===(this.generator.ownerDocument||this.generator.document)?r.getBoundingClientRect():this.generator.getBoundingClientRect&&this.generator.getBoundingClientRect()||{left:0,top:0};return{x:(e-n.left)*a.x,y:(i-n.top)*a.y}}';
  const toWorldWx =
    '_toWorld=function(t,e,i){if(D.__wx){var ph=this.game.phaser;var sc=ph.scale;var _sw=sc.width||0;var _sh=sc.height||0;var m=(_sw&&_sh)?(sc.margin||{}):{left:0,top:0,right:0,bottom:0};var off=sc.offset||{x:0,y:0};var px=(e!=null?e:0)-(m.left||0);var py=(i!=null?i:0)-(m.top||0);var inp=ph.input&&ph.input.scale;var sx=inp&&isFinite(inp.x)?inp.x:NaN;var sy=inp&&isFinite(inp.y)?inp.y:NaN;if(_sw&&_sh&&(!isFinite(sx)||!isFinite(sy))&&sc.scaleFactor){if(!isFinite(sx)&&isFinite(sc.scaleFactor.x))sx=sc.scaleFactor.x;if(!isFinite(sy)&&isFinite(sc.scaleFactor.y))sy=sc.scaleFactor.y}if(!_sw||!_sh||!isFinite(sx)||!isFinite(sy)||!sx||!sy){var cdw=_sw,cdh=_sh,gww=ph.width||750,gwh=ph.height||1334;if(!cdw||!cdh){var __cv=D.canvas||(typeof GameGlobal!=="undefined"?GameGlobal.canvas:null);if(__cv&&__cv.width>0){cdw=__cv.width;cdh=__cv.height}else{if(!D.__wxSys&&typeof wx!=="undefined"&&wx.getSystemInfoSync){try{var __wi=wx.getSystemInfoSync();D.__wxSys={w:__wi.windowWidth||375,h:__wi.windowHeight||667}}catch(__e){D.__wxSys={w:375,h:667}}}var __s=D.__wxSys||{w:375,h:667};cdw=cdw||__s.w;cdh=cdh||__s.h}}return{x:px*gww/(cdw||1),y:py*gwh/(cdh||1)}}return{x:(px-(off.x||0))*sx,y:(py-(off.y||0))*sy}}var r=this.game.canvas;var a=this.game.phaser.scale.scaleFactor;var n=r.ownerDocument===(this.generator.ownerDocument||this.generator.document)?r.getBoundingClientRect():this.generator.getBoundingClientRect()||{left:0,top:0};return{x:(e-n.left)*a.x,y:(i-n.top)*a.y}}';
  const toWorldWxPrev3 =
    '_toWorld=function(t,e,i){if(D.__wx){var ph=this.game.phaser;var sc=ph.scale;var m=sc.margin||{};var off=sc.offset||{x:0,y:0};var px=(e!=null?e:0)-(m.left||0);var py=(i!=null?i:0)-(m.top||0);var inp=ph.input&&ph.input.scale;var sx=inp&&isFinite(inp.x)?inp.x:NaN;var sy=inp&&isFinite(inp.y)?inp.y:NaN;if((!isFinite(sx)||!isFinite(sy))&&sc.scaleFactor){if(!isFinite(sx)&&isFinite(sc.scaleFactor.x))sx=sc.scaleFactor.x;if(!isFinite(sy)&&isFinite(sc.scaleFactor.y))sy=sc.scaleFactor.y}if(!isFinite(sx)||!isFinite(sy)||!sx||!sy){var wi=typeof wx!=="undefined"&&wx.getSystemInfoSync?wx.getSystemInfoSync():null;var cdw=sc.width||(wi?wi.windowWidth:(D.innerWidth||375))||1;var cdh=sc.height||(wi?wi.windowHeight:(D.innerHeight||667))||1;var gww=ph.width||750;var gwh=ph.height||1334;return{x:px*gww/cdw,y:py*gwh/cdh}}return{x:(px-(off.x||0))*sx,y:(py-(off.y||0))*sy}}var r=this.game.canvas;var a=this.game.phaser.scale.scaleFactor;var n=r.ownerDocument===(this.generator.ownerDocument||this.generator.document)?r.getBoundingClientRect():this.generator.getBoundingClientRect()||{left:0,top:0};return{x:(e-n.left)*a.x,y:(i-n.top)*a.y}}';
  const toWorldWxPrev =
    '_toWorld=function(t,e,i){if(D.__wx){var ph=this.game.phaser;var sc=ph.scale;var m=sc.margin||{};var off=sc.offset||{x:0,y:0};var px=(e!=null?e:0)-(m.left||0);var py=(i!=null?i:0)-(m.top||0);var inp=ph.input&&ph.input.scale;var sx=inp&&isFinite(inp.x)?inp.x:NaN;var sy=inp&&isFinite(inp.y)?inp.y:NaN;if((!isFinite(sx)||!isFinite(sy))&&sc.scaleFactor){if(!isFinite(sx)&&isFinite(sc.scaleFactor.x))sx=sc.scaleFactor.x;if(!isFinite(sy)&&isFinite(sc.scaleFactor.y))sy=sc.scaleFactor.y}if(!isFinite(sx)||!isFinite(sy)||!sx||!sy){var wi=typeof wx!=="undefined"&&wx.getSystemInfoSync?wx.getSystemInfoSync():null;var __cv=D.canvas||(typeof GameGlobal!=="undefined"?GameGlobal.canvas:null);var ww=(__cv&&__cv.width)||(wi?wi.windowWidth:(D.innerWidth||375));var wh=(__cv&&__cv.height)||(wi?wi.windowHeight:(D.innerHeight||667));var cdw=sc.width||ww||1;var cdh=sc.height||wh||1;var gww=(sc.game&&sc.game.width)||ww;var gwh=(sc.game&&sc.game.height)||wh;return{x:px*gww/cdw,y:py*gwh/cdh}}return{x:(px-(off.x||0))*sx,y:(py-(off.y||0))*sy}}var r=this.game.canvas;var a=this.game.phaser.scale.scaleFactor;var n=r.ownerDocument===(this.generator.ownerDocument||this.generator.document)?r.getBoundingClientRect():this.generator.getBoundingClientRect()||{left:0,top:0};return{x:(e-n.left)*a.x,y:(i-n.top)*a.y}}';
  const toWorldWxPrev2 =
    '_toWorld=function(t,e,i){if(D.__wx){var ph=this.game.phaser;var sc=ph.scale;var m=sc.margin||{};var off=sc.offset||{x:0,y:0};var px=(e!=null?e:0)-(m.left||0);var py=(i!=null?i:0)-(m.top||0);var inp=ph.input&&ph.input.scale;var sx=inp&&isFinite(inp.x)?inp.x:NaN;var sy=inp&&isFinite(inp.y)?inp.y:NaN;if((!isFinite(sx)||!isFinite(sy))&&sc.scaleFactor){if(!isFinite(sx)&&isFinite(sc.scaleFactor.x))sx=sc.scaleFactor.x;if(!isFinite(sy)&&isFinite(sc.scaleFactor.y))sy=sc.scaleFactor.y}if(!isFinite(sx)||!isFinite(sy)||!sx||!sy){var wi=typeof wx!=="undefined"&&wx.getSystemInfoSync?wx.getSystemInfoSync():null;var ww=wi?wi.windowWidth:(D.innerWidth||375);var wh=wi?wi.windowHeight:(D.innerHeight||667);var cdw=sc.width||ww||1;var cdh=sc.height||wh||1;var gww=(sc.game&&sc.game.width)||ww;var gwh=(sc.game&&sc.game.height)||wh;return{x:px*gww/cdw,y:py*gwh/cdh}}return{x:(px-(off.x||0))*sx,y:(py-(off.y||0))*sy}}var r=this.game.canvas;var a=this.game.phaser.scale.scaleFactor;var n=r.ownerDocument===(this.generator.ownerDocument||this.generator.document)?r.getBoundingClientRect():this.generator.getBoundingClientRect()||{left:0,top:0};return{x:(e-n.left)*a.x,y:(i-n.top)*a.y}}';
  if (code.includes(toWorldOld)) {
    code = code.split(toWorldOld).join(toWorldWx);
  } else if (code.includes(toWorldWxV1)) {
    code = code.split(toWorldWxV1).join(toWorldWx);
  } else if (code.includes(toWorldWxPrev)) {
    code = code.split(toWorldWxPrev).join(toWorldWx);
  } else if (code.includes(toWorldWxPrev2)) {
    code = code.split(toWorldWxPrev2).join(toWorldWx);
  } else if (code.includes(toWorldWxPrev3)) {
    code = code.split(toWorldWxPrev3).join(toWorldWx);
  }

  const gainFocusOld =
    'gainFocus=function(t){if(this.generator!==D||D.parent&&D.parent!==D){this.generator.focus()}}';
  const gainFocusWx =
    'gainFocus=function(t){if(D.__wx)return;if(this.generator!==D||D.parent&&D.parent!==D){if(this.generator.focus)this.generator.focus()}}';
  if (code.includes(gainFocusOld)) {
    code = code.replace(gainFocusOld, gainFocusWx);
  }

  return code;
}

/** MW_CONFIG 段：优先 extract 产出，勿依赖 wx 工程内临时 mw-config.js */
function loadMwConfigForBundle() {
  const snippetPath = path.join(ROOT, 'src/phaser2/playable/mw-config-snippet.js');
  if (fs.existsSync(snippetPath)) {
    let code = fs.readFileSync(snippetPath, 'utf8');
    const cut = code.indexOf('</script>');
    if (cut >= 0) code = code.slice(0, cut).trim() + ';\n';
    return code;
  }
  const htmlPath = findHtmlPath();
  if (htmlPath) {
    const fromHtml = extractMwConfigFromHtml(fs.readFileSync(htmlPath, 'utf8'));
    if (fromHtml) return fromHtml;
  }
  const legacy = path.join(wxRoot, 'js/playable/mw-config.js');
  if (fs.existsSync(legacy)) return fs.readFileSync(legacy, 'utf8');
  return null;
}

const phaserPath = path.join(libDir, 'phaser.min.js');
if (fs.existsSync(phaserPath)) patchPhaser2ForWx(phaserPath);

const parts = [];
const mwConfig = loadMwConfigForBundle();
if (mwConfig) {
  parts.push(mwConfig);
}

for (const entry of BUNDLE_FILES) {
  parts.push(readPart(entry));
}

let bundle = parts.filter(Boolean).join('\n;\n');
bundle = patchBundle(bundle);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, bundle);

// 临时 patch 文件（bundle 内已内联 sanitize）
for (const entry of BUNDLE_FILES) {
  if (!entry.patchWx) continue;
  const p = path.join(entry.dir, entry.name);
  if (fs.existsSync(p)) patchPhaser2ForWx(p);
}

const mb = (bundle.length / 1024 / 1024).toFixed(2);
console.log('Bundle →', outPath, `(${mb} MB)`);
