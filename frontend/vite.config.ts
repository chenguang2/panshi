import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Read backend port from start.sh's .port file, fallback to develop 默认值 12344
let backendPort = 12344
const portFile = path.resolve(__dirname, '../backend/.port')
try {
  backendPort = parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10) || 12344
} catch { /* use default */ }

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 9100,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true
      }
    }
  }
})
