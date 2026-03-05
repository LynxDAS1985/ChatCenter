// v0.26.0 — Панель настроек: уникальный звук каждого мессенджера, тест звука с тональностью
import { useEffect, useState } from 'react'
import { DEFAULT_MESSENGERS } from '../constants.js'

function Toggle({ value, onChange, color = '#2AABEE' }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative w-10 h-6 rounded-full transition-all duration-200 cursor-pointer shrink-0"
      style={{ backgroundColor: value ? color : 'var(--cc-hover)' }}
    >
      <span
        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
        style={{ left: value ? '20px' : '4px' }}
      />
    </button>
  )
}

function SectionTitle({ children }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--cc-text-dimmer)' }}>
      {children}
    </h3>
  )
}

function SettingRow({ label, description, children }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl px-3 py-3"
      style={{ backgroundColor: 'var(--cc-hover)' }}
    >
      <div>
        <div className="text-sm" style={{ color: 'var(--cc-text-dim)' }}>{label}</div>
        {description && <div className="text-xs mt-0.5" style={{ color: 'var(--cc-text-dimmer)' }}>{description}</div>}
      </div>
      {children}
    </div>
  )
}

// Звук уведомления — уникальная тональность по цвету мессенджера (идентично App.jsx)
const MESSENGER_SOUNDS = {
  '#2AABEE': { f1: 1047, f2: 1319, type: 'sine' },       // Telegram
  '#25D366': { f1: 784,  f2: 1175, type: 'sine' },       // WhatsApp
  '#4C75A3': { f1: 659,  f2: 880,  type: 'triangle' },   // VK
  '#E1306C': { f1: 988,  f2: 1397, type: 'sine' },       // Instagram
  '#5865F2': { f1: 740,  f2: 1109, type: 'triangle' },   // Discord
  '#7360F2': { f1: 831,  f2: 1245, type: 'sine' },       // Viber
  '#00AAFF': { f1: 880,  f2: 1320, type: 'sine' },       // Авито
  '#A855F7': { f1: 932,  f2: 1175, type: 'triangle' },   // Wildberries
  '#005BFF': { f1: 698,  f2: 1047, type: 'sine' },       // Ozon
}

function getSoundForColor(color) {
  if (color && MESSENGER_SOUNDS[color]) return MESSENGER_SOUNDS[color]
  let hash = 0
  for (let i = 0; i < (color || '').length; i++) hash = ((hash << 5) - hash + color.charCodeAt(i)) | 0
  const f1 = 600 + Math.abs(hash % 500)
  const f2 = f1 + 200 + Math.abs((hash >> 8) % 300)
  return { f1, f2, type: Math.abs(hash) % 2 === 0 ? 'sine' : 'triangle' }
}

function playTestSound(color) {
  try {
    const { f1, f2, type } = getSoundForColor(color)
    const ctx = new AudioContext()
    const t = ctx.currentTime
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

export default function SettingsPanel({ messengers, settings, onMessengersChange, onSettingsChange, onClose }) {
  const [errorLog, setErrorLog] = useState(null)        // null = не загружен, '' = пуст, 'текст' = есть записи
  const [logLoading, setLogLoading] = useState(false)
  const [logClearing, setLogClearing] = useState(false)

  const loadLog = async () => {
    setLogLoading(true)
    try {
      const res = await window.api.invoke('ai:get-error-log')
      setErrorLog(res.ok ? (res.text || '') : `Ошибка: ${res.error}`)
    } catch (e) {
      setErrorLog(`Ошибка: ${e.message}`)
    } finally {
      setLogLoading(false)
    }
  }

  const clearLog = async () => {
    setLogClearing(true)
    try {
      await window.api.invoke('ai:clear-error-log')
      setErrorLog('')
    } catch {}
    setLogClearing(false)
  }

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const removeMessenger = (id) => {
    onMessengersChange(messengers.filter(m => m.id !== id))
  }

  const resetToDefaults = () => {
    onMessengersChange(DEFAULT_MESSENGERS)
  }

  const set = (key, value) => {
    onSettingsChange({ ...settings, [key]: value })
  }

  const theme = settings.theme || 'dark'

  return (
    <div
      className="fixed inset-0 flex justify-end z-50"
      style={{ backgroundColor: 'var(--cc-overlay)' }}
      onClick={onClose}
    >
      <div
        className="h-full w-[360px] flex flex-col shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--cc-surface)', borderLeft: '1px solid var(--cc-border)' }}
        onClick={e => e.stopPropagation()}
      >

        {/* Заголовок */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--cc-border)' }}
        >
          <h2 className="font-semibold text-base" style={{ color: 'var(--cc-text)' }}>Настройки</h2>
          <button
            onClick={onClose}
            className="text-xl transition-colors cursor-pointer w-7 h-7 flex items-center justify-center"
            style={{ color: 'var(--cc-text-dimmer)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--cc-text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--cc-text-dimmer)'}
          >✕</button>
        </div>

        {/* Контент */}
        <div className="flex-1 overflow-y-auto py-2">

          {/* ── Тема ── */}
          <section className="px-5 py-4">
            <SectionTitle>Оформление</SectionTitle>
            <div className="space-y-2">
              <div
                className="rounded-xl px-3 py-3"
                style={{ backgroundColor: 'var(--cc-hover)' }}
              >
                <div className="text-sm mb-2.5" style={{ color: 'var(--cc-text-dim)' }}>Тема</div>
                <div className="flex gap-2">
                  {[['dark', '🌙 Тёмная'], ['light', '☀️ Светлая']].map(([t, label]) => (
                    <button
                      key={t}
                      onClick={() => set('theme', t)}
                      className="flex-1 py-2 rounded-lg text-sm transition-all cursor-pointer"
                      style={{
                        backgroundColor: theme === t ? '#2AABEE22' : 'var(--cc-surface)',
                        color: theme === t ? '#2AABEE' : 'var(--cc-text-dim)',
                        border: `1px solid ${theme === t ? '#2AABEE55' : 'var(--cc-border)'}`
                      }}
                    >{label}</button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="mx-5" style={{ borderTop: '1px solid var(--cc-border)' }} />

          {/* ── Мессенджеры ── */}
          <section className="px-5 py-4">
            <SectionTitle>Мессенджеры</SectionTitle>

            {messengers.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--cc-text-dimmer)' }}>Нет мессенджеров</p>
            ) : (
              <div className="space-y-1.5">
                {messengers.map(m => {
                  const mutedMap = settings.mutedMessengers || {}
                  const isMuted = !!mutedMap[m.id]
                  return (
                    <div
                      key={m.id}
                      className="rounded-xl px-3 py-2.5 transition-colors group"
                      style={{ backgroundColor: 'var(--cc-hover)' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--cc-border)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--cc-hover)'}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: 'var(--cc-text)' }}>{m.name}</div>
                          <div className="text-[11px] truncate" style={{ color: 'var(--cc-text-dimmer)' }}>
                            {(() => { try { return new URL(m.url).hostname } catch { return m.url } })()}
                          </div>
                        </div>
                        {!m.isDefault ? (
                          <button
                            onClick={() => removeMessenger(m.id)}
                            className="text-sm transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded"
                            style={{ color: 'var(--cc-text-dimmer)' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--cc-text-dimmer)'; e.currentTarget.style.backgroundColor = 'transparent' }}
                            title="Удалить"
                          >🗑</button>
                        ) : (
                          <span className="text-[10px] shrink-0" style={{ color: 'var(--cc-text-dimmer)' }}>по умолч.</span>
                        )}
                      </div>
                      {/* Звук уведомления для этого мессенджера */}
                      <div className="flex items-center gap-2 mt-1.5 pl-5">
                        <span className="text-[11px]" style={{ color: isMuted ? 'var(--cc-text-dimmer)' : 'var(--cc-text-dim)' }}>
                          {isMuted ? '🔇 Звук выкл' : '🔔 Звук вкл'}
                        </span>
                        <Toggle
                          value={!isMuted}
                          onChange={v => {
                            const next = { ...mutedMap }
                            if (v) { delete next[m.id] } else { next[m.id] = true }
                            set('mutedMessengers', next)
                          }}
                          color={m.color}
                        />
                        <button
                          onClick={() => playTestSound(m.color)}
                          className="text-[10px] px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                          style={{ backgroundColor: `${m.color}15`, color: m.color, border: `1px solid ${m.color}33` }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = `${m.color}30` }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = `${m.color}15` }}
                          title="Воспроизвести тестовый звук"
                        >🔊 Тест</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <button
              onClick={resetToDefaults}
              className="mt-3 w-full py-2 rounded-xl text-sm transition-all cursor-pointer"
              style={{ backgroundColor: 'var(--cc-hover)', color: 'var(--cc-text-dimmer)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-border)'; e.currentTarget.style.color = 'var(--cc-text-dim)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-text-dimmer)' }}
            >↺ Сбросить к стандартным (TG, WA, VK)</button>
          </section>

          <div className="mx-5" style={{ borderTop: '1px solid var(--cc-border)' }} />

          {/* ── Уведомления ── */}
          <section className="px-5 py-4">
            <SectionTitle>Уведомления</SectionTitle>
            <div className="space-y-2">
              <SettingRow label="Звук при новом сообщении" description="Короткий сигнал при получении">
                <Toggle value={settings.soundEnabled !== false} onChange={v => set('soundEnabled', v)} />
              </SettingRow>
              <SettingRow label="Автопереключение на новое сообщение" description="Переключать вкладку при входящем">
                <Toggle value={!!settings.autoSwitchOnMessage} onChange={v => set('autoSwitchOnMessage', v)} />
              </SettingRow>
              <SettingRow label="Сворачивать в трей" description="Закрытие скрывает в трей">
                <Toggle value={settings.minimizeToTray !== false} onChange={v => set('minimizeToTray', v)} />
              </SettingRow>
            </div>
          </section>

          <div className="mx-5" style={{ borderTop: '1px solid var(--cc-border)' }} />

          {/* ── Диагностика ── */}
          <section className="px-5 py-4">
            <SectionTitle>Диагностика</SectionTitle>
            <div className="space-y-2">

              {/* Кнопки управления логом */}
              <div className="flex gap-2">
                <button
                  onClick={loadLog}
                  disabled={logLoading}
                  className="flex-1 py-2 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: 'var(--cc-hover)', color: 'var(--cc-text-dim)', border: '1px solid var(--cc-border)' }}
                  onMouseEnter={e => { if (!logLoading) e.currentTarget.style.backgroundColor = 'var(--cc-border)' }}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--cc-hover)'}
                >
                  {logLoading ? '⏳ Загрузка...' : '📋 Загрузить лог ошибок'}
                </button>
                {errorLog !== null && (
                  <button
                    onClick={clearLog}
                    disabled={logClearing}
                    className="px-3 py-2 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50"
                    style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                    onMouseEnter={e => { if (!logClearing) e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.18)' }}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)'}
                    title="Очистить лог ошибок"
                  >
                    {logClearing ? '⏳' : '🗑 Очистить'}
                  </button>
                )}
              </div>

              {/* Содержимое лога */}
              {errorLog !== null && (
                <div
                  className="rounded-xl p-3 text-[10px] font-mono overflow-y-auto"
                  style={{
                    backgroundColor: 'var(--cc-hover)',
                    border: '1px solid var(--cc-border)',
                    color: 'var(--cc-text-dim)',
                    maxHeight: '180px',
                    whiteSpace: 'pre',
                    lineHeight: 1.7,
                  }}
                >
                  {errorLog
                    ? errorLog.trim().split('\n').slice(-30).map((line, i) => (
                        <div key={i} style={{ color: line.includes('startup') || line.includes('hourly') ? 'var(--cc-text-dimmer)' : 'var(--cc-text-dim)' }}>
                          {line}
                        </div>
                      ))
                    : <span style={{ color: 'var(--cc-text-dimmer)' }}>— лог пуст —</span>
                  }
                </div>
              )}

              <p className="text-[10px]" style={{ color: 'var(--cc-text-dimmer)' }}>
                Файл: <code style={{ color: 'var(--cc-text-dim)' }}>userData/ai-errors.log</code> · Показаны последние 30 строк
              </p>
            </div>
          </section>

          <div className="mx-5" style={{ borderTop: '1px solid var(--cc-border)' }} />

          {/* ── О программе ── */}
          <section className="px-5 py-4">
            <SectionTitle>О программе</SectionTitle>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--cc-border)' }}>
              {[
                ['Название', 'ЦентрЧатов / ChatCenter'],
                ['Версия', 'v0.26.2'],
                ['Платформа', window.navigator.platform || 'Windows'],
                ['Стек', 'Electron + React + Tailwind'],
              ].map(([label, value], i, arr) => (
                <div
                  key={label}
                  className="flex justify-between items-center px-3 py-2.5"
                  style={{
                    backgroundColor: 'var(--cc-hover)',
                    borderBottom: i < arr.length - 1 ? '1px solid var(--cc-border)' : 'none'
                  }}
                >
                  <span className="text-sm" style={{ color: 'var(--cc-text-dimmer)' }}>{label}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--cc-text-dim)' }}>{value}</span>
                </div>
              ))}
            </div>

            <p className="mt-3 text-xs text-center leading-relaxed" style={{ color: 'var(--cc-text-dimmer)' }}>
              Разработано при помощи Claude AI.{'\n'}Фаза 4 из 8 завершена.
            </p>

            <div className="mt-3 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--cc-hover)' }}>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--cc-text-dimmer)' }}>
                <span className="font-semibold" style={{ color: 'var(--cc-text-dim)' }}>Горячие клавиши:</span><br />
                Ctrl+1-9 — вкладка · Ctrl+T — добавить<br />
                Ctrl+W — закрыть · Ctrl+F — поиск<br />
                Ctrl+, — настройки · Ctrl+Tab — следующая
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
