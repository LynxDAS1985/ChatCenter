// v1.2.5: «Печатающий» эффект для отображения ответа AI постепенно.
//
// Зачем: до v1.2.5 ответ AI появлялся одним блоком — юзер не понимал «думает ли»
// или «вообще получили ответ». Теперь текст появляется посимвольно (как печатает
// человек) — даёт ощущение живой работы.
//
// Это **визуальный** эффект — реальный API streaming (SSE) не нужен, потому что:
// - Bridge с auto-резервом всё равно ждёт полный ответ (чтобы понять упал или нет).
// - Для UI важна обратная связь, не настоящий streaming.
//
// Если text меняется — компонент перезапускает анимацию.

import { useState, useEffect, useRef } from 'react'

// Глобальный injection стиля курсора — один раз на mount всех экземпляров.
// Это позволяет держать стиль вне span, чтобы textContent не содержал CSS.
let _styleInjected = false
function ensureCursorStyle() {
  if (_styleInjected || typeof document === 'undefined') return
  try {
    const style = document.createElement('style')
    style.setAttribute('data-cc-typewriter', '')
    style.textContent = '@keyframes cc-typewriter-blink{0%,50%{opacity:0.5}51%,100%{opacity:0}}'
    document.head.appendChild(style)
    _styleInjected = true
  } catch (_) { /* SSR safe */ }
}

/**
 * @param {object} props
 * @param {string} props.text — полный текст для отображения
 * @param {number} [props.speed=15] — мс на символ (15мс ~ 67 cps — комфортно)
 * @param {() => void} [props.onComplete] — вызывается когда печать закончилась
 * @param {boolean} [props.instant=false] — показать сразу без эффекта
 * @param {object} [props.style]
 */
export default function TypewriterText({ text, speed = 15, onComplete, instant = false, style }) {
  const [displayed, setDisplayed] = useState(instant ? text : '')
  const timerRef = useRef(null)
  const lastTextRef = useRef(text)
  // v1.2.5 fix: onComplete через ref — иначе новая функция на rerender инвалидирует
  // useEffect → бесконечный cleanup-new-setup без advancing displayed.
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  // Один раз injection CSS keyframes в document.head
  useEffect(() => { ensureCursorStyle() }, [])

  // Reset при изменении text — отдельный effect для чистоты
  useEffect(() => {
    if (lastTextRef.current !== text) {
      lastTextRef.current = text
      setDisplayed(instant ? text : '')
    }
  }, [text, instant])

  useEffect(() => {
    if (instant) {
      if (displayed !== text) setDisplayed(text)
      if (onCompleteRef.current) onCompleteRef.current()
      return undefined
    }

    if (!text) {
      if (displayed !== '') setDisplayed('')
      return undefined
    }

    // Если уже показано всё → onComplete + stop
    if (displayed.length >= text.length) {
      if (displayed === text && onCompleteRef.current) onCompleteRef.current()
      return undefined
    }

    timerRef.current = setTimeout(() => {
      setDisplayed(text.slice(0, displayed.length + 1))
    }, speed)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [text, displayed, speed, instant])

  const isTyping = !instant && text && displayed.length < text.length

  return (
    <span style={style}>
      {displayed}
      {isTyping && (
        <span style={{
          display: 'inline-block', width: 8, height: 14, marginLeft: 2,
          background: 'currentColor', opacity: 0.5,
          animation: 'cc-typewriter-blink 1s steps(1) infinite',
          verticalAlign: 'text-bottom',
        }} />
      )}
    </span>
  )
}
