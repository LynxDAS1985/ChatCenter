// v1.2.5: график активности AI авто-ответов за 7 дней.
//
// Простой SVG bar chart — без внешних библиотек.
// Каждый день — столбец, цвет:
//   - зелёный = успешные (mark_read + ai_reply + ai_reply_bridge)
//   - красный = ошибки
//   - над столбцом — число total
//
// Используется в AIActivityDashboard когда выбрана категория «AI авто».

import { groupAutoReplyByDay, summarizeStats, shortDayLabel } from '../utils/autoReplyStats.js'

const BAR_WIDTH = 32
const BAR_GAP = 8
const CHART_HEIGHT = 100
const PADDING = { top: 24, bottom: 28, left: 8, right: 8 }

/**
 * @param {object} props
 * @param {Array} props.auditEntries — массив audit записей
 * @param {number} [props.days=7]
 */
export default function AutoReplyChart({ auditEntries, days = 7 }) {
  const data = groupAutoReplyByDay(auditEntries, days)
  const stats = summarizeStats(data)

  if (!stats.hasData) {
    return (
      <div style={{
        padding: 16,
        background: 'var(--cc-hover, #2a2b3e)',
        borderRadius: 8,
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--cc-text-dim, #888)',
      }}>
        📊 За последние {days} дней авто-ответов не было
      </div>
    )
  }

  const maxValue = Math.max(stats.max, 1)
  const chartWidth = data.length * (BAR_WIDTH + BAR_GAP) - BAR_GAP + PADDING.left + PADDING.right
  const totalHeight = CHART_HEIGHT + PADDING.top + PADDING.bottom

  return (
    <div style={{
      padding: 12,
      background: 'var(--cc-hover, #2a2b3e)',
      borderRadius: 8,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, fontSize: 11, color: 'var(--cc-text-dim, #aaa)',
      }}>
        <span style={{ fontWeight: 600 }}>📊 Активность AI авто-ответов за {days} дней</span>
        <span>
          Всего: <span style={{ color: '#22c55e', fontWeight: 600 }}>{stats.total}</span>
          {stats.errors > 0 && (
            <> · Ошибок: <span style={{ color: '#ef4444', fontWeight: 600 }}>{stats.errors}</span> ({stats.errorRate}%)</>
          )}
        </span>
      </div>

      <svg
        width={chartWidth}
        height={totalHeight}
        style={{ maxWidth: '100%', display: 'block' }}
        viewBox={`0 0 ${chartWidth} ${totalHeight}`}
      >
        {data.map((d, i) => {
          const x = PADDING.left + i * (BAR_WIDTH + BAR_GAP)
          const total = d.total
          const errors = d.errors
          const successes = total - errors

          const successHeight = (successes / maxValue) * CHART_HEIGHT
          const errorHeight = (errors / maxValue) * CHART_HEIGHT

          const ySuccess = PADDING.top + (CHART_HEIGHT - successHeight - errorHeight)
          const yError = PADDING.top + (CHART_HEIGHT - errorHeight)

          return (
            <g key={d.date}>
              {/* Total число над столбцом */}
              {total > 0 && (
                <text
                  x={x + BAR_WIDTH / 2}
                  y={PADDING.top + CHART_HEIGHT - Math.max(successHeight + errorHeight, 4) - 4}
                  textAnchor="middle"
                  style={{ fontSize: 10, fill: 'var(--cc-text, #e0e0e0)', fontWeight: 600 }}
                >
                  {total}
                </text>
              )}

              {/* Зелёная часть (успешные) */}
              {successes > 0 && (
                <rect
                  x={x}
                  y={ySuccess}
                  width={BAR_WIDTH}
                  height={successHeight}
                  fill="#22c55e"
                  rx={2}
                />
              )}

              {/* Красная часть (ошибки) */}
              {errors > 0 && (
                <rect
                  x={x}
                  y={yError}
                  width={BAR_WIDTH}
                  height={errorHeight}
                  fill="#ef4444"
                  rx={2}
                />
              )}

              {/* Подпись дня недели */}
              <text
                x={x + BAR_WIDTH / 2}
                y={PADDING.top + CHART_HEIGHT + 14}
                textAnchor="middle"
                style={{ fontSize: 10, fill: 'var(--cc-text-dim, #888)' }}
              >
                {shortDayLabel(d.date)}
              </text>

              {/* Дата */}
              <text
                x={x + BAR_WIDTH / 2}
                y={PADDING.top + CHART_HEIGHT + 26}
                textAnchor="middle"
                style={{ fontSize: 9, fill: 'var(--cc-text-dimmer, #666)' }}
              >
                {d.date.slice(5)}
              </text>
            </g>
          )
        })}

        {/* Baseline */}
        <line
          x1={PADDING.left}
          x2={chartWidth - PADDING.right}
          y1={PADDING.top + CHART_HEIGHT}
          y2={PADDING.top + CHART_HEIGHT}
          stroke="var(--cc-border, #333)"
          strokeWidth={1}
        />
      </svg>

      {/* Легенда */}
      <div style={{
        display: 'flex', gap: 16, marginTop: 6,
        fontSize: 10, color: 'var(--cc-text-dim, #888)',
      }}>
        <span><span style={{ color: '#22c55e' }}>■</span> Успешно</span>
        {stats.errors > 0 && <span><span style={{ color: '#ef4444' }}>■</span> Ошибки</span>}
      </div>
    </div>
  )
}
