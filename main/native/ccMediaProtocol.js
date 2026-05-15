// v0.87.21: Custom protocol cc-media:// для локальных медиа (обход Chromium mixed-content).
// v0.87.34: Поддержка HTTP Range запросов — нужно для <video> streaming (перемотка, буферизация).
// Без Range браузер качает ВСЁ видео одним куском перед запуском → длинная пауза.
// С Range <video> запрашивает куски по мере нужды → мгновенное воспроизведение.
// v0.89.8: РЕАЛЬНЫЙ manual Range handling вместо net.fetch('file://...').
// Причина: в текущей версии Electron net.fetch для file:// URL не пробрасывает
// Range header корректно → видео загружается полностью но <video> seek не работает
// (нет Accept-Ranges + Content-Range в response). Manual fs.createReadStream({start,end})
// + правильные 206 Partial Content headers решает проблему.
import { protocol } from 'electron'
import { Readable } from 'node:stream'
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
        // v0.89.15: УБРАН kind='tdlib'. tdlib-sessions/.../files/temp/ нестабилен —
        // TDLib чистит temp/ файлы и optimizeStorage удаляет даже completed.
        // Теперь медиа всегда копируется в tg-media/ через stabilizeForPlayback,
        // плеер читает только из НАШЕЙ папки. См. tdlibMedia.js шапка.
        const dir = kind === 'avatars' ? path.join(userData, 'tg-avatars')
                  : kind === 'media' ? path.join(userData, 'tg-media')
                  : kind === 'video' ? path.join(userData, 'tg-media')
                  : null
        if (!dir) {
          console.warn('[cc-media] unknown kind:', kind, 'url:', req.url)
          return new Response('not-found', { status: 404 })
        }
        const filePath = path.join(dir, filename)
        let stat
        try { stat = fs.statSync(filePath) }
        catch (e) {
          console.error('[cc-media] file not found:', filePath, 'err:', e.message)
          return new Response('not-found', { status: 404 })
        }
        if (!stat.isFile()) {
          console.warn('[cc-media] not a file:', filePath)
          return new Response('not-found', { status: 404 })
        }

        const total = stat.size
        const mime = mimeFor(filename)
        const range = req.headers.get('range') || req.headers.get('Range')
        // v0.89.10: диагностика — каждый request к видео логируется. После
        // определения причины (по логам пользователя) уберём чтобы не засорять.
        if (mime.startsWith('video/')) {
          console.log('[cc-media] video req:', { kind, total, range: range || 'NO-RANGE', mime, file: path.basename(filePath) })
        }

        // v0.89.8: manual Range parsing — `bytes=START-END` или `bytes=START-`.
        // <video> seeking шлёт Range: bytes=N-, мы возвращаем 206 Partial Content
        // с правильными Content-Range + Content-Length headers. Без этого
        // currentTime= не работает (зависает на буферизации).
        if (range) {
          const match = /bytes=(\d+)-(\d*)/.exec(String(range))
          if (match) {
            const start = Number(match[1])
            const end = match[2] && match[2].length
              ? Math.min(Number(match[2]), total - 1)
              : total - 1
            if (start >= total || end < start) {
              return new Response(null, {
                status: 416,
                headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' },
              })
            }
            const chunkSize = end - start + 1
            const stream = fs.createReadStream(filePath, { start, end })
            // v0.89.14: УБРАЛ Cache-Control: 'no-store'. Логи показали что
            // <video> делает 60+ seekings за 5 сек когда кеш запрещён —
            // плеер перезапрашивает Range на каждый seek, decoder не успевает
            // собрать поток → PIPELINE_ERROR_DECODE. Без no-store Chromium
            // кеширует Range ответы и seek работает локально.
            return new Response(Readable.toWeb(stream), {
              status: 206,
              headers: {
                'Content-Type': mime,
                'Content-Length': String(chunkSize),
                'Content-Range': `bytes ${start}-${end}/${total}`,
                'Accept-Ranges': 'bytes',
              },
            })
          }
        }

        // Нет Range — отдаём весь файл, но с Accept-Ranges чтобы <video> знал
        // что можно потом сидать
        const stream = fs.createReadStream(filePath)
        return new Response(Readable.toWeb(stream), {
          status: 200,
          headers: {
            'Content-Type': mime,
            'Content-Length': String(total),
            'Accept-Ranges': 'bytes',
          },
        })
      } catch (e) {
        console.error('[cc-media] error:', e.message)
        return new Response('error', { status: 500 })
      }
    })
    console.log('[cc-media] protocol registered (net.fetch)')
  } catch (e) { console.error('[cc-media] register failed:', e.message) }
}
