/**
 * 微信端部分机型 WebGL/Canvas 对 webp 支持差 → 转 PNG
 */
import sharp from 'sharp';
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';

const WEBP_DATA_URL_RE = /data:image\/webp;base64,[A-Za-z0-9+/=]+/g;

export async function convertWebpBufferToPng(webpBuffer) {
  return sharp(webpBuffer).png().toBuffer();
}

export function isWebpBuffer(buffer) {
  return (
    buffer &&
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}

/** data URL / 磁盘 webp buffer → PNG buffer；已是 PNG 则原样返回 */
export async function ensurePngBuffer(buffer, mime) {
  if (!buffer) return buffer;
  if (mime === 'image/webp' || isWebpBuffer(buffer)) {
    return convertWebpBufferToPng(buffer);
  }
  return buffer;
}

export async function convertWebpDataUrl(dataUrl) {
  if (!dataUrl.startsWith('data:image/webp')) {
    return dataUrl;
  }
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return dataUrl;
  const b64 = dataUrl.slice(comma + 1);
  const png = await convertWebpBufferToPng(Buffer.from(b64, 'base64'));
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** 替换 JS 文本中所有 data:image/webp base64 → png */
export async function convertWebpDataUrlsInText(text) {
  const unique = [...new Set(text.match(WEBP_DATA_URL_RE) || [])];
  if (unique.length === 0) {
    return { text, converted: 0 };
  }

  const cache = new Map();
  for (const webp of unique) {
    cache.set(webp, await convertWebpDataUrl(webp));
  }

  let out = text;
  for (const [webp, png] of cache) {
    if (webp !== png) {
      out = out.split(webp).join(png);
    }
  }

  return { text: out, converted: unique.length };
}

export async function convertWebpFileToPng(webpPath, pngPath, options = {}) {
  const { removeSource = false } = options;
  await sharp(webpPath).png().toFile(pngPath);
  if (removeSource && webpPath !== pngPath && existsSync(webpPath)) {
    unlinkSync(webpPath);
  }
  return pngPath;
}

/** 目录内 *.webp → 同名 .png，删除 webp */
export async function convertWebpFilesInDir(dir) {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const name of readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('.webp')) continue;
    const webpPath = path.join(dir, name);
    const pngPath = path.join(dir, name.replace(/\.webp$/i, '.png'));
    await convertWebpFileToPng(webpPath, pngPath, { removeSource: true });
    count++;
  }
  return count;
}

export async function convertWebpFileInPlace(filePath) {
  if (!filePath.toLowerCase().endsWith('.webp')) {
    return filePath;
  }
  const pngPath = filePath.replace(/\.webp$/i, '.png');
  await convertWebpFileToPng(filePath, pngPath, { removeSource: true });
  return pngPath;
}

/** 就地转换 runtime.js / bundle.js 内嵌 webp */
export async function convertWebpInJsFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const { text, converted } = await convertWebpDataUrlsInText(raw);
  if (converted > 0) {
    writeFileSync(filePath, text);
  }
  return converted;
}
