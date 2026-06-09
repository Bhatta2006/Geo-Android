import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'GeoShred Web',
        short_name: 'GeoShred',
        theme_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'landscape',
      }
    })
  ],
  worker: {
    format: 'es',         // AudioWorklet needs ES module format
  },
})

