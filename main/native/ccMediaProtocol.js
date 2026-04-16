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
          supportFetchAPI: true, bypassCSP: false,
          stream: true,  // v0.87.34: позволяет <video>/<audio> делать Range requests
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

        const stats = fs.statSync(filePath)
        const fileSize = stats.size
        const contentType = mimeFor(filename)

        // v0.87.34: HTTP Range для streaming
        const rangeHeader = req.headers.get('range') || req.headers.get('Range')
        if (rangeHeader) {
          const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader)
          if (match) {
            const start = parseInt(match[1], 10)
            const end = match[2] ? parseInt(match[2], 10) : fileSize - 1
            const realEnd = Math.min(end, fileSize - 1)
            const chunkSize = realEnd - start + 1
            const stream = fs.createReadStream(filePath, { start, end: realEnd })
            // Конвертируем Node stream в Web Stream
            const webStream = new ReadableStream({
              start(controller) {
                stream.on('data', c => controller.enqueue(new Uint8Array(c)))
                stream.on('end', () => controller.close())
                stream.on('error', e => controller.error(e))
              },
              cancel() { stream.destroy() },
            })
            return new Response(webStream, {
              status: 206,
              headers: {
                'Content-Type': contentType,
                'Content-Length': String(chunkSize),
                'Content-Range': `bytes ${start}-${realEnd}/${fileSize}`,
                'Accept-Ranges': 'bytes',
              },
            })
          }
        }

        // Без Range — отдаём целиком, но разрешаем Range в будущем
        const data = fs.readFileSync(filePath)
        return new Response(data, {
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(fileSize),
            'Accept-Ranges': 'bytes',
          }
        })
      } catch (e) {
        console.error('[cc-media] error:', e.message)
        return new Response('error', { status: 500 })
      }
    })
    console.log('[cc-media] protocol registered with Range support')
  } catch (e) { console.error('[cc-media] register failed:', e.message) }
}
