// Ozon-навигатор: по клику на уведомление открыть чат покупателя в списке.
// v1.2.330: строки чатов Ozon — div.m9d-c4 (не a/li/role), generic-навигатор их не кликает.
// Ищем строку, в тексте которой есть имя покупателя, и кликаем её (Ozon откроет чат).
// Вся Ozon-специфика — в своём файле (не смешиваем с другими мессенджерами).

export function buildOzonScript(senderName) {
  if (!senderName) return null
  const nameJson = JSON.stringify(senderName)
  return `(function() {
    try {
      var name = ${nameJson};
      var rows = document.querySelectorAll('[class*="m9d-c4"]');
      for (var i = 0; i < rows.length; i++) {
        var t = (rows[i].textContent || '');
        if (t.indexOf(name) !== -1) { rows[i].click(); return { ok: true, method: 'ozon-row' }; }
      }
      return { ok: false, method: 'ozon-row', log: 'name not in list' };
    } catch (e) { return { ok: false, method: 'ozon-row', log: e.message }; }
  })();`
}
