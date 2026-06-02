// v0.95.30: управление темой цвета сообщений в native режиме.
//
// 5 вариантов цвета bubble отправленных сообщений + аксент UI (кнопки/border focus/scrollbar).
// Юзер выбирает в ThemePickerModal → CSS-переменные --amoled-accent/-hover/-shadow
// применяются к :root.native-mode через document.documentElement.style.setProperty.
//
// MessageBubble.jsx читает var(--amoled-accent) для background — никаких ререндеров.
// Persistence — localStorage (key='cc-native-theme'). На старте NativeApp вызывает applyTheme(loadTheme()).
//
// Эталоны: Telegram Premium custom themes, Slack workspace colors, Discord Nitro themes.

export const THEMES = [
  {
    id: 'telegram-blue',
    label: 'Telegram',
    description: 'Классический синий — как в Telegram',
    accent: '#2AABEE',
    accentHover: '#1e8fc7',
    shadow: 'rgba(42,171,238,0.15)',
  },
  {
    id: 'indigo',
    label: 'Индиго',
    description: 'Спокойный — как Discord / Signal',
    accent: '#3B5BA9',
    accentHover: '#2d4685',
    shadow: 'rgba(59,91,169,0.18)',
  },
  {
    id: 'teal',
    label: 'Тёмно-бирюзовый',
    description: 'Бизнес-стиль — как Slack DM',
    accent: '#1A6B8C',
    accentHover: '#125370',
    shadow: 'rgba(26,107,140,0.18)',
  },
  {
    id: 'premium',
    label: 'Premium',
    description: 'Яркий Telegram-blue Premium',
    accent: '#229ED9',
    accentHover: '#0088CC',
    shadow: 'rgba(34,158,217,0.22)',
  },
  {
    id: 'violet',
    label: 'Фиолетовый',
    description: 'Современный — как Discord Nitro',
    accent: '#5B5FE2',
    accentHover: '#4549c4',
    shadow: 'rgba(91,95,226,0.18)',
  },
]

export const DEFAULT_THEME_ID = 'telegram-blue'
const STORAGE_KEY = 'cc-native-theme'

export function getThemeById(id) {
  return THEMES.find(t => t.id === id) || THEMES[0]
}

export function loadTheme() {
  try {
    if (typeof localStorage === 'undefined') return THEMES[0]
    const id = localStorage.getItem(STORAGE_KEY)
    return getThemeById(id)
  } catch (_) { return THEMES[0] }
}

export function saveTheme(id) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, String(id || DEFAULT_THEME_ID))
  } catch (_) {}
}

// Применяет CSS-переменные `--amoled-accent` / `-hover` / `-shadow`.
//
// v0.95.34: упрощено — теперь основной таргет это `document.documentElement` (:root).
// В styles-base.css темовые переменные перенесены из `.native-mode` в `:root` (v0.95.34),
// поэтому конфликт specificity v0.95.33 устранён — `documentElement.style.setProperty`
// надёжно работает.
//
// Также дополнительно применяем к `.native-mode` элементам — двойная страховка
// на случай если в будущем кто-то вернёт переопределение в `.native-mode` selector.
// MessageBubble и другие используют `var(--amoled-accent)` — обновляются мгновенно
// без React re-render.
export function applyTheme(theme) {
  if (!theme || typeof document === 'undefined') return
  const setVars = (el) => {
    el.style.setProperty('--amoled-accent', theme.accent)
    el.style.setProperty('--amoled-accent-hover', theme.accentHover)
    el.style.setProperty('--amoled-accent-shadow', theme.shadow)
  }
  // Основной таргет — :root (документ). Работает после v0.95.34 переноса
  // переменных в :root в styles-base.css.
  if (document.documentElement) setVars(document.documentElement)
  // Страховка — `.native-mode` элементы (если кто-то снова добавит переопределение).
  try {
    document.querySelectorAll('.native-mode').forEach(setVars)
  } catch (_) {}
}

// v0.95.34: визуальная вспышка outgoing bubble после смены темы.
// Применяет класс `.cc-theme-flash` (CSS keyframe в styles-base.css) на 550мс,
// затем убирает. Запускается из ThemePickerModal.handleSelect.
//
// Эталон: Telegram при изменении wallpaper — короткая пульсация bubble.
export function flashOutgoingBubbles(durationMs = 550) {
  if (typeof document === 'undefined') return
  try {
    const bubbles = document.querySelectorAll('[data-cc-outgoing="true"]')
    if (bubbles.length === 0) return
    bubbles.forEach((el) => {
      el.classList.remove('cc-theme-flash')  // на случай если класс уже стоит
      // Принудительный reflow, чтобы перезапустить animation если flash идёт повторно.
      void el.offsetWidth
      el.classList.add('cc-theme-flash')
    })
    setTimeout(() => {
      bubbles.forEach((el) => el.classList.remove('cc-theme-flash'))
    }, durationMs)
  } catch (_) {}
}
