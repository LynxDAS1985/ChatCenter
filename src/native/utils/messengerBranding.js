// v0.87.106 (multi-account UI): фирменные цвета и emoji мессенджеров.
// Используются в sidebar (AccountAvatar в NativeApp.jsx) + ChatListItem (полоса слева, угловой ✈️).
// Когда добавим WhatsApp/VK/MAX — сюда добавляются их цвета и emoji.

export const MESSENGER_COLORS = {
  telegram: '#2AABEE',
  whatsapp: '#25D366',
  vk: '#0077FF',
  max: '#7B3FE4',
  viber: '#7360F2',
}

export const MESSENGER_EMOJI = {
  telegram: '✈️',
  whatsapp: '💬',
  vk: '🔵',
  max: '💎',
  viber: '🟣',
}

export const MESSENGER_NAMES = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  vk: 'ВКонтакте',
  max: 'MAX',
  viber: 'Viber',
}

// Цвет полосы слева для чата по messenger-типу. Если не известен — серый (нейтральный).
export function getMessengerColor(messenger) {
  return MESSENGER_COLORS[messenger] || 'var(--amoled-border)'
}

export function getMessengerEmoji(messenger) {
  return MESSENGER_EMOJI[messenger] || '💬'
}

export function getMessengerName(messenger) {
  return MESSENGER_NAMES[messenger] || (messenger || 'Мессенджер')
}
