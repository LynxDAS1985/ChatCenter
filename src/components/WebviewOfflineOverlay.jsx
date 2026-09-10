// WebviewOfflineOverlay.jsx — v1.2.445
//
// Экран «Нет связи» ПОВЕРХ слоя мессенджера. Сделан по согласованному с пользователем макету:
// значок, причина обрыва, обратный отсчёт до следующей попытки, полоса, кнопки
// «Повторить сейчас» и «Журнал», строка с номером попытки.
//
// ЗАЧЕМ НЕПРОЗРАЧНЫЙ ФОН (важно, это половина решения жалобы): мессенджеры в App.jsx лежат
// слоями друг на друге (активный поднимается наверх), и у слоя НЕТ своего фона. Пока страница
// мертва, слой прозрачен — и сквозь него видно нижний слой «Общий чат» с чатами Telegram.
// Именно это выглядело как «переключился на WhatsApp, а показаны данные Telegram API».
//
// ЗАЧЕМ ПОВЕРХ, А НЕ ВМЕСТО: сам <webview> прятать нельзя — Chromium усыпляет скрытые
// (в App.jsx про это есть предупреждение), тогда страница не поднимется и после возврата сети.
//
// Секунды считает сам компонент (свой таймер раз в секунду) — чтобы из-за отсчёта не
// перерисовывалось всё окно приложения: хук просыпается только на реальные события.
import { useEffect, useState } from 'react'
import { errorName, secondsLeft } from '../../shared/reconnectPlan.js'

/**
 * @param {Object} props
 * @param {Object} props.entry — запись состояния из useWebviewReconnect
 * @param {string} props.name — имя мессенджера («WhatsApp»)
 * @param {string} [props.color] — цвет мессенджера для значка
 * @param {Function} props.onRetry — «Повторить сейчас»
 * @param {Function} [props.onOpenLog] — открыть журнал
 */
export default function WebviewOfflineOverlay({ entry, name, color, onRetry, onOpenLog }) {
  const [now, setNow] = useState(() => Date.now())
  const trying = entry?.phase === 'trying'

  // Тикаем раз в секунду ТОЛЬКО пока идёт отсчёт. Идёт попытка — таймер не нужен.
  useEffect(() => {
    if (trying) return undefined
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [trying])

  if (!entry) return null

  const left = secondsLeft(entry, now)
  const total = Math.max(1, Math.round((entry.pauseMs || 1000) / 1000))
  const progress = trying ? 100 : Math.round(((total - left) / total) * 100)
  const accent = trying ? '#38BDF8' : '#F5A524'

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 5,
      // ГЛАВНОЕ: непрозрачный фон — нижний слой больше не просвечивает
      background: 'radial-gradient(120% 90% at 50% 35%, #121A24 0%, #0A0E13 60%, #06080C 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: "'Golos Text', 'Segoe UI', system-ui, sans-serif", color: '#E6EBF0',
    }}>
      <div style={{
        width: 'min(430px, 100%)', background: '#141A21', border: '1px solid #222B35',
        borderRadius: 14, padding: '26px 26px 22px', textAlign: 'center',
        boxShadow: '0 24px 60px -30px #000',
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: 16, margin: '0 auto 16px',
          display: 'grid', placeItems: 'center', fontSize: 26,
          background: `${accent}1F`, border: `1px solid ${accent}59`,
        }}>{trying ? '🔄' : '📡'}</div>

        <h3 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 700 }}>
          {trying ? `Подключаемся к ${name}…` : `Нет связи с ${name}`}
        </h3>

        <p style={{ margin: '0 0 18px', fontSize: 13.5, color: '#8695A5' }}>
          {trying ? 'Загружаем страницу заново' : <>Интернет пропал. Причина:{' '}
            <code style={{
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12,
              background: '#0E141B', padding: '1px 5px', borderRadius: 3, color: '#A9B7C6',
            }}>{errorName(entry.code)}</code></>}
        </p>

        {!trying && (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontVariantNumeric: 'tabular-nums',
              fontSize: 42, fontWeight: 600, lineHeight: 1, color: accent,
            }}>{left}</span>
            <span style={{ fontSize: 15, color: '#8695A5' }}>с</span>
          </div>
        )}
        <p style={{ fontSize: 12.5, color: '#8695A5', margin: '0 0 16px' }}>
          {trying ? 'если не выйдет — подождём и попробуем снова' : 'до следующей попытки подключиться'}
        </p>

        <div style={{ height: 4, borderRadius: 3, background: '#0E141B', overflow: 'hidden', marginBottom: 18 }}>
          <div style={{
            height: '100%', borderRadius: 3, background: accent,
            width: `${Math.max(0, Math.min(100, progress))}%`, transition: 'width .9s linear',
          }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onRetry}
            disabled={trying}
            style={{
              flex: 1, font: 'inherit', fontWeight: 600, fontSize: 14,
              cursor: trying ? 'default' : 'pointer', padding: '10px 14px', borderRadius: 9,
              border: '1px solid transparent',
              background: trying ? '#1E2A35' : '#38BDF8', color: trying ? '#8695A5' : '#06202D',
            }}
          >{trying ? 'Подождите…' : 'Повторить сейчас'}</button>
          {onOpenLog && (
            <button
              type="button"
              onClick={onOpenLog}
              style={{
                font: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                padding: '10px 14px', borderRadius: 9, border: '1px solid #222B35',
                background: 'transparent', color: '#E6EBF0',
              }}
            >Журнал</button>
          )}
        </div>

        <p style={{
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11,
          color: '#55636F', margin: '14px 0 0',
        }}>
          {trying
            ? `попытка ${entry.attempt} · идёт`
            : `попытка ${entry.attempt} · следующая пауза ${Math.round((entry.pauseMs || 0) / 1000)} с`}
        </p>

        {color && <div style={{ height: 3, width: 42, borderRadius: 2, background: color, margin: '16px auto 0', opacity: .8 }} />}
      </div>
    </div>
  )
}
