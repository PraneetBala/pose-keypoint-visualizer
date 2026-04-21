import { defineConfig } from 'vite'

export default defineConfig({
  base: '/pose-keypoint-visualizer/',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/convert': 'http://localhost:8000',
    },
  },
})