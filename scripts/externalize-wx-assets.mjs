/**
 * webpack_main：将 runtime 内嵌 data: URL 改为 assets/ 文件路径，缩小 bundle。
 * 仅存在于 bundle 的图片（如 tutorial_anim_2）会解码写入 extractedFiles。
 */
import { wxSafeFilename } from './normalize-asset-names.mjs';

const DATA_URL_RE = /^data:([^;]+);base64,(.+)$/s;

function parseDataUrl(url) {
  const m = String(url).match(DATA_URL_RE);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}

function parseItemNameMap(code, varName) {
  const m = code.match(new RegExp(`${varName}=\\{([^}]+)\\}`));
  if (!m) return {};
  const map = {};
  for (const [, item, stem] of m[1].matchAll(/(item\d+):"([^"]+)"/g)) {
    map[item] = stem;
  }
  return map;
}

/** 纹理变量 → Phaser cache key（如 at → base_scene_background_portrait） */
export function buildVarToKeyMap(code) {
  const map = new Map();
  // 不用 \\b：$t 前无 word boundary；值须为 snake_case 纹理 key
  for (const m of code.matchAll(/([$A-Za-z_][\w$]{0,3})="([a-z][a-z0-9_]+)"/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

function parseObjectStringMap(code, varName) {
  const m = code.match(new RegExp(`${varName}=\\{([^}]+)\\}`));
  if (!m) return {};
  const map = {};
  for (const [, key, val] of m[1].matchAll(/([\w$]+):"([^"]+)"/g)) {
    map[key] = val;
  }
  return map;
}

function parseStringArray(code, varName) {
  const m = code.match(new RegExp(`${varName}=\\[([^\\]]+)\\]`));
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function resolveMemberTextureKey(code, keyExpr) {
  const m = keyExpr.match(/^([$A-Za-z_][\w$]*)\.(.+)$/);
  if (!m) return null;
  const obj = parseObjectStringMap(code, m[1]);
  return obj[m[2]] || null;
}

function externalizeToAssetPath(stem, dataUrl, options) {
  const safe = wxSafeFilename(stem);
  maybeExtractPng(safe, dataUrl, options);
  return `"assets/${safe}.png"`;
}

/** manifest images/* / audio/* → 磁盘文件名（用纹理 key，避免 at/At 大小写冲突） */
export function destNameForManifestAsset(rel, varToKey) {
  const norm = String(rel || '').replace(/\\/g, '/');
  const base = norm.split('/').pop() || '';
  const stem = base.replace(/\.(webp|m4a|mp3)$/i, '');
  const key = varToKey.get(stem);
  if (key) {
    if (/\.m4a$/i.test(base) || /\.mp3$/i.test(base)) {
      return `${wxSafeFilename(key)}.m4a`;
    }
    return `${wxSafeFilename(key)}.png`;
  }
  let dest = wxSafeFilename(base);
  if (/\.webp$/i.test(dest)) {
    dest = dest.replace(/\.webp$/i, '.png');
  }
  return dest;
}

function buildWebpackModuleIdMap(code) {
  const idToStem = new Map();
  for (const m of code.matchAll(/"\.\/([^"]+\.webp)":(\d+)/g)) {
    idToStem.set(m[2], m[1].replace(/\.webp$/i, ''));
  }
  return idToStem;
}

function resolveImageFileStem(varName, varToKey) {
  const key = varToKey.get(varName);
  if (key) return wxSafeFilename(key);
  return wxSafeFilename(varName);
}

function maybeExtractPng(stem, dataUrl, options) {
  if (options.skipWriteStems.has(stem)) return;
  const parsed = parseDataUrl(dataUrl);
  if (parsed) {
    options.extractedFiles.push({
      dest: `${stem}.png`,
      buffer: parsed.buffer,
      mime: parsed.mime,
    });
  }
}

function externalizeItemTextureMap(code, dataVar, nameMap, options) {
  const blockRe = new RegExp(`${dataVar}=\\{([^}]+)\\}`);
  const dataMatch = code.match(blockRe);
  if (!dataMatch) return { code, count: 0 };

  let inner = dataMatch[1];
  let count = 0;
  for (const [item, stem] of Object.entries(nameMap)) {
    const re = new RegExp(`(${item}:)"(data:image/[^"]+)"`);
    const next = inner.replace(re, (full, prefix, dataUrl) => {
      const safe = wxSafeFilename(stem);
      maybeExtractPng(safe, dataUrl, options);
      count++;
      return `${prefix}"assets/${safe}.png"`;
    });
    inner = next;
  }

  return { code: code.replace(blockRe, `${dataVar}={${inner}}`), count };
}

const AUDIO_BY_FN = [
  ['playClickSound', 'click_sound.m4a'],
  ['playMergeSound', 'merge_sound.m4a'],
  ['playCompleteSound', 'complete_sound.m4a'],
  ['playFemaleVoiceSound', 'female_voice_sound.m4a'],
];

/** preload 里用变量名作 key 的资源（logo / 引导图）→ assets 文件名 stem */
const VAR_LOAD_FILES = {
  'st.en': 'st.en',
  'st.ja': 'st.ja',
  'st.ko': 'st.ko',
  'st.zh': 'st.zh',
  nt: 'nt',
  rt: 'rt',
  ot: 'ot',
};

function externalizeLoadImage(keyExpr, dataUrl, options) {
  const { skipWriteStems, extractedFiles, stats } = options;
  stats.loadImage++;
  const stem = wxSafeFilename(
    VAR_LOAD_FILES[keyExpr] || keyExpr.replace(/^"|"$/g, ''),
  );
  maybeExtractPng(stem, dataUrl, { skipWriteStems, extractedFiles });
  return `this.load.image(${keyExpr},"assets/${stem}.png")`;
}

function externalizeWebpackImageModules(code, options) {
  const idToStem = buildWebpackModuleIdMap(code);
  const { skipWriteStems, extractedFiles } = options;
  let count = 0;
  let extracted = 0;

  const result = code.replace(
    /(\d+):t=>\{"use strict";t\.exports="(data:image\/[^"]+)"\}/g,
    (full, id, dataUrl) => {
      const stem = idToStem.get(id);
      if (!stem) return full;
      count++;
      const safe = wxSafeFilename(stem);
      if (!skipWriteStems.has(safe)) {
        const parsed = parseDataUrl(dataUrl);
        if (parsed) {
          extractedFiles.push({
            dest: `${safe}.png`,
            buffer: parsed.buffer,
            mime: parsed.mime,
          });
          skipWriteStems.add(safe);
          extracted++;
        }
      }
      return `${id}:t=>{"use strict";t.exports="assets/${safe}.png"}`;
    },
  );

  return { code: result, count, extracted };
}

function externalizeLoadImageVars(code, options) {
  const varToKey = buildVarToKeyMap(code);
  const { skipWriteStems, extractedFiles, stats } = options;
  let count = 0;

  const result = code.replace(
    /this\.load\.image\(([A-Za-z_$][\w$]*),"(data:image\/[^"]+)"\)/g,
    (full, varName, dataUrl) => {
      const stem = resolveImageFileStem(varName, varToKey);
      maybeExtractPng(stem, dataUrl, { skipWriteStems, extractedFiles });
      count++;
      stats.loadImageVar = (stats.loadImageVar || 0) + 1;
      return `this.load.image(${varName},"assets/${stem}.png")`;
    },
  );

  return { code: result, count };
}

function externalizeLoadAudioVars(code, options) {
  const varToKey = buildVarToKeyMap(code);
  const { skipWriteStems, extractedFiles, stats } = options;
  let count = 0;

  const result = code.replace(
    /this\.load\.audio\(([A-Za-z_$][\w$]*),"(data:audio\/[^"]+)"\)/g,
    (full, varName, dataUrl) => {
      const stem = wxSafeFilename(varToKey.get(varName) || varName);
      const dest = `${stem}.m4a`;
      if (!skipWriteStems.has(stem)) {
        const parsed = parseDataUrl(dataUrl);
        if (parsed) extractedFiles.push({ dest, buffer: parsed.buffer });
      }
      count++;
      stats.loadAudioVar = (stats.loadAudioVar || 0) + 1;
      return `this.load.audio(${varName},"assets/${dest}")`;
    },
  );

  return { code: result, count };
}

/** Wt[0] 等数组下标 load.image */
function externalizeArrayIndexedLoads(code, options) {
  const arr = parseStringArray(code, 'Wt');
  if (!arr.length) return { code, count: 0 };
  let count = 0;
  const result = code.replace(
    /this\.load\.image\(Wt\[(\d+)\],\s*"(data:image\/[^"]+)"\)/g,
    (full, idx, dataUrl) => {
      const stem = arr[Number(idx)];
      if (!stem) return full;
      count++;
      options.stats.loadImageArray = (options.stats.loadImageArray || 0) + 1;
      const path = externalizeToAssetPath(stem, dataUrl, options);
      return `this.load.image(Wt[${idx}],${path})`;
    },
  );
  return { code: result, count };
}

/** Gt.middle / Ee.scene1_bubble_middle 等成员表达式 key */
function externalizeMemberExprLoads(code, options) {
  let count = 0;
  const result = code.replace(
    /this\.load\.image\(([$A-Za-z_][\w$.]*),\s*"(data:image\/[^"]+)"\)/g,
    (full, keyExpr, dataUrl) => {
      if (!keyExpr.includes('.')) return full;
      const stem = resolveMemberTextureKey(code, keyExpr);
      if (!stem) return full;
      count++;
      options.stats.loadImageMember = (options.stats.loadImageMember || 0) + 1;
      const path = externalizeToAssetPath(stem, dataUrl, options);
      return `this.load.image(${keyExpr},${path})`;
    },
  );
  return { code: result, count };
}

/** const j="data:..." / ,Z="data:..." 作第二参数的 load.image */
function externalizeConstDataUrlSecondArg(code, options) {
  const constRe =
    /const j="(data:image\/[^"]+)",Z="(data:image\/[^"]+)"/;
  const m = code.match(constRe);
  if (!m) return { code, count: 0 };

  const [, jUrl, zUrl] = m;
  const jLoads = {
    'Gt.top': 'scene1_bubble_top',
    'Gt.bottom': 'scene1_bubble_bottom',
  };
  const zLoads = {
    Xt: 'bathroom_bubble_dress',
    'Ee.scene1_bubble_top': 'scene1_icon_dress',
  };

  let result = code;
  let count = 0;

  for (const [keyExpr, stem] of Object.entries(jLoads)) {
    const re = new RegExp(
      `this\\.load\\.image\\(${keyExpr.replace('.', '\\.')},j\\)`,
    );
    if (re.test(result)) {
      const path = externalizeToAssetPath(stem, jUrl, options);
      result = result.replace(re, `this.load.image(${keyExpr},${path})`);
      count++;
    }
  }

  for (const [keyExpr, stem] of Object.entries(zLoads)) {
    const re = new RegExp(
      `this\\.load\\.image\\(${keyExpr.replace('.', '\\.')},Z\\)`,
    );
    if (re.test(result)) {
      const path = externalizeToAssetPath(stem, zUrl, options);
      result = result.replace(re, `this.load.image(${keyExpr},${path})`);
      count++;
    }
  }

  if (count > 0) {
    result = result.replace(
      constRe,
      'const j="assets/scene1_bubble_top.png",Z="assets/scene1_icon_dress.png"',
    );
    options.stats.constDataUrl = count;
  }

  return { code: result, count };
}

/** Vt={de:"data:..."} + Jt 纹理 key 映射 */
function externalizeLangImageMap(code, dataVar, keyVar, options) {
  const keyMap = parseObjectStringMap(code, keyVar);
  const blockRe = new RegExp(`${dataVar}=\\{([^}]+)\\}`);
  const dataMatch = code.match(blockRe);
  if (!dataMatch) return { code, count: 0 };

  let inner = dataMatch[1];
  let count = 0;
  for (const [lang, stem] of Object.entries(keyMap)) {
    const re = new RegExp(`${lang}:"(data:image/[^"]+)"`);
    inner = inner.replace(re, (full, dataUrl) => {
      count++;
      const path = externalizeToAssetPath(stem, dataUrl, options);
      return `${lang}:${path}`;
    });
  }

  return {
    code: code.replace(blockRe, `${dataVar}={${inner}}`),
    count,
  };
}

/**
 * @param {string} code webpack bundle 源码
 * @param {{ skipWriteStems?: Set<string> }} [options] manifest 已有文件的 stem，跳过重复解码写盘
 */
export function externalizeEmbeddedAssets(code, options = {}) {
  const skipWriteStems = options.skipWriteStems || new Set();
  const extractedFiles = [];
  const stats = {
    loadImage: 0,
    loadImageVar: 0,
    webpackModules: 0,
    textureMaps: 0,
    loadAudioVar: 0,
    audio: 0,
  };

  let result = code;
  const loadOpts = { skipWriteStems, extractedFiles, stats };

  const wxMods = externalizeWebpackImageModules(result, loadOpts);
  result = wxMods.code;
  stats.webpackModules = wxMods.count;
  stats.webpackExtracted = wxMods.extracted || 0;

  const varLoads = externalizeLoadImageVars(result, loadOpts);
  result = varLoads.code;

  const arrLoads = externalizeArrayIndexedLoads(result, loadOpts);
  result = arrLoads.code;
  stats.loadImageArray = arrLoads.count;

  const memberLoads = externalizeMemberExprLoads(result, loadOpts);
  result = memberLoads.code;
  stats.loadImageMember = memberLoads.count;

  const constLoads = externalizeConstDataUrlSecondArg(result, loadOpts);
  result = constLoads.code;
  stats.constDataUrl = constLoads.count;

  const vtLoads = externalizeLangImageMap(result, 'Vt', 'Jt', loadOpts);
  result = vtLoads.code;
  stats.langImageMap = vtLoads.count;

  result = result.replace(
    /this\.load\.image\("([^"]+)",\s*"(data:image\/[^"]+)"\)/g,
    (full, key, dataUrl) => externalizeLoadImage(`"${key}"`, dataUrl, loadOpts),
  );

  for (const keyExpr of Object.keys(VAR_LOAD_FILES)) {
    const esc = keyExpr.replace('.', '\\.');
    const re = new RegExp(
      `this\\.load\\.image\\(${esc},\\s*"(data:image/[^"]+)"\\)`,
      'g',
    );
    result = result.replace(re, (full, dataUrl) =>
      externalizeLoadImage(keyExpr, dataUrl, loadOpts),
    );
  }

  const ht = parseItemNameMap(result, 'ht');
  const ut = parseItemNameMap(result, 'ut');
  let r = externalizeItemTextureMap(result, 'lt', ht, loadOpts);
  result = r.code;
  stats.textureMaps += r.count;
  r = externalizeItemTextureMap(result, 'ct', ut, loadOpts);
  result = r.code;
  stats.textureMaps += r.count;

  const audioVars = externalizeLoadAudioVars(result, loadOpts);
  result = audioVars.code;

  for (const [fn, file] of AUDIO_BY_FN) {
    const re = new RegExp(
      `(${fn}\\(\\)\\{this\\.playOneShotAudio\\()"data:audio/[^"]+"`,
    );
    if (re.test(result)) {
      result = result.replace(re, `$1"assets/${file}"`);
      stats.audio++;
    }
  }

  const bgmRe = /new Audio\("data:audio\/[^"]+"\)/;
  if (bgmRe.test(result)) {
    result = result.replace(bgmRe, 'new Audio("assets/bgm.m4a")');
    stats.audio++;
  }

  const pngLeft = (result.match(/data:image\/png;base64,/g) || []).length;
  const audioLeft = (result.match(/data:audio\/[^;]+;base64,/g) || []).length;

  return { code: result, extractedFiles, stats, pngLeft, audioLeft };
}
