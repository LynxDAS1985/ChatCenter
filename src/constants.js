// v0.6 — общие константы (мессенджеры, цвета, популярные пресеты)

export const DEFAULT_MESSENGERS = [
  {
    id: 'telegram',
    name: 'Telegram',
    url: 'https://web.telegram.org/k/',
    color: '#2AABEE',
    partition: 'persist:telegram',
    emoji: '✈️',
    isDefault: true,
    accountScript: `(() => {
      // Только имя аккаунта из настроек/профиля — НЕ из шапки чата (.chat-info даёт название открытого чата!)
      const sels = ['.user-title', '.profile-title', '.sidebar-left-section-header .peer-title'];
      for (const s of sels) { const t = document.querySelector(s)?.textContent?.trim(); if (t && t.length < 60 && t.length > 1) return t; }
      return null;
    })()`
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    url: 'https://web.whatsapp.com/',
    color: '#25D366',
    partition: 'persist:whatsapp',
    emoji: '💬',
    isDefault: true,
    accountScript: `(() => {
      const sels = ['[data-testid="profile-details-header-name"]','[data-testid="user-preferred-name"]'];
      for (const s of sels) { const t = document.querySelector(s)?.textContent?.trim(); if (t && t.length < 60) return t; }
      return null;
    })()`
  },
  {
    id: 'vk',
    name: 'ВКонтакте',
    url: 'https://vk.com/im',
    color: '#4C75A3',
    partition: 'persist:vk',
    emoji: '🔵',
    isDefault: true,
    accountScript: `(() => {
      const sels = ['.TopNavBtn__title','.header__top--uname','.vkuiSimpleCell__content .vkuiTypography--weight-1'];
      for (const s of sels) { const t = document.querySelector(s)?.textContent?.trim(); if (t && t.length < 60) return t; }
      return null;
    })()`
  }
]

// Популярные мессенджеры для быстрого добавления
export const POPULAR_MESSENGERS = [
  { name: 'Telegram',      url: 'https://web.telegram.org/k/',        color: '#2AABEE', emoji: '✈️', category: 'Мессенджер' },
  { name: 'WhatsApp',      url: 'https://web.whatsapp.com/',           color: '#25D366', emoji: '💬', category: 'Мессенджер' },
  { name: 'ВКонтакте',     url: 'https://vk.com/im',                   color: '#4C75A3', emoji: '🔵', category: 'Соцсеть' },
  { name: 'Авито',         url: 'https://www.avito.ru/im/list',         color: '#00AAFF', emoji: '🛒', category: 'Маркетплейс' },
  { name: 'Wildberries',   url: 'https://seller.wildberries.ru/',       color: '#A855F7', emoji: '📦', category: 'Маркетплейс' },
  { name: 'Ozon',          url: 'https://seller.ozon.ru/',              color: '#005BFF', emoji: '🛍️', category: 'Маркетплейс' },
  { name: 'Instagram',     url: 'https://www.instagram.com/direct/',    color: '#E1306C', emoji: '📸', category: 'Соцсеть' },
  { name: 'Discord',       url: 'https://discord.com/channels/@me',     color: '#5865F2', emoji: '🎮', category: 'Геймерский' },
  { name: 'Viber',         url: 'https://web.viber.com/',               color: '#7360F2', emoji: '📳', category: 'Мессенджер' },
  { name: 'Одноклассники', url: 'https://ok.ru/messages',               color: '#F7921E', emoji: '🌟', category: 'Соцсеть' },
  { name: 'Slack',         url: 'https://app.slack.com/',               color: '#4A154B', emoji: '💼', category: 'Работа' },
  { name: 'Zoom',          url: 'https://app.zoom.us/wc',               color: '#2D8CFF', emoji: '📹', category: 'Видео' },
]

export const PRESET_COLORS = [
  '#2AABEE', '#25D366', '#4C75A3', '#FF5722',
  '#9C27B0', '#FF9800', '#00BCD4', '#E91E63'
]

export const PRESET_EMOJIS = ['💬', '📱', '🌐', '📧', '💼', '📨', '🔔', '🌟', '💡', '🎯', '🛒', '🏪']
