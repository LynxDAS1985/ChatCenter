// v1.2.137: чистое решение «снимать ли карточку-уведомление по серверному прочтению чата».
// Вынесено из обработчика notif:dismiss-chat (notifHandlers.js), чтобы правило можно было
// проверить юнит-тестом (паттерн notifResizeDecision.js). Обработчик только исполняет side-effect.
//
// Контекст: TDLib шлёт updateChatReadInbox с last_read_inbox_message_id (id последнего
// ПРОЧИТАННОГО входящего) — приходит на все устройства аккаунта (в т.ч. при чтении на телефоне).
// Карточку снимаем, если её сообщение уже прочитано на сервере (id сообщения <= last_read).
// Это покрывает и ЧАСТИЧНОЕ чтение (прочитал середину чата), и полное.
//
// Сопоставление чата: chatId приходит с префиксом аккаунта ('accId:realId'), а в NotificationSource
// accountId и chatId лежат раздельно (chatId БЕЗ префикса) — собираем и сравниваем.
// message id в TDLib монотонно растут в пределах чата и напрямую сравнимы с last_read_inbox_message_id.

/**
 * @param {object} item — карточка уведомления (notifItems[]) с полем source {accountId, chatId, messageId}
 * @param {string} chatId — 'accountId:realChatId' из tg:chat-unread-sync
 * @param {number|string} lastReadInboxId — last_read_inbox_message_id из updateChatReadInbox
 * @returns {boolean} true — карточку надо снять (сообщение прочитано на сервере)
 */
export function shouldDismissForRead(item, chatId, lastReadInboxId) {
  if (!item || !item.source || !chatId) return false
  if (`${item.source.accountId}:${item.source.chatId}` !== chatId) return false
  const msgId = Number(item.source.messageId)
  const lastRead = Number(lastReadInboxId)
  if (!Number.isFinite(msgId) || !Number.isFinite(lastRead) || lastRead <= 0) return false
  return msgId <= lastRead
}
