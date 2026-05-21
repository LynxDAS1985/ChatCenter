// v0.91.4: helpers для извлечения превью сообщений из TDLib content.
// Используется в forum.getTopics для отображения lastMessage в темах.
//
// API: extractTopicPreview(tdMessage) → string
//
// По [TDLib MessageContent spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1_message_content.html)
// content имеет тег @type + специфичные поля. Возвращаем текст для messageText
// или эмодзи-аннотацию для медиа (паттерн как в превью списка чатов).

const PREVIEW_HANDLERS = {
  messageText: (c) => c.text?.text || '',
  messagePhoto: (c) => '🖼 ' + (c.caption?.text || 'Фото'),
  messageVideo: (c) => '📹 ' + (c.caption?.text || 'Видео'),
  messageAnimation: (c) => '🎬 ' + (c.caption?.text || 'GIF'),
  messageAudio: (c) => '🎵 ' + (c.caption?.text || 'Аудио'),
  messageVoiceNote: () => '🎤 Голосовое',
  messageVideoNote: () => '⭕ Видео-сообщение',
  messageDocument: (c) => '📎 ' + (c.document?.file_name || 'Файл'),
  messageSticker: (c) => '🎟 ' + (c.sticker?.emoji || 'Стикер'),
  messagePoll: (c) => '📊 ' + (c.poll?.question?.text || 'Опрос'),
  messageLocation: () => '📍 Геолокация',
  messageContact: (c) => '👤 ' + (c.contact?.first_name || 'Контакт'),
  messageCall: () => '📞 Звонок',
  messagePinMessage: () => '📌 Закреплено сообщение',
}

export function extractTopicPreview(tdMsg) {
  if (!tdMsg?.content) return ''
  const content = tdMsg.content
  const handler = PREVIEW_HANDLERS[content['@type']]
  return handler ? handler(content) : '📎 вложение'
}
