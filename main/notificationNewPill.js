// v1.2.222: пузырь-подсказка «↓ N новых» для ленты уведомлений.
// v1.2.227: число = сколько карточек СЕЙЧАС ниже видимой части списка (пересчёт по реальному
//   положению карточек), а НЕ накопление приходов. Прошлая версия щёлкала +1 на каждое новое
//   уведомление и не вычитала исчезнувшие (уведомления авто-гаснут) → счётчик дрейфовал (показывал
//   «5», когда на экране 1). Теперь при любом изменении списка/прокрутке пересчитываем по факту.
//
// НЕЗАВИСИМЫЙ модуль: НЕ трогает хрупкий notification.js. Подключается ПОСЛЕ него в
// notification.html отдельным <script>. Список новостей: новые карточки внизу (appendChild),
// поэтому «карточки ниже видимой области» = самые свежие непрочитанные.

// Чистая функция (тестируется): сколько карточек НИЖЕ видимой нижней кромки списка.
// tops — массив offsetTop карточек; карточка «ниже/непрочитана», если её верх ниже кромки.
function ccNewPillBelowCount(tops, scrollTop, clientHeight) {
  const edge = (Number(scrollTop) || 0) + (Number(clientHeight) || 0)
  let n = 0
  for (const t of (tops || [])) if ((Number(t) || 0) >= edge - 4) n++
  return n
}
try { window.__ccNewPill = { belowCount: ccNewPillBelowCount } } catch (_) {}

(function () {
  try {
    const container = document.getElementById('container')
    if (!container || typeof MutationObserver === 'undefined') return
    let count = 0
    let shown = false
    // v1.2.223: журнал окна уведомлений — чтобы по chatcenter.log было видно, как отработал пузырь.
    const log = (lvl, msg) => { try { window.notifApi && window.notifApi.log(lvl, 'new-pill: ' + msg) } catch (_) {} }

    const pill = document.createElement('div')
    pill.className = 'new-pill'
    pill.style.display = 'none'
    document.body.appendChild(pill)

    function word(n) { return (n % 10 === 1 && n % 100 !== 11) ? 'новое' : 'новых' }
    // Пересчёт по РЕАЛЬНОМУ положению карточек (не накопление). Вызывается на изменение списка и прокрутку.
    // offsetTop карточек надёжен, т.к. #container имеет position:relative (notification.css v1.2.227) —
    // иначе offsetTop мерился бы от body и счёт был бы неверным.
    function recount() {
      const tops = []
      for (const el of container.children) tops.push(el.offsetTop)
      count = ccNewPillBelowCount(tops, container.scrollTop, container.clientHeight)
      render()
    }
    function render() {
      const vis = count > 0
      if (vis) { pill.textContent = '↓ ' + count + ' ' + word(count); pill.style.display = '' }
      else pill.style.display = 'none'
      // Лог только на ПЕРЕХОДЕ видимости (не на каждый пересчёт) — чтобы не спамить при прокрутке.
      if (vis !== shown) { shown = vis; log('INFO', vis ? ('shown count=' + count) : 'hidden') }
    }
    function jumpToLatest() {
      try { container.scrollTop = container.scrollHeight } catch (_) {}
      log('INFO', 'jump→bottom'); recount()
    }
    pill.addEventListener('click', jumpToLatest)

    // Прокрутил список → пересчитать (у низа станет 0 → пузырь спрячется).
    container.addEventListener('scroll', recount)
    // Список изменился (карточка пришла ИЛИ исчезла) → на след. кадре пересчитать по факту.
    new MutationObserver(() => { requestAnimationFrame(recount) }).observe(container, { childList: true })
    log('INFO', 'ready')
  } catch (e) {
    // v1.2.223: не глотаем ошибку молча — если пузырь не настроился, пишем в журнал окна.
    try { window.notifApi && window.notifApi.log('WARN', 'new-pill init failed: ' + (e && e.message ? e.message : e)) } catch (_) {}
  }
})()
