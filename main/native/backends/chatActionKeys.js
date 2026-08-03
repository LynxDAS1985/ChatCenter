// v1.2.170: типы действий собеседника (TDLib td_api ChatAction) → короткий КЛЮЧ.
// Вынесено из tdlibClient.js (лимит файла). Текст-глагол под ключ — в renderer
// (src/native/utils/formatTypingUsers.js). chatActionCancel → null (гасит индикатор);
// неизвестный активный тип → 'typing' (безопасный откат к «печатает», без потери индикатора).
const KEYS = {
  chatActionTyping: 'typing',
  chatActionRecordingVoiceNote: 'voice', chatActionUploadingVoiceNote: 'voice',
  chatActionRecordingVideoNote: 'video_note', chatActionUploadingVideoNote: 'video_note',
  chatActionRecordingVideo: 'video', chatActionUploadingVideo: 'video',
  chatActionUploadingPhoto: 'photo', chatActionUploadingDocument: 'document',
  chatActionChoosingSticker: 'sticker', chatActionStartPlayingGame: 'game',
  chatActionChoosingLocation: 'location', chatActionChoosingContact: 'contact',
}

// actionType (строка @type) → ключ действия ('typing'|'voice'|…) или null (cancel).
export function normalizeChatAction(actionType) {
  if (actionType === 'chatActionCancel') return null
  return KEYS[actionType] || 'typing'
}
