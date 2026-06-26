/**
 * Phaser 2 / QC 微信启动入口（boot.js）。
 * phaser.min.js、qc-core 等由 copy-wx-phaser2-libs.mjs 拷到 js/playable/lib/，
 * game.js 按序 require 后再调 bootPlayable()。
 */
import './phaser-wx-patch.js';

function bootPlayable() {
  // TODO: 按 QC 引擎顺序挂载脚本并启动（下一步迁移）
  console.log('[phaser2] bootPlayable — runtime wiring pending');
}

export default bootPlayable;
