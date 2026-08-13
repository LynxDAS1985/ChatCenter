// v1.2.244 — Этап 1 миграции на боковой рейл (план: .memory-bank/side-rail-migration-plan.md).
// КОСТЯК: левый вертикальный рейл источников.
//   • Сверху — нативные/API-источники (isNative или id === nativeCcId) → общий чат.
//   • Разделитель.
//   • Ниже — веб-мессенджеры (ВК/WhatsApp/MAX и т.д.).
//   • Внизу — «+» (добавить мессенджер).
// Клик по значку зовёт onSelect(id) — то же переключение, что и у верхних вкладок
// (handleTabClick → setActiveId). Рейл НЕ прячет webview и НЕ трогает z-index-слои —
// он просто колонка-сосед. Показывается только при settings.sideRail === true.
//
// Этап 1 — только костяк (значки + переключение + активная подсветка). Бейджи
// непрочитанных, точка связи, правый клик, перетаскивание — Этап 2 (чек-лист «не потерять»).

/** Одна кнопка-источник. Значок = emoji на цветном фоне, слева пилюля активного. */
function RailIcon({ m, isActive, onSelect }) {
  const color = m.color || '#2AABEE'
  return (
    <button
      type="button"
      data-id={m.id}
      aria-current={isActive ? 'true' : undefined}
      title={m.name}
      onClick={() => onSelect(m.id)}
      className="relative flex items-center justify-center cursor-pointer transition-all duration-150"
      style={{
        width: 48,
        height: 48,
        borderRadius: 14,
        margin: '3px auto',
        fontSize: 22,
        lineHeight: 1,
        backgroundColor: isActive ? `${color}22` : 'transparent',
        outline: isActive ? `1.5px solid ${color}88` : '1.5px solid transparent',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      {/* Пилюля активного слева (как Discord) */}
      {isActive && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)',
            width: 4, height: 22, borderRadius: 4, backgroundColor: color,
          }}
        />
      )}
      <span aria-hidden="true">{m.emoji || (m.name ? m.name[0] : '•')}</span>
    </button>
  )
}

/**
 * @param {Array} messengers — тот же массив источников, что у вкладок (вкл. native_cc).
 * @param {string} activeId — id активного источника.
 * @param {(id:string)=>void} onSelect — переключение (обычно handleTabClick из App.jsx).
 * @param {()=>void} onAdd — открыть окно «добавить мессенджер».
 * @param {string} nativeCcId — id нативной вкладки (NATIVE_CC_ID).
 */
export default function SourceRail({ messengers = [], activeId, onSelect, onAdd, nativeCcId }) {
  const isNativeSrc = m => !!m.isNative || m.id === nativeCcId
  const nativeSources = messengers.filter(isNativeSrc)
  const webSources = messengers.filter(m => !isNativeSrc(m))

  return (
    <div
      data-testid="source-rail"
      className="flex flex-col items-center h-full overflow-y-auto overflow-x-hidden shrink-0"
      style={{
        width: 64,
        paddingTop: 8,
        paddingBottom: 8,
        backgroundColor: 'var(--cc-bg)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* API / нативные источники — сверху */}
      {nativeSources.map(m => (
        <RailIcon key={m.id} m={m} isActive={activeId === m.id} onSelect={onSelect} />
      ))}

      {/* Разделитель — только если есть обе секции */}
      {nativeSources.length > 0 && webSources.length > 0 && (
        <span
          aria-hidden="true"
          style={{ width: 28, height: 1, backgroundColor: 'rgba(255,255,255,0.12)', margin: '6px auto' }}
        />
      )}

      {/* Веб-мессенджеры — ниже */}
      {webSources.map(m => (
        <RailIcon key={m.id} m={m} isActive={activeId === m.id} onSelect={onSelect} />
      ))}

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
