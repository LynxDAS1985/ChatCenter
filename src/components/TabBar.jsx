// TabBar.jsx — Tab bar with messenger tabs, header buttons, search bar
import MessengerTab from './MessengerTab.jsx'

/**
 * Props:
 * - messengers, activeId, accountInfo, settings, unreadCounts, unreadSplit
 * - messagePreview, zoomLevels, monitorStatus, webviewLoading
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
 */
export default function TabBar({
  messengers, activeId, accountInfo, settings, unreadCounts, unreadSplit,
  messagePreview, zoomLevels, monitorStatus, webviewLoading,
  newMessageIds, dragOverId, contextMenuTab,
  showAI, showTemplates, showAutoReply, searchVisible, searchText,
  theme, currentZoom,
  handleTabClick, handleDragStart, handleDragOver, handleDrop, handleDragEnd,
  askRemoveMessenger, setShowAddModal, setContextMenuTab,
  toggleSearch, setShowAI, setShowTemplates, setShowAutoReply,
  setShowSettings, handleSettingsChange,
  handleSearch, searchInputRef, webviewRefs, activeIdRef,
  handleTabContextAction,
  changeZoom, zoomEditing, setZoomEditing, zoomInputValue, setZoomInputValue, zoomInputRef,
  statusBarMsg, stats, totalUnread,
}) {
  const pinnedTabs = settings.pinnedTabs || {}

  return (
    <>
      {/* Header */}
      <div
        className="flex items-center h-[48px] shrink-0 select-none"
        style={{
          backgroundColor: 'var(--cc-surface)',
          borderBottom: '1px solid var(--cc-border)',
          WebkitAppRegion: 'drag',
        }}
      >
        {/* Drag handle */}
        <div className="flex items-center justify-center w-[28px] h-full shrink-0 cursor-grab" title="Перетащить окно">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
            {[0, 6].map(x => [2, 6, 10].map(y => (
              <circle key={`${x}-${y}`} cx={x + 2} cy={y} r={1.2} fill="var(--cc-icon)" />
            )))}
          </svg>
        </div>

        {/* Logo */}
        <div className="pr-3 text-[13px] font-semibold whitespace-nowrap shrink-0" style={{ color: 'var(--cc-text-dim)' }}>
          ЦентрЧатов
        </div>

        {/* Tabs — no-drag */}
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

        {/* Right buttons — no-drag */}
        <div className="flex items-center gap-0.5 px-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
          <HeaderButton active={searchVisible} color="#2AABEE" onClick={toggleSearch} title="Поиск (Ctrl+F)">🔍</HeaderButton>
          <HeaderButton active={showAI} color="#2AABEE" onClick={() => setShowAI(!showAI)} title="ИИ-помощник">🤖</HeaderButton>
          <HeaderButton active={showTemplates} color="#22c55e" onClick={() => setShowTemplates(!showTemplates)} title="Шаблоны ответов">📋</HeaderButton>
          <HeaderButton active={showAutoReply} color="#a855f7" onClick={() => setShowAutoReply(!showAutoReply)} title="Авто-ответчик">⚡</HeaderButton>
          <HeaderButton onClick={() => handleSettingsChange({ ...settings, theme: theme === 'dark' ? 'light' : 'dark' })} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </HeaderButton>
          <HeaderButton onClick={() => setShowSettings(true)} title="Настройки (Ctrl+,)">⚙️</HeaderButton>
        </div>

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

      {/* Context menu */}
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
              const tabPinned = !!pinnedTabs[contextMenuTab?.id]
              return [
                { action: 'reload', icon: '🔄', label: 'Перезагрузить' },
                { action: 'notifLog', icon: '📊', label: 'Диагностика и логи' },
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

      {/* Status bar */}
      <StatusBar
        stats={stats} totalUnread={totalUnread} unreadCounts={unreadCounts} messengers={messengers}
        statusBarMsg={statusBarMsg} activeId={activeId} currentZoom={currentZoom}
        changeZoom={changeZoom} zoomEditing={zoomEditing} setZoomEditing={setZoomEditing}
        zoomInputValue={zoomInputValue} setZoomInputValue={setZoomInputValue} zoomInputRef={zoomInputRef}
      />
    </>
  )
}

// ── HeaderButton sub-component ──
function HeaderButton({ active, color, onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
      style={{
        backgroundColor: active ? `${color || 'var(--cc-icon)'}26` : 'transparent',
        color: active ? (color || 'var(--cc-icon)') : 'var(--cc-icon)',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' } }}
    >{children}</button>
  )
}

// ── StatusBar sub-component ──
function StatusBar({
  stats, totalUnread, unreadCounts, messengers, statusBarMsg,
  activeId, currentZoom, changeZoom,
  zoomEditing, setZoomEditing, zoomInputValue, setZoomInputValue, zoomInputRef,
}) {
  return (
    <div
      className="flex items-center px-3 h-[26px] text-[11px] gap-3 shrink-0 select-none"
      style={{ backgroundColor: 'var(--cc-surface)', borderTop: '1px solid var(--cc-border)', color: 'var(--cc-text-dimmer)' }}
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
      {statusBarMsg && (
        <>
          <span style={{ opacity: 0.3 }}>·</span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[300px]" style={{ color: 'var(--cc-text-dim)' }} title={statusBarMsg}>💬 {statusBarMsg}</span>
        </>
      )}
      {activeId && (
        <div className="ml-auto flex items-center gap-0.5" title={`Масштаб окна чата: ${currentZoom}%`}>
          <button
            onClick={() => changeZoom(currentZoom - 5)}
            disabled={currentZoom <= 25}
            className="w-[16px] h-[16px] flex items-center justify-center rounded cursor-pointer leading-none"
            style={{ color: 'var(--cc-text-dim)', opacity: currentZoom <= 25 ? 0.3 : 1, fontSize: 14 }}
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
            >&#8634;</button>
          )}
        </div>
      )}
    </div>
  )
}
