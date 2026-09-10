/**
 * v1.2.447 — доводки чужой страницы после её готовности (dom-ready).
 *
 * ЗАЧЕМ ВЫНЕСЕН СЮДА (а не оставлен в webviewSetup.js):
 *  1) `src/utils/webviewSetup.js` стоял на 597/605 строках — почти заперт: даже две
 *     строки нельзя было добавить, и из-за этого в v1.2.445 переподключение пришлось
 *     вешать в обход (прямо на элемент страницы). Правило проекта запрещает резать
 *     комментарии — логически обособленный блок выносим в модуль;
 *  2) `shared/` — вне бюджета строк интерфейса (прецеденты: `shared/vkExecFallback.js`,
 *     `shared/browserBannerHider.js`, `shared/notifAlbum.js`);
 *  3) блок ничем не связан с остальным содержимым `webviewSetup.js` — ему нужны только
 *     сам элемент страницы и её имя, поэтому перенос безопасен.
 *
 * ── ЧТО ДЕЛАЕТ ────────────────────────────────────────────────────────────────
 * Мессенджеры видят Electron и показывают плашку «ваш браузер устарел». Прячем её
 * двумя путями: известные по имени класса — через CSS; найденные по тексту — через
 * сторожа из `shared/browserBannerHider.js` (у него предохранители по размеру, см. ADR-042).
 * Плюс запасной путь впрыска перехватчика уведомлений: если наш скрипт не сработал
 * из preload (страница запретила), просим главный процесс дать его текст и выполняем сами.
 *
 * ── ПОЧЕМУ ФАБРИКА, А НЕ ПРОСТАЯ ФУНКЦИЯ ─────────────────────────────────────
 * Модуль лежит в `shared/`, а `detectMessengerType` живёт в `src/utils/` — тянуть
 * оттуда снизу вверх нельзя. Поэтому нужное передаётся снаружи, как это уже сделано
 * у `createVkExecFallbackRuntime` (тот же приём в этом же проекте).
 */
import { buildBannerHiderScript } from './browserBannerHider.js'

/** CSS-часть: плашки, известные по имени класса, гасим сразу и без разбора текста. */
export const BANNER_CSS = `
  .BrowserUpdateLayer, .browser_update, .BrowserUpdate,
  [class*="BrowserUpdate"], [class*="browser_update"],
  [class*="browserUpdate"], [class*="unsupported-browser"],
  .UnsupportedBrowser, .stl__banner,
  .Popup--browserUpdate, .vkuiBanner--browser-update,
  .TopBrowserUpdateLayer, .BrowserUpdateOffer,
  [class*="browser-update"], [class*="BrowserOffer"] {
    display: none !important;
  }
`

/** Через сколько пробовать запасной впрыск перехватчика (мс). Даём странице ожить. */
export const HOOK_FALLBACK_DELAY_MS = 1500

/**
 * @param {object} deps
 * @param {(url: string) => string|null} deps.detectMessengerType — «что это за мессенджер по адресу»
 * @param {(level: string, message: string) => void} deps.log — запись в журнал приложения
 * @param {(channel: string, payload: any) => Promise<any>} [deps.invoke] — запрос к главному процессу
 * @returns {{ applyPageFixups: (el: any, messengerId: string) => void }}
 */
export function createPageFixups({ detectMessengerType, log, invoke } = {}) {
  const say = (level, message) => { try { log?.(level, message) } catch (_) {} }
  const ask = (channel, payload) => {
    try { return Promise.resolve(invoke?.(channel, payload)) } catch (_) { return Promise.resolve(null) }
  }

  // Запасной путь впрыска перехватчика уведомлений (основной — из preload).
  const injectHookFallback = (el, messengerId) => {
    let hookType = null
    try { hookType = detectMessengerType?.(el.getURL?.() || '') } catch (_) {}
    ask('app:read-hook', hookType || 'telegram').then((hookCode) => {
      if (!hookCode) return
      // ВАЖНО: путь отказа не глотаем — по доке Electron у executeJavaScript он есть,
      // а молчание здесь читалось бы как «перехватчик работает», хотя он не запустился.
      el.executeJavaScript(hookCode).then(() => {
        say('INFO', `[NotifHook] запасной впрыск применён (${messengerId}, тип=${hookType || 'telegram'})`)
      }).catch((err) => {
        say('WARN', `[NotifHook] запасной впрыск НЕ прошёл (${messengerId}): ${(err && err.message) || err}`)
      })
    }).catch(() => {})
  }

  const applyPageFixups = (el, messengerId) => {
    if (!el) return
    try {
      try { el.insertCSS?.(BANNER_CSS) } catch (_) {}
      // Поиск плашки ПО ТЕКСТУ — только через сторожа с предохранителями (ADR-042):
      // прежнее широкое условие могло спрятать приложение целиком (чёрный экран веб-МАКС).
      el.executeJavaScript(buildBannerHiderScript()).catch((err) => {
        say('WARN', `[banner-hider] впрыск НЕ прошёл для ${messengerId}: ${(err && err.message) || err}`)
      })
      setTimeout(() => injectHookFallback(el, messengerId), HOOK_FALLBACK_DELAY_MS)
    } catch (_) {}
  }

  return { applyPageFixups }
}
