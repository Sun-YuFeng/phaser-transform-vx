import sharp from 'sharp';
import { unlinkSync } from 'fs';

const pairs = [
  'base_scene_flag_button_zh',
  'bathroom_dress_cta_label_zh',
];
const srcDir = 'sources/current/2026-06-26_170443_output/images';

for (const stem of pairs) {
  const png = `${srcDir}/${stem}.png`;
  await sharp(png).webp({ lossless: true }).toFile(`${srcDir}/${stem}.webp`);
  console.log('webp updated:', stem);
}

const hmWebp = `${srcDir}/base_scene_flag_name_hm_intl.webp`;
const hmTargets = [
  'public/assets/base_scene_flag_name_hm_intl.png',
  'output/wx/phaser3.88.2_2026-06-26_122630/assets/base_scene_flag_name_hm_intl.png',
];
for (const t of hmTargets) {
  await sharp(hmWebp).png().toFile(t);
  console.log('restored hm_intl (bad upload):', t);
}
try {
  unlinkSync(`${srcDir}/base_scene_flag_name_hm_intl.png`);
} catch {}
