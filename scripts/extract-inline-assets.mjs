import { Buffer } from 'buffer';

const ASSET_EXT = /\.(png|jpe?g|webp|gif|bmp|mp3|wav|ogg|m4a|aac|ttf|otf|woff2?)$/i;

/**
 * 从 PlayableMaker（inline-assets）导出的 output.html 中解出内嵌的
 * def-template.json 与所有 base64 内联资源。
 *
 * 内联条目形如 `"name":"data:<mime>;base64,<data>"`，键即文件名。
 *
 * @param {string} html output.html 全文
 * @returns {{ def: object|null, assets: {name: string, buffer: Buffer}[] }}
 */
export function extractInlineAssets(html) {
  const assets = [];
  const seen = new Set();
  let def = null;

  const re = /"([^"\\]+?)":"data:[^"]*?base64,([A-Za-z0-9+/=]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[1];
    const b64 = m[2];

    if (name === 'def-template.json') {
      if (!def) {
        try {
          def = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        } catch {
          /* 保底：解析失败时保持 null */
        }
      }
      continue;
    }

    if (!ASSET_EXT.test(name) || seen.has(name)) continue;
    seen.add(name);
    assets.push({ name, buffer: Buffer.from(b64, 'base64') });
  }

  return { def, assets };
}
