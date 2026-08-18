// v1.2.271: меню правого клика по источнику вынесено из TabBar в отдельный компонент,
// рисуется на уровне App (не в TabBar) — чтобы при будущем удалении верхних вкладок
// правый клик по значкам боковой полосы продолжал открывать меню.
// Триггер (правый клик → setContextMenuTab({id,x,y})) остаётся у вкладок (TabBar) и у
// значков полосы (RailWebIcon) — оба ставят одно состояние contextMenuTab, а рисует его этот компонент.
// Позиционирование — position:fixed по координатам курсора → НЕ влияет на раскладку.
import { buildTabContextMenuItems } from '../utils/tabContextMenuItems.js'

export default function TabContextMenu({ contextMenuTab, setContextMenuTab, pinnedTabs = {}, messengers = [], onAction }) {
  if (!contextMenuTab) return null
  // Нативный источник («Общий чат») прячет веб-only пункты (reload/notifLog/copyUrl).
  const tabPinned = !!pinnedTabs[contextMenuTab.id]
  const ctxIsNative = !!messengers.find(x => x.id === contextMenuTab.id)?.isNative
  return (
    <div
      className="fixed z-[100]"
      style={{ left: contextMenuTab.x, top: contextMenuTab.y }}
      onMouseLeave={() => setContextMenuTab(null)}
    >
      <div
        className="rounded-lg py-1 shadow-xl text-[12px] min-w-[180px]"
        style={{ backgroundColor: 'var(--cc-surface)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
      >
        {buildTabContextMenuItems({ isNative: ctxIsNative, pinned: tabPinned }).map(item => (
          <button
            key={item.action}
            onClick={() => onAction(item.action)}
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors cursor-pointer"
            style={{ color: item.color || 'inherit' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <span className="w-[16px] text-center">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
