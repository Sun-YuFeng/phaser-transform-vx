import fs from 'fs';
import path from 'path';
import { cpSync, mkdirSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { normalizeDefAssetRefs, wxSafeFilename } from './normalize-asset-names.mjs';
import {
  ensureSourceDirs,
  findDefTemplatePath,
  findHtmlPath,
  listResourceFiles,
} from './game-sources.mjs';
import { isWebpackPhaserMain, runExtractWebpackMain } from './extract-webpack-main.mjs';
import { convertWebpFileToPng, convertWebpFilesInDir } from './webp-to-png.mjs';
import { extractInlineAssets } from './extract-inline-assets.mjs';

ensureSourceDirs();

const htmlPath = findHtmlPath();
if (!htmlPath) {
  console.error('Missing sources/current/output.html');
  console.error('Put PlayableMaker html + resources in sources/current/');
  process.exit(1);
}

const content = fs.readFileSync(htmlPath, 'utf8');

if (isWebpackPhaserMain(content)) {
  console.log('Detected format: webpack_main (embedded Phaser)');
  await runExtractWebpackMain();
  process.exit(0);
}

const BOOTSTRAP_MARKER = 'console.log("%c Created with PlayableMaker.com "';

function locateSections() {
  const old = {
    runtimeStart: content.indexOf('const bt = "applovin"'),
    bootstrapStart: content.indexOf('let ne;'),
    tailStart: content.indexOf('function rs() {'),
    tailEnd: content.indexOf('((Ne.gameStart = rs), (Ne.gameClose = ns));'),
    phaserFrom: 'var f = _t(853),',
    phaserTo: 'var f = Phaser,',
    tailFix: ['const Ne = window || _t.g;', 'const Ne = window;'],
    tailEndLen: '((Ne.gameStart = rs), (Ne.gameClose = ns));'.length,
  };

  if (old.runtimeStart >= 0 && old.bootstrapStart >= 0 && old.tailStart >= 0 && old.tailEnd >= 0) {
    return { format: 'legacy', ...old };
  }

  const v2RuntimeStart = content.indexOf('const Tt="applovin"');
  if (v2RuntimeStart >= 0) {
    const bootstrapStart = content.indexOf(BOOTSTRAP_MARKER, v2RuntimeStart);
    const tailStart = content.indexOf('function Ii(){', bootstrapStart);
    const tailEnd = content.indexOf('Se.gameStart=Ii,Se.gameClose=mi', tailStart);

    if (bootstrapStart >= 0 && tailStart >= 0 && tailEnd >= 0) {
      return {
        format: 'v2',
        runtimeStart: v2RuntimeStart,
        bootstrapStart,
        tailStart,
        tailEnd,
        phaserFrom: 'var f=Zt(853)',
        phaserTo: 'var f=Phaser',
        tailFix: ['const Se=window||Zt.g', 'const Se=window'],
        tailEndLen: 'Se.gameStart=Ii,Se.gameClose=mi'.length,
      };
    }
  }

  const v3RuntimeStart = content.indexOf('const e="applovin"');
  const v3BootstrapStart = content.indexOf(BOOTSTRAP_MARKER, v3RuntimeStart);
  const v3TailStart = content.indexOf('const Wt=window||Tt.g', v3BootstrapStart);
  const v3TailEndMarker = 't?.viewableChangeHandler(!1)}}';
  const v3TailEnd = content.indexOf(v3TailEndMarker, v3TailStart);

  if (v3RuntimeStart < 0 || v3BootstrapStart < 0 || v3TailStart < 0 || v3TailEnd < 0) {
    throw new Error(`Failed to locate runtime sections in ${htmlPath}`);
  }

  return {
    format: 'v3',
    runtimeStart: v3RuntimeStart,
    bootstrapStart: v3BootstrapStart,
    tailStart: v3TailStart,
    tailEnd: v3TailEnd,
    phaserFrom: 'var s=Tt(853)',
    phaserTo: 'var s=Phaser',
    tailFix: ['const Wt=window||Tt.g', 'const Wt=window'],
    tailEndLen: v3TailEndMarker.length,
  };
}

function detectManagerAlias(body, tail) {
  const fromTail = tail.match(/(\w+)\.getInstance\(\)\.getPlatform\(\)/);
  if (fromTail) return fromTail[1];

  const fromInstance = body.match(/let (\w+)=\w+;var ci=/);
  if (fromInstance) return fromInstance[1];

  const fromLegacy = body.match(/let (\w+) = \w+;\s*$/);
  return fromLegacy ? fromLegacy[1] : 'Tt';
}

function applyWxPatches(body, manager) {
  let code = body;

  if (!code.includes('notifyMiniProgramPlayableStatus')) {
    code = code.replace(
      /openUrl\(\)\{/g,
      'openUrl(){if(typeof wx!=="undefined"){wx.notifyMiniProgramPlayableStatus&&wx.notifyMiniProgramPlayableStatus({isEnd:true});return;}',
    );
  }

  // document.title 在 weapp-adapter 里是只读 getter
  code = code.replace(
    /&&\(document\.title=/g,
    '&&typeof wx==="undefined"&&(document.title=',
  );

  code = code.replace(
    /type\s*==\s*"video"\s*\?\s*this\.load\.video\(/g,
    'type=="video"?typeof wx==="undefined"&&this.load.video(',
  );
  code = code.replace(
    /"video"==(\w+)\.type\?this\.load\.video\(/g,
    '"video"==$1.type?typeof wx==="undefined"&&this.load.video(',
  );

  if (!code.includes('updatePixelRatioEvent(){if(typeof wx!=="undefined")')) {
    code = code.replace(
      /updatePixelRatioEvent\(\)\{/,
      'updatePixelRatioEvent(){if(typeof wx!=="undefined")return;',
    );
  }

  if (!code.includes('window.canvas')) {
    code = code.replace(
      /startGame\((\w+)\)\{/,
      'startGame($1){if(typeof wx!=="undefined"){let _wi=wx.getSystemInfoSync();try{if(typeof wx.getWindowInfo==="function"){const _w=wx.getWindowInfo();if(_w&&(_w.windowWidth||_w.screenWidth))_wi=_w;}}catch(e){}$1={width:_wi.windowWidth||_wi.screenWidth||414,height:_wi.windowHeight||_wi.screenHeight||896};}',
    );
    code = code.replace(
      /type:Phaser\.AUTO,antialias:!0,parent:this\.parentElement/,
      'type:typeof wx!=="undefined"?Phaser.WEBGL:Phaser.AUTO,antialias:!0,canvas:typeof wx!=="undefined"?(window.canvas||wx.createCanvas()):void 0,parent:typeof wx!=="undefined"?(window.canvas||wx.createCanvas()):this.parentElement,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},physics:{default:"arcade",arcade:{debug:!1}}',
    );
  }

  if (!code.includes('getFileSystemManager().readFile')) {
    code = code.replace(
      /loadFont\((\w+),(\w+),(\w+),(\w+)\)\{/,
      `loadFont($1,$2,$3,$4){if(typeof wx!=="undefined"){const _f=${manager}.getInstance().findFont($2);if(_f){_f.aliases.push($1);$4&&$4();return;}${manager}.getInstance().addFont($1,$2);const _p=$3.replace(/^\\.\\//,"").replace(/^\\//,"");wx.getFileSystemManager().readFile({filePath:_p,encoding:"base64",success(res){const _ff=new FontFace($1,\`url(data:font/ttf;base64,\${res.data})\`);_ff.load().then(function(q){document.fonts.add(q);const k=${manager}.getInstance().findFont($2);k&&(k.isLoaded=!0);$4&&$4();}).catch(function(){console.log(\`!Load Font Error: \${$1}\`);$4&&$4();});},fail(){console.log(\`!Load Font Error: \${$1}\`);$4&&$4();}});return;}`,
    );
  }

  return code;
}

const sections = locateSections();
console.log('Detected format:', sections.format);
console.log('HTML:', htmlPath);

const runtimeBody = content.slice(sections.runtimeStart, sections.bootstrapStart);
let tail = content.slice(sections.tailStart, sections.tailEnd + sections.tailEndLen);
tail = tail.replace(sections.tailFix[0], sections.tailFix[1]);

let body = runtimeBody.replace(sections.phaserFrom, sections.phaserTo);
const manager = detectManagerAlias(body.trimEnd(), tail);
body = applyWxPatches(body, manager);

const finalCode = `import Phaser from 'phaser';

console.log(
  '%c Created with PlayableMaker.com ',
  'color: white; background-color: #9329D4; font-weight: bold;'
);

let startPlayable;

(() => {
  ${body}

  startPlayable = (parentElement, gameDef) => {
    ${manager}.getInstance().setParent(parentElement);
    const loadDef = gameDef
      ? Promise.resolve(gameDef)
      : fetch('./def-template.json').then((res) => {
          if (!res.ok) throw new Error('Cannot load def-template.json');
          return res.json();
        });
    return loadDef
      .then((def) => {
        ${manager}.getInstance().setGameDef(def);
        ${manager}.getInstance().initGame();
      })
      .catch((err) => {
        console.error('Cannot set def-template.', err);
      });
  };

  ${tail}
})();

export function initPlayableGame(parent, gameDef) {
  const parentElement =
    typeof parent === 'string' ? document.getElementById(parent) : parent;
  return startPlayable(parentElement, gameDef);
}

export default initPlayableGame;
`;

const outDir = path.resolve('src/playable');
mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'runtime.js'), finalCode);
console.log('Wrote src/playable/runtime.js, size', (finalCode.length / 1024).toFixed(1), 'KB');
console.log('Manager alias:', manager);

let defPath = findDefTemplatePath();

// PlayableMaker inline-assets 格式：def-template.json 与全部资源以 base64 内嵌在
// output.html 中。当 sources/current/ 没有独立的 def-template.json 时，从 html 解出，
// 落到 sources/current/（def-template.json + assets/），供后续正常流程消费。
if (!defPath) {
  const { def, assets } = extractInlineAssets(content);
  if (def) {
    const curDir = path.dirname(htmlPath);
    const curAssets = path.join(curDir, 'assets');
    writeFileSync(path.join(curDir, 'def-template.json'), JSON.stringify(def));
    if (assets.length) {
      mkdirSync(curAssets, { recursive: true });
      for (const a of assets) {
        fs.writeFileSync(path.join(curAssets, a.name), a.buffer);
      }
    }
    console.log(
      `Decoded inline assets from ${path.basename(htmlPath)}: def-template.json + ${assets.length} file(s) → sources/current/assets/`,
    );
    defPath = findDefTemplatePath();
  }
}

if (!defPath) {
  console.warn('Missing def-template.json in sources/current/ — skip asset copy');
  process.exit(0);
}

const publicDir = path.resolve('public');
const assetsDir = path.join(publicDir, 'assets');
mkdirSync(assetsDir, { recursive: true });

let copied = 0;
let pngConverted = 0;
for (const { src, rel } of listResourceFiles()) {
  const baseName = rel.includes('/') ? rel.split('/').pop() : rel;
  const destName = wxSafeFilename(baseName.replace(/\.webp$/i, '.png'));
  const destPath = path.join(assetsDir, destName);
  if (src.toLowerCase().endsWith('.webp')) {
    await convertWebpFileToPng(src, destPath);
    pngConverted++;
  } else {
    cpSync(src, destPath, { force: true });
  }
  copied++;
}

const swept = await convertWebpFilesInDir(assetsDir);
if (swept > 0) pngConverted += swept;

const def = normalizeDefAssetRefs(JSON.parse(fs.readFileSync(defPath, 'utf8')));
writeFileSync(path.join(publicDir, 'def-template.json'), JSON.stringify(def));
console.log(`Copied ${copied} assets from sources/current/ → public/assets/ (${pngConverted} webp→png)`);
