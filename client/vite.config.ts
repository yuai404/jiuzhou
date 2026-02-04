import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // CDN 基础路径，默认为 '/'
  // 设置后静态资源会从 CDN 加载
  const cdnBase = env.VITE_CDN_BASE?.trim().replace(/\/+$/, '') || ''
  const base = cdnBase ? `${cdnBase}/` : '/'

  return {
    plugins: [react()],
    base,
    build: {
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          // 基于模块路径的智能分包策略
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Ant Design 全家桶（包括 dayjs，避免循环依赖）
              if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-')) {
                return 'antd-vendor'
              }
              // React 核心
              if (id.includes('react-dom') || id.includes('/react/')) {
                return 'react-vendor'
              }
              // 路由
              if (id.includes('react-router')) {
                return 'router'
              }
              // 游戏框架
              if (id.includes('boardgame.io')) {
                return 'boardgame'
              }
              // 网络相关
              if (id.includes('socket.io') || id.includes('axios')) {
                return 'network'
              }
            }
          },
        },
      },
    },
  }
})
