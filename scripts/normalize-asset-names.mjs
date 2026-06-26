/** 微信包内路径大小写敏感，统一扩展名为小写 */
export function wxSafeFilename(file) {
  if (!file || typeof file !== 'string') return file;
  const dot = file.lastIndexOf('.');
  if (dot < 0) return file;
  return file.slice(0, dot + 1) + file.slice(dot + 1).toLowerCase();
}

export function normalizeDefAssetRefs(def) {
  const out = structuredClone(def);
  if (out.fontFamily) out.fontFamily = wxSafeFilename(out.fontFamily);
  if (out.globalAudio) out.globalAudio = wxSafeFilename(out.globalAudio);

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Asset' && node.value?.value) {
      node.value.value = wxSafeFilename(node.value.value);
    }
    for (const key of Object.keys(node)) walk(node[key]);
  }

  walk(out);
  return out;
}
