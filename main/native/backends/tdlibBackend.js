// v0.89.0 — Stage 4 / Этап 1: TDLib backend (STUB)
//
// Этот файл будет наполняться реальной реализацией на Этапе 2.
// Сейчас — только заглушка с правильным интерфейсом, чтобы factory в
// messengerBackend.js мог его вернуть при USE_TDLIB_BACKEND=1.
//
// Запускать его пока нельзя — все методы бросают ошибку «not implemented yet».
//
// Архитектура:
//   - Один TdClient на каждый аккаунт через td_create_client_id (или несколько createClient).
//   - Login flow через authorization_state events.
//   - Сообщения / чаты через tdl.invoke({ '@type': '...' }).
//   - Mapping TDLib message format → наш NativeMessage в backends/tdlibMapper.js (создается на Этапе 2).
//
// Подробный план: .memory-bank/tdlib-migration-plan.md → Этап 2.

const NOT_IMPL = (method) => () => {
  throw new Error(`tdlibBackend.${method}: not implemented yet (Stage 4 / Этап 2)`)
}

/**
 * @returns {import('../messengerBackend.js').MessengerBackend}
 */
export function createTdlibBackend() {
  return {
    name: 'tdlib',

    auth: {
      startLogin: NOT_IMPL('auth.startLogin'),
      submitCode: NOT_IMPL('auth.submitCode'),
      submitPassword: NOT_IMPL('auth.submitPassword'),
      cancelLogin: NOT_IMPL('auth.cancelLogin'),
      autoRestoreSessions: NOT_IMPL('auth.autoRestoreSessions'),
      removeAccount: NOT_IMPL('auth.removeAccount'),
    },

    chats: {
      getChats: NOT_IMPL('chats.getChats'),
      getCachedChats: NOT_IMPL('chats.getCachedChats'),
      rescanUnread: NOT_IMPL('chats.rescanUnread'),
      healthCheck: NOT_IMPL('chats.healthCheck'),
    },

    messages: {
      get: NOT_IMPL('messages.get'),
      getTopic: NOT_IMPL('messages.getTopic'),
      send: NOT_IMPL('messages.send'),
      sendFile: NOT_IMPL('messages.sendFile'),
      deleteMessage: NOT_IMPL('messages.deleteMessage'),
      editMessage: NOT_IMPL('messages.editMessage'),
      forwardMessage: NOT_IMPL('messages.forwardMessage'),
      markRead: NOT_IMPL('messages.markRead'),
      markTopicRead: NOT_IMPL('messages.markTopicRead'),
      getPinned: NOT_IMPL('messages.getPinned'),
    },

    media: {
      download: NOT_IMPL('media.download'),
      downloadVideo: NOT_IMPL('media.downloadVideo'),
      getCacheSize: NOT_IMPL('media.getCacheSize'),
      cleanup: NOT_IMPL('media.cleanup'),
    },

    forum: {
      getTopics: NOT_IMPL('forum.getTopics'),
      getTopicMessages: NOT_IMPL('forum.getTopicMessages'),
    },
  }
}
