import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const POINTER = join(ROOT, '.wx-project');
const TEMPLATE_POINTER = join(ROOT, '.wx-template');

/** 支持的微信版本模板 */
export const WX_TEMPLATES = {
  '3.90.0': 'phaser3.90.0',
  '2.3.0': 'phaser2.3.0',
};

const DEFAULT_TEMPLATE = 'phaser3.90.0';

export function parseTemplateArg(argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--template' && argv[i + 1]) return argv[i + 1];
    if (argv[i].startsWith('--template=')) return argv[i].slice('--template='.length);
  }
  return null;
}

/** 从 phaser2.3.0 / phaser3.90.0 目录名解析版本号 */
export function versionFromTemplateDir(dirName) {
  const m = String(dirName).match(/^phaser([\d.]+)$/);
  return m ? m[1] : null;
}

export function getWxTemplateDir() {
  const fromEnv = process.env.WX_TEMPLATE?.trim();
  if (fromEnv) return fromEnv;

  if (existsSync(TEMPLATE_POINTER)) {
    const name = readFileSync(TEMPLATE_POINTER, 'utf8').trim();
    if (name) return name;
  }

  return DEFAULT_TEMPLATE;
}

export function setWxTemplateDir(name) {
  writeFileSync(TEMPLATE_POINTER, `${name}\n`);
}

export function resolveTemplateDir(nameOrVersion) {
  if (!nameOrVersion) return join(ROOT, DEFAULT_TEMPLATE);
  if (nameOrVersion.startsWith('phaser')) return join(ROOT, nameOrVersion);
  const mapped = WX_TEMPLATES[nameOrVersion];
  if (mapped) return join(ROOT, mapped);
  return join(ROOT, `phaser${nameOrVersion}`);
}

export function getPhaserVersion() {
  const tpl = getWxTemplateDir();
  const fromTpl = versionFromTemplateDir(tpl.split(/[/\\]/).pop());
  if (fromTpl) return fromTpl;

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return pkg.dependencies?.phaser || pkg.devDependencies?.phaser || '3.90.0';
}

/** phaser3.90.0_2026-06-24_101530 */
export function makeWxProjectName(date = new Date()) {
  const ver = getPhaserVersion();
  const p = (n) => String(n).padStart(2, '0');
  const ts = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `phaser${ver}_${ts}`;
}

export function getTemplateDir() {
  return join(ROOT, getWxTemplateDir());
}

export function getWxProjectDir() {
  if (process.env.WX_PROJECT) {
    return resolve(ROOT, process.env.WX_PROJECT);
  }
  if (existsSync(POINTER)) {
    const name = readFileSync(POINTER, 'utf8').trim();
    if (name) return join(ROOT, name);
  }
  return getTemplateDir();
}

export function getWxProjectName() {
  return getWxProjectDir().split(/[/\\]/).pop();
}

export function setWxProjectDir(name) {
  writeFileSync(POINTER, `${name}\n`);
}

// 兼容旧 import
export const WX_TEMPLATE_DIR = DEFAULT_TEMPLATE;
