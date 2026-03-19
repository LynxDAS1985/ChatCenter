// v0.39.0 — Кастомные уведомления Messenger Ribbon
import { useState, useEffect, useRef, useCallback } from 'react'
import { DEFAULT_MESSENGERS } from './constants.js'
import AddMessengerModal from './components/AddMessengerModal.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import AISidebar from './components/AISidebar.jsx'
import TemplatesPanel from './components/TemplatesPanel.jsx'
import AutoReplyPanel from './components/AutoReplyPanel.jsx'

// ─── Звуковое уведомление (Web Audio API) ─────────────────────────────────
// Уникальная тональность для каждого мессенджера по цвету

const MESSENGER_SOUNDS = {
  '#2AABEE': { f1: 1047, f2: 1319, type: 'sine' },       // Telegram — C6 + E6 (яркий, восходящий)
  '#25D366': { f1: 784,  f2: 1175, type: 'sine' },       // WhatsApp — G5 + D6 (тёплый, мягкий)
  '#4C75A3': { f1: 659,  f2: 880,  type: 'triangle' },   // VK — E5 + A5 (мягкий, классический)
  '#E1306C': { f1: 988,  f2: 1397, type: 'sine' },       // Instagram — B5 + F6 (энергичный)
  '#5865F2': { f1: 740,  f2: 1109, type: 'triangle' },   // Discord — F#5 + C#6 (глубокий)
  '#7360F2': { f1: 831,  f2: 1245, type: 'sine' },       // Viber — G#5 + D#6
  '#00AAFF': { f1: 880,  f2: 1320, type: 'sine' },       // Авито — A5 + E6
  '#A855F7': { f1: 932,  f2: 1175, type: 'triangle' },   // Wildberries — A#5 + D6
  '#005BFF': { f1: 698,  f2: 1047, type: 'sine' },       // Ozon — F5 + C6
  '#2688EB': { f1: 784,  f2: 1047, type: 'triangle' },   // Макс — G5 + C6 (мягкий, свежий)
}

function getSoundForColor(color) {
  if (color && MESSENGER_SOUNDS[color]) return MESSENGER_SOUNDS[color]
  // Для незнакомого цвета — генерируем частоты из хэша цвета
  let hash = 0
  for (let i = 0; i < (color || '').length; i++) hash = ((hash << 5) - hash + color.charCodeAt(i)) | 0
  const f1 = 600 + Math.abs(hash % 500)         // 600–1100 Hz
  const f2 = f1 + 200 + Math.abs((hash >> 8) % 300) // f1+200..f1+500 Hz
  return { f1, f2, type: Math.abs(hash) % 2 === 0 ? 'sine' : 'triangle' }
}

function playNotificationSound(color) {
  try {
    const { f1, f2, type } = getSoundForColor(color)
    const ctx = new AudioContext()
    const t = ctx.currentTime
    // Нота 1
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = type
    osc1.frequency.value = f1
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    gain1.gain.setValueAtTime(0.15, t)
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    osc1.start(t)
    osc1.stop(t + 0.12)
    // Нота 2 (с задержкой)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = type
    osc2.frequency.value = f2
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    gain2.gain.setValueAtTime(0, t)
    gain2.gain.setValueAtTime(0.12, t + 0.08)
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.23)
    osc2.start(t + 0.08)
    osc2.stop(t + 0.23)
  } catch {}
}

// ─── Компонент вкладки мессенджера ────────────────────────────────────────

function MessengerTab({
  messenger: m, isActive, accountInfo, unreadCount, isNew,
  unreadSplit, messagePreview, zoomLevel, monitorStatus, isPageLoading, isPinned,
  onClick, onClose, onContextMenu, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd
}) {
  const [hovered, setHovered] = useState(false)
  const [badgePulse, setBadgePulse] = useState(false)
  const [showReadCheck, setShowReadCheck] = useState(false)
  const [flipAnim, setFlipAnim] = useState(false) // v0.74.2: flip при изменении числа
  const prevCountRef = useRef(0)

  // Анимация бейджа при изменении счётчика непрочитанных
  useEffect(() => {
    if (unreadCount > prevCountRef.current && prevCountRef.current >= 0) {
      setBadgePulse(true)
      setFlipAnim(true)
      const t1 = setTimeout(() => setBadgePulse(false), 500)
      const t2 = setTimeout(() => setFlipAnim(false), 300)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    // v0.74.1: Зелёная галочка при прочтении — count упал с >0 до 0
    if (unreadCount === 0 && prevCountRef.current > 0) {
      setShowReadCheck(true)
      const t = setTimeout(() => setShowReadCheck(false), 2000)
      return () => clearTimeout(t)
    }
    // v0.74.2: Flip при уменьшении числа (но не до 0)
    if (unreadCount > 0 && unreadCount < prevCountRef.current) {
      setFlipAnim(true)
      const t = setTimeout(() => setFlipAnim(false), 300)
      return () => clearTimeout(t)
    }
    prevCountRef.current = unreadCount
  }, [unreadCount])
  // Обновляем ref и вне условия (когда count уменьшается)
  useEffect(() => { prevCountRef.current = unreadCount }, [unreadCount])

  // Формируем тултип бейджа с детализацией
  const badgeTooltip = unreadSplit
    ? `Непрочитанных: ${unreadCount}\n💬 Личные: ${unreadSplit.personal}\n📢 Каналы/группы: ${unreadSplit.channels}`
    : `Непрочитанных: ${unreadCount}`

  return (
    <button
      draggable
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver() }}
      onDrop={e => { e.preventDefault(); onDrop() }}
      onDragEnd={onDragEnd}
      title={accountInfo ? `${m.name} — ${accountInfo}` : m.name}
      className="relative flex items-center justify-center gap-1.5 h-[40px] px-3 cursor-pointer transition-all duration-150"
      style={{
        minWidth: 130,
        backgroundColor: isActive ? `${m.color}1A` : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        borderBottom: isActive ? `2px solid ${m.color}` : '2px solid transparent',
        borderRadius: '6px 6px 0 0',
        outline: isDragOver ? `2px dashed ${m.color}66` : 'none',
        outlineOffset: '-2px',
      }}
    >
      {/* Цветная точка: 🟢=активен 🟡=загрузка 🔴=ошибка + ping при новом сообщении */}
      <span className="relative inline-flex w-2 h-2 shrink-0"
        title={monitorStatus === 'active' ? 'Мониторинг активен' : monitorStatus === 'loading' ? 'Загрузка монитора...' : monitorStatus === 'error' ? 'Монитор не отвечает' : ''}
      >
        {isNew && !isActive && (
          <span
            className="animate-ping absolute inset-0 rounded-full"
            style={{ backgroundColor: m.color, opacity: 0.6 }}
          />
        )}
        <span
          className="relative w-2 h-2 rounded-full block transition-all duration-150"
          style={{
            backgroundColor: monitorStatus === 'error' ? '#ef4444'
              : monitorStatus === 'loading' ? '#eab308'
              : isActive ? m.color : `${m.color}55`
          }}
        />
      </span>

      {/* Название + зум + аккаунт */}
      <span className="flex flex-col items-center leading-tight">
        <span className="flex items-center gap-1">
          <span
            className="text-sm font-medium whitespace-nowrap transition-colors duration-150 flex items-center gap-0.5"
            style={{ color: isActive ? m.color : 'var(--cc-text-dim)' }}
          >
            {isPinned && <span className="text-[9px] opacity-50" title="Закреплена">📌</span>}
            {m.name}
          </span>
          {zoomLevel && zoomLevel !== 100 && (
            <span
              className="text-[9px] leading-none px-1 py-0.5 rounded font-bold"
              style={{ color: m.color, backgroundColor: `${m.color}20` }}
              title={`Масштаб: ${zoomLevel}%`}
            >{zoomLevel}%</span>
          )}
        </span>
        {messagePreview ? (
          <span
            className="text-[10px] whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis leading-tight"
            style={{ color: m.color }}
          >
            💬 {messagePreview}
          </span>
        ) : accountInfo ? (
          <span
            className="text-[10px] whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis leading-tight opacity-60"
            style={{ color: 'var(--cc-text-dimmer)' }}
          >
            {accountInfo}
          </span>
        ) : null}
      </span>

      {/* Бейдж непрочитанных / кнопка закрыть (hover) / замок (pinned) */}
      {/* v0.60.0: фиксированная ширина области — название не дёргается при hover */}
      <span className="ml-auto min-w-[20px] flex items-center justify-end shrink-0">
        {hovered && !isPinned ? (
          <span
            onClick={e => { e.stopPropagation(); onClose() }}
            className="w-[16px] h-[16px] rounded-full flex items-center justify-center text-[10px] leading-none cursor-pointer transition-all shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
            title="Закрыть вкладку"
          >✕</span>
        ) : unreadCount > 0 ? (
          unreadSplit && unreadSplit.personal > 0 && unreadSplit.channels > 0 ? (
            // Два бейджа: личные (цвет мессенджера) + каналы (серый)
            <span className="flex flex-col gap-0.5 items-end shrink-0" title={badgeTooltip}>
              <span
                className="min-w-[15px] h-[14px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none"
                style={{ backgroundColor: m.color, overflow: 'hidden', animation: isNew ? 'bounce 0.6s ease 3' : badgePulse ? 'badgePulse 0.4s ease' : 'none' }}
              ><span style={{ animation: flipAnim ? 'flipIn 0.3s ease' : 'none', display: 'inline-block' }}>💬{unreadSplit.personal > 99 ? '99+' : unreadSplit.personal}</span></span>
              <span
                className="min-w-[15px] h-[14px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none"
                style={{ backgroundColor: '#6b7280', overflow: 'hidden', animation: badgePulse ? 'badgePulse 0.4s ease' : 'none' }}
              ><span style={{ animation: flipAnim ? 'flipIn 0.3s ease' : 'none', display: 'inline-block' }}>📢{unreadSplit.channels > 99 ? '99+' : unreadSplit.channels}</span></span>
            </span>
          ) : (
            // Один общий бейдж с flip-анимацией
            <span
              className="min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shrink-0"
              style={{
                animation: isNew ? 'bounce 0.6s ease 3' : badgePulse ? 'badgePulse 0.4s ease' : 'none',
                overflow: 'hidden',
              }}
              title={badgeTooltip}
            >
              <span style={{ animation: flipAnim ? 'flipIn 0.3s ease' : 'none', display: 'inline-block' }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            </span>
          )
        ) : showReadCheck ? (
          // v0.74.1: Зелёная галочка — подтверждение что сообщения прочитаны (2 сек)
          <span
            className="w-[16px] h-[16px] rounded-full flex items-center justify-center text-[10px] leading-none shrink-0"
            style={{
              backgroundColor: '#22c55e22',
              color: '#22c55e',
              animation: 'badgePulse 0.4s ease',
            }}
            title="Все сообщения прочитаны"
          >✓</span>
        ) : null}
      </span>

      {/* Прогресс-бар загрузки страницы */}
      {isPageLoading && (
        <span
          className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden"
          style={{ borderRadius: '0 0 0 0' }}
        >
          <span
            className="block h-full"
            style={{
              background: `linear-gradient(90deg, transparent, ${m.color}, transparent)`,
              animation: 'tabLoading 1.2s ease-in-out infinite',
            }}
          />
        </span>
      )}
    </button>
  )
}

// ─── Навигация к чату в WebView по клику на ribbon ───────────────────────

function buildChatNavigateScript(url, senderName, chatTag) {
  const nameJson = JSON.stringify(senderName || '')

  // Telegram Web K
  if (url.includes('telegram.org')) {
    return `(function() {
      try {
        var log = [];
        ${chatTag ? `
        var tag = ${JSON.stringify(chatTag)};
        log.push('tag=' + tag);
        var peerId = tag.replace(/^peer\\d+_/, '').replace(/[^0-9-]/g, '');
        log.push('peerId=' + peerId);
        if (peerId) {
          // Метод 1: data-peer-id в DOM (если чат видим в виртуальном списке)
          var el = document.querySelector('[data-peer-id="' + peerId + '"]');
          if (!el) el = document.querySelector('[data-peer-id="-' + peerId + '"]');
          log.push('domFound=' + !!el);
          if (el) {
            var chat = el.closest('.chatlist-chat') || el;
            chat.click();
            return {ok:true, method:'tag-dom', log:log.join(', ')};
          }
          // Метод 2: Telegram Web K внутренняя навигация через appImManager
          // Telegram peer types: 1=user, 2=chat, 4/5=channel
          try {
            var peerType = 0;
            var m = tag.match(/^peer(\\d+)_/);
            if (m) peerType = parseInt(m[1]);
            // Для каналов (type 4/5): peerId в Web K = -100XXXX (supergroup/channel формат)
            var navId = peerId;
            if (peerType >= 4 && navId.charAt(0) !== '-') navId = '-100' + navId;
            else if (peerType === 2 && navId.charAt(0) !== '-') navId = '-' + navId;
            log.push('peerType=' + peerType + ',navId=' + navId);
            // Попробуем через DOM с navId
            var el2 = document.querySelector('[data-peer-id="' + navId + '"]');
            if (el2) {
              var chat2 = el2.closest('.chatlist-chat') || el2;
              chat2.click();
              return {ok:true, method:'tag-navId', log:log.join(', ')};
            }
          } catch(pe) { log.push('peerErr=' + pe.message); }
        }` : ''}
        var name = ${nameJson};
        log.push('name=' + JSON.stringify(name));
        if (!name) return {ok:false, method:'noName', log:log.join(', ')};
        var all = document.querySelectorAll('.chatlist-chat .peer-title');
        log.push('count=' + all.length);
        var samples = [];
        for (var i = 0; i < Math.min(all.length, 8); i++) samples.push(all[i].textContent.trim().slice(0,40));
        log.push('samples=' + JSON.stringify(samples));
        // 1) Exact match
        for (var i = 0; i < all.length; i++) {
          if (all[i].textContent.trim() === name) {
            var chat = all[i].closest('.chatlist-chat');
            if (chat) { chat.click(); return {ok:true, method:'exact', idx:i, log:log.join(', ')}; }
          }
        }
        // 2) Case-insensitive
        var nameLow = name.toLowerCase();
        for (var i = 0; i < all.length; i++) {
          if (all[i].textContent.trim().toLowerCase() === nameLow) {
            var chat = all[i].closest('.chatlist-chat');
            if (chat) { chat.click(); return {ok:true, method:'icase', idx:i, log:log.join(', ')}; }
          }
        }
        // 3) Partial/contains match
        for (var i = 0; i < all.length; i++) {
          var t = all[i].textContent.trim();
          if (t && name.length > 3 && (t.indexOf(name) >= 0 || name.indexOf(t) >= 0)) {
            var chat = all[i].closest('.chatlist-chat');
            if (chat) { chat.click(); return {ok:true, method:'partial', matched:t.slice(0,40), log:log.join(', ')}; }
          }
        }
        // 4) Extra selectors fallback
        var extra = document.querySelectorAll('[class*="chatlist"] [class*="title"], .dialog-title, .user-title, [class*="peer-title"]');
        log.push('extra=' + extra.length);
        for (var i = 0; i < extra.length; i++) {
          var t = extra[i].textContent.trim();
          if (t === name || (t && name.length > 3 && (t.indexOf(name) >= 0 || name.indexOf(t) >= 0))) {
            var chat = extra[i].closest('.chatlist-chat') || extra[i].closest('a') || extra[i].closest('li') || extra[i].closest('[data-peer-id]');
            if (chat) { chat.click(); return {ok:true, method:'extra', log:log.join(', ')}; }
          }
        }
        return {ok:false, method:'notFound', log:log.join(', ')};
      } catch(e) { return {ok:false, method:'error', err:e.message}; }
    })();`
  }

  // MAX (web.max.ru) — SvelteKit, sidebar = <nav class="navigation svelte-xxx">
  if (url.includes('max.ru')) {
    return `(function() {
      try {
        var log = [];
        var name = ${nameJson};
        log.push('name=' + JSON.stringify(name));
        if (!name) return {ok:false, method:'noName', log:log.join(', ')};

        function scrollDown() {
          setTimeout(function() {
            var h = document.querySelector('.history') || document.querySelector('[class*="history"]') || document.querySelector('[class*="messages-container"]');
            if (h) { h.scrollTop = h.scrollHeight; }
          }, 300);
        }

        var nameLow = name.toLowerCase();

        // Метод A: nav + a[href] — ищем ссылку в sidebar содержащую имя отправителя
        var nav = document.querySelector('nav') || document.querySelector('[class*="navigation"]');
        if (nav) {
          log.push('nav=' + nav.className.slice(0,40));
          var links = nav.querySelectorAll('a[href]');
          log.push('links=' + links.length);
          // samples первых 5 ссылок для диагностики
          var samples = [];
          for (var j = 0; j < Math.min(links.length, 5); j++) {
            samples.push({t: links[j].textContent.trim().slice(0,30), h: links[j].getAttribute('href')});
          }
          log.push('samples=' + JSON.stringify(samples));

          // Exact match
          for (var i = 0; i < links.length; i++) {
            var t = links[i].textContent.trim();
            if (t === name) { links[i].click(); scrollDown(); return {ok:true, method:'nav-link-exact', log:log.join(', ')}; }
          }
          // Case-insensitive match
          for (var i = 0; i < links.length; i++) {
            var t = links[i].textContent.trim().toLowerCase();
            if (t === nameLow) { links[i].click(); scrollDown(); return {ok:true, method:'nav-link-icase', log:log.join(', ')}; }
          }
          // Partial: имя содержится в тексте ссылки
          for (var i = 0; i < links.length; i++) {
            var t = links[i].textContent.trim();
            if (t && name.length > 2 && t.toLowerCase().indexOf(nameLow) >= 0) {
              links[i].click(); scrollDown();
              return {ok:true, method:'nav-link-partial', log:log.join(', ')};
            }
          }
        } else {
          log.push('nav=null');
        }

        // Метод B: все a[href] на странице (вне nav)
        var allLinks = document.querySelectorAll('a[href]');
        log.push('allLinks=' + allLinks.length);
        for (var i = 0; i < allLinks.length; i++) {
          var t = allLinks[i].textContent.trim();
          if (t && t.length < 80 && name.length > 2 && t.toLowerCase().indexOf(nameLow) >= 0) {
            var href = allLinks[i].getAttribute('href') || '';
            if (href && href !== '#' && !href.startsWith('javascript')) {
              allLinks[i].click(); scrollDown();
              return {ok:true, method:'any-link', log:log.join(', ')};
            }
          }
        }

        // Метод C: TreeWalker — ищем любой кликабельный элемент с именем
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while (node = walker.nextNode()) {
          var txt = node.textContent.trim();
          if (txt && txt.length > 2 && txt.length < 80 && txt.toLowerCase().indexOf(nameLow) >= 0) {
            var el = node.parentElement;
            if (el && el.offsetHeight > 0 && el.offsetHeight < 80) {
              var clickTarget = el.closest('a[href]') || el.closest('li') || el.closest('[role="listitem"]') || el;
              clickTarget.click(); scrollDown();
              return {ok:true, method:'tree-click', log:log.join(', ')};
            }
          }
        }

        // Метод D: scroll fallback — если чат уже открыт, прокрутить вниз
        log.push('url=' + window.location.href.slice(0,60));
        scrollDown();
        return {ok:false, method:'notFound', log:log.join(', ')};
      } catch(e) { return {ok:false, method:'error', err:e.message}; }
    })();`
  }

  // WhatsApp Web
  if (url.includes('whatsapp.com')) {
    return `(function() {
      try {
        var name = ${nameJson};
        if (!name) return false;
        var spans = document.querySelectorAll('span[title]');
        for (var i = 0; i < spans.length; i++) {
          if (spans[i].getAttribute('title') === name) {
            var row = spans[i].closest('[data-testid="cell-frame-container"]') || spans[i].closest('[tabindex]') || spans[i].closest('[role="listitem"]');
            if (row) { row.click(); return true; }
          }
        }
        // Fuzzy: проверяем partial match (имя может быть обрезано в Notification)
        for (var i = 0; i < spans.length; i++) {
          var t = spans[i].getAttribute('title') || '';
          if (t && name.length > 3 && (t.startsWith(name) || name.startsWith(t))) {
            var row = spans[i].closest('[data-testid="cell-frame-container"]') || spans[i].closest('[tabindex]') || spans[i].closest('[role="listitem"]');
            if (row) { row.click(); return true; }
          }
        }
        return false;
      } catch(e) { return false; }
    })();`
  }

  // VK
  if (url.includes('vk.com')) {
    return `(function() {
      try {
        var name = ${nameJson};
        if (!name) return false;
        var els = document.querySelectorAll('.im_dialog_peer, [class*="ConversationHeader__name"], [class*="PeerName"]');
        for (var i = 0; i < els.length; i++) {
          if (els[i].textContent.trim() === name) {
            var row = els[i].closest('a, li, [role="listitem"], [class*="dialog"]');
            if (row) { row.click(); return true; }
          }
        }
        return false;
      } catch(e) { return false; }
    })();`
  }

  // Generic fallback — поиск по имени
  if (!senderName) return null
  return `(function() {
    try {
      var name = ${nameJson};
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (walker.currentNode.textContent.trim() === name) {
          var el = walker.currentNode.parentElement.closest('a, li, [role="listitem"], [tabindex]');
          if (el) { el.click(); return true; }
        }
      }
      return false;
    } catch(e) { return false; }
  })();`
}

// ─── Главный компонент ────────────────────────────────────────────────────

export default function App() {
  const [messengers, setMessengers] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [accountInfo, setAccountInfo] = useState({})
  const [unreadCounts, setUnreadCounts] = useState({})
  const [unreadSplit, setUnreadSplit] = useState({})       // { [id]: { personal, channels } }
  const [monitorDiag, setMonitorDiag] = useState(null)     // диагностика DOM от monitor.preload
  const [monitorStatus, setMonitorStatus] = useState({})   // { [id]: 'loading'|'active'|'error' }
  const [statusBarMsg, setStatusBarMsg] = useState(null)   // последнее сообщение для статусбара
  const [messagePreview, setMessagePreview] = useState({}) // { [id]: 'текст превью' }
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingMessenger, setEditingMessenger] = useState(null) // v0.62.6: редактирование вкладки
  const [showSettings, setShowSettings] = useState(false)
  const [showAI, setShowAI] = useState(true)
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [settings, setSettings] = useState({ soundEnabled: true, minimizeToTray: true, theme: 'dark' })
  const [dragOverId, setDragOverId] = useState(null)
  const [monitorPreloadUrl, setMonitorPreloadUrl] = useState(null)
  const [appReady, setAppReady] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)
  const [aiWidth, setAiWidth] = useState(300)
  const [chatHistory, setChatHistory] = useState([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [showAutoReply, setShowAutoReply] = useState(false)
  const [stats, setStats] = useState({ today: 0, autoToday: 0, total: 0, date: '' })
  const [newMessageIds, setNewMessageIds] = useState(new Set())
  const [isResizing, setIsResizing] = useState(false)
  const [zoomLevels, setZoomLevels] = useState({})
  const [zoomEditing, setZoomEditing] = useState(false)
  const [zoomInputValue, setZoomInputValue] = useState('')
  const [confirmClose, setConfirmClose] = useState(null) // { id, name, color }
  const [webviewLoading, setWebviewLoading] = useState({}) // { [id]: true/false } — загружается ли страница WebView

  const webviewRefs = useRef({})
  const notifReadyRef = useRef({})   // { [id]: true } — warm-up: игнорируем ВСЕ уведомления первые 30 сек
  const notifDedupRef = useRef(new Map()) // дедупликация __CC_NOTIF__ — messengerId:normalizedBody → timestamp
  const pipelineTraceRef = useRef([]) // Pipeline Trace Logger — трассировка ВСЕХ шагов уведомлений
  const pendingMsgRef = useRef(new Map()) // { messengerId:text → { timer, messengerId, text } } — ожидание enriched __CC_NOTIF__ 200мс
  const senderCacheRef = useRef({}) // { [messengerId]: { name, avatar, ts } } — кэш sender при неудачном enrichment (до 5 мин)
  const retryTimers = useRef({})
  const previewTimers = useRef({})
  const saveTimer = useRef(null)
  const searchInputRef = useRef(null)
  const dragStartId = useRef(null)
  const settingsRef = useRef(settings)
  const activeIdRef = useRef(activeId)
  const messengersRef = useRef(messengers)
  const isResizingRef = useRef(false)
  const resizeStartRef = useRef({ x: 0, w: 300 })
  const windowFocusedRef = useRef(true) // IPC window-state: main process сообщает о focus/blur
  const aiWidthRef = useRef(300)
  const aiPanelRef = useRef(null)
  const zoomLevelsRef = useRef({})
  const zoomInputRef = useRef(null)
  const statusBarMsgTimer = useRef(null)
  const tabContextMenu = useRef({ id: null, x: 0, y: 0 })
  const [contextMenuTab, setContextMenuTab] = useState(null) // { id, x, y }
  const [notifLogModal, setNotifLogModal] = useState(null) // { messengerId, name, log: [], trace: [] } | null
  const [notifLogTab, setNotifLogTab] = useState('log') // 'log' | 'trace'
  const [traceFilter, setTraceFilter] = useState('all') // 'all' | 'block' | 'source' | 'decision'
  const [cellTooltip, setCellTooltip] = useState(null) // { text, x, y } | null
  const statsRef = useRef({ today: 0, autoToday: 0, total: 0, date: '' })
  const statsSaveTimer = useRef(null)
  const zoomSaveTimer = useRef(null)
  const bumpStatsRef = useRef(null)

  // Синхронизация рефов
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { messengersRef.current = messengers }, [messengers])
  useEffect(() => { zoomLevelsRef.current = zoomLevels }, [zoomLevels])

  // bumpStats обновляется каждый рендер — чтобы ipc-handler всегда звал актуальную версию
  bumpStatsRef.current = (delta) => {
    const todayDate = new Date().toISOString().slice(0, 10)
    const cur = statsRef.current
    const base = cur.date !== todayDate
      ? { today: 0, autoToday: 0, total: cur.total || 0, date: todayDate }
      : cur
    const next = {
      ...base,
      today: (base.today || 0) + (delta.today || 0),
      autoToday: (base.autoToday || 0) + (delta.autoToday || 0),
      total: (base.total || 0) + (delta.total || 0),
    }
    statsRef.current = next
    setStats(next)
    clearTimeout(statsSaveTimer.current)
    statsSaveTimer.current = setTimeout(() => {
      const upd = { ...settingsRef.current, stats: statsRef.current }
      settingsRef.current = upd
      window.api.invoke('settings:save', upd).catch(() => {})
    }, 2000)
  }

  // ── Применение темы ──────────────────────────────────────────────────────
  useEffect(() => {
    const theme = settings.theme || 'dark'
    document.documentElement.setAttribute('data-theme', theme)
    window.api?.invoke('window:set-titlebar-theme', theme).catch(() => {})
  }, [settings.theme])

  // ── Загрузка при старте ──────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      window.api.invoke('messengers:load').then(list => {
        // Для дефолтных мессенджеров — всегда берём accountScript из constants.js
        const cleaned = list.map(m => {
          const def = DEFAULT_MESSENGERS.find(d => d.id === m.id)
          if (def) {
            const { accountScript, ...rest } = m
            return def.accountScript ? { ...rest, accountScript: def.accountScript } : rest
          }
          return m
        })
        setMessengers(cleaned)
        setActiveId(cleaned[0]?.id || null)
      }).catch(() => {
        setMessengers(DEFAULT_MESSENGERS)
        setActiveId(DEFAULT_MESSENGERS[0].id)
      }),
      window.api.invoke('settings:get').then(s => {
        setSettings(s)
        if (s.aiSidebarWidth) {
          const w = Math.max(240, Math.min(600, s.aiSidebarWidth))
          setAiWidth(w); aiWidthRef.current = w
        }
        // Загружаем зум вкладок
        if (s.zoomLevels && typeof s.zoomLevels === 'object') {
          setZoomLevels(s.zoomLevels)
          zoomLevelsRef.current = s.zoomLevels
        }
        // Загружаем статистику с ежедневным сбросом
        const todayDate = new Date().toISOString().slice(0, 10)
        const savedStats = s.stats || {}
        const loadedStats = savedStats.date !== todayDate
          ? { today: 0, autoToday: 0, total: savedStats.total || 0, date: todayDate }
          : { today: savedStats.today || 0, autoToday: savedStats.autoToday || 0, total: savedStats.total || 0, date: savedStats.date }
        setStats(loadedStats)
        statsRef.current = loadedStats
      }).catch(() => {}),
      window.api.invoke('app:get-paths').then(({ monitorPreload }) => {
        if (monitorPreload) {
          const url = 'file:///' + monitorPreload.replace(/\\/g, '/').replace(/^\//, '')
          setMonitorPreloadUrl(url)
        }
      }).catch(() => {})
    ]).finally(() => setAppReady(true))
  }, [])

  // ── Автосохранение мессенджеров ──────────────────────────────────────────
  useEffect(() => {
    if (messengers.length === 0) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.api.invoke('messengers:save', messengers).catch(() => {})
    }, 600)
  }, [messengers])

  // ── IPC window-state: main process сообщает о focus/blur/minimize/restore ──
  useEffect(() => {
    return window.api.on('window-state', (state) => {
      windowFocusedRef.current = state.focused
    })
  }, [])

  // ── Бейдж-события от ChatMonitor ─────────────────────────────────────────
  useEffect(() => {
    return window.api.on('messenger:badge', ({ id, count }) => {
      setUnreadCounts(prev => {
        const prev_count = prev[id] || 0
        if (count > prev_count && settingsRef.current.soundEnabled !== false) {
          const messengerMuted = !!(settingsRef.current.mutedMessengers || {})[id]
          // v0.62.6: дедупликация звука + логирование
          const lastSnd = lastSoundTsRef.current[id] || 0
          const sinceLast = Date.now() - lastSnd
          if (!messengerMuted && sinceLast > 3000) {
            const m = messengersRef.current.find(x => x.id === id)
            playNotificationSound(m?.color)
            lastSoundTsRef.current[id] = Date.now()
            traceNotif('sound', 'pass', id, `badge +${count - prev_count}`, 'звук badge')
          } else if (!messengerMuted) {
            traceNotif('sound', 'block', id, `badge +${count - prev_count}`, `dedup badge ${sinceLast}мс назад`)
          }
        }
        return { ...prev, [id]: count }
      })
    })
  }, [])

  // ── Клик по кастомному уведомлению (Messenger Ribbon) ────────────────────
  useEffect(() => {
    return window.api.on('notify:clicked', ({ messengerId, senderName, chatTag }) => {
      console.log('[GoChat] notify:clicked', { messengerId, senderName, chatTag })
      if (!messengerId) return
      setActiveId(messengerId)
      // Навигация к конкретному чату внутри WebView
      if (senderName || chatTag) {
        const tryNavigate = (attempt) => {
          // Проверяем что пользователь всё ещё на этой вкладке
          if (activeIdRef.current !== messengerId) {
            console.log(`[GoChat] attempt=${attempt} — CANCELLED (user switched to ${activeIdRef.current})`)
            return
          }
          const el = webviewRefs.current[messengerId]
          if (!el) {
            console.log(`[GoChat] attempt=${attempt} — webview ref NOT FOUND for ${messengerId}`)
            return
          }
          const url = el.getURL?.() || ''
          const script = buildChatNavigateScript(url, senderName, chatTag)
          if (!script) {
            console.log(`[GoChat] attempt=${attempt} — no script for url=${url.slice(0,50)}`)
            return
          }
          el.executeJavaScript(script).then(result => {
            const ok = result === true || (result && result.ok)
            const method = result?.method || ''
            console.log(`[GoChat] attempt=${attempt} ok=${ok} method=${method}`, result)
            if (ok) {
              setStatusBarMsg(`>> "${senderName}" (${method})`)
            } else if (attempt >= 2 || activeIdRef.current !== messengerId) {
              // Все попытки исчерпаны — показать что чат не найден
              setStatusBarMsg(`>> "${senderName}" - не найден в sidebar`)
            } else {
              setTimeout(() => tryNavigate(attempt + 1), 1500)
            }
          }).catch(err => { console.log('[GoChat] executeJS error:', err.message) })
        }
        // Одна попытка через 800ms — без агрессивных retry
        setTimeout(() => tryNavigate(0), 800)
      }
    })
  }, [])

  // ── "Прочитано" из ribbon — клик по чату в WebView чтобы мессенджер пометил прочитанным (v0.62.0) ──
  // v0.62.6: выполнение mark-read скрипта (вынесено для вызова из очереди)
  const executeMarkRead = useCallback(({ messengerId, senderName, chatTag }) => {
    const el = webviewRefs.current[messengerId]
    if (!el) {
      traceNotif('mark-read', 'warn', messengerId, senderName || '', 'webview ref не найден')
      return
    }
    const url = el.getURL?.() || ''
    const script = buildChatNavigateScript(url, senderName, chatTag)
    if (script) {
      el.executeJavaScript(script).then(result => {
        const ok = result === true || (result && result.ok)
        traceNotif('mark-read', ok ? 'pass' : 'warn', messengerId, senderName || '', `ok=${ok} method=${result?.method || ''} ${result?.log || ''}`)
      }).catch(err => {
        traceNotif('mark-read', 'warn', messengerId, senderName || '', `ошибка: ${err.message}`)
      })
    } else {
      traceNotif('mark-read', 'warn', messengerId, senderName || '', `нет скрипта для url=${url.slice(0,50)}`)
    }
  }, [])

  useEffect(() => {
    return window.api.on('notify:mark-read', ({ messengerId, senderName, chatTag }) => {
      traceNotif('mark-read', 'info', messengerId, senderName || '', `sender="${(senderName||'').slice(0,30)}" tag=${!!chatTag} hidden=${document.hidden}`)
      if (!messengerId) return
      // v0.62.6: если окно свёрнуто/скрыто — отложить до visibilitychange
      if (document.hidden) {
        pendingMarkReadsRef.current.push({ messengerId, senderName, chatTag })
        traceNotif('mark-read', 'info', messengerId, senderName || '', 'отложено — окно скрыто')
        return
      }
      executeMarkRead({ messengerId, senderName, chatTag })
    })
  }, [executeMarkRead])

  // v0.62.6: обработка отложенных mark-read при появлении окна
  useEffect(() => {
    const handler = () => {
      if (!document.hidden && pendingMarkReadsRef.current.length > 0) {
        const pending = [...pendingMarkReadsRef.current]
        pendingMarkReadsRef.current = []
        traceNotif('mark-read', 'info', '', '', `обработка ${pending.length} отложенных mark-read`)
        pending.forEach(item => {
          setTimeout(() => executeMarkRead(item), 500)
        })
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [executeMarkRead])

  // ── Автообновление лога уведомлений (каждые 3 сек пока окно открыто) ────
  useEffect(() => {
    if (!notifLogModal) return
    const mid = notifLogModal.messengerId
    const interval = setInterval(() => {
      const wv = webviewRefs.current[mid]
      if (!wv) return
      wv.executeJavaScript(`(function() { return JSON.stringify(window.__cc_notif_log || []); })()`)
        .then(json => {
          try {
            const log = JSON.parse(json)
            // Обновляем и лог, и trace (trace из ref, фильтруем по messengerId)
            const trace = pipelineTraceRef.current.filter(e => !e.mid || e.mid === mid)
            setNotifLogModal(prev => prev && prev.messengerId === mid ? { ...prev, log, trace } : prev)
          } catch {}
        })
        .catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [notifLogModal?.messengerId])

  // ── Горячие клавиши ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (!e.ctrlKey) return
      const ms = messengersRef.current
      const aid = activeIdRef.current

      if (e.key >= '1' && e.key <= '9') {
        const m = ms[parseInt(e.key) - 1]
        if (m) { setActiveId(m.id); e.preventDefault() }
      } else if ((e.key === 't' || e.key === 'T') && !e.shiftKey) {
        setShowAddModal(true); e.preventDefault()
      } else if (e.key === 'w' || e.key === 'W') {
        if (aid && !(settingsRef.current.pinnedTabs || {})[aid]) { askRemoveMessenger(aid); e.preventDefault() }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleSearch(); e.preventDefault()
      } else if (e.key === ',') {
        setShowSettings(true); e.preventDefault()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const idx = ms.findIndex(m => m.id === aid)
        const len = ms.length
        if (len < 2) return
        const next = e.shiftKey ? (idx - 1 + len) % len : (idx + 1) % len
        setActiveId(ms[next].id)
      } else if (e.key === '=' || e.key === '+') {
        // Ctrl+= / Ctrl++ → увеличить зум
        e.preventDefault()
        const cur = zoomLevelsRef.current[aid] || 100
        const clamped = Math.min(200, Math.round((cur + 10) / 5) * 5)
        setZoomLevels(prev => { const next = { ...prev, [aid]: clamped }; saveZoomLevels(next); return next })
        animateZoom(aid, cur, clamped)
      } else if (e.key === '-' || e.key === '_') {
        // Ctrl+- → уменьшить зум
        e.preventDefault()
        const cur = zoomLevelsRef.current[aid] || 100
        const clamped = Math.max(25, Math.round((cur - 10) / 5) * 5)
        setZoomLevels(prev => { const next = { ...prev, [aid]: clamped }; saveZoomLevels(next); return next })
        animateZoom(aid, cur, clamped)
      } else if (e.key === '0') {
        // Ctrl+0 → сбросить зум
        e.preventDefault()
        const cur = zoomLevelsRef.current[aid] || 100
        setZoomLevels(prev => { const next = { ...prev, [aid]: 100 }; saveZoomLevels(next); return next })
        animateZoom(aid, cur, 100)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line

  // ── Resizer AI-панели ─────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      if (!isResizingRef.current) return
      const delta = resizeStartRef.current.x - e.clientX
      const newW = Math.max(240, Math.min(600, resizeStartRef.current.w + delta))
      aiWidthRef.current = newW
      if (aiPanelRef.current) {
        aiPanelRef.current.style.width = `${newW}px`
        const inner = aiPanelRef.current.firstChild
        if (inner) { inner.style.width = `${newW}px`; inner.style.minWidth = `${newW}px` }
      }
    }
    const onUp = () => {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const newW = aiWidthRef.current
      setAiWidth(newW)
      const updated = { ...settingsRef.current, aiSidebarWidth: newW }
      setSettings(updated)
      window.api.invoke('settings:save', updated).catch(() => {})
      if (aiPanelRef.current) aiPanelRef.current.style.transition = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startResize = (e) => {
    isResizingRef.current = true
    setIsResizing(true)
    resizeStartRef.current = { x: e.clientX, w: aiWidthRef.current }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    if (aiPanelRef.current) aiPanelRef.current.style.transition = 'none'
    e.preventDefault()
  }

  // ── Зум WebView ──────────────────────────────────────────────────────────
  const applyZoom = (id, pct) => {
    try { webviewRefs.current[id]?.setZoomFactor(pct / 100) } catch {}
  }

  // Плавная анимация зума (ease-out, ~6 кадров)
  const animateZoom = (id, from, to) => {
    if (from === to) { applyZoom(id, to); return }
    const steps = 6
    let step = 0
    const tick = () => {
      step++
      const t = step / steps
      const eased = 1 - Math.pow(1 - t, 2)
      const val = from + (to - from) * eased
      try { webviewRefs.current[id]?.setZoomFactor(val / 100) } catch {}
      if (step < steps) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  const saveZoomLevels = (next) => {
    clearTimeout(zoomSaveTimer.current)
    zoomSaveTimer.current = setTimeout(() => {
      const updated = { ...settingsRef.current, zoomLevels: next }
      settingsRef.current = updated
      window.api.invoke('settings:save', updated).catch(() => {})
    }, 800)
  }

  const changeZoom = (pct) => {
    if (!activeId) return
    const from = zoomLevelsRef.current[activeId] || 100
    const clamped = Math.max(25, Math.min(200, Math.round(pct / 5) * 5))
    setZoomLevels(prev => {
      const next = { ...prev, [activeId]: clamped }
      saveZoomLevels(next)
      return next
    })
    animateZoom(activeId, from, clamped)
  }

  // Применяем сохранённый зум при переключении вкладки
  useEffect(() => {
    if (!activeId) return
    const zoom = zoomLevelsRef.current[activeId] || 100
    const t = setTimeout(() => applyZoom(activeId, zoom), 60)
    return () => clearTimeout(t)
  }, [activeId]) // eslint-disable-line

  // ── Очистка ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(retryTimers.current).forEach(t => clearTimeout(t))
      clearTimeout(saveTimer.current)
      clearTimeout(statsSaveTimer.current)
      clearTimeout(zoomSaveTimer.current)
    }
  }, [])

  // v0.75.5: Автосброс notifCountRef при переключении на вкладку (ЛЮБЫМ способом)
  // Покрывает: handleTabClick, notify:clicked, Ctrl+Tab, Ctrl+1-9, автопереключение
  useEffect(() => {
    if (!activeId) return
    // Задержка 1.5с — даём DOM-подсчёту время отработать
    const timer = setTimeout(() => {
      if (notifCountRef.current[activeId] > 0 && windowFocusedRef.current) {
        console.log(`[BADGE] auto-reset notifCountRef[${activeId}] = ${notifCountRef.current[activeId]} → 0 (viewing)`)
        notifCountRef.current[activeId] = 0
        setUnreadCounts(prev => {
          if (prev[activeId] > 0) return { ...prev, [activeId]: 0 }
          return prev
        })
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [activeId])

  // ── Переключение вкладки ──────────────────────────────────────────────────
  const handleTabClick = (id) => {
    setActiveId(id)
    // v0.72.5: Обнуляем fallback Notification count при просмотре вкладки
    notifCountRef.current[id] = 0
    // v0.74.4: НЕ обнуляем unreadCounts принудительно — это ломает overlay для мессенджеров с title-числом.
    // Для WhatsApp (title без числа) сброс произойдёт через unread-count IPC (domCount=0, isViewing=true).
    // Убираем анимацию при клике на вкладку
    setNewMessageIds(prev => { const n = new Set(prev); n.delete(id); return n })
    if (searchVisible && searchText) {
      setTimeout(() => { webviewRefs.current[id]?.findInPage(searchText) }, 200)
    }
  }

  // ── Закрытие вкладки ──────────────────────────────────────────────────────
  const removeMessenger = useCallback((id) => {
    setMessengers(prev => {
      const next = prev.filter(m => m.id !== id)
      setActiveId(curr => curr === id ? (next[0]?.id || null) : curr)
      return next
    })
    delete webviewRefs.current[id]
    clearTimeout(retryTimers.current[id])
    delete retryTimers.current[id]
    setAccountInfo(prev => { const n = { ...prev }; delete n[id]; return n })
    setUnreadCounts(prev => { const n = { ...prev }; delete n[id]; return n })
    setConfirmClose(null)
  }, [])

  // Запрос подтверждения перед закрытием
  const askRemoveMessenger = useCallback((id) => {
    const m = messengersRef.current.find(x => x.id === id)
    if (!m) return
    setConfirmClose({ id: m.id, name: m.name, color: m.color, emoji: m.emoji })
  }, [])

  // ── Добавление мессенджера ────────────────────────────────────────────────
  const addMessenger = useCallback((m) => {
    setMessengers(prev => [...prev, m])
    setActiveId(m.id)
    setShowAddModal(false)
  }, [])

  // v0.62.6: сохранение изменений вкладки
  const saveMessenger = useCallback((updated) => {
    setMessengers(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
    setEditingMessenger(null)
  }, [])

  // ── Drag-and-drop вкладок ────────────────────────────────────────────────
  const handleDragStart = (id) => { dragStartId.current = id }
  const handleDragOver = (id) => { setDragOverId(id) }
  const handleDrop = (id) => {
    const fromId = dragStartId.current
    if (!fromId || fromId === id) { setDragOverId(null); dragStartId.current = null; return }
    setMessengers(prev => {
      const list = [...prev]
      const fi = list.findIndex(m => m.id === fromId)
      const ti = list.findIndex(m => m.id === id)
      if (fi < 0 || ti < 0) return prev
      const [item] = list.splice(fi, 1)
      list.splice(ti, 0, item)
      return list
    })
    setDragOverId(null)
    dragStartId.current = null
  }
  const handleDragEnd = () => { setDragOverId(null); dragStartId.current = null }

  // ── Поиск ─────────────────────────────────────────────────────────────────
  const handleSearch = (text) => {
    setSearchText(text)
    const wv = webviewRefs.current[activeIdRef.current]
    if (!wv) return
    text ? wv.findInPage(text, { findNext: false }) : wv.stopFindInPage('clearSelection')
  }

  const toggleSearch = useCallback(() => {
    setSearchVisible(prev => {
      if (prev) {
        setSearchText('')
        webviewRefs.current[activeIdRef.current]?.stopFindInPage('clearSelection')
        return false
      }
      setTimeout(() => searchInputRef.current?.focus(), 80)
      return true
    })
  }, [])

  // ── Настройки ─────────────────────────────────────────────────────────────
  const handleSettingsChange = useCallback((newSettings) => {
    setSettings(newSettings)
    window.api.invoke('settings:save', newSettings).catch(() => {})
  }, [])

  // ── Извлечение аккаунта из WebView ───────────────────────────────────────
  const tryExtractAccount = (messengerId, attempt = 0) => {
    if (attempt > 12) return
    const wv = webviewRefs.current[messengerId]
    // Для дефолтных мессенджеров — accountScript ТОЛЬКО из constants.js (не из сохранённых данных!)
    // Матчим по ID или по URL (custom-мессенджер с URL дефолтного → используем дефолтный скрипт)
    const messenger = messengersRef.current.find(m => m.id === messengerId)
    const defaultM = DEFAULT_MESSENGERS.find(m => m.id === messengerId)
      || (messenger?.url && DEFAULT_MESSENGERS.find(m => m.url && messenger.url.startsWith(m.url)))
    const script = defaultM?.accountScript
      ? defaultM.accountScript
      : messenger?.accountScript
    if (!wv || !script) return

    wv.executeJavaScript(script)
      .then(result => {
        console.log(`[tryExtractAccount] ${messengerId} attempt=${attempt} result=`, JSON.stringify(result), typeof result)
        // Фильтр: отклоняем title страницы и служебные слова как имя аккаунта
        const BL_ACCOUNT = /^(max|макс|telegram|whatsapp|vk|вконтакте|viber|messenger|undefined|null)$/i
        if (result && typeof result === 'string' && result.length > 0 && result.length < 80 && !BL_ACCOUNT.test(result.trim())) {
          setAccountInfo(prev => ({ ...prev, [messengerId]: result }))
        } else {
          retryTimers.current[messengerId] = setTimeout(
            () => tryExtractAccount(messengerId, attempt + 1), 4000
          )
        }
      })
      .catch(() => {
        retryTimers.current[messengerId] = setTimeout(
          () => tryExtractAccount(messengerId, attempt + 1), 4000
        )
      })
  }

  // ── Дедупликация уведомлений (text+messengerId → timestamp) ────────────────
  const recentNotifsRef = useRef(new Map()) // key → timestamp
  const lastRibbonTsRef = useRef({}) // { [messengerId]: timestamp } — когда последний раз показали ribbon
  const lastSoundTsRef = useRef({}) // { [messengerId]: timestamp } — дедупликация звука между __CC_NOTIF__ и unread-count paths
  // v0.72.5: Fallback Notification count — если DOM-парсинг (unread-count IPC) = 0,
  // считаем непрочитанные по количеству __CC_NOTIF__ с момента последнего просмотра вкладки
  const notifCountRef = useRef({}) // { [messengerId]: number }
  const pendingMarkReadsRef = useRef([]) // v0.62.6: очередь mark-read при свёрнутом окне
  // v0.60.0 Решение #2: sender-based dedup — если __CC_NOTIF__ уже прошёл для sender,
  // блокируем __CC_MSG__ от того же sender в течение 3 сек (даже если текст другой)
  const notifSenderTsRef = useRef({}) // { [messengerId + ':' + senderName]: timestamp }
  // v0.60.2: per-messengerId dedup — если __CC_NOTIF__ от этого messengerId был <3 сек назад,
  // блокируем __CC_MSG__ целиком (sender name может отличаться из-за разного enrichment)
  const notifMidTsRef = useRef({}) // { [messengerId]: timestamp }

  // ── Pipeline Trace Logger (v0.55.0) ──────────────────────────────────────────
  // Записывает КАЖДЫЙ шаг pipeline уведомлений для диагностики
  // step: source|spam|dedup|handle|viewing|sound|ribbon|enrich|error
  // type: info|pass|block|warn
  const traceNotif = (step, type, messengerId, text, detail) => {
    // v0.60.0: добавляем имя мессенджера для идентификации в логах
    const mName = messengerId ? (messengersRef.current.find(x => x.id === messengerId)?.name || '') : ''
    pipelineTraceRef.current.push({
      ts: Date.now(), step, type, mid: messengerId || '', mName, text: (text || '').slice(0, 200), detail: detail || '',
    })
    if (pipelineTraceRef.current.length > 300) pipelineTraceRef.current.splice(0, 100)
  }

  // ── Обработка входящего сообщения (общая для ipc-message и console-message) ──
  // extra = { senderName, iconUrl } — опционально, из перехваченного Notification
  // Если extra есть → из __CC_NOTIF__ (Notification API) — надёжный источник
  // Если extra нет → из MutationObserver (new-message IPC) — может быть ложным
  const handleNewMessage = (messengerId, text, extra) => {
    if (!text) return
    traceNotif('handle', 'info', messengerId, text, `extra=${extra ? `{s:"${(extra.senderName||'').slice(0,20)}",icon:${!!(extra.iconUrl||extra.iconDataUrl)}}` : 'нет'}`)

    // Дедупликация: одинаковый текст от того же мессенджера за 10 сек → skip
    const dedupKey = messengerId + ':' + text.slice(0, 60)
    const now = Date.now()
    if (recentNotifsRef.current.has(dedupKey) && now - recentNotifsRef.current.get(dedupKey) < 10000) {
      traceNotif('dedup', 'block', messengerId, text, `recentNotifs | age=${now - recentNotifsRef.current.get(dedupKey)}мс`)
      return
    }
    recentNotifsRef.current.set(dedupKey, now)
    // Чистим старые записи (>30 сек)
    if (recentNotifsRef.current.size > 50) {
      for (const [k, ts] of recentNotifsRef.current) { if (now - ts > 30000) recentNotifsRef.current.delete(k) }
    }

    // Подавляем уведомления если пользователь смотрит на эту вкладку
    // windowFocusedRef обновляется через IPC window-state из main process —
    // надёжнее чем document.hidden или document.hasFocus()
    // v0.58.0: НЕ блокируем __CC_NOTIF__ (fromNotifAPI) — если мессенджер сам вызвал
    // showNotification, значит текущий чат ≠ чат сообщения → пользователь НЕ видит его
    const isViewingThisTab = windowFocusedRef.current && activeIdRef.current === messengerId
    if (isViewingThisTab && !extra?.fromNotifAPI) {
      traceNotif('viewing', 'block', messengerId, text, `focused=${windowFocusedRef.current} activeId=${activeIdRef.current}`)
      return
    }
    if (isViewingThisTab && extra?.fromNotifAPI) {
      traceNotif('viewing', 'pass', messengerId, text, `focused=true НО fromNotifAPI=true → мессенджер считает чат не открыт`)
    } else {
      traceNotif('viewing', 'pass', messengerId, text, `focused=${windowFocusedRef.current} activeId=${activeIdRef.current}`)
    }

    // Автопереключение на вкладку с новым сообщением (если включено)
    if (settingsRef.current.autoSwitchOnMessage && messengerId !== activeIdRef.current) {
      setActiveId(messengerId)
    }

    // Звук и уведомление — per-messenger настройки (v0.47.0)
    const mNotifs = (settingsRef.current.messengerNotifs || {})[messengerId] || {}
    const messengerMuted = !!(settingsRef.current.mutedMessengers || {})[messengerId]
    // Per-messenger sound: messengerNotifs[id].sound > mutedMessengers > глобальный soundEnabled
    const soundOn = mNotifs.sound !== undefined ? mNotifs.sound : !messengerMuted
    // Per-messenger ribbon: messengerNotifs[id].ribbon > notificationsEnabled (глобальный)
    const ribbonOn = mNotifs.ribbon !== undefined ? mNotifs.ribbon : true
    const mInfo = messengersRef.current.find(x => x.id === messengerId)
    if (settingsRef.current.soundEnabled !== false && soundOn) {
      playNotificationSound(mInfo?.color)
      lastSoundTsRef.current[messengerId] = Date.now()
      traceNotif('sound', 'pass', messengerId, text, 'звук воспроизведён')
    } else {
      traceNotif('sound', 'block', messengerId, text, `global=${settingsRef.current.soundEnabled !== false} muted=${messengerMuted} perMsg=${mNotifs.sound}`)
    }
    if (settingsRef.current.notificationsEnabled !== false && ribbonOn) {
      lastRibbonTsRef.current[messengerId] = Date.now()
      const senderName = extra?.senderName
      const notifTitle = senderName
        ? `${mInfo?.name || 'ЦентрЧатов'} — ${senderName}`
        : (mInfo?.name || 'ЦентрЧатов')
      // v0.61.1: убираем суффикс #N для отображения (dedup уже прошёл)
      // Покрывает: "📎 Стикер #3", "🖼 Картинка #2", "🎬 Анимация #1", "😇😉👍 #4"
      const displayText = text.replace(/ #\d+$/, '')
      window.api.invoke('app:custom-notify', {
        title: extra?.senderName || '',
        body: displayText.length > 100 ? displayText.slice(0, 97) + '…' : displayText,
        fullBody: displayText.length > 100 ? displayText : '', // полный текст если обрезан
        iconUrl: extra?.iconUrl || undefined,
        iconDataUrl: extra?.iconDataUrl || undefined,
        color: mInfo?.color || '#2AABEE',
        emoji: mInfo?.emoji || '💬',
        messengerName: mInfo?.name || 'ЦентрЧатов',
        messengerId: messengerId,
        senderName: extra?.senderName || '',
        chatTag: extra?.chatTag || '',
      }).catch(() => {})
      traceNotif('ribbon', 'pass', messengerId, text, `отправлен | sender="${(extra?.senderName||'').slice(0,20)}" icon=${!!(extra?.iconUrl||extra?.iconDataUrl)}`)
    } else {
      traceNotif('ribbon', 'block', messengerId, text, `выключен | global=${settingsRef.current.notificationsEnabled !== false} perMsg=${ribbonOn}`)
    }

    // v0.72.5: Fallback Notification count — увеличиваем при каждом __CC_NOTIF__
    notifCountRef.current[messengerId] = (notifCountRef.current[messengerId] || 0) + 1
    // Если DOM-парсинг (unreadCounts) = 0, используем notifCount как fallback
    setUnreadCounts(prev => {
      if ((prev[messengerId] || 0) === 0 && notifCountRef.current[messengerId] > 0) {
        return { ...prev, [messengerId]: notifCountRef.current[messengerId] }
      }
      return prev
    })

    // Превью сообщения в бейдже вкладки (5 секунд)
    const previewText = displayText.slice(0, 32) + (displayText.length > 32 ? '…' : '')
    setMessagePreview(prev => ({ ...prev, [messengerId]: previewText }))
    clearTimeout(previewTimers.current[messengerId])
    previewTimers.current[messengerId] = setTimeout(() => {
      setMessagePreview(prev => { const p = { ...prev }; delete p[messengerId]; return p })
    }, 5000)

    // Добавляем в историю AI
    setChatHistory(prev => [...prev.slice(-19), { messengerId, text, ts: Date.now() }])

    // Авто-ответчик по ключевым словам
    const rules = settingsRef.current.autoReplyRules || []
    let autoReplied = false
    for (const rule of rules) {
      if (!rule.active) continue
      const matched = rule.keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))
      if (matched) {
        navigator.clipboard.writeText(rule.reply).catch(() => {})
        window.api.invoke('app:custom-notify', {
          title: '🤖 Авто-ответ',
          body: `Правило: "${rule.keywords[0]}" — ответ в буфере`,
          color: mInfo?.color || '#2AABEE',
          emoji: mInfo?.emoji || '🤖',
          messengerName: mInfo?.name || 'ЦентрЧатов',
          messengerId: messengerId,
        }).catch(() => {})
        autoReplied = true
        break
      }
    }

    // Статистика сообщений
    bumpStatsRef.current?.({ today: 1, total: 1, ...(autoReplied ? { autoToday: 1 } : {}) })

    // Анимация на вкладке (ping 3 секунды)
    setNewMessageIds(prev => { const n = new Set(prev); n.add(messengerId); return n })
    setTimeout(() => {
      setNewMessageIds(prev => { const n = new Set(prev); n.delete(messengerId); return n })
    }, 3000)

    setLastMessage(text)

    // Последнее сообщение в статусбар (исчезает через 8 сек)
    const mName = messengersRef.current.find(x => x.id === messengerId)?.name || ''
    const displayName = extra?.senderName ? `${mName} — ${extra.senderName}` : mName
    const shortText = text.slice(0, 40) + (text.length > 40 ? '…' : '')
    setStatusBarMsg(`${displayName}: ${shortText}`)
    clearTimeout(statusBarMsgTimer.current)
    statusBarMsgTimer.current = setTimeout(() => setStatusBarMsg(null), 8000)
  }

  // ── Инициализация WebView ─────────────────────────────────────────────────
  const setWebviewRef = (el, messengerId) => {
    if (el && !el._chatcenterInit) {
      el._chatcenterInit = true
      webviewRefs.current[messengerId] = el

      // Статус мониторинга: loading при инициализации
      setMonitorStatus(prev => ({ ...prev, [messengerId]: 'loading' }))

      // Индикатор загрузки страницы WebView
      setWebviewLoading(prev => ({ ...prev, [messengerId]: true }))
      el.addEventListener('did-start-loading', () => {
        setWebviewLoading(prev => ({ ...prev, [messengerId]: true }))
      })
      el.addEventListener('did-stop-loading', () => {
        setWebviewLoading(prev => ({ ...prev, [messengerId]: false }))
      })

      el.addEventListener('dom-ready', () => {
        clearTimeout(retryTimers.current[messengerId])
        retryTimers.current[messengerId] = setTimeout(
          () => tryExtractAccount(messengerId, 0), 3500
        )
        // Warm-up: игнорируем ВСЕ уведомления первые 5 сек после загрузки WebView
        // Мессенджеры при загрузке кидают Notification для старых непрочитанных (burst 1-3 сек).
        // v0.57.0: снижено с 30 до 5 сек — 30 сек блокировало реальные сообщения в MAX.
        notifReadyRef.current[messengerId] = false
        setTimeout(() => { notifReadyRef.current[messengerId] = true }, 5000)
        // Через 20 сек если монитор не ответил — помечаем как error
        setTimeout(() => {
          setMonitorStatus(prev => {
            if (prev[messengerId] === 'loading') return { ...prev, [messengerId]: 'error' }
            return prev
          })
        }, 20000)
        // Применяем зум если он не стандартный
        setTimeout(() => {
          const zoom = zoomLevelsRef.current[messengerId] || 100
          if (zoom !== 100) {
            try { webviewRefs.current[messengerId]?.setZoomFactor(zoom / 100) } catch {}
          }
        }, 600)
        // Скрываем баннеры "браузер устарел" (VK и др.)
        try {
          el.insertCSS(`
            .BrowserUpdateLayer, .browser_update, .BrowserUpdate,
            [class*="BrowserUpdate"], [class*="browser_update"],
            [class*="browserUpdate"], [class*="unsupported-browser"],
            .UnsupportedBrowser, .stl__banner,
            .Popup--browserUpdate, .vkuiBanner--browser-update,
            .TopBrowserUpdateLayer, .BrowserUpdateOffer,
            [class*="browser-update"], [class*="BrowserOffer"] {
              display: none !important;
            }
          `)
          // JS-удаление баннеров "браузер устарел" по тексту (VK, MAX и др.)
          el.executeJavaScript(`
            (function hideBrowserBanners() {
              function remove() {
                document.querySelectorAll('div, span, section, aside, footer, [role="banner"], [role="alert"]').forEach(el => {
                  var t = (el.textContent || '').toLowerCase()
                  if ((t.includes('браузер устарел') || t.includes('browser is outdated') ||
                       (t.includes('обновите') && t.includes('браузер')) ||
                       (t.includes('update') && t.includes('browser'))) &&
                      el.children.length < 20) {
                    el.style.display = 'none'
                  }
                })
              }
              remove()
              setTimeout(remove, 2000)
              setTimeout(remove, 5000)
              setTimeout(remove, 10000)
              new MutationObserver(function() { remove() }).observe(document.body || document.documentElement, { childList: true, subtree: true })
            })()
          `).catch(() => {})
          // Fallback: если CSP заблокировал <script> injection в preload (MAX/Svelte),
          // инжектим notification hook через executeJavaScript (обходит CSP через DevTools protocol)
          setTimeout(() => {
            el.executeJavaScript(`
              if (!window.__cc_notif_hooked) {
                window.__cc_notif_hooked = true;
                (function() {
                  // Лог всех Notification для отладки (доступен через контекстное меню вкладки)
                  window.__cc_notif_log = window.__cc_notif_log || [];
                  function _logNotif(status, title, body, tag, icon, reason, enrichedTitle) {
                    var entry = { ts: Date.now(), status: status, title: title || '', body: (body || '').slice(0, 200), tag: tag || '', reason: reason || '', enrichedTitle: enrichedTitle || '' };
                    if (icon) entry.hasIcon = true;
                    window.__cc_notif_log.push(entry);
                    if (window.__cc_notif_log.length > 100) window.__cc_notif_log.shift();
                  }
                  var _avatarCache = {}; // кэш аватарок: tag/name → URL (TTL 30 мин)
                  var _avatarCacheTs = {};
                  function findAvatar(name, tag) {
                    // Проверяем кэш по tag (peer ID) или по имени
                    var cacheKey = tag || name;
                    if (cacheKey && _avatarCache[cacheKey] && (Date.now() - (_avatarCacheTs[cacheKey] || 0)) < 1800000) {
                      return _avatarCache[cacheKey];
                    }
                    if (!name) return '';
                    try {
                      var items = document.querySelectorAll('[class*="chat" i], [class*="dialog" i], [class*="conversation" i], [class*="item" i], [class*="peer" i], [class*="contact" i], li');
                      for (var j = 0; j < items.length && j < 150; j++) {
                        var txt = items[j].textContent || '';
                        if (txt.indexOf(name) === -1) continue;
                        var img = items[j].querySelector('img[src]');
                        if (img && img.src && !img.src.includes('emoji') && img.naturalWidth > 10) return img.src;
                        var avEl = items[j].querySelector('[class*="avatar" i], [class*="photo" i]');
                        if (avEl) {
                          var aImg = avEl.querySelector('img[src]');
                          if (aImg && aImg.src && aImg.naturalWidth > 10) return aImg.src;
                          var cvs = avEl.querySelector('canvas');
                          if (cvs && cvs.width > 10) { try { return cvs.toDataURL('image/png'); } catch(e2) {} }
                          var bg = getComputedStyle(avEl).backgroundImage;
                          if (bg && bg !== 'none') {
                            var m = bg.match(/url\(["']?(.+?)["']?\)/);
                            if (m && m[1] && !m[1].includes('emoji')) return m[1];
                          }
                        }
                      }
                    } catch(e) {}
                    return '';
                  }
                  function findAvatarCached(name, tag) {
                    var result = findAvatar(name, tag);
                    if (result && (tag || name)) {
                      var ck = tag || name;
                      _avatarCache[ck] = result;
                      _avatarCacheTs[ck] = Date.now();
                    }
                    return result;
                  }
                  // Поиск имени отправителя и аватарки в chatlist по preview-тексту сообщения
                  // MAX/Telegram Web K: .chatlist-chat → .peer-title + subtitle
                  // VK: [class*="dialog"], [class*="im_dialog"], [class*="conversation"] → title/name элемент
                  // WhatsApp: [data-testid="cell-frame-container"] → span[title]
                  function findSenderInChatlist(body) {
                    if (!body || body.length < 2) return null;
                    var bodySlice = body.slice(0, 30);
                    try {
                      // 1. Telegram/MAX: .chatlist-chat + .peer-title
                      var chats = document.querySelectorAll('.chatlist-chat');
                      for (var i = 0; i < chats.length && i < 50; i++) {
                        if ((chats[i].textContent || '').indexOf(bodySlice) === -1) continue;
                        var pt = chats[i].querySelector('.peer-title');
                        var nm = pt ? (pt.textContent || '').trim() : '';
                        if (!nm) continue;
                        var av = _findAvatarInEl(chats[i]);
                        return { name: nm, avatar: av };
                      }
                      // 2. VK/Generic: элементы chat/dialog/conversation в sidebar
                      var generic = document.querySelectorAll('[class*="dialog" i], [class*="im_dialog" i], [class*="conversation" i], [class*="chat-item" i], [class*="chatlist" i]');
                      for (var j = 0; j < generic.length && j < 80; j++) {
                        var el = generic[j];
                        if ((el.textContent || '').indexOf(bodySlice) === -1) continue;
                        // Ищем имя: title attr, [class*="name"], [class*="title"], первый жирный текст
                        var nameEl = el.querySelector('[class*="title" i], [class*="name" i], [class*="peer" i], b, strong');
                        var sn = nameEl ? (nameEl.textContent || '').trim() : '';
                        if (!sn || sn.length < 2 || sn.length > 60) continue;
                        // Проверяем что это не body text (имя ≠ preview сообщения)
                        if (sn === body.trim() || body.indexOf(sn) === 0) continue;
                        var av2 = _findAvatarInEl(el);
                        return { name: sn, avatar: av2 };
                      }
                    } catch(e) {}
                    return null;
                  }
                  // Вспомогательная: найти аватарку внутри элемента чата
                  function _findAvatarInEl(el) {
                    try {
                      var avEl = el.querySelector('img.avatar-photo, [class*="avatar"] img, canvas.avatar-photo, img[class*="photo" i]');
                      if (avEl && avEl.tagName === 'IMG' && avEl.src && avEl.naturalWidth > 10) return avEl.src;
                      if (avEl && avEl.tagName === 'CANVAS' && avEl.width > 10) {
                        try { return avEl.toDataURL('image/png'); } catch(e) {}
                      }
                      // VK: background-image на avatar div
                      var avDiv = el.querySelector('[class*="avatar" i], [class*="photo" i]');
                      if (avDiv) {
                        var bg = getComputedStyle(avDiv).backgroundImage;
                        if (bg && bg !== 'none') {
                          var m = bg.match(/url\(["']?(.+?)["']?\)/);
                          if (m && m[1] && m[1].startsWith('http')) return m[1];
                        }
                        var img2 = avDiv.querySelector('img[src]');
                        if (img2 && img2.src && img2.naturalWidth > 10) return img2.src;
                      }
                    } catch(e) {}
                    return '';
                  }
                  // Проверка: title — это название мессенджера, а не имя отправителя
                  var _appTitles = /^(ma[xк][cс]?|telegram|whatsapp|vk|viber|вконтакте|вк)/i;
                  // Фильтр: системные/спам-тексты — не настоящие сообщения от собеседников
                  // VK шлёт Notification для: статусов online, своих исходящих, пустых текстов
                  var _spamBody = /^(\d+\s*(непрочитанн|новы[хе]?\s*сообщ)|минуту?\s+назад|секунд\w*\s+назад|час\w*\s+назад|только\s+что|online|в\s+сети|был[аи]?\s+(в\s+сети|online)|печата|записыва|набира|пишет|typing|ожидани[ея]\s+сети|connecting|reconnecting|updating|загрузк[аи]|обновлени[ея]|подключени[ея])/i;
                  var _outgoing = /^(вы:\s|you:\s)/i;
                  var _statusEnd = /\s+(в\s+сети|online|offline|был[аи]?\s+(в\s+сети|недавно|давно))\s*$/i;
                  var _sysText = /^(сообщение|пропущенный\s*(вызов|звонок)|входящий\s*(вызов|звонок)|missed\s*call|message)$/i;
                  function isSpamNotif(body) {
                    if (!body || !body.trim()) return 'empty';
                    var t = body.trim();
                    if (_spamBody.test(t)) return 'system';
                    if (_outgoing.test(t)) return 'outgoing';
                    if (_statusEnd.test(t)) return 'status';
                    if (_sysText.test(t)) return 'sysText';
                    return '';
                  }
                  function enrichNotif(title, body, tag, icon) {
                    var realTitle = title;
                    var realIcon = icon;
                    if (!title || _appTitles.test(title.trim())) {
                      var sender = findSenderInChatlist(body);
                      if (sender) {
                        realTitle = sender.name;
                        if (!realIcon && sender.avatar) realIcon = sender.avatar;
                      }
                    }
                    if (!realIcon) realIcon = findAvatarCached(realTitle, tag);
                    return { title: realTitle, icon: realIcon };
                  }
                  var _stickerSeq = 0;
                  // v0.61.2: извлечение содержимого стикера/медиа из DOM + диагностика
                  // Ищет эмодзи или img в последних сообщениях контейнера чата
                  function _extractStickerFromDOM() {
                    try {
                      // Ищем контейнер чата: MAX = .history, TG = messages-container и т.д.
                      var containers = document.querySelectorAll('.history, [class*="history" i], [class*="messages-container" i], [class*="chat-messages" i], [class*="message-list" i], #message-list');
                      var container = null;
                      for (var ci = 0; ci < containers.length; ci++) {
                        if (containers[ci].children.length > 3) { container = containers[ci]; break; }
                      }
                      if (!container) {
                        console.log('__CC_STICKER_DBG__' + JSON.stringify({ err: 'no container', tried: containers.length }));
                        return null;
                      }
                      // Берём последние 5 элементов (DOM может быть не полностью синхронизирован)
                      var msgs = container.children;
                      var lastMsgInfo = [];
                      for (var mi = msgs.length - 1; mi >= Math.max(0, msgs.length - 5); mi--) {
                        var msg = msgs[mi];
                        var msgClasses = msg.className || '';
                        var msgHTML = msg.innerHTML || '';
                        // Собираем диагностику для отладки
                        lastMsgInfo.push({ cls: msgClasses.slice(0, 60), len: msgHTML.length, tag: msg.tagName });
                        // 1. Ищем крупные эмодзи: элементы с emoji/sticker классами
                        var emojiEls = msg.querySelectorAll('[class*="emoji" i], [class*="sticker" i], [class*="big" i]');
                        for (var ei = 0; ei < emojiEls.length; ei++) {
                          var eTxt = (emojiEls[ei].textContent || '').trim();
                          if (eTxt && eTxt.length <= 30 && !/[a-zA-Zа-яА-Я0-9]/.test(eTxt)) {
                            return { type: 'emoji', content: eTxt };
                          }
                        }
                        // 2. Ищем стикер-картинку
                        var imgs = msg.querySelectorAll('img[src]');
                        for (var ii = imgs.length - 1; ii >= 0; ii--) {
                          var imgSrc = imgs[ii].src || '';
                          var imgW = imgs[ii].naturalWidth || imgs[ii].width || parseInt(imgs[ii].style.width) || 0;
                          var imgH = imgs[ii].naturalHeight || imgs[ii].height || parseInt(imgs[ii].style.height) || 0;
                          // Стикер: > 50px, не аватарка sender'а (sqr_ = аватарка MAX)
                          if ((imgW > 50 || imgH > 50) && !imgSrc.includes('sqr_') && !imgSrc.includes('avatar')) {
                            return { type: 'image', content: imgSrc };
                          }
                        }
                        // 3. Lottie/видео стикеры (tgs, webm, canvas-анимация)
                        var videos = msg.querySelectorAll('video, canvas, [class*="lottie" i], [class*="anim" i]');
                        if (videos.length > 0) {
                          // Проверяем canvas > 40px (не мелкие UI-элементы)
                          for (var vi = 0; vi < videos.length; vi++) {
                            var vW = videos[vi].width || videos[vi].clientWidth || 0;
                            if (videos[vi].tagName === 'CANVAS' && vW < 40) continue;
                            return { type: 'animated', content: null };
                          }
                        }
                        // 4. Fallback: текст без букв/цифр = эмодзи (широкий regex)
                        var textEls = msg.querySelectorAll('[class*="text" i], [class*="content" i], [class*="body" i], p, span');
                        for (var ti = textEls.length - 1; ti >= 0; ti--) {
                          var t = (textEls[ti].textContent || '').trim();
                          // Текст <= 30 символов, без букв и цифр = чистые эмодзи
                          if (t && t.length >= 1 && t.length <= 30 && !/[a-zA-Zа-яА-Я0-9]/.test(t)) {
                            return { type: 'emoji', content: t };
                          }
                        }
                      }
                      // Диагностика: контейнер найден, но стикер не извлечён
                      console.log('__CC_STICKER_DBG__' + JSON.stringify({ container: container.className.slice(0, 40), children: msgs.length, last: lastMsgInfo }));
                    } catch(e) {
                      console.log('__CC_STICKER_DBG__' + JSON.stringify({ err: String(e).slice(0, 100) }));
                    }
                    return null;
                  }
                  var _N = window.Notification;
                  window.Notification = function(title, opts) {
                    try {
                      var body = (opts && opts.body) || '';
                      var tag = (opts && opts.tag) || '';
                      var icon = (opts && opts.icon) || (opts && opts.image) || '';
                      // v0.61.2: разведка завершена — MAX opts: {icon, badge, body, silent}. image/data нет.
                      var spam = isSpamNotif(body);
                      // v0.61.1: пустой body → извлекаем стикер/эмодзи из DOM
                      if (spam === 'empty' && title && !_appTitles.test(title.trim())) {
                        var sticker = _extractStickerFromDOM();
                        if (sticker && sticker.type === 'emoji' && sticker.content) {
                          body = sticker.content + ' #' + (++_stickerSeq);
                        } else if (sticker && sticker.type === 'image' && sticker.content) {
                          body = '\u{0001F5BC} \u041A\u0430\u0440\u0442\u0438\u043D\u043A\u0430 #' + (++_stickerSeq);
                        } else if (sticker && sticker.type === 'animated') {
                          body = '\u{0001F3AC} \u0410\u043D\u0438\u043C\u0430\u0446\u0438\u044F #' + (++_stickerSeq);
                        } else {
                          body = '\u{0001F4CE} \u0421\u0442\u0438\u043A\u0435\u0440 #' + (++_stickerSeq);
                        }
                        spam = '';
                      }
                      if (spam) {
                        _logNotif('blocked', title, body, tag, icon, spam, '');
                        return;
                      }
                      var enriched = enrichNotif(title, body, tag, icon);
                      _logNotif('passed', title, body, tag, icon, '', enriched.title);
                      // v0.57.0: отправляем console.log НАПРЯМУЮ (без toDataUrl)
                      // toDataUrl мог зависать на CORS/сети → callback не вызывался → console.log не срабатывал
                      console.log('__CC_NOTIF__' + JSON.stringify({ t: enriched.title || '', b: body, i: enriched.icon || '', g: tag }));
                    } catch(e) {}
                  };
                  window.Notification.permission = 'granted';
                  window.Notification.requestPermission = function(cb) { if (cb) cb('granted'); return Promise.resolve('granted'); };
                  Object.defineProperty(window.Notification, 'permission', { get: function() { return 'granted'; }, set: function() {} });
                  try {
                    ServiceWorkerRegistration.prototype.showNotification = function(title, opts) {
                      try {
                        var body = (opts && opts.body) || '';
                        var tag = (opts && opts.tag) || '';
                        var icon = (opts && opts.icon) || (opts && opts.image) || '';
                        // v0.61.1: разведка — логируем все поля opts для стикеров (при пустом body)
                        if (!body && opts) {
                          try { console.log('__CC_NOTIF_OPTS__' + JSON.stringify({ keys: Object.keys(opts), image: opts.image || '', data: (typeof opts.data === 'string' ? opts.data : JSON.stringify(opts.data)) || '', badge: opts.badge || '', actions: opts.actions || [] })); } catch(e2) {}
                        }
                        var spam = isSpamNotif(body);
                        // v0.61.1: пустой body → извлекаем стикер/эмодзи из DOM
                        if (spam === 'empty' && title && !_appTitles.test(title.trim())) {
                          var sticker = _extractStickerFromDOM();
                          if (sticker && sticker.type === 'emoji' && sticker.content) {
                            body = sticker.content + ' #' + (++_stickerSeq);
                          } else if (sticker && sticker.type === 'image' && sticker.content) {
                            body = '\u{0001F5BC} \u041A\u0430\u0440\u0442\u0438\u043D\u043A\u0430 #' + (++_stickerSeq);
                          } else if (sticker && sticker.type === 'animated') {
                            body = '\u{0001F3AC} \u0410\u043D\u0438\u043C\u0430\u0446\u0438\u044F #' + (++_stickerSeq);
                          } else {
                            body = '\u{0001F4CE} \u0421\u0442\u0438\u043A\u0435\u0440 #' + (++_stickerSeq);
                          }
                          spam = '';
                        }
                        if (spam) {
                          _logNotif('blocked', title, body, tag, icon, spam, '');
                          return Promise.resolve();
                        }
                        var enriched = enrichNotif(title, body, tag, icon);
                        _logNotif('passed', title, body, tag, icon, '', enriched.title);
                        // v0.57.0: отправляем console.log НАПРЯМУЮ (без toDataUrl)
                        console.log('__CC_NOTIF__' + JSON.stringify({ t: enriched.title || '', b: body, i: enriched.icon || '', g: tag }));
                      } catch(e) {}
                      return Promise.resolve();
                    };
                  } catch(e) {}
                  // v0.73.9: Блокируем Badge API из page context
                  if (navigator.setAppBadge) {
                    navigator.setAppBadge = function(n) {
                      console.log('__CC_BADGE_BLOCKED__:' + n);
                      return Promise.resolve();
                    };
                  }
                  if (navigator.clearAppBadge) {
                    navigator.clearAppBadge = function() { return Promise.resolve(); };
                  }
                  // Блокируем Service Worker
                  if (navigator.serviceWorker) {
                    // Блокируем будущие регистрации SW
                    var _origSWReg = navigator.serviceWorker.register;
                    navigator.serviceWorker.register = function() {
                      console.log('__CC_SW_BLOCKED__');
                      return Promise.reject(new Error('blocked by ChatCenter'));
                    };
                    // Удаляем уже зарегистрированные SW
                    navigator.serviceWorker.getRegistrations().then(function(regs) {
                      regs.forEach(function(r) { r.unregister(); });
                      if (regs.length) console.log('__CC_SW_UNREGISTERED__:' + regs.length);
                    }).catch(function() {});
                  }
                  var _A = window.Audio;
                  window.Audio = function(src) { var a = new _A(src); a.volume = 0; return a; };
                  window.Audio.prototype = _A.prototype;
                  var _ce = document.createElement.bind(document);
                  document.createElement = function(tag) {
                    var el = _ce.apply(document, arguments);
                    if (tag && tag.toLowerCase() === 'audio') { el.volume = 0; el.muted = true; }
                    return el;
                  };
                  ['AudioContext','webkitAudioContext'].forEach(function(name) {
                    var _Ctx = window[name];
                    if (!_Ctx) return;
                    var _createGain = _Ctx.prototype.createGain;
                    _Ctx.prototype.createGain = function() {
                      var g = _createGain.call(this); g.gain.value = 0; return g;
                    };
                  });
                  console.log('__CC_NOTIF_HOOK_OK__');
                })();
              }
            `).then(() => {
              console.log('[NotifHook] executeJavaScript fallback applied (' + messengerId + ')')
            }).catch(() => {})
          }, 1500)
        } catch {}
      })

      // page-title-updated — мгновенное обновление счётчика из title WebView
      // Telegram: "(26) Telegram Web", WhatsApp: "(5) WhatsApp", VK: "(3) ВКонтакте"
      // MAX: "1 непрочитанный чат" / "5 непрочитанных чатов" (БЕЗ скобок!)
      el.addEventListener('page-title-updated', (e) => {
        const match = e.title?.match(/\((\d+)\)/) || e.title?.match(/^(\d+)\s+непрочитанн/)
        if (match) {
          const count = parseInt(match[1], 10) || 0
          // v0.74.0: Сбрасываем notifCountRef когда title показывает реальное число
          notifCountRef.current[messengerId] = Math.min(notifCountRef.current[messengerId] || 0, count)
          setUnreadCounts(prev => {
            if (prev[messengerId] === count) return prev
            // Звук при увеличении счётчика (только если пользователь НЕ смотрит на этот чат)
            // Warm-up: при запуске счётчик идёт 0→N — не шуметь пока WebView не прогрелся
            if (count > (prev[messengerId] || 0) && notifReadyRef.current[messengerId] && !(windowFocusedRef.current && activeIdRef.current === messengerId)) {
              const s = settingsRef.current
              const mn = (s.messengerNotifs || {})[messengerId] || {}
              const muted = !!(s.mutedMessengers || {})[messengerId]
              const sndOn = mn.sound !== undefined ? mn.sound : !muted
              const ribOn = mn.ribbon !== undefined ? mn.ribbon : true
              // v0.62.6: дедупликация звука + логирование
              const lastSnd = lastSoundTsRef.current[messengerId] || 0
              const sinceLast = Date.now() - lastSnd
              if (s.soundEnabled !== false && sndOn && sinceLast > 3000) {
                const mi = messengersRef.current.find(x => x.id === messengerId)
                playNotificationSound(mi?.color)
                lastSoundTsRef.current[messengerId] = Date.now()
                traceNotif('sound', 'pass', messengerId, `title +${count - (prev[messengerId] || 0)}`, 'звук title-update')
              } else if (s.soundEnabled !== false && sndOn) {
                traceNotif('sound', 'block', messengerId, `title +${count - (prev[messengerId] || 0)}`, `dedup title ${sinceLast}мс назад`)
              }
            }
            return { ...prev, [messengerId]: count }
          })
          // Обновляем статус мониторинга — title работает
          setMonitorStatus(prev => ({ ...prev, [messengerId]: 'active' }))
        } else if (activeIdRef.current === messengerId && windowFocusedRef.current) {
          // v0.74.0: Title без числа (например "MAX") — пользователь смотрит и всё прочитал
          notifCountRef.current[messengerId] = 0
          setUnreadCounts(prev => {
            if ((prev[messengerId] || 0) === 0) return prev
            return { ...prev, [messengerId]: 0 }
          })
        }
      })

      el.addEventListener('ipc-message', (e) => {
        if (e.channel === 'zoom-change') {
          const delta = e.args[0]?.delta || 0
          const cur = zoomLevelsRef.current[messengerId] || 100
          const clamped = Math.max(25, Math.min(200, Math.round((cur + delta) / 5) * 5))
          if (clamped === cur) return
          setZoomLevels(prev => { const next = { ...prev, [messengerId]: clamped }; saveZoomLevels(next); return next })
          animateZoom(messengerId, cur, clamped)
          return
        } else if (e.channel === 'zoom-reset') {
          const cur = zoomLevelsRef.current[messengerId] || 100
          setZoomLevels(prev => { const next = { ...prev, [messengerId]: 100 }; saveZoomLevels(next); return next })
          animateZoom(messengerId, cur, 100)
          return
        } else if (e.channel === 'unread-count') {
          // v0.72.8: unread-count IPC может ТОЛЬКО УВЕЛИЧИВАТЬ счётчик (для фоновых вкладок)
          // DOM-парсинг нестабилен — countUnread*() иногда возвращает 0 при ре-рендере DOM
          // v0.74.0: НО если пользователь СМОТРИТ на эту вкладку и DOM=0 — сброс (прочитал)
          const domCount = Number(e.args[0]) || 0
          const isViewing = activeIdRef.current === messengerId && windowFocusedRef.current
          // Сброс notifCountRef при просмотре — пользователь прочитал сообщения внутри мессенджера
          if (isViewing && domCount < (notifCountRef.current[messengerId] || 0)) {
            notifCountRef.current[messengerId] = domCount
          }
          const ipcCount = Math.max(domCount, notifCountRef.current[messengerId] || 0)
          setUnreadCounts(prev => {
            const prevCount = prev[messengerId] || 0
            // При просмотре — разрешаем уменьшение (пользователь видит реальный DOM)
            // В фоне — только увеличиваем (DOM может моргнуть в 0 при ре-рендере)
            const count = isViewing ? ipcCount : Math.max(ipcCount, prevCount)
            if (count === prevCount) return prev
            // Звук при увеличении счётчика (только если пользователь НЕ смотрит на этот чат)
            // Warm-up: при запуске счётчик идёт 0→N — не шуметь пока WebView не прогрелся
            if (count > prevCount && notifReadyRef.current[messengerId] && !(windowFocusedRef.current && activeIdRef.current === messengerId)) {
              const s = settingsRef.current
              const mn = (s.messengerNotifs || {})[messengerId] || {}
              const muted = !!(s.mutedMessengers || {})[messengerId]
              const sndOn = mn.sound !== undefined ? mn.sound : !muted
              // v0.62.6: дедупликация звука + логирование
              const lastSnd2 = lastSoundTsRef.current[messengerId] || 0
              const sinceLast2 = Date.now() - lastSnd2
              if (s.soundEnabled !== false && sndOn && sinceLast2 > 3000) {
                const mi = messengersRef.current.find(x => x.id === messengerId)
                playNotificationSound(mi?.color)
                lastSoundTsRef.current[messengerId] = Date.now()
                traceNotif('sound', 'pass', messengerId, `ipc +${count - prevCount}`, 'звук unread-count IPC')
              } else if (s.soundEnabled !== false && sndOn) {
                traceNotif('sound', 'block', messengerId, `ipc +${count - prevCount}`, `dedup ipc ${sinceLast2}мс назад`)
              }
            }
            return { ...prev, [messengerId]: count }
          })
          // Монитор прислал данные — значит работает
          setMonitorStatus(prev => ({ ...prev, [messengerId]: 'active' }))
        } else if (e.channel === 'unread-split') {
          // Раздельный счётчик: личные vs каналы
          const split = e.args[0]
          if (split) setUnreadSplit(prev => ({ ...prev, [messengerId]: split }))
        } else if (e.channel === 'monitor-diag') {
          // Диагностика DOM от monitor.preload — для отладки селекторов
          const diag = e.args[0]
          console.log(`[ChatCenter] 🔍 Диагностика DOM (${messengerId}):`, diag)
          setMonitorDiag(prev => ({ ...prev, [messengerId]: diag }))
        } else if (e.channel === 'new-message') {
          // Warm-up: игнорируем сообщения от MutationObserver первые 5 сек после dom-ready
          if (!notifReadyRef.current[messengerId]) {
            traceNotif('warmup', 'block', messengerId, (e.args[0] || '').slice(0, 50), 'warm-up 5с: IPC new-message заблокирован')
            return
          }
          const msgText = (e.args[0] || '').trim()
          if (!msgText) return
          // v0.59.0: Спам-фильтр IPC — базовые паттерны (Path 2 удалён, sidebar мусор не приходит)
          const isIpcSpam = /^\d{1,2}:\d{2}(:\d{2})?$/.test(msgText)
            || /^(\d+\s*(непрочитанн|новы[хе]?\s*сообщ)|только\s+что|online|в\s+сети|был[аи]?\s+(в\s+сети|online)|печата|записыва|набира|пишет|typing|ожидани[ея]\s+сети|connecting|reconnecting|updating)/i.test(msgText)
            || /^(вы:\s|you:\s)/i.test(msgText)
            || /\s+(в\s+сети|online|offline)\s*$/i.test(msgText)
            || /\s+назад\s*$/i.test(msgText)
          if (isIpcSpam) {
            traceNotif('spam', 'block', messengerId, msgText, 'спам-фильтр IPC new-message')
            return
          }
          // Per-messenger спам-фильтр
          const customSpamIpc = ((settingsRef.current.messengerNotifs || {})[messengerId] || {}).spamFilter
          if (customSpamIpc) {
            try { if (new RegExp(customSpamIpc, 'i').test(msgText)) { traceNotif('spam', 'block', messengerId, msgText, 'пользовательский спам-фильтр IPC'); return } } catch {}
          }
          // v0.60.2: per-messengerId dedup
          const midTsIpc = notifMidTsRef.current[messengerId]
          if (midTsIpc && Date.now() - midTsIpc < 3000) {
            traceNotif('dedup', 'block', messengerId, msgText, `mid-dedup IPC | __CC_NOTIF__ от ${messengerId} был ${Date.now()-midTsIpc}мс назад`)
            return
          }
          traceNotif('source', 'info', messengerId, msgText, 'IPC new-message | ожидание 500мс для __CC_NOTIF__')
          setTimeout(() => {
            const dedupKey = messengerId + ':' + msgText.slice(0, 60)
            if (!recentNotifsRef.current.has(dedupKey)) {
              traceNotif('source', 'warn', messengerId, msgText, 'IPC fallback | __CC_NOTIF__ не пришёл за 500мс')
              // Кэш sender fallback для IPC path
              const cached = senderCacheRef.current[messengerId]
              const extra = cached && Date.now() - cached.ts < 300000
                ? { senderName: cached.name, ...(cached.avatar ? (cached.avatar.startsWith('data:') ? { iconDataUrl: cached.avatar } : { iconUrl: cached.avatar }) : {}) }
                : undefined
              if (extra) {
                traceNotif('enrich', 'info', messengerId, msgText, `senderCache fallback IPC | "${cached.name.slice(0,20)}"`)
                // v0.60.0 Решение #2: sender-based dedup
                const senderKey = messengerId + ':' + cached.name.slice(0, 30).toLowerCase()
                const senderTs = notifSenderTsRef.current[senderKey]
                if (senderTs && Date.now() - senderTs < 3000) {
                  traceNotif('dedup', 'block', messengerId, msgText, `sender-dedup IPC | "${cached.name.slice(0,20)}" ${Date.now()-senderTs}мс назад`)
                  return
                }
              }
              handleNewMessage(messengerId, msgText, extra)
            } else {
              traceNotif('source', 'info', messengerId, msgText, 'IPC skip | уже обработан через __CC_NOTIF__')
            }
          }, 500)
        }
      })

      // ── console-message: перехват Notification + MutationObserver backup (v0.39.5) ──
      el.addEventListener('console-message', (e) => {
        const msg = e.message
        if (!msg) return
        // v0.57.0: debug трассировка ВСЕХ __CC_ сообщений — для диагностики проблем с уведомлениями
        if (msg.startsWith('__CC_')) {
          const ready = !!notifReadyRef.current[messengerId]
          // v0.60.0: полный текст сообщения без обрезки — убираем префикс __CC_XXX__
          const prefixEnd = msg.indexOf('__', 4)
          const prefix = prefixEnd > 0 ? msg.slice(0, prefixEnd + 2) : msg.slice(0, 12)
          const body = msg.slice(prefix.length).trim()
          traceNotif('debug', 'info', messengerId, body.slice(0, 200), `${prefix.trim()} | ready=${ready}`)
        }
        // ── __CC_BADGE_BLOCKED__: Telegram Badge API → точное число непрочитанных ──
        // v0.75.6: Используем как авторитетный источник — Telegram сам знает сколько непрочитанных
        if (msg.startsWith('__CC_BADGE_BLOCKED__:')) {
          const badgeVal = parseInt(msg.split(':')[1], 10)
          if (!isNaN(badgeVal)) {
            // Если Telegram сказал 0 и пользователь смотрит на эту вкладку → обнулить бейдж
            if (badgeVal === 0 && activeIdRef.current === messengerId && windowFocusedRef.current) {
              if (notifCountRef.current[messengerId] > 0) {
                console.log(`[BADGE] __CC_BADGE_BLOCKED__:0 + viewing → reset notifCountRef[${messengerId}]`)
                notifCountRef.current[messengerId] = 0
              }
              setUnreadCounts(prev => prev[messengerId] > 0 ? { ...prev, [messengerId]: 0 } : prev)
            }
          }
          return
        }
        // ── __CC_ACCOUNT__: имя профиля из accountScript ──
        if (msg.startsWith('__CC_ACCOUNT__')) {
          const name = msg.slice(14).trim()
          if (name && name.length > 1 && name.length < 80) {
            setAccountInfo(prev => ({ ...prev, [messengerId]: name }))
          }
          return
        }
        // ── __CC_MSG__: backup MutationObserver через console.log (v0.39.5) ──
        // Обогащаем данными отправителя из DOM активного чата (v0.47.0)
        if (msg.startsWith('__CC_MSG__')) {
          if (!notifReadyRef.current[messengerId]) {
            traceNotif('warmup', 'block', messengerId, msg.slice(10, 50), 'warm-up 5с: __CC_MSG__ заблокирован')
            return
          }
          const text = msg.slice(10).trim()
          if (!text) return
          // v0.60.0: Спам-фильтр — базовые паттерны + VK UI элементы (контекстное меню, placeholder)
          const isMsgSpam = /^\d{1,2}:\d{2}(:\d{2})?$/.test(text)
            // v0.76.0: Дата-разделители WhatsApp (DD.MM.YYYY, DD/MM/YYYY, "вчера", "сегодня", дни недели)
            || /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(text)
            || /^(вчера|сегодня|yesterday|today|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(text)
            || /^(\d+\s*(непрочитанн|новы[хе]?\s*сообщ)|только\s+что|online|в\s+сети|был[аи]?\s+(в\s+сети|online)|печата|записыва|набира|пишет|typing|ожидани[ея]\s+сети|connecting|reconnecting|updating)/i.test(text)
            || /^(вы:\s|you:\s)/i.test(text)
            || /\s+(в\s+сети|online|offline)\s*$/i.test(text)
            || /\s+назад\s*$/i.test(text)
            // v0.60.0: VK UI — контекстное меню, placeholder "Сообщение", системные кнопки
            || /^(переслать|отметить|скопировать|удалить|выбрать|ответить|пожаловаться|закрепить|редактировать|сообщение)$/i.test(text)
            || (/(переслать|отметить как новое|скопировать текст|удалить|выбрать)/i.test(text) && text.length < 100)
            // v0.75.8: WhatsApp UI-артефакты — alt-тексты иконок (только латиница через дефис, без пробелов)
            // Примеры: "default-contact-refreshed", "status-dblcheckic-image...", "status-time", "default-user"
            || /^[a-z]+-[a-z-]+(ic-image)?.*$/i.test(text.split(/\s/)[0]) && !/\s/.test(text.trim()) && text.length < 60
          if (isMsgSpam) {
            traceNotif('spam', 'block', messengerId, text, 'спам-фильтр __CC_MSG__')
            return
          }
          // Per-messenger спам-фильтр (v0.56.0)
          const customSpam = ((settingsRef.current.messengerNotifs || {})[messengerId] || {}).spamFilter
          if (customSpam) {
            try { if (new RegExp(customSpam, 'i').test(text)) { traceNotif('spam', 'block', messengerId, text, 'пользовательский спам-фильтр'); return } } catch {}
          }
          // v0.60.2: per-messengerId dedup — если __CC_NOTIF__ от этого мессенджера был <3 сек назад
          const midTs = notifMidTsRef.current[messengerId]
          if (midTs && Date.now() - midTs < 3000) {
            traceNotif('dedup', 'block', messengerId, text, `mid-dedup __CC_MSG__ | __CC_NOTIF__ от ${messengerId} был ${Date.now()-midTs}мс назад`)
            return
          }
          traceNotif('source', 'info', messengerId, text, '__CC_MSG__ | ожидание enriched __CC_NOTIF__ 200мс')
          // Приоритет enriched: ждём 200мс — если __CC_NOTIF__ придёт с enriched данными, он отменит этот таймер
          // Если не придёт — запускаем собственное enrichment через DOM
          const pendingKey = messengerId + ':' + text.slice(0, 40)
          // Отменяем предыдущий pending для того же текста
          if (pendingMsgRef.current.has(pendingKey)) clearTimeout(pendingMsgRef.current.get(pendingKey).timer)
          const safeBody = JSON.stringify(text)
          const safeSlice = JSON.stringify(text.slice(0, 30))
          const pendingTimer = setTimeout(() => {
            pendingMsgRef.current.delete(pendingKey)
            traceNotif('enrich', 'info', messengerId, text, '__CC_MSG__ | enriched NOTIF не пришёл → DOM enrichment')
            el.executeJavaScript(`(function() {
            try {
              var name = '', avatar = '';
              // 1. Header активного чата — расширенные селекторы (TG/MAX/Generic)
              // MAX (SvelteKit): .topbar.svelte-* → первый child div содержит имя
              var headerSels = [
                // v0.59.2: VK реальные классы
                '.ConvoHeader__info',
                // v0.60.0: MAX реальные классы — .topbar .headerWrapper содержит "Окно чата с ИмяФамилия"
                '.topbar .headerWrapper',
                '.chat-info .peer-title', '.topbar .peer-title',
                '.topbar [class*="info" i] [class*="title" i]',
                '.topbar [class*="info" i] [class*="name" i]',
                '[class*="chat-header" i] [class*="title" i]',
                '[class*="top-bar" i] [class*="title" i]',
                '[class*="topbar" i] [class*="name" i]',
                '[class*="chat-header" i] [class*="name" i]',
                'header [class*="title" i]', 'header [class*="name" i]'
              ];
              for (var si = 0; si < headerSels.length; si++) {
                var h = document.querySelector(headerSels[si]);
                if (h) {
                  var hn = (h.textContent || '').trim();
                  // v0.59.2: VK "Елена Дугинаonline" → чистим статус
                  hn = hn.replace(/\s*(online|offline|был[аи]?\s*(в\s+сети)?|в\s+сети|печатает|typing)\s*$/i, '').trim();
                  // v0.60.0: MAX "Окно чата с ИмяФамилия" → убираем префикс
                  hn = hn.replace(/^окно\s+чата\s+с\s+/i, '').trim();
                  // v0.60.2: MAX textContent дублирует имя ("Иванов Иван     Иванов Иван") → дедупликация
                  if (hn.length > 10) {
                    var halfN = Math.ceil(hn.length / 2);
                    var p1N = hn.slice(0, halfN).trim();
                    var p2N = hn.slice(halfN).trim();
                    if (p1N === p2N) hn = p1N;
                  }
                  if (hn && hn.length >= 2 && hn.length <= 80) { name = hn; break; }
                }
              }
              // MAX fallback: .topbar содержит "Окно чата с ИмяФамилия" — извлекаем имя из первого div > div
              if (!name) {
                var tb = document.querySelector('.topbar');
                if (tb) {
                  // Ищем первый элемент с коротким текстом (имя чата) среди children
                  var tbKids = tb.querySelectorAll('div, span, h1, h2, h3');
                  for (var ti = 0; ti < tbKids.length && ti < 20; ti++) {
                    var tbText = (tbKids[ti].textContent || '').trim();
                    // Пропускаем длинные тексты (весь .topbar textContent), статусы, пустые
                    if (tbText.length < 2 || tbText.length > 60) continue;
                    if (/^(был|была|в сети|online|offline|печатает|typing|окно чата)/i.test(tbText)) continue;
                    // Первый подходящий — имя чата
                    name = tbText;
                    break;
                  }
                }
              }
              if (name) {
                var av = document.querySelector('.chat-info img.avatar-photo, .topbar img.avatar-photo, .chat-info [class*="avatar" i] img, header img[class*="avatar" i], header [class*="avatar" i] img');
                if (av && av.src && av.src.startsWith('http')) avatar = av.src;
              }
              // 2. Активный/выделенный чат в sidebar (не зависит от обновления preview)
              if (!name) {
                var activeSels = ['.chatlist-chat.active', '.chatlist-chat.selected', '[class*="chat"][class*="active" i]', '[class*="dialog"][class*="active" i]', '[class*="conversation"][class*="active" i]'];
                for (var ai = 0; ai < activeSels.length; ai++) {
                  var act = document.querySelector(activeSels[ai]);
                  if (!act) continue;
                  var pt0 = act.querySelector('.peer-title, [class*="title" i], [class*="name" i]');
                  var nm0 = pt0 ? (pt0.textContent || '').trim() : '';
                  if (nm0 && nm0.length >= 2 && nm0.length <= 80) {
                    name = nm0;
                    var avAct = act.querySelector('img.avatar-photo, [class*="avatar"] img, canvas.avatar-photo');
                    if (avAct && avAct.tagName === 'IMG' && avAct.src && avAct.src.startsWith('http')) avatar = avAct.src;
                    break;
                  }
                }
              }
              // 3. Поиск по тексту в chatlist (fallback)
              if (!name) {
                var bodySlice = ${safeSlice};
                var chats = document.querySelectorAll('.chatlist-chat');
                for (var i = 0; i < chats.length && i < 50; i++) {
                  if ((chats[i].textContent || '').indexOf(bodySlice) === -1) continue;
                  var pt = chats[i].querySelector('.peer-title');
                  var nm = pt ? (pt.textContent || '').trim() : '';
                  if (!nm) continue;
                  name = nm;
                  var avEl = chats[i].querySelector('img.avatar-photo, [class*="avatar"] img');
                  if (avEl && avEl.src && avEl.src.startsWith('http')) avatar = avEl.src;
                  break;
                }
              }
              if (window.__cc_notif_log) {
                window.__cc_notif_log.push({ ts: Date.now(), status: 'passed', title: name || '', body: (${safeBody}).slice(0, 200), tag: '', reason: 'addedNodes', enrichedTitle: name || '' });
                if (window.__cc_notif_log.length > 100) window.__cc_notif_log.shift();
              }
              return JSON.stringify({ n: name, a: avatar });
            } catch(e) { return ''; }
          })()`)
            .then(result => {
              const extra = {}
              if (result) {
                try {
                  const info = JSON.parse(result)
                  if (info.n) {
                    // v0.60.2: belt-and-suspenders strip после executeJavaScript
                    let sn = info.n.trim()
                    sn = sn.replace(/^окно\s+чата\s+с\s+/i, '').trim()
                    sn = sn.replace(/\s*(online|offline|был[аи]?\s*(в\s+сети)?|в\s+сети|печатает|typing)\s*$/i, '').trim()
                    // Убираем дубль имени: "Иванов Иван     Иванов Иван" → "Иванов Иван"
                    if (sn.length > 10) {
                      const half = Math.ceil(sn.length / 2)
                      const p1 = sn.slice(0, half).trim()
                      const p2 = sn.slice(half).trim()
                      if (p1 === p2) sn = p1
                    }
                    extra.senderName = sn
                  }
                  if (info.a) {
                    if (info.a.startsWith('data:')) extra.iconDataUrl = info.a
                    else if (info.a.startsWith('http')) extra.iconUrl = info.a
                  }
                } catch {}
              }
              // Кэш sender (улучшение #3) — сохраняем при успехе, используем при неудаче
              if (extra.senderName) {
                senderCacheRef.current[messengerId] = { name: extra.senderName, avatar: extra.iconUrl || extra.iconDataUrl || '', ts: Date.now() }
              } else {
                const cached = senderCacheRef.current[messengerId]
                if (cached && Date.now() - cached.ts < 300000) { // 5 мин
                  extra.senderName = cached.name
                  if (cached.avatar && !extra.iconUrl && !extra.iconDataUrl) {
                    if (cached.avatar.startsWith('data:')) extra.iconDataUrl = cached.avatar
                    else extra.iconUrl = cached.avatar
                  }
                  traceNotif('enrich', 'info', messengerId, text, `senderCache fallback | "${cached.name.slice(0,20)}" age=${Math.round((Date.now()-cached.ts)/1000)}с`)
                }
              }
              traceNotif('enrich', extra.senderName ? 'pass' : 'warn', messengerId, text, `__CC_MSG__ enriched | sender="${(extra.senderName||'нет').slice(0,20)}" icon=${!!(extra.iconUrl||extra.iconDataUrl)}`)
              // v0.60.0 Решение #2: sender-based dedup — если __CC_NOTIF__ уже обработан для этого sender
              if (extra.senderName) {
                const senderKey = messengerId + ':' + extra.senderName.slice(0, 30).toLowerCase()
                const senderTs = notifSenderTsRef.current[senderKey]
                if (senderTs && Date.now() - senderTs < 3000) {
                  traceNotif('dedup', 'block', messengerId, text, `sender-dedup | __CC_NOTIF__ от "${extra.senderName.slice(0,20)}" был ${Date.now()-senderTs}мс назад`)
                  return
                }
              }
              // v0.58.1: Если текст = имя отправителя → медиа без текста (стикер, фото, GIF)
              let finalText = text
              if (extra.senderName && text.trim().toLowerCase() === extra.senderName.trim().toLowerCase()) {
                finalText = '📎 Медиа'
                traceNotif('enrich', 'info', messengerId, text, `текст = sender "${extra.senderName.slice(0,20)}" → заменён на "📎 Медиа"`)
              }
              handleNewMessage(messengerId, finalText, Object.keys(extra).length ? extra : undefined)
            })
            .catch(() => {
              traceNotif('enrich', 'warn', messengerId, text, '__CC_MSG__ enrichment failed')
              // Кэш sender fallback
              const cached = senderCacheRef.current[messengerId]
              if (cached && Date.now() - cached.ts < 300000) {
                const extra = { senderName: cached.name }
                if (cached.avatar) { if (cached.avatar.startsWith('data:')) extra.iconDataUrl = cached.avatar; else extra.iconUrl = cached.avatar }
                // v0.58.1: текст = sender → медиа
                const ft = (text.trim().toLowerCase() === cached.name.trim().toLowerCase()) ? '📎 Медиа' : text
                handleNewMessage(messengerId, ft, extra)
              } else {
                handleNewMessage(messengerId, text)
              }
            })
          }, 200) // 200мс ожидание enriched __CC_NOTIF__
          pendingMsgRef.current.set(pendingKey, { timer: pendingTimer, messengerId, text })
          return
        }
        if (!msg.startsWith('__CC_NOTIF__')) return
        // Warm-up: игнорируем уведомления до готовности (5 сек после dom-ready)
        if (!notifReadyRef.current[messengerId]) {
          try {
            const d = JSON.parse(msg.slice(12))
            traceNotif('warmup', 'block', messengerId, (d.b || '').slice(0, 50), `warm-up 5с: __CC_NOTIF__ заблокирован | t="${(d.t||'').slice(0,20)}"`)
          } catch { traceNotif('warmup', 'block', messengerId, msg.slice(12, 50), 'warm-up 5с: __CC_NOTIF__ заблокирован') }
          return
        }
        try {
          const data = JSON.parse(msg.slice(12)) // после '__CC_NOTIF__'
          const text = (data.b || '').trim()
          traceNotif('source', 'info', messengerId, text, `__CC_NOTIF__ | t="${(data.t||'').slice(0,20)}" icon=${!!data.i} tag=${!!data.g}`)
          // Фильтр: timestamp / системный текст / исходящее ("Вы: ...") / MAX системные / статусы
          const isSpam = /^\d{1,2}:\d{2}(:\d{2})?$/.test(text)
            || /^(\d+\s*(непрочитанн|новы[хе]?\s*сообщ)|минуту?\s+назад|секунд\w*\s+назад|час\w*\s+назад|только\s+что|online|в\s+сети|был[аи]?\s+(в\s+сети|online)|печата|записыва|набира|пишет|typing)/i.test(text)
            || /^(вы:\s|you:\s)/i.test(text)
            || /^(ожидани[ея]\s+сети|connecting|reconnecting|updating|загрузк[аи]|обновлени[ея]|подключени[ея])/i.test(text)
            || /\s+(в\s+сети|online|offline|был[аи]?\s+(в\s+сети|недавно|давно))\s*$/i.test(text)
            || /^(сообщение|пропущенный\s*(вызов|звонок)|входящий\s*(вызов|звонок)|missed\s*call|message)$/i.test(text)
            || /\s+назад\s*$/i.test(text) || /^(час|минуту?|секунду?)\s+назад$/i.test(text)
          if (isSpam) {
            traceNotif('spam', 'block', messengerId, text, 'спам-фильтр __CC_NOTIF__')
            return
          }
          // Per-messenger спам-фильтр (v0.56.0)
          const customSpamN = ((settingsRef.current.messengerNotifs || {})[messengerId] || {}).spamFilter
          if (customSpamN && text) {
            try { if (new RegExp(customSpamN, 'i').test(text)) { traceNotif('spam', 'block', messengerId, text, 'пользовательский спам-фильтр'); return } } catch {}
          }
          if (text && !isSpam) {
            // Дедупликация: Telegram шлёт Notification + ServiceWorker.showNotification → 2 __CC_NOTIF__
            // Нормализуем body: убираем trailing timestamps (вида "15:57" или "15:5715:57")
            const normalizedText = text.replace(/\d{1,2}:\d{2}(:\d{2})?/g, '').trim()
            const dedupKey = messengerId + ':' + (normalizedText || text).slice(0, 40)
            const now = Date.now()
            if (notifDedupRef.current.has(dedupKey) && now - notifDedupRef.current.get(dedupKey) < 5000) {
              traceNotif('dedup', 'block', messengerId, text, `notifDedup | age=${now - notifDedupRef.current.get(dedupKey)}мс`)
              return
            }
            notifDedupRef.current.set(dedupKey, now)
            // Очистка старых записей
            if (notifDedupRef.current.size > 30) {
              for (const [k, ts] of notifDedupRef.current) { if (now - ts > 15000) notifDedupRef.current.delete(k) }
            }
            // Приоритет enriched: если есть pending __CC_MSG__ для того же текста — отменить его
            const pendingKey = messengerId + ':' + text.slice(0, 40)
            const pending = pendingMsgRef.current.get(pendingKey)
            if (pending) {
              clearTimeout(pending.timer)
              pendingMsgRef.current.delete(pendingKey)
              traceNotif('enrich', 'pass', messengerId, text, '__CC_NOTIF__ отменил pending __CC_MSG__ — enriched приоритет')
            }
            // data.t = title (имя отправителя), data.i = icon URL (аватарка)
            const extra = {}
            if (data.t) extra.senderName = data.t
            if (data.g) extra.chatTag = data.g
            if (data.i) {
              if (data.i.startsWith('data:')) {
                extra.iconDataUrl = data.i
              } else if (data.i.startsWith('http') || data.i.startsWith('blob:')) {
                extra.iconUrl = data.i
              } else if (data.i.startsWith('/')) {
                const mi = messengersRef.current.find(x => x.id === messengerId)
                if (mi?.url) { try { extra.iconUrl = new URL(data.i, mi.url).href } catch {} }
              }
            }
            // Кэш sender (улучшение #3)
            if (extra.senderName) {
              senderCacheRef.current[messengerId] = { name: extra.senderName, avatar: extra.iconUrl || extra.iconDataUrl || '', ts: Date.now() }
            }
            // v0.58.0: fromNotifAPI=true → пропускаем viewing-блок
            // Если мессенджер сам вызвал showNotification — пользователь НЕ видит этот чат
            extra.fromNotifAPI = true
            // v0.60.0 Решение #2: записываем sender+timestamp — блокируем __CC_MSG__ от того же sender
            if (extra.senderName) {
              notifSenderTsRef.current[messengerId + ':' + extra.senderName.slice(0, 30).toLowerCase()] = Date.now()
            }
            // v0.60.2: per-messengerId dedup — блокируем __CC_MSG__ от этого мессенджера на 3 сек
            notifMidTsRef.current[messengerId] = Date.now()
            handleNewMessage(messengerId, text, extra)
          }
        } catch {}
      })
    }
  }

  // ── Контекстное меню вкладки ────────────────────────────────────────────
  const handleTabContextAction = (action) => {
    const id = contextMenuTab?.id
    setContextMenuTab(null)
    if (!id) return
    const wv = webviewRefs.current[id]
    if (action === 'reload') {
      if (wv) { try { wv.reload() } catch {} }
      setMonitorStatus(prev => ({ ...prev, [id]: 'loading' }))
    } else if (action === 'diag') {
      if (wv) { try { wv.send('run-diagnostics') } catch {} }
    } else if (action === 'diagFull') {
      // Расширенная диагностика: localStorage, sessionStorage, IndexedDB, cookies, DOM avatars
      if (wv) {
        wv.executeJavaScript(`(async () => {
          var r = { url: location.href, title: document.title }
          r.localStorage = {}
          try { for (var i = 0; i < Math.min(localStorage.length, 50); i++) {
            var k = localStorage.key(i); r.localStorage[k] = (localStorage.getItem(k) || '').substring(0, 200)
          }} catch(e) { r.localStorageError = e.message }
          r.sessionStorage = {}
          try { for (var i = 0; i < Math.min(sessionStorage.length, 50); i++) {
            var k = sessionStorage.key(i); r.sessionStorage[k] = (sessionStorage.getItem(k) || '').substring(0, 200)
          }} catch(e) { r.sessionStorageError = e.message }
          try { r.cookies = document.cookie.split(';').slice(0, 30).map(function(c){ return c.trim().split('=')[0] }) } catch(e) {}
          r.indexedDB = []
          try {
            var dbs = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : []
            for (var d = 0; d < dbs.length; d++) {
              var info = { name: dbs[d].name, version: dbs[d].version, stores: [] }
              try {
                var db = await new Promise(function(ok) {
                  var req = indexedDB.open(dbs[d].name)
                  req.onsuccess = function(){ok(req.result)}
                  req.onerror = function(){ok(null)}
                  req.onupgradeneeded = function(){req.transaction.abort();ok(null)}
                })
                if (db) { info.stores = Array.from(db.objectStoreNames); db.close() }
              } catch(e) { info.error = e.message }
              r.indexedDB.push(info)
            }
          } catch(e) { r.indexedDBError = e.message }
          r.avatarImages = []
          try {
            var imgs = document.querySelectorAll('img')
            for (var i = 0; i < imgs.length && i < 30; i++) {
              if (imgs[i].width >= 20 && imgs[i].width <= 80 && imgs[i].height >= 20)
                r.avatarImages.push({ src: (imgs[i].src||'').substring(0,200), size: imgs[i].width+'x'+imgs[i].height, cls: (imgs[i].className||'').substring(0,60), parentCls: (imgs[i].parentElement?.className||'').substring(0,80) })
            }
          } catch(e) {}
          r.avatarElements = []
          try {
            var avs = document.querySelectorAll('[class*="avatar" i], [class*="Avatar"], [class*="photo" i], [class*="Photo"]')
            for (var i = 0; i < avs.length && i < 20; i++) {
              var bg = ''; try { bg = getComputedStyle(avs[i]).backgroundImage; if (bg==='none') bg='' } catch(e){}
              var ch = avs[i].querySelector('img')
              r.avatarElements.push({ tag: avs[i].tagName, cls: (avs[i].className||'').substring(0,80), bg: bg?bg.substring(0,200):'', childImg: ch?(ch.src||'').substring(0,200):'' })
            }
          } catch(e) {}
          r.notifHooked = !!window.__cc_notif_hooked
          return JSON.stringify(r, null, 2)
        })()`)
          .then(json => {
            console.log('[ChatCenter] 🧪 Полная диагностика (' + id + '):', json)
            navigator.clipboard.writeText(json).catch(() => {})
            window.api.invoke('app:custom-notify', { title: 'Диагностика', body: 'Полная диагностика ' + id + ' → буфер обмена', color: '#2AABEE', emoji: '🔍', messengerName: 'ЦентрЧатов', messengerId: id }).catch(() => {})
          })
          .catch(err => console.error('[ChatCenter] Ошибка диагностики:', err))
      }
    } else if (action === 'diagDOM') {
      // v0.74.3: Скан DOM-структуры WhatsApp для поиска актуальных селекторов
      if (wv) {
        wv.executeJavaScript(`(() => {
          var r = { url: location.href, title: document.title, ts: Date.now() }
          // 1. Проверяем известные селекторы контейнеров
          var containerSels = [
            '[role="application"]', '#app', '#main', '#side',
            '[data-testid="chat-list"]', '[data-testid="conversation-panel-messages"]',
            '[data-testid="chatlist-header"]', '[data-testid="default-user"]',
            '#main [class*="message-list"]', '[role="main"]', '[role="grid"]',
            '[role="listbox"]', '[role="list"]', '[data-tab]',
            '[aria-label*="chat" i]', '[aria-label*="Chat" i]',
            '[aria-label*="message" i]', '[aria-label*="Message" i]',
            'div[tabindex="-1"]'
          ]
          r.selectors = {}
          for (var s of containerSels) {
            try {
              var els = document.querySelectorAll(s)
              if (els.length > 0) {
                r.selectors[s] = []
                for (var i = 0; i < Math.min(els.length, 3); i++) {
                  var el = els[i]
                  r.selectors[s].push({
                    tag: el.tagName,
                    id: el.id || '',
                    cls: (el.className || '').substring(0, 120),
                    role: el.getAttribute('role') || '',
                    testid: el.getAttribute('data-testid') || '',
                    childCount: el.children ? el.children.length : 0,
                    rect: { w: el.offsetWidth, h: el.offsetHeight }
                  })
                }
              }
            } catch(e) {}
          }
          // 2. DOM-дерево от body на 4 уровня — tag, id, class, role, data-testid, childCount
          function scanTree(el, depth) {
            if (!el || depth > 4) return null
            var info = {
              tag: el.tagName,
              id: el.id || undefined,
              cls: (el.className && typeof el.className === 'string') ? el.className.substring(0, 100) : undefined,
              role: el.getAttribute ? (el.getAttribute('role') || undefined) : undefined,
              testid: el.getAttribute ? (el.getAttribute('data-testid') || undefined) : undefined,
              kids: el.children ? el.children.length : 0
            }
            if (depth < 4 && el.children && el.children.length <= 20) {
              info.ch = []
              for (var c = 0; c < el.children.length; c++) {
                info.ch.push(scanTree(el.children[c], depth + 1))
              }
            }
            return info
          }
          r.domTree = scanTree(document.body, 0)
          // 3. Все элементы с data-testid
          r.testids = []
          try {
            var tels = document.querySelectorAll('[data-testid]')
            for (var i = 0; i < Math.min(tels.length, 50); i++) {
              r.testids.push({
                testid: tels[i].getAttribute('data-testid'),
                tag: tels[i].tagName,
                cls: (tels[i].className || '').substring(0, 60),
                kids: tels[i].children ? tels[i].children.length : 0
              })
            }
          } catch(e) {}
          // 4. Все элементы с role
          r.roles = []
          try {
            var rels = document.querySelectorAll('[role]')
            for (var i = 0; i < Math.min(rels.length, 50); i++) {
              r.roles.push({
                role: rels[i].getAttribute('role'),
                tag: rels[i].tagName,
                id: rels[i].id || '',
                cls: (rels[i].className || '').substring(0, 60),
                kids: rels[i].children ? rels[i].children.length : 0
              })
            }
          } catch(e) {}
          return JSON.stringify(r, null, 2)
        })()`)
          .then(json => {
            console.log('[ChatCenter] 🏗️ DOM-скан (' + id + '):', json)
            navigator.clipboard.writeText(json).catch(() => {})
            window.api.invoke('app:custom-notify', { title: 'DOM-скан', body: 'DOM-структура ' + id + ' → буфер обмена (Ctrl+V чтобы вставить)', color: '#2AABEE', emoji: '🏗️', messengerName: 'ЦентрЧатов', messengerId: id }).catch(() => {})
          })
          .catch(err => console.error('[ChatCenter] Ошибка DOM-скана:', err))
      }
    } else if (action === 'diagAccount') {
      // Пошаговый тест accountScript — выполняет ТОТ ЖЕ код и показывает результат каждого шага
      if (wv) {
        wv.executeJavaScript(`(async () => {
          var r = { steps: [] }
          var BL = /^(max|макс|мессенджер|messenger|vk|app|undefined|null|true|false|test|user|admin|guest|default|профиль|profile)$/i
          var CK = '__cc_account_name'
          function valid(n) {
            if (!n || typeof n !== 'string') return null
            n = n.trim()
            return (n.length > 1 && n.length < 60 && !BL.test(n)) ? n : null
          }
          // Step 0: cache
          var cached = localStorage.getItem(CK)
          r.steps.push({ step: '0_cache', cached: cached, valid: !!valid(cached) })
          // Step 1: direct selectors on current page
          var ni = document.querySelector('input[placeholder="Имя"]')
          r.steps.push({ step: '1_inputИмя', found: !!ni, value: ni ? ni.value : null })
          var pe = document.querySelector('.phone')
          r.steps.push({ step: '1_phone', found: !!pe, text: pe ? pe.textContent.substring(0,30) : null })
          var pc = document.querySelector('button.profile')
          r.steps.push({ step: '1_buttonProfile', found: !!pc, text: pc ? pc.textContent.trim().substring(0,60) : null })
          // Step 2: find profile button
          var btn = document.querySelector('.item.settings button')
          r.steps.push({ step: '2_profileBtn', found: !!btn, tag: btn ? btn.tagName : null, cls: btn ? (btn.className||'').substring(0,60) : null })
          if (!btn) {
            r.steps.push({ step: '2_ABORT', reason: 'profile button not found' })
            return JSON.stringify(r, null, 2)
          }
          // Step 3: click
          try { btn.click(); r.steps.push({ step: '3_click', ok: true }) } catch(e) { r.steps.push({ step: '3_click', error: e.message }) }
          // Step 4: wait 3s
          await new Promise(function(ok) { setTimeout(ok, 3000) })
          r.steps.push({ step: '4_waited', url: location.href })
          // Step 5: read after navigation
          ni = document.querySelector('input[placeholder="Имя"]')
          r.steps.push({ step: '5_inputИмя_after', found: !!ni, value: ni ? ni.value : null, valid: ni ? !!valid(ni.value) : false })
          pe = document.querySelector('.phone')
          r.steps.push({ step: '5_phone_after', found: !!pe, text: pe ? pe.textContent.substring(0,30) : null })
          pc = document.querySelector('button.profile')
          r.steps.push({ step: '5_buttonProfile_after', found: !!pc, text: pc ? pc.textContent.trim().substring(0,60) : null })
          // Step 6: what would accountScript return?
          var result = null
          if (ni && valid(ni.value)) { result = ni.value.trim() }
          else if (pc) {
            var t2 = pc.textContent.trim()
            var pm2 = t2.match(/\\+7\\d{10}/)
            if (pm2) { var nm = t2.split(pm2[0])[0].trim(); result = valid(nm) || pm2[0] }
          }
          else if (pe) { var ph2 = pe.textContent.match(/\\+7\\d{10}/); if (ph2) result = ph2[0] }
          r.steps.push({ step: '6_result', wouldReturn: result })
          // Step 7: go back
          history.back()
          return JSON.stringify(r, null, 2)
        })()`)
          .then(json => {
            console.log('[ChatCenter] 👤 Тест accountScript (' + id + '):', json)
            navigator.clipboard.writeText(json).catch(() => {})
            window.api.invoke('app:custom-notify', { title: 'Тест accountScript', body: 'Результат в буфере обмена', color: '#2AABEE', emoji: '👤', messengerName: 'ЦентрЧатов', messengerId: id }).catch(() => {})
          })
          .catch(err => {
            var errMsg = JSON.stringify({ error: err.message || String(err) })
            console.error('[ChatCenter] ОШИБКА теста accountScript:', err)
            navigator.clipboard.writeText(errMsg).catch(() => {})
            window.api.invoke('app:custom-notify', { title: 'ОШИБКА accountScript', body: err.message || String(err), color: '#EF4444', emoji: '⚠️', messengerName: 'ЦентрЧатов', messengerId: id }).catch(() => {})
          })
      }
    } else if (action === 'notifLog') {
      // Лог уведомлений — извлекаем массив из WebView main world + pipeline trace
      if (wv) {
        const trace = pipelineTraceRef.current.filter(e => !e.mid || e.mid === id)
        wv.executeJavaScript(`(function() { return JSON.stringify(window.__cc_notif_log || []); })()`)
          .then(json => {
            try {
              const log = JSON.parse(json)
              const mInfo = messengers.find(x => x.id === id)
              setNotifLogModal({ messengerId: id, name: mInfo?.name || id, log, trace })
              setNotifLogTab('log')
            } catch {}
          })
          .catch(() => {
            setNotifLogModal({ messengerId: id, name: id, log: [], trace })
            setNotifLogTab('log')
          })
      }
    } else if (action === 'copyUrl') {
      const m = messengers.find(x => x.id === id)
      if (m?.url) navigator.clipboard.writeText(m.url).catch(() => {})
    } else if (action === 'edit') {
      const m = messengersRef.current.find(x => x.id === id)
      if (m) setEditingMessenger({ ...m })
    } else if (action === 'pin') {
      togglePinTab(id)
    } else if (action === 'close') {
      askRemoveMessenger(id)
    }
  }

  // ── Pin/unpin вкладки ────────────────────────────────────────────────────
  const pinnedTabs = settings.pinnedTabs || {}
  const togglePinTab = useCallback((id) => {
    const cur = settingsRef.current.pinnedTabs || {}
    const next = { ...cur }
    if (next[id]) { delete next[id] } else { next[id] = true }
    const updated = { ...settingsRef.current, pinnedTabs: next }
    settingsRef.current = updated
    setSettings(updated)
    window.api.invoke('settings:save', updated).catch(() => {})
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)
  const theme = settings.theme || 'dark'
  const currentZoom = zoomLevels[activeId] || 100

  // v0.74.1: Overlay badge с раздельным счётчиком личные/каналы
  const overlayTimerRef = useRef(null)
  // Суммарный счётчик личных сообщений (из unreadSplit)
  const totalPersonal = Object.entries(unreadSplit).reduce((sum, [id, split]) => {
    if (split && split.personal > 0) return sum + split.personal
    return sum
  }, 0)
  // Для мессенджеров без split (MAX, VK, WhatsApp) — весь unreadCount считаем личным
  const totalPersonalWithFallback = Object.entries(unreadCounts).reduce((sum, [id, count]) => {
    if (count <= 0) return sum
    const split = unreadSplit[id]
    if (split) return sum + (split.personal || 0)
    return sum + count // нет split → всё считаем личным
  }, 0)
  // v0.74.5: Суммарный счётчик каналов (из unreadSplit)
  const totalChannels = Object.entries(unreadSplit).reduce((sum, [id, split]) => {
    if (split && split.channels > 0) return sum + split.channels
    return sum
  }, 0)
  useEffect(() => {
    const details = Object.entries(unreadCounts).filter(([,v]) => v > 0).map(([id, v]) => {
      const m = messengers.find(x => x.id === id)
      const split = unreadSplit[id]
      const extra = split ? ` (💬${split.personal} 📢${split.channels})` : ''
      return `${(m?.name || id).slice(0, 8)}:${v}${extra}`
    }).join(' ')
    console.log(`[BADGE] total=${totalUnread} personal=${totalPersonalWithFallback} channels=${totalChannels} [${details}]`)

    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current)
    overlayTimerRef.current = setTimeout(() => {
      const breakdown = Object.entries(unreadCounts)
        .filter(([, v]) => v > 0)
        .map(([id, v]) => {
          const m = messengers.find(x => x.id === id)
          const split = unreadSplit[id]
          return { name: m?.name || id, count: v, personal: split?.personal, channels: split?.channels }
        })
      const overlayMode = settingsRef.current.overlayMode || 'personal'
      console.log(`[BADGE] FIRE tray:set-badge count=${totalUnread} personal=${totalPersonalWithFallback} channels=${totalChannels} mode=${overlayMode}`)
      window.api.invoke('tray:set-badge', { count: totalUnread, personal: totalPersonalWithFallback, channels: totalChannels, breakdown, overlayMode })
    }, 500)
    return () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current) }
  }, [totalUnread, totalPersonalWithFallback, totalChannels, settings.overlayMode])

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--cc-bg)' }} onClick={() => contextMenuTab && setContextMenuTab(null)}>

      {/* ── Шапка ── */}
      <div
        className="flex items-center h-[48px] shrink-0 select-none"
        style={{
          backgroundColor: 'var(--cc-surface)',
          borderBottom: '1px solid var(--cc-border)',
          WebkitAppRegion: 'drag',
        }}
      >
        {/* Ручка перетаскивания */}
        <div
          className="flex items-center justify-center w-[28px] h-full shrink-0 cursor-grab"
          title="Перетащить окно"
        >
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
            {[0, 6].map(x => [2, 6, 10].map(y => (
              <circle key={`${x}-${y}`} cx={x + 2} cy={y} r={1.2} fill="var(--cc-icon)" />
            )))}
          </svg>
        </div>

        {/* Логотип */}
        <div
          className="pr-3 text-[13px] font-semibold whitespace-nowrap shrink-0"
          style={{ color: 'var(--cc-text-dim)' }}
        >
          ЦентрЧатов
        </div>

        {/* Вкладки — no-drag */}
        <div
          className="flex items-center flex-1 overflow-x-auto h-full min-w-0"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          {messengers.map(m => (
            <MessengerTab
              key={m.id}
              messenger={m}
              isActive={activeId === m.id}
              accountInfo={accountInfo[m.id]}
              unreadCount={unreadCounts[m.id] || 0}
              unreadSplit={unreadSplit[m.id]}
              messagePreview={messagePreview[m.id]}
              zoomLevel={zoomLevels[m.id]}
              monitorStatus={monitorStatus[m.id]}
              isPageLoading={!!webviewLoading[m.id]}
              isNew={newMessageIds.has(m.id)}
              isPinned={!!pinnedTabs[m.id]}
              isDragOver={dragOverId === m.id}
              onClick={() => handleTabClick(m.id)}
              onClose={() => { if (!pinnedTabs[m.id]) askRemoveMessenger(m.id) }}
              onContextMenu={(e) => { e.preventDefault(); setContextMenuTab({ id: m.id, x: e.clientX, y: e.clientY }) }}
              onDragStart={() => handleDragStart(m.id)}
              onDragOver={() => handleDragOver(m.id)}
              onDrop={() => handleDrop(m.id)}
              onDragEnd={handleDragEnd}
            />
          ))}

          {/* Кнопка «+» */}
          <button
            onClick={() => setShowAddModal(true)}
            title="Добавить мессенджер (Ctrl+T)"
            className="flex items-center justify-center h-[30px] w-[30px] rounded-lg ml-1 text-xl leading-none transition-all duration-150 cursor-pointer shrink-0"
            style={{ color: 'var(--cc-icon)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' }}
          >+</button>
        </div>

        {/* Правые кнопки — no-drag */}
        <div
          className="flex items-center gap-0.5 px-2 shrink-0"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <button
            onClick={toggleSearch}
            title="Поиск (Ctrl+F)"
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{
              backgroundColor: searchVisible ? 'rgba(42,171,238,0.15)' : 'transparent',
              color: searchVisible ? '#2AABEE' : 'var(--cc-icon)',
            }}
            onMouseEnter={e => { if (!searchVisible) { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' } }}
            onMouseLeave={e => { if (!searchVisible) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' } }}
          >🔍</button>

          <button
            onClick={() => setShowAI(!showAI)}
            title="ИИ-помощник"
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{
              backgroundColor: showAI ? 'rgba(42,171,238,0.15)' : 'transparent',
              color: showAI ? '#2AABEE' : 'var(--cc-icon)',
            }}
            onMouseEnter={e => { if (!showAI) { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' } }}
            onMouseLeave={e => { if (!showAI) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' } }}
          >🤖</button>

          <button
            onClick={() => setShowTemplates(!showTemplates)}
            title="Шаблоны ответов"
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{
              backgroundColor: showTemplates ? 'rgba(34,197,94,0.15)' : 'transparent',
              color: showTemplates ? '#22c55e' : 'var(--cc-icon)',
            }}
            onMouseEnter={e => { if (!showTemplates) { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' } }}
            onMouseLeave={e => { if (!showTemplates) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' } }}
          >📋</button>

          <button
            onClick={() => setShowAutoReply(!showAutoReply)}
            title="Авто-ответчик"
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{
              backgroundColor: showAutoReply ? 'rgba(168,85,247,0.15)' : 'transparent',
              color: showAutoReply ? '#a855f7' : 'var(--cc-icon)',
            }}
            onMouseEnter={e => { if (!showAutoReply) { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' } }}
            onMouseLeave={e => { if (!showAutoReply) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' } }}
          >⚡</button>

          <button
            onClick={() => handleSettingsChange({ ...settings, theme: theme === 'dark' ? 'light' : 'dark' })}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{ color: 'var(--cc-icon)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' }}
          >{theme === 'dark' ? '☀️' : '🌙'}</button>

          <button
            onClick={() => setShowSettings(true)}
            title="Настройки (Ctrl+,)"
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{ color: 'var(--cc-icon)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' }}
          >⚙️</button>

          {/* Общий бейдж непрочитанных убран (v0.20.0) — по запросу пользователя */}
        </div>

        <div className="wco-spacer" />
      </div>

      {/* ── Строка поиска ── */}
      {searchVisible && (
        <div
          className="flex items-center h-[38px] px-3 gap-2 shrink-0"
          style={{ backgroundColor: 'var(--cc-surface-alt)', borderBottom: '1px solid var(--cc-border)' }}
        >
          <span className="text-sm" style={{ color: 'var(--cc-text-dimmer)' }}>🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            value={searchText}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') toggleSearch()
              if (e.key === 'Enter') {
                const wv = webviewRefs.current[activeIdRef.current]
                if (wv && searchText) wv.findInPage(searchText, { findNext: true, forward: !e.shiftKey })
              }
            }}
            placeholder="Поиск в мессенджере... (Enter — следующий, Shift+Enter — предыдущий)"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--cc-text)' }}
          />
          <button
            onClick={toggleSearch}
            className="text-sm px-1 cursor-pointer transition-colors"
            style={{ color: 'var(--cc-text-dimmer)' }}
          >✕</button>
        </div>
      )}

      {/* ── Основной layout ── */}
      {/* ── Контекстное меню вкладки ── */}
      {contextMenuTab && (
        <div
          className="fixed z-[100]"
          style={{ left: contextMenuTab.x, top: contextMenuTab.y }}
          onMouseLeave={() => setContextMenuTab(null)}
        >
          <div
            className="rounded-lg py-1 shadow-xl text-[12px] min-w-[180px]"
            style={{ backgroundColor: 'var(--cc-surface)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
          >
            {(() => {
              const tabPinned = !!(settings.pinnedTabs || {})[contextMenuTab?.id]
              return [
                { action: 'reload', icon: '🔄', label: 'Перезагрузить' },
                { action: 'diag', icon: '🔍', label: 'Диагностика DOM' },
                { action: 'diagDOM', icon: '🏗️', label: 'DOM-скан (→ буфер)' },
                { action: 'diagFull', icon: '🧪', label: 'Полная диагностика (→ буфер)' },
                { action: 'diagAccount', icon: '👤', label: 'Диагностика accountScript (→ буфер)' },
                { action: 'notifLog', icon: '📊', label: 'Лог уведомлений' },
                { action: 'copyUrl', icon: '📋', label: 'Копировать URL' },
                { action: 'edit', icon: '✏️', label: 'Изменить вкладку' },
                { action: 'pin', icon: tabPinned ? '📌' : '🔒', label: tabPinned ? 'Открепить вкладку' : 'Закрепить вкладку' },
                ...(!tabPinned ? [{ action: 'close', icon: '✕', label: 'Закрыть вкладку', color: '#f87171' }] : []),
              ].map(item => (
                <button
                  key={item.action}
                  onClick={() => handleTabContextAction(item.action)}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors cursor-pointer"
                  style={{ color: item.color || 'inherit' }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <span className="w-[16px] text-center">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))
            })()}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Область WebView ── */}
        <div className="flex-1 relative overflow-hidden" style={{ backgroundColor: 'var(--cc-bg)', cursor: isResizing ? 'col-resize' : undefined }}>
          {messengers.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center px-8">
                <div className="text-6xl mb-5">💬</div>
                <p className="text-lg font-medium mb-2" style={{ color: 'var(--cc-text-dim)' }}>Нет мессенджеров</p>
                <p className="text-sm mb-5" style={{ color: 'var(--cc-text-dimmer)' }}>Добавьте мессенджер, чтобы начать работу</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-5 py-2 rounded-lg text-white text-sm font-medium transition-opacity cursor-pointer"
                  style={{ backgroundColor: '#2AABEE' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  + Добавить мессенджер
                </button>
              </div>
            </div>
          ) : appReady ? (
            messengers.map(m => (
              <div
                key={m.id}
                className="absolute inset-0"
                style={{
                  zIndex: activeId === m.id ? 2 : 0,
                  pointerEvents: activeId === m.id ? 'auto' : 'none',
                }}
              >
                <webview
                  ref={el => setWebviewRef(el, m.id)}
                  src={m.url}
                  partition={m.partition}
                  preload={monitorPreloadUrl || undefined}
                  style={{ width: '100%', height: '100%' }}
                  allowpopups="true"
                  webpreferences="backgroundThrottling=no"
                />
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-2xl animate-pulse" style={{ color: 'var(--cc-text-dimmer)' }}>⏳</div>
            </div>
          )}

          {/* Overlay во время resize — блокирует WebView от захвата mousemove/mouseup */}
          {isResizing && (
            <div className="absolute inset-0 z-50" style={{ cursor: 'col-resize' }} />
          )}
        </div>

        {/* ── Resizer ── */}
        {showAI && (
          <div
            onMouseDown={startResize}
            className="shrink-0 cursor-col-resize transition-colors duration-150"
            style={{ width: '6px', backgroundColor: isResizing ? '#2AABEE88' : 'var(--cc-border)' }}
            onMouseEnter={e => { if (!isResizing) e.currentTarget.style.backgroundColor = '#2AABEE66' }}
            onMouseLeave={e => { if (!isResizing) e.currentTarget.style.backgroundColor = 'var(--cc-border)' }}
            title="Потяни для изменения ширины панели ИИ"
          />
        )}

        {/* ── ИИ-боковая панель ── */}
        <AISidebar
          settings={settings}
          onSettingsChange={handleSettingsChange}
          lastMessage={lastMessage}
          visible={showAI}
          width={aiWidth}
          onToggle={() => setShowAI(!showAI)}
          panelRef={aiPanelRef}
          chatHistory={chatHistory}
          activeMessengerId={activeId}
        />
      </div>

      {/* ── Строка статистики ── */}
      <div
        className="flex items-center px-3 h-[26px] text-[11px] gap-3 shrink-0 select-none"
        style={{
          backgroundColor: 'var(--cc-surface)',
          borderTop: '1px solid var(--cc-border)',
          color: 'var(--cc-text-dimmer)',
        }}
      >
        <span title="Входящих сообщений сегодня">💬 <span style={{ color: 'var(--cc-text-dim)', fontWeight: 600 }}>{stats.today}</span> сегодня</span>
        <span style={{ opacity: 0.3 }}>·</span>
        <span title="Авто-ответов отправлено сегодня">⚡ <span style={{ color: stats.autoToday > 0 ? '#a855f7' : 'var(--cc-text-dim)', fontWeight: 600 }}>{stats.autoToday}</span> авто</span>
        <span style={{ opacity: 0.3 }}>·</span>
        <span title="Всего сообщений за всё время">📊 <span style={{ color: 'var(--cc-text-dim)', fontWeight: 600 }}>{stats.total}</span> всего</span>
        {totalUnread > 0 && (
          <>
            <span style={{ opacity: 0.3 }}>·</span>
            <span title={Object.entries(unreadCounts).filter(([,v]) => v > 0).map(([id, v]) => {
              const m = messengers.find(x => x.id === id)
              return `${m?.name || id}: ${v}`
            }).join(', ')}>📥 <span style={{ color: '#f87171', fontWeight: 600 }}>{totalUnread}</span> непрочитано{' '}
              <span style={{ color: 'var(--cc-text-dim)', fontSize: '10px' }}>[{Object.entries(unreadCounts).filter(([,v]) => v > 0).map(([id, v]) => {
                const m = messengers.find(x => x.id === id)
                const short = (m?.name || '?').slice(0, 3)
                return `${short}:${v}`
              }).join(' ')}]</span>
            </span>
          </>
        )}

        {/* ── Последнее сообщение (бегущая строка, 8 сек) ── */}
        {statusBarMsg && (
          <>
            <span style={{ opacity: 0.3 }}>·</span>
            <span
              className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[300px]"
              style={{ color: 'var(--cc-text-dim)' }}
              title={statusBarMsg}
            >💬 {statusBarMsg}</span>
          </>
        )}

        {/* ── Зум текущей вкладки ── */}
        {activeId && (
          <div className="ml-auto flex items-center gap-0.5" title={`Масштаб окна чата: ${currentZoom}%`}>
            <button
              onClick={() => changeZoom(currentZoom - 5)}
              disabled={currentZoom <= 25}
              className="w-[16px] h-[16px] flex items-center justify-center rounded cursor-pointer leading-none"
              style={{ color: 'var(--cc-text-dim)', opacity: currentZoom <= 25 ? 0.3 : 1, fontSize: 14 }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              title="Уменьшить (−5%)"
            >−</button>

            {zoomEditing ? (
              <input
                ref={zoomInputRef}
                type="number"
                min={25}
                max={200}
                value={zoomInputValue}
                onChange={e => setZoomInputValue(e.target.value)}
                onBlur={() => {
                  const v = parseInt(zoomInputValue)
                  if (!isNaN(v)) changeZoom(v)
                  setZoomEditing(false)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { const v = parseInt(zoomInputValue); if (!isNaN(v)) changeZoom(v); setZoomEditing(false) }
                  else if (e.key === 'Escape') setZoomEditing(false)
                }}
                className="w-[38px] text-center bg-transparent outline-none border-b"
                style={{ color: 'var(--cc-text)', borderColor: 'var(--cc-border)', fontSize: 10 }}
                autoFocus
              />
            ) : (
              <span
                onClick={() => { setZoomEditing(true); setZoomInputValue(String(currentZoom)) }}
                className="w-[34px] text-center cursor-pointer rounded px-0.5"
                style={{ color: currentZoom !== 100 ? '#2AABEE' : 'var(--cc-text-dim)', fontSize: 10 }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                title="Нажмите для ввода точного значения"
              >{currentZoom}%</span>
            )}

            <button
              onClick={() => changeZoom(currentZoom + 5)}
              disabled={currentZoom >= 200}
              className="w-[16px] h-[16px] flex items-center justify-center rounded cursor-pointer leading-none"
              style={{ color: 'var(--cc-text-dim)', opacity: currentZoom >= 200 ? 0.3 : 1, fontSize: 14 }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              title="Увеличить (+5%)"
            >+</button>

            {currentZoom !== 100 && (
              <button
                onClick={() => changeZoom(100)}
                className="text-[9px] px-0.5 rounded cursor-pointer ml-0.5"
                style={{ color: 'var(--cc-text-dimmer)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--cc-text)'; e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--cc-text-dimmer)'; e.currentTarget.style.backgroundColor = 'transparent' }}
                title="Сбросить масштаб к 100%"
              >↺</button>
            )}
          </div>
        )}
      </div>

      {/* ── Модальные окна ── */}
      {showAddModal && (
        <AddMessengerModal
          onAdd={addMessenger}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {editingMessenger && (
        <AddMessengerModal
          editing={editingMessenger}
          onSave={saveMessenger}
          onAdd={() => {}}
          onClose={() => setEditingMessenger(null)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          messengers={messengers}
          settings={settings}
          onMessengersChange={setMessengers}
          onSettingsChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showTemplates && (
        <TemplatesPanel
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {showAutoReply && (
        <AutoReplyPanel
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onClose={() => setShowAutoReply(false)}
        />
      )}

      {/* ── Диалог подтверждения закрытия вкладки ── */}
      {confirmClose && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'var(--cc-overlay)' }}
          onClick={() => setConfirmClose(null)}
          onKeyDown={e => { if (e.key === 'Escape') setConfirmClose(null) }}
        >
          <div
            className="rounded-2xl p-6 w-[380px] shadow-2xl"
            style={{ backgroundColor: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center gap-4">
              {/* Иконка предупреждения */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                style={{ backgroundColor: `${confirmClose.color}20` }}
              >
                {confirmClose.emoji || '💬'}
              </div>

              <div>
                <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--cc-text)' }}>
                  Закрыть вкладку?
                </h3>
                <p className="text-sm" style={{ color: 'var(--cc-text-dim)' }}>
                  Вкладка <span style={{ color: confirmClose.color, fontWeight: 600 }}>{confirmClose.name}</span> будет удалена.
                  <br />Сессия авторизации может сброситься.
                </p>
              </div>

              {/* Кнопки */}
              <div className="flex gap-3 w-full mt-1">
                <button
                  onClick={() => setConfirmClose(null)}
                  autoFocus
                  className="flex-1 py-2.5 rounded-lg text-sm transition-all cursor-pointer"
                  style={{ backgroundColor: 'var(--cc-hover)', color: 'var(--cc-text-dim)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--cc-border)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--cc-hover)'}
                >Отмена</button>
                <button
                  onClick={() => removeMessenger(confirmClose.id)}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-all cursor-pointer"
                  style={{ backgroundColor: '#ef4444' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >Закрыть</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Модальное окно: Лог уведомлений ── */}
      {notifLogModal && (() => {
        const traceStepLabels = { source: 'Источник', spam: 'Спам', dedup: 'Дедуп', handle: 'Обработка', viewing: 'Видимость', sound: 'Звук', ribbon: 'Ribbon', enrich: 'Обогащение', inspect: 'Инспектор', error: 'Ошибка', debug: 'Отладка', warmup: 'Разогрев' }
        const traceTypeColors = { pass: '#4ade80', block: '#f87171', warn: '#fbbf24', info: '#94a3b8' }
        const traceTypeLabels = { pass: 'ПРОПУЩЕН', block: 'БЛОК', warn: 'ВНИМАНИЕ', info: 'ИНФО' }
        const traceData = (notifLogModal.trace || []).filter(e => {
          if (traceFilter === 'all') return true
          if (traceFilter === 'block') return e.type === 'block' || e.type === 'warn'
          if (traceFilter === 'source') return e.step === 'source' || e.step === 'enrich'
          if (traceFilter === 'decision') return e.step === 'viewing' || e.step === 'sound' || e.step === 'ribbon' || e.step === 'dedup'
          return true
        })
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
                <div className="flex gap-1 ml-2">
                  {[['log', `Лог (${notifLogModal.log.length})`], ['trace', `Pipeline (${(notifLogModal.trace||[]).length})`]].map(([tab, label]) => (
                    <button key={tab} className="px-2 py-1 rounded text-xs cursor-pointer" style={{
                      backgroundColor: notifLogTab === tab ? 'rgba(96,165,250,0.2)' : 'transparent',
                      color: notifLogTab === tab ? '#60a5fa' : 'var(--cc-text-dimmer)',
                      border: notifLogTab === tab ? '1px solid rgba(96,165,250,0.3)' : '1px solid transparent',
                    }} onClick={() => setNotifLogTab(tab)}>{label}</button>
                  ))}
                </div>
                <span className="text-[10px]" style={{ color: '#4ade80' }}>&#9679; авто</span>
              </div>
              <div className="flex gap-2">
                <button className="px-2 py-1 rounded text-xs cursor-pointer" style={{ backgroundColor: 'var(--cc-hover)', color: 'var(--cc-text-dim)' }}
                  onClick={() => {
                    const data = notifLogTab === 'log' ? notifLogModal.log : (notifLogModal.trace || [])
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
                          // v0.76.1: chatPeerTypes — детальная диагностика типов чатов
                          r.chatPeerTypes = [];
                          var ptIdx2 = 0;
                          chats.forEach(function(chat) {
                            if (ptIdx2 >= 10) return;
                            // Ищем бейдж-число (маленький элемент с числом)
                            var badges = chat.querySelectorAll('.badge, .unread-count, [class*="badge"]');
                            var badgeNum = null;
                            for (var bi = 0; bi < badges.length; bi++) {
                              var bTxt = (badges[bi].textContent||'').trim();
                              if (/^\d+$/.test(bTxt)) { badgeNum = bTxt; break; }
                            }
                            // peer-type: dataset, attribute, или вложенный элемент
                            var pt = chat.dataset ? (chat.dataset.peerType || '') : '';
                            if (!pt) pt = chat.getAttribute('data-peer-type') || '';
                            // Ищем data-peer-type на вложенных элементах
                            if (!pt) { var pEl = chat.querySelector('[data-peer-type]'); if (pEl) pt = pEl.getAttribute('data-peer-type'); }
                            // Иконки каналов/групп
                            var hasChannelIcon = !!chat.querySelector('.icon-channel, .icon-broadcast, [class*="channel-icon"], .verified-icon');
                            var hasGroupIcon = !!chat.querySelector('.icon-group, [class*="group-icon"]');
                            var hasMuteIcon = !!chat.querySelector('.icon-muted, [class*="mute"]');
                            // Все атрибуты чата
                            var attrs = {};
                            for (var ai = 0; ai < chat.attributes.length; ai++) {
                              var at = chat.attributes[ai];
                              if (at.name !== 'class' && at.name !== 'style') attrs[at.name] = (at.value||'').slice(0,60);
                            }
                            var nm = '';
                            var pTitle = chat.querySelector('.peer-title');
                            if (pTitle) nm = (pTitle.textContent||'').slice(0,25);
                            r.chatPeerTypes.push({ name: nm, peerType: pt || 'none', badge: badgeNum, channelIcon: hasChannelIcon, groupIcon: hasGroupIcon, muteIcon: hasMuteIcon, attrs: attrs });
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
                {[['all', 'Все'], ['block', 'Блокировки'], ['source', 'Источники'], ['decision', 'Решения']].map(([f, label]) => (
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
              ) : (
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
              )}
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
                      window.api.invoke('settings:save', { messengerNotifs: { ...(settings.messengerNotifs || {}), [mid]: { ...((settings.messengerNotifs || {})[mid] || {}), spamFilter: val } } })
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                  />
                  <span style={{ color: 'var(--cc-text-dimmer)', whiteSpace: 'nowrap' }}>{mn.spamFilter ? '✓ активен' : 'не задан'}</span>
                </div>
              )
            })()}
            {/* Легенда */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[11px]" style={{ borderTop: '1px solid var(--cc-border)', color: 'var(--cc-text-dimmer)' }}>
              {notifLogTab === 'log' ? (<>
                <span><span style={{ color: '#4ade80' }}>ПОКАЗАНО</span> — отправлено в ribbon</span>
                <span><span style={{ color: '#f87171' }}>ЗАБЛОК.</span> — спам/исходящее</span>
                <span><span style={{ color: '#60a5fa' }}>Отправитель</span> — имя из DOM чата</span>
                <span>До 100 записей · Растянуть ↘</span>
              </>) : (<>
                <span><span style={{ color: '#4ade80' }}>ПРОПУЩЕН</span> — шаг пройден</span>
                <span><span style={{ color: '#f87171' }}>БЛОК</span> — уведомление остановлено</span>
                <span><span style={{ color: '#fbbf24' }}>ВНИМАНИЕ</span> — проблема обогащения</span>
                <span><span style={{ color: '#94a3b8' }}>ИНФО</span> — этап pipeline</span>
                <span>До 300 записей · Растянуть ↘</span>
              </>)}
            </div>
          </div>
        </div>
        )
      })()}

      {/* ── Тултип для ячеек таблицы лога ── */}
      {cellTooltip && (
        <div className="cc-notif-tooltip" style={{ left: Math.min(cellTooltip.x + 8, window.innerWidth - 460), top: cellTooltip.y + 16 }}>
          {cellTooltip.text}
        </div>
      )}
    </div>
  )
}
