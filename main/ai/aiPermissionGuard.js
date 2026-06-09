// v0.98.0 (Phase 2 M2.1): Permission Guard — централизованная проверка permission tiers
// для tool calls от AI.
//
// 3 уровня доступа (см. .memory-bank/ai-agent-plan/permissions.md):
//   - 🟢 auto    — выполняется сразу (read-only / навигация)
//   - 🟡 confirm — требует UI подтверждения юзера (write / mark-read / create-task)
//   - 🔴 deny    — запрещено для AI (delete / leave / change settings)
//
// Юзер может настраивать tier per-tool в Settings → AI Permissions. НО есть
// HARDCODED действия которые юзер НЕ МОЖЕТ ослабить:
//   - reply_to_message / send_message → confirm fixed (нельзя auto)
//   - delete_message / leave_chat / etc → deny fixed (нельзя allow)
//
// См. tools-catalog.md для полного списка tools.

/**
 * HARDCODED tier overrides — юзер НЕ может изменить эти.
 * Защита от ошибочной настройки permission.
 */
const HARDCODED_CONFIRM_TOOLS = new Set([
  'reply_to_message',
  'send_message',
])

const HARDCODED_DENY_TOOLS = new Set([
  'delete_message',
  'leave_chat',
  'block_user',
  'clear_chat_history',
  'change_settings',
  'set_api_key',
  'export_data',
])

/**
 * Default permission tiers (если tool.permission не указан).
 */
const DEFAULT_PERMISSIONS = {
  // Navigation — auto
  goto_message: 'auto',
  switch_chat: 'auto',

  // Reading — auto
  get_chat_history: 'auto',
  search_messages: 'auto',
  summarize_chat: 'auto',
  list_tasks: 'auto',
  get_user_info: 'auto',

  // Marking — confirm (можно настроить auto)
  mark_as_read: 'confirm',
  mark_as_unread: 'confirm',

  // Writing — confirm HARDCODED
  reply_to_message: 'confirm',
  send_message: 'confirm',

  // Tasks / Reminders — confirm
  create_task: 'confirm',
  complete_task: 'confirm',
  schedule_reminder: 'confirm',
  cancel_reminder: 'confirm',

  // System — confirm
  set_status: 'confirm',

  // Deny HARDCODED
  delete_message: 'deny',
  leave_chat: 'deny',
  block_user: 'deny',
  clear_chat_history: 'deny',
  change_settings: 'deny',
  set_api_key: 'deny',
  export_data: 'deny',
}

/**
 * Проверить permission для tool call.
 *
 * @param {string} toolId — название tool (например 'reply_to_message')
 * @param {object} source — NotificationSource паспорт
 * @param {object} _args — аргументы tool call (для будущих per-args проверок)
 * @param {object} userSettings — настройки юзера (aiPermissions override)
 * @returns {{ allowed: boolean, requiresConfirm: boolean, tier: string, reason?: string }}
 */
export function checkPermission(toolId, source, _args, userSettings) {
  // 1. Hardcoded deny — нельзя обойти
  if (HARDCODED_DENY_TOOLS.has(toolId)) {
    return {
      allowed: false,
      requiresConfirm: false,
      tier: 'deny',
      reason: 'hardcoded_deny',
    }
  }

  // 2. Scope check: AI работает только с messengerId='native_*'
  // (см. .memory-bank/ai-agent-plan/overview.md)
  if (source && typeof source.messengerId === 'string') {
    if (!source.messengerId.startsWith('native_')) {
      return {
        allowed: false,
        requiresConfirm: false,
        tier: 'deny',
        reason: 'webview_messenger_not_supported',
      }
    }
  }

  // 3. Hardcoded confirm — юзер НЕ может перевести в auto
  if (HARDCODED_CONFIRM_TOOLS.has(toolId)) {
    return {
      allowed: true,
      requiresConfirm: true,
      tier: 'confirm',
      reason: 'hardcoded_confirm',
    }
  }

  // 4. User override (если задан и tool не hardcoded)
  const userOverrides = userSettings?.aiPermissions?.overrides || {}
  if (userOverrides[toolId]) {
    const tier = userOverrides[toolId]
    if (tier === 'deny') {
      return { allowed: false, requiresConfirm: false, tier: 'deny', reason: 'user_deny' }
    }
    if (tier === 'auto' || tier === 'confirm') {
      return {
        allowed: true,
        requiresConfirm: tier === 'confirm',
        tier,
        reason: 'user_override',
      }
    }
    // Невалидный override → fallback to default
  }

  // 5. Default permission для известных tools
  const defaultTier = DEFAULT_PERMISSIONS[toolId]
  if (defaultTier) {
    return {
      allowed: defaultTier !== 'deny',
      requiresConfirm: defaultTier === 'confirm',
      tier: defaultTier,
    }
  }

  // 6. Unknown tool → safe default = deny
  return {
    allowed: false,
    requiresConfirm: false,
    tier: 'deny',
    reason: 'unknown_tool',
  }
}

/**
 * Получить permission tier для tool (для UI hint, без выполнения).
 *
 * @param {string} toolId
 * @param {object} userSettings
 * @returns {string} 'auto' | 'confirm' | 'deny'
 */
export function getPermissionTier(toolId, userSettings) {
  if (HARDCODED_DENY_TOOLS.has(toolId)) return 'deny'
  if (HARDCODED_CONFIRM_TOOLS.has(toolId)) return 'confirm'
  const userOverride = userSettings?.aiPermissions?.overrides?.[toolId]
  if (userOverride === 'auto' || userOverride === 'confirm' || userOverride === 'deny') {
    return userOverride
  }
  return DEFAULT_PERMISSIONS[toolId] || 'deny'
}

/**
 * Проверить можно ли вообще пользователю изменить tier для tool.
 *
 * @param {string} toolId
 * @returns {boolean}
 */
export function isUserCustomizable(toolId) {
  return !HARDCODED_DENY_TOOLS.has(toolId) && !HARDCODED_CONFIRM_TOOLS.has(toolId)
}

// Для тестов / введения новых tools — runtime registration permission.
// Используется sparingly.
export const _internal = {
  HARDCODED_CONFIRM_TOOLS,
  HARDCODED_DENY_TOOLS,
  DEFAULT_PERMISSIONS,
}
