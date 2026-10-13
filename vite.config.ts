/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// BASE_PATH is set by the GitHub Pages workflow ("/waypoints/"); self-hosted builds serve from "/".
const base = process.env.BASE_PATH ?? '/'

// Content-Security-Policy for the built app. Only the app's own scripts and styles run. Maps,
// calendars and booking sites are plain links that open elsewhere. The only requests the app makes
// are to the optional sync server, whose address people type in, so any https: address is allowed
// (and localhost, for a server run while developing), and to Photon (photon.komoot.io) for address
// search, only for people who turn it on in Settings. Otherwise it connects to nothing.
// Photos and documents are shown from the phone's own storage (blob: URLs), never fetched as images.
// Anything else that fetches from another host (an API, an image CDN) must be added here.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    VitePWA({
      // New versions wait for the page to apply them (src/lib/updates.ts) instead of reloading it.
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'waypoints — trip companion',
        short_name: 'waypoints',
        description: 'Your trips in one place: bookings, a day-by-day plan, places to see and shared expenses.',
        theme_color: '#1d5e86',
        background_color: '#f4f6f8',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
    {
      // Build only: the dev server injects inline scripts for hot reload, which the policy would block.
      name: 'waypoints-csp',
      apply: 'build',
      transformIndexHtml: () => [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' },
      ],
    },
  ],
  test: {
    environment: 'node',
  },
})
