import Phaser from 'phaser';
import { applyPhaserWxPatches, getWxCanvas, wxLoadFont } from './apply-phaser-wx-patches.js';

if (typeof wx !== 'undefined') {
    applyPhaserWxPatches(Phaser);
}

export { applyPhaserWxPatches, getWxCanvas, wxLoadFont };
