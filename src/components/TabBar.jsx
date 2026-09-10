// TabBar.jsx — Tab bar with messenger tabs, header buttons, search bar
import MessengerTab from './MessengerTab.jsx'
import CcMark from './CcMark.jsx' // v1.2.449: знак приложения в шапке окна

try { window.__ccStartupMark?.('module:TabBar', 'module evaluated') } catch {}

/**
 * Props:
 * - messengers, activeId, accountInfo, settings, unreadCounts, unreadSplit
 * - messagePreview, zoomLevels, connectionHealth, webviewLoading
 * - newMessageIds, dragOverId, contextMenuTab
 * - showAI, showTemplates, showAutoReply, searchVisible, searchText
 * - theme, currentZoom, isResizing
 * - handleTabClick, handleDragStart, handleDragOver, handleDrop, handleDragEnd
 * - askRemoveMessenger, setShowAddModal, setContextMenuTab
 * - toggleSearch, setShowAI, setShowTemplates, setShowAutoReply
 * - setShowSettings, handleSettingsChange
 * - handleSearch, searchInputRef, webviewRefs, activeIdRef
 * - handleTabContextAction, handleContextMenuClose
 * - changeZoom, zoomEditing, setZoomEditing, zoomInputValue, setZoomInputValue, zoomInputRef
 * - statusBarMsg, stats, totalUnread
 * - v1.0.1: showTasks, setShowTasks, showReminders, setShowReminders, showActivity,
 *   setShowActivity, tasksCount, remindersCount — для иконок в шапке.
 * - v1.2.300: нижняя полоса (StatusBar) удалена. Счётчики (сегодня/авто/всего/непрочитано),
 *   короткий статус и масштаб перенесены В ЭТУ ЖЕ шапку. Значки — единый линейный набор
 *   (стиль «подчёркивание активного»), все в один ряд.
 */
export default function TabBar({
  messengers, activeId, accountInfo, settings, unreadCounts, unreadSplit,
  messagePreview, zoomLevels, connectionHealth, webviewLoading,
  newMessageIds, dragOverId,
  showAI, showTemplates, showAutoReply, searchVisible, searchText,
  theme, currentZoom,
  handleTabClick, handleDragStart, handleDragOver, handleDrop, handleDragEnd,
  askRemoveMessenger, setShowAddModal, setContextMenuTab,
  toggleSearch, setShowAI, setShowTemplates, setShowAutoReply,
  setShowSettings, handleSettingsChange,
  handleSearch, searchInputRef, webviewRefs, activeIdRef,
  changeZoom, zoomEditing, setZoomEditing, zoomInputValue, setZoomInputValue, zoomInputRef,
  statusBarMsg, stats, totalUnread,
  onOpenConnections,
  showTasks, setShowTasks, showReminders, setShowReminders, showActivity, setShowActivity,
  showAutoReplyRules, setShowAutoReplyRules,
  tasksCount = 0, remindersCount = 0,
}) {
  const pinnedTabs = settings.pinnedTabs || {}
  // v1.2.272: ряд вкладок мессенджеров можно скрыть (переключение источников есть в боковой полосе).
  // По умолчанию СКРЫТ (settings.showTopTabs !== true). Вернуть — Настройки → «Верхние вкладки».
  // Тонкая полоска сверху (лого + перетаскивание окна + кнопки) остаётся всегда.
  const showTopTabs = settings.showTopTabs === true

  return (
    <>
      <CcIconDefs />
      {/* Header */}
      <div
        className="flex items-center h-[48px] shrink-0 select-none"
        style={{
          backgroundColor: 'var(--cc-surface)',
          borderBottom: '1px solid var(--cc-border)',
          WebkitAppRegion: 'drag',
        }}
      >
        {/* v1.2.449: шесть точек-«ручка перетаскивания» УБРАНЫ по просьбе пользователя.
            Окно от этого тащить не разучилось: вся шапка объявлена зоной перетаскивания
            (WebkitAppRegion: 'drag' у обёртки выше), точки были только подсказкой. */}

        {/* Logo. v1.2.449: рядом с названием — сам знак приложения (тот же, что в панели
            задач и на заставке). Общий вид лежит в CcMark.jsx, чтобы не расходился с иконкой. */}
        <div className="flex items-center gap-1.5 pl-2.5 pr-2 text-[13px] font-semibold whitespace-nowrap shrink-0" style={{ color: 'var(--cc-text-dim)' }}>
          <CcMark size={18} title="ЦентрЧатов" />
          ЦентрЧатов
        </div>

        {/* v1.2.300: счётчики (перенесены из нижней полосы). Не кликабельны → остаются в drag-зоне.
            v1.2.301 (ревью #1): hidden lg:flex — на узком окне (<1024px) счётчики прячутся ПЕРВЫМИ,
            чтобы значки справа не уезжали под кнопки окна. На обычном/широком окне видны. */}
        <div className="hidden lg:flex items-center shrink-0 text-[12px] whitespace-nowrap" style={{ color: 'var(--cc-text-dimmer)' }}>
          <span className="px-2.5" style={{ borderLeft: '1px solid var(--cc-border)' }} title="Входящих сообщений сегодня">💬 <b style={{ color: 'var(--cc-text-dim)' }}>{stats.today}</b> сегодня</span>
          <span className="px-2.5" style={{ borderLeft: '1px solid var(--cc-border)' }} title="Авто-ответов отправлено сегодня">⚡ <b style={{ color: stats.autoToday > 0 ? '#a855f7' : 'var(--cc-text-dim)' }}>{stats.autoToday}</b> авто</span>
          <span className="px-2.5" style={{ borderLeft: '1px solid var(--cc-border)' }} title="Всего сообщений за всё время">📊 <b style={{ color: 'var(--cc-text-dim)' }}>{stats.total}</b> всего</span>
          {totalUnread > 0 && (
            <span className="px-2.5" style={{ borderLeft: '1px solid var(--cc-border)' }} title={Object.entries(unreadCounts).filter(([, v]) => v > 0).map(([id, v]) => {
              const m = messengers.find(x => x.id === id)
              return `${m?.name || id}: ${v}`
            }).join(', ')}>📥 <b style={{ color: '#f87171' }}>{totalUnread}</b></span>
          )}
        </div>

        {/* Tabs — no-drag. v1.2.272: скрываются флагом showTopTabs; на их месте — пустая drag-зона
            (flex-1, наследует WebkitAppRegion:'drag' от шапки → окно можно двигать за середину). */}
        {showTopTabs ? (
        <div className="flex items-center flex-1 overflow-x-auto h-full min-w-0" style={{ WebkitAppRegion: 'no-drag' }}>
          {messengers.map(m => (
            <MessengerTab
              key={m.id}
              messenger={m}
              isActive={activeId === m.id}
              accountInfo={accountInfo[m.id]}
              unreadCount={
                settings.overlayMode === 'personal' && unreadSplit[m.id]
                  ? (unreadSplit[m.id].personal || 0)
                  : (unreadCounts[m.id] || 0)
              }
              unreadSplit={unreadSplit[m.id]}
              messagePreview={messagePreview[m.id]}
              zoomLevel={zoomLevels[m.id]}
              connectionHealth={connectionHealth[m.id]}
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
              onOpenConnections={onOpenConnections}
            />
          ))}

          {/* Add button */}
          <button
            onClick={() => setShowAddModal(true)}
            title="Добавить мессенджер (Ctrl+T)"
            className="flex items-center justify-center h-[30px] w-[30px] rounded-lg ml-1 text-xl leading-none transition-all duration-150 cursor-pointer shrink-0"
            style={{ color: 'var(--cc-icon)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' }}
          >+</button>
        </div>
        ) : (
          // v1.2.301 (ревью #2): короткий статус живёт В ЭТОЙ гибкой зоне (flex-1). Раньше он был
          // отдельным блоком между зоной и значками и при появлении СДВИГАЛ значки; теперь зона уже
          // занимает это место → значки не двигаются. Зона остаётся drag (текст не кликабелен),
          // окно по-прежнему можно двигать за середину. В режиме верхних вкладок (showTopTabs)
          // статус не показывается — это скрытый по умолчанию legacy-режим.
          <div className="flex-1 flex items-center justify-end min-w-0 overflow-hidden px-2">
            {statusBarMsg && (() => {
              // Статус может быть строкой (нейтрально, серым 💬) ИЛИ объектом { text, ok }:
              // ok===true → зелёная ✓ (сработало), ok===false → красная ✗ (не вышло).
              const isObj = typeof statusBarMsg === 'object' && statusBarMsg !== null
              const sbText = isObj ? statusBarMsg.text : statusBarMsg
              const sbOk = isObj ? statusBarMsg.ok : undefined
              const icon = sbOk === true ? '✓' : sbOk === false ? '✗' : '💬'
              const color = sbOk === true ? '#3ecb7c' : sbOk === false ? '#ff5c5c' : 'var(--cc-text-dim)'
              return (
                <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[280px] text-[12px]"
                  style={{ color, fontWeight: sbOk === undefined ? 400 : 600 }} title={sbText}>{icon} {sbText}</span>
              )
            })()}
          </div>
        )}

        {/* Right buttons — no-drag. v1.2.300: единый линейный набор значков, активный — черта снизу. */}
        <div className="flex items-center gap-0.5 px-1.5 shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
          <HeaderButton active={searchVisible} color="#2AABEE" onClick={toggleSearch} title="Поиск (Ctrl+F)" icon="search" />
          <HeaderButton active={showAI} color="#2AABEE" onClick={() => setShowAI(!showAI)} title="ИИ-помощник" icon="ai" />
          <HeaderButton active={showTemplates} color="#22c55e" onClick={() => setShowTemplates(!showTemplates)} title="Шаблоны ответов" icon="templates" />
          <HeaderButton active={showAutoReply} color="#a855f7" onClick={() => setShowAutoReply(!showAutoReply)} title="Авто-ответчик" icon="autoreply" />
          {/* v1.0.1: Задачи / Напоминания / AI Activity — модалки. Badge с количеством активных. */}
          <HeaderButton active={showTasks} color="#f59e0b" onClick={() => setShowTasks?.(!showTasks)} title="Задачи" badge={tasksCount} icon="tasks" />
          <HeaderButton active={showReminders} color="#eab308" onClick={() => setShowReminders?.(!showReminders)} title="Напоминания" badge={remindersCount} icon="reminders" />
          <HeaderButton active={showActivity} color="#ec4899" onClick={() => setShowActivity?.(!showActivity)} title="AI Activity" icon="activity" />
          {/* v1.1.0 (Phase 4.3): правила автоответа. v1.2.300: было 2 эмодзи 🤖⚡ (вставали в столбик) → один значок. */}
          <HeaderButton active={showAutoReplyRules} color="#8b5cf6" onClick={() => setShowAutoReplyRules?.(!showAutoReplyRules)} title="Правила автоответа AI" icon="rules" />
          <HeaderButton onClick={() => handleSettingsChange({ ...settings, theme: theme === 'dark' ? 'light' : 'dark' })} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} icon={theme === 'dark' ? 'theme' : 'moon'} />
          <HeaderButton onClick={() => setShowSettings(true)} title="Настройки (Ctrl+,)" icon="settings" />
        </div>

        {/* v1.2.300: масштаб — перенесён из нижней полосы (no-drag, только при активной вкладке чата) */}
        {activeId && (
          <div className="flex items-center gap-0.5 pr-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' }} title={`Масштаб окна чата: ${currentZoom}%`}>
            <button
              onClick={() => changeZoom(currentZoom - 5)}
              disabled={currentZoom <= 25}
              className="w-[18px] h-[18px] flex items-center justify-center rounded cursor-pointer leading-none"
              style={{ color: 'var(--cc-text-dim)', opacity: currentZoom <= 25 ? 0.3 : 1, fontSize: 15 }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              title="Уменьшить (-5%)"
            >-</button>

            {zoomEditing ? (
              <input
                ref={zoomInputRef}
                type="number" min={25} max={200}
                value={zoomInputValue}
                onChange={e => setZoomInputValue(e.target.value)}
                onBlur={() => { const v = parseInt(zoomInputValue); if (!isNaN(v)) changeZoom(v); setZoomEditing(false) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { const v = parseInt(zoomInputValue); if (!isNaN(v)) changeZoom(v); setZoomEditing(false) }
                  else if (e.key === 'Escape') setZoomEditing(false)
                }}
                className="w-[40px] text-center bg-transparent outline-none border-b"
                style={{ color: 'var(--cc-text)', borderColor: 'var(--cc-border)', fontSize: 11 }}
                autoFocus
              />
            ) : (
              <span
                onClick={() => { setZoomEditing(true); setZoomInputValue(String(currentZoom)) }}
                className="text-center cursor-pointer rounded px-0.5"
                style={{ color: currentZoom !== 100 ? '#2AABEE' : 'var(--cc-text-dim)', fontSize: 11, minWidth: 36, display: 'inline-block' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                title="Нажмите для ввода точного значения"
              >{currentZoom}%</span>
            )}

            <button
              onClick={() => changeZoom(currentZoom + 5)}
              disabled={currentZoom >= 200}
              className="w-[18px] h-[18px] flex items-center justify-center rounded cursor-pointer leading-none"
              style={{ color: 'var(--cc-text-dim)', opacity: currentZoom >= 200 ? 0.3 : 1, fontSize: 15 }}
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
              >&#8634;</button>
            )}
          </div>
        )}

        <div className="wco-spacer" />
      </div>

      {/* Search bar */}
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
          <button onClick={toggleSearch} className="text-sm px-1 cursor-pointer transition-colors" style={{ color: 'var(--cc-text-dimmer)' }}>✕</button>
        </div>
      )}

      {/* v1.2.271: меню правого клика вынесено в <TabContextMenu> (рендерится на уровне App) —
          чтобы после удаления верхних вкладок правый клик в боковой полосе продолжал работать.
          Здесь остаётся только ТРИГГЕР: MessengerTab onContextMenu → setContextMenuTab({id,x,y}). */}

      {/* v1.2.300: нижняя полоса статистики (StatusBar) удалена — всё её содержимое переехало в шапку выше. */}
    </>
  )
}

// ── HeaderButton sub-component ──
// v1.0.1: добавлен опциональный `badge` — красный кружок с числом справа-сверху.
// v1.2.300: рисует значок из общего набора (проп `icon`); активный помечается синей чертой снизу
// (стиль «подчёркивание»/вкладки), а не заливкой. Цвет черты — фирменный цвет кнопки.
function HeaderButton({ active, color, onClick, title, badge, icon, children }) {
  const showBadge = typeof badge === 'number' && badge > 0
  const accent = color || '#2AABEE'
  return (
    <button
      onClick={onClick}
      title={badge ? `${title} (${badge})` : title}
      className="relative flex items-center justify-center w-[30px] h-[34px] rounded-t-lg transition-all duration-150 cursor-pointer"
      style={{
        backgroundColor: 'transparent',
        color: active ? accent : 'var(--cc-icon)',
        boxShadow: active ? `inset 0 -2px 0 ${accent}` : 'none',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' } }}
    >
      {icon ? <CcIcon id={icon} /> : children}
      {showBadge && (
        <span style={{
          position: 'absolute', top: 1, right: 1,
          minWidth: 14, height: 14, padding: '0 3px',
          background: '#ef4444', color: '#fff',
          fontSize: 9, fontWeight: 700, lineHeight: '14px',
          textAlign: 'center', borderRadius: 7,
          boxShadow: '0 0 0 1.5px var(--cc-surface, #1a1a1a)',
          pointerEvents: 'none',
        }}>{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  )
}

// ── Значки шапки (v1.2.300) ──
// Единый линейный набор: линия 1.7px, скруглённые концы; цвет наследуется от кнопки (currentColor).
// Один значок = одна кнопка (в т.ч. «Правила автоответа» — было 2 эмодзи 🤖⚡, стало один значок).
function CcIcon({ id }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <use href={`#cc-${id}`} />
    </svg>
  )
}

// Скрытый набор символов — рендерится один раз в шапке; значки ссылаются на него через <use>.
function CcIconDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <symbol id="cc-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.7" /><path d="M20.5 20.5l-4.8-4.8" /></symbol>
        <symbol id="cc-ai" viewBox="0 0 24 24"><path d="M12 3v2.2" /><circle cx="12" cy="2.3" r="1" /><rect x="4.5" y="5.4" width="15" height="12.3" rx="3.4" /><path d="M4.5 9.6H3.1M20.9 9.6h-1.4" /><circle cx="9.4" cy="11" r="1.15" fill="currentColor" stroke="none" /><circle cx="14.6" cy="11" r="1.15" fill="currentColor" stroke="none" /><path d="M9.4 14.6h5.2" /></symbol>
        <symbol id="cc-templates" viewBox="0 0 24 24"><rect x="5" y="4.4" width="14" height="16.4" rx="2.4" /><path d="M9 3.2h6v2.6H9z" /><path d="M8.6 10h6.8M8.6 13.4h6.8M8.6 16.8h4.4" /></symbol>
        <symbol id="cc-autoreply" viewBox="0 0 24 24"><path d="M13.4 2.6L5 13.2h5.1l-1.4 8.2 8.7-11.5h-5.5z" fill="currentColor" stroke="none" /></symbol>
        <symbol id="cc-tasks" viewBox="0 0 24 24"><rect x="3.6" y="4" width="16.8" height="16" rx="3" /><path d="M6.6 9.1l1.5 1.5 2.5-2.7" /><path d="M13.2 9h4.2" /><path d="M6.6 15.1l1.5 1.5 2.5-2.7" /><path d="M13.2 15h4.2" /></symbol>
        <symbol id="cc-reminders" viewBox="0 0 24 24"><circle cx="12" cy="13.2" r="6.9" /><path d="M12 13.2V9.4M12 13.2l2.9 1.9" /><path d="M6 6.3L3.9 4.2M18 6.3L20.1 4.2" /><path d="M8.1 19.4L6.7 21M15.9 19.4L17.3 21" /></symbol>
        <symbol id="cc-activity" viewBox="0 0 24 24"><path d="M5 20.6V13.4" strokeWidth="2.3" /><path d="M10 20.6V8.4" strokeWidth="2.3" /><path d="M15 20.6V11.4" strokeWidth="2.3" /><path d="M20 20.6V5.4" strokeWidth="2.3" /></symbol>
        <symbol id="cc-rules" viewBox="0 0 24 24"><path d="M8.5 3.4v1.9" /><circle cx="8.5" cy="2.8" r="0.85" /><rect x="2.6" y="5.2" width="11.8" height="9.6" rx="2.7" /><circle cx="6.6" cy="9.4" r="1" fill="currentColor" stroke="none" /><circle cx="10.4" cy="9.4" r="1" fill="currentColor" stroke="none" /><path d="M5.8 12.2h4.4" /><path d="M18 9.6l-3.4 4.7h2.4l-.8 4.1 3.6-5h-2.6z" fill="currentColor" stroke="none" /></symbol>
        <symbol id="cc-theme" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.1" /><path d="M12 2.7v2.3M12 19v2.3M4.3 12H2M22 12h-2.3M5.7 5.7L4.1 4.1M19.9 19.9l-1.6-1.6M18.3 5.7l1.6-1.6M4.1 19.9l1.6-1.6" /></symbol>
        <symbol id="cc-moon" viewBox="0 0 24 24"><path d="M20.5 14.6A8.2 8.2 0 0 1 9.4 3.5 7.2 7.2 0 1 0 20.5 14.6z" /></symbol>
        <symbol id="cc-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.1" /><path d="M12 2.6l1.3 2.2 2.5-.5.3 2.6 2.3 1.2-1 2.4 1 2.4-2.3 1.2-.3 2.6-2.5-.5L12 21.4l-1.3-2.2-2.5.5-.3-2.6-2.3-1.2 1-2.4-1-2.4 2.3-1.2.3-2.6 2.5.5z" /></symbol>
      </defs>
    </svg>
  )
}
