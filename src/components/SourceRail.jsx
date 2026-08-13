// v1.2.244 — Этап 1: боковой рейл источников (план: .memory-bank/side-rail-migration-plan.md).
// v1.2.245 — Этап 2A: перенос индикаторов вкладок на значки (бейдж непрочитанных, точка связи,
//   пульс нового, полоска загрузки, ✓ «всё прочитано», подсказка с именем аккаунта).
//
// КОСТЯК рейла: левый вертикальный столбец источников.
//   • Сверху — нативные/API-источники (isNative или id === nativeCcId) → общий чат.
//   • Разделитель.
//   • Ниже — веб-мессенджеры (ВК/WhatsApp/MAX и т.д.).
//   • Внизу — «+» (добавить мессенджер).
// Клик по значку зовёт onSelect(id) — то же переключение, что и у верхних вкладок
// (handleTabClick → setActiveId). Рейл НЕ прячет webview и НЕ трогает z-index-слои.
// Показывается только при settings.sideRail === true.
//
// Данные индикаторов (unreadCounts/unreadSplit/connectionHealth/webviewLoading/newMessageIds/
// accountInfo) — ТЕ ЖЕ объекты, что идут во вкладки (TabBar.jsx), берутся по id.
// Ещё не перенесено (Этап 2B/2C): правый клик, перетаскивание, отдельные аккаунты, аватарки.
import { useState, useEffect, useRef } from 'react'
import ConnectionStatusDot from './ConnectionStatusDot.jsx'

/** Одна кнопка-источник. Значок = emoji на цветном фоне + индикаторы по углам. */
function RailIcon({
  m, isActive, onSelect,
  unreadCount = 0, unreadSplit, health, isLoading, isNew, accountInfo, onOpenConnections,
}) {
  const color = m.color || '#2AABEE'
  // ✓ «всё прочитано»: показываем 2с после того, как счётчик упал с >0 до 0 (как во вкладке).
  const [showReadCheck, setShowReadCheck] = useState(false)
  const prevCountRef = useRef(unreadCount)
  useEffect(() => {
    if (unreadCount === 0 && prevCountRef.current > 0) {
      setShowReadCheck(true)
      const t = setTimeout(() => setShowReadCheck(false), 2000)
      prevCountRef.current = unreadCount
      return () => clearTimeout(t)
    }
    prevCountRef.current = unreadCount
  }, [unreadCount])

  const badgeTooltip = unreadSplit
    ? `Непрочитанных: ${unreadCount}\n💬 Личные: ${unreadSplit.personal || 0}\n📢 Каналы/группы: ${unreadSplit.channels || 0}`
    : `Непрочитанных: ${unreadCount}`
  const tip = accountInfo ? `${m.name} — ${accountInfo}` : m.name

  return (
    <button
      type="button"
      data-id={m.id}
      aria-current={isActive ? 'true' : undefined}
      title={tip}
      onClick={() => onSelect(m.id)}
      className="relative flex items-center justify-center cursor-pointer transition-all duration-150"
      style={{
        width: 48, height: 48, borderRadius: 14, margin: '3px auto', fontSize: 22, lineHeight: 1,
        backgroundColor: isActive ? `${color}22` : 'transparent',
        outline: isActive ? `1.5px solid ${color}88` : '1.5px solid transparent',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      {/* Пилюля активного слева (как Discord) */}
      {isActive && (
        <span aria-hidden="true" style={{
          position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)',
          width: 4, height: 22, borderRadius: 4, backgroundColor: color,
        }} />
      )}

      {/* Пульс при новом сообщении (кольцо за значком) */}
      {isNew && !isActive && (
        <span aria-hidden="true" className="animate-ping" style={{
          position: 'absolute', inset: 6, borderRadius: 12, backgroundColor: color, opacity: 0.35,
        }} />
      )}

      <span aria-hidden="true">{m.emoji || (m.name ? m.name[0] : '•')}</span>

      {/* Бейдж непрочитанных (верхний правый угол) или ✓ «всё прочитано» */}
      {unreadCount > 0 ? (
        <span
          data-testid={`rail-unread-${m.id}`}
          title={badgeTooltip}
          style={{
            position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, padding: '0 4px',
            borderRadius: 9, backgroundColor: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            boxShadow: '0 0 0 2px var(--cc-bg)',
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : showReadCheck ? (
        <span
          data-testid={`rail-read-${m.id}`}
          title="Все сообщения прочитаны"
          style={{
            position: 'absolute', top: -3, right: -3, width: 17, height: 17, borderRadius: 9,
            backgroundColor: '#22c55e22', color: '#22c55e', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            boxShadow: '0 0 0 2px var(--cc-bg)',
          }}
        >✓</span>
      ) : null}

      {/* Точка связи (нижний правый угол), клик → «Подключения».
          Видимая точка 10px, но кликабельная зона-обёртка 20px (растёт внутрь значка,
          в пустое место) — легче попасть. stopPropagation: клик по точке НЕ переключает источник. */}
      <span
        data-testid={`rail-dot-${m.id}`}
        role="button"
        tabIndex={0}
        aria-label={`Подключение — ${m.name}`}
        title={`Подключение — ${m.name}`}
        onClick={e => { e.stopPropagation(); e.preventDefault(); onOpenConnections?.(e) }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onOpenConnections?.(e) } }}
        style={{
          position: 'absolute', bottom: -1, right: -1, width: 20, height: 20,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', cursor: 'pointer',
        }}
      >
        <ConnectionStatusDot
          health={health}
          fallbackColor={isActive ? color : `${color}66`}
          fallbackLabel={m.name}
          size={10}
          style={{ boxShadow: '0 0 0 2px var(--cc-bg)', pointerEvents: 'none' }}
        />
      </span>

      {/* Полоска загрузки под значком */}
      {isLoading && (
        <span aria-hidden="true" style={{
          position: 'absolute', bottom: 0, left: 6, right: 6, height: 2, borderRadius: 2, overflow: 'hidden',
        }}>
          <span style={{
            display: 'block', height: '100%',
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            animation: 'tabLoading 1.2s ease-in-out infinite',
          }} />
        </span>
      )}
    </button>
  )
}

/**
 * @param {Array} messengers — тот же массив источников, что у вкладок (вкл. native_cc).
 * @param {string} activeId — id активного источника.
 * @param {(id:string)=>void} onSelect — переключение (обычно handleTabClick из App.jsx).
 * @param {()=>void} onAdd — открыть окно «добавить мессенджер».
 * @param {string} nativeCcId — id нативной вкладки (NATIVE_CC_ID).
 * Индикаторы (по id, те же объекты, что во вкладках):
 * @param {Object} unreadCounts, unreadSplit, connectionHealth, webviewLoading, accountInfo
 * @param {Set} newMessageIds
 * @param {()=>void} onOpenConnections
 */
export default function SourceRail({
  messengers = [], activeId, onSelect, onAdd, nativeCcId,
  unreadCounts = {}, unreadSplit = {}, connectionHealth = {}, webviewLoading = {},
  newMessageIds, accountInfo = {}, onOpenConnections,
}) {
  const isNativeSrc = m => !!m.isNative || m.id === nativeCcId
  const nativeSources = messengers.filter(isNativeSrc)
  const webSources = messengers.filter(m => !isNativeSrc(m))

  const renderIcon = m => (
    <RailIcon
      key={m.id} m={m} isActive={activeId === m.id} onSelect={onSelect}
      unreadCount={unreadCounts[m.id] || 0}
      unreadSplit={unreadSplit[m.id]}
      health={connectionHealth[m.id]}
      isLoading={!!webviewLoading[m.id]}
      isNew={!!newMessageIds?.has?.(m.id)}
      accountInfo={accountInfo[m.id]}
      onOpenConnections={onOpenConnections}
    />
  )

  return (
    <div
      data-testid="source-rail"
      className="flex flex-col items-center h-full overflow-y-auto overflow-x-hidden shrink-0"
      style={{
        width: 64, paddingTop: 8, paddingBottom: 8,
        backgroundColor: 'var(--cc-bg)', borderRight: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* API / нативные источники — сверху */}
      {nativeSources.map(renderIcon)}

      {/* Разделитель — только если есть обе секции */}
      {nativeSources.length > 0 && webSources.length > 0 && (
        <span aria-hidden="true" style={{
          width: 28, height: 1, backgroundColor: 'rgba(255,255,255,0.12)', margin: '6px auto',
        }} />
      )}

      {/* Веб-мессенджеры — ниже */}
      {webSources.map(renderIcon)}

      {/* «+» добавить — внизу */}
      <button
        type="button"
        data-testid="source-rail-add"
        title="Добавить мессенджер"
        onClick={onAdd}
        className="flex items-center justify-center cursor-pointer transition-all duration-150 mt-2"
        style={{
          width: 48, height: 48, borderRadius: 14, margin: '3px auto', fontSize: 24,
          color: 'var(--cc-text-dim)', backgroundColor: 'transparent',
          border: '1.5px dashed rgba(255,255,255,0.18)',
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)' }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        +
      </button>
    </div>
  )
}
