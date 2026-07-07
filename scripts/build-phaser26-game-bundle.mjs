/**
 * 合并 src/phaser26 → 当前 .wx-project 的 js/main.js
 */
import fs from 'fs';
import path from 'path';
import { getWxProjectDir } from './wx-project.mjs';
import { patchPhaser26ForWx, patchPhaser2ForWx } from './patch-phaser2-for-wx.mjs';
import {
  applyPhaser26EngineShim,
  applyPhaser26GameScriptsShim,
  sanitizePhaser26CustomLoaderForWx,
  PHASER26_WX_GLOBAL_PRELUDE,
  PHASER26_WX_GLOBAL_EXPR,
} from './phaser2-wx-sanitize.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src/phaser26');
const wxRoot = getWxProjectDir();
const outPath = path.join(wxRoot, 'js/main.js');

function applyWxBootPatches(code) {
  let c = code;

  if (!c.includes('__wxPhaser26Boot')) {
    const bootHead =
      'window.onload=function(){/*__wxPhaser26Boot*/' +
      'if(typeof wx!=="undefined"){var _wi=wx.getSystemInfoSync();' +
      'window.innerWidth=window.innerWidth||_wi.windowWidth||_wi.screenWidth||414;' +
      'window.innerHeight=window.innerHeight||_wi.windowHeight||_wi.screenHeight||896}';

    c = c.replace(/window\.onload=function\(\)\{if\(typeof wx!=="undefined"\)\{var _wi=wx\.getSystemInfoSync\(\);try\{if\(typeof wx\.getWindowInfo==="function"\)\{var _w=wx\.getWindowInfo\(\);if\(_w&&\(_w\.windowWidth\|\|_w\.screenWidth\)\)_wi=_w;\}\}catch\(e\)\{\}\}/, bootHead);
    c = c.replace(/window\.onload=function\(\)\{/, bootHead);

    c = c.replace(
      /;if\(window\.__wxPhaser26Booted\)return;window\.__wxPhaser26Booted=true;if\(typeof GameGlobal!=="undefined"\)GameGlobal\.__wxPhaser26Booted=true;var g=new __wxG\.Phaser\.Game\(typeof wx!=="undefined"\?\(_wi\.windowWidth\|\|_wi\.screenWidth\|\|640\):A,typeof wx!=="undefined"\?\(_wi\.windowHeight\|\|_wi\.screenHeight\|\|1138\):V,typeof wx!=="undefined"\?__wxG\.Phaser\.WEBGL:I,typeof wx!=="undefined"\?\(\(__wxG\.window&&__wxG\.window\.canvas\)\|\|window\.canvas\|\|document\.body\):"",null,!1,!0,\{arcade:!0\}\);/,
      ';if(window.__wxPhaser26Booted)return;window.__wxPhaser26Booted=true;if(typeof GameGlobal!=="undefined")GameGlobal.__wxPhaser26Booted=true;var g=new __wxG.Phaser.Game(A,V,I,typeof wx!=="undefined"?((__wxG.window&&__wxG.window.canvas)||window.canvas||document.body):"",null,!1,!0,{arcade:!0});(typeof GameGlobal!=="undefined"?GameGlobal:window).__wxPhaser26Game=g;',
    );
    c = c.replace(
      /;if\(window\.__wxPhaser26Booted\)return;window\.__wxPhaser26Booted=true;if\(typeof GameGlobal!=="undefined"\)GameGlobal\.__wxPhaser26Booted=true;var g=new __wxG\.Phaser\.Game\(A,V,I,"",null,!1,!0,\{arcade:!0\}\);/,
      ';if(window.__wxPhaser26Booted)return;window.__wxPhaser26Booted=true;if(typeof GameGlobal!=="undefined")GameGlobal.__wxPhaser26Booted=true;var g=new __wxG.Phaser.Game(A,V,I,typeof wx!=="undefined"?((__wxG.window&&__wxG.window.canvas)||window.canvas||document.body):"",null,!1,!0,{arcade:!0});(typeof GameGlobal!=="undefined"?GameGlobal:window).__wxPhaser26Game=g;',
    );
    c = c.replace(
      /,g=new __wxG\.Phaser\.Game\(A,V,I,"",null,!1,!0,\{arcade:!0\}\);/,
      ';if(window.__wxPhaser26Booted)return;window.__wxPhaser26Booted=true;if(typeof GameGlobal!=="undefined")GameGlobal.__wxPhaser26Booted=true;var g=new __wxG.Phaser.Game(A,V,I,typeof wx!=="undefined"?((__wxG.window&&__wxG.window.canvas)||window.canvas||document.body):"",null,!1,!0,{arcade:!0});(typeof GameGlobal!=="undefined"?GameGlobal:window).__wxPhaser26Game=g;',
    );
    c = c.replace(
      /,g=new Phaser\.Game\(A,V,I,"",null,!1,!0,\{arcade:!0\}\);/,
      ';if(window.__wxPhaser26Booted)return;window.__wxPhaser26Booted=true;if(typeof GameGlobal!=="undefined")GameGlobal.__wxPhaser26Booted=true;var g=new __wxG.Phaser.Game(A,V,I,typeof wx!=="undefined"?((__wxG.window&&__wxG.window.canvas)||window.canvas||document.body):"",null,!1,!0,{arcade:!0});(typeof GameGlobal!=="undefined"?GameGlobal:window).__wxPhaser26Game=g;',
    );
  }

  if (!c.includes('notifyMiniProgramPlayableStatus')) {
    c = c.replace(
      /window\.open\(([^)]+)\)/g,
      '(typeof wx!=="undefined"&&wx.notifyMiniProgramPlayableStatus?wx.notifyMiniProgramPlayableStatus({isEnd:true}):window.open($1))',
    );
  }

  if (!c.includes('__wxInnerWidthPoll')) {
    c = c.replace(
      /,window\.innerWidth<=0\)window\.setTimeout\(window\.onload,250\);else\{/,
      ',/*__wxInnerWidthPoll*/typeof wx!=="undefined"?!1:window.innerWidth<=0)window.setTimeout(window.onload,250);else{',
    );
  }

  return c;
}

const orderPath = path.join(SRC, 'bundle-order.json');
if (!fs.existsSync(orderPath)) {
  console.error('Missing src/phaser26/bundle-order.json — run npm run extract:phaser26');
  process.exit(1);
}

const order = JSON.parse(fs.readFileSync(orderPath, 'utf8'));
const parts = [];
const seen = new Set();

for (const rel of order) {
  const filePath = path.join(SRC, rel);
  if (!fs.existsSync(filePath)) {
    console.error('Missing bundle part:', filePath);
    process.exit(1);
  }
  let code = fs.readFileSync(filePath, 'utf8');
  const hash = code.length + ':' + code.slice(0, 64);
  if (seen.has(hash)) {
    console.warn('[phaser26] skip duplicate script:', rel);
    continue;
  }
  seen.add(hash);
  if (rel === 'lib/phaser.js') {
    patchPhaser26ForWx(filePath);
    patchPhaser2ForWx(filePath);
    code = fs.readFileSync(filePath, 'utf8');
    code = applyPhaser26EngineShim(code);
  } else if (rel === 'scripts/15-custom-loader.js') {
    code = sanitizePhaser26CustomLoaderForWx(code);
    code = applyPhaser26GameScriptsShim(code);
  } else {
    code = applyPhaser26GameScriptsShim(code);
  }
  parts.push(code);
}

let bundle = PHASER26_WX_GLOBAL_PRELUDE + parts.join('\n;\n');
bundle = applyWxBootPatches(bundle);

bundle += `
;var __wxG=${PHASER26_WX_GLOBAL_EXPR};
if(typeof Phaser!=="undefined")__wxG.Phaser=Phaser;
if(typeof PIXI!=="undefined")__wxG.PIXI=PIXI;
if(window.__wxPhaser26Booted)__wxG.__wxPhaser26Booted=window.__wxPhaser26Booted;
;(function(){
  var g=__wxG;
  if(typeof Phaser!=="undefined")g.Phaser=Phaser;
  if(typeof PIXI!=="undefined")g.PIXI=PIXI;
  g.packJSONObj=typeof packJSONObj!=="undefined"?packJSONObj:g.packJSONObj;
  g.GlobalObj=typeof GlobalObj!=="undefined"?GlobalObj:g.GlobalObj;
  g.gameStart=typeof gameStart!=="undefined"?gameStart:g.gameStart;
})();
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, bundle);

try {
  new Function(bundle);
} catch (err) {
  console.error('[phaser26] js/main.js syntax error:', err.message);
  process.exit(1);
}

console.log('Built', outPath, (bundle.length / 1024 / 1024).toFixed(2), 'MB');
