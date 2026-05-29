// v0.95.16: smooth scroll с easing для jump-to-end после iterative fetch.
//
// Заменяет `el.scrollTo({behavior: 'instant'})` на анимированный скролл с easing.
// Эффект: быстрый разгон + плавное приземление (как в iOS / Telegram Desktop).
//
// Эталоны:
// - requestAnimationFrame — стандарт 60fps скролла (MDN, fsjs.dev best practice 2026)
// - easeOutCubic — стандартная easing для UX-scroll: «feels responsive (fast initially)
//   then settles smoothly» (research consensus 2026)
// - prefers-reduced-motion — accessibility fallback (W3C WCAG)
//
// API:
//   smoothScrollTo(el, targetTop, { duration?, easing?, onComplete? })
//   → возвращает функцию cancel() для прерывания
//
// Если duration=0 → instant fallback (для prefers-reduced-motion или больших дельт).

const DEFAULT_DURATION = 500
const VIEWPORT_THRESHOLD_INSTANT = 8  // >8 viewport → instant (нет смысла в анимации)

// easeOutCubic: «быстрый разгон + плавное приземление». Эталон для UX scroll.
// Source: https://easings.net/#easeOutCubic — стандарт CSS animations.
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

// easeOutQuint: «более выраженный эффект приземления» — для длинных дистанций.
export function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5)
}

export function prefersReducedMotion() {
  try {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return !!window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch (_) {
    return false
  }
}

export function smoothScrollTo(el, targetTop, options = {}) {
  if (!el) return () => {}
  const startTop = el.scrollTop
  const distance = targetTop - startTop
  const clientHeight = el.clientHeight || 600
  const absDistance = Math.abs(distance)

  // Edge case 1: уже у target → ничего не делать (но onComplete вызываем,
  // иначе caller потеряет «готово» — например markRead не сработает).
  if (absDistance < 1) {
    options.onComplete?.()
    return () => {}
  }

  // Edge case 2: prefers-reduced-motion → instant (accessibility)
  if (prefersReducedMotion()) {
    el.scrollTop = targetTop
    options.onComplete?.()
    return () => {}
  }

  // v0.95.18: ДВУХФАЗНЫЙ режим (option twoPhase: true). На больших дистанциях
  // (> 1 viewport) делаем мгновенный прыжок к (target - 1 viewport), потом
  // smoothScroll последний viewport. Юзер видит «приземление» ленты независимо
  // от того насколько далеко скроллили (100, 1000, 10000px — всегда видно
  // плавный последний экран). Эталон: Telegram Desktop, iOS jump-to-bottom.
  const twoPhase = !!options.twoPhase
  if (twoPhase && absDistance > clientHeight) {
    // Direction: вниз (distance>0) — prelude scrollTop = target - clientHeight.
    // Direction: вверх (distance<0) — prelude scrollTop = target + clientHeight.
    const preludeTarget = distance > 0
      ? targetTop - clientHeight
      : targetTop + clientHeight
    el.scrollTop = preludeTarget  // INSTANT — мгновенно к "почти target"
    // Далее запускаем smooth на оставшийся 1 viewport.
    // Рекурсивно вызываем без twoPhase + переопределяем duration на короткий.
    return smoothScrollTo(el, targetTop, {
      ...options,
      twoPhase: false,
      duration: Math.max(Number(options.duration) || DEFAULT_DURATION, 100),
    })
  }

  // Edge case 3: дистанция > 8 viewport БЕЗ twoPhase → instant (анимация
  // будет слишком долгой). twoPhase активирован выше — это не задействуется.
  if (absDistance > VIEWPORT_THRESHOLD_INSTANT * clientHeight) {
    el.scrollTop = targetTop
    options.onComplete?.()
    return () => {}
  }

  const duration = Math.max(Number(options.duration) || DEFAULT_DURATION, 100)
  const easing = options.easing || easeOutCubic
  let cancelled = false
  let rafId = null
  const startTime = performance.now()
  // Восстанавливаем startTop ПОСЛЕ возможного prelude из twoPhase ветки.
  const phaseStartTop = el.scrollTop
  const phaseDistance = targetTop - phaseStartTop

  function step(now) {
    if (cancelled) return
    const elapsed = now - startTime
    const progress = Math.min(elapsed / duration, 1)
    const eased = easing(progress)
    el.scrollTop = phaseStartTop + phaseDistance * eased
    if (progress < 1) {
      rafId = requestAnimationFrame(step)
    } else {
      el.scrollTop = targetTop  // финальный snap к точному значению
      options.onComplete?.()
    }
  }
  rafId = requestAnimationFrame(step)

  return function cancel() {
    cancelled = true
    if (rafId !== null) cancelAnimationFrame(rafId)
  }
}
