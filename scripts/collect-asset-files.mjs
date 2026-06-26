/** 从 def-template.json 收集所有引用的资源文件名 */
export function collectAssetFiles(def) {
  const files = new Set();

  if (def.fontFamily) {
    files.add(def.fontFamily);
  }
  if (def.globalAudio) {
    files.add(def.globalAudio);
  }

  function walk(node) {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (node.type === 'Asset' && node.value?.value) {
      files.add(node.value.value);
    }

    for (const key of Object.keys(node)) {
      walk(node[key]);
    }
  }

  walk(def);
  return files;
}
