// v0.99.0 (Phase 3 M3.3 + M3.5): UI компонент AI-агента.
//
// Показывается в AI Sidebar когда юзер кликнул «🤖 AI» в уведомлении.
// Состояния:
//   - Idle (нет активного запроса)
//   - Running (стримит прогресс)
//   - Confirm (показывает AIConfirmModal для confirm-tier tool)
//   - Done (показывает final answer)
//   - Error (показывает ошибку)

import { useEffect } from 'react'
import useAIAgent from '../hooks/useAIAgent.js'
import AIConfirmModal from './AIConfirmModal.jsx'

/**
 * @param {object} props
 * @param {object} pendingInvocation — { source, title, senderName } или null
 * @param {string} provider — 'anthropic' / 'openai' / etc
 * @param {Array} recentMessages — для context builder
 * @param {function} onDone — callback когда агент закончил
 */
export default function AISidebarAgent({ pendingInvocation, provider, recentMessages, onDone }) {
  const { state, start, cancel, confirmStep, cancelStep } = useAIAgent()

  // Автоматически запускаем при появлении pendingInvocation
  useEffect(() => {
    if (!pendingInvocation || !pendingInvocation.source) return
    start({
      source: pendingInvocation.source,
      provider: provider || 'anthropic',
      recentMessages: recentMessages || [],
    })
  }, [pendingInvocation, provider])

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

      {/* Final answer */}
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
          {state.finalAnswer}
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
  } else if (step.type === 'response') {
    icon = '💬'
    label = `Iteration ${step.iteration || ''}`
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
