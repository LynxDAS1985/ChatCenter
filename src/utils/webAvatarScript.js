// Скрипт-инъекция для сбора аватарки залогиненного веб-аккаунта (ВК/WhatsApp/Макс/Telegram-web).
// Вынесен из useWebAccountAvatars.js в v1.2.287 (хук дорос до лимита 150 строк).
// История правок сбора — в .memory-bank/features.md (v1.2.275–287) и decisions.md ADR-034/035.
//
// Порядок внутри скрипта:
//   0. Telegram: КРУПНЫЙ аватар на экране (открыты Настройки) → чёткое фото, перебивает заглушку.
//   1. «Карман» localStorage['__cc_account_avatar'] (Макс — из Настроек, Telegram — из stripped_thumb).
//   2. Нацеленные селекторы «своего профиля» (ВК TopNav, WhatsApp #side header, Макс settings/profile).
//   3. Не нашли — дамп кандидатов в диагностику.

export const WEB_ACCOUNT_AVATAR_SCRIPT = `(async () => {
  function grab(url) {
    return new Promise(function (resolve) {
      try {
        var im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = function () {
          try { var c = document.createElement('canvas'); c.width = 64; c.height = 64;
            c.getContext('2d').drawImage(im, 0, 0, 64, 64); resolve(c.toDataURL('image/jpeg', 0.82)); }
          catch (e) { resolve(null); }
        };
        im.onerror = function () { resolve(null); };
        im.src = url;
      } catch (e) { resolve(null); }
    });
  }
  function bgUrl(el) {
    try { var b = (getComputedStyle(el).backgroundImage || ''); var i = b.indexOf('url(');
      if (i < 0) return ''; var s = b.slice(i + 4); if (s[0] === '"' || s[0] === "'") s = s.slice(1);
      var j = s.search(/["')]/); return j < 0 ? '' : s.slice(0, j); } catch (e) { return ''; }
  }
  try {
    // v1.2.288: Telegram — АВТОМАТИЧЕСКИ достаём чёткое фото. Чёткое фото аккаунта = КРУПНЫЙ аватар
    // (аватарки чатов ~48px, фото в Настройках ~100px+). (A) если Настройки уже открыты — снимаем сразу;
    // (B) иначе программа САМА открывает Настройки (жмёт «три полоски» → пункт РОВНО «Настройки»/«Settings»
    // — «Выйти» исключён точным совпадением), снимает фото и закрывает (Escape). До 3 попыток, потом стоп.
    if (location.host.indexOf('telegram') >= 0) {
      var __delay = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      var __esc = function () { try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true })); } catch (e) {} };
      // Берём самый большой ЗАГРУЖЕННЫЙ и НЕ пустой (не белый плейсхолдер) аватар >=80px = фото аккаунта.
      var __grabBig = function () {
        try {
          var av = document.querySelectorAll('img.avatar-photo, .avatar-photo img, .avatar img, [class*="avatar" i] img');
          // v1.2.309: фото грузится СТУПЕНЬКОЙ (серое → через ~2с чёткое). Раньше брали ПРОСТО самый большой
          // кружок — а им часто была серая заглушка. Теперь проверяем ВСЕ большие кандидаты и берём самый
          // крупный НАСТОЯЩИЙ (серые/заглушки пропускаем). Пока настоящее не пришло — вернём blank (ждём).
          var bestEl = null, bestSz = 0, bestProfEl = null, bestProfSz = 0, sawBig = false;
          for (var ai = 0; ai < av.length; ai++) {
            var ae = av[ai]; if (!ae.src || !ae.complete || ae.naturalWidth < 60) continue; // только ЗАГРУЖЕННОЕ
            var rc = ae.getBoundingClientRect(); var mn = Math.min(rc.width, rc.height);
            if (mn <= 79) continue; // нужен КРУПНЫЙ (фото профиля), мелкие аватарки чатов пропускаем
            sawBig = true;
            var cv = document.createElement('canvas'); cv.width = 100; cv.height = 100;
            var cx = cv.getContext('2d');
            try { cx.drawImage(ae, 0, 0, 100, 100); } catch (e) { continue; }
            var mn2 = 255, mx2 = 0, sum2 = 0, cnt2 = 0; // разброс + средняя яркость
            try { var pd = cx.getImageData(12, 12, 76, 76).data; for (var pi = 0; pi < pd.length; pi += 8) { var vv = pd[pi]; if (vv < mn2) mn2 = vv; if (vv > mx2) mx2 = vv; sum2 += vv; cnt2++; } } catch (e) { try { localStorage.setItem('__cc_avatar_diag', 'grab|skip:' + (e && e.name)); } catch (e2) {} continue; } // v1.2.311 (#3): молчал — теперь в журнал (cross-origin/tainted)
            var avg2 = cnt2 ? sum2 / cnt2 : 128;
            // Заглушка загрузки: почти однотонная ИЛИ тёмная+малодетальная (серый кружок ~77). Пропускаем.
            // Осторожно: тёмное, но ДЕТАЛЬНОЕ (mx-mn>=70) фото проходит — не режем настоящие тёмные аватары.
            if ((mx2 - mn2 < 18) || (avg2 < 100 && (mx2 - mn2) < 70)) continue;
            // v1.2.311 (#1): предпочитаем аватар ВНУТРИ Настроек/профиля (точно «свой»); иначе — крупнейший.
            var inProf = false; try { inProf = !!ae.closest('[class*="settings" i], [class*="profile" i], .sidebar-header'); } catch (e) {}
            if (inProf && mn > bestProfSz) { bestProfSz = mn; bestProfEl = ae; }
            if (mn > bestSz) { bestSz = mn; bestEl = ae; }
          }
          var winEl = bestProfEl || bestEl, winSz = bestProfEl ? bestProfSz : bestSz;
          if (winEl) { var cvW = document.createElement('canvas'); cvW.width = 100; cvW.height = 100;
            try { cvW.getContext('2d').drawImage(winEl, 0, 0, 100, 100); return { b: cvW.toDataURL('image/jpeg', 0.92), sz: Math.round(winSz) }; } catch (e) {} }
          if (sawBig) return { blank: 1 }; // большие есть, но все — заглушки: ждём следующей попытки
          return null; // крупных нет (Настройки ещё не открыты)
        } catch (e) { return null; }
      };
      // (A) фото уже на экране (Настройки открыты)? Кладём в ОТДЕЛЬНЫЙ ключ '__cc_account_avatar_crisp2'
      //     (v1.2.305): раньше чёткое и бледную запаску писали в ОДИН ключ '__cc_account_avatar', и
      //     запаска из constants.js (stripped_thumb) ЗАТИРАЛА чёткое → значок застревал на бледном.
      var big = __grabBig();
      if (big && big.b) { try { localStorage.setItem('__cc_account_avatar_crisp2', big.b); } catch (e) {}
        return { avatar: big.b, sel: 'onscreen-big-' + big.sz, err: '' }; }
      // Чёткое уже добыто (в отдельном ключе)? Отдаём его — Настройки больше не открываем.
      var crisp = localStorage.getItem('__cc_account_avatar_crisp2');
      if (crisp && crisp.indexOf('data:image') === 0) return { avatar: crisp, sel: 'crisp-stored', err: '' };
      // (B) авто-открытие Настроек с ПОШАГОВОЙ записью в журнал (step пишется СРАЗУ на каждом шаге —
      // видно, до какого шага дошло, даже если дальше зависло). Ключи v3 — старый залипший crisp не блокирует.
      var step = function (s) { try { localStorage.setItem('__cc_avatar_diag', s); } catch (e) {} };
      var tries = parseInt(localStorage.getItem('__cc_tg_open_tries7') || '0', 10);
      var busy = window.__cc_tg_busyTs && (Date.now() - window.__cc_tg_busyTs < 15000); // по времени, не залипает
      // v1.2.305: гейт по НАЛИЧИЮ чёткого ключа, а не по старому флагу crisp3 (тот залипал на '1' и
      // блокировал переснятие, пока в кармане лежала бледная запаска). Нет чёткого → идём в Настройки.
      step('gate|crisp=' + (crisp ? 'Y' : 'N') + '|t=' + tries + '|busy=' + (busy ? 1 : 0));
      if (!crisp && tries < 8 && !busy) {  // v1.2.311 (#2): 5→8 попыток — запас на медленный интернет
        window.__cc_tg_busyTs = Date.now();
        localStorage.setItem('__cc_tg_open_tries7', String(tries + 1));
        var out = null;
        try {
          step('auto|start t' + (tries + 1));
          var burger = document.querySelector('.btn-menu-toggle, .sidebar-header .btn-menu-toggle');
          step('auto|burger=' + (burger ? 'Y' : 'N'));
          if (burger) {
            burger.click(); await __delay(900);
            var cl = document.querySelectorAll('.btn-menu-item, [role="menuitem"], .rp, button, a'), settings = null, dd = [];
            for (var ci = 0; ci < cl.length; ci++) {
              var tt = (cl[ci].textContent || '').replace(/\\s+/g, ' ').trim(), tl = tt.toLowerCase();
              if (tt.length > 0 && tt.length < 20 && dd.length < 10) dd.push(tt);
              if (tt.length < 22 && (tl.indexOf('астройк') >= 0 || tl.indexOf('setting') >= 0)) settings = cl[ci];
            }
            step('auto|menu=' + cl.length + '|set=' + (settings ? 'Y' : 'N') + '|[' + dd.join(',').slice(0, 90) + ']');
            if (settings) {
              settings.click(); await __delay(2600);
              // v1.2.308: даём НАСТОЯЩЕМУ фото прогрузиться — до 5 попыток с паузой (пока не пришло —
              // __grabBig вернёт blank для серой заглушки, ждём следующую). Всего ~9с в Настройках.
              var big2 = __grabBig();
              for (var rt = 0; rt < 5 && (!big2 || big2.blank); rt++) { await __delay(1600); big2 = __grabBig(); } // v1.2.311 (#2): 4→5 ретраев
              step('auto|opened|grab=' + (big2 ? (big2.b ? 'OK' + big2.sz : 'blank' + big2.blank) : 'null'));
              if (big2 && big2.b) { try { localStorage.setItem('__cc_account_avatar_crisp2', big2.b); } catch (e) {}
                out = { avatar: big2.b, sel: 'auto-settings-' + big2.sz, err: '' }; }
              __esc(); await __delay(400); __esc();
            } else { __esc(); }
          }
        } catch (e) { step('auto|throw:' + (e && e.name)); }
        if (out) return out;
      }
    }
    // «Карман» — accountScript Макса/Telegram кладут сюда СВОЁ фото. Берём его в ПЕРВУЮ очередь.
    var stored = localStorage.getItem('__cc_account_avatar');
    var adiag = localStorage.getItem('__cc_avatar_diag') || '';
    if (stored && stored.indexOf('data:image') === 0) {
      // Проверяем, что сохранённое фото реально ОТКРЫВАЕТСЯ (мини-аватар мог собраться битым).
      var okStored = await new Promise(function (res) {
        var done = false, t = new Image();
        var fin = function (v) { if (!done) { done = true; res(v); } };
        t.onload = function () { fin(t.naturalWidth > 0); };
        t.onerror = function () { fin(false); };
        setTimeout(function () { fin(false); }, 2500);
        t.src = stored;
      });
      // Отдаём adiag вместе с фото, чтобы диагностика была видна в журнале даже при показе сохранённого.
      if (okStored) return { avatar: stored, sel: 'stored', err: '', diag: adiag };
      adiag = (adiag ? adiag + ' ;; ' : '') + 'stored-broken';
    }
    // Только «свой аккаунт», НЕ аватары чатов/собеседников. Каждый селектор нацелен на свой сайт.
    var sels = [
      '#pane-side header img[draggable="false"]', '#side header img[draggable="false"]', 'header img[draggable="false"]',
      '[class*="TopNavBtn"] img', '[class*="TopNav"] [class*="Avatar" i] img',
      '#column-left .sidebar-header .avatar-photo', '.sidebar-header .avatar-photo', '.settings-container .avatar-photo',
      '[class*="settings" i] img.avatarImage', '[class*="profile" i] img.avatarImage'
    ];
    var soft = '';
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]); if (!el) continue;
      if (el.tagName === 'CANVAS' && el.width > 12) { try { return { avatar: el.toDataURL('image/png'), sel: sels[i], err: '' }; } catch (e) {} }
      var url = '';
      var img = el.tagName === 'IMG' ? el : el.querySelector('img');
      if (img && img.src) url = img.src; else url = bgUrl(el);
      if (url) {
        if (url.indexOf('data:image') === 0) return { avatar: url, sel: sels[i], err: '' };
        var b = await grab(url);
        if (b && b.indexOf('data:image') === 0) return { avatar: b, sel: sels[i], err: '' };
        soft = 'cors-reload-failed@' + sels[i];
      }
    }
    var dump = [];
    var cand = document.querySelectorAll('[class*="avatar" i], header canvas, header img, [class*="sidebar" i] canvas, [class*="TopNav" i] img, [class*="settings" i] img');
    for (var k = 0; k < cand.length && dump.length < 6; k++) {
      var q = cand[k]; var tag = q.tagName; var src = '';
      if (tag === 'IMG') src = (q.src || '').slice(0, 44);
      else if (tag === 'CANVAS') src = 'CANVAS' + q.width + 'x' + q.height;
      else src = bgUrl(q) ? 'BG:' + bgUrl(q).slice(0, 40) : '';
      if (src) dump.push(tag + '.' + ('' + (q.className || '')).slice(0, 22) + '|' + src);
    }
    return { avatar: null, sel: soft ? 'partial' : 'none', err: soft || 'no-el', dump: (adiag ? adiag + ' ;; ' : '') + dump.join(' ;; ') };
  } catch (e) { return { avatar: null, sel: '?', err: 'throw:' + (e && e.name) }; }
})()`
