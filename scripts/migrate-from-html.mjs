/**
 * 一键迁移：用户 HTML → 微信小游戏工程
 *
 * 用法:
 *   node scripts/migrate-from-html.mjs <path/to/game.html> [--name <wx-dir>] [--fresh] [--dry-run]
 *   npm run migrate -- path/to/game.html
 */
import { spawnSync } from 'child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  collectPreflightWarnings,
  detectPlayableFormat,
} from './detect-playable-format.mjs';
import { CURRENT_DIR, ensureSourceDirs } from './game-sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DIR = path.join(ROOT, 'plan', 'reports');
const REPORT_PATH = path.join(REPORT_DIR, 'migrate-report.json');
const NODE = process.execPath;

/** @type {import('./detect-playable-format.mjs').FormatRoute & { markers?: Record<string, boolean> }} */
let detected = { format: 'UNKNOWN', template: '', extractScript: '', buildScript: '', phaserVersion: '' };

/** @type {{ name: string; ok: boolean; ms: number; detail?: string }[]} */
const steps = [];
/** @type {string[]} */
const warnings = [];
/** @type {string[]} */
const errors = [];

const startedAt = new Date().toISOString();
let wxProjectRel = '';

function parseArgs(argv) {
  const flags = { fresh: false, dryRun: false, name: '' };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fresh') flags.fresh = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--name' && argv[i + 1]) {
      flags.name = argv[++i];
    } else if (a.startsWith('--name=')) {
      flags.name = a.slice('--name='.length);
    } else if (!a.startsWith('--')) {
      positional.push(a);
    }
  }
  return { ...flags, htmlPath: positional[0] || '' };
}

function runStep(name, fn) {
  const t0 = Date.now();
  process.stdout.write(`\n=== ${name} ===\n`);
  try {
    const detail = fn();
    const ms = Date.now() - t0;
    steps.push({ name, ok: true, ms, detail });
    return true;
  } catch (err) {
    const ms = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ name, ok: false, ms, detail: msg });
    errors.push(`${name}: ${msg}`);
    return false;
  }
}

function runNodeScript(scriptRel, extraArgs = []) {
  const script = path.join(ROOT, 'scripts', scriptRel);
  const r = spawnSync(NODE, [script, ...extraArgs], { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`${scriptRel} exited with code ${r.status ?? 'unknown'}`);
  }
}

function runNpmScript(scriptName) {
  const r = spawnSync('npm', ['run', scriptName], {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
    shell: true,
  });
  if (r.status !== 0) {
    throw new Error(`npm run ${scriptName} exited with code ${r.status ?? 'unknown'}`);
  }
}

function clearCurrentDir() {
  if (!existsSync(CURRENT_DIR)) return;
  for (const name of readdirSync(CURRENT_DIR)) {
    const full = path.join(CURRENT_DIR, name);
    rmSync(full, { recursive: true, force: true });
  }
}

function stageHtml(srcPath) {
  const abs = path.resolve(srcPath);
  if (!existsSync(abs)) {
    throw new Error(`HTML not found: ${abs}`);
  }
  const stat = statSync(abs);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${abs}`);
  }

  ensureSourceDirs();
  const dest = path.join(CURRENT_DIR, 'output.html');
  if (path.resolve(abs) !== path.resolve(dest)) {
    cpSync(abs, dest, { force: true });
  }
  return { abs, dest, sizeMb: Number((stat.size / 1024 / 1024).toFixed(3)) };
}

function countAssetsDir() {
  const assetsDir = path.join(ROOT, 'public', 'assets');
  if (!existsSync(assetsDir)) return 0;
  return readdirSync(assetsDir).filter((f) => statSync(path.join(assetsDir, f)).isFile()).length;
}

function readWxProjectPointer() {
  const pointer = path.join(ROOT, '.wx-project');
  if (!existsSync(pointer)) return '';
  return readFileSync(pointer, 'utf8').trim();
}

function writeReport(extra = {}) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const report = {
    ok: errors.length === 0 && detected.format !== 'UNKNOWN',
    startedAt,
    finishedAt: new Date().toISOString(),
    input: extra.input,
    detected: {
      format: detected.format,
      template: detected.template,
      phaserVersion: detected.phaserVersion,
      extractScript: detected.extractScript,
      buildScript: detected.buildScript,
      markers: detected.markers,
    },
    steps,
    warnings,
    errors,
    wxProject: wxProjectRel,
    assetsInPublic: extra.assetsInPublic ?? null,
    ...extra,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  return report;
}

function failAndExit(code, extra = {}) {
  const report = writeReport(extra);
  console.error('\n迁移失败。报告:', REPORT_PATH);
  if (report.errors.length) {
    console.error(report.errors.join('\n'));
  }
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));
if (!args.htmlPath) {
  console.error('用法: npm run migrate -- <path/to/game.html> [--name <wx-dir>] [--fresh] [--dry-run]');
  process.exit(1);
}

console.log('Phaser 试玩 → 微信小游戏（migrate v1）');
console.log('输入:', path.resolve(args.htmlPath));

let staged;
if (!runStep('stage', () => {
  if (args.fresh) clearCurrentDir();
  staged = stageHtml(args.htmlPath);
  return `→ ${staged.dest} (${staged.sizeMb} MB)`;
})) {
  failAndExit(1, { input: { html: args.htmlPath } });
}

const html = readFileSync(staged.dest, 'utf8');
detected = detectPlayableFormat(html);
warnings.push(...collectPreflightWarnings(CURRENT_DIR, detected));

console.log('\n探测格式:', detected.format);
console.log('微信模板:', detected.template || '(未知)');
if (warnings.length) {
  console.log('\n警告:');
  for (const w of warnings) console.log(' -', w);
}

if (detected.format === 'UNKNOWN') {
  errors.push('无法识别 HTML 打包形态；请确认是 Phaser 试玩导出，或扩展 detect-playable-format.mjs');
  failAndExit(2, { input: staged });
}

if (args.dryRun) {
  const report = writeReport({ input: staged, dryRun: true });
  console.log('\n[dry-run] 将执行:');
  console.log(`  init:wx --template ${detected.template}${args.name ? ` ${args.name}` : ''}`);
  console.log(`  node scripts/${detected.extractScript}`);
  const buildHint =
    detected.format === 'phaser2-mw'
      ? 'npm run build:wx:phaser2'
      : detected.format === 'phaser2-applovin'
        ? 'npm run build:wx:phaser26'
        : 'npm run build:wx';
  console.log(`  ${buildHint}`);
  console.log('\n报告:', REPORT_PATH);
  process.exit(0);
}

const initArgs = ['--template', detected.template];
if (args.name) initArgs.push(args.name);

if (
  !runStep('init:wx', () => {
    runNodeScript('init-wx-project.mjs', initArgs);
    wxProjectRel = readWxProjectPointer();
    if (!wxProjectRel) throw new Error('.wx-project not set after init:wx');
    return wxProjectRel;
  })
) {
  failAndExit(1, { input: staged });
}

if (
  !runStep('extract', () => {
    runNodeScript(detected.extractScript);
    return detected.extractScript;
  })
) {
  failAndExit(1, { input: staged });
}

const assetCount = countAssetsDir();
const buildLabel =
  detected.format === 'phaser2-mw'
    ? 'build:wx:phaser2'
    : detected.format === 'phaser2-applovin'
      ? 'build:wx:phaser26'
      : 'build:wx';

if (
  !runStep(buildLabel, () => {
    runNpmScript(buildLabel);
    return buildLabel;
  })
) {
  failAndExit(1, { input: staged, assetsInPublic: assetCount });
}

const report = writeReport({ input: staged, assetsInPublic: assetCount });
const wxAbs = path.join(ROOT, wxProjectRel);

console.log('\n========================================');
console.log('迁移完成');
console.log('微信工程:', wxAbs);
console.log('报告:', REPORT_PATH);
console.log('格式:', detected.format, '| 模板:', detected.template, '| 资源文件:', assetCount);
if (warnings.length) {
  console.log('\n注意:', warnings[0]);
  if (warnings.length > 1) console.log(`（另有 ${warnings.length - 1} 条警告，见报告）`);
}
console.log('\n下一步: 微信开发者工具打开上述目录 → 编译预览');
console.log('========================================\n');

process.exit(report.ok ? 0 : 1);
