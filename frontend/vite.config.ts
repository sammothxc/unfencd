import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'unfencd',
        short_name: 'unfencd',
        description: 'Dispersed camping map for Utah public land',
        theme_color: '#1a1a1a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        // Vector tiles and API responses are handled by the app's own caching logic.
        // Only cache the app shell here.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: []
      }
    })
  ],
  server: {
    proxy: {
      '/tiles': {
        target: process.env.VITE_MARTIN_URL ?? 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/tiles/, '')
      },
      '/raster': {
        target: process.env.VITE_TILESERVER_URL ?? 'http://localhost:8080',
        rewrite: (path) => path.replace(/^\/raster/, '')
      }
    }
  }
})
