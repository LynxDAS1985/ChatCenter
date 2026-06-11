// v1.1.17 (Этап 8 AI Bridge): редактор кастомных селекторов для AI сайтов.
//
// Зачем: сайты AI меняют DOM ~раз в 3-4 месяца. Если defaults в hook файлах
// перестали работать — юзер может задать свои селекторы здесь. При следующем
// вызове AI Bridge кастомные селекторы пойдут в payload и переопределят defaults
// внутри hook (см. main/preloads/hooks/ai/<provider>.hook.js).
//
// Структура settings.aiBridgeSelectors:
//   {
//     openai:    { input: '...', submitButton: '...', lastAssistantMessage: '...', streamingIndicator: '...' },
//     deepseek:  { ... },
//     anthropic: { ... },
//     gigachat:  { ... },
//   }
//
// Пустые поля = используются defaults из hook. Можно переопределить только нужные.

import { useState, useEffect } from 'react'
import { getDefaultSelectors, listProviderIds, getProviderConfig } from '../utils/aiWebviewConfigs.js'

const SELECTOR_FIELDS = [
  { key: 'input',                label: 'Поле ввода (input/textarea)',  hint: 'CSS селектор для textarea или contenteditable div' },
  { key: 'submitButton',         label: 'Кнопка отправки',               hint: 'CSS селектор кнопки «Send»' },
  { key: 'lastAssistantMessage', label: 'Контейнер ответа AI',           hint: 'CSS селектор где появляется ответ' },
  { key: 'streamingIndicator',   label: 'Индикатор «AI печатает»',       hint: 'Элемент существует во время генерации (исчезает когда готово)' },
]

function log(level, message) {
  try {
    window.api?.send?.('app:log', { level, message: '[ai-selectors-editor] ' + message })
  } catch (_) {}
}

export default function AiSelectorsEditor({ settings, onSettingsChange, onClose, initialProviderId }) {
  const providerIds = listProviderIds()
  const [providerId, setProviderId] = useState(initialProviderId && providerIds.includes(initialProviderId) ? initialProviderId : providerIds[0])
  const [values, setValues] = useState({})
  const [savedFlash, setSavedFlash] = useState(false)

  // Загрузить текущие значения при смене провайдера
  useEffect(() => {
    const custom = settings?.aiBridgeSelectors?.[providerId] || {}
    setValues({
      input: custom.input || '',
      submitButton: custom.submitButton || '',
      lastAssistantMessage: custom.lastAssistantMessage || '',
      streamingIndicator: custom.streamingIndicator || '',
    })
  }, [providerId, settings])

  const defaults = getDefaultSelectors(providerId) || {}
  const providerCfg = getProviderConfig(providerId)

  function handleChange(key, val) {
    setValues(v => ({ ...v, [key]: val }))
  }

  function handleSave() {
    // Сохраняем только непустые поля. Пустое значение = use default из hook.
    const cleaned = {}
    for (const f of SELECTOR_FIELDS) {
      if (values[f.key] && values[f.key].trim()) {
        cleaned[f.key] = values[f.key].trim()
      }
    }
    const all = { ...(settings?.aiBridgeSelectors || {}) }
    if (Object.keys(cleaned).length > 0) {
      all[providerId] = cleaned
    } else {
      delete all[providerId]  // полностью пустое — удалить запись
    }
    log('INFO', 'saved providerId=' + providerId + ' fields=' + Object.keys(cleaned).join(','))
    onSettingsChange({ ...settings, aiBridgeSelectors: all })
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }

  function handleResetAllToDefaults() {
    setValues({ input: '', submitButton: '', lastAssistantMessage: '', streamingIndicator: '' })
    log('INFO', 'reset to defaults providerId=' + providerId)
  }

  function handleFillFromDefaults() {
    setValues({
      input: defaults.input || '',
      submitButton: defaults.submitButton || '',
      lastAssistantMessage: defaults.lastAssistantMessage || '',
      streamingIndicator: defaults.streamingIndicator || '',
    })
  }

  const inputStyle = {
    width: '100%', padding: '6px 10px', fontSize: 12,
    backgroundColor: 'var(--cc-hover, #2a2b3e)',
    color: 'var(--cc-text, #e0e0e0)',
    border: '1px solid var(--cc-border, #333)',
    borderRadius: 6, boxSizing: 'border-box', fontFamily: 'monospace',
  }

  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 600,
    color: 'var(--cc-text-dim, #aaa)', marginBottom: 4, marginTop: 12,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10002,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: '90%', maxWidth: 680, maxHeight: '90%',
        backgroundColor: 'var(--cc-bg, #1a1b2e)',
        border: '1px solid var(--cc-border, #2a2b3e)',
        borderRadius: 10, display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }} onClick={e => e.stopPropagation()}>

        <div style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid var(--cc-border, #2a2b3e)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cc-text, #e0e0e0)', flex: 1 }}>
            🔧 Настройка селекторов AI сайтов
          </span>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
            backgroundColor: 'var(--cc-hover, #2a2b3e)', color: '#ff4444', fontSize: 16,
          }}>✕</button>
        </div>

        <div style={{ padding: 16, overflow: 'auto' }}>
          <div style={{ fontSize: 11, color: 'var(--cc-text-dimmer, #777)', marginBottom: 8 }}>
            Если AI сайт обновится и стандартные «адреса» (CSS селекторы) перестанут работать —
            задайте свои здесь. Пустые поля = программа использует встроенные.
          </div>

          <label style={labelStyle}>Провайдер</label>
          <select
            value={providerId}
            onChange={e => setProviderId(e.target.value)}
            style={inputStyle}
          >
            {providerIds.map(id => (
              <option key={id} value={id}>{getProviderConfig(id)?.label || id}</option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: 'var(--cc-text-dimmer, #666)', marginTop: 4 }}>
            Дефолтный URL: {providerCfg?.defaultUrl || '—'}
          </div>

          {SELECTOR_FIELDS.map(f => (
            <div key={f.key}>
              <label style={labelStyle}>{f.label}</label>
              <input
                type="text"
                value={values[f.key] || ''}
                onChange={e => handleChange(f.key, e.target.value)}
                placeholder={defaults[f.key] || ''}
                style={inputStyle}
              />
              <div style={{ fontSize: 10, color: 'var(--cc-text-dimmer, #666)', marginTop: 2 }}>
                {f.hint} · по умолчанию: <code style={{ fontSize: 10 }}>{defaults[f.key] || '—'}</code>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button
              onClick={handleSave}
              style={{
                flex: 1, padding: '8px 16px', fontSize: 13, fontWeight: 600,
                borderRadius: 6, cursor: 'pointer', border: 'none',
                backgroundColor: savedFlash ? '#22c55e' : '#2AABEE',
                color: '#fff',
              }}
            >
              {savedFlash ? '✓ Сохранено' : '💾 Сохранить'}
            </button>
            <button
              onClick={handleFillFromDefaults}
              title="Заполнить поля значениями из встроенных селекторов (можно подредактировать и сохранить)"
              style={{
                padding: '8px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                backgroundColor: 'var(--cc-hover, #2a2b3e)',
                color: 'var(--cc-text-dim, #aaa)',
                border: '1px solid var(--cc-border, #333)',
              }}
            >
              📋 Заполнить из встроенных
            </button>
            <button
              onClick={handleResetAllToDefaults}
              title="Очистить все поля — программа вернётся к встроенным селекторам"
              style={{
                padding: '8px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                backgroundColor: 'var(--cc-hover, #2a2b3e)',
                color: 'var(--cc-text-dim, #aaa)',
                border: '1px solid var(--cc-border, #333)',
              }}
            >
              ♻️ Сбросить
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
