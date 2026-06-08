// v0.97.0 (Phase 1 M1.3): handler для goto_message tool.
//
// Переход к конкретному сообщению в UI. Изоморфный handler:
//   - юзер кликает «→ Перейти к чату» → dispatch('goto_message', source)
//   - AI делает tool_call goto_message → тот же handler
//
// Permission: auto (безопасно — просто UI navigation, ничего не отправляется).
//
// Контекст: ожидается context = { dispatchUI, ... } — функция которая
// переключает UI вкладку и активный чат. На uma renderer-стороне это
// делает Action Bus (App.jsx + NativeApp.jsx через prop pendingNotify).

import { gotoMessageSchema } from '../toolSchemas.js'

/**
 * Handler для goto_message.
 *
 * @param {object} source — NotificationSource паспорт сообщения
 * @param {object} _args — для совместимости (goto не имеет других args)
 * @param {object} context — { dispatchUI } (опционально)
 * @returns {Promise<{ok: boolean, result?, error?}>}
 */
export async function gotoMessageHandler(source, _args, context) {
  if (!source || !source.accountId || !source.chatId) {
    return { ok: false, error: 'invalid_source' }
  }
  if (!source.messageId) {
    return { ok: false, error: 'missing_messageId' }
  }

  // context.dispatchUI отвечает за UI navigation — если undefined,
  // handler возвращает данные но не делает действия.
  if (context?.dispatchUI && typeof context.dispatchUI === 'function') {
    try {
      await context.dispatchUI({
        type: 'goto_message',
        accountId: source.accountId,
        chatId: source.chatId,
        messageId: source.messageId,
        threadId: source.threadId || null,
      })
    } catch (e) {
      return { ok: false, error: e?.message || 'dispatchUI_failed' }
    }
  }

  return {
    ok: true,
    result: {
      navigated: true,
      target: {
        accountId: source.accountId,
        chatId: source.chatId,
        messageId: source.messageId,
      },
    },
  }
}

export const gotoMessageTool = {
  id: gotoMessageSchema.id,
  schema: gotoMessageSchema.inputSchema,
  permission: gotoMessageSchema.permission,
  description: gotoMessageSchema.description,
  category: gotoMessageSchema.category,
  revertable: gotoMessageSchema.revertable,
  handler: gotoMessageHandler,
}
