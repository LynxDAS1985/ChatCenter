// Ozon-навигатор: по нажатию на уведомление открыть нужное место в кабинете продавца.
//
// v1.2.330: строки чатов Ozon — div.m9d-c4 (не a/li/role), generic-навигатор их не кликает.
// v1.2.499: раздел берём из метки уведомления, ищем по НАЧАЛУ названия, а не нашли — открываем сам
// раздел (раньше вопрос искался среди чатов, где его нет, и переход всегда давал «не найден»).
// Адреса разделов и разбор метки — в shared/ozonSections.js (общие данные, вне бюджета экранов).
import { OZON_SECTION_URL, ozonSectionOf, ozonNeedle } from '../../../shared/ozonSections.js'

export function buildOzonScript(senderName, chatTag) {
  const section = ozonSectionOf(chatTag)
  const needle = ozonNeedle(senderName)
  if (!needle && section === 'list') return null // нечего искать и некуда вести — решает общий навигатор
  return `(function() {
    try {
      var needle = ${JSON.stringify(needle)};
      var section = ${JSON.stringify(section)};
      var wantUrl = ${JSON.stringify(OZON_SECTION_URL[section])};
      var here = location.href.indexOf(wantUrl.replace('https://seller.ozon.ru', '')) !== -1;
      // 1. Мы уже в нужном разделе → ищем строку по началу названия и кликаем.
      if (here && needle) {
        var rows = document.querySelectorAll('[class*="m9d-c4"], tr, [role="row"], [class*="row"]');
        for (var i = 0; i < rows.length; i++) {
          var t = (rows[i].textContent || '').replace(/\\s+/g, ' ');
          if (t.indexOf(needle) !== -1) {
            (rows[i].querySelector('a, button') || rows[i]).click();
            return { ok: true, method: 'ozon-row', log: 'section=' + section };
          }
        }
      }
      // 2. Не нашли (или мы в другом разделе) → открываем раздел: человек увидит новое сверху.
      if (!here) { location.href = wantUrl; return { ok: true, method: 'ozon-section', log: 'открыт раздел ' + section }; }
      return { ok: true, method: 'ozon-section-here', log: 'раздел ' + section + ' уже открыт, строка не найдена' };
    } catch (e) { return { ok: false, method: 'ozon', log: e.message }; }
  })();`
}
