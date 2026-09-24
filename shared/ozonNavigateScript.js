// shared/ozonNavigateScript.js — сборка скрипта перехода для страницы Ozon.
//
// ГДЕ ЛЕЖИТ И ПОЧЕМУ: это ТЕКСТ СКРИПТА для ЧУЖОЙ страницы (кабинет продавца Ozon), а не код наших
// экранов — по правилу проекта ADR-044 такому место в shared/, вне бюджета строк интерфейса. Так же
// живут shared/browserBannerHider.js и shared/webAvatarScript.js. В src/utils/navigators/ остался
// тонкий переходник, чтобы соседние навигаторы (telegram/max/vk/whatsapp) звались единообразно.
//
// Ozon-навигатор: по нажатию на уведомление открыть нужное место в кабинете продавца.
//
// v1.2.330: строки чатов Ozon — div.m9d-c4 (не a/li/role), generic-навигатор их не кликает.
// v1.2.499: раздел берётся из метки уведомления; не нашли строку — открываем сам раздел.
// v1.2.500 (по итогам ревью — четыре починки, каждая доказана прогоном):
//   • сравнение раздела ТОЧНОЕ по пути (иначе отзыв со страницы «Вопросы» никуда не вёл:
//     путь /app/reviews целиком входит в /app/reviews/questions);
//   • ищем по ПОЛНОМУ названию и собираем ВСЕ совпадения: ровно одно → клик, иначе не угадываем
//     (раньше кликалось первое попавшееся, и у товаров одной линейки открывался чужой);
//   • отбор строк сужен — `[class*="row"]` ловил обёртки (`rowsWrapper`) и слова `arrow`/`browser`;
//   • «ничего не нажали» отвечает ok:false — иначе экран писал «перешёл в чат», а повтор через
//     1.5 с (единственное спасение для медленно рисующегося списка) больше не запускался.
// Адреса разделов, пути и разбор метки — в shared/ozonSections.js (общие данные, без дублей).
import {
  OZON_SECTION_URL, OZON_SECTION_PATH, ozonSectionOf, ozonNeedle, ozonNeedleShort,
} from './ozonSections.js'

/**
 * @param {string} senderName — «отправитель» уведомления: у вопроса и отзыва это название товара
 * @param {string} chatTag — метка уведомления (`ozon-q:` / `ozon-rv:` / `ozon-list:`)
 * @param {{ markReadOnly?: boolean }} [opts] — v1.2.500: кнопке «Прочитано» смена адреса ЗАПРЕЩЕНА.
 *   Раньше обе кнопки звали один скрипт, и «Прочитано» уводило открытую вкладку в другой раздел —
 *   прямо из-под рук у человека, вместе с недописанным ответом.
 */
export function buildOzonScript(senderName, chatTag, opts) {
  const section = ozonSectionOf(chatTag)
  const full = ozonNeedle(senderName)
  if (!full) return null
  const markReadOnly = !!(opts && opts.markReadOnly)
  const leave = markReadOnly
    ? `return { ok: false, method: 'ozon-mark-read', log: 'мы в другом разделе — вкладку не увожу (только пометка)' };`
    : `location.href = ${JSON.stringify(OZON_SECTION_URL[section])}; return { ok: true, method: 'ozon-section', log: 'открыт раздел ' + section };`
  return `(function() {
    try {
      var full = ${JSON.stringify(full)};
      var short = ${JSON.stringify(ozonNeedleShort(senderName))};
      var section = ${JSON.stringify(section)};
      var here = (location.pathname || '').replace(/\\/+$/, '') === ${JSON.stringify(OZON_SECTION_PATH[section])};
      if (here) {
        var rows = document.querySelectorAll('[class*="m9d-c4"], tr, [role="row"], [role="listitem"]');
        var hits = [];
        for (var i = 0; i < rows.length; i++) {
          if ((rows[i].textContent || '').replace(/\\s+/g, ' ').indexOf(full) !== -1) hits.push(rows[i]);
        }
        if (!hits.length && short) { // запасной короткий поиск: вдруг на странице текст записан иначе
          for (var j = 0; j < rows.length; j++) {
            if ((rows[j].textContent || '').replace(/\\s+/g, ' ').indexOf(short) !== -1) hits.push(rows[j]);
          }
        }
        // обёртки отсеиваем СРАЗУ: если внутри подошедшего есть другой подошедший — это контейнер,
        // а не строка. Иначе одна и та же строка считалась бы дважды (сама и её обёртка).
        var inner = hits.filter(function (h) { return !hits.some(function (o) { return o !== h && h.contains(o) }) });
        if (inner.length === 1) {
          var row = inner[0];
          (row.querySelector('a, button') || row).click();
          return { ok: true, method: 'ozon-row', log: 'section=' + section + ' по «' + full.slice(0, 40) + '»' };
        }
        // ноль или несколько — не угадываем и честно говорим «нет», чтобы сработал повтор
        return { ok: false, method: 'ozon-row-miss',
          log: 'раздел ' + section + ' открыт, подошло строк: ' + inner.length + ' по «' + full.slice(0, 40) + '»' };
      }
      ${leave}
    } catch (e) { return { ok: false, method: 'ozon', log: e.message }; }
  })();`
}
