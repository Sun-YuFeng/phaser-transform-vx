import { spawnSync } from 'child_process';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const node = process.execPath;

function run(script) {
  const r = spawnSync(node, [script], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log('=== 1/2 归档 sources/current → sources/history/ ===');
run('scripts/archive-game.mjs');

console.log('\n=== 2/2 清理 public/assets 未引用文件 ===');
run('scripts/clean-public-assets.mjs');

console.log('\n完成。sources/current/ 已清空，可放入下一个游戏。');
