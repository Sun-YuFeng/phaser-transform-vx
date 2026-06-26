import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
} from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
export const SOURCES_DIR = join(ROOT, 'sources');
export const CURRENT_DIR = join(SOURCES_DIR, 'current');
export const HISTORY_DIR = join(SOURCES_DIR, 'history');

export const HTML_NAMES = ['output.html', 'index.html'];
export const SKIP_FILES = new Set([
  'README.md',
  'def-template.json',
  '_webpack_exports_manifest.json',
  '.gitkeep',
]);

export function ensureSourceDirs() {
  mkdirSync(CURRENT_DIR, { recursive: true });
  mkdirSync(HISTORY_DIR, { recursive: true });
}

export function findHtmlPath(dir = CURRENT_DIR) {
  for (const name of HTML_NAMES) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

export function findDefTemplatePath(dir = CURRENT_DIR) {
  const direct = join(dir, 'def-template.json');
  if (existsSync(direct)) return direct;
  const nested = join(dir, 'assets', 'def-template.json');
  if (existsSync(nested)) return nested;
  return null;
}

/** 收集 current 内资源文件（根目录或 assets/ 子目录，不含 html/manifest） */
export function listResourceFiles(dir = CURRENT_DIR) {
  const files = [];
  const scan = (base, prefix = '') => {
    if (!existsSync(base)) return;
    for (const name of readdirSync(base)) {
      if (SKIP_FILES.has(name) || HTML_NAMES.includes(name)) continue;
      const full = join(base, name);
      if (statSync(full).isDirectory()) {
        if (name === 'assets') scan(full, 'assets/');
        continue;
      }
      files.push({ src: full, rel: prefix + name });
    }
  };
  scan(dir);
  return files;
}

export function readGameName(dir = CURRENT_DIR) {
  const defPath = findDefTemplatePath(dir);
  if (!defPath) return 'untitled';
  try {
    const def = JSON.parse(readFileSync(defPath, 'utf8'));
    return def.general?.name || def.id || 'untitled';
  } catch {
    return 'untitled';
  }
}

export function slugify(name) {
  return String(name)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[<>:"/\\|?*]/g, '')
    .slice(0, 48) || 'untitled';
}

export function makeHistoryDirName(gameName, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const ts = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`;
  return `${slugify(gameName)}_${ts}`;
}

export function currentHasContent() {
  return findHtmlPath() !== null || listResourceFiles().length > 0;
}
