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
        // v1.2.12: + notification-helpers.js (createPinBtn вынесена при разбиении файла)
        { from: 'main/notification.css', to: 'out/main/notification.css' },
        { from: 'main/notification.js', to: 'out/main/notification.js' },
        { from: 'main/notification-helpers.js', to: 'out/main/notification-helpers.js' },
        // v1.2.479: альбом карточки вынесен из notification-helpers.js (тот упёрся в потолок 300 строк)
        { from: 'main/notification-album.js', to: 'out/main/notification-album.js' },
        // v1.2.489: предел «вечных» карточек по реальной высоте — свой файл (helpers стоял 291/300)
        { from: 'main/notification-limits.js', to: 'out/main/notification-limits.js' },
        // v1.2.222: пузырь «↓ N новых» — независимый модуль
        { from: 'main/notificationNewPill.js', to: 'out/main/notificationNewPill.js' },
        // v0.87.97: pin-dock.html разбит на html/css/js
        { from: 'main/pin-dock.css', to: 'out/main/pin-dock.css' },
        { from: 'main/pin-dock.js', to: 'out/main/pin-dock.js' },
        // v1.2.70: окно-подсказка задачи (Вариант 4)
        { from: 'main/pin-tooltip.html', to: 'out/main/pin-tooltip.html' },
      ]
      // Hooks directory (messenger hooks)
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
      // v1.2.0 Этап 4: AI hooks directory (ai-monitor.preload.cjs ищет тут)
      const aiHooksDir = 'main/preloads/hooks/ai'
      if (fs.existsSync(aiHooksDir)) {
        const outAiHooksDir = 'out/preloads/hooks/ai'
        fs.mkdirSync(outAiHooksDir, { recursive: true })
        for (const f of fs.readdirSync(aiHooksDir)) {
          // .hookTemplate.js не копируется — только реальные provider hooks
          if (f.endsWith('.hook.js') && !f.startsWith('.')) {
            copies.push({ from: `${aiHooksDir}/${f}`, to: `${outAiHooksDir}/${f}` })
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
          'pin-tooltip': resolve(__dirname, 'main/preloads/pin-tooltip.preload.cjs'),
          photoViewer: resolve(__dirname, 'main/preloads/photoViewer.preload.cjs'),
          videoPlayer: resolve(__dirname, 'main/preloads/videoPlayer.preload.cjs'),
          'log-viewer': resolve(__dirname, 'main/preloads/log-viewer.preload.cjs'),
          // v1.2.0 (Этап 4 AI Bridge): preload для AI веб-сайтов.
          'ai-monitor': resolve(__dirname, 'main/preloads/ai-monitor.preload.cjs'),
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
    // ─────────────────────────────────────────────────────────────────────────
    // v1.2.465 — ПРОГРЕВ ЧАСТО НУЖНЫХ ФАЙЛОВ (только режим разработки)
    //
    // ЖАЛОБА 2026-09-16: вместо приложения красный экран
    // «Failed to fetch dynamically imported module: …/src/native/NativeApp.jsx».
    // Разбор журнала: запросов 443, ВСЕ 410 завершившихся вернули 200 (ни одного отказа),
    // но самые медленные шли 80–82 секунды, и ленивая догрузка столько не ждала.
    // Отвечали ВОЛНАМИ с паузами до 116 секунд — сервер замирал и отпускал всех разом.
    //
    // 🥇 ФАКТ УРОВНЯ 1 (документация Vite, DOCS/Vite docs/guide/performance.md):
    //    «Связь между файлами становится известна только ПОСЛЕ обработки файла. Если один
    //    файл обрабатывается долго, следующий ждёт своей очереди, и так далее. Это создаёт
    //    внутренний водопад даже при встроенной предварительной обработке.»
    //    Лекарство там же — server.warmup: «готовит файлы заранее и кэширует результат;
    //    улучшает первую загрузку страницы и предотвращает водопад обработки».
    //
    // 🔴 СПИСОК УМЫШЛЕННО КОРОТКИЙ. Та же документация предупреждает: добавлять только
    // часто используемые файлы, иначе сервер перегрузится на старте. Здесь ровно те, что
    // в журнале жалобы либо упали, либо шли дольше всех: точка входа, главный экран, стили
    // и два ленивых куска (их догрузка и рвалась).
    //
    // 🟡 ЧЕСТНАЯ ОГОВОРКА: это лечит ОДНУ из трёх версий причины (водопад обработки).
    // Две другие — несколько приложений на один сервер и общая занятость машины при старте —
    // настройкой не лечатся. Подробный разбор: .memory-bank/reconnect-plan.md, раздел 4d.
    //
    // На сборку НЕ влияет: warmup работает только у сервера разработки.
    server: {
      warmup: {
        clientFiles: [
          './src/main.jsx',
          './src/App.jsx',
          './src/index.css',
          './src/native/NativeApp.jsx',
          './src/components/AISidebar.jsx',
        ],
      },
    },
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
