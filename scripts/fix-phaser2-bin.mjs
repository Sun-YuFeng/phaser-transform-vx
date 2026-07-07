/**
 * 修复 QC resource/*.bin：字面量 \\n、单对象未包数组、双重转义、内嵌 i18n JSON、字符串换行。
 */
import fs from 'fs';
import path from 'path';

const resourceDir = path.resolve(process.argv[2] || 'resource');

function walkBins(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walkBins(full, out);
    else if (name.endsWith('.bin')) out.push(full);
  }
  return out;
}

function fixLiteralEscapes(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !text.includes('\\n')) return text;
  if (text.includes('\n') && text.split('\\n').length < 3) return text;
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function unwrapDoubleEscape(text) {
  let cur = text.trim();
  for (let i = 0; i < 10; i++) {
    const parsed = tryParseJson(cur);
    if (Array.isArray(parsed) && parsed.length >= 1) {
      return JSON.stringify(parsed);
    }
    if (cur.includes('\\\\\\\\')) cur = cur.split('\\\\\\\\').join('\\\\');
    else if (cur.includes('\\\\')) cur = cur.split('\\\\').join('\\');
    else break;
  }
  return cur;
}

/** [N,"{...}"] 内嵌 JSON 未转义 → 正确转义 */
function fixQcEmbeddedJsonStrings(str) {
  let out = '';
  let i = 0;
  while (i < str.length) {
    const m = str.slice(i).match(/^\[(\d+),"\{/);
    if (!m) {
      out += str[i++];
      continue;
    }
    const type = m[1];
    let j = i + m[0].length - 1;
    let depth = 0;
    let k = j;
    for (; k < str.length; k++) {
      if (str[k] === '{') depth++;
      else if (str[k] === '}') {
        depth--;
        if (depth === 0 && str[k + 1] === '"') break;
      }
    }
    const objText = str.slice(j, k + 1);
    let obj = null;
    try {
      obj = JSON.parse(objText);
    } catch {
      obj = {};
      for (const pm of objText.matchAll(/"([^"\\]+)"\s*:\s*"([^"\\]*)"/g)) obj[pm[1]] = pm[2];
    }
    const escaped = JSON.stringify(obj).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    out += `[${type},"${escaped}"]`;
    i = k + 3;
  }
  return out;
}

/** JSON 字符串字面量内的真实换行/控制符 */
function escapeControlInJsonStrings(str) {
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (esc) {
        out += ch;
        esc = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        esc = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inStr = false;
        continue;
      }
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
      if (ch.charCodeAt(0) < 32) {
        out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      continue;
    }
    out += ch;
  }
  return out;
}

function fixInnerSceneJson(inner) {
  let cur = inner;
  if (tryParseJson(cur)) return cur;
  cur = fixQcEmbeddedJsonStrings(cur);
  if (tryParseJson(cur)) return cur;
  cur = escapeControlInJsonStrings(cur);
  if (tryParseJson(cur)) return cur;
  return null;
}

function inferMeta(obj, filePath) {
  const rel = filePath.replace(/\\/g, '/');
  let type = 2;
  let source = ['.prefab'];
  if (rel.includes('/scene/')) {
    type = 1;
    source = ['.state'];
  } else if (rel.includes('/audio/') || rel.endsWith('.mp3.bin')) {
    return null;
  }
  let uuid = '';
  if (obj?.data?._prefab?.[1]) uuid = obj.data._prefab[1];
  else if (obj?.data?.uuid?.[1]) uuid = obj.data.uuid[1];
  else if (typeof obj?.data?.uuid === 'string') uuid = obj.data.uuid;
  if (!uuid && obj?.uuid) uuid = obj.uuid;
  return JSON.stringify({ uuid, type, source: source });
}

function fixBinFile(filePath) {
  let raw = fs.readFileSync(filePath);
  if (raw[0] === 0x49 && raw[1] === 0x44 && raw[2] === 0x33) return false;
  let text = raw.toString('utf8').trim();
  if (!text) return false;

  const original = text;
  text = fixLiteralEscapes(text);
  text = unwrapDoubleEscape(text);

  let asArray = tryParseJson(text);
  if (Array.isArray(asArray) && asArray.length >= 2 && typeof asArray[1] === 'string') {
    const fixedInner = fixInnerSceneJson(asArray[1]);
    if (fixedInner) {
      asArray[1] = fixedInner;
      const normalized = JSON.stringify(asArray);
      if (normalized !== original) {
        fs.writeFileSync(filePath, normalized);
        return true;
      }
      return false;
    }
  }

  if (Array.isArray(asArray) && asArray.length >= 1) {
    const normalized = JSON.stringify(asArray);
    if (normalized !== original) {
      fs.writeFileSync(filePath, normalized);
      return true;
    }
    return false;
  }

  const obj = tryParseJson(text);
  if (!obj || typeof obj !== 'object') return false;

  const meta = inferMeta(obj, filePath);
  if (!meta) return false;
  const wrapped = JSON.stringify([meta, JSON.stringify(obj)]);
  fs.writeFileSync(filePath, wrapped);
  return true;
}

if (!fs.existsSync(resourceDir)) {
  console.error('Resource dir not found:', resourceDir);
  process.exit(1);
}

const bins = walkBins(resourceDir);
let fixed = 0;
for (const f of bins) {
  if (fixBinFile(f)) {
    fixed++;
    console.log('Fixed', path.relative(resourceDir, f));
  }
}
console.log(`Done: ${fixed}/${bins.length} bins updated in ${resourceDir}`);
