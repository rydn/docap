import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from https://rydn.github.io/docap/
const base = process.env.DOCAP_BASE ?? '/docap/'
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,onnx,mjs,webmanifest}'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
      },
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'docap — document capture',
        short_name: 'docap',
        description: 'Hands-free document scanner: point, hold, done.',
        theme_color: '#0b0d10',
        background_color: '#0b0d10',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Cross-origin isolation enables SharedArrayBuffer → multi-threaded WASM inference.
  // On GitHub Pages the service worker adds these headers (see src/sw.ts).
  // DOCAP_PAGES_LIKE=1 serves without them, like Pages, to exercise the service worker path.
  server: { headers: ISOLATION_HEADERS },
  preview: { headers: process.env.DOCAP_PAGES_LIKE ? {} : ISOLATION_HEADERS },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 12000 },
})
