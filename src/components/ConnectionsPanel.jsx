import { useEffect, useMemo, useState } from 'react'
import {
  HEALTH_ERROR,
  HEALTH_OK,
  HEALTH_PENDING,
  HEALTH_SLOW,
  formatHealthMs,
  formatHealthTime,
  getHealthColor,
  getHealthLabel,
} from '../utils/connectionHealth.js'
import { HEALTH_SCHEDULER_TICK_MS, nextHealthDelay } from '../utils/connectionHealthScheduler.js'

function splitItems(items) {
  const webview = []
  const native = []
  for (const item of items) {
    if (item.type === 'native') native.push(item)
    else webview.push(item)
  }
  return { webview, native }
}

function statusHint(state) {
  if (state === HEALTH_ERROR) return 'Проверьте интернет, VPN или доступность сервиса.'
  if (state === HEALTH_SLOW) return 'Подключение есть, но ответы идут долго.'
  if (state === HEALTH_PENDING) return 'Первая проверка ещё не завершилась.'
  if (state === HEALTH_OK) return 'Последняя проверка прошла нормально.'
  return ''
}

function HealthPill({ state }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: getHealthColor({ state }) }} />
      {getHealthLabel({ state })}
    </span>
  )
}

function ConnectionRow({ item, selected, onClick }) {
  const healthColor = getHealthColor(item)
  return (
    <button
      onClick={() => onClick(item)}
      className="w-full grid grid-cols-[1fr_120px_76px_52px] gap-3 items-center text-left px-3 py-2 rounded-md transition-colors"
      style={{
        backgroundColor: selected ? 'rgba(42,171,238,0.16)' : 'transparent',
        color: 'var(--cc-text)',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: healthColor, flexShrink: 0 }} />
        <span className="truncate text-sm font-medium">{item.label || item.id}</span>
      </span>
      <span className="text-xs" style={{ color: 'var(--cc-text-dim)' }}>{getHealthLabel(item)}</span>
      <span className="text-xs text-right font-medium" style={{ color: healthColor }}>{formatHealthMs(item.lastMs)}</span>
      <span className="text-xs text-right" style={{ color: 'var(--cc-text-dimmer)' }}>{formatHealthTime(item.lastCheckedAt)}</span>
    </button>
  )
}

function formatNextCheckText(item, { now, activeId, activeNativeAccountId, webviewLoading }) {
  if (!item?.id) return '-'
  if (item.type === 'webview' && webviewLoading?.[item.id]) return 'после загрузки'
  if (item.state === HEALTH_PENDING && !item.lastMs) return 'идёт сейчас'
  const lastCheckedAt = item.lastCheckedAt || item.lastOkAt
  if (!lastCheckedAt) return 'скоро'
  let windowFocused = true
  try { windowFocused = document.hasFocus() } catch {}
  const isActive = item.type === 'native' ? item.id === activeNativeAccountId : item.id === activeId
  const delay = nextHealthDelay({ item, isActive, windowFocused })
  const remaining = Math.max(0, (lastCheckedAt + delay) - now)
  if (remaining <= HEALTH_SCHEDULER_TICK_MS) return 'скоро'
  const seconds = Math.ceil(remaining / 1000)
  if (seconds < 60) return `через ${seconds} сек`
  return `через ${Math.ceil(seconds / 60)} мин`
}

export default function ConnectionsPanel({
  connectionHealth,
  messengers,
  activeId,
  activeNativeAccountId,
  webviewLoading,
  onClose,
  onRefreshAll,
  onRefreshProblematic,
  onOpenLog,
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), HEALTH_SCHEDULER_TICK_MS)
    return () => clearInterval(timer)
  }, [])
  const items = useMemo(() => Object.values(connectionHealth || {})
    .filter(item => item && item.id)
    .sort((a, b) => (a.type || '').localeCompare(b.type || '') || (a.label || '').localeCompare(b.label || '')), [connectionHealth])

  const messengerIds = new Set(items.map(item => item.id))
  const displayItems = [...items]
  for (const m of messengers || []) {
    if (m.isNative || messengerIds.has(m.id)) continue
    displayItems.push({
      id: m.id,
      type: 'webview',
      label: m.name,
      state: HEALTH_PENDING,
      url: m.url,
    })
  }

  const { webview, native } = splitItems(displayItems)
  const defaultSelected = displayItems.find(item => item.state === HEALTH_ERROR)
    || displayItems.find(item => item.state === HEALTH_SLOW)
    || displayItems[0]
  const [selectedId, setSelectedId] = useState(defaultSelected?.id || null)
  useEffect(() => {
    if (!selectedId && defaultSelected?.id) setSelectedId(defaultSelected.id)
  }, [defaultSelected?.id, selectedId])
  const selectedItem = displayItems.find(item => item.id === selectedId) || defaultSelected
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
      <div
        className="w-[840px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] rounded-lg shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--cc-surface)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--cc-border)' }}>
          <div>
            <div className="text-lg font-semibold">Подключения</div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md text-xl leading-none"
            style={{ color: 'var(--cc-text-dim)' }}
            title="Закрыть"
          >×</button>
        </div>

        <div className="grid grid-cols-[1fr_300px] gap-0 min-h-[420px]">
          <div className="p-4 overflow-auto" style={{ borderRight: '1px solid var(--cc-border)' }}>
            <Section title="WebView вкладки" items={webview} selectedItem={selectedItem} onSelect={setSelectedId} />
            <Section title="Native/API аккаунты" items={native} selectedItem={selectedItem} onSelect={setSelectedId} />
          </div>

          <div className="p-4">
            {selectedItem ? (
              <div>
                <div className="text-sm font-semibold mb-2">{selectedItem.label || selectedItem.id}</div>
                <div className="mb-4"><HealthPill state={selectedItem.state} /></div>
                <InfoRow label="Тип" value={selectedItem.type === 'native' ? 'Native/API' : 'WebView'} />
                <InfoRow label="Последний ответ" value={formatHealthMs(selectedItem.lastMs)} />
                <InfoRow label="Последняя проверка" value={formatHealthTime(selectedItem.lastCheckedAt)} />
                <InfoRow label="Следующая проверка" value={formatNextCheckText(selectedItem, { now, activeId, activeNativeAccountId, webviewLoading })} />
                {selectedItem.url && <InfoRow label="URL" value={selectedItem.url} />}
                {(selectedItem.errorCode || selectedItem.errorText) && (
                  <InfoRow label="Ошибка" value={[selectedItem.errorCode, selectedItem.errorText].filter(Boolean).join(' ')} />
                )}
                {selectedItem.details && <InfoRow label="Детали" value={selectedItem.details} />}
                <div className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--cc-text-dim)' }}>
                  {statusHint(selectedItem.state)}
                </div>
              </div>
            ) : (
              <div className="text-sm" style={{ color: 'var(--cc-text-dim)' }}>Пока нет данных проверки.</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--cc-border)' }}>
          <PanelButton onClick={onRefreshAll}>Проверить все</PanelButton>
          <PanelButton onClick={onRefreshProblematic}>Обновить проблемные</PanelButton>
          <PanelButton onClick={onOpenLog}>Открыть лог</PanelButton>
        </div>
      </div>
    </div>
  )
}

function Section({ title, items, selectedItem, onSelect }) {
  return (
    <div className="mb-5">
      <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--cc-text-dimmer)' }}>{title}</div>
      {items.length ? (
        <div className="space-y-1">
          {items.map(item => (
            <ConnectionRow key={item.id} item={item} selected={selectedItem?.id === item.id} onClick={() => onSelect(item.id)} />
          ))}
        </div>
      ) : (
        <div className="text-sm px-3 py-2" style={{ color: 'var(--cc-text-dimmer)' }}>Нет подключений этого типа</div>
      )}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="mb-2">
      <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--cc-text-dimmer)' }}>{label}</div>
      <div className="text-sm break-words" style={{ color: 'var(--cc-text-dim)' }}>{value || '-'}</div>
    </div>
  )
}

function PanelButton({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-md text-sm"
      style={{ backgroundColor: 'var(--cc-hover)', color: 'var(--cc-text)' }}
    >
      {children}
    </button>
  )
}
