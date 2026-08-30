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
} catch {
  /* use default */
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 9100,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
  // vendor 分包（7D 性能）：将框架/组件库从入口 index chunk 拆出，
  // 提升并行加载与发版后的长效缓存命中率（业务代码变更不再 bust 框架缓存）。
  // vite8=rolldown：用 advancedChunks.groups（非 rollup 的 manualChunks）。
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              name: 'vendor-antd',
              test: /[\\/]node_modules[\\/](ant-design-vue|@ant-design[\\/])/,
            },
            {
              name: 'vendor-vue',
              test: /[\\/]node_modules[\\/](vue|vue-router|pinia|@vue[\\/]|@babel[\\/]runtime-core-helpers)/,
            },
          ],
        },
      },
    },
  },
})
