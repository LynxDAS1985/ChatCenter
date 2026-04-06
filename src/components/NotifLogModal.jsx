import { buildChatNavigateScript } from '../utils/navigateToChat.js'

export default function NotifLogModal({ ctx }) {
  const {
    notifLogModal, setNotifLogModal, notifLogTab, setNotifLogTab,
    traceFilter, setTraceFilter, setCellTooltip,
    settings, setSettings, webviewRefs,
    handleTabContextAction_diag,
    traceNotif, handleNewMessage, pipelineTraceRef
  } = ctx

  const traceStepLabels = { source: 'Источник', spam: 'Спам', dedup: 'Дедуп', handle: 'Обработка', viewing: 'Видимость', sound: 'Звук', ribbon: 'Ribbon', enrich: 'Обогащение', inspect: 'Инспектор', error: 'Ошибка', debug: 'Отладка', warmup: 'Разогрев', 'go-chat': 'Переход', 'mark-read': 'Прочитано', crash: 'Краш', hang: 'Зависание', 'load-fail': 'Загрузка' }
  const traceTypeColors = { pass: '#4ade80', block: '#f87171', warn: '#fbbf24', info: '#94a3b8' }
  const traceTypeLabels = { pass: 'ПРОПУЩЕН', block: 'БЛОК', warn: 'ВНИМАНИЕ', info: 'ИНФО' }
  const traceData = (notifLogModal.trace || []).filter(e => {
    if (traceFilter === 'all') return true
    if (traceFilter === 'block') return e.type === 'block' || e.type === 'warn'
    if (traceFilter === 'hook-blocked') return (e.detail || '').includes('hook-blocked')
    if (traceFilter === 'source') return e.step === 'source' || e.step === 'enrich'
    if (traceFilter === 'decision') return e.step === 'viewing' || e.step === 'sound' || e.step === 'ribbon' || e.step === 'dedup'
    return true
  })
  const hookBlockedCount = (notifLogModal.trace || []).filter(e => (e.detail || '').includes('hook-blocked')).length

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={() => setNotifLogModal(null)}>
      <div
        className="rounded-xl shadow-2xl flex flex-col"
        style={{
          backgroundColor: 'var(--cc-surface)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)',
          width: '920px', minWidth: '400px', minHeight: '300px', maxWidth: '95vw', maxHeight: '90vh',
          resize: 'both', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Заголовок + вкладки */}
        <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid var(--cc-border)' }}>
          <div className="flex items-center gap-3">
            <span>📊</span>
            <span className="font-semibold text-sm">{notifLogModal.name}</span>
            {/* Вкладки */}
            <div className="flex gap-1 ml-2 flex-wrap">
              {[
                ['log', `Лог (${notifLogModal.log.length})`, 'Входящие сообщения — что пришло и от кого'],
                ['trace', `Pipeline (${(notifLogModal.trace||[]).length})`, 'Путь сообщения через фильтры, дедуп и обогащение'],
                ['domScan', 'DOM', 'Структура страницы — селекторы, контейнеры, бейджи'],
                ['diagFull', 'Хранилище', 'Cookies, localStorage, IndexedDB, аватарки'],
                ['diagAccount', 'Аккаунт', 'Имя аккаунта — тест скрипта извлечения имени'],
              ].map(([tab, label, tooltip]) => (
                <button key={tab} className="px-2 py-1 rounded text-xs cursor-pointer" style={{
                  backgroundColor: notifLogTab === tab ? 'rgba(96,165,250,0.2)' : 'transparent',
                  color: notifLogTab === tab ? '#60a5fa' : 'var(--cc-text-dimmer)',
                  border: notifLogTab === tab ? '1px solid rgba(96,165,250,0.3)' : '1px solid transparent',
                }} onClick={() => {
                  setNotifLogTab(tab)
                  // Автозапуск диагностики при переключении на вкладку
                  if ((tab === 'domScan' || tab === 'diagFull' || tab === 'diagAccount') && !notifLogModal[tab + 'Data']) {
                    const wv = webviewRefs.current[notifLogModal.messengerId]
                    if (wv) {
                      const action = tab === 'domScan' ? 'diagDOM' : tab === 'diagFull' ? 'diagFull' : 'diagAccount'
                      handleTabContextAction_diag(action, notifLogModal.messengerId, wv)
                    }
                  }
                }} title={tooltip}>{label}</button>
              ))}
            </div>
            <span className="text-[10px]" style={{ color: '#4ade80' }}>&#9679; авто</span>
          </div>
          <div className="flex gap-2">
            <button className="px-2 py-1 rounded text-xs cursor-pointer" style={{ backgroundColor: 'var(--cc-hover)', color: 'var(--cc-text-dim)' }}
              onClick={() => {
                let data
                if (notifLogTab === 'log') data = notifLogModal.log
                else if (notifLogTab === 'trace') data = notifLogModal.trace || []
                else if (notifLogTab === 'domScan') data = notifLogModal.domScanData || {}
                else if (notifLogTab === 'diagFull') data = notifLogModal.diagFullData || {}
                else if (notifLogTab === 'diagAccount') data = notifLogModal.diagAccountData || {}
                else data = {}
                navigator.clipboard.writeText(JSON.stringify(data, null, 2)).catch(() => {})
              }}
            >Скопировать</button>
            {notifLogTab === 'trace' && (<>
              {/* DOM Inspector — выгрузка реальных селекторов из WebView */}
              <button className="px-2 py-1 rounded text-xs cursor-pointer" style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: '#a855f7' }}
                onClick={() => {
                  const mid = notifLogModal.messengerId
                  const wv = webviewRefs.current[mid]
                  if (!wv) return
                  wv.executeJavaScript(`(function() {
                    try {
                      var r = { url: location.href, header: [], activeChat: [], chatlist: [] };
                      // Header area
                      var hSels = ['.chat-info', '.topbar', '[class*="chat-header" i]', '[class*="top-bar" i]', 'header'];
                      for (var i = 0; i < hSels.length; i++) {
                        var el = document.querySelector(hSels[i]);
                        if (!el) continue;
                        var cls = el.className || ''; if (typeof cls !== 'string') cls = cls.baseVal || '';
                        var kids = [];
                        for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
                          var cc = c.className || ''; if (typeof cc !== 'string') cc = cc.baseVal || '';
                          kids.push({ tag: c.tagName, cls: cc.slice(0,80), text: (c.textContent||'').slice(0,40) });
                        }
                        r.header.push({ sel: hSels[i], tag: el.tagName, cls: cls.slice(0,120), text: (el.textContent||'').slice(0,60), kids: kids.slice(0,8) });
                      }
                      // Active chat in sidebar
                      var aSels = ['.chatlist-chat.active', '.chatlist-chat.selected', '[class*="chat"][class*="active" i]'];
                      for (var j = 0; j < aSels.length; j++) {
                        var a = document.querySelector(aSels[j]);
                        if (!a) continue;
                        var ac = a.className || ''; if (typeof ac !== 'string') ac = ac.baseVal || '';
                        r.activeChat.push({ sel: aSels[j], tag: a.tagName, cls: ac.slice(0,120), text: (a.textContent||'').slice(0,80) });
                      }
                      // Chatlist sample
                      var chats = document.querySelectorAll('.chatlist-chat');
                      r.chatlist.push({ count: chats.length, firstCls: chats[0] ? (chats[0].className||'').slice(0,120) : '' });
                      if (!chats.length) {
                        var generic = document.querySelectorAll('[class*="chat" i], [class*="dialog" i]');
                        r.chatlist.push({ generic: generic.length, firstTag: generic[0] ? generic[0].tagName : '', firstCls: generic[0] ? (generic[0].className||'').slice(0,120) : '' });
                      }
                      // v0.76.2: chatPeerTypes — peer-id + поиск бейджей-чисел
                      r.chatPeerTypes = [];
                      var ptIdx2 = 0;
                      chats.forEach(function(chat) {
                        if (ptIdx2 >= 10) return;
                        var peerId = chat.getAttribute('data-peer-id') || '';
                        var isPersonal = peerId && !peerId.startsWith('-');
                        var nm = '';
                        var pTitle = chat.querySelector('.peer-title');
                        if (pTitle) nm = (pTitle.textContent||'').slice(0,25);
                        // Поиск числа непрочитанных — все элементы с текстом-числом внутри чата
                        var unreadNum = null;
                        var unreadCls = '';
                        chat.querySelectorAll('*').forEach(function(el) {
                          var t = (el.textContent||'').trim();
                          if (/^\d{1,4}$/.test(t) && el.children.length === 0 && el.offsetWidth > 0 && el.offsetWidth < 50) {
                            unreadNum = t;
                            var c = el.className || ''; if (typeof c !== 'string') c = c.baseVal || '';
                            unreadCls = c.slice(0,80);
                          }
                        });
                        r.chatPeerTypes.push({ name: nm, peerId: peerId.slice(0,15), personal: isPersonal, unread: unreadNum, unreadCls: unreadCls });
                        ptIdx2++;
                      });
                      // v0.59.1: chatContainer — ищем контейнер чата (для chatObserver)
                      r.chatContainer = [];
                      var ccSels = [
                        '[class*="im-page--chat-body"]', '[class*="im_msg_list"]', '[class*="ChatBody"]',
                        '[class*="im-history"]', '[class*="ConversationBody"]', '[class*="chat-body"]',
                        '[class*="im-page--chat"]', '[class*="HistoryMessages"]',
                        '[class*="messages-container"]', '[class*="message-list"]',
                        '[class*="bubbles"]', '[class*="history"]',
                        '[class*="im-page"]', '[class*="im_"]', '[class*="Chat"]',
                        '[class*="Message"]', '[class*="message"]'
                      ];
                      for (var ci = 0; ci < ccSels.length; ci++) {
                        try {
                          var cEl = document.querySelector(ccSels[ci]);
                          if (!cEl) continue;
                          var ccls = cEl.className || ''; if (typeof ccls !== 'string') ccls = ccls.baseVal || '';
                          var kidCount = cEl.querySelectorAll('*').length;
                          r.chatContainer.push({ sel: ccSels[ci], tag: cEl.tagName, cls: ccls.slice(0,120), childCount: kidCount });
                        } catch {}
                      }
                      // Ищем scrollable-контейнеры (обычно тут пузыри сообщений)
                      r.scrollContainers = [];
                      var scrollEls = document.querySelectorAll('[style*="overflow"], [class*="scroll" i]');
                      for (var si = 0; si < scrollEls.length && si < 10; si++) {
                        var sEl = scrollEls[si];
                        var scls = sEl.className || ''; if (typeof scls !== 'string') scls = scls.baseVal || '';
                        if (scls.length < 3) continue;
                        var sKids = sEl.querySelectorAll('*').length;
                        if (sKids < 5) continue;
                        r.scrollContainers.push({ tag: sEl.tagName, cls: scls.slice(0,120), childCount: sKids, h: sEl.scrollHeight });
                      }
                      // v0.77.6: VK профиль + CSS-классы сообщений (улучшенный поиск)
                      r.vkProfile = {};
                      try {
                        // 1. Кнопка профиля в шапке (testid)
                        var profBtn = document.querySelector('[data-testid="header-profile-menu-button"]');
                        if (profBtn) {
                          var profImg = profBtn.querySelector('img');
                          if (profImg) r.vkProfile.avatarSrc = (profImg.src||'').slice(0,80);
                          r.vkProfile.profBtnText = (profBtn.textContent||'').trim().slice(0,40);
                          r.vkProfile.profBtnTitle = (profBtn.title||profBtn.getAttribute('aria-label')||'').slice(0,40);
                        }
                        // 2. Левое меню — ссылка "Профиль" с href /idXXX
                        var leftNav = document.querySelector('[data-testid="leftmenu"]');
                        if (leftNav) {
                          var links = leftNav.querySelectorAll('a[href*="/id"]');
                          links.forEach(function(lnk) {
                            var href = lnk.getAttribute('href')||'';
                            if (/\/id\d+/.test(href)) {
                              r.vkProfile.profileHref = href;
                              r.vkProfile.profileLinkText = (lnk.textContent||'').trim().slice(0,40);
                            }
                          });
                        }
                        // 3. Мета-теги и глобальные переменные
                        var metaName = document.querySelector('meta[property="og:title"], meta[name="author"]');
                        if (metaName) r.vkProfile.metaName = (metaName.content||'').slice(0,40);
                      } catch {}
                      // Последние сообщения в чате — ищем в ConvoHistory__flow
                      r.vkMessages = [];
                      try {
                        var flow = document.querySelector('.ConvoHistory__flow, .ConvoMain__history');
                        if (flow) {
                          // Ищем прямых детей flow (группы сообщений)
                          var groups = flow.children;
                          var startG = groups.length > 3 ? groups.length - 3 : 0;
                          for (var gi = startG; gi < groups.length; gi++) {
                            var grp = groups[gi];
                            var gc = grp.className||''; if (typeof gc !== 'string') gc = gc.baseVal||'';
                            var isOut2 = gc.includes('out') || gc.includes('Out') || gc.includes('own') || gc.includes('right') || gc.includes('self');
                            var dataOut = grp.getAttribute('data-out') || grp.getAttribute('data-peer-id') || '';
                            var authorEl2 = grp.querySelector('[class*="author" i], [class*="name" i], [class*="sender" i], [class*="Avatar" i]');
                            var author2 = authorEl2 ? (authorEl2.textContent||'').trim().slice(0,30) : '';
                            var bodyText = (grp.textContent||'').trim().slice(0,80);
                            r.vkMessages.push({ cls: gc.slice(0,120), isOut: isOut2, dataOut: dataOut, author: author2, text: bodyText, tag: grp.tagName, kids: grp.children.length });
                          }
                        }
                      } catch {}
                      // HTML последнего сообщения (для анализа структуры)
                      try {
                        var flow2 = document.querySelector('.ConvoHistory__flow');
                        if (flow2 && flow2.lastElementChild) {
                          r.vkLastMsgHtml = flow2.lastElementChild.outerHTML.slice(0,500);
                        }
                      } catch {}
                      return JSON.stringify(r);
                    } catch(e) { return JSON.stringify({ error: e.message }); }
                  })()`)
                    .then(res => {
                      try {
                        const data = JSON.parse(res)
                        traceNotif('inspect', 'info', mid, '', 'DOM Inspector: ' + JSON.stringify(data).slice(0, 200))
                        navigator.clipboard.writeText(JSON.stringify(data, null, 2)).catch(() => {})
                        setNotifLogModal(prev => prev ? { ...prev, trace: [...(prev.trace || []), { ts: Date.now(), step: 'inspect', type: 'info', mid, text: 'DOM Inspector', detail: JSON.stringify(data, null, 2) }] } : prev)
                      } catch {}
                    })
                    .catch(e => traceNotif('inspect', 'warn', mid, '', 'DOM Inspector error: ' + e.message))
                }}
              >DOM</button>
              {/* Тест-кнопка — тестовое уведомление через pipeline */}
              <button className="px-2 py-1 rounded text-xs cursor-pointer" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ade80' }}
                onClick={() => {
                  const mid = notifLogModal.messengerId
                  const testText = 'Тест от ChatCenter ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  traceNotif('source', 'info', mid, testText, 'ТЕСТ — ручной запуск через кнопку')
                  handleNewMessage(mid, testText, { senderName: 'ChatCenter Тест' })
                }}
              >Тест</button>
              <button className="px-2 py-1 rounded text-xs cursor-pointer" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' }}
                onClick={() => { pipelineTraceRef.current = []; setNotifLogModal(prev => prev ? { ...prev, trace: [] } : prev) }}
              >Очистить</button>
            </>)}
            <button className="px-2 py-1 rounded text-xs cursor-pointer" style={{ color: 'var(--cc-text-dimmer)' }}
              onClick={() => setNotifLogModal(null)}
            >✕</button>
          </div>
        </div>

        {/* Фильтры для Pipeline вкладки */}
        {notifLogTab === 'trace' && (
          <div className="flex items-center gap-1 px-4 py-1.5" style={{ borderBottom: '1px solid var(--cc-border)', backgroundColor: 'rgba(0,0,0,0.15)' }}>
            <span className="text-[10px] mr-1" style={{ color: 'var(--cc-text-dimmer)' }}>Фильтр:</span>
            {[['all', 'Все'], ['block', 'Блокировки'], ['hook-blocked', `Hook-блок${hookBlockedCount ? ' (' + hookBlockedCount + ')' : ''}`], ['source', 'Источники'], ['decision', 'Решения']].map(([f, label]) => (
              <button key={f} className="px-2 py-0.5 rounded text-[10px] cursor-pointer" style={{
                backgroundColor: traceFilter === f ? 'rgba(96,165,250,0.2)' : 'transparent',
                color: traceFilter === f ? '#60a5fa' : 'var(--cc-text-dimmer)',
                border: traceFilter === f ? '1px solid rgba(96,165,250,0.3)' : '1px solid transparent',
              }} onClick={() => setTraceFilter(f)}>{label}</button>
            ))}
          </div>
        )}

        {/* Контент: Лог или Pipeline */}
        <div className="flex-1 overflow-auto px-2 py-1" style={{ fontSize: '12px' }}>
          {notifLogTab === 'log' ? (
            /* ── Вкладка: Лог уведомлений (как было) ── */
            notifLogModal.log.length === 0 ? (
              <div className="flex items-center justify-center h-32" style={{ color: 'var(--cc-text-dimmer)' }}>
                Нет записей. Уведомления появятся после получения сообщений.
              </div>
            ) : (
              <table className="w-full" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '68px' }} />
                  <col style={{ width: '76px' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '44px' }} />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--cc-border)', color: 'var(--cc-text-dimmer)' }}>
                    <th className="text-left px-2 py-1.5 font-medium">Время</th>
                    <th className="text-left px-2 py-1.5 font-medium">Статус</th>
                    <th className="text-left px-2 py-1.5 font-medium">Заголовок</th>
                    <th className="text-left px-2 py-1.5 font-medium">Текст сообщения</th>
                    <th className="text-left px-2 py-1.5 font-medium">Отправитель</th>
                    <th className="text-left px-2 py-1.5 font-medium">Блок</th>
                    <th className="text-center px-1 py-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...notifLogModal.log].reverse().map((entry, idx) => {
                    const time = new Date(entry.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    const isPassed = entry.status === 'passed'
                    const reasonLabels = { empty: 'Пустое', system: 'Системное', outgoing: 'Исходящее' }
                    const enriched = entry.enrichedTitle && entry.enrichedTitle !== entry.title ? entry.enrichedTitle : ''
                    return (
                      <tr key={idx} className="cc-notif-row" style={{
                        borderBottom: '1px solid var(--cc-border)',
                        backgroundColor: isPassed ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                      }}>
                        <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: 'var(--cc-text-dimmer)' }}>{time}</td>
                        <td className="px-2 py-1.5">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium" style={{
                            backgroundColor: isPassed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                            color: isPassed ? '#4ade80' : '#f87171',
                          }}>{isPassed ? 'ПОКАЗАНО' : 'ЗАБЛОК.'}</span>
                        </td>
                        <td className="px-2 py-1.5 overflow-hidden">
                          <div className="truncate cursor-default"
                            onMouseEnter={e => { if (entry.title) setCellTooltip({ text: entry.title, x: e.clientX, y: e.clientY }) }}
                            onMouseLeave={() => setCellTooltip(null)}
                          >{entry.title || '—'}</div>
                        </td>
                        <td className="px-2 py-1.5 overflow-hidden">
                          <div className="truncate cursor-default"
                            onMouseEnter={e => { if (entry.body) setCellTooltip({ text: entry.body, x: e.clientX, y: e.clientY }) }}
                            onMouseLeave={() => setCellTooltip(null)}
                          >{entry.body || '—'}</div>
                        </td>
                        <td className="px-2 py-1.5 overflow-hidden" style={{ color: enriched ? '#60a5fa' : 'inherit' }}>
                          <div className="truncate cursor-default"
                            onMouseEnter={e => { if (enriched) setCellTooltip({ text: enriched, x: e.clientX, y: e.clientY }) }}
                            onMouseLeave={() => setCellTooltip(null)}
                          >{enriched || '—'}</div>
                        </td>
                        <td className="px-2 py-1.5 overflow-hidden" style={{ color: '#f87171' }}>
                          <span className="truncate block">{reasonLabels[entry.reason] || entry.reason || ''}</span>
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          {isPassed && (entry.title || enriched) && (
                            <button className="px-1 py-0.5 rounded text-[10px] cursor-pointer"
                              style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: 'none' }}
                              title={'Перейти к чату: ' + (enriched || entry.title)}
                              onClick={() => {
                                const mid = notifLogModal.messengerId
                                const wv = webviewRefs.current[mid]
                                if (!wv) return
                                const url = wv.getURL?.() || ''
                                const name = enriched || entry.title
                                const script = buildChatNavigateScript(url, name, entry.tag || '')
                                if (script) {
                                  wv.executeJavaScript(script).then(r => {
                                    const ok = r === true || (r && r.ok)
                                    console.log('[GoChat:log]', ok ? 'OK' : 'FAIL', r)
                                  }).catch(e => console.log('[GoChat:log] err', e.message))
                                }
                                setNotifLogModal(null)
                              }}
                            >&#8594;</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          ) : notifLogTab === 'trace' ? (
            /* ── Вкладка: Pipeline Trace ── */
            traceData.length === 0 ? (
              <div className="flex items-center justify-center h-32" style={{ color: 'var(--cc-text-dimmer)' }}>
                Нет трассировок. Отправьте сообщение в мессенджер и смотрите как оно проходит через pipeline.
              </div>
            ) : (
              <table className="w-full" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '70px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '72px' }} />
                  <col style={{ width: '22%' }} />
                  <col />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--cc-border)', color: 'var(--cc-text-dimmer)' }}>
                    <th className="text-left px-2 py-1.5 font-medium">Время</th>
                    <th className="text-left px-2 py-1.5 font-medium">Мессенджер</th>
                    <th className="text-left px-2 py-1.5 font-medium">Шаг</th>
                    <th className="text-left px-2 py-1.5 font-medium">Статус</th>
                    <th className="text-left px-2 py-1.5 font-medium">Текст</th>
                    <th className="text-left px-2 py-1.5 font-medium">Детали</th>
                  </tr>
                </thead>
                <tbody>
                  {[...traceData].reverse().map((entry, idx) => {
                    const time = new Date(entry.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
                    const color = traceTypeColors[entry.type] || '#94a3b8'
                    return (
                      <tr key={idx} style={{
                        borderBottom: '1px solid var(--cc-border)',
                        backgroundColor: entry.type === 'block' ? 'rgba(239,68,68,0.06)' : entry.type === 'pass' ? 'rgba(34,197,94,0.04)' : 'transparent',
                      }}>
                        <td className="px-2 py-1 whitespace-nowrap font-mono text-[10px]" style={{ color: 'var(--cc-text-dimmer)' }}>{time}</td>
                        <td className="px-2 py-1 overflow-hidden">
                          <span className="truncate block text-[10px] font-medium" style={{ color: '#60a5fa' }}>{entry.mName || '—'}</span>
                        </td>
                        <td className="px-2 py-1">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium" style={{
                            backgroundColor: 'rgba(148,163,184,0.1)', color: 'var(--cc-text-dim)',
                          }}>{traceStepLabels[entry.step] || entry.step}</span>
                        </td>
                        <td className="px-2 py-1">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold" style={{
                            backgroundColor: `${color}20`, color,
                          }}>{traceTypeLabels[entry.type] || entry.type}</span>
                        </td>
                        <td className="px-2 py-1 overflow-hidden">
                          <div className="truncate cursor-default text-[11px]"
                            onMouseEnter={e => { if (entry.text) setCellTooltip({ text: entry.text, x: e.clientX, y: e.clientY }) }}
                            onMouseLeave={() => setCellTooltip(null)}
                          >{entry.text || '—'}</div>
                        </td>
                        <td className="px-2 py-1 overflow-hidden">
                          <div className="truncate cursor-default text-[11px]" style={{ color: 'var(--cc-text-dim)' }}
                            onMouseEnter={e => { if (entry.detail) setCellTooltip({ text: entry.detail, x: e.clientX, y: e.clientY }) }}
                            onMouseLeave={() => setCellTooltip(null)}
                          >{entry.detail || ''}</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          ) : null}
        </div>

        {/* Per-messenger спам-фильтр (v0.56.0) */}
        {notifLogTab === 'trace' && (() => {
          const mid = notifLogModal.messengerId
          const mn = (settings.messengerNotifs || {})[mid] || {}
          return (
            <div className="flex items-center gap-2 px-4 py-1.5 text-[11px]" style={{ borderTop: '1px solid var(--cc-border)', backgroundColor: 'rgba(0,0,0,0.1)' }}>
              <span style={{ color: 'var(--cc-text-dimmer)', whiteSpace: 'nowrap' }}>Доп. спам-фильтр (regex):</span>
              <input
                className="flex-1 px-2 py-0.5 rounded text-[11px]"
                style={{ backgroundColor: 'var(--cc-hover)', color: 'var(--cc-text)', border: '1px solid var(--cc-border)', outline: 'none', fontFamily: 'monospace' }}
                placeholder="напр: ^(привет|тест)$"
                defaultValue={mn.spamFilter || ''}
                onBlur={e => {
                  const val = e.target.value.trim()
                  // Проверяем что regex валиден
                  if (val) { try { new RegExp(val, 'i') } catch { e.target.style.borderColor = '#f87171'; return } }
                  e.target.style.borderColor = 'var(--cc-border)'
                  setSettings(prev => ({
                    ...prev,
                    messengerNotifs: { ...(prev.messengerNotifs || {}), [mid]: { ...((prev.messengerNotifs || {})[mid] || {}), spamFilter: val } }
                  }))
                  window.api?.invoke('settings:save', { messengerNotifs: { ...(settings.messengerNotifs || {}), [mid]: { ...((settings.messengerNotifs || {})[mid] || {}), spamFilter: val } } })
                }}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
              />
              <span style={{ color: 'var(--cc-text-dimmer)', whiteSpace: 'nowrap' }}>{mn.spamFilter ? '✓ активен' : 'не задан'}</span>
            </div>
          )
        })()}
        {/* v0.77.6: Вкладки диагностик */}
        {notifLogTab === 'domScan' && (
          <div className="flex-1 overflow-auto px-4 py-2" style={{ fontSize: '12px' }}>
            {notifLogModal.domScanData ? (
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--cc-text-dim)', lineHeight: '1.5' }}>
                {JSON.stringify(notifLogModal.domScanData, null, 2)}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-32" style={{ color: 'var(--cc-text-dimmer)' }}>
                Загрузка DOM-структуры...
              </div>
            )}
          </div>
        )}
        {notifLogTab === 'diagFull' && (
          <div className="flex-1 overflow-auto px-4 py-2" style={{ fontSize: '12px' }}>
            {notifLogModal.diagFullData ? (
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--cc-text-dim)', lineHeight: '1.5' }}>
                {JSON.stringify(notifLogModal.diagFullData, null, 2)}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-32" style={{ color: 'var(--cc-text-dimmer)' }}>
                Загрузка данных хранилища...
              </div>
            )}
          </div>
        )}
        {notifLogTab === 'diagAccount' && (
          <div className="flex-1 overflow-auto px-4 py-2" style={{ fontSize: '12px' }}>
            {notifLogModal.diagAccountData ? (
              <div>
                {/* v0.80.4: Поддержка двух форматов — steps (старый) и name (новый) */}
                {notifLogModal.diagAccountData.name ? (
                  <div className="px-4 py-3">
                    <div className="text-lg font-semibold" style={{ color: '#60a5fa' }}>{notifLogModal.diagAccountData.name}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--cc-text-dimmer)' }}>Тип: {notifLogModal.diagAccountData.type || 'unknown'} | Скрипт: {notifLogModal.diagAccountData.script || '—'}</div>
                    {notifLogModal.diagAccountData.error && <div className="text-xs mt-1" style={{ color: '#f87171' }}>Ошибка: {notifLogModal.diagAccountData.error}</div>}
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--cc-border)' }}>Шаг</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--cc-border)' }}>Значение</th>
                    </tr></thead>
                    <tbody>
                      {(notifLogModal.diagAccountData.steps || []).map((s, i) => (
                        <tr key={i}><td style={{ padding: '4px 8px', borderBottom: '1px solid var(--cc-border)', color: '#60a5fa' }}>{s.step}</td><td style={{ padding: '4px 8px', borderBottom: '1px solid var(--cc-border)' }}>{s.value || s.text || (s.found ? '✅' : '❌')}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32" style={{ color: 'var(--cc-text-dimmer)' }}>
                Загрузка данных аккаунта...
              </div>
            )}
          </div>
        )}
        {/* Легенда */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[11px]" style={{ borderTop: '1px solid var(--cc-border)', color: 'var(--cc-text-dimmer)' }}>
          {notifLogTab === 'log' ? (<>
            <span><span style={{ color: '#4ade80' }}>ПОКАЗАНО</span> — отправлено в ribbon</span>
            <span><span style={{ color: '#f87171' }}>ЗАБЛОК.</span> — спам/исходящее</span>
            <span><span style={{ color: '#60a5fa' }}>Отправитель</span> — имя из DOM чата</span>
            <span>До 100 записей · Растянуть ↘</span>
          </>) : notifLogTab === 'trace' ? (<>
            <span><span style={{ color: '#4ade80' }}>ПРОПУЩЕН</span> — шаг пройден</span>
            <span><span style={{ color: '#f87171' }}>БЛОК</span> — уведомление остановлено</span>
            <span><span style={{ color: '#fbbf24' }}>ВНИМАНИЕ</span> — проблема обогащения</span>
            <span><span style={{ color: '#94a3b8' }}>ИНФО</span> — этап pipeline</span>
            <span>До 300 записей · Растянуть ↘</span>
          </>) : (<>
            <span>Данные скопированы в буфер обмена · Ctrl+V чтобы вставить</span>
          </>)}
        </div>
      </div>
    </div>
  )
}
