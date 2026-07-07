/**
 * 从 HTML 内容探测 Phaser 试玩打包形态，返回迁移路由。
 * 供 migrate-from-html.mjs、probe 等复用。
 */
import fs from 'fs';
import path from 'path';

/** @typedef {'phaser2-mw'|'phaser2-applovin'|'webpack_main'|'legacy'|'v2'|'v3'|'UNKNOWN'} PlayableFormat */

/** @typedef {{
 *   format: PlayableFormat;
 *   template: string;
 *   extractScript: string;
 *   buildScript: string;
 *   phaserVersion: string;
 * }} FormatRoute */

const ROUTES = {
  'phaser2-mw': {
    template: 'phaser2.3.0',
    extractScript: 'extract-phaser2-html.mjs',
    buildScript: 'copy-wx-phaser2-libs.mjs',
    phaserVersion: '2.3.0',
  },
  'phaser2-applovin': {
    template: 'phaser2.6.0',
    extractScript: 'extract-phaser26-html.mjs',
    buildScript: 'copy-wx-phaser26-libs.mjs',
    phaserVersion: '2.6.0',
  },
  webpack_main: {
    template: 'phaser3.88.2',
    extractScript: 'extract-runtime.mjs',
    buildScript: 'build:wx',
    phaserVersion: '3.88.2',
  },
  legacy: {
    template: 'phaser3.90.0',
    extractScript: 'extract-runtime.mjs',
    buildScript: 'build:wx',
    phaserVersion: '3.90.0',
  },
  v2: {
    template: 'phaser3.90.0',
    extractScript: 'extract-runtime.mjs',
    buildScript: 'build:wx',
    phaserVersion: '3.90.0',
  },
  v3: {
    template: 'phaser3.90.0',
    extractScript: 'extract-runtime.mjs',
    buildScript: 'build:wx',
    phaserVersion: '3.90.0',
  },
};

const FORMAT_CHECKS = [
  {
    name: 'phaser2-mw',
    test: (c) => c.includes('assetsPackage["replace_js"]') && c.includes('qc-core-min.js'),
  },
  {
    name: 'phaser2-applovin',
    test: (c) =>
      c.includes('packJSONObj') &&
      c.includes('function GlobalObj') &&
      c.includes('PORT.APPLOVIN') &&
      /Phaser v2\.6\./.test(c),
  },
  {
    name: 'webpack_main',
    test: (c) =>
      c.includes('window.PlayableSDK') &&
      c.includes('new Phaser.Game') &&
      !c.includes('Created with PlayableMaker.com'),
  },
  {
    name: 'legacy',
    test: (c) => c.includes('const bt = "applovin"') && c.includes('function rs() {'),
  },
  {
    name: 'v2',
    test: (c) => c.includes('const Tt="applovin"') && c.includes('function Ii(){'),
  },
  {
    name: 'v3',
    test: (c) => c.includes('const e="applovin"') && c.includes('const Wt=window||Tt.g'),
  },
];

/**
 * @param {string} html
 * @returns {FormatRoute & { markers: Record<string, boolean> }}
 */
export function detectPlayableFormat(html) {
  const content = String(html);
  const markers = {
    playablesdk: content.includes('window.PlayableSDK'),
    playableMaker: content.includes('Created with PlayableMaker.com'),
    applovin: content.includes('applovin'),
    qcCore: content.includes('qc-core-min.js'),
    replaceJsZip: content.includes('assetsPackage["replace_js"]'),
    useInlineAssets: content.includes('useInlineAssets('),
  };

  const hit = FORMAT_CHECKS.find((f) => f.test(content));
  const format = /** @type {PlayableFormat} */ (hit?.name ?? 'UNKNOWN');
  const route = ROUTES[format];

  if (!route) {
    return {
      format: 'UNKNOWN',
      template: '',
      extractScript: '',
      buildScript: '',
      phaserVersion: '',
      markers,
    };
  }

  return { format, ...route, markers };
}

/**
 * 根据 sources/current 侧车文件生成迁移前警告（不阻断）。
 * @param {string} currentDir
 * @param {FormatRoute} route
 */
export function collectPreflightWarnings(currentDir, route) {
  const warnings = [];

  if (!fs.existsSync(currentDir)) return warnings;

  const join = path.join;
  const hasDef = fs.existsSync(join(currentDir, 'def-template.json'));
  const hasAssetsDef = fs.existsSync(join(currentDir, 'assets', 'def-template.json'));
  const hasDecompiled = fs.readdirSync(currentDir).some((name) => {
    const full = join(currentDir, name);
    return fs.statSync(full).isDirectory() && fs.existsSync(join(full, 'resource'));
  });
  const hasWebpackManifest = fs.readdirSync(currentDir).some((name) => {
    if (!name.endsWith('_output')) return false;
    return fs.existsSync(join(currentDir, name, '_webpack_main_manifest.json'));
  });

  if (['legacy', 'v2', 'v3'].includes(route.format) && !hasDef && !hasAssetsDef) {
    warnings.push(
      'PlayableMaker 格式：sources/current/ 缺少 def-template.json，extract 会跳过资源复制，工程可能无法运行。',
    );
  }

  if (route.format === 'phaser2-mw' && !hasDecompiled) {
    warnings.push(
      'Phaser 2.3：未找到 *_output/resource/ 侧车目录，场景 .bin 可能缺失，易出现 Parse fail / 黑屏。',
    );
  }

  const hasPlayableAssets = fs.readdirSync(currentDir).some((name) => {
    const full = join(currentDir, name);
    return fs.statSync(full).isDirectory() && fs.existsSync(join(full, 'playableAssets'));
  });
  if (route.format === 'phaser2-applovin' && !hasPlayableAssets) {
    warnings.push(
      'Phaser 2.6 AppLovin：未找到 *_output/playableAssets/ 侧车目录，extract 将尝试从 HTML 内嵌 base64 解出资源（较慢）。',
    );
  }

  if (route.format === 'webpack_main' && !hasWebpackManifest) {
    warnings.push(
      'webpack_main：无 *_output/_webpack_main_manifest.json，将仅依赖 bundle 内嵌资源外置；外置资源多的包可能缺图/缺音。',
    );
  }

  return warnings;
}
