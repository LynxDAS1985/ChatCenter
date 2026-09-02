// v1.2.330: РАБОЧИЙ сторож чатов Ozon-мессенджера (раздел «Покупатели»).
// Уведомляет о НОВЫХ входящих сообщениях покупателей — по образцу VK (_scanVkList).
// Вся Ozon-специфика (селекторы/логика) — ТОЛЬКО здесь; общий конвейер уведомлений не трогаем.
//
// КАК РАБОТАЕТ:
//  - Читает список чатов (строки чатов), берёт у непрочитанных строк имя + превью.
//  - Непрочитанная строка = в ней есть значок-число «непрочитано» (НЕ время). Такой значок Ozon
//    рисует только на ВХОДЯЩИЕ письма покупателя → на мои ответы сторож молчит.
//  - Первый проход = базовая линия (старые непрочитанные НЕ шлём). Дальше — только НОВЫЕ отпечатки
//    «имя|превью» (меняется при каждом новом сообщении → уведомление на каждое новое).
//  - Шлёт `__CC_NOTIF__` (src=ozon-list) → общий конвейер (мьют/звук/лента/дедуп, как у ВК).
//
// v1.2.330 — три улучшения:
//  (#2) ЗАМОК «только Покупатели»: активный раздел Ozon пишет в адрес (?group=customers). Уведомляем,
//       только когда мы НЕ в чужом разделе. Глушим ТОЛЬКО при явно другом разделе (group есть и это не
//       customer…). Нет параметра/неизвестно → уведомляем (fail-open: никогда не молчим зря). Уходя из
//       «Покупателей» — сбрасываем базу, чтобы при возврате не улетели старые как «новые» (без шторма).
//  (#3) СУЖЕН НАБЛЮДАТЕЛЬ: следим за контейнером СПИСКА чатов, а не за всей страницей Ozon (меньше
//       холостых срабатываний). Подстраховка раз в 5с переце́пит наблюдатель, если список пересобрался,
//       и до-сканирует — ни одно новое сообщение не теряется (макс. +5с задержки).
//
// ВАЖНО: только ЧТЕНИЕ DOM (без запросов/изменений → антибот Ozon не тревожим). Впрыск через
// executeJavaScript (минуя CSP Ozon; detectMessengerType('ozon')). Лёгкое чтение — textContent
// (не innerText: тот форсирует reflow). В файл-лог тексты покупателей НЕ пишем (только счётчики).
(function () {
  try {
    if (window.__ccOzonWatch) return; window.__ccOzonWatch = true;
    var _prev = null, _timer = null, _observed = null, _mo = null;
    var _lastSec = '', _lastShape = ''; // для гейта логов «только при изменении» (без спама в цикле)

    function _diag(msg) { try { console.log('__CC_DIAG__ozon-list ' + msg); } catch (_) {} }
    function _hash(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; }
    function _txt(el) { try { return (el.textContent || '').replace(/\s+/g, ' ').trim(); } catch (_) { return ''; } }

    // #2 Активный раздел из адреса страницы. Ozon кладёт раздел в query: ?group=customers (Покупатели).
    // 'buyers' — покупатели; 'other' — явно другой раздел (глушим); 'unknown' — нет параметра (не глушим).
    function _section() {
      try {
        var m = (location.search || '').toLowerCase().match(/[?&]group=([^&]*)/);
        if (!m) return 'unknown';
        return m[1].indexOf('customer') === 0 ? 'buyers' : 'other';
      } catch (_) { return 'unknown'; }
    }

    // Строки чатов: быстрый путь — по классу строки; запасной — список с 4+ строками, где есть время HH:MM.
    function _findRows() {
      var rows = document.querySelectorAll('[class*="m9d-c4"]');
      if (rows && rows.length >= 3) return rows;
      var best = null, bestN = 0, els = document.querySelectorAll('div,ul,ol,section,main');
      for (var i = 0; i < els.length && i < 5000; i++) {
        var k = els[i].children; if (!k || k.length < 4) continue;
        var withTime = 0;
        for (var j = 0; j < k.length && j < 12; j++) { if (/\b\d{1,2}:\d{2}\b/.test(_txt(k[j]))) withTime++; }
        if (withTime >= 3 && k.length > bestN) { best = els[i]; bestN = k.length; }
      }
      return best ? best.children : [];
    }

    // Разбор строки чата → { name, preview, unread }. Классы Ozon случайные → цепляемся за СОДЕРЖИМОЕ:
    // время = HH:MM (пропуск), значок непрочитано = чистое число 1-3 цифры, имя = первый текст, превью = остальное.
    function _parseRow(row) {
      var parts = [], unread = 0;
      var leaves = row.querySelectorAll('*');
      for (var i = 0; i < leaves.length; i++) {
        var x = leaves[i]; if (x.children && x.children.length) continue;
        var t = _txt(x); if (!t) continue;
        if (/^\d{1,2}:\d{2}$/.test(t)) continue;                 // время — пропуск
        if (/^\d{1,3}$/.test(t)) { unread = parseInt(t, 10) || 0; continue; } // значок непрочитано
        parts.push(t);
      }
      return { name: parts[0] || '', preview: parts.length > 1 ? parts.slice(1).join(' ') : '', unread: unread };
    }

    function _scan(reason) {
      try {
        var sec = _section();
        // Журнал смены раздела (диагностика замка #2): видно, меняет ли Ozon адрес при Покупатели↔Поддержка.
        if (sec !== _lastSec) { _diag('sec-change from=' + (_lastSec || '?') + ' to=' + sec + ' reason=' + reason); _lastSec = sec; }
        if (sec === 'other') { // #2: явно НЕ раздел покупателей → молчим и сбрасываем базу (без шторма при возврате)
          _prev = null; // лог — только при СМЕНЕ раздела выше (не на каждый скан → без спама в цикле)
          return;
        }
        var rows = _findRows(), cur = {}, cand = [], unreadTotal = 0;
        for (var i = 0; i < rows.length; i++) {
          var p = _parseRow(rows[i]);
          if (p.unread <= 0) continue;             // только непрочитанные (входящие покупателя)
          if (!p.name || !p.preview) continue;     // неполная строка — пропуск
          unreadTotal++;
          var fp = _hash(p.name + '|' + p.preview); // отпечаток «имя+текст» → меняется на каждое новое сообщение
          cur[fp] = true;
          cand.push({ fp: fp, name: p.name, preview: p.preview });
        }
        var emitted = 0, sent = {};
        if (_prev) { // не первый проход → шлём только НОВЫЕ (по каждому новому сообщению)
          for (var k = 0; k < cand.length; k++) {
            var c = cand[k];
            if (_prev[c.fp] || sent[c.fp]) continue; // уже было непрочитано ИЛИ уже отправлено в этом проходе
            sent[c.fp] = true; emitted++;
            console.log('__CC_NOTIF__' + JSON.stringify({ t: c.name, b: c.preview, i: '', g: 'ozon-list:' + c.fp, src: 'ozon-list' }));
          }
        }
        if (rows.length > 0) _prev = cur; // базовую линию обновляем только когда список реально виден
        // Диагностика — ТОЛЬКО счётчики (без имён/текстов покупателей). Пишем при старте, при отправке
        // ИЛИ при изменении «формы» (число строк/непрочитанных) → неудачный тест не будет «немым», но без спама.
        var shape = rows.length + '/' + unreadTotal;
        if (reason === 'initial' || emitted > 0 || shape !== _lastShape) {
          _diag('reason=' + reason + ' sec=' + sec + ' rows=' + rows.length + ' unread=' + unreadTotal + ' emitted=' + emitted);
          _lastShape = shape;
        }
      } catch (e) { _diag('scan-error ' + (e && e.message || e)); }
    }

    function _schedule(reason) { if (_timer) return; _timer = setTimeout(function () { _timer = null; _scan(reason); }, 500); }

    // #3 Наблюдатель следит за контейнером СПИСКА чатов (rows[0].parentNode). Пока список не найден —
    // слушаем body как загрузочный будильник; появился список — переце́пляемся на него.
    function _attach() {
      try {
        var rows = _findRows();
        var target = (rows && rows.length && rows[0].parentNode) ? rows[0].parentNode : document.body;
        if (target === _observed) return;
        if (_mo) { try { _mo.disconnect(); } catch (_) {} }
        _mo = new MutationObserver(function () { _schedule('mutation'); });
        _mo.observe(target, { childList: true, subtree: true });
        _observed = target;
      } catch (e) { _diag('attach-error ' + (e && e.message || e)); } // #2 из ревью: ветка больше не молчит
    }

    setTimeout(function () { _attach(); _scan('initial'); }, 2500); // базовая линия после загрузки списка
    // #3 Подстраховка: список мог пересобраться (SPA) → раз в 5с переце́пим наблюдатель + фоновый досмотр,
    // чтобы ни одно новое сообщение не потерялось даже при пересборке DOM (макс. +5с задержки).
    setInterval(function () { _attach(); _schedule('backstop'); }, 5000);
  } catch (e) { try { console.log('__CC_DIAG__ozon-list init-error ' + (e && e.message || e)); } catch (_) {} }
})();
