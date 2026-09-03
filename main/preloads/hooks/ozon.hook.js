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
    var _lastMsgN = -1, _lastQaN = -1;  // v1.2.349: последний ОТПРАВЛЕННЫЙ счётчик разделов (шлём только при изменении)
    var _lastDiagTs = 0; // v1.2.371 «пульс» покупателей: время последней диаг-записи скана «Сообщения»
    var _qPrev = null, _lastQShape = ''; // v1.2.353: базовая линия «Вопросов» + гейт диаг-лога
    var _lastQDiagTs = 0; // v1.2.370 ДИАГНОСТИКА «пульс»: время последней записи скана вопросов (жив ли фон)
    var _lastRDiagTs = 0; // v1.2.380 РАЗВЕДКА «Отзывы»: гейт диаг-лога структуры (старт + раз в 60с)

    function _diag(msg) { try { console.log('__CC_DIAG__ozon-list ' + msg); } catch (_) {} }
    function _hash(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; }
    function _txt(el) { try { return (el.textContent || '').replace(/\s+/g, ' ').trim(); } catch (_) { return ''; } }
    // v1.2.379: превью — статус набора Ozon («Печатает…»/«Печатают…» с точками/…). Якорь ^…$: только ЧИСТЫЙ
    // статус, реальные фразы («печатает отчёт») не задеваются. По образцу спам-фильтров ВК/Telegram.
    function _isTyping(s) { return /^печата(ет|ют)[.…\s]*$/i.test((s || '').trim()); }

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

    // v1.2.371 (#4 разгрузка): разведка страницы «Вопросы» (_reconQ, маркер ozon-q2) УДАЛЕНА — она разово
    // снимала разметку и подтвердила столбцы таблицы (Дата/Продавец/Товар/Вопрос/ОТВЕТЫ/Полезный), эти знания
    // зашиты в _qAnsCol (столбец «Ответы» по заголовку). Диагностика больше не нужна → файл разгружен.

    // v1.2.371 (#1 память показанного): базовая линия сторожей переживает перезагрузку страницы через
    // localStorage (маленькое хранилище браузера на домене seller.ozon.ru). Без этого при обновлении/перезаходе
    // фон делал НОВУЮ «фотографию» и уже висящие вопросы считал старыми (пропуск), а новые с прошлой сессии
    // не показывал. Теперь помним отпечатки уже-виденных и шлём только реально новые. Пусто → первый заход = базовая линия.
    function _loadSeen(key) { try { var raw = localStorage.getItem(key); if (!raw) return null; var o = JSON.parse(raw); return (o && typeof o === 'object') ? o : null; } catch (_) { return null; } }
    function _saveSeen(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj || {})); } catch (_) {} }

    // v1.2.353 (Шаг 2, TODO-36): сторож раздела «Вопросы и ответы». Новый ВОПРОС БЕЗ ОТВЕТА → уведомление
    // (как у «Покупателей»). ПРАВИЛО (по разведке ozon-q2 + указанию пользователя): строка = таблица, текст
    // вопроса — в BUTTON, товар — 2-я ссылка (1-я = магазин), а ПОСЛЕДНЯЯ короткая числовая ячейка = число
    // ОТВЕТОВ; 0 = без ответа = НОВЫЙ (артикул 10 цифр не считаем — маска \d{1,3}). Первый проход = базовая
    // линия (старые НЕ шлём), дальше только новые отпечатки «товар|вопрос». Заодно qa-счётчик (без ответа) → виджет.
    function _qRows() {
      var rows = document.querySelectorAll('tr, [role="row"]');
      if (rows && rows.length) return rows;
      var best = null, bestN = 0, cont = document.querySelectorAll('div,ul,ol,tbody');
      for (var j = 0; j < cont.length && j < 6000; j++) { var ch = cont[j].children; if (ch && ch.length >= 4 && ch.length > bestN) { best = cont[j]; bestN = ch.length; } }
      return best ? best.children : [];
    }
    // v1.2.354: индекс столбца «Ответы» из заголовка таблицы. Разведка ozon-q2 (H0-H5) подтвердила столбцы:
    // Дата/Продавец/Товар/Вопрос/ОТВЕТЫ/Полезный. Т.е. «ответы» — НЕ последняя числовая ячейка (последняя =
    // «Полезный», лайки), поэтому v1.2.353 считал неверно (unans=10). Берём столбец «Ответы» по заголовку.
    function _qAnsCol(rows) {
      for (var h = 0; h < rows.length; h++) {
        var th = rows[h].querySelectorAll ? rows[h].querySelectorAll('th') : null;
        if (th && th.length) { for (var c = 0; c < th.length; c++) { if (_txt(th[c]).indexOf('Ответ') === 0) return c; } return -1; }
      }
      return -1;
    }
    function _qRowInfo(row, ansCol) {
      var tds = row.querySelectorAll('td');
      var qBtn = row.querySelector('button'); var qText = qBtn ? _txt(qBtn) : (tds[3] ? _txt(tds[3]) : ''); // вопрос — в BUTTON
      var links = row.querySelectorAll('a'); var product = links[1] ? _txt(links[1]) : (links[0] ? _txt(links[0]) : ''); // 2-я ссылка = товар
      // «Ответы»: число >0 = отвечен; «0» ИЛИ пусто = без ответа = НОВЫЙ; ячейки нет / не число = -1 (неизвестно, пропуск).
      var answers = -1;
      if (ansCol >= 0 && tds[ansCol]) { var a = _txt(tds[ansCol]); answers = a === '' ? 0 : (/^\d{1,4}$/.test(a) ? parseInt(a, 10) : -1); }
      return { qText: qText, product: product, answers: answers };
    }
    function _scanQ(reason) {
      try {
        if ((location.pathname || '').indexOf('/reviews/questions') === -1) { _qPrev = null; return; }
        if (document.querySelectorAll('*').length < 300) return; // страница ещё грузится
        if (_qPrev === null) _qPrev = _loadSeen('__ccOzonQSeen'); // v1.2.371: память переживает перезагрузку
        var rows = _qRows(), ansCol = _qAnsCol(rows), cur = {}, cand = [], unans = 0;
        if (ansCol < 0) { _diag('ozon-q no-answers-col rows=' + rows.length); return; } // без столбца «Ответы» НЕ гадаем
        for (var d = 0; d < rows.length; d++) {
          var rr = rows[d]; if (rr.querySelector && rr.querySelector('th')) continue;  // заголовок таблицы — пропуск
          var info = _qRowInfo(rr, ansCol);
          if (!info.qText || info.answers < 0) continue;  // не строка вопроса / нет ячейки ответов
          if (info.answers !== 0) continue;               // есть ответ → не новый
          unans++;
          var fp = _hash((info.product || '') + '|' + info.qText);
          cur[fp] = true; cand.push({ fp: fp, product: info.product, qText: info.qText });
        }
        var emitted = 0, sent = {};
        if (_qPrev) { // не первый проход → шлём только НОВЫЕ вопросы без ответа
          for (var k = 0; k < cand.length; k++) {
            var c = cand[k];
            if (_qPrev[c.fp] || sent[c.fp]) continue;
            sent[c.fp] = true; emitted++;
            console.log('__CC_NOTIF__' + JSON.stringify({ t: c.product || 'Новый вопрос', b: c.qText, i: '', g: 'ozon-q:' + c.fp, src: 'ozon-questions' }));
          }
        }
        if (rows.length > 0) { _qPrev = cur; _saveSeen('__ccOzonQSeen', cur); } // v1.2.371: сохраняем память (переживёт перезагрузку)
        if (unans !== _lastQaN) { _lastQaN = unans; try { console.log('__CC_OZON_COUNT__' + JSON.stringify({ s: 'qa', n: unans })); } catch (_) {} }
        // v1.2.370 «пульс»: пишем скан при изменении формы ИЛИ раз в 60с (даже если не менялось) — чтобы по
        // журналу видеть, ЖИВ ли фоновый сторож и сколько он видит. Отличает «страница заморожена» (пульс есть,
        // unans застыл) от «сторож уснул» (пульса нет). ДИАГНОСТИКА — убрать после диагноза.
        var qShape = rows.length + '/' + unans, _qNow = Date.now();
        if (reason === 'initial' || emitted > 0 || qShape !== _lastQShape || (_qNow - _lastQDiagTs) > 60000) {
          _diag('ozon-q scan reason=' + reason + ' rows=' + rows.length + ' unans=' + unans + ' emitted=' + emitted);
          _lastQShape = qShape; _lastQDiagTs = _qNow;
        }
      } catch (e) { _diag('ozon-q scan-error ' + (e && e.message || e)); }
    }

    function _scan(reason) {
      try {
        // v1.2.353: «Покупатели» работают ТОЛЬКО на странице мессенджера. На «Вопросах» таблицу с числами
        // «1»/«0» нельзя парсить как чаты (число примет за «непрочитано» → ложные уведомления) — там свой _scanQ.
        if ((location.pathname || '').indexOf('/app/messenger') === -1) { _prev = null; return; }
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
          // v1.2.379: «Печатает…» — статус набора (Ozon заменяет им превью). Считаем чат непрочитанным
          // (не мигаем счётчиком), но НЕ уведомляем и не пишем в базу отпечатков — иначе приходило уведомление
          // на набор текста. Маска якорная (^…$): реальное сообщение «печатает отчёт» НЕ гасится (после слова — буквы).
          if (_isTyping(p.preview)) continue;
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
        // v1.2.371 (#3 «пульс» покупателям, как у вопросов): пишем при изменении формы ИЛИ раз в 60с —
        // видно, ЖИВ ли фоновый сторож «Сообщения» и сколько непрочитанных видит. ДИАГНОСТИКА.
        var shape = rows.length + '/' + unreadTotal, _sNow = Date.now();
        if (reason === 'initial' || emitted > 0 || shape !== _lastShape || (_sNow - _lastDiagTs) > 60000) {
          _diag('reason=' + reason + ' sec=' + sec + ' rows=' + rows.length + ' unread=' + unreadTotal + ' emitted=' + emitted);
          _lastShape = shape; _lastDiagTs = _sNow;
        }
        // v1.2.349: авторитетный счётчик «Покупатели» → виджет (бейдж «число новых»). Шлём ТОЛЬКО при
        // изменении числа (без спама). Считается по реальному DOM, поэтому САМ сбрасывается в 0 при прочтении.
        if (unreadTotal !== _lastMsgN) { _lastMsgN = unreadTotal; try { console.log('__CC_OZON_COUNT__' + JSON.stringify({ s: 'msg', n: unreadTotal })); } catch (_) {} }
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

    // v1.2.380 РАЗВЕДКА «Отзывы» (Шаг A, TODO-36): точный URL списка отзывов и селектор бейджа «Новый» НЕИЗВЕСТНЫ —
    // снимаем структуру страницы живьём (как разведка вопросов). ТОЛЬКО лог `__CC_DIAG__ozon-r`; уведомлений и
    // счётчиков ПОКА НЕТ (по строкам журнала сделаю точный сторож). Гейт: страница отзывов (есть «review» в адресе,
    // но НЕ «question» — чтобы не пересечься со страницей «Вопросы»).
    function _scanR(reason) {
      try {
        var pth = location.pathname || '';
        if (pth.indexOf('review') === -1 || pth.indexOf('question') !== -1) return;
        if (document.querySelectorAll('*').length < 300) return; // ещё грузится
        var rNow = Date.now();
        if (reason !== 'initial' && (rNow - _lastRDiagTs) < 60000) return; // без спама
        _lastRDiagTs = rNow;
        var ths = document.querySelectorAll('th'), head = [];
        for (var h = 0; h < ths.length && h < 12; h++) head.push(_txt(ths[h]).slice(0, 18));
        var rows = document.querySelectorAll('tr, [role="row"]'), novy = 0, sample = '';
        for (var r = 0; r < rows.length; r++) {
          var tx = _txt(rows[r]);
          if (/Новый/.test(tx)) { novy++; if (!sample) sample = tx.slice(0, 70); }
        }
        var tab = _txt(document.body).match(/Новые\s+(\d+)/);
        _diag('ozon-r url=' + (location.href || '').slice(0, 70) + ' rows=' + rows.length + ' heads=[' + head.join('|') + '] novy=' + novy + ' tabNew=' + (tab ? tab[1] : '?') + ' sample=' + sample);
      } catch (e) { _diag('ozon-r scan-error ' + (e && e.message || e)); }
    }

    setTimeout(function () { _attach(); _scan('initial'); _scanQ('initial'); _scanR('initial'); }, 2500); // базовая линия покупателей + сторож вопросов + разведка отзывов
    // #3 Подстраховка: список мог пересобраться (SPA) → раз в 5с переце́пим наблюдатель + фоновый досмотр,
    // чтобы ни одно новое сообщение не потерялось даже при пересборке DOM (макс. +5с задержки).
    setInterval(function () { _attach(); _schedule('backstop'); _scanQ('backstop'); _scanR('backstop'); }, 5000);
  } catch (e) { try { console.log('__CC_DIAG__ozon-list init-error ' + (e && e.message || e)); } catch (_) {} }
})();
