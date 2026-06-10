// v1.1.0 (Phase 4.3): Auto-reply rules store — renderer side.
//
// Правило = триггеры (where + when + what) + action (что AI должен сделать).
// Persistent в `userData/auto-reply-rules.json`. Создаётся юзером в UI Settings.
//
// Триггеры (все должны matchиться, AND):
//   - chatIds: ['tg_main:-100', ...]   — конкретные чаты (если пусто — любой)
//   - messengerIds: ['native_cc']      — типы мессенджеров (если пусто — native_*)
//   - senderIds: ['611696632']         — конкретные отправители (если пусто — любой)
//   - keywords: ['счёт', 'invoice']    — match по тексту входящего (если пусто — любой текст)
//   - keywordsMode: 'any' | 'all'      — OR / AND для keywords
//   - schedule.enabled: bool           — проверять расписание (рабочее время)
//   - schedule.days: [1..7]            — дни недели (1=Пн, 7=Вс)
//   - schedule.from: 'HH:MM'           — начало интервала
//   - schedule.to: 'HH:MM'             — конец интервала
//   - excludeBots: bool                — не отвечать ботам (senderId < 0 в TG)
//   - excludeChannels: bool            — не отвечать в каналах
//   - excludeOutgoing: bool            — не отвечать на свои сообщения (default true)
//
// Action:
//   - type: 'ai_reply' | 'mark_read'   — что делать
//   - aiPromptHint: string             — подсказка для AI (контекст ответа)
//
// Защита от петель:
//   - cooldownMinutes: number          — между срабатываниями для одного чата

const NAME_MAX = 100
const HINT_MAX = 500
const KEYWORDS_MAX = 50

function generateId() {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Создать запись правила (валидация + defaults).
 */
export function createRuleRecord(params) {
  const p = params || {}
  const t = p.triggers || {}
  const a = p.action || {}
  return {
    id: p.id || generateId(),
    name: (p.name || '').slice(0, NAME_MAX) || 'Правило без названия',
    enabled: p.enabled !== false,  // default true
    triggers: {
      chatIds: Array.isArray(t.chatIds) ? t.chatIds.map(String).slice(0, 100) : [],
      messengerIds: Array.isArray(t.messengerIds) ? t.messengerIds.slice(0, 20) : [],
      senderIds: Array.isArray(t.senderIds) ? t.senderIds.map(String).slice(0, 100) : [],
      keywords: Array.isArray(t.keywords)
        ? t.keywords.filter(k => typeof k === 'string' && k.length > 0).slice(0, KEYWORDS_MAX)
        : [],
      keywordsMode: t.keywordsMode === 'all' ? 'all' : 'any',
      schedule: t.schedule && typeof t.schedule === 'object'
        ? {
            enabled: !!t.schedule.enabled,
            days: Array.isArray(t.schedule.days) ? t.schedule.days.filter(d => d >= 1 && d <= 7) : [1, 2, 3, 4, 5],
            from: typeof t.schedule.from === 'string' ? t.schedule.from : '09:00',
            to: typeof t.schedule.to === 'string' ? t.schedule.to : '18:00',
          }
        : { enabled: false, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' },
      excludeBots: t.excludeBots !== false,        // default true
      excludeChannels: t.excludeChannels !== false, // default true
      excludeOutgoing: t.excludeOutgoing !== false, // default true
    },
    action: {
      type: ['ai_reply', 'mark_read'].includes(a.type) ? a.type : 'ai_reply',
      aiPromptHint: (a.aiPromptHint || '').slice(0, HINT_MAX),
    },
    cooldownMinutes: typeof p.cooldownMinutes === 'number' && p.cooldownMinutes > 0
      ? Math.min(p.cooldownMinutes, 24 * 60)
      : 60,
    matchedCount: typeof p.matchedCount === 'number' ? p.matchedCount : 0,
    lastMatchedAt: p.lastMatchedAt || null,
    createdAt: p.createdAt || Date.now(),
    updatedAt: p.updatedAt || Date.now(),
  }
}

export async function createRule(params) {
  if (!globalThis.window?.api?.invoke) return { ok: false, error: 'no_ipc' }
  try {
    const rule = createRuleRecord(params)
    return await globalThis.window.api.invoke('auto-reply:create', rule)
  } catch (e) {
    return { ok: false, error: e?.message }
  }
}

export async function listRules() {
  if (!globalThis.window?.api?.invoke) return { ok: false, rules: [] }
  try {
    return await globalThis.window.api.invoke('auto-reply:list')
  } catch (e) {
    return { ok: false, error: e?.message, rules: [] }
  }
}

export async function updateRule(ruleId, updates) {
  if (!globalThis.window?.api?.invoke) return { ok: false, error: 'no_ipc' }
  try {
    return await globalThis.window.api.invoke('auto-reply:update', { ruleId, updates })
  } catch (e) {
    return { ok: false, error: e?.message }
  }
}

export async function deleteRule(ruleId) {
  if (!globalThis.window?.api?.invoke) return { ok: false, error: 'no_ipc' }
  try {
    return await globalThis.window.api.invoke('auto-reply:delete', { ruleId })
  } catch (e) {
    return { ok: false, error: e?.message }
  }
}

export async function toggleRule(ruleId, enabled) {
  return updateRule(ruleId, { enabled: !!enabled })
}

export const _internal = { NAME_MAX, HINT_MAX, KEYWORDS_MAX, generateId }
