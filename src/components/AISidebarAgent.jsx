// v0.99.0 (Phase 3 M3.3 + M3.5): UI компонент AI-агента.
//
// Показывается в AI Sidebar когда юзер кликнул «🤖 AI» в уведомлении.
// Состояния:
//   - Idle (нет активного запроса)
//   - Running (стримит прогресс)
//   - Confirm (показывает AIConfirmModal для confirm-tier tool)
//   - Done (показывает final answer)
//   - Error (показывает ошибку)
//
// v1.2.2: добавлен переключатель «🔁 Через Bridge» — отправляет вопрос через AI Bridge
// с auto-резервом + Ollama. Без tool use (нет умных действий), но доступ к бесплатному
// локальному AI и автоматическое переключение на резерв если основной упал.

import { useEffect, useState } from 'react'
import useAIAgent from '../hooks/useAIAgent.js'
import AIConfirmModal from './AIConfirmModal.jsx'
// v1.2.6: «печатающий» эффект для отображения ответа AI постепенно.
import TypewriterText from './TypewriterText.jsx'

/**
 * @param {object} props
 * @param {object} pendingInvocation — { source, title, senderName } или null
 * @param {string} provider — 'anthropic' / 'openai' / etc
 * @param {Array} recentMessages — для context builder
 * @param {function} onDone — callback когда агент закончил
 * @param {object} [settings] — settings объект (для buildAutoChain в Bridge-режиме)
 */
export default function AISidebarAgent({ pendingInvocation, provider, recentMessages, onDone, settings }) {
  const { state, start, cancel, confirmStep, cancelStep } = useAIAgent()
  // v1.2.2: переключатель Bridge-режима. Default из settings.aiAgentUseBridge (sticky).
  const [useBridge, setUseBridge] = useState(() => Boolean(settings?.aiAgentUseBridge))

  // Автоматически запускаем при появлении pendingInvocation
  useEffect(() => {
    if (!pendingInvocation || !pendingInvocation.source) return
    start({
      source: pendingInvocation.source,
      provider: provider || 'anthropic',
      recentMessages: recentMessages || [],
      // v1.2.2:
      useBridge,
      settings,
    })
  }, [pendingInvocation, provider, useBridge])

  // Если финальный ответ — вызвать onDone
  useEffect(() => {
    if (state.finalAnswer && onDone) {
      onDone(state.finalAnswer)
    }
  }, [state.finalAnswer])

  if (!pendingInvocation) return null

  return (
    <div style={{
      padding: 16,
      background: 'var(--cc-panel, #1a1a1a)',
      border: '1px solid var(--cc-border, #333)',
      borderRadius: 10,
      color: 'var(--cc-text, #fff)',
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>🤖</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>AI Агент</div>
          <div style={{ fontSize: 12, color: 'var(--cc-text-dim, #888)' }}>
            {pendingInvocation.title || pendingInvocation.senderName || 'Обработка...'}
          </div>
        </div>
        {state.isRunning && (
          <button
            type="button"
            onClick={cancel}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              background: 'transparent',
              color: 'var(--cc-text-dim, #888)',
              border: '1px solid var(--cc-border, #333)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            ✗ Остановить
          </button>
        )}
      </div>

      {/* v1.2.2: переключатель Bridge-режима */}
      <label
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, color: 'var(--cc-text-dim, #888)',
          marginBottom: 10, cursor: state.isRunning ? 'not-allowed' : 'pointer',
        }}
        title="Через Bridge: простой Q&A без умных действий, но с резервом и поддержкой Ollama"
      >
        <input
          type="checkbox"
          checked={useBridge}
          disabled={state.isRunning}
          onChange={e => setUseBridge(e.target.checked)}
          style={{ margin: 0 }}
        />
        🔁 Через Bridge (с резервом, без tool use)
      </label>

      {/* Streaming прогресса */}
      {state.steps.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--cc-text-dim, #888)', marginBottom: 6 }}>
            Шаги:
          </div>
          {state.steps.map((step, idx) => (
            <StepRow key={idx} step={step} />
          ))}
        </div>
      )}

      {/* Running индикатор */}
      {state.isRunning && (
        <div style={{
          fontSize: 12,
          color: 'var(--cc-text-dim, #888)',
          fontStyle: 'italic',
        }}>
          🔄 AI размышляет...
        </div>
      )}

      {/* Final answer — v1.2.6: с typewriter эффектом */}
      {state.finalAnswer && (
        <div style={{
          marginTop: 12,
          padding: 10,
          background: 'var(--cc-hover, #222)',
          borderRadius: 6,
          fontSize: 13,
          whiteSpace: 'pre-wrap',
        }}>
          <div style={{ fontSize: 11, color: 'var(--cc-text-dim, #888)', marginBottom: 6 }}>
            ✓ Завершено:
          </div>
          <TypewriterText text={state.finalAnswer} speed={12} />
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div style={{
          marginTop: 12,
          padding: 10,
          background: 'rgba(220, 38, 38, 0.1)',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          borderRadius: 6,
          fontSize: 12,
          color: '#fca5a5',
        }}>
          ❌ Ошибка: {state.error}
        </div>
      )}

      {/* Confirmation Modal — для confirm-tier tool calls */}
      {state.pendingConfirm && (
        <AIConfirmModal
          visible
          actionId={state.pendingConfirm.toolId}
          source={state.pendingConfirm.source}
          args={state.pendingConfirm.args}
          onConfirm={(updatedArgs) => confirmStep(updatedArgs)}
          onCancel={() => cancelStep()}
        />
      )}
    </div>
  )
}

function StepRow({ step }) {
  let icon = '•'
  let label = ''
  if (step.type === 'tool_call') {
    icon = '▸'
    label = `Вызов: ${step.name}`
  } else if (step.type === 'tool_result') {
    icon = step.result?.ok === false ? '✗' : '✓'
    label = `Результат: ${step.name}`
    // v1.2.2: показать список fallback'ов для bridge_answer
    if (step.name === 'bridge_answer' && step.result?.attemptedFallbacks?.length > 0) {
      const tried = step.result.attemptedFallbacks
        .map(a => `${a.providerId || a.mode}(${a.errorCode})`).join(' → ')
      label = `Через резерв: ${tried} → ${step.result.providerId || step.result.mode}`
    } else if (step.name === 'bridge_answer' && step.result?.ok) {
      label = `Bridge ответил (${step.result.providerId || step.result.mode}, ${step.result.latencyMs}мс)`
    }
  } else if (step.type === 'response') {
    icon = '💬'
    label = `Iteration ${step.iteration || ''}`
  } else if (step.type === 'bridge_start') {
    // v1.2.2:
    icon = '🔁'
    label = `Через Bridge (резерв ${step.chainSize} пров., начинаем с ${step.primary})`
  }

  return (
    <div style={{
      fontSize: 12, padding: '4px 0',
      color: 'var(--cc-text-dim, #aaa)',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ fontSize: 11 }}>{icon}</span>
      <span>{label}</span>
    </div>
  )
}
