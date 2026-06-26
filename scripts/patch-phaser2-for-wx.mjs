/**
 * Phaser 2.3.0 min 在微信 require 下顶层 this 为 undefined。
 */
import { patchPhaser2ForWx } from './phaser2-wx-sanitize.mjs';

export { patchPhaser2ForWx };
