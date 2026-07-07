import fs from 'fs';
import { externalizeEmbeddedAssets } from './externalize-wx-assets.mjs';

const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];

const constRe = /const j="(data:image\/[^"]+)",Z="(data:image\/[^"]+)"/;
console.log('const j,Z match:', constRe.test(bundle));

const ext = externalizeEmbeddedAssets(bundle, { skipWriteStems: new Set() });
console.log('stats:', ext.stats);
console.log('extracted:', ext.extractedFiles.length);
console.log('png left:', ext.pngLeft);
console.log('new files:', ext.extractedFiles.map((f) => f.dest).filter((d) => d.includes('scene1') || d.includes('bathroom_dress_option') || d.includes('bathroom_dress_cta_label') || d.includes('bathroom_bubble_dress')));

const loads = [...ext.code.matchAll(/this\.load\.image\(([^)]+)\)/g)];
const bad = loads.filter((m) => m[1].includes('data:image') || m[1].endsWith(',j)') || m[1].endsWith(',Z)'));
console.log('\nRemaining bad loads:', bad.map((m) => m[1].slice(0, 100)));
