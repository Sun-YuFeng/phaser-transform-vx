/**
 * PNG 压缩：默认无损（sharp deflate）；可选 pngquant（有损调色板，体积更小）
 */
import sharp from 'sharp';
import { execFileSync } from 'child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PNGQUANT = path.join(ROOT, 'pngquant', 'pngquant.exe');

const PNG_DATA_URL_RE = /data:image\/png;base64,[A-Za-z0-9+/=]+/g;

export async function losslessCompressPngBuffer(input) {
  return sharp(input)
    .png({
      compressionLevel: 9,
      effort: 10,
      adaptiveFiltering: true,
      palette: false,
    })
    .toBuffer();
}

export async function losslessCompressPngFile(filePath) {
  const before = readFileSync(filePath);
  const after = await losslessCompressPngBuffer(before);
  if (after.length < before.length) {
    writeFileSync(filePath, after);
    return { before: before.length, after: after.length };
  }
  return { before: before.length, after: before.length, skipped: true };
}

export async function losslessCompressPngDataUrl(dataUrl) {
  if (!dataUrl.startsWith('data:image/png')) return dataUrl;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return dataUrl;
  try {
    const before = Buffer.from(dataUrl.slice(comma + 1), 'base64');
    const after = await losslessCompressPngBuffer(before);
    if (after.length >= before.length) return dataUrl;
    return `data:image/png;base64,${after.toString('base64')}`;
  } catch {
    return dataUrl;
  }
}

export async function losslessCompressPngInText(text) {
  const unique = [...new Set(text.match(PNG_DATA_URL_RE) || [])];
  if (unique.length === 0) return { text, count: 0, saved: 0 };

  const cache = new Map();
  let saved = 0;
  for (const url of unique) {
    const next = await losslessCompressPngDataUrl(url);
    cache.set(url, next);
    if (next !== url) {
      saved += url.length - next.length;
    }
  }

  let out = text;
  for (const [from, to] of cache) {
    if (from !== to) out = out.split(from).join(to);
  }

  return { text: out, count: unique.length, saved };
}

/** 序列帧动画（中文名 + _序号），不含 UI 静态图 */
export function isAnimFramePng(name) {
  return /^[\u4e00-\u9fa5].*_\d+\.png$/i.test(name);
}

export function isUiStaticPng(name) {
  return name.toLowerCase().endsWith('.png') && !isAnimFramePng(name);
}

function parseQualityArg() {
  const arg = process.argv.find((a) => a.startsWith('--quality='));
  return arg ? arg.slice('--quality='.length) : null;
}

export async function compressPngDir(dir, options = {}) {
  const mode =
    typeof options === 'string' ? options : (options.mode ?? 'lossless');
  const filter =
    typeof options === 'string' ? null : (options.filter ?? null);
  const qualityOverride =
    typeof options === 'string' ? null : options.quality;
  const animStyle =
    typeof options === 'string'
      ? mode === 'frames'
      : (options.animStyle ?? mode === 'frames');

  if (!existsSync(dir)) return { files: 0, saved: 0 };

  let files = 0;
  let saved = 0;

  for (const name of readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('.png')) continue;
    if (filter && !filter(name)) continue;
    const filePath = path.join(dir, name);
    if (!statSync(filePath).isFile()) continue;

    if (mode === 'pngquant' || mode === 'frames') {
      const quality =
        qualityOverride ??
        (mode === 'frames' ? '70-85' : '95-100');
      const r = runPngquant(filePath, quality, animStyle);
      if (r) {
        files++;
        saved += r.saved;
      }
      continue;
    }

    const r = await losslessCompressPngFile(filePath);
    files++;
    if (r && !r.skipped) saved += r.before - r.after;
  }

  return { files, saved };
}

/** pngquant → 8-bit RGBA 调色板，保留 alpha；frames 模式允许更糊、更小 */
export function runPngquant(filePath, quality = '95-100', animFrames = false) {
  if (!existsSync(PNGQUANT)) {
    console.warn('pngquant.exe not found:', PNGQUANT);
    return null;
  }

  const before = statSync(filePath).size;
  const args = [
    '--force',
    '--skip-if-larger',
    '--speed=1',
    `--quality=${quality}`,
    '--ext',
    '.png',
  ];
  // 序列帧：减少抖动，半透明边缘更干净
  if (animFrames) args.push('--nofs');

  try {
    execFileSync(PNGQUANT, [...args, filePath], { stdio: 'pipe' });
  } catch (e) {
    // 99 = 达不到 quality；98 = 跳过（如已是最优）
    if (e.status === 99 || e.status === 98) {
      return { before, after: before, saved: 0, skipped: true };
    }
    throw e;
  }

  const after = statSync(filePath).size;
  return { before, after, saved: Math.max(0, before - after) };
}

function fmtBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

async function runPass(label, dirs, options) {
  let totalSaved = 0;
  let totalFiles = 0;
  for (const dir of dirs) {
    const { files, saved } = await compressPngDir(dir, options);
    console.log(
      `${path.relative(ROOT, dir)}: ${files} ${label}, saved ${fmtBytes(saved)}`,
    );
    totalFiles += files;
    totalSaved += saved;
  }
  return { files: totalFiles, saved: totalSaved };
}

async function main() {
  const framesOnly = process.argv.includes('--frames');
  const uiOnly = process.argv.includes('--ui');
  const morePass = process.argv.includes('--more');
  const quality = parseQualityArg();

  const mode = framesOnly || morePass
    ? 'frames'
    : uiOnly
      ? 'pngquant'
      : process.argv.includes('--pngquant')
        ? 'pngquant'
        : 'lossless';

  const wxProject = readFileSync(path.join(ROOT, '.wx-project'), 'utf8').trim();
  const wxAssets = path.join(ROOT, wxProject, 'assets');
  const publicAssets = path.join(ROOT, 'public', 'assets');
  const runtimePath = path.join(ROOT, 'src', 'playable', 'runtime.js');
  const dirs = [publicAssets, wxAssets];

  let totalSaved = 0;

  if (morePass) {
    console.log('PNG compress: --more（帧动画更糊 + UI 轻度压缩，均保留透明）\n');
    const r1 = await runPass('anim frames', dirs, {
      mode: 'frames',
      filter: isAnimFramePng,
      quality: quality ?? '48-65',
      animStyle: true,
    });
    console.log(`  pass1 subtotal: ${fmtBytes(r1.saved)}\n`);
    const r2 = await runPass('UI static', dirs, {
      mode: 'pngquant',
      filter: isUiStaticPng,
      quality: quality ?? '88-96',
      animStyle: false,
    });
    console.log(`  pass2 subtotal: ${fmtBytes(r2.saved)}\n`);
    totalSaved = r1.saved + r2.saved;
  } else {
    const filter = framesOnly
      ? isAnimFramePng
      : uiOnly
        ? isUiStaticPng
        : null;
    const modeLabel =
      mode === 'lossless'
        ? 'sharp deflate, 无损'
        : framesOnly
          ? `pngquant RGBA 调色板（保留透明）${quality ? ` quality=${quality}` : ''}`
          : 'pngquant 有损调色板';
    console.log(`PNG compress mode: ${mode} (${modeLabel})`);

    const r = await runPass(
      framesOnly ? 'anim frames' : uiOnly ? 'UI static' : 'files',
      dirs,
      {
        mode,
        filter,
        quality: quality ?? undefined,
        animStyle: framesOnly,
      },
    );
    totalSaved = r.saved;

    if (existsSync(runtimePath) && mode === 'lossless') {
      const raw = readFileSync(runtimePath, 'utf8');
      const { text, count, saved } = await losslessCompressPngInText(raw);
      if (saved > 0) writeFileSync(runtimePath, text);
      console.log(`runtime.js embedded PNG: ${count} images, saved ${fmtBytes(saved)}`);
      totalSaved += saved;
    }
  }

  console.log(`Total saved: ${fmtBytes(totalSaved)}`);
  if (mode === 'lossless' && !morePass) {
    console.log('提示: 继续压缩: npm run compress:more');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
