// v0.89.0 — Stage 4 / Этап 1: GramJS backend (адаптер)
//
// На Этапе 1 этот файл — ТОЛЬКО фасад над существующими IPC handlers.
// Реальные обращения идут через `state.clients` (Map<accountId, TelegramClient>),
// которые управляются в telegramHandler.js / telegramAuth.js / telegramMessages.js.
//
// СЕЙЧАС: каждый метод фасада делает прямой вызов к существующим функциям
// (без копирования логики). Если функция ещё не вынесена как чистая — оставляем
// TODO для следующих итераций Этапа 1.
//
// Цель: на Этапе 4 этот файл становится единственным местом GramJS-кода, и его
// можно удалить целиком переключив USE_TDLIB_BACKEND=1.

import { state } from '../telegramState.js'

/**
 * @returns {import('../messengerBackend.js').MessengerBackend}
 */
export function createGramjsBackend() {
  return {
    name: 'gramjs',

    auth: {
      async startLogin(_phone) {
        // TODO Этап 1.x: вынести из telegramAuth.js → startLogin()
        throw new Error('gramjsBackend.auth.startLogin: not yet wrapped (use existing IPC tg:login-start)')
      },
      async submitCode(_code) {
        throw new Error('gramjsBackend.auth.submitCode: not yet wrapped (use existing IPC tg:login-code)')
      },
      async submitPassword(_password) {
        throw new Error('gramjsBackend.auth.submitPassword: not yet wrapped (use existing IPC tg:login-password)')
      },
      async cancelLogin() {
        throw new Error('gramjsBackend.auth.cancelLogin: not yet wrapped (use existing IPC tg:login-cancel)')
      },
      async autoRestoreSessions() {
        throw new Error('gramjsBackend.auth.autoRestoreSessions: not yet wrapped (autoRestoreSessions in telegramAuth.js)')
      },
      async removeAccount(_accountId) {
        throw new Error('gramjsBackend.auth.removeAccount: not yet wrapped (use existing IPC tg:remove-account)')
      },
    },

    chats: {
      async getChats(_accountId) {
        throw new Error('gramjsBackend.chats.getChats: not yet wrapped (use existing IPC tg:get-chats)')
      },
      async getCachedChats(_accountId) {
        throw new Error('gramjsBackend.chats.getCachedChats: not yet wrapped (use existing IPC tg:get-cached-chats)')
      },
      async rescanUnread(_options) {
        throw new Error('gramjsBackend.chats.rescanUnread: not yet wrapped (fetchAllUnreadUpdates in telegramChats.js)')
      },
      async healthCheck() {
        throw new Error('gramjsBackend.chats.healthCheck: not yet wrapped (use existing IPC tg:health-check)')
      },
    },

    messages: {
      async get(_params) {
        throw new Error('gramjsBackend.messages.get: not yet wrapped (use existing IPC tg:get-messages)')
      },
      async getTopic(_params) {
        throw new Error('gramjsBackend.messages.getTopic: not yet wrapped (use existing IPC tg:get-topic-messages)')
      },
      async send(_chatId, _text, _replyTo) {
        throw new Error('gramjsBackend.messages.send: not yet wrapped (use existing IPC tg:send-message)')
      },
      async sendFile(_chatId, _filePath, _caption) {
        throw new Error('gramjsBackend.messages.sendFile: not yet wrapped (use existing IPC tg:send-file)')
      },
      async deleteMessage(_chatId, _msgId, _forAll) {
        throw new Error('gramjsBackend.messages.deleteMessage: not yet wrapped (use existing IPC tg:delete-message)')
      },
      async editMessage(_chatId, _msgId, _text) {
        throw new Error('gramjsBackend.messages.editMessage: not yet wrapped (use existing IPC tg:edit-message)')
      },
      async forwardMessage(_fromChatId, _toChatId, _msgId) {
        throw new Error('gramjsBackend.messages.forwardMessage: not yet wrapped (use existing IPC tg:forward)')
      },
      async markRead(_chatId, _maxId) {
        throw new Error('gramjsBackend.messages.markRead: not yet wrapped (use existing IPC tg:mark-read)')
      },
      async markTopicRead(_chatId, _topicId, _maxId) {
        throw new Error('gramjsBackend.messages.markTopicRead: not yet wrapped (use existing IPC tg:mark-topic-read)')
      },
      async getPinned(_chatId) {
        throw new Error('gramjsBackend.messages.getPinned: not yet wrapped (use existing IPC tg:get-pinned-message)')
      },
    },

    media: {
      async download(_params) {
        throw new Error('gramjsBackend.media.download: not yet wrapped (use existing IPC tg:download-media)')
      },
      async downloadVideo(_params) {
        throw new Error('gramjsBackend.media.downloadVideo: not yet wrapped (use existing IPC tg:download-video)')
      },
      async getCacheSize() {
        throw new Error('gramjsBackend.media.getCacheSize: not yet wrapped')
      },
      async cleanup() {
        throw new Error('gramjsBackend.media.cleanup: not yet wrapped')
      },
    },

    forum: {
      async getTopics(_chatId, _limit) {
        throw new Error('gramjsBackend.forum.getTopics: not yet wrapped (use existing IPC tg:get-forum-topics)')
      },
      async getTopicMessages(_params) {
        throw new Error('gramjsBackend.forum.getTopicMessages: not yet wrapped (use existing IPC tg:get-topic-messages)')
      },
    },

    // Доступ к внутреннему state для диагностики и переходных решений.
    // На Этапе 2 эта вещь будет недоступна — все обращения через интерфейс.
    _internalState: state,
  }
}
