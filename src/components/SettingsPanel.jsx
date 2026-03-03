// v0.6 — Панель настроек: тема, мессенджеры, уведомления, ИИ, о программе
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

export default function SettingsPanel({ messengers, settings, onMessengersChange, onSettingsChange, onClose }) {
  const [aiKeyVisible, setAiKeyVisible] = useState(false)

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
  const aiProvider = settings.aiProvider || 'openai'
  const aiModel = settings.aiModel || (aiProvider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini')
  const aiApiKey = settings.aiApiKey || ''

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
                {messengers.map(m => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors group"
                    style={{ backgroundColor: 'var(--cc-hover)' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--cc-border)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--cc-hover)'}
                  >
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
                ))}
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
              <SettingRow label="Сворачивать в трей" description="Закрытие скрывает в трей">
                <Toggle value={settings.minimizeToTray !== false} onChange={v => set('minimizeToTray', v)} />
              </SettingRow>
            </div>
          </section>

          <div className="mx-5" style={{ borderTop: '1px solid var(--cc-border)' }} />

          {/* ── ИИ-помощник ── */}
          <section className="px-5 py-4">
            <SectionTitle>ИИ-помощник</SectionTitle>
            <div className="space-y-3">

              {/* Провайдер */}
              <div>
                <div className="text-xs mb-2" style={{ color: 'var(--cc-text-dimmer)' }}>Провайдер</div>
                <div className="flex gap-2">
                  {[['openai', 'OpenAI'], ['anthropic', 'Anthropic']].map(([p, label]) => (
                    <button
                      key={p}
                      onClick={() => set('aiProvider', p)}
                      className="flex-1 py-1.5 rounded-lg text-xs transition-all cursor-pointer"
                      style={{
                        backgroundColor: aiProvider === p ? '#2AABEE22' : 'var(--cc-hover)',
                        color: aiProvider === p ? '#2AABEE' : 'var(--cc-text-dim)',
                        border: `1px solid ${aiProvider === p ? '#2AABEE55' : 'transparent'}`
                      }}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {/* Модель */}
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--cc-text-dimmer)' }}>Модель</label>
                <input
                  type="text"
                  value={aiModel}
                  onChange={e => set('aiModel', e.target.value)}
                  placeholder={aiProvider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini'}
                  className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                  style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
                />
              </div>

              {/* API Ключ */}
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--cc-text-dimmer)' }}>API Ключ</label>
                <div className="relative">
                  <input
                    type={aiKeyVisible ? 'text' : 'password'}
                    value={aiApiKey}
                    onChange={e => set('aiApiKey', e.target.value)}
                    placeholder={aiProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                    className="w-full text-sm px-3 py-2 pr-9 rounded-lg outline-none font-mono"
                    style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setAiKeyVisible(!aiKeyVisible)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs cursor-pointer"
                    style={{ color: 'var(--cc-text-dimmer)' }}
                  >{aiKeyVisible ? '🙈' : '👁'}</button>
                </div>
                {aiApiKey && (
                  <p className="text-[10px] mt-1" style={{ color: '#22c55e' }}>✓ Ключ введён</p>
                )}
              </div>

              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--cc-text-dimmer)' }}>
                Ключ хранится локально. Настройте промпт в боковой панели ИИ-помощника (🤖).
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
                ['Версия', 'v0.6.0'],
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
