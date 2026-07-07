/**
 * PlayableMaker / smoud playable-sdk webpack 单文件导出（内嵌 Phaser 3.88.x）
 */
import fs from 'fs';
import path from 'path';
import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync, existsSync, rmSync } from 'fs';
import { wxSafeFilename } from './normalize-asset-names.mjs';
import { convertWebpDataUrlsInText, convertWebpFileToPng, convertWebpFilesInDir, ensurePngBuffer } from './webp-to-png.mjs';
import { externalizeEmbeddedAssets, buildVarToKeyMap, destNameForManifestAsset } from './externalize-wx-assets.mjs';
import {
  ensureSourceDirs,
  findHtmlPath,
  CURRENT_DIR,
} from './game-sources.mjs';

export function isWebpackPhaserMain(content) {
  return (
    content.includes('window.PlayableSDK') &&
    content.includes('new Phaser.Game') &&
    !content.includes('Created with PlayableMaker.com')
  );
}

function extractScriptFromHtml(html) {
  const m = html.match(/<script defer[^>]*>([\s\S]*)<\/script>/i);
  if (!m) throw new Error('No <script> bundle in output.html');
  return m[1];
}

function replaceOnce(code, from, to) {
  if (!code.includes(from)) return code;
  return code.replace(from, to);
}

const WX_PHASER_PATCH =
  'if(typeof wx!=="undefined"){window.Phaser=$1;if(typeof __applyPhaserWxPatches==="function")__applyPhaserWxPatches($1,{setupCanvas:!1});}';

const WX_GAME_CONFIG =
  'type:typeof wx!=="undefined"?Phaser.WEBGL:Phaser.AUTO,width:typeof wx!=="undefined"?window.innerWidth:1280,height:typeof wx!=="undefined"?window.innerHeight:720,canvas:typeof wx!=="undefined"?window.canvas:void 0,backgroundColor:"#0b1220",pauseOnBlur:typeof wx!=="undefined"?!1:void 0,input:typeof wx!=="undefined"?{windowEvents:!1}:void 0,scale:{mode:Phaser.Scale.RESIZE,expandParent:typeof wx!=="undefined"?!1:void 0},scene:[$1]';

function applyWxBundlePatches(code) {
  let c = code;

  // 延迟自执行：去掉末尾外层 ();，由 initPlayableGame 触发
  if (c.endsWith('})();')) {
    c = c.slice(0, -3);
  } else if (c.endsWith('})()})();')) {
    c = c.slice(0, -3);
  }

  // 内嵌 Phaser：webpack 挂 i.g.Phaser 时打补丁（变量名因 build 而异）
  if (!c.includes('setupCanvas:!1});}')) {
    c = replaceOnce(
      c,
      't.exports=n,i.g.Phaser=n',
      `t.exports=n,i.g.Phaser=n;${WX_PHASER_PATCH.replace(/\$1/g, 'n')}`,
    );
    if (!c.includes('__applyPhaserWxPatches(n,{setupCanvas:!1})')) {
      c = c.replace(
        /t\.exports=([A-Za-z_$][\w$]*),i\.g\.Phaser=\1\b/,
        `t.exports=$1,i.g.Phaser=$1;${WX_PHASER_PATCH}`,
      );
    }
  }

  // 旧版 webpack 导出：V=i.n(J) 延迟加载 Phaser
  const vHook =
    'if(typeof wx!=="undefined"){var __wxV=V;V=function(){var __p=__wxV();window.Phaser=__p;if(typeof __applyPhaserWxPatches==="function")__applyPhaserWxPatches(__p,{setupCanvas:!1});V=__wxV;return __p};}';
  c = replaceOnce(c, 'V=i.n(J);', `V=i.n(J);${vHook}`);

  // Phaser.Game 微信 canvas + 尺寸（WX_MIGRATION 5.3 Framebuffer Incomplete Attachment）
  if (!c.includes('expandParent:typeof wx')) {
    c = c.replace(
      /type:Phaser\.AUTO,width:1280,height:720,parent:"game-container",backgroundColor:"#0b1220",scale:\{mode:Phaser\.Scale\.RESIZE\},scene:\[([A-Za-z_$][\w$]*)\]/,
      WX_GAME_CONFIG,
    );
  }

  // 若上面已 patch 过，兼容二次 extract / 旧 parent 写法
  c = replaceOnce(
    c,
    'type:typeof wx!=="undefined"?Phaser.WEBGL:Phaser.AUTO,width:1280,height:720,parent:typeof wx!=="undefined"?(window.canvas||"game-container"):"game-container",canvas:typeof wx!=="undefined"?window.canvas:void 0,backgroundColor:"#0b1220",scale:{mode:Phaser.Scale.RESIZE},scene:[gi]',
    WX_GAME_CONFIG.replace('$1', 'gi'),
  );
  c = replaceOnce(
    c,
    'type:typeof wx!=="undefined"?Phaser.WEBGL:Phaser.AUTO,width:typeof wx!=="undefined"?window.innerWidth:1280,height:typeof wx!=="undefined"?window.innerHeight:720,parent:typeof wx!=="undefined"?(window.canvas||"game-container"):"game-container",canvas:typeof wx!=="undefined"?window.canvas:void 0,backgroundColor:"#0b1220",scale:{mode:Phaser.Scale.RESIZE,expandParent:typeof wx!=="undefined"?!1:void 0},scene:[gi]',
    WX_GAME_CONFIG.replace('$1', 'gi'),
  );

  // CTA → 微信试玩结束（webpack_main 里 SDK 变量名为 N，不是 W）
  c = replaceOnce(
    c,
    ',T()?mraid.open(S):window.open(S))}',
    ',typeof wx!=="undefined"&&wx.notifyMiniProgramPlayableStatus?wx.notifyMiniProgramPlayableStatus({isEnd:!0}):T()?mraid.open(S):window.open(S))}',
  );
  c = replaceOnce(
    c,
    'jumpToStore(){this.playClickSound(),N.install()}',
    'jumpToStore(){this.playClickSound(),typeof wx!=="undefined"&&wx.notifyMiniProgramPlayableStatus?wx.notifyMiniProgramPlayableStatus({isEnd:!0}):N.install()}',
  );
  // 最后一关合成完成 → 微信试玩结束（不仅 CTA 点击）
  c = replaceOnce(
    c,
    'handleLevelComplete(){this.levelTransitioning||(0===this.currentLevel&&this.playCompleteSound(),this.levelTransitioning=!0,this.boardInteractionLocked=!0,this.time.delayedCall(500,(()=>{0===this.currentLevel?this.transitionFromLevel("MAIN_MENU",1):this.transitionFromLevel("WIN")})))}',
    'handleLevelComplete(){this.levelTransitioning||(0===this.currentLevel&&this.playCompleteSound(),this.levelTransitioning=!0,this.boardInteractionLocked=!0,this.time.delayedCall(500,(()=>{0===this.currentLevel?this.transitionFromLevel("MAIN_MENU",1):(typeof wx!=="undefined"&&wx.notifyMiniProgramPlayableStatus&&wx.notifyMiniProgramPlayableStatus({isEnd:!0}),this.transitionFromLevel("WIN"))})))}',
  );
  c = replaceOnce(
    c,
    'window.PlayableSDK=N;',
    'window.PlayableSDK=N;if(typeof wx!=="undefined"&&wx.notifyMiniProgramPlayableStatus){var __wxOrigInstall=N.install;N.install=function(){wx.notifyMiniProgramPlayableStatus({isEnd:!0})};}',
  );
  // 旧版 patch 占位（部分 bundle 仍用 W）
  c = replaceOnce(
    c,
    'var N=W;',
    'var N=W;if(typeof wx!=="undefined"&&wx.notifyMiniProgramPlayableStatus){W.install=function(){wx.notifyMiniProgramPlayableStatus({isEnd:true})};}',
  );
  c = replaceOnce(
    c,
    'window.PlayableSDK=W;',
    'window.PlayableSDK=W;if(typeof wx!=="undefined"&&wx.notifyMiniProgramPlayableStatus){W.install=function(){wx.notifyMiniProgramPlayableStatus({isEnd:true})};}',
  );

  // resize：微信无 game-container；尺寸与 Phaser / weapp-adapter 统一用 window.innerWidth
  c = replaceOnce(
    c,
    'const n=document.getElementById("game-container"),r=null==n?void 0:n.getBoundingClientRect(),o=window.innerWidth||t||1280,a=window.innerHeight||e||720',
    'const n=document.getElementById("game-container"),r=typeof wx!=="undefined"?null:null==n?void 0:n.getBoundingClientRect(),o=window.innerWidth||t||1280,a=window.innerHeight||e||720',
  );
  c = replaceOnce(
    c,
    'const r=document.getElementById("game-container"),n=null==r?void 0:r.getBoundingClientRect(),o=window.innerWidth||t||1280,a=window.innerHeight||e||720',
    'const r=document.getElementById("game-container"),n=typeof wx!=="undefined"?null:null==r?void 0:r.getBoundingClientRect(),o=window.innerWidth||t||1280,a=window.innerHeight||e||720',
  );

  // WX_MIGRATION 5.2 — iOS 视口测量 appendChild，微信不支持
  c = replaceOnce(
    c,
    "57811:t=>{t.exports=function(t){if(!t)return window.innerHeight;var e=Math.abs(window.orientation),i={w:0,h:0},s=document.createElement('div');return s.setAttribute('style','position: fixed; height: 100vh; width: 0; top: 0'),document.documentElement.appendChild(s),i.w=90===e?s.offsetHeight:window.innerWidth,i.h=90===e?window.innerWidth:s.offsetHeight,document.documentElement.removeChild(s),s=null,90!==Math.abs(window.orientation)?i.h:i.w}}",
    '57811:t=>{t.exports=function(t){return window.innerHeight}}',
  );

  // WX_MIGRATION 5.1 — HTMLVideoElement polyfill 微信无 video DOM
  c = c.replace(
    /63595:\(\)=>\{'undefined'!=typeof HTMLVideoElement[\s\S]*?\},10312:/,
    '63595:()=>{},10312:',
  );

  // PlayableSDK 可见性门闩：微信无真实 Page Visibility，避免启动函数永不执行或静音卡死
  for (const startFn of ['F', 'R']) {
    c = replaceOnce(
      c,
      `function t(){"visible"===document.visibilityState&&${startFn}()}`,
      `function t(){typeof wx!=="undefined"?${startFn}():"visible"===document.visibilityState&&${startFn}()}`,
    );
    for (const muteFn of ['D', 'L']) {
      c = replaceOnce(
        c,
        `"visible"===document.visibilityState?(O(),N.isReady||"complete"!==document.readyState||${startFn}()):${muteFn}()`,
        `typeof wx!=="undefined"?(O(),N.isReady||"complete"!==document.readyState||${startFn}()):("visible"===document.visibilityState?(O(),N.isReady||"complete"!==document.readyState||${startFn}()):${muteFn}())`,
      );
    }
  }
  c = replaceOnce(
    c,
    '"complete"===document.readyState?t():window.addEventListener("load",t)',
    'typeof wx!=="undefined"?t():"complete"===document.readyState?t():window.addEventListener("load",t)',
  );

  // PlayableSDK resize 去重（微信 refresh 频繁，避免 layoutScene 每帧重置 UI 位置打断 tween）
  c = replaceOnce(
    c,
    'function U(t,e){N.maxWidth=Math.floor(t||window.innerWidth),N.maxHeight=Math.floor(e||window.innerHeight),N.isLandscape=N.maxWidth>N.maxHeight,m("resize",N.maxWidth,N.maxHeight)}',
    'function U(t,e){var i=Math.floor(t||window.innerWidth),s=Math.floor(e||window.innerHeight);if(typeof wx!=="undefined"&&i===N.maxWidth&&s===N.maxHeight)return;N.maxWidth=i,N.maxHeight=s,N.isLandscape=N.maxWidth>N.maxHeight,m("resize",N.maxWidth,N.maxHeight)}',
  );

  // 教程浮动 UI：from/to 范围 tween + 尺寸未变时跳过 layoutScene
  c = replaceOnce(
    c,
    'this.scale.on("resize",(t=>{this.layoutScene(t.width,t.height)}))',
    'this.scale.on("resize",(t=>{if(typeof wx!=="undefined"){if(typeof GameGlobal!=="undefined"&&GameGlobal.__WX_DEBUG_RESIZE__)console.log("[wx] scale resize",t.width,t.height);if(this.__wxLastLayout&&this.__wxLastLayout.w===t.width&&this.__wxLastLayout.h===t.height)return;this.__wxLastLayout={w:t.width,h:t.height}}this.layoutScene(t.width,t.height)}))',
  );

  c = replaceOnce(
    c,
    'startTutorialFloatAnimation(){if(!this.tutorialTitleText||!this.tutorialChatLeft||!this.tutorialChatRight)return;const t=[];t.push(this.tweens.add({targets:this.tutorialTitleText,y:this.tutorialTitleText.y-10,duration:900,ease:"Sine.easeInOut",yoyo:!0,repeat:-1})),t.push(this.tweens.add({targets:this.tutorialChatLeft,y:this.tutorialChatLeft.y-10,duration:900,ease:"Sine.easeInOut",yoyo:!0,repeat:-1})),t.push(this.tweens.add({targets:this.tutorialChatRight,y:this.tutorialChatRight.y-10,duration:900,ease:"Sine.easeInOut",yoyo:!0,repeat:-1})),this.tutorialFloatTweens=t}',
    'startTutorialFloatAnimation(){if(!this.tutorialTitleText||!this.tutorialChatLeft||!this.tutorialChatRight)return;this.stopTutorialFloatAnimation();const t=[],e=i=>{const s=i.y;t.push(this.tweens.add({targets:i,y:{from:s-10,to:s+10},duration:900,ease:"Sine.easeInOut",yoyo:!0,repeat:-1}))};e(this.tutorialTitleText),e(this.tutorialChatLeft),e(this.tutorialChatRight),this.tutorialFloatTweens=t}',
  );

  c = replaceOnce(
    c,
    'this.tutorialFloatTweens&&this.tutorialFloatTweens.length>0&&(this.stopTutorialFloatAnimation(),this.startTutorialFloatAnimation())',
    'this.tutorialTitleText&&this.tutorialChatLeft&&this.tutorialChatRight&&this.startTutorialFloatAnimation()',
  );

  // Phaser 3.88：微信 touch 无 target → downElement 不为 canvas 时不发 POINTER_DOWN
  if (!c.includes('typeof wx!=="undefined"&&(t.downElement=this.manager.game.canvas)')) {
    c = c.replace(
      /t\.downElement===this\.manager\.game\.canvas\?this\.emit\((\w+)\.POINTER_DOWN,t,i\):this\.emit\(\1\.POINTER_DOWN_OUTSIDE,t\)/,
      'typeof wx!=="undefined"&&(t.downElement=this.manager.game.canvas),t.downElement===this.manager.game.canvas?this.emit($1.POINTER_DOWN,t,i):this.emit($1.POINTER_DOWN_OUTSIDE,t)',
    );
  }

  // wx 试玩需拖拽棋子，勿用全屏 installOverlay 吃掉触摸
  c = replaceOnce(
    c,
    'this.currentLevelConfig.isFake&&(this.installOverlay=this.add.rectangle(0,0,10,10,0,0).setOrigin(.5).setDepth(30).setInteractive({useHandCursor:!0}),this.installOverlay.on("pointerdown",(()=>this.jumpToStore()))',
    'this.currentLevelConfig.isFake&&typeof wx==="undefined"&&(this.installOverlay=this.add.rectangle(0,0,10,10,0,0).setOrigin(.5).setDepth(30).setInteractive({useHandCursor:!0}),this.installOverlay.on("pointerdown",(()=>this.jumpToStore()))',
  );

  c = replaceOnce(
    c,
    'handlePieceDragStart(t){this.boardInteractionLocked||this.currentLevelConfig.isFake||t.isAnimating',
    'handlePieceDragStart(t){this.boardInteractionLocked||(typeof wx==="undefined"&&this.currentLevelConfig.isFake)||t.isAnimating',
  );

  return c;
}

function findWebpackOutputDir() {
  const candidates = [];

  for (const name of readdirSync(CURRENT_DIR)) {
    if (!name.endsWith('_output')) continue;
    const dir = path.join(CURRENT_DIR, name);
    if (!statSync(dir).isDirectory()) continue;
    const manifestPath = path.join(dir, '_webpack_main_manifest.json');
    if (existsSync(manifestPath)) {
      candidates.push({ dir, manifestPath, mtime: statSync(manifestPath).mtimeMs });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0];
}

/** 手动提取工具可能写出成员表达式文件名（无扩展名） */
const MEMBER_EXPR_FILE_STEM = {
  'Gt.middle': 'scene1_bubble_middle',
  'Ee.scene1_bubble_middle': 'scene1_icon_card',
  'Ee.scene1_bubble_bottom': 'scene1_icon_shoes',
};

function resolveAssetDest(rel, varToKey) {
  const norm = String(rel || '').replace(/\\/g, '/');
  const base = path.basename(norm).replace(/\.(webp|m4a|mp3|png)$/i, '');
  const memberKey = MEMBER_EXPR_FILE_STEM[base];
  if (memberKey) return `${wxSafeFilename(memberKey)}.png`;
  return destNameForManifestAsset(rel, varToKey);
}

function collectSupplementalAssets(outputDir, manifestRels, bundle, seen) {
  const manifestSet = new Set(manifestRels);
  const varToKey = buildVarToKeyMap(bundle);
  const supplemental = [];

  function walk(relDir) {
    const abs = path.join(outputDir, relDir);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs)) {
      const rel = path.posix.join(relDir.replace(/\\/g, '/'), name);
      const absPath = path.join(outputDir, rel);
      if (statSync(absPath).isDirectory()) {
        walk(rel);
        continue;
      }
      const baseStem = name.replace(/\.(webp|m4a|mp3|png)$/i, '');
      const hasMediaExt = /\.(webp|m4a|mp3|png)$/i.test(name);
      const isMemberExpr = Object.hasOwn(MEMBER_EXPR_FILE_STEM, baseStem);
      if (!hasMediaExt && !isMemberExpr) continue;
      if (manifestSet.has(rel)) continue;

      let dest = resolveAssetDest(rel, varToKey);
      const isWebp = /\.webp$/i.test(name) || isMemberExpr;
      if (isWebp && !dest.toLowerCase().endsWith('.png')) {
        dest = dest.replace(/\.webp$/i, '.png');
        if (!dest.toLowerCase().endsWith('.png')) dest += '.png';
      }
      if (seen.has(dest)) continue;
      seen.add(dest);
      supplemental.push({ src: absPath, dest, rel, isWebp: /\.webp$/i.test(name) });
    }
  }

  for (const sub of ['images', 'assets', 'audio']) walk(sub);
  return supplemental;
}

function collectWebpackAssets(bundle) {
  const found = findWebpackOutputDir();
  if (!found) {
    console.warn('No _webpack_main_manifest.json under sources/current/*_output/ — skip assets');
    return [];
  }

  const manifest = JSON.parse(fs.readFileSync(found.manifestPath, 'utf8'));
  const varToKey = buildVarToKeyMap(bundle);
  const files = [];
  const seen = new Set();
  const manifestRels = [];

  for (const rec of manifest.records || []) {
    const rel = String(rec.path || '').replace(/\\/g, '/');
    if (!rel) continue;
    manifestRels.push(rel);
    const src = path.join(found.dir, rel);
    if (!existsSync(src) || !statSync(src).isFile()) {
      console.warn('Missing manifest asset:', rel);
      continue;
    }
    let dest = resolveAssetDest(rel, varToKey);
    const isWebp = /\.webp$/i.test(rel) || rec.mime === 'image/webp';
    if (isWebp && !dest.toLowerCase().endsWith('.png')) {
      dest = dest.replace(/\.webp$/i, '.png');
      if (!dest.toLowerCase().endsWith('.png')) dest += '.png';
    }
    if (seen.has(dest)) continue;
    seen.add(dest);
    files.push({ src, dest, rel, isWebp });
  }

  const supplemental = collectSupplementalAssets(found.dir, manifestRels, bundle, seen);
  if (supplemental.length > 0) {
    console.log(
      'Supplemental assets (on disk, not in manifest):',
      supplemental.map((s) => s.rel).join(', '),
    );
    files.push(...supplemental);
  }

  console.log('Asset manifest:', path.relative(CURRENT_DIR, found.manifestPath), `(${manifestRels.length} manifest + ${supplemental.length} supplemental = ${files.length} files)`);
  return files;
}

function readGameTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return (m?.[1] || 'webpack-playable').replace(/\s+/g, '-').slice(0, 48);
}

export async function runExtractWebpackMain() {
  ensureSourceDirs();
  const htmlPath = findHtmlPath();
  if (!htmlPath) {
    console.error('Missing sources/current/output.html');
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  if (!isWebpackPhaserMain(html)) {
    console.error('Not a webpack_phaser_main output.html');
    process.exit(1);
  }

  let bundle = extractScriptFromHtml(html);
  bundle = applyWxBundlePatches(bundle);

  const webpResult = await convertWebpDataUrlsInText(bundle);
  bundle = webpResult.text;
  if (webpResult.converted > 0) {
    console.log(`Embedded webp→png in runtime: ${webpResult.converted} images`);
  }

  const assetFiles = collectWebpackAssets(bundle);
  const manifestStems = new Set(
    assetFiles.map(({ dest }) => dest.replace(/\.(png|webp|jpg|jpeg|m4a|mp3)$/i, '')),
  );
  const ext = externalizeEmbeddedAssets(bundle, { skipWriteStems: manifestStems });
  bundle = ext.code;
  console.log(
    `Externalized assets: ${ext.stats.webpackModules} webpack modules (${ext.stats.webpackExtracted || 0} decoded from bundle), ${ext.stats.loadImageVar || 0} load.image vars, ${ext.stats.loadImage} load.image literals, ${ext.stats.textureMaps} item maps, ${(ext.stats.loadAudioVar || 0) + ext.stats.audio} audio → assets/ (bundle png left: ${ext.pngLeft}, audio left: ${ext.audioLeft})`,
  );

  const runtimeCode = `import { applyPhaserWxPatches } from '../wx/apply-phaser-wx-patches.js';

let booted = false;

export default function initPlayableGame(parent, gameDef) {
  if (booted) return;
  booted = true;
  if (typeof wx !== 'undefined') {
    globalThis.__applyPhaserWxPatches = applyPhaserWxPatches;
  }
  ${bundle}();
}

export { initPlayableGame };
`;

  const outDir = path.resolve('src/playable');
  mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'runtime.js'), runtimeCode);
  console.log('Wrote src/playable/runtime.js (webpack_main), size', (runtimeCode.length / 1024).toFixed(1), 'KB');

  const phaserVer = html.match(/VERSION:'(3\.\d+\.\d+)'/)?.[1] || '3.88.x';
  const def = {
    _meta: { format: 'webpack_main', phaserVersion: phaserVer },
    general: { name: readGameTitle(html) },
  };

  const publicDir = path.resolve('public');
  const assetsDir = path.join(publicDir, 'assets');
  if (existsSync(assetsDir)) {
    rmSync(assetsDir, { recursive: true, force: true });
  }
  mkdirSync(assetsDir, { recursive: true });

  let copied = 0;
  let pngConverted = 0;
  for (const { src, dest, isWebp } of assetFiles) {
    const outPath = path.join(assetsDir, dest);
    if (isWebp) {
      await convertWebpFileToPng(src, outPath);
      pngConverted++;
    } else {
      copyFileSync(src, outPath);
    }
    copied++;
  }

  let extracted = 0;
  for (const { dest, buffer, mime } of ext.extractedFiles) {
    const pngBuf = await ensurePngBuffer(buffer, mime);
    writeFileSync(path.join(assetsDir, dest), pngBuf);
    extracted++;
  }

  const swept = await convertWebpFilesInDir(assetsDir);
  if (swept > 0) {
    console.log(`Sweep webp→png in public/assets: ${swept} files`);
  }

  writeFileSync(path.join(publicDir, 'def-template.json'), JSON.stringify(def));
  console.log(
    `Copied ${copied} game assets → public/assets/ (${pngConverted} webp→png, ${extracted} from bundle)`,
  );
  console.log('Phaser version (embedded):', phaserVer);
}
