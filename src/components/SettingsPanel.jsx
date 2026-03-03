// v0.5 — Панель настроек (боковая, справа)
import { useEffect } from 'react'
import { DEFAULT_MESSENGERS } from '../constants.js'

// Компонент переключателя (iOS-стиль)
function Toggle({ value, onChange, color = '#2AABEE' }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative w-10 h-6 rounded-full transition-all duration-200 cursor-pointer shrink-0"
      style={{ backgroundColor: value ? color : 'rgba(255,255,255,0.12)' }}
    >
      <span
        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
        style={{ left: value ? '20px' : '4px' }}
      />
    </button>
  )
}

export default function SettingsPanel({ messengers, settings, onMessengersChange, onSettingsChange, onClose }) {

  // Закрыть по Escape
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

  const updateSetting = (key, value) => {
    onSettingsChange({ ...settings, [key]: value })
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex justify-end z-50"
      onClick={onClose}
    >
      <div
        className="bg-[#16213e] border-l border-white/10 h-full w-[340px] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-white font-semibold text-base">Настройки</h2>
          <button
            onClick={onClose}
            className="text-white/35 hover:text-white/75 text-xl transition-colors cursor-pointer w-7 h-7 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Прокручиваемый контент */}
        <div className="flex-1 overflow-y-auto py-2">

          {/* Секция: Мессенджеры */}
          <section className="px-5 py-4">
            <h3 className="text-white/45 text-[11px] font-semibold uppercase tracking-widest mb-3">
              Мессенджеры
            </h3>

            {messengers.length === 0 ? (
              <p className="text-white/30 text-sm">Нет мессенджеров</p>
            ) : (
              <div className="space-y-1.5">
                {messengers.map(m => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 bg-white/5 hover:bg-white/8 rounded-xl px-3 py-2.5 transition-colors group"
                  >
                    {/* Цветная точка */}
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: m.color }}
                    />

                    {/* Инфо */}
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">{m.name}</div>
                      <div className="text-white/30 text-[11px] truncate">
                        {(() => { try { return new URL(m.url).hostname } catch { return m.url } })()}
                      </div>
                    </div>

                    {/* Кнопка удалить — только для не-дефолтных */}
                    {!m.isDefault ? (
                      <button
                        onClick={() => removeMessenger(m.id)}
                        className="text-white/25 hover:text-red-400 text-sm transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100"
                        title="Удалить мессенджер"
                      >
                        🗑
                      </button>
                    ) : (
                      <span className="text-white/15 text-[10px] shrink-0">по умолч.</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={resetToDefaults}
              className="mt-3 w-full py-2 rounded-xl bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/65 text-sm transition-all cursor-pointer"
            >
              ↺ Сбросить к стандартным (TG, WA, VK)
            </button>
          </section>

          <div className="mx-5 border-t border-white/8" />

          {/* Секция: Уведомления */}
          <section className="px-5 py-4">
            <h3 className="text-white/45 text-[11px] font-semibold uppercase tracking-widest mb-3">
              Уведомления
            </h3>

            <div className="space-y-2">
              {/* Звук */}
              <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-3">
                <div>
                  <div className="text-white/75 text-sm">Звук при новом сообщении</div>
                  <div className="text-white/30 text-xs mt-0.5">Короткий сигнал при получении</div>
                </div>
                <Toggle
                  value={settings.soundEnabled !== false}
                  onChange={v => updateSetting('soundEnabled', v)}
                />
              </div>

              {/* Сворачивать в трей */}
              <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-3">
                <div>
                  <div className="text-white/75 text-sm">Сворачивать в трей</div>
                  <div className="text-white/30 text-xs mt-0.5">Закрытие скрывает в трей</div>
                </div>
                <Toggle
                  value={settings.minimizeToTray !== false}
                  onChange={v => updateSetting('minimizeToTray', v)}
                />
              </div>
            </div>
          </section>

          <div className="mx-5 border-t border-white/8" />

          {/* Секция: О программе */}
          <section className="px-5 py-4">
            <h3 className="text-white/45 text-[11px] font-semibold uppercase tracking-widest mb-3">
              О программе
            </h3>

            <div className="bg-white/5 rounded-xl divide-y divide-white/5">
              {[
                ['Название', 'ЦентрЧатов / ChatCenter'],
                ['Версия', 'v0.5.0'],
                ['Платформа', window.navigator.platform || 'Windows'],
                ['Стек', 'Electron + React + Tailwind'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center px-3 py-2.5">
                  <span className="text-white/40 text-sm">{label}</span>
                  <span className="text-white/70 text-sm font-medium">{value}</span>
                </div>
              ))}
            </div>

            <p className="mt-3 text-white/25 text-xs text-center leading-relaxed">
              Разработано при помощи Claude AI.{'\n'}Фаза 1 из 8 завершена.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
