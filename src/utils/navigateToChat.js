/**
 * Навигация к чату в WebView по клику на ribbon.
 * Каждый мессенджер — свой модуль в navigators/.
 *
 * v0.87.77: разбит на 5 модулей (Telegram/MAX/WhatsApp/VK/generic)
 * для соблюдения лимита 300 строк на файл в src/utils/.
 */

import { buildTelegramScript } from './navigators/telegramNavigate.js'
import { buildMaxScript } from './navigators/maxNavigate.js'
import { buildWhatsAppScript } from './navigators/whatsappNavigate.js'
import { buildVkScript } from './navigators/vkNavigate.js'
import { buildGenericScript } from './navigators/genericNavigate.js'

export function buildChatNavigateScript(url, senderName, chatTag) {
  if (url.includes('telegram.org')) return buildTelegramScript(senderName, chatTag)
  if (url.includes('max.ru'))       return buildMaxScript(senderName)
  if (url.includes('whatsapp.com')) return buildWhatsAppScript(senderName)
  if (url.includes('vk.com'))       return buildVkScript(senderName)
  return buildGenericScript(senderName)
}
