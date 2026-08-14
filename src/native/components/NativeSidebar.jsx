// v1.2.258 — боковая полоса нативного режима (аккаунты сверху + веб-мессенджеры ниже),
// вынесена из NativeApp.jsx для разгрузки (был 494/600). ПОВЕДЕНИЕ НЕ ИЗМЕНЕНО — чистый
// перенос JSX + приём тех же значений через пропсы. Логика (store, DnD, ресайз, вход) —
// осталась в NativeApp и передаётся сюда.
import { isAllVisible, visibleAccountCount } from '../../../shared/accountFilter.js'
import { getAccountColor } from '../../../shared/accountColors.js'
import AccountAvatar from './AccountAvatar.jsx'
import RailWebIcon from './RailWebIcon.jsx'
import RailModeSwitcher from './RailModeSwitcher.jsx'

export default function NativeSidebar({
  railWidth, railScale, isRailResizing, store, orderedAccounts,
  dragSrcIdx, dragOverIdx, handleAccountDragStart, handleAccountDragOver, handleAccountDragEnd,
  unreadByAccount, accountHealth, handleAccountContextMenu, setHoveredAccountId,
  onOpenConnections, hideRailLabel, openLogin, modes,
  // веб-мессенджеры в этой же полосе (Модель 🅰️)
  webSources = [], activeMessengerId, onSelectSource, webUnread = {}, webHealth = {}, webNew,
  webLoading = {}, onWebContextMenu, onWebDragStart, onWebDragOver, onWebDrop, onWebDragEnd,
  webDragOverId, onAddWeb,
}) {
  return (
    <div
      className="native-sidebar"
      style={{ width: railWidth, display: 'flex', flexDirection: 'column', flexShrink: 0,
        transition: isRailResizing ? 'none' : 'width 0.1s' }}
    >
      {/* Кнопка «Все» — над аккаунтами. Горит при показе всех; иначе счётчик N/M. Только при ≥2. */}
      {store.accounts.length >= 2 && (
        <div
          onClick={() => store.showAllAccounts()}
          title="Показать чаты всех аккаунтов"
          style={{
            width: Math.round(48 * railScale), minHeight: Math.round(30 * railScale), margin: `0 auto ${Math.round(12 * railScale)}px`,
            borderRadius: Math.round(12 * railScale), cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: Math.max(9, Math.round(12 * railScale)), fontWeight: 700,
            background: isAllVisible(store.hiddenAccountIds, store.soloAccountId) ? 'var(--amoled-accent)' : 'var(--amoled-surface)',
            color: isAllVisible(store.hiddenAccountIds, store.soloAccountId) ? '#fff' : 'var(--amoled-text-dim)',
            border: '1px solid var(--amoled-border)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >{isAllVisible(store.hiddenAccountIds, store.soloAccountId)
          ? 'Все'
          : `${visibleAccountCount(store.accounts.map(a => a.id), store.hiddenAccountIds, store.soloAccountId)}/${store.accounts.length}`}</div>
      )}
      {orderedAccounts.map((acc, idx) => (
        <div
          key={acc.id}
          draggable
          onDragStart={(e) => handleAccountDragStart(e, idx)}
          onDragOver={(e) => handleAccountDragOver(e, idx)}
          onDragEnd={handleAccountDragEnd}
          onDrop={handleAccountDragEnd}
          style={{
            // Визуальная подсветка: тащимый — полупрозрачный, drop target — accent border
            opacity: dragSrcIdx === idx ? 0.4 : 1,
            outline: dragOverIdx === idx && dragSrcIdx !== idx
              ? '2px dashed var(--amoled-accent)' : 'none',
            outlineOffset: -2,
            borderRadius: 8,
            transition: 'opacity 0.15s, outline 0.1s',
            cursor: dragSrcIdx === idx ? 'grabbing' : 'grab',
          }}
        >
          <AccountAvatar
            account={acc}
            accountColor={store.accounts.length >= 2 ? getAccountColor(store.accountColors, acc.id) : null}
            unreadCount={unreadByAccount[acc.id] || 0}
            health={accountHealth[acc.id]}
            filterActive={store.accounts.length >= 2}
            hidden={(store.hiddenAccountIds || []).includes(acc.id)}
            solo={store.soloAccountId === acc.id}
            dimmed={store.soloAccountId ? store.soloAccountId !== acc.id : (store.hiddenAccountIds || []).includes(acc.id)}
            onToggleVisible={store.accounts.length >= 2 ? () => store.toggleAccountVisible(acc.id) : undefined}
            onSolo={store.accounts.length >= 2 ? () => store.soloAccount(acc.id) : undefined}
            onContextMenu={(e) => handleAccountContextMenu(e, acc)}
            onMouseEnter={() => setHoveredAccountId(acc.id)}
            onMouseLeave={() => setHoveredAccountId(null)}
            onOpenConnections={onOpenConnections}
            scale={railScale}
            hideLabel={hideRailLabel}
          />
        </div>
      ))}
      {/* v1.2.259: аккаунт-«+» с подписью «аккаунт» — чтобы не путать с «+веб» ниже. */}
      <div
        className="native-account native-account__add"
        data-testid="native-rail-add-account"
        onClick={openLogin}
        title="Добавить аккаунт Telegram (вход)"
        style={{ width: Math.round(48 * railScale), height: Math.round(48 * railScale),
          margin: `0 auto ${Math.round(12 * railScale)}px`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}
      >
        <span style={{ fontSize: Math.round(18 * railScale), lineHeight: 1 }}>＋</span>
        <span style={{ fontSize: 8, lineHeight: 1, opacity: 0.85 }}>аккаунт</span>
      </div>
      {/* Веб-мессенджеры (ВК/WhatsApp/МАКС) — разделитель + значки + «+» добавить. */}
      {(webSources.length > 0 || onAddWeb) && (
        <>
          <div aria-hidden="true" style={{ width: Math.round(28 * railScale), height: 1,
            background: 'var(--amoled-border)', margin: `0 auto ${Math.round(12 * railScale)}px` }} />
          {webSources.map(m => (
            <RailWebIcon
              key={m.id} messenger={m} isActive={activeMessengerId === m.id}
              unread={webUnread[m.id] || 0} health={webHealth[m.id]} isNew={!!webNew?.has?.(m.id)}
              isLoading={!!webLoading[m.id]}
              onSelect={onSelectSource} onOpenConnections={onOpenConnections} scale={railScale}
              onContextMenu={onWebContextMenu}
              onDragStart={onWebDragStart} onDragOver={onWebDragOver} onDrop={onWebDrop} onDragEnd={onWebDragEnd}
              isDragOver={webDragOverId === m.id}
            />
          ))}
          {/* v1.2.259: веб-«+» с подписью «веб» — явно отличается от «+аккаунт» выше. */}
          {onAddWeb && (
            <div
              role="button" tabIndex={0}
              data-testid="native-rail-add-web"
              title="Добавить веб-мессенджер"
              onClick={onAddWeb}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAddWeb() } }}
              style={{
                width: Math.round(48 * railScale), height: Math.round(48 * railScale),
                margin: `0 auto ${Math.round(12 * railScale)}px`, borderRadius: Math.round(14 * railScale),
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                color: 'var(--amoled-text-dim)', cursor: 'pointer',
                border: '1.5px dashed var(--amoled-border)',
              }}
            >
              <span style={{ fontSize: Math.round(18 * railScale), lineHeight: 1 }}>＋</span>
              <span style={{ fontSize: 8, lineHeight: 1, opacity: 0.85 }}>веб</span>
            </div>
          )}
        </>
      )}
      {/* Переключатель режимов (Чаты/Клиенты/Доска) в самом низу рейла. */}
      <div style={{ width: Math.round(28 * railScale), height: 1, background: 'var(--amoled-border)', margin: `auto auto ${Math.round(10 * railScale)}px` }} />
      <RailModeSwitcher modes={modes} activeId={store.mode} onSelect={(id) => store.setMode(id)} scale={railScale} />
    </div>
  )
}
