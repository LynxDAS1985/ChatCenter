// Навигация к чату в VK (vk.com / vk.ru).
//
// v1.2.216: переучено под новый vk.ru. Раньше искали строку чата по жёстким приметам старого
// vk.com (.im_dialog_peer, PeerName, .ConvoListItem__title) и сверяли имя «символ-в-символ».
// На vk.ru имя лежит в других классах (ConvoTitle__author / ChannelTitle__title внутри
// .ConvoListItem), поэтому чат не находился и клик по уведомлению писал «не найден в списке».
// Теперь: строки ищем гибко [class*="ConvoListItem" i], имя — сначала точно, затем по «содержит»
// (как рабочий детектор уведомлений main/preloads/hooks/vk.hook.js). Старый класс .im_dialog_peer
// оставлен как грубый запасной вариант, но ВК давно редиректит vk.com → vk.ru — основной путь vk.ru.
// Возвращаем { ok, method, log } — вызывающий это уже поддерживает.
export function buildVkScript(senderName) {
  const nameJson = JSON.stringify(senderName || '')
  return `(function() {
    try {
      var name = ${nameJson};
      if (!name) return { ok:false, method:'vk', log:'no-name' };
      var rows = document.querySelectorAll('[class*="ConvoListItem" i], .im_dialog_peer, [class*="im_dialog" i]');
      function nameOf(row){
        var el = row.querySelector('[class*="ConvoListItem__title" i], [class*="ConvoTitle" i], [class*="ChannelTitle" i], [class*="title" i], [class*="name" i], [class*="peer" i], b, strong');
        return el ? (el.textContent || '').trim() : '';
      }
      function clickRow(row){
        var target = row.closest('a, [class*="ConvoListItem" i], li, button, [role="listitem"]') || row;
        target.click();
      }
      // Проход 1 — ТОЧНОЕ совпадение (защищает от «Елена» vs «Елена Дугина»).
      for (var i = 0; i < rows.length; i++) {
        if (nameOf(rows[i]) === name) { clickRow(rows[i]); return { ok:true, method:'vk-exact', log:'rows=' + rows.length }; }
      }
      // Проход 2 — имя НАЧИНАЕТСЯ с искомого (рядом бывает время «12:34» / значок-статус).
      // startsWith, а НЕ «содержит»: не откроем чужой чат из-за случайного совпадения в СЕРЕДИНЕ
      // имени (уведомление всегда несёт полное имя, точный проход выше это уже покрывает).
      var low = name.toLowerCase();
      for (var k = 0; k < rows.length; k++) {
        var t = nameOf(rows[k]);
        if (t && t.toLowerCase().startsWith(low)) { clickRow(rows[k]); return { ok:true, method:'vk-starts', log:'rows=' + rows.length }; }
      }
      return { ok:false, method:'vk', log:'rows=' + rows.length + ' noMatch' };
    } catch(e) { return { ok:false, method:'vk', log:'err:' + (e && e.message) }; }
  })();`
}
