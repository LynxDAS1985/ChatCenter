// v0.87.0: Главный компонент нативного режима «ЦентрЧатов» (Telegram через GramJS)
// Содержит: header с переключателем режимов, sidebar аккаунтов, основную область.
// Режимы: Inbox (чаты) / Contacts (клиенты) / Kanban (доска).
// Стили — AMOLED, изолированы через .native-mode корневой класс.
// v0.87.106 (multi-account UI): круглые аватарки с фото, иконка мессенджера ✈️ в углу,
// зелёная точка-индикатор онлайн, бейдж непрочитанных. БЕЗ яркой подсветки активного.
// + hover на аккаунте → подсветка его чатов в списке (Улучшение 1).
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom' // v1.2.262: боковая полоса рисуется в слот на уровне App
import NativeSidebar from './components/NativeSidebar.jsx' // v1.2.258: боковая полоса (аккаунты+веб)
import AddSourceModal from './components/AddSourceModal.jsx' // v1.2.264: окно «Добавить источник» (протокол→мессенджер)
import './styles.css'
import useNativeStore from './store/nativeStore.js'
import NativeMainContent from './components/NativeMainContent.jsx'
import { shouldShowLoginScreen, shouldResetLoginFlowOnOpen } from '../../shared/loginScreenGate.js'
import { getAccountColor, ACCOUNT_PALETTE } from '../../shared/accountColors.js'
import AccountContextMenu from './components/AccountContextMenu.jsx'
import useAccountRailResize, { loadRailWidth, RAIL_MAX_WIDTH, isRailNarrow } from './hooks/useAccountRailResize.js'
import { getDisplayUnreadCount } from './utils/displayUnread.js'
import {
  createPendingHealth,
  markHealthError,
} from '../utils/connectionHealth.js'
import { loadTheme, applyTheme } from './utils/themeColor.js'
import {
  loadAccountOrder, saveAccountOrder, applyAccountOrder, moveAccount,
} from './utils/accountOrder.js'

try { window.__ccStartupMark?.('module:NativeApp', 'module evaluated after native static imports') } catch {}

// v0.95.30: применяем сохранённую тему ДО первого рендера, чтобы bubble сразу
// отрисовались с правильным цветом (без вспышки default-blue → indigo).
try { applyTheme(loadTheme()) } catch (_) {}

// v0.95.30: emoji-иконки режимов «Чаты/Клиенты/Доска».
// v1.2.175: переключатель переехал в рейл аккаунтов (см. RailModeSwitcher — иконка внизу
// рейла, меню вверх). Раньше был верхним дропдауном над списком (ChatTypesDropdown, теперь не используется).
const MODES = [
  { id: 'inbox', label: 'Чаты', icon: '💬' },
  { id: 'contacts', label: 'Клиенты', icon: '👥' },
  { id: 'kanban', label: 'Доска', icon: '📋' },
]

function buildNativeAccountHealth(account, unreadCount, chatsCount) {
  const base = {
    id: account.id,
    type: 'native',
    label: `${account.messenger || 'telegram'} · ${account.name}`,
    details: `Чаты: ${chatsCount || 0}; непрочитано: ${unreadCount || 0}`,
  }
  if (account.status === 'error' || account.status === 'disconnected') {
    return markHealthError(null, {
      ...base,
      errorText: account.error || account.status,
    })
  }
  return createPendingHealth(base)
}

export default function NativeApp({
  onOpenConnections, onConnectionSnapshot, onConnectionActionsReady, onActiveNativeAccountChange,
  // v1.2.256 (Модель 🅰️): веб-мессенджеры в этой же полосе (под аккаунтами).
  webSources = [], activeMessengerId, onSelectSource, onActivateNative, webUnread = {}, webHealth = {}, webNew,
  webAccountInfo = {}, // v1.2.273: имя аккаунта под веб-значком полосы
  webAccountAvatars = {}, // v1.2.275: аватар веб-аккаунта на значке полосы
  // v1.2.257: функции вкладок на веб-значках (правый клик, перетаскивание, загрузка).
  onWebContextMenu, onWebDragStart, onWebDragOver, onWebDrop, onWebDragEnd, webDragOverId, webLoading = {},
  onAddWeb, // v1.2.258: «+» добавить веб-мессенджер
  // v0.96.0 (Phase 0 M0.3): payload приходит от App.jsx cross-tab listener.
  // App.jsx переключил activeId на native_cc → NativeApp mount → этот prop читается.
  pendingNotify, clearPendingNotify,
}) {
  try {
    if (!window.__ccNativeAppFirstRenderLogged) {
      window.__ccNativeAppFirstRenderLogged = true
      window.__ccStartupMark?.('component:NativeApp', 'first render start')
    }
  } catch {}
  const store = useNativeStore()
  // v1.2.262: слот боковой полосы на уровне App (#app-native-rail) — рисуем туда порталом,
  // чтобы полоса была видна ВСЕГДА (даже когда активен веб-мессенджер справа).
  const [railSlot, setRailSlot] = useState(null)
  // v1.2.263: useLayoutEffect (не useEffect) — портал вставляется ДО отрисовки кадра,
  // поэтому полоса не «прыгает» и слоту не нужен фиксированный minWidth.
  useLayoutEffect(() => {
    const slot = document.getElementById('app-native-rail')
    if (!slot) { try { window.api?.send?.('app:log', { level: 'WARN', message: '[native-rail] слот #app-native-rail не найден — полоса не отрисуется' }) } catch (_) {} }
    setRailSlot(slot)
  }, [])
  const autoCheckedAccountsRef = useRef(new Set())
  const connectionChecksInFlightRef = useRef(new Set())
  const [showLogin, setShowLogin] = useState(false)
  // v1.2.264: окно «Добавить источник» (одна кнопка «＋ Добавить» в полосе).
  const [showAddSource, setShowAddSource] = useState(false)
  // v0.87.88: ПКМ-меню аккаунта { account, x, y } или null
  const [accountMenu, setAccountMenu] = useState(null)
  // v0.87.95: toast после успешного выхода — { message, ts }
  const [logoutToast, setLogoutToast] = useState(null)
  // v0.87.106 Улучшение 1: hover на аккаунте → подсвечиваем его чаты в списке
  const [hoveredAccountId, setHoveredAccountId] = useState(null)
  // v1.2.165: ширина левого рейла (перетаскиванием разделителя). Значки масштабируются от
  // ширины; при узкой панели подписи-имена скрываются. Персист — localStorage.
  const [railWidth, setRailWidth] = useState(() => loadRailWidth())
  const [isRailResizing, setIsRailResizing] = useState(false)
  const railWidthRef = useRef(railWidth)
  const railResizeStartRef = useRef({ x: 0, w: railWidth })
  const isRailResizingRef = useRef(false)
  const { startResize: startRailResize, onPointerMove: onRailPointerMove, onPointerUp: onRailPointerUp, resetToDefault: resetRailWidth } =
    useAccountRailResize({ isResizingRef: isRailResizingRef, resizeStartRef: railResizeStartRef, railWidthRef, setRailWidth, setIsResizing: setIsRailResizing })
  const railScale = railWidth / RAIL_MAX_WIDTH
  const hideRailLabel = isRailNarrow(railWidth)
  // v0.95.31: drag-n-drop порядка аккаунтов. accountOrder — массив id из localStorage,
  // applyAccountOrder применяется к store.accounts. Новые аккаунты идут в конец.
  const [accountOrder, setAccountOrder] = useState(() => loadAccountOrder())
  const [dragSrcIdx, setDragSrcIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  // v0.87.106: подсчёт непрочитанных по аккаунтам (для бейджей)
  // v0.95.21: для форум-групп считаем через getDisplayUnreadCount (число тем
  // с непрочитанным, Telegram Desktop), иначе TDLib aggregate раздувает сумму.
  const unreadByAccount = useMemo(() => {
    const map = {}
    for (const c of store.chats) {
      if (!c.accountId) continue
      map[c.accountId] = (map[c.accountId] || 0) + getDisplayUnreadCount(c, store.forumTopics)
    }
    return map
  }, [store.chats, store.forumTopics])

  const chatsByAccount = useMemo(() => {
    const map = {}
    for (const c of store.chats) {
      if (!c.accountId) continue
      map[c.accountId] = (map[c.accountId] || 0) + 1
    }
    return map
  }, [store.chats])

  const accountHealth = useMemo(() => {
    const map = {}
    for (const acc of store.accounts) {
      map[acc.id] = store.nativeConnectionHealth?.[acc.id]
        || buildNativeAccountHealth(acc, unreadByAccount[acc.id] || 0, chatsByAccount[acc.id] || 0)
    }
    return map
  }, [store.accounts, store.nativeConnectionHealth, unreadByAccount, chatsByAccount])

  const activeNativeAccountId = useMemo(() => {
    const activeChat = store.chats.find(chat => chat.id === store.activeChatId)
    if (activeChat?.accountId) return activeChat.accountId
    // v1.2.163: раньше брали одиночный chatFilter; теперь «текущий» = соло-аккаунт (если включён)
    if (store.soloAccountId) return store.soloAccountId
    // v1.2.164: если показан ровно ОДИН аккаунт (остальные скрыты галочкой) — он и «текущий»
    const visible = (store.accounts || []).filter(a => !(store.hiddenAccountIds || []).includes(a.id))
    if (visible.length === 1) return visible[0].id
    return null
  }, [store.activeChatId, store.soloAccountId, store.hiddenAccountIds, store.accounts, store.chats])

  useEffect(() => {
    onConnectionSnapshot?.(Object.values(accountHealth))
  }, [accountHealth, onConnectionSnapshot])

  useEffect(() => {
    onActiveNativeAccountChange?.(activeNativeAccountId)
  }, [activeNativeAccountId, onActiveNativeAccountChange])

  useEffect(() => {
    return () => onActiveNativeAccountChange?.(null)
  }, [onActiveNativeAccountChange])

  useEffect(() => {
    const runConnectionCheck = async (id) => {
      if (!id || connectionChecksInFlightRef.current.has(id)) return null
      connectionChecksInFlightRef.current.add(id)
      try {
        return await store.checkConnection?.(id)
      } finally {
        connectionChecksInFlightRef.current.delete(id)
      }
    }
    onConnectionActionsReady?.({
      refreshAll: async () => {
        const results = []
        for (const acc of store.accounts) results.push(await runConnectionCheck(acc.id))
        return results
      },
      refreshOne: async (id) => {
        return runConnectionCheck(id)
      },
      refreshProblematic: async (ids = []) => {
        const targetIds = ids.length ? ids : store.accounts.map(a => a.id)
        const results = []
        for (const id of targetIds) results.push(await runConnectionCheck(id))
        return results
      },
    })
    return () => onConnectionActionsReady?.(null)
  }, [onConnectionActionsReady, store.accounts, store.checkConnection])

  useEffect(() => {
    const currentIds = new Set(store.accounts.map(acc => acc.id))
    for (const id of Array.from(autoCheckedAccountsRef.current)) {
      if (!currentIds.has(id)) autoCheckedAccountsRef.current.delete(id)
    }
    for (const acc of store.accounts) {
      if (!acc?.id || autoCheckedAccountsRef.current.has(acc.id)) continue
      autoCheckedAccountsRef.current.add(acc.id)
      if (connectionChecksInFlightRef.current.has(acc.id)) continue
      connectionChecksInFlightRef.current.add(acc.id)
      Promise.resolve(store.checkConnection?.(acc.id)).finally(() => {
        connectionChecksInFlightRef.current.delete(acc.id)
      })
    }
  }, [store.accounts, store.checkConnection])

  const hasAccounts = store.accounts.length > 0
  // v1.2.147: завершённый вход (loginFlow.step==='success') НЕ держит экран входа —
  // иначе после добавления аккаунта поверх чатов оставался пустой экран входа («чёрный
  // экран»). Логика вынесена в чистую shouldShowLoginScreen (покрыта тестом).
  const showLoginScreen = shouldShowLoginScreen(showLogin, store.loginFlow)

  // v1.2.149: единая точка открытия окна входа (обе кнопки «+»). Сбрасываем ТОЛЬКО
  // залипший success (чтобы новое окно не закрылось само); незавершённый вход не трогаем.
  // Лог по доработке — чтобы сброс залипшего входа был виден в журнале.
  // v1.2.254: useCallback — стабильная ссылка, чтобы безопасно отдать openLogin наверх (рейл «умный +»).
  const openLogin = useCallback(() => {
    if (shouldResetLoginFlowOnOpen(store.loginFlow)) {
      try { window.api?.send?.('app:log', { level: 'INFO', message: '[acct-store] reset stale loginFlow(success) on open-login' }) } catch (_) {}
      store.resetLoginFlow?.()
    }
    setShowLogin(true)
  }, [store.loginFlow, store.resetLoginFlow])

  // v1.2.404: запасное снятие стартовой заставки (index.html #cc-splash). Основной путь — заставка чатов
  // (ChatListLoadingSplash) при показе сама зовёт __ccHideSplash. Но если аккаунтов нет и заставка чатов не
  // покажется — всё равно убираем стартовую через 0.8с после монтирования нативного экрана (не застреваем).
  useEffect(() => {
    const t = setTimeout(() => { try { window.__ccHideSplash?.() } catch (_) {} }, 800)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    try {
      window.__ccStartupMark?.(
        'component:NativeApp',
        `mounted accounts=${store.accounts.length} chats=${store.chats.length} active=${store.activeAccountId || 'none'} loginFlow=${!!store.loginFlow}`
      )
      window.__ccStartupSummary?.('NativeApp-mounted')
    } catch {}
    // v0.95.33: применяем тему ПОСЛЕ mount, когда .native-mode уже в DOM.
    // CSS specificity: `.native-mode { --amoled-accent }` перебивает `:root`/`html`,
    // поэтому module-load applyTheme (на documentElement) не работает. См. themeColor.js
    // applyTheme — теперь таргетит querySelectorAll('.native-mode').
    try { applyTheme(loadTheme()) } catch (_) {}
  }, [])

  // v0.96.0 (Phase 0 M0.3): обработка `notify:clicked` теперь в КОРНЕВОМ App.jsx
  // (см. App.jsx useEffect cross-tab listener). App.jsx переключает activeId
  // на native_cc → NativeApp монтируется → этот useEffect читает pendingNotify.
  //
  // Источник payload — App.jsx cross-tab listener:
  //   pendingNotify = { messengerId, chatTag, messageId, source?, senderName, ... }
  //
  // Backward compat: payload поддерживает старый chatTag/messageId (до M0.4) И
  // новый source объект (после M0.4 — NotificationSource паспорт).
  //
  // Эталон: Telegram Web K appImManager.setInnerPeer({peerId, lastMsgId}).
  useEffect(() => {
    if (!pendingNotify) return
    try {
      // M0.4 (новый формат): source — паспорт NotificationSource
      const source = pendingNotify.source
      let accountId, chatId, messageId

      if (source && source.accountId && source.chatId) {
        // Новый формат — source паспорт
        accountId = source.accountId
        // chatTag в state.activeChatId формате 'accountId:rawId'
        chatId = `${source.accountId}:${source.chatId}`
        messageId = source.messageId || null
      } else {
        // Backward compat (до M0.4) — chatTag + messageId raw
        const chatTag = pendingNotify.chatTag
        if (!chatTag) { clearPendingNotify?.(); return }
        const colonIdx = String(chatTag).indexOf(':')
        if (colonIdx > 0) {
          accountId = String(chatTag).slice(0, colonIdx)
        }
        chatId = chatTag
        messageId = pendingNotify.messageId || null
      }

      if (accountId && store.setActiveAccount) store.setActiveAccount(accountId)
      if (chatId && store.setActiveChat) store.setActiveChat(chatId)
      if (messageId && store.requestScrollToMessage) {
        store.requestScrollToMessage(chatId, messageId)
      }
    } catch (_) {}
    // Очищаем pending чтобы prop не триггерил handler повторно при ре-рендерах
    clearPendingNotify?.()
  }, [pendingNotify])

  const handleAccountContextMenu = (e, account) => {
    e.preventDefault()
    setAccountMenu({ account, x: e.clientX, y: e.clientY })
  }

  // v0.95.31: применяем сохранённый порядок аккаунтов. Новые (не в order) — в конец.
  // Эталон: Telegram Desktop multi-account sidebar, Slack workspace switcher.
  const orderedAccounts = useMemo(
    () => applyAccountOrder(store.accounts, accountOrder),
    [store.accounts, accountOrder]
  )


  // v0.95.31: HTML5 native drag-n-drop. Минимум кода, работает везде, не требует библиотек.
  const handleAccountDragStart = (e, idx) => {
    setDragSrcIdx(idx)
    try { e.dataTransfer.effectAllowed = 'move' } catch (_) {}
  }
  const handleAccountDragOver = (e, idx) => {
    e.preventDefault()
    if (dragOverIdx !== idx) setDragOverIdx(idx)
  }
  const handleAccountDragEnd = () => {
    if (dragSrcIdx != null && dragOverIdx != null && dragSrcIdx !== dragOverIdx) {
      const newOrderIds = moveAccount(orderedAccounts, dragSrcIdx, dragOverIdx)
      setAccountOrder(newOrderIds)
      saveAccountOrder(newOrderIds)
    }
    setDragSrcIdx(null)
    setDragOverIdx(null)
  }

  // v0.87.95: после удаления аккаунта показываем toast «Освобождено N МБ»
  // store.lastWipe устанавливается в handler tg:account-update {removed:true}
  useEffect(() => {
    if (!store.lastWipe) return
    // v1.2.150: после удаления аккаунта НЕ показываем форму нового входа — закрываем её,
    // чтобы сразу были чаты оставшихся аккаунтов (или «нет подключённых аккаунтов», если
    // не осталось ни одного). Форма входа появляется только по кнопке «+».
    setShowLogin(false)
    store.resetLoginFlow?.()
    const mb = (store.lastWipe.totalBytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '')
    setLogoutToast({
      message: `✅ Аккаунт удалён. Освобождено ${mb} МБ`,
      ts: Date.now(),
    })
    const t = setTimeout(() => setLogoutToast(null), 4000)
    return () => clearTimeout(t)
  }, [store.lastWipe?.totalBytes])

  return (
    <div className="native-mode">
      <div className="native-content">
        {/* v1.2.262: полоса рисуется ПОРТАЛОМ в слот #app-native-rail на уровне App → видна ВСЕГДА
            (в т.ч. когда справа открыт веб-мессенджер). Пропсы/стор — те же (дерево NativeApp).
            v1.2.263: обёрнуто в .native-mode — иначе снаружи слоя не заданы --amoled-* переменные
            и фон, и полоса теряла цвет API-окна. flexDirection:row — полоса + разделитель в ряд.
            Разделитель перенесён СЮДА (в портал) → ресайз доступен даже когда активен веб. */}
        {railSlot && createPortal(
          <div className="native-mode" style={{ flexDirection: 'row', width: 'auto', height: '100%' }}>
            <NativeSidebar
              railWidth={railWidth} railScale={railScale} isRailResizing={isRailResizing}
              store={store} orderedAccounts={orderedAccounts}
              dragSrcIdx={dragSrcIdx} dragOverIdx={dragOverIdx}
              handleAccountDragStart={handleAccountDragStart} handleAccountDragOver={handleAccountDragOver} handleAccountDragEnd={handleAccountDragEnd}
              unreadByAccount={unreadByAccount} accountHealth={accountHealth}
              handleAccountContextMenu={handleAccountContextMenu} setHoveredAccountId={setHoveredAccountId}
              onOpenConnections={onOpenConnections} hideRailLabel={hideRailLabel} modes={MODES}
              webSources={webSources} activeMessengerId={activeMessengerId} onSelectSource={onSelectSource}
              onActivateNative={onActivateNative}
              webUnread={webUnread} webHealth={webHealth} webNew={webNew} webLoading={webLoading}
              webAccountInfo={webAccountInfo} webAccountAvatars={webAccountAvatars}
              onWebContextMenu={onWebContextMenu}
              onWebDragStart={onWebDragStart} onWebDragOver={onWebDragOver} onWebDrop={onWebDrop} onWebDragEnd={onWebDragEnd}
              webDragOverId={webDragOverId} onOpenAddSource={() => setShowAddSource(true)}
            />
            {/* v1.2.165: разделитель для изменения ширины рейла (перетаскивание). Двойной клик — сброс. */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Изменить ширину панели аккаунтов (двойной клик — сброс)"
              title="Перетащите чтобы сузить · Двойной клик — сброс"
              onPointerDown={startRailResize}
              onPointerMove={onRailPointerMove}
              onPointerUp={onRailPointerUp}
              onDoubleClick={resetRailWidth}
              onMouseEnter={e => { if (!isRailResizing) e.currentTarget.style.backgroundColor = '#2AABEE66' }}
              onMouseLeave={e => { if (!isRailResizing) e.currentTarget.style.backgroundColor = 'var(--amoled-border)' }}
              style={{ width: 5, cursor: 'col-resize', flexShrink: 0, zIndex: 6, touchAction: 'none',
                backgroundColor: isRailResizing ? '#2AABEE88' : 'var(--amoled-border)',
                transition: isRailResizing ? 'none' : 'background-color 0.15s' }}
            />
          </div>,
          railSlot
        )}

        {/* v1.2.148: содержимое главной области вынесено в NativeMainContent (разгрузка). */}
        <NativeMainContent
          showLoginScreen={showLoginScreen}
          store={store}
          hasAccounts={hasAccounts}
          hoveredAccountId={hoveredAccountId}
          modes={MODES}
          onOpenLogin={openLogin}
          // v1.2.147: сброс «признака входа» при закрытии окна (не отменяет вход на сервере).
          onCloseLogin={() => { setShowLogin(false); store.resetLoginFlow?.() }}
        />
      </div>

      {/* v1.2.264: окно «Добавить источник» (протокол → мессенджер). API→вход Telegram (openLogin),
          Веб→добавить мессенджер (onAddWeb из App: пресет→новая вкладка, null→ручной ввод URL). */}
      {showAddSource && (
        <AddSourceModal
          onClose={() => setShowAddSource(false)}
          onAddApi={openLogin}
          onAddWeb={onAddWeb}
          // v1.2.266: статус «уже подключён» на плитках — есть ли уже TG-аккаунт / уже добавлен веб.
          // v1.2.267: сверка веб по URL И имени (custom-вкладка имеет тот же адрес/имя пресета).
          hasApiTelegram={(store.accounts || []).some(a => (a.messenger || 'telegram') === 'telegram')}
          connectedWeb={webSources.map(m => ({ url: m.url, name: m.name }))}
        />
      )}

      {/* v0.87.88: меню аккаунта по ПКМ */}
      {accountMenu && (
        <AccountContextMenu
          account={accountMenu.account}
          x={accountMenu.x}
          y={accountMenu.y}
          onClose={() => setAccountMenu(null)}
          onLogout={store.removeAccount}
          getCleanupStats={store.getCleanupStats}
          // v1.2.153: выбор цвета-метки аккаунта (кнопка 🎨 в углу карточки)
          color={getAccountColor(store.accountColors, accountMenu.account.id)}
          palette={ACCOUNT_PALETTE}
          onPickColor={(c) => store.setAccountColor(accountMenu.account.id, c)}
        />
      )}

      {/* v0.87.95: toast «Освобождено N МБ» после успешного выхода */}
      {logoutToast && (
        <div className="native-toast native-toast--success" style={{
          animation: 'native-menu-popin 220ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
          {logoutToast.message}
        </div>
      )}
    </div>
  )
}
