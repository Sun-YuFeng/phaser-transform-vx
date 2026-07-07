import sharp from 'sharp';
import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';

const LOGO_STEMS = [
  'base_scene_flag_name_hm_intl',
  'base_scene_flag_name_hm_zh',
  'base_scene_flag_name_hm_ja',
  'base_scene_flag_name_hm_ko',
];

const DIRS = [
  'public/assets',
  'output/wx/phaser3.88.2_2026-06-26_122630/assets',
  'sources/current/2026-06-26_170443_output/images',
];

async function transparentPngLike(srcPath) {
  const meta = await sharp(srcPath).metadata();
  const w = meta.width || 4;
  const h = meta.height || 4;
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
}

const ref = 'output/wx/phaser3.88.2_2026-06-26_122630/assets/base_scene_flag_name_hm_intl.png';

for (const stem of LOGO_STEMS) {
  let buf;
  const wxPath = `output/wx/phaser3.88.2_2026-06-26_122630/assets/${stem}.png`;
  const srcForSize = existsSync(wxPath) ? wxPath : ref;
  buf = await transparentPngLike(srcForSize);

  for (const dir of DIRS) {
    const png = path.join(dir, `${stem}.png`);
    if (!existsSync(path.dirname(png))) continue;
    await sharp(buf).toFile(png);
    const webp = path.join(dir, `${stem}.webp`);
    if (existsSync(webp) || dir.includes('170443_output')) {
      await sharp(buf).webp({ lossless: true }).toFile(webp);
    }
    console.log('transparent:', png);
  }
}

console.log('Done:', LOGO_STEMS.length, 'logo textures');
