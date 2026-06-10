// v1.1.1 (Phase 4.3 integration): диспетчер auto-reply правил.
//
// Подписывается на manager.on('message:new') (TDLib). Для каждого нового
// сообщения:
//   1. Получает rules через getCachedRules() (синхронно из кэша).
//   2. Создаёт engine-формат message + NotificationSource.
//   3. findMatchingRules → массив сработавших.
//   4. Берёт ПЕРВОЕ matched rule (если несколько — конфликт правил, лог).
//   5. По action:
//      - 'mark_read' → context.markAsRead напрямую (без AI).
//      - 'ai_reply' → runAgentLoop с actor='ai_auto' + autoConfirm=true +
//        initialMessages включают rule.action.aiPromptHint.
//   6. markRuleMatched(rule.id) → обновляет matchedCount/lastMatchedAt.
//   7. Loop protection: in-memory кэш chatId → lastAutoReplyAt + global
//      rate limit (max N за минуту).
//
// Безопасность:
//   - excludeOutgoing в engine — не отвечать на свои.
//   - cooldownMinutes в engine — между срабатываниями того же rule.
//   - loop protection в dispatcher — между ЛЮБЫМИ ai_reply для того же чата
//     (отдельный кэш — даже если 5 правил matchatся, ответит одно за 30 сек).
//   - global rate limit — max 10 ai_reply per минуту.

import { findMatchingRules, describeRuleMatch } from './autoReplyEngine.js'

const LOOP_PROTECTION_MS = 30 * 1000     // 30 секунд между ai_reply для того же chatId
const GLOBAL_RATE_LIMIT_PER_MIN = 10     // max ai_reply per минуту глобально
const RATE_LIMIT_WINDOW_MS = 60 * 1000
// v1.1.3: smart cooldown — после ответа юзера AI молчит N минут в этом чате.
const USER_REPLY_COOLDOWN_MS = 10 * 60 * 1000  // 10 минут

let _deps = null
const _lastReplyByChat = new Map()  // chatId → ts (последний ai_reply)
const _recentReplies = []           // массив ts всех ai_reply за последнюю минуту
// v1.1.3: chatId → ts последнего OUTGOING сообщения (юзер сам отправил).
const _userRepliedAt = new Map()

function trimRateLimit(now) {
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  while (_recentReplies.length > 0 && _recentReplies[0] < cutoff) {
    _recentReplies.shift()
  }
}

/**
 * Проверить — можно ли auto-reply для этого chatId прямо сейчас.
 * Учитывает loop protection (per chat) + global rate limit + smart cooldown (юзер сам ответил).
 * @returns {{ok: boolean, reason?: string}}
 */
export function canAutoReply(chatId, now) {
  if (!chatId) return { ok: false, reason: 'no_chatId' }
  trimRateLimit(now)
  if (_recentReplies.length >= GLOBAL_RATE_LIMIT_PER_MIN) {
    return { ok: false, reason: 'global_rate_limit' }
  }
  const lastTs = _lastReplyByChat.get(chatId)
  if (lastTs && (now - lastTs) < LOOP_PROTECTION_MS) {
    return { ok: false, reason: 'chat_loop_protection' }
  }
  // v1.1.3: smart cooldown — если юзер сам отвечал в этом чате за последние 10 мин,
  // AI не должен дублировать его ответ. Без этого: AI 8 сек думает, а юзер
  // за 2 сек написал — AI отвечает повторно поверх юзера.
  const userTs = _userRepliedAt.get(chatId)
  if (userTs && (now - userTs) < USER_REPLY_COOLDOWN_MS) {
    return { ok: false, reason: 'user_replied_recently' }
  }
  return { ok: true }
}

/**
 * v1.1.3: пометить chatId как «юзер только что ответил» — для smart cooldown.
 * Вызывается из manager.on('message:new') когда payload.message.isOutgoing=true.
 */
export function markUserReplied(chatId, now) {
  if (!chatId) return
  _userRepliedAt.set(chatId, now)
}

/**
 * Конвертация TDLib message + accountId в engine-формат + NotificationSource.
 */
export function buildEngineMessage(payload) {
  if (!payload || !payload.message) return null
  const m = payload.message
  // Native chatType detection (упрощённо)
  // m.isOutgoing / m.senderId / m.text — приходят уже из mapMessage
  return {
    text: m.text || '',
    chatId: payload.chatId,
    messengerId: 'native_cc',  // TDLib emit'тит только native_cc
    senderId: m.senderId ? String(m.senderId) : '',
    isOutgoing: !!m.isOutgoing,
    chatType: m.chatType || 'private',  // mapMessage может не выставлять — fallback
    timestamp: (m.timestamp || Date.now()),
    messageId: m.id ? String(m.id) : null,
    chatTitle: m.chatTitle || '',
    senderName: m.senderName || '',
  }
}

/**
 * Инициализация: подписаться на manager.on('message:new') и обрабатывать.
 *
 * @param {object} deps
 *   - manager: TDLib manager (with .on)
 *   - getRules: () => array — getCachedRules()
 *   - markMatched: (ruleId) => void — markRuleMatched()
 *   - runAgent: async (params) => result — обёртка над runAgentLoop с
 *     уже подставленными registry/callProvider/handlerContext.
 *   - handlerContext: для прямого вызова markAsRead.
 *   - log: function — для диагностики.
 */
export function initAutoReplyDispatcher(deps) {
  if (!deps?.manager?.on) {
    return { ok: false, error: 'manager_required', unsubscribe: () => {} }
  }
  _deps = deps

  const onMessageNew = async (payload) => {
    try { await processNewMessage(payload) }
    catch (e) {
      try { _deps?.log?.('error', `[auto-reply] processNewMessage threw: ${e?.message}`) } catch (_) {}
    }
  }
  deps.manager.on('message:new', onMessageNew)

  return {
    ok: true,
    unsubscribe: () => {
      try { deps.manager.off?.('message:new', onMessageNew) } catch (_) {}
    },
  }
}

/**
 * Обработка одного сообщения. Экспортирован для тестов.
 */
export async function processNewMessage(payload, deps = _deps, now = Date.now()) {
  if (!deps) return { matched: 0, fired: 0, reason: 'no_deps' }

  // v1.1.2: master switch — глобальный kill-switch. Проверяется ПЕРВЫМ
  // (до загрузки сообщения и rules) — экономит работу + чётко видно
  // в логах что причина "master_disabled".
  if (typeof deps.isMasterEnabled === 'function' && !deps.isMasterEnabled()) {
    return { matched: 0, fired: 0, reason: 'master_disabled' }
  }

  const msg = buildEngineMessage(payload)
  if (!msg) return { matched: 0, fired: 0, reason: 'invalid_payload' }

  // v1.1.3: outgoing → помечаем для smart cooldown + рано выходим.
  // excludeOutgoing в engine matchRule всё равно бы отсёк, но здесь мы ДО
  // того + регистрируем факт что юзер ответил (нужно для следующих incoming).
  if (msg.isOutgoing) {
    markUserReplied(msg.chatId, now)
    return { matched: 0, fired: 0, reason: 'outgoing' }
  }

  // Получаем rules
  const rules = typeof deps.getRules === 'function' ? deps.getRules() : []
  if (!Array.isArray(rules) || rules.length === 0) {
    return { matched: 0, fired: 0, reason: 'no_rules' }
  }

  // Защита #2 — engine matchRule (enabled + триггеры + cooldown rule.cooldownMinutes)
  const matched = findMatchingRules(rules, msg, now)
  if (matched.length === 0) {
    return { matched: 0, fired: 0, reason: 'no_match' }
  }

  // Защита #3 — loop protection + rate limit
  const guard = canAutoReply(msg.chatId, now)
  if (!guard.ok) {
    try { deps.log?.('info', `[auto-reply] skip ${msg.chatId}: ${guard.reason}`) } catch (_) {}
    return { matched: matched.length, fired: 0, reason: guard.reason }
  }

  // Берём ПЕРВОЕ matched rule. Если хочешь fan-out на все matched —
  // здесь нужна отдельная логика (приоритет правил).
  const rule = matched[0]
  const desc = describeRuleMatch(rule, msg)
  try { deps.log?.('info', `[auto-reply] fire ruleId=${rule.id} chatId=${msg.chatId}`) } catch (_) {}

  // Записываем в кэш loop protection (даже до execute — защита от parallel emit).
  _lastReplyByChat.set(msg.chatId, now)
  _recentReplies.push(now)

  // Готовим NotificationSource — engine-msg уже содержит нужные поля.
  const source = {
    messengerId: msg.messengerId,
    accountId: payload.accountId,
    chatId: msg.chatId,
    messageId: msg.messageId,
    senderId: msg.senderId,
    chatTitle: msg.chatTitle,
    senderName: msg.senderName,
    isOutgoing: false,
    timestamp: msg.timestamp,
  }

  // Action: mark_read — простой прямой вызов без AI.
  if (rule.action?.type === 'mark_read') {
    if (typeof deps.handlerContext?.markAsRead !== 'function') {
      return { matched: matched.length, fired: 0, reason: 'no_markAsRead' }
    }
    const t0 = now
    try {
      const r = await deps.handlerContext.markAsRead({
        accountId: payload.accountId,
        chatId: msg.chatId,
        upToMessageId: msg.messageId,
      })
      if (typeof deps.markMatched === 'function') deps.markMatched(rule.id)
      // v1.1.2: audit entry для auto-mark_read.
      writeAudit(deps, {
        actor: 'ai_auto',
        actionId: 'mark_as_read',
        ruleId: rule.id,
        ruleName: rule.name,
        source,
        executionResult: r?.ok ? 'ok' : 'error',
        errorMessage: r?.error,
        durationMs: Date.now() - t0,
      })
      return { matched: matched.length, fired: 1, action: 'mark_read', ruleId: rule.id, result: r, ...desc }
    } catch (e) {
      writeAudit(deps, {
        actor: 'ai_auto', actionId: 'mark_as_read',
        ruleId: rule.id, ruleName: rule.name, source,
        executionResult: 'error', errorMessage: e?.message,
      })
      return { matched: matched.length, fired: 0, error: e?.message }
    }
  }

  // Action: ai_reply — запускаем runAgentLoop с auto-confirm.
  if (rule.action?.type === 'ai_reply') {
    if (typeof deps.runAgent !== 'function') {
      return { matched: matched.length, fired: 0, reason: 'no_runAgent' }
    }
    const hint = rule.action?.aiPromptHint || ''
    const userPrompt = hint
      ? `Юзер настроил правило автоответа для этого чата. Подсказка: "${hint}".\nОтветь клиенту по контексту переписки и подсказке. Используй reply_to_message tool.`
      : 'Юзер настроил auto-reply правило для этого чата. Ответь клиенту по контексту переписки. Используй reply_to_message tool.'
    const t0 = now
    try {
      const r = await deps.runAgent({
        source,
        actor: 'ai_auto',
        autoConfirm: true,
        initialMessages: [{ role: 'user', content: userPrompt }],
      })
      if (typeof deps.markMatched === 'function') deps.markMatched(rule.id)
      // v1.1.2: audit для каждого tool из runAgent.audit + summary entry.
      if (Array.isArray(r?.audit)) {
        for (const entry of r.audit) {
          writeAudit(deps, {
            actor: 'ai_auto',
            actionId: entry.name,
            ruleId: rule.id,
            ruleName: rule.name,
            source,
            executionResult: entry.result?.ok ? 'ok' : (entry.permissionResult || 'error'),
            errorMessage: entry.result?.error,
            output: entry.result,
          })
        }
      }
      writeAudit(deps, {
        actor: 'ai_auto', actionId: 'ai_reply_summary',
        ruleId: rule.id, ruleName: rule.name, source,
        executionResult: r?.ok ? 'ok' : 'error',
        errorMessage: r?.error,
        durationMs: Date.now() - t0,
        iterations: r?.iterations,
      })
      return { matched: matched.length, fired: 1, action: 'ai_reply', ruleId: rule.id, result: r, ...desc }
    } catch (e) {
      writeAudit(deps, {
        actor: 'ai_auto', actionId: 'ai_reply_summary',
        ruleId: rule.id, ruleName: rule.name, source,
        executionResult: 'error', errorMessage: e?.message,
      })
      return { matched: matched.length, fired: 0, error: e?.message }
    }
  }

  return { matched: matched.length, fired: 0, reason: 'unknown_action' }
}

// v1.1.2: запись audit entry. Использует deps.appendAudit если задан,
// иначе molчаливо пропускает (тесты без audit).
function writeAudit(deps, partial) {
  if (typeof deps?.appendAudit !== 'function') return
  try {
    deps.appendAudit({
      id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
      ...partial,
    })
  } catch (_) { /* never block dispatcher on audit failure */ }
}

/**
 * Для тестов — сбросить in-memory кэши.
 */
export function _resetForTests() {
  _lastReplyByChat.clear()
  _recentReplies.length = 0
  _userRepliedAt.clear()
}

export const _internal = {
  LOOP_PROTECTION_MS,
  GLOBAL_RATE_LIMIT_PER_MIN,
  RATE_LIMIT_WINDOW_MS,
  USER_REPLY_COOLDOWN_MS,
  _lastReplyByChat,
  _recentReplies,
  _userRepliedAt,
}
