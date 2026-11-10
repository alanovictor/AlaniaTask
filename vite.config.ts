import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages publica em /AlaniaTask/
export default defineConfig({
  base: '/AlaniaTask/',
  plugins: [react(), tailwindcss()],
})
