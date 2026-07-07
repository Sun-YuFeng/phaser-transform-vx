import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];

const m = bundle.match(/load\.image\(ne,"(data:image\/[^"]+)"\)/);
if (!m) {
  console.error('ne load.image not found in bundle');
  process.exit(1);
}

const dataUrl = m[1];
const comma = dataUrl.indexOf(',');
const buf = Buffer.from(dataUrl.slice(comma + 1), 'base64');

const targets = [
  'public/assets/base_scene_flag_character.png',
  'output/wx/phaser3.88.2_2026-06-26_122630/assets/base_scene_flag_character.png',
  'sources/current/2026-06-26_170443_output/images/base_scene_flag_character.png',
];

for (const t of targets) {
  await sharp(buf).png().toFile(t);
  console.log('restored:', t, (buf.length / 1024).toFixed(1) + 'KB');
}

await sharp(buf)
  .webp({ lossless: true })
  .toFile('sources/current/2026-06-26_170443_output/images/base_scene_flag_character.webp');
console.log('webp restored');

const meta = await sharp(buf).metadata();
console.log('size:', meta.width, 'x', meta.height, 'alpha:', meta.hasAlpha);
