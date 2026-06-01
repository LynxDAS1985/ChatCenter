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

// Применяет CSS-переменные к :root. MessageBubble и другие компоненты,
// читающие var(--amoled-accent) — автоматически обновятся без React-ре-рендера.
export function applyTheme(theme) {
  if (!theme || typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--amoled-accent', theme.accent)
  root.style.setProperty('--amoled-accent-hover', theme.accentHover)
  root.style.setProperty('--amoled-accent-shadow', theme.shadow)
}
