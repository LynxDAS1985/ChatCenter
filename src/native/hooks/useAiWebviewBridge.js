// v1.1.16 (Этап 7 AI Bridge): подключение webview AI к WebUI Bridge.
//
// Что делает:
//   1. После mount <webview> для AI сайта (chat.openai.com / chat.deepseek.com / claude.ai / giga.chat):
//      - получает путь к ai-monitor.preload через app:get-paths
//      - устанавливает атрибут preload на webview
//      - слушает did-attach → берёт webContentsId → IPC регистрирует webview в WebUI Bridge
//   2. При unmount или смене провайдера — отписка через IPC.
//
// Если providerId не определён (например юзер использует кастомный URL вне 4 известных хостов)
// — hook не активируется. WebUI Bridge не сможет инжектировать через preload.

import { useEffect } from 'react'
import { detectAiProvider } from '../../utils/aiWebviewConfigs.js'

function log(level, message) {
  try {
    window.api?.send?.('app:log', { level, message: '[ai-webview-bridge] ' + message })
  } catch (_) { /* nothing */ }
}

/**
 * Подключает webview к WebUI Bridge.
 *
 * @param {React.RefObject<HTMLWebViewElement|null>} webviewRef
 * @param {string} url — текущий URL webview
 * @param {string} providerMode — 'api' | 'webview' | 'local'
 */
export function useAiWebviewBridge(webviewRef, url, providerMode) {
  useEffect(() => {
    if (providerMode !== 'webview' || !url) return undefined
    const wv = webviewRef?.current
    if (!wv) return undefined

    const cfg = detectAiProvider(url)
    if (!cfg) {
      log('INFO', 'host не распознан, AI Bridge для этого URL не подключится: ' + url)
      return undefined
    }
    const providerId = cfg.id
    let registeredWebContentsId = null
    let cancelled = false

    // Получить путь к preload и установить
    async function setupPreload() {
      try {
        const paths = await window.api?.invoke?.('app:get-paths')
        if (cancelled || !paths?.aiMonitorPreload) {
          log('WARN', 'aiMonitorPreload путь не получен от main')
          return
        }
        // Устанавливаем preload как file:// URL чтобы Electron смог его найти
        // Webview принимает preload только в виде URL.
        try {
          const preloadUrl = paths.aiMonitorPreload.startsWith('file://')
            ? paths.aiMonitorPreload
            : 'file:///' + paths.aiMonitorPreload.replace(/\\/g, '/')
          wv.setAttribute('preload', preloadUrl)
          log('INFO', 'preload установлен для provider=' + providerId)
        } catch (e) {
          log('ERROR', 'не удалось установить preload: ' + (e?.message || e))
        }
      } catch (e) {
        log('ERROR', 'app:get-paths упал: ' + (e?.message || e))
      }
    }
    setupPreload()

    // Регистрация webContents после did-attach
    function onDidAttach() {
      try {
        const id = typeof wv.getWebContentsId === 'function' ? wv.getWebContentsId() : null
        if (!id) {
          log('WARN', 'getWebContentsId вернул null')
          return
        }
        registeredWebContentsId = id
        try {
          window.api?.invoke?.('ai-bridge:webui:register-webview', { providerId, webContentsId: id })
          log('INFO', 'webview зарегистрирован, provider=' + providerId + ' wcId=' + id)
        } catch (e) {
          log('ERROR', 'IPC register-webview упал: ' + (e?.message || e))
        }
      } catch (e) {
        log('ERROR', 'did-attach handler упал: ' + (e?.message || e))
      }
    }

    wv.addEventListener('did-attach', onDidAttach)

    return () => {
      cancelled = true
      try { wv.removeEventListener('did-attach', onDidAttach) } catch (_) {}
      if (registeredWebContentsId != null) {
        try {
          window.api?.invoke?.('ai-bridge:webui:unregister-webview', { providerId })
          log('INFO', 'webview отписан, provider=' + providerId)
        } catch (e) {
          log('ERROR', 'IPC unregister-webview упал: ' + (e?.message || e))
        }
      }
    }
  }, [webviewRef, url, providerMode])
}
