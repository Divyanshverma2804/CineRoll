import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Assets will be served from /portal_assets/ which maps to portal/dist/assets/
    assetsDir: 'assets',
  },
  // Ensure asset URLs use /portal_assets prefix in production
  base: '/',
})
