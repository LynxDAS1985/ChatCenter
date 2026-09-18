/**
 * v1.2.483 — РАЗОВЫЙ ОСМОТР СТРОКИ СПИСКА ЧАТОВ ВК: есть ли в ней картинка вложения.
 *
 * ── ЗАЧЕМ ─────────────────────────────────────────────────────────────────────
 * Жалоба 2026-09-18: «фото не грузится в уведомлении». Журнал ответил честно —
 * `VK: снята пометка вложения "Фотография" (фото) ссылка-на-фото=НЕТ` (14:14:30 и 17:45:34),
 * то есть перехватчик искал картинку и не нашёл. Но он ищет ТОЛЬКО внутри блока превью
 * (иначе легко схватить аватарку собеседника и показать её вместо фото). Поэтому из журнала
 * НЕ видно, что правда:
 *   (а) ВК вообще не кладёт картинку в список чатов — брать нечего;
 *   (б) картинка есть, но лежит вне блока превью;
 *   (в) картинка нарисована фоном (background-image), а не тегом картинки;
 *   (г) картинка есть, но в момент осмотра ещё не догрузилась (нулевой размер).
 * Все четыре чинятся по-разному, поэтому гадать нельзя — нужен ОДИН взгляд на живую строку.
 *
 * ── ПОЧЕМУ ЭТОТ СПОСОБ ДОСТАВКИ ──────────────────────────────────────────────
 * 2026-09-18 попытка осмотреть строку, ДОПИСАВ файл к перехватчику, молча не сработала:
 * перехватчик жил, а дописанное не выполнилось (причина не найдена, ADR-067). Здесь другой,
 * ДОКАЗАННО рабочий путь — запуск кода в странице из интерфейса (`executeJavaScript`):
 * им в том же журнале печатаются строки `probe[...]` (67 записей), в том числе со страницы ВК
 * в 17:00:43 текущей сессии.
 *
 * ── ПОЧЕМУ НЕ ПЕРЕИСПОЛЬЗОВАЛ БОЛЬШОЙ ОСМОТР `runVkFullProbe` ────────────────
 * Он есть в `src/utils/webviewDiagnostics.js`, но: (1) включается только для `vk.com`, а у
 * пользователя `vk.ru` и мессенджер пользовательский → за всю историю журнала 0 его записей;
 * (2) его выгрузка содержит до 30 сообщений с разметкой по 12 000 знаков каждое — включать
 * такое на каждую навигацию значит залить журнал. Здесь — компактный отчёт (~1 КБ).
 *
 * ── ЧТО ДЕЛАЕТ И ЧЕГО НЕ ДЕЛАЕТ ───────────────────────────────────────────────
 * Только ЧИТАЕТ разметку и пишет в журнал. Ничего не меняет, ничего не кликает. Работает не
 * больше VK_ROW_PROBE_MAX_RUNS раз за жизнь страницы. Метка `VK-DIAG` обязательна: журнал
 * режет строки на 60 знаках, а строки с этой меткой пишет целиком (правило в webviewSetup.js).
 *
 * ── УДАЛИТЬ ПОСЛЕ РАЗБОРА ────────────────────────────────────────────────────
 * Это временный осмотр под один вопрос. После ответа — удалить файл и его вызов (TODO-53).
 */

/** Сколько раз за жизнь страницы разрешён осмотр (защита от спама в журнале). */
export const VK_ROW_PROBE_MAX_RUNS = 3

/** Пауза перед осмотром: список чатов ВК появляется не сразу после загрузки страницы. */
export const VK_ROW_PROBE_DELAY_MS = 4000

/** Это страница ВКонтакте? Оба домена: ВК переехал vk.com → vk.ru (v1.2.109). */
export function isVkPageUrl(url) {
  try { return /(^|\.)vk\.(ru|com)$/i.test(new URL(String(url || '')).hostname) } catch (_) { return false }
}

/**
 * Скрипт осмотра. Одна строка = один короткий отчёт, чтобы ничего не потерялось в журнале.
 * Выбирает строки, в которых ВК написал про вложение («Фотография» и т.п.), иначе — первую
 * непрочитанную, иначе — первую попавшуюся, и рассказывает про КАЖДУЮ картинку в строке:
 * реальный размер файла, размер на экране, лежит ли она внутри блока превью, кусок адреса.
 */
export const VK_ROW_PROBE_SCRIPT = `(function(){try{
  if (window.__ccVkRowProbeRuns >= ${VK_ROW_PROBE_MAX_RUNS}) return 'limit';
  window.__ccVkRowProbeRuns = (window.__ccVkRowProbeRuns || 0) + 1;
  var P = function(t){ try { console.log('__CC_DIAG__VK-DIAG ' + String(t).slice(0, 1200)) } catch(e) {} };
  var cut = function(v, n){ return String(v || '').replace(/\\s+/g, ' ').trim().slice(0, n || 40) };
  var rows = document.querySelectorAll('[class*="ConvoListItem" i]');
  if (!rows.length) { P('row: строк списка чатов НЕ найдено (селектор ConvoListItem)'); return 'no-rows' }
  var wanted = [], first = null;
  for (var i = 0; i < rows.length && i < 200; i++) {
    var tx = cut(rows[i].textContent, 120);
    if (!first && tx) first = rows[i];
    if (/фотографи|изображени|видеозапис/i.test(tx) && wanted.length < 2) wanted.push(rows[i]);
  }
  if (!wanted.length && first) wanted.push(first);
  P('row: всего строк=' + rows.length + ' с пометкой вложения=' + wanted.length);
  for (var k = 0; k < wanted.length; k++) {
    var row = wanted[k], tag = 'row' + (k + 1);
    var pv = row.querySelector('[class*="PostPreview" i], [class*="preview" i], [class*="snippet" i]');
    P(tag + ' текст="' + cut(row.textContent, 60) + '" блок-превью=' + (pv ? ('ЕСТЬ ' + cut(pv.className, 30)) : 'НЕТ'));
    var imgs = row.querySelectorAll('img'), parts = [];
    for (var j = 0; j < imgs.length && j < 6; j++) {
      var im = imgs[j], box = im.getBoundingClientRect();
      var src = String(im.currentSrc || im.src || '');
      parts.push('[' + j + '] файл=' + (im.naturalWidth || 0) + 'x' + (im.naturalHeight || 0)
        + ' экран=' + Math.round(box.width) + 'x' + Math.round(box.height)
        + ' в-превью=' + (pv && pv.contains(im) ? 'да' : 'нет')
        + ' alt="' + cut(im.getAttribute('alt'), 12) + '"'
        + ' адрес=' + (src.indexOf('data:') === 0 ? 'data(' + src.length + ')' : src.slice(-38)));
    }
    P(tag + ' картинок=' + imgs.length + (parts.length ? ' | ' + parts.join(' | ') : ' (ни одной)'));
    var bgs = [], nodes = row.querySelectorAll('*');
    for (var b = 0; b < nodes.length && b < 300 && bgs.length < 3; b++) {
      var bg = '';
      try { bg = getComputedStyle(nodes[b]).backgroundImage || '' } catch(e) {}
      if (bg && bg !== 'none' && bg.indexOf('url(') >= 0) bgs.push(cut(nodes[b].className, 22) + '→' + bg.slice(-34));
    }
    P(tag + ' фон-картинки=' + bgs.length + (bgs.length ? ' | ' + bgs.join(' | ') : ' (ни одной)'));
    var att = [], all2 = row.querySelectorAll('[class*="attach" i], [class*="Attach" i]');
    for (var a = 0; a < all2.length && a < 4; a++) att.push(all2[a].tagName + '.' + cut(all2[a].className, 24) + '="' + cut(all2[a].textContent, 20) + '"');
    P(tag + ' блоки-вложения=' + all2.length + (att.length ? ' | ' + att.join(' | ') : ' (ни одного)'));
  }
  return 'ok';
}catch(e){ try { console.log('__CC_DIAG__VK-DIAG сбой осмотра: ' + (e && e.message)) } catch(_) {} return 'error' }})()`

/**
 * Запустить осмотр в странице ВК. Ошибки глушатся: осмотр никогда не должен ломать вкладку.
 *
 * @param {object} el — элемент вкладки мессенджера (webview)
 * @param {string} url — его адрес (осмотр только для ВК)
 * @param {function} [log] — куда написать, что осмотр запущен/не удался
 */
export function runVkRowProbe(el, url, log, delayMs = VK_ROW_PROBE_DELAY_MS) {
  if (!el || typeof el.executeJavaScript !== 'function' || !isVkPageUrl(url)) return false
  // Пауза: список чатов ВК рисуется не мгновенно. Если вкладку закроют раньше — запуск просто
  // не удастся, и мы это запишем; сломать вкладку осмотр не может (он только читает).
  setTimeout(() => {
    try {
      el.executeJavaScript(VK_ROW_PROBE_SCRIPT)
        .then((res) => { if (typeof log === 'function') log(`[vk-row-probe] осмотр строки списка ВК: ${res}`) })
        .catch((e) => { if (typeof log === 'function') log(`[vk-row-probe] осмотр не удался: ${(e && e.message) || e}`) })
    } catch (e) {
      if (typeof log === 'function') log(`[vk-row-probe] запуск осмотра отклонён: ${(e && e.message) || e}`)
    }
  }, delayMs)
  return true
}
