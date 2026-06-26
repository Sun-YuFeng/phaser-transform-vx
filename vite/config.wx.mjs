import { defineConfig } from 'vite';
import { resolve, join } from 'path';
import { getWxProjectDir } from '../scripts/wx-project.mjs';

const wxRoot = getWxProjectDir();

export default defineConfig({
    // 资源由 copy-wx-assets.mjs 同步到 {wx}/assets/，勿让 Vite 再拷 public/ → js/playable/
    publicDir: false,
    build: {
        outDir: join(wxRoot, 'js/playable'),
        emptyOutDir: true,
        // 微信小游戏 JS 引擎不支持 ?? / ?. 等 ES2020 语法
        target: 'es2015',
        lib: {
            entry: resolve('src/wx/main.js'),
            formats: ['cjs'],
            fileName: () => 'bundle.js',
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
            format: {
                ecma: 5,
            },
        },
    },
    esbuild: {
        target: 'es2015',
        supported: {
            'nullish-coalescing': false,
            'optional-chain': false,
        },
    },
    resolve: {
        alias: {
            phaser: resolve('node_modules/phaser/dist/phaser.js'),
        },
    },
});
