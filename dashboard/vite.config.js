import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    outDir: '../docs/devops',
    emptyOutDir: false, // Do not delete other portfolio files
    rollupOptions: {
      input: 'OpsDashboard.html',
    }
  },
  base: './'
})
