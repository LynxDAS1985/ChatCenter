// v0.87.21: Custom protocol cc-media:// для локальных медиа (обход Chromium mixed-content).
// v0.87.34: Поддержка HTTP Range запросов — нужно для <video> streaming (перемотка, буферизация).
// Без Range браузер качает ВСЁ видео одним куском перед запуском → длинная пауза.
// С Range <video> запрашивает куски по мере нужды → мгновенное воспроизведение.
import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

export function registerCcMediaScheme() {
  try {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: 'cc-media',
        privileges: {
          standard: true, secure: true,
          supportFetchAPI: true,
          bypassCSP: true,   // v0.87.38: нужно для <video> в secondary BrowserWindow
          stream: true,       // v0.87.34: Range requests для video seeking
        }
      }
    ])
  } catch (_) {}
}

// Определяем MIME по расширению — чтобы <video> играл корректно
function mimeFor(filename) {
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.mp3') return 'audio/mpeg'
  if (ext === '.ogg') return 'audio/ogg'
  if (ext === '.wav') return 'audio/wav'
  if (ext === '.m4a' || ext === '.aac') return 'audio/aac'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  return 'image/jpeg'
}

export function registerCcMediaHandler(userData) {
  try {
    protocol.handle('cc-media', async (req) => {
      try {
        const u = new URL(req.url)
        const kind = u.hostname
        const filename = decodeURIComponent(u.pathname.slice(1))
        const dir = kind === 'avatars' ? path.join(userData, 'tg-avatars')
                  : kind === 'media' ? path.join(userData, 'tg-media')
                  : kind === 'video' ? path.join(userData, 'tg-media')
                  : null
        if (!dir) return new Response('not-found', { status: 404 })
        const filePath = path.join(dir, filename)
        if (!fs.existsSync(filePath)) return new Response('not-found', { status: 404 })

        // v0.87.38: РЕШЕНИЕ — net.fetch('file://...') вместо ручного fs.createReadStream.
        // net.fetch правильно обрабатывает Range requests для <video> seeking,
        // работает во ВСЕХ BrowserWindow'ах (не только в main session),
        // и не блокирует main thread.
        const fileUrl = pathToFileURL(filePath).href
        return net.fetch(fileUrl, {
          headers: req.headers,  // пробрасываем Range и другие заголовки
        })
      } catch (e) {
        console.error('[cc-media] error:', e.message)
        return new Response('error', { status: 500 })
      }
    })
    console.log('[cc-media] protocol registered (net.fetch)')
  } catch (e) { console.error('[cc-media] register failed:', e.message) }
}
