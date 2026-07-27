// v1.2.131: единое правило «какое имя автора показать перед превью последнего
// сообщения в списке чатов». ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ — используется и при первичной
// загрузке чатов (main: tdlibMapper.mapChat), и в живом пути новых сообщений
// (renderer: nativeStoreIpc tg:new-message). Корневой shared/ — чтобы импортировался
// из обоих процессов (как shared/notifAlbum.js).
//
// Правило (эталон Telegram — список диалогов):
//   группа/форум (type==='group') + ВХОДЯЩЕЕ  → имя отправителя ('Мария')
//   группа/форум + ИСХОДЯЩЕЕ (своё)           → 'Вы'
//   канал / личка (type!=='group')            → '' (без префикса)
//   имя неизвестно у входящего                → '' (не рисуем пустое ': ')
//
// @param {string} type — тип чата: 'user' | 'group' | 'channel'
// @param {string} senderName — имя автора (из userCache/chatCache), может быть ''
// @param {boolean} isOutgoing — сообщение отправлено этим пользователем
// @returns {string} метка префикса ('' = префикс не показывать)
export function lastSenderLabel(type, senderName, isOutgoing) {
  if (type !== 'group') return ''
  if (isOutgoing) return 'Вы'
  return senderName || ''
}
