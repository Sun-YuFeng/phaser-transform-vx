import fs from 'fs';
const bundle = fs.readFileSync('sources/current/output.html', 'utf8').match(
  /<script[^>]*>([\s\S]*)<\/script>/i,
)[1];

// find j and Z definitions as string constants (not font metrics)
for (const v of ['j', 'Z']) {
  const patterns = [
    new RegExp(`[,;]${v}="([^"]+)"`, 'g'),
    new RegExp(`const ${v}="([^"]+)"`, 'g'),
    new RegExp(`var ${v}="([^"]+)"`, 'g'),
  ];
  const vals = new Set();
  for (const re of patterns) {
    for (const m of bundle.matchAll(re)) vals.add(m[1].slice(0, 80));
  }
  console.log(`${v} string defs:`, [...vals].slice(0, 10));
}

// module exports assigned to j? search scene1_bubble
for (const k of ['scene1_bubble_top', 'scene1_bubble_bottom', 'scene1_icon_dress', 'scene1_icon_shoes', 'scene1_icon_card']) {
  console.log(`\n${k} in bundle:`, bundle.includes(`"${k}"`));
}

// find standalone modules for scene1 bubbles - search in bundle exports
const mods = [...bundle.matchAll(/(\d+):t=>\{"use strict";t\.exports="data:image\/webp;base64,UklGRmwO/g)];
console.log('\nGt.middle webp module ids:', mods.map((m) => m[1]));

// search scene1_bubble in webpack modules by context
const ctx = [...bundle.matchAll(/"\.\/([^"]*scene1[^"]*\.webp)":(\d+)/g)];
console.log('scene1 webp contexts:', ctx);

// search icon in paths
const icons = [...bundle.matchAll(/"\.\/([^"]*icon[^"]*\.webp)":(\d+)/gi)];
console.log('icon webp:', icons.slice(0, 10));

// Z and j - look at preload context in bundle
const pi = bundle.indexOf('load.image(Gt.top,j)');
console.log('\npreload context:', bundle.slice(pi - 400, pi + 400));
