/**
 * v1.2.434 — «Прятальщик плашек ОБНОВИТЕ БРАУЗЕР» с предохранителями.
 *
 * ЗАЧЕМ ВЫНЕСЕН СЮДА (а не оставлен в webviewSetup.js):
 *  1) webviewSetup.js стоял на 604/605 строках — места не было, а правило проекта
 *     запрещает резать комментарии: логически обособленный блок выносим в модуль;
 *  2) shared/ — вне renderer-бюджета src/ (как shared/notifAlbum.js, v1.2.95);
 *  3) решение «прятать / не прятать» стало ЧИСТОЙ функцией → покрывается юнит-тестом
 *     без запуска приложения (раньше это был текст внутри строки — тестировать нечем).
 *
 * ── ЧТО ЭТО ЗА КОД ────────────────────────────────────────────────────────────
 * Мы впрыскиваем в страницу каждого мессенджера маленького сторожа, который прячет
 * плашки «Ваш браузер устарел» (мессенджеры их показывают, потому что видят Electron).
 * Плашки, известные по имени класса, гасит CSS (insertCSS в webviewSetup.js).
 * Этот файл — про ВТОРОЙ путь: поиск плашки ПО ТЕКСТУ, когда класс неизвестен.
 *
 * ── 🔴 ЧЕМ ЭТО БЫЛО ОПАСНО ДО v1.2.434 ────────────────────────────────────────
 * Условие было: «в тексте элемента есть слова "обновите"+"браузер" (или англ.
 * "update"+"browser") И у элемента меньше 20 прямых детей → display:none».
 * Три ловушки разом:
 *  • MDN Node.textContent отдаёт текст ВСЕХ вложенных узлов → у самой верхней
 *    «коробки» приложения это текст ВСЕЙ переписки. Достаточно одного слова
 *    где угодно внутри — и под условие попадает корень приложения;
 *  • «меньше 20 прямых детей» у корня SPA выполняется всегда (детей 2-6);
 *  • сторож перезапускается на КАЖДОЕ изменение DOM, вечно → даже если раскладку
 *    поправить (1px-пинок, Ловушка 64), элемент прячется заново.
 * Итог: приложение целиком уходило в display:none. Симптом — «чёрный экран»:
 * DOM полон (1,26 МБ), текст читается нашими сканерами, но НИЧЕГО не нарисовано,
 * а контейнер чата отдаёт размер 0,0,0x0 (MDN: у неотрисованного элемента
 * getBoundingClientRect = нули). Именно так выглядел веб-МАКС.
 *
 * ── ПРЕДОХРАНИТЕЛИ (v1.2.434) ─────────────────────────────────────────────────
 * Прячем только то, что РЕАЛЬНО похоже на плашку:
 *  • короткий текст (≤ BANNER_MAX_TEXT) — у плашки одна фраза, у приложения километры;
 *  • мало детей (< BANNER_MAX_CHILDREN) — как было;
 *  • элемент ОТРИСОВАН (ненулевые размеры) — иначе не трогаем: нулевой размер
 *    означает «уже скрыт родителем», и наш инлайн display:none остался бы на нём
 *    навсегда, даже когда родитель снова покажется;
 *  • не выше BANNER_MAX_HEIGHT пикселей;
 *  • занимает не больше BANNER_MAX_AREA_RATIO площади окна — ЭТО и делает
 *    «спрятать всё приложение» структурно невозможным.
 * Плюс сторож ОТЧИТЫВАЕТСЯ в журнал: и когда спрятал, и когда отказался (с причиной).
 *
 * ── ⚠️ ПОЧЕМУ bannerVerdict НАПИСАНА В СТАРОМ СТИЛЕ ───────────────────────────
 * Её исходник встраивается в впрыскиваемый скрипт через Function.prototype.toString()
 * — так один и тот же код и тестируется, и работает внутри чужой страницы (нет
 * расхождения между тестом и реальностью). Из-за этого внутри НЕЛЬЗЯ:
 *  • ссылаться на что-либо вне тела функции (замыкания при toString теряются!) —
 *    поэтому числа-пороги стоят литералами внутри, а экспортируемые константы
 *    ниже — их зеркало для тестов и документации;
 *  • использовать стрелки / `?.` / шаблонные строки / деструктуризацию — сборщик
 *    может переписать их через свои вспомогательные функции, которых в чужой
 *    странице нет, и впрыск молча упадёт.
 */

/** Максимальная длина текста элемента, при которой он ещё может быть плашкой */
export const BANNER_MAX_TEXT = 300
/** Максимальная высота плашки в пикселях */
export const BANNER_MAX_HEIGHT = 200
/** Максимальная доля площади окна, которую может занимать плашка */
export const BANNER_MAX_AREA_RATIO = 0.35
/** Столько прямых детей и больше — это уже не плашка, а контейнер */
export const BANNER_MAX_CHILDREN = 20
/** Сколько отказов писать в журнал (чтобы не спамить) */
export const BANNER_LOG_LIMIT = 8

/**
 * Решение по одному элементу.
 * @param {Element} el — проверяемый элемент
 * @param {Window} win — окно страницы (нужны innerWidth/innerHeight)
 * @returns {string} '' — слов нет, элемент вообще не наш случай;
 *                   'ok' — это плашка, прятать;
 *                   'skip:<причина>' — слова есть, но прятать ОПАСНО.
 */
export function bannerVerdict(el, win) {
  if (!el) return ''
  var t = ''
  try { t = (el.textContent || '').toLowerCase() } catch (e) { return '' }
  var hit = t.indexOf('браузер устарел') >= 0 ||
    t.indexOf('browser is outdated') >= 0 ||
    (t.indexOf('обновите') >= 0 && t.indexOf('браузер') >= 0) ||
    (t.indexOf('update') >= 0 && t.indexOf('browser') >= 0)
  if (!hit) return ''
  // Длинный текст = это не плашка, а контейнер с перепиской внутри
  if (t.length > 300) return 'skip:текст-' + t.length
  var kids = 0
  try { kids = el.children ? el.children.length : 0 } catch (e2) { kids = 0 }
  if (kids >= 20) return 'skip:детей-' + kids
  var w = 0, h = 0
  try {
    if (typeof el.getBoundingClientRect === 'function') {
      var r = el.getBoundingClientRect()
      w = Math.round(r.width) || 0
      h = Math.round(r.height) || 0
    }
  } catch (e3) { w = 0; h = 0 }
  // Нули = элемент не отрисован (скрыт родителем или ещё не разложен) — не трогаем
  if (w <= 0 || h <= 0) return 'skip:не-отрисован'
  if (h > 200) return 'skip:высота-' + h
  var vw = (win && win.innerWidth) || 0
  var vh = (win && win.innerHeight) || 0
  if (vw > 0 && vh > 0 && (w * h) > (vw * vh * 0.35)) {
    return 'skip:площадь-' + w + 'x' + h + '-из-' + vw + 'x' + vh
  }
  return 'ok'
}

/**
 * Собирает скрипт для впрыска в страницу мессенджера (executeJavaScript).
 * Внутри — то же решение bannerVerdict (встроено через toString), плюс проходы
 * по времени, наблюдатель за изменениями DOM с тормозом и отчёт в журнал.
 *
 * Отчёт идёт через console.log('__CC_DIAG__banner …') — внутри чужой страницы
 * нашего window.api нет, поэтому консоль-мост (consoleMessageParser) —
 * единственный канал доставки строк в chatcenter.log. Так же сделаны все хуки.
 * @returns {string}
 */
export function buildBannerHiderScript() {
  return `
    (function ccBannerHider() {
      var VERDICT = ${bannerVerdict.toString()};
      var refusals = 0, seen = {};
      function say(m) { try { console.log('__CC_DIAG__banner ' + m) } catch (e) {} }
      function pass() {
        var list;
        try { list = document.querySelectorAll('div, span, section, aside, footer, [role="banner"], [role="alert"]') }
        catch (e) { return }
        for (var i = 0; i < list.length; i++) {
          var el = list[i];
          // Уже спрятанное второй раз не разбираем (и не спамим в журнал)
          try { if (el.getAttribute && el.getAttribute('data-cc-banner')) continue } catch (e1) {}
          var v = '';
          try { v = VERDICT(el, window) } catch (e2) { v = '' }
          if (!v) continue;
          if (v === 'ok') {
            try { el.setAttribute('data-cc-banner', '1') } catch (e3) {}
            try { el.style.display = 'none' } catch (e4) {}
            var cls = '';
            try { cls = String(el.className || '').slice(0, 20) } catch (e5) {}
            say('спрятал ' + el.tagName + ' ' + cls);
          } else if (refusals <= ${BANNER_LOG_LIMIT}) {
            // ВАЖНО: отказ НЕ запоминаем на элементе — плашка может уменьшиться
            // и стать настоящей плашкой позже. Но в журнал пишем по разу на ВИД причины.
            //
            // v1.2.435 (по ревью): ключ повторов СТРОИМ БЕЗ ЦИФР. Иначе 'skip:текст-33546' и
            // 'skip:текст-32771' — разные ключи, и бюджет записей уходит на одну и ту же
            // причину (в журнале 2026-09-09 так и вышло: 8 строк, все skip:текст-*, а более
            // опасная skip:площадь-… уже не попала бы). Цифры остаются в тексте записи.
            var k = el.tagName + '|' + v.replace(/[0-9]+/g, '');
            if (!seen[k]) {
              seen[k] = 1; refusals++;
              if (refusals > ${BANNER_LOG_LIMIT}) say('отказов больше не пишу (предел ${BANNER_LOG_LIMIT} видов)');
              else say('НЕ прячу ' + el.tagName + ' ' + v);
            }
          }
        }
      }
      var timer = 0;
      function passSoon() {
        if (timer) return;
        timer = setTimeout(function () { timer = 0; pass() }, 500);
      }
      pass();
      setTimeout(pass, 2000);
      setTimeout(pass, 5000);
      setTimeout(pass, 10000);
      try {
        new MutationObserver(passSoon).observe(document.body || document.documentElement, { childList: true, subtree: true });
      } catch (e) {}
    })()
  `
}
