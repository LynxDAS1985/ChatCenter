// v1.2.258 — боковая полоса нативного режима (аккаунты сверху + веб-мессенджеры ниже),
// вынесена из NativeApp.jsx для разгрузки (был 494/600). ПОВЕДЕНИЕ НЕ ИЗМЕНЕНО — чистый
// перенос JSX + приём тех же значений через пропсы. Логика (store, DnD, ресайз, вход) —
// осталась в NativeApp и передаётся сюда.
// v1.2.294 — API-аккаунты и веб-вкладки разделены КОНТЕЙНЕРАМИ («коробочки» с подписью «API» / «Веб»)
// вместо тонкой линии. Показываются только когда есть веб (иначе просто список аккаунтов, как раньше).
import { isAllVisible, visibleAccountCount } from '../../../shared/accountFilter.js'
import { getAccountColor } from '../../../shared/accountColors.js'
import AccountAvatar from './AccountAvatar.jsx'
import RailWebIcon from './RailWebIcon.jsx'
import RailModeSwitcher from './RailModeSwitcher.jsx'

export default function NativeSidebar({
  railWidth, railScale, isRailResizing, store, orderedAccounts,
  dragSrcIdx, dragOverIdx, handleAccountDragStart, handleAccountDragOver, handleAccountDragEnd,
  unreadByAccount, accountHealth, handleAccountContextMenu, setHoveredAccountId,
  onOpenConnections, hideRailLabel, modes,
  // веб-мессенджеры в этой же полосе (Модель 🅰️)
  webSources = [], activeMessengerId, onSelectSource, webUnread = {}, webHealth = {}, webNew,
  webLoading = {}, onWebContextMenu, onWebDragStart, onWebDragOver, onWebDrop, onWebDragEnd,
  webDragOverId, webAccountInfo = {}, // v1.2.273: имя аккаунта под веб-значком
  webAccountAvatars = {}, // v1.2.275: аватар веб-аккаунта на значке
  // v1.2.263: тык в API-аккаунт/«Все» при открытом вебе → вернуться к API-чатам (App переключит вкладку).
  onActivateNative,
  // v1.2.264: одна кнопка «＋ Добавить» открывает окно «протокол → мессенджер».
  onOpenAddSource,
}) {
  // v1.2.294: контейнер-«коробочка» для группы + текстовая подпись (синяя «API» / зелёная «Веб»).
  const groupBox = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: Math.round(9 * railScale),
    width: `calc(100% - ${Math.round(8 * railScale)}px)`, margin: '0 auto',
    padding: `${Math.round(6 * railScale)}px ${Math.round(4 * railScale)}px`, overflow: 'visible',
    background: 'var(--amoled-surface)', borderRadius: Math.round(15 * railScale), border: '1px solid var(--amoled-border)',
  }
  const groupHead = (accent) => ({
    fontSize: Math.max(8, Math.round(9.5 * railScale)), fontWeight: 800, letterSpacing: '0.09em',
    textTransform: 'uppercase', color: accent === 'api' ? 'var(--amoled-accent)' : '#34d399',
  })

  // API-аккаунты (каждый — draggable, с аватаром). Вынесены в массив, чтобы обернуть в контейнер.
  const accountNodes = orderedAccounts.map((acc, idx) => (
    <div
      key={acc.id}
      draggable
      // v1.2.263: любой клик по API-аккаунту при открытом вебе → сперва вернуть API-чаты
      // (onClickCapture — до внутренних обработчиков аватара, не зависит от stopPropagation).
      onClickCapture={() => onActivateNative?.()}
      onDragStart={(e) => handleAccountDragStart(e, idx)}
      onDragOver={(e) => handleAccountDragOver(e, idx)}
      onDragEnd={handleAccountDragEnd}
      onDrop={handleAccountDragEnd}
      style={{
        opacity: dragSrcIdx === idx ? 0.4 : 1,
        outline: dragOverIdx === idx && dragSrcIdx !== idx ? '2px dashed var(--amoled-accent)' : 'none',
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
  ))

  // Веб-мессенджеры (ВК/WhatsApp/МАКС).
  const webNodes = webSources.map(m => (
    <RailWebIcon
      key={m.id} messenger={m} isActive={activeMessengerId === m.id}
      unread={webUnread[m.id] || 0} health={webHealth[m.id]} isNew={!!webNew?.has?.(m.id)}
      isLoading={!!webLoading[m.id]}
      onSelect={onSelectSource} onOpenConnections={onOpenConnections} scale={railScale}
      onContextMenu={onWebContextMenu}
      onDragStart={onWebDragStart} onDragOver={onWebDragOver} onDrop={onWebDrop} onDragEnd={onWebDragEnd}
      isDragOver={webDragOverId === m.id}
      accountName={webAccountInfo[m.id]} hideLabel={hideRailLabel}
      avatar={webAccountAvatars[m.id]}
    />
  ))

  return (
    // v1.2.302: рейл = 3 зоны. Верх («Все») и низ («＋ Добавить» + переключатель режимов) закреплены
    // (flex-shrink:0), середина (аккаунты/веб) прокручивается (flex:1 + min-height:0 + overflow-y:auto).
    // Раньше это была одна колонка без прокрутки → при многих источниках низ вылезал и обрезался.
    <div
      className="native-sidebar"
      style={{ width: railWidth, height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', flexShrink: 0,
        gap: Math.round(4 * railScale), transition: isRailResizing ? 'none' : 'width 0.1s' }}
    >
      {/* ── ВЕРХ (закреплён): кнопка «Все». Горит при показе всех; иначе счётчик N/M. Только при ≥2. ── */}
      {store.accounts.length >= 2 && (
        <div
          onClick={() => { onActivateNative?.(); store.showAllAccounts() }}
          title="Показать чаты всех аккаунтов"
          style={{
            flexShrink: 0,
            width: Math.round(48 * railScale), minHeight: Math.round(30 * railScale), margin: '0 auto',
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

      {/* ── СЕРЕДИНА (прокручивается): источники. v1.2.294: есть веб → две «коробочки» (API / Веб);
             нет веба → просто список аккаунтов, как раньше. ── */}
      <div
        className="native-rail-scroll"
        style={{ flex: '1 1 auto', minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: Math.round(4 * railScale), overflowY: 'auto', overflowX: 'hidden' }}
      >
        {webSources.length > 0 ? (
          <>
            {accountNodes.length > 0 && (
              <div style={groupBox}><div style={groupHead('api')}>API</div>{accountNodes}</div>
            )}
            <div style={groupBox}><div style={groupHead('web')}>Веб</div>{webNodes}</div>
          </>
        ) : (
          accountNodes
        )}
      </div>

      {/* ── НИЗ (закреплён): «＋ Добавить» + переключатель режимов. flex-shrink:0 → всегда видны, держат форму. ── */}
      <div style={{ flexShrink: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* v1.2.264: ОДНА кнопка «＋ Добавить» → окно «протокол → мессенджер». Сперва переключаемся
            на API-инбокс (onActivateNative), чтобы окно/вход были видны над вебом. */}
        <div aria-hidden="true" style={{ width: Math.round(28 * railScale), height: 1,
          background: 'var(--amoled-border)', margin: `0 auto ${Math.round(10 * railScale)}px` }} />
        <div
          role="button" tabIndex={0}
          data-testid="native-rail-add"
          title="Добавить источник (аккаунт или веб)"
          onClick={() => { onActivateNative?.(); onOpenAddSource?.() }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivateNative?.(); onOpenAddSource?.() } }}
          style={{
            width: Math.round(48 * railScale), height: Math.round(48 * railScale),
            margin: `0 auto ${Math.round(10 * railScale)}px`, borderRadius: Math.round(14 * railScale),
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
            color: 'var(--amoled-text-dim)', cursor: 'pointer',
            border: '1.5px dashed var(--amoled-accent)',
          }}
        >
          <span style={{ fontSize: Math.round(18 * railScale), lineHeight: 1 }}>＋</span>
          <span style={{ fontSize: 8, lineHeight: 1, opacity: 0.85 }}>Добавить</span>
        </div>
        {/* Переключатель режимов (Чаты/Клиенты/Доска) в самом низу рейла. */}
        <div style={{ width: Math.round(28 * railScale), height: 1, background: 'var(--amoled-border)', margin: `0 auto ${Math.round(10 * railScale)}px` }} />
        <RailModeSwitcher modes={modes} activeId={store.mode} onSelect={(id) => store.setMode(id)} scale={railScale} />
      </div>
    </div>
  )
}
