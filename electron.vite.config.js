import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
// Tailwind 3 — через postcss.config.js (не vite plugin)
import { resolve } from 'path'
import fs from 'fs'

// v0.84.0: Copy static files to out/ for production build
function copyStaticPlugin() {
  return {
    name: 'copy-static',
    closeBundle() {
      const copies = [
        // HTML files
        { from: 'main/notification.html', to: 'out/main/notification.html' },
        { from: 'main/pin-notification.html', to: 'out/main/pin-notification.html' },
        { from: 'main/pin-dock.html', to: 'out/main/pin-dock.html' },
        { from: 'main/log-viewer.html', to: 'out/main/log-viewer.html' },
        { from: 'main/photo-viewer.html', to: 'out/main/photo-viewer.html' },
        { from: 'main/video-player.html', to: 'out/main/video-player.html' },
        // v0.87.78: notification.html разбит на html/css/js — копируем все три
        { from: 'main/notification.css', to: 'out/main/notification.css' },
        { from: 'main/notification.js', to: 'out/main/notification.js' },
      ]
      // Hooks directory
      const hooksDir = 'main/preloads/hooks'
      if (fs.existsSync(hooksDir)) {
        const outHooksDir = 'out/preloads/hooks'
        fs.mkdirSync(outHooksDir, { recursive: true })
        for (const f of fs.readdirSync(hooksDir)) {
          if (f.endsWith('.hook.js')) {
            copies.push({ from: `${hooksDir}/${f}`, to: `${outHooksDir}/${f}` })
          }
        }
      }
      for (const { from, to } of copies) {
        if (fs.existsSync(from)) {
          fs.mkdirSync(resolve(to, '..'), { recursive: true })
          fs.copyFileSync(from, to)
        }
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyStaticPlugin()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'main/main.js')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'main/preloads/app.preload.cjs'),
          monitor: resolve(__dirname, 'main/preloads/monitor.preload.cjs'),
          notification: resolve(__dirname, 'main/preloads/notification.preload.cjs'),
          pin: resolve(__dirname, 'main/preloads/pin.preload.cjs'),
          'pin-dock': resolve(__dirname, 'main/preloads/pin-dock.preload.cjs'),
          photoViewer: resolve(__dirname, 'main/preloads/photoViewer.preload.cjs'),
          videoPlayer: resolve(__dirname, 'main/preloads/videoPlayer.preload.cjs'),
        },
        output: {
          // Production paths expect .js not .mjs
          entryFileNames: '[name].js',
        }
      }
    }
  },
  renderer: {
    plugins: [react()],
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        },
        external: [/src\/__tests__/]
      }
    }
  }
})
