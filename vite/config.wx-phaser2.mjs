import { defineConfig } from 'vite';
import { resolve, join } from 'path';
import { getWxProjectDir } from '../scripts/wx-project.mjs';

const wxRoot = getWxProjectDir();

export default defineConfig({
  publicDir: false,
  build: {
    outDir: join(wxRoot, 'js/playable'),
    emptyOutDir: false, // 保留 phaser/qc 等由 copy 写入的 lib
    target: 'es5',
    lib: {
      entry: resolve('src/phaser2/wx/main.js'),
      formats: ['cjs'],
      fileName: () => 'boot.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: false,
      mangle: false,
      format: { ecma: 5 },
    },
  },
  esbuild: {
    target: 'es2015',
    supported: {
      'nullish-coalescing': false,
      'optional-chain': false,
    },
  },
});
