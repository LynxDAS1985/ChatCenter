// v1.2.222: пузырь-подсказка «↓ N новых» для ленты уведомлений.
//
// НЕЗАВИСИМЫЙ модуль: НЕ трогает хрупкий notification.js (он на пределе 728/730, а это область
// «саги» уведомлений). Подключается ПОСЛЕ notification.js в notification.html отдельным <script>.
// Логика: если пришла новая карточка, а пользователь прокрутил список ВВЕРХ (читает старые) —
// показываем пузырь со счётчиком новых; клик по пузырю или прокрутка вниз — прыжок к свежим и сброс.
// «У низа списка» — тот же критерий, что в notification-helpers.shouldAutoScroll (порог 90px, MDN:
// scrollHeight − scrollTop − clientHeight ≈ 0). Так пузырь и авто-скролл ведут себя согласованно:
// юзер у низа → notification.js сам доскроллит, пузырь НЕ нужен; юзер вверху → список не дёргаем,
// пузырь показывает, сколько пришло.

// Чистая функция (тестируется отдельно): сколько «новых» показать после добавления карточек.
function ccNewPillNextCount(prev, added, nearBottom) {
  if (nearBottom) return 0
  return (Number(prev) || 0) + (Number(added) || 0)
}
try { window.__ccNewPill = { nextCount: ccNewPillNextCount } } catch (_) {}

(function () {
  try {
    const container = document.getElementById('container')
    if (!container || typeof MutationObserver === 'undefined') return
    const NEAR = 90
    let count = 0

    const pill = document.createElement('div')
    pill.className = 'new-pill'
    pill.style.display = 'none'
    document.body.appendChild(pill)

    function nearBottom() {
      return (container.scrollHeight - container.scrollTop - container.clientHeight) <= NEAR
    }
    function word(n) { return (n % 10 === 1 && n % 100 !== 11) ? 'новое' : 'новых' }
    function render() {
      if (count > 0) { pill.textContent = '↓ ' + count + ' ' + word(count); pill.style.display = '' }
      else pill.style.display = 'none'
    }
    function jumpToLatest() {
      try { container.scrollTop = container.scrollHeight } catch (_) {}
      count = 0; render()
    }
    pill.addEventListener('click', jumpToLatest)

    // Прокрутил вниз сам → свежие увидены, сбрасываем счётчик.
    container.addEventListener('scroll', () => {
      if (count !== 0 && nearBottom()) { count = 0; render() }
    })

    // Новая карточка добавилась в список (прямой ребёнок #container).
    new MutationObserver((muts) => {
      let added = 0
      for (const m of muts) added += (m.addedNodes ? m.addedNodes.length : 0)
      if (!added) return
      // Ждём кадр: notification.js мог САМ прокрутить вниз (юзер был у низа) — тогда пузырь не нужен.
      requestAnimationFrame(() => {
        count = ccNewPillNextCount(count, added, nearBottom())
        render()
      })
    }).observe(container, { childList: true })
  } catch (_) {}
})()
