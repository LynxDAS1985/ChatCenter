// v0.89.0 — Stage 4 / Этап 4: абстракция messengerBackend (TDLib-only).
//
// После завершения Этапа 4 GramJS-интеграция полностью удалена из проекта.
// Единственный реальный backend — TDLib. Этот файл оставлен как JSDoc-описание
// интерфейса (типы ниже) — используется тестами (messengerBackend.test.cjs) и
// служит документацией для потенциальных будущих backend'ов (например, MTProto-обёртка).
//
// Реальный TDLib runtime создаётся через initTdlibBackendStartup в main.js
// (см. main/native/backends/tdlibStartup.js).

/**
 * @typedef {object} Chat
 * @property {string} id            — '{accountId}:{chatNumericId}'
 * @property {string} accountId
 * @property {string} title
 * @property {'user'|'group'|'channel'} type
 * @property {string} lastMessage
 * @property {number} lastMessageTs — unix ms
 * @property {number} unreadCount
 * @property {number} readInboxMaxId
 * @property {string|null} avatar
 * @property {boolean} hasPhoto
 * @property {boolean} isOnline
 * @property {boolean} isMuted
 * @property {number} muteUntil
 * @property {boolean} isForum
 */

/**
 * @typedef {object} NativeMessage
 * @property {string} id
 * @property {string} chatId
 * @property {string} senderId
 * @property {string} senderName
 * @property {string|null} senderAvatar
 * @property {string} text
 * @property {Array} entities
 * @property {number} timestamp     — unix ms
 * @property {boolean} isOutgoing
 * @property {boolean} isEdited
 * @property {string|null} mediaType — 'photo'|'video'|'document'|'voice'|'sticker'|'link'|null
 * @property {object|null} webPage
 * @property {string|null} replyToId
 * @property {string|null} groupedId
 * @property {object|null} fwdFrom
 */

/**
 * @typedef {object} BackendAuth
 * @property {(phone: string) => Promise<{ok: boolean, error?: string}>} startLogin
 * @property {(code: string) => Promise<{ok: boolean, success?: boolean, error?: string}>} submitCode
 * @property {(password: string) => Promise<{ok: boolean, success?: boolean, error?: string}>} submitPassword
 * @property {() => Promise<{ok: boolean}>} cancelLogin
 * @property {() => Promise<void>} autoRestoreSessions
 * @property {(accountId: string) => Promise<{ok: boolean, error?: string}>} removeAccount
 */

/**
 * @typedef {object} BackendChats
 * @property {(accountId?: string) => Promise<{ok: boolean, chats: Chat[]}>} getChats
 * @property {(accountId: string) => Promise<{ok: boolean, chats: Chat[]}>} getCachedChats
 * @property {(options?: object) => Promise<{ok: boolean, accountStats?: Array}>} rescanUnread
 * @property {() => Promise<object>} healthCheck
 */

/**
 * @typedef {object} BackendMessages
 * @property {(params: object) => Promise<{ok: boolean, messages: NativeMessage[], hasMore: boolean}>} get
 * @property {(params: object) => Promise<{ok: boolean, messages: NativeMessage[]}>} getTopic
 * @property {(chatId: string, text: string, replyTo?: string) => Promise<{ok: boolean, messageId?: string, error?: string}>} send
 * @property {(chatId: string, filePath: string, caption?: string) => Promise<{ok: boolean, messageId?: string}>} sendFile
 * @property {(chatId: string, msgId: string, forAll?: boolean) => Promise<{ok: boolean}>} deleteMessage
 * @property {(chatId: string, msgId: string, text: string) => Promise<{ok: boolean}>} editMessage
 * @property {(fromChatId: string, toChatId: string, msgId: string) => Promise<{ok: boolean}>} forwardMessage
 * @property {(chatId: string, maxId: number) => Promise<{ok: boolean}>} markRead
 * @property {(chatId: string, topicId: number, maxId: number) => Promise<{ok: boolean}>} markTopicRead
 * @property {(chatId: string) => Promise<{ok: boolean, message?: NativeMessage}>} getPinned
 */

/**
 * @typedef {object} BackendMedia
 * @property {(params: {chatId: string, msgId: string, thumb?: boolean}) => Promise<{ok: boolean, path?: string}>} download
 * @property {(params: {chatId: string, msgId: string}) => Promise<{ok: boolean, path?: string}>} downloadVideo
 * @property {() => Promise<{bytes: number}>} getCacheSize
 * @property {() => Promise<{ok: boolean, freedBytes: number}>} cleanup
 */

/**
 * @typedef {object} BackendForum
 * @property {(chatId: string, limit?: number) => Promise<{ok: boolean, isForum: boolean, topics: Array}>} getTopics
 * @property {(params: object) => Promise<{ok: boolean, messages: NativeMessage[]}>} getTopicMessages
 */

/**
 * @typedef {object} MessengerBackend
 * @property {'tdlib'} name
 * @property {BackendAuth} auth
 * @property {BackendChats} chats
 * @property {BackendMessages} messages
 * @property {BackendMedia} media
 * @property {BackendForum} forum
 */

export function getBackendName() {
  return 'tdlib'
}
