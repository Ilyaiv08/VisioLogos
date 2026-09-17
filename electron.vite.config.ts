import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          // Окно оператора
          index: resolve('src/renderer/index.html'),
          // Окно вывода (зал / сцена / трансляция)
          output: resolve('src/renderer/output.html'),
          // Невидимое окно слуха: разбор пения
          voice: resolve('src/renderer/voice.html')
        }
      }
    },
    plugins: [react()]
  }
})
