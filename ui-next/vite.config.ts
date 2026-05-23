import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Allow running in Docker where the API is reachable as `http://api:8000`.
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000'

  return {
    base: '/',
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/assets': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/outputs': {
          target: proxyTarget,
          changeOrigin: true,
        }
      }
    },
    build: {
      assetsDir: 'ui-assets',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined
            }

            if (
              id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/react-router-dom/') ||
              id.includes('/node_modules/zustand/') ||
              id.includes('/node_modules/axios/')
            ) {
              return 'react-vendor'
            }

            if (
              id.includes('/node_modules/@radix-ui/') ||
              id.includes('/node_modules/lucide-react/') ||
              id.includes('/node_modules/class-variance-authority/') ||
              id.includes('/node_modules/clsx/') ||
              id.includes('/node_modules/tailwind-merge/') ||
              id.includes('/node_modules/next-themes/') ||
              id.includes('/node_modules/tippy.js/') ||
              id.includes('/node_modules/@dnd-kit/')
            ) {
              return 'ui-vendor'
            }

            if (
              id.includes('/node_modules/@codemirror/language-data/')
            ) {
              return 'editor-languages'
            }

            if (
              id.includes('/node_modules/@uiw/react-codemirror/')
            ) {
              return 'editor-react'
            }

            if (
              id.includes('/node_modules/@codemirror/view/') ||
              id.includes('/node_modules/@codemirror/state/') ||
              id.includes('/node_modules/@codemirror/commands/')
            ) {
              return 'editor-core'
            }

            if (
              id.includes('/node_modules/unified/') ||
              id.includes('/node_modules/remark-') ||
              id.includes('/node_modules/rehype-') ||
              id.includes('/node_modules/unist-util-visit/')
            ) {
              return 'markdown-preview'
            }

            return undefined
          },
        },
      },
    }
  }
})
