import fs from 'fs';
import { findHtmlPath } from './game-sources.mjs';

const htmlPath = findHtmlPath();
const c = fs.readFileSync(htmlPath, 'utf8');

const ids = [...c.matchAll(/<script id="([^"]+)"/g)].map((m) => m[1]);
console.log('File:', htmlPath, '| MB:', (c.length / 1024 / 1024).toFixed(2));
console.log('\nScript IDs (' + ids.length + '):');
ids.forEach((id) => console.log(' -', id));

const checks = [
  'phaser.min',
  'qc-core',
  'qc-webgl',
  '2.3.0',
  'Phaser.VERSION',
  'game-scripts',
  'resource-loader',
  'PlaySmartEditorData',
  'pl-adapter',
  'ReportLog',
  'applovin',
  'PlayableMaker',
];
console.log('\nMarkers:');
for (const k of checks) console.log(' ', k, c.includes(k) ? 'yes' : 'no');

const bodyStart = c.indexOf('<body');
if (bodyStart >= 0) console.log('\nBody snippet:\n', c.slice(bodyStart, bodyStart + 2000));

const filesIdx = c.indexOf('var files');
console.log('\nfiles object at:', filesIdx);
if (filesIdx >= 0) {
  const slice = c.slice(filesIdx, filesIdx + 500);
  const keyCount = (c.slice(filesIdx).match(/"replace_js/g) || []).length;
  console.log('replace_js entries (~):', keyCount);
  console.log('files head:', slice.slice(0, 200));
}

const phaserIdx = c.indexOf('phaser.min.js');
if (phaserIdx >= 0) {
  const chunk = c.slice(phaserIdx, phaserIdx + 8000);
  const ver = chunk.match(/VERSION[^'"]*['"]([\d.]+)['"]/);
  console.log('\nPhaser in HTML:', ver ? ver[1] : 'version not found in nearby chunk');
}
