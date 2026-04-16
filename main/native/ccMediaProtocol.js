// v0.87.21: Custom protocol cc-media:// для локальных медиа (обход Chromium mixed-content).
// Регистрация: registerCcMediaScheme() вызывать ДО app.whenReady.
// Handler: registerCcMediaHandler(userData) вызывать ВНУТРИ app.whenReady.
import { protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export function registerCcMediaScheme() {
  try {
    protocol.registerSchemesAsPrivileged([
      { scheme: 'cc-media', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false } }
    ])
  } catch (_) {}
}

export function registerCcMediaHandler(userData) {
  try {
    protocol.handle('cc-media', async (req) => {
      try {
        const u = new URL(req.url)
        const kind = u.hostname
        const filename = decodeURIComponent(u.pathname.slice(1))
        const dir = kind === 'avatars' ? path.join(userData, 'tg-avatars')
                  : kind === 'media' ? path.join(userData, 'tg-media') : null
        if (!dir) return new Response('not-found', { status: 404 })
        const filePath = path.join(dir, filename)
        if (!fs.existsSync(filePath)) return new Response('not-found', { status: 404 })
        const data = fs.readFileSync(filePath)
        return new Response(data, { headers: { 'Content-Type': 'image/jpeg' } })
      } catch (e) {
        console.error('[cc-media] error:', e.message)
        return new Response('error', { status: 500 })
      }
    })
    console.log('[cc-media] protocol registered')
  } catch (e) { console.error('[cc-media] register failed:', e.message) }
}
