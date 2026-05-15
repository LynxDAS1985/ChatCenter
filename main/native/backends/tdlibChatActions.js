// v0.89.2 — Stage 4 / Этап 4-аудит: chat-level admin actions через TDLib.
//
// Вынесено из tdlibBackend.js (тот упёрся в лимит 500 строк после реализации
// этих трёх функций в рамках Этапа 4-аудита).
//
// Покрывает три IPC-канала которые до v0.89.2 были stub'ами:
//   - setMute       → setChatNotificationSettings (полный 16-полевой объект)
//   - togglePin     → toggleChatIsPinned (chat_list:chatListMain)
//   - getCleanupStats → getStorageStatisticsFast (сумма по аккаунтам)
//
// Документация:
//   https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1set_chat_notification_settings.html
//   https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1toggle_chat_is_pinned.html
//   https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_storage_statistics_fast.html

/**
 * Mute/unmute чат через TDLib setChatNotificationSettings.
 *
 * TDLib требует ПОЛНЫЙ chatNotificationSettings объект (16 non-nullable полей).
 * Для всех опций кроме mute_for выставляем use_default_*=true — TDLib использует
 * настройки по умолчанию (scope notification settings).
 *
 * @param {object} client — TDLib client с invoke()
 * @param {number|string} chatId — TDLib chat_id (число)
 * @param {number} muteFor — секунды от now (0 = unmute, 2147483647 ≈ «навсегда»)
 * @returns {Promise<{ ok: boolean, error?: string, code?: number }>}
 */
export async function setMute(client, chatId, muteFor) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  const seconds = Math.max(0, Number(muteFor) || 0)
  try {
    await client.invoke({
      '@type': 'setChatNotificationSettings',
      chat_id: Number(chatId),
      notification_settings: {
        '@type': 'chatNotificationSettings',
        use_default_mute_for: false,
        mute_for: seconds,
        use_default_sound: true,
        sound_id: 0,
        use_default_show_preview: true,
        show_preview: false,
        use_default_mute_stories: true,
        mute_stories: false,
        use_default_story_sound: true,
        story_sound_id: 0,
        use_default_show_story_poster: true,
        show_story_poster: false,
        use_default_disable_pinned_message_notifications: true,
        disable_pinned_message_notifications: false,
        use_default_disable_mention_notifications: true,
        disable_mention_notifications: false,
      },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || String(e), code: e?.code }
  }
}

/**
 * Закрепить/открепить чат в основном списке через TDLib toggleChatIsPinned.
 *
 * TDLib требует chat_list (REQUIRED, не nullable). Используем chatListMain —
 * UI работает только с основным списком. Архивные/папочные закрепления — отдельная
 * фича отдельного этапа.
 *
 * @param {object} client
 * @param {number|string} chatId
 * @param {boolean} isPinned
 * @returns {Promise<{ ok: boolean, error?: string, code?: number }>}
 */
export async function togglePin(client, chatId, isPinned) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  try {
    await client.invoke({
      '@type': 'toggleChatIsPinned',
      chat_list: { '@type': 'chatListMain' },
      chat_id: Number(chatId),
      is_pinned: !!isPinned,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || String(e), code: e?.code }
  }
}

/**
 * Сумма размеров файлов и БД TDLib по всем аккаунтам менеджера.
 *
 * Используем `getStorageStatisticsFast` — быстрый ответ из БД TDLib без сканирования
 * файлов (миллисекунды против секунд для полного `getStorageStatistics`).
 * Ошибка одного аккаунта не ломает остальные.
 *
 * @param {object} manager — TdlibClientManager
 * @returns {Promise<{ ok: true, bytes: number, dbBytes: number, fileCount: 0 }>}
 */
export async function getCleanupStats(manager) {
  let files_size = 0
  let database_size = 0
  for (const accountId of manager.listAccounts()) {
    const client = manager.getClient(accountId)
    if (!client?.invoke) continue
    try {
      const r = await client.invoke({ '@type': 'getStorageStatisticsFast' })
      files_size += Number(r?.files_size) || 0
      database_size += Number(r?.database_size) || 0
    } catch (_) { /* per-account fail — другие аккаунты продолжаем */ }
  }
  return { ok: true, bytes: files_size, dbBytes: database_size, fileCount: 0 }
}
