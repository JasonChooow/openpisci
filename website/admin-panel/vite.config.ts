import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    // 5274: the 9xBot desktop dev server already occupies 5174.
    port: 5274,
    proxy: {
      '/api': {
        target: 'http://localhost:8137',
        changeOrigin: true,
      },
    },
  },
})
