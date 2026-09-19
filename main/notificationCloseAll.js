// main/notificationCloseAll.js — v1.2.490: кнопка «✕ Закрыть все (N)» над стопкой уведомлений.
//
// ЗАЧЕМ: при настройке «не закрывать уведомления сами» карточки копятся, а закрывать их можно было
// только по одной крестиком (дело .memory-bank/notif-window-input-loss-case.md, смежный пункт).
//
// НЕЗАВИСИМЫЙ модуль — по образцу notificationNewPill.js: НЕ трогает хрупкий notification.js
// (тот 719/730 строк). Подключается ПОСЛЕ него в notification.html отдельным <script>; ОБЯЗАН быть в
// списке копирования сборки electron.vite.config.js.
//
// КАК УСТРОЕНО:
//   • кнопка живёт ВНЕ #container (в body) — дети контейнера считаются карточками (calcHeight,
//     снимок DOM, сверка items↔containerChildren), чужой элемент там сломал бы эти инварианты;
//   • при ≥2 карточках контейнер получает класс has-toolbar (padding-top 32 = 4 обычных + 28 под
//     полосу), а кнопка стоит fixed в освободившейся полосе — иначе накрыла бы крестик первой
//     карточки (он в правом верхнем углу карточки). Те же 28 точек добавляет calcHeight
//     (notification-helpers.js, CLOSE_ALL_BAR_PX) — иначе окно было бы ниже содержимого на 28;
//   • нажатие = нажать крестик КАЖДОЙ карточки (`.close-btn.click()`): идём тем же путём, что и
//     человек — со всеми записями в журнал (close-click, dismiss start …) и той же анимацией.
//     Ничего нового про закрытие не изобретаем;
//   • пересчёт — в самом MutationObserver (микрозадача сразу после вставки карточки), БЕЗ
//     requestAnimationFrame: отчёт высоты окну уходит через 60 мс после добавления, и класс
//     has-toolbar должен стоять раньше него, иначе окно на один отчёт окажется ниже на 28 точек.

/** Чистое правило (тестируется): показывать ли кнопку при таком числе карточек. */
function ccCloseAllVisible(childCount) { return (Number(childCount) || 0) >= 2 }
try { window.__ccCloseAll = { visibleFor: ccCloseAllVisible } } catch (_) {}

(function () {
  try {
    const container = document.getElementById('container')
    if (!container || typeof MutationObserver === 'undefined') return
    const log = (lvl, msg) => { try { window.notifApi && window.notifApi.log(lvl, 'close-all: ' + msg) } catch (_) {} }

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'close-all-btn'
    btn.title = 'Закрыть все уведомления'
    btn.style.display = 'none'
    document.body.appendChild(btn)

    let shown = false
    function render() {
      const n = container.children.length
      const vis = ccCloseAllVisible(n)
      container.classList.toggle('has-toolbar', vis)
      if (vis) { btn.textContent = '✕ Закрыть все (' + n + ')'; btn.style.display = '' }
      else btn.style.display = 'none'
      // Лог только на переходе видимости — не на каждое изменение списка.
      if (vis !== shown) { shown = vis; log('INFO', vis ? ('shown count=' + n) : 'hidden') }
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const closers = container.querySelectorAll('.notif-item .close-btn')
      log('INFO', 'click: закрываю ' + closers.length + ' карточек через их крестики')
      closers.forEach((b) => { try { b.click() } catch (_) {} })
    })

    new MutationObserver(render).observe(container, { childList: true })
    render()
    log('INFO', 'ready')
  } catch (e) {
    try { window.notifApi && window.notifApi.log('WARN', 'close-all init failed: ' + (e && e.message ? e.message : e)) } catch (_) {}
  }
})()
