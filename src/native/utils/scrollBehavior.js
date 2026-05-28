// v0.95.6: behavior для programmatic scroll кнопки ↓ — Telegram-style.
//
// При большой дельте (юзер далеко от низа, например прокрутил вверх через 619
// непрочитанных) `behavior: 'smooth'` даёт 5-10 сек анимации с заметным замедлением
// браузера. Telegram Desktop / Web в таких случаях прыгает мгновенно.
//
// Порог 5 viewport'ов — компромисс: меньше — плавно (~< 4000px на типовом экране),
// больше — мгновенно. Подобран по UX-тесту: 4 экрана прокрутки smooth ≈ 1.5 сек,
// дальше анимация уже раздражает и нагружает Chromium.
//
// MDN: behavior: 'instant' — стандарт CSSOM Scroll, Baseline Widely Available с 2015.
// https://developer.mozilla.org/en-US/docs/Web/API/ScrollToOptions

const VIEWPORTS_THRESHOLD = 5

export function computeScrollBehavior(deltaPx, clientHeight) {
  if (!Number.isFinite(deltaPx) || !Number.isFinite(clientHeight) || clientHeight <= 0) {
    return 'smooth'
  }
  if (deltaPx <= 0) return 'smooth'
  return deltaPx > VIEWPORTS_THRESHOLD * clientHeight ? 'instant' : 'smooth'
}
