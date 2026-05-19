// v0.89.40: модуль переименован в messagesCache.js (общий для топиков + чатов).
// Этот файл оставлен как re-export для обратной совместимости с импортами v0.89.39.
// Новый код импортируй из './messagesCache.js' с новыми именами:
//   saveMessages / loadMessages / cleanupExpired / clearAllMessages

export {
  saveMessages,
  loadMessages,
  cleanupExpired,
  clearAllMessages,
  // v0.89.39 имена — обёртки над новыми
  saveTopicMessages,
  loadTopicMessages,
  clearTopicCache,
  _internal,
} from './messagesCache.js'
