import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = env.VITE_SUPABASE_URL || ''

  let supabaseUrlPattern = null
  try {
    if (supabaseUrl) {
      const host = new URL(supabaseUrl).hostname.replace(/\./g, '\\.')
      supabaseUrlPattern = new RegExp(`^https:\\/\\/${host}\\/.*`, 'i')
    }
  } catch {
    // Invalid URL in env — PWA will skip Supabase runtime caching
  }

  const runtimeCaching = [
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts-stylesheets',
        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts-webfonts',
        expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ]

  if (supabaseUrlPattern) {
    runtimeCaching.push({
      // Supabase API — network-first so the team always sees fresh data;
      // fall back to cache so the app still loads when offline briefly.
      urlPattern: supabaseUrlPattern,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'supabase-api',
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
        cacheableResponse: { statuses: [0, 200] },
      },
    })
  }

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
        workbox: {
          clientsClaim: true,
          skipWaiting: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          runtimeCaching,
        },
        manifest: {
          name: 'Hilo Platform',
          short_name: 'Hilo',
          description: 'Hilo Design — internal operations platform for orders, production, customers and POS.',
          theme_color: '#c9a432',
          background_color: '#faf9f5',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    server: {
      port: 5173,
      strictPort: false,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  }
})
