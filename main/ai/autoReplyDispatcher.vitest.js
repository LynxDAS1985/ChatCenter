// v1.1.1: тесты autoReplyDispatcher — pure functions + processNewMessage flow.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  canAutoReply,
  buildEngineMessage,
  processNewMessage,
  initAutoReplyDispatcher,
  markUserReplied,
  _resetForTests,
  _internal,
} from './autoReplyDispatcher.js'

beforeEach(() => { _resetForTests() })

// ─── canAutoReply ───────────────────────────────────────────────────────────

// ─── v1.1.3: smart cooldown (markUserReplied) ──────────────────────────────

describe('markUserReplied + smart cooldown (v1.1.3)', () => {
  it('после markUserReplied — canAutoReply возвращает user_replied_recently', () => {
    const now = Date.now()
    markUserReplied('chat_x', now)
    expect(canAutoReply('chat_x', now + 1000).reason).toBe('user_replied_recently')
  })

  it('10 минут прошло после markUserReplied → можно снова', () => {
    const now = Date.now()
    markUserReplied('chat_x', now)
    expect(canAutoReply('chat_x', now + 10 * 60 * 1000 + 1).ok).toBe(true)
  })

  it('markUserReplied не влияет на ДРУГИЕ чаты', () => {
    const now = Date.now()
    markUserReplied('chat_a', now)
    expect(canAutoReply('chat_b', now + 1000).ok).toBe(true)
  })

  it('markUserReplied с пустым chatId — silent', () => {
    expect(() => markUserReplied('', Date.now())).not.toThrow()
    expect(() => markUserReplied(null, Date.now())).not.toThrow()
  })

  it('processNewMessage с outgoing → markUserReplied вызван (для будущих incoming)', async () => {
    const rules = [{ id: 'r', enabled: true, triggers: { keywords: [], excludeOutgoing: true, schedule: { enabled: false }, excludeBots: true, excludeChannels: true }, action: { type: 'ai_reply' }, cooldownMinutes: 0 }]
    const runAgent = vi.fn().mockResolvedValue({ ok: true })
    const deps = { getRules: () => rules, runAgent }
    const now = Date.now()
    // Outgoing — markUserReplied должен сработать.
    await processNewMessage(
      { accountId: 'tg', chatId: 'chat_y', message: { id: '1', text: 'мой ответ', isOutgoing: true, senderId: 'me' } },
      deps, now,
    )
    expect(_internal._userRepliedAt.get('chat_y')).toBe(now)
    // Сразу incoming в тот же чат — должен быть skip из-за user_replied_recently
    const r = await processNewMessage(
      { accountId: 'tg', chatId: 'chat_y', message: { id: '2', text: 'нужен счёт', isOutgoing: false, senderId: 'other' } },
      deps, now + 1000,
    )
    expect(r.reason).toBe('user_replied_recently')
    expect(runAgent).not.toHaveBeenCalled()
  })
})

describe('canAutoReply', () => {
  it('первый вызов → ok:true', () => {
    expect(canAutoReply('chat1', Date.now())).toEqual({ ok: true })
  })

  it('пустой chatId → ok:false', () => {
    expect(canAutoReply(null, Date.now()).ok).toBe(false)
    expect(canAutoReply('', Date.now()).ok).toBe(false)
  })

  it('loop protection — повторный вызов в 30 сек → ok:false', () => {
    const now = Date.now()
    _internal._lastReplyByChat.set('chat1', now - 10 * 1000)  // 10 сек назад
    expect(canAutoReply('chat1', now).reason).toBe('chat_loop_protection')
  })

  it('30 секунд прошло → можно снова', () => {
    const now = Date.now()
    _internal._lastReplyByChat.set('chat1', now - 31 * 1000)  // 31 сек назад
    expect(canAutoReply('chat1', now).ok).toBe(true)
  })

  it('разные chatId не блокируют друг друга', () => {
    const now = Date.now()
    _internal._lastReplyByChat.set('chat1', now - 5 * 1000)
    expect(canAutoReply('chat2', now).ok).toBe(true)
  })

  it('global rate limit — 10 за минуту → 11-й блокирован', () => {
    const now = Date.now()
    for (let i = 0; i < 10; i++) _internal._recentReplies.push(now - i * 1000)
    expect(canAutoReply('new_chat', now).reason).toBe('global_rate_limit')
  })

  it('rate limit — старые > 60 сек чистятся', () => {
    const now = Date.now()
    // 10 старых (по 70 сек назад) и 2 свежих
    for (let i = 0; i < 10; i++) _internal._recentReplies.push(now - 70 * 1000 - i)
    _internal._recentReplies.push(now - 1000)
    _internal._recentReplies.push(now - 2000)
    expect(canAutoReply('new_chat', now).ok).toBe(true)
    // После trim — только 2 свежих остались
    expect(_internal._recentReplies.length).toBe(2)
  })
})

// ─── buildEngineMessage ─────────────────────────────────────────────────────

describe('buildEngineMessage', () => {
  it('конвертирует TDLib payload в engine-формат', () => {
    const payload = {
      accountId: 'tg_main',
      chatId: 'tg_main:-100',
      message: {
        id: '999',
        text: 'привет',
        senderId: '611696632',
        senderName: 'Иван',
        chatTitle: 'Чат',
        isOutgoing: false,
        timestamp: 1715000000,
      },
    }
    const m = buildEngineMessage(payload)
    expect(m.text).toBe('привет')
    expect(m.chatId).toBe('tg_main:-100')
    expect(m.messengerId).toBe('native_cc')
    expect(m.senderId).toBe('611696632')
    expect(m.isOutgoing).toBe(false)
    expect(m.chatType).toBe('private')  // default fallback
    expect(m.messageId).toBe('999')
  })

  it('пустой payload → null', () => {
    expect(buildEngineMessage(null)).toBe(null)
    expect(buildEngineMessage({})).toBe(null)
  })

  it('isOutgoing=true сохраняется', () => {
    const m = buildEngineMessage({ chatId: 'x', message: { isOutgoing: true } })
    expect(m.isOutgoing).toBe(true)
  })
})

// ─── processNewMessage ──────────────────────────────────────────────────────

describe('processNewMessage', () => {
  const NOW = Date.now()

  function basePayload(overrides = {}) {
    return {
      accountId: 'tg_main',
      chatId: 'tg_main:-100',
      message: {
        id: '999', text: 'нужен счёт',
        senderId: '611696632', senderName: 'Иван',
        chatTitle: 'БНК', isOutgoing: false,
        timestamp: NOW,
      },
      ...overrides,
    }
  }

  function makeRule(over = {}) {
    return {
      id: 'r1', name: 'X', enabled: true,
      triggers: {
        chatIds: [], messengerIds: [], senderIds: [],
        keywords: ['счёт'], keywordsMode: 'any',
        schedule: { enabled: false, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' },
        excludeBots: true, excludeChannels: true, excludeOutgoing: true,
      },
      action: { type: 'ai_reply', aiPromptHint: 'Скажи что в работе' },
      cooldownMinutes: 60,
      matchedCount: 0,
      lastMatchedAt: null,
      ...over,
    }
  }

  it('нет deps → no_deps', async () => {
    const r = await processNewMessage(basePayload(), null, NOW)
    expect(r.reason).toBe('no_deps')
  })

  // v1.1.2: master switch
  it('master switch выключен → reason:master_disabled (rules даже не читаются)', async () => {
    const getRules = vi.fn().mockReturnValue([makeRule()])
    const deps = { getRules, runAgent: vi.fn(), isMasterEnabled: () => false }
    const r = await processNewMessage(basePayload(), deps, NOW)
    expect(r.reason).toBe('master_disabled')
    expect(r.fired).toBe(0)
    expect(getRules).not.toHaveBeenCalled()  // rules даже не запрошены
  })

  it('master switch включен или не задан → нормальный flow', async () => {
    const rules = [makeRule()]
    const runAgent = vi.fn().mockResolvedValue({ ok: true })
    const deps = { getRules: () => rules, runAgent, isMasterEnabled: () => true }
    const r = await processNewMessage(basePayload(), deps, NOW)
    expect(r.fired).toBe(1)
  })

  it('outgoing → reason:outgoing (защита #1, без вызова rules)', async () => {
    const getRules = vi.fn().mockReturnValue([makeRule()])
    const deps = { getRules, runAgent: vi.fn() }
    const r = await processNewMessage(basePayload({ message: { isOutgoing: true, text: 'счёт', id: '1' } }), deps, NOW)
    expect(r.reason).toBe('outgoing')
    expect(getRules).not.toHaveBeenCalled()
  })

  it('нет rules → no_rules', async () => {
    const deps = { getRules: () => [], runAgent: vi.fn() }
    const r = await processNewMessage(basePayload(), deps, NOW)
    expect(r.reason).toBe('no_rules')
  })

  it('rules есть но не matched → no_match', async () => {
    const rules = [makeRule({ triggers: { ...makeRule().triggers, keywords: ['invoice'] } })]
    const deps = { getRules: () => rules, runAgent: vi.fn() }
    const r = await processNewMessage(basePayload({ message: { text: 'нужен счёт', id: '1' } }), deps, NOW)
    expect(r.reason).toBe('no_match')
  })

  it('match + action=ai_reply → runAgent вызван с actor=ai_auto/autoConfirm', async () => {
    const rules = [makeRule()]
    const runAgent = vi.fn().mockResolvedValue({ ok: true, finalAnswer: 'sent' })
    const markMatched = vi.fn()
    const deps = { getRules: () => rules, runAgent, markMatched }
    const r = await processNewMessage(basePayload(), deps, NOW)
    expect(r.fired).toBe(1)
    expect(r.action).toBe('ai_reply')
    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'ai_auto',
      autoConfirm: true,
      source: expect.objectContaining({ chatId: 'tg_main:-100', messageId: '999' }),
    }))
    expect(markMatched).toHaveBeenCalledWith('r1')
  })

  it('initialMessages включает aiPromptHint', async () => {
    const rules = [makeRule()]  // hint='Скажи что в работе'
    const runAgent = vi.fn().mockResolvedValue({ ok: true })
    const deps = { getRules: () => rules, runAgent }
    await processNewMessage(basePayload(), deps, NOW)
    const args = runAgent.mock.calls[0][0]
    expect(args.initialMessages[0].content).toContain('Скажи что в работе')
  })

  it('match + action=mark_read → handlerContext.markAsRead вызван (без AI)', async () => {
    const rules = [makeRule({ action: { type: 'mark_read' } })]
    const markAsRead = vi.fn().mockResolvedValue({ ok: true })
    const markMatched = vi.fn()
    const runAgent = vi.fn()
    const deps = {
      getRules: () => rules,
      handlerContext: { markAsRead },
      runAgent,
      markMatched,
    }
    const r = await processNewMessage(basePayload(), deps, NOW)
    expect(r.fired).toBe(1)
    expect(r.action).toBe('mark_read')
    expect(markAsRead).toHaveBeenCalledWith({
      accountId: 'tg_main', chatId: 'tg_main:-100', upToMessageId: '999',
    })
    expect(runAgent).not.toHaveBeenCalled()
    expect(markMatched).toHaveBeenCalledWith('r1')
  })

  it('loop protection — второй раз в тот же чат → skip', async () => {
    const rules = [makeRule()]
    const runAgent = vi.fn().mockResolvedValue({ ok: true })
    const deps = { getRules: () => rules, runAgent }
    await processNewMessage(basePayload(), deps, NOW)
    expect(runAgent).toHaveBeenCalledTimes(1)
    // Второй сразу — должен быть skip из-за loop protection
    const r2 = await processNewMessage(basePayload({ message: { id: '1000', text: 'счёт', isOutgoing: false } }), deps, NOW + 100)
    expect(r2.fired).toBe(0)
    expect(r2.reason).toBe('chat_loop_protection')
    expect(runAgent).toHaveBeenCalledTimes(1)  // не вызвался повторно
  })

  it('runAgent throws → возвращает error без crash', async () => {
    const rules = [makeRule()]
    const runAgent = vi.fn().mockRejectedValue(new Error('boom'))
    const deps = { getRules: () => rules, runAgent }
    const r = await processNewMessage(basePayload(), deps, NOW)
    expect(r.fired).toBe(0)
    expect(r.error).toBe('boom')
  })

  it('mark_read но handlerContext.markAsRead missing → reason:no_markAsRead', async () => {
    const rules = [makeRule({ action: { type: 'mark_read' } })]
    const deps = { getRules: () => rules, handlerContext: {}, runAgent: vi.fn() }
    const r = await processNewMessage(basePayload(), deps, NOW)
    expect(r.fired).toBe(0)
    expect(r.reason).toBe('no_markAsRead')
  })

  it('после ai_reply — markMatched зовётся', async () => {
    const rules = [makeRule()]
    const runAgent = vi.fn().mockResolvedValue({ ok: true })
    const markMatched = vi.fn()
    const deps = { getRules: () => rules, runAgent, markMatched }
    await processNewMessage(basePayload(), deps, NOW)
    expect(markMatched).toHaveBeenCalledWith('r1')
  })

  // v1.1.2: audit log integration
  it('audit entry пишется для mark_read auto-action', async () => {
    const rules = [makeRule({ action: { type: 'mark_read' } })]
    const markAsRead = vi.fn().mockResolvedValue({ ok: true })
    const appendAudit = vi.fn()
    const deps = {
      getRules: () => rules,
      handlerContext: { markAsRead },
      runAgent: vi.fn(),
      appendAudit,
    }
    await processNewMessage(basePayload(), deps, NOW)
    expect(appendAudit).toHaveBeenCalledTimes(1)
    expect(appendAudit).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'ai_auto',
      actionId: 'mark_as_read',
      ruleId: 'r1',
      ruleName: 'X',
      executionResult: 'ok',
    }))
  })

  it('audit entries пишутся для ai_reply (per-tool + summary)', async () => {
    const rules = [makeRule()]
    const runAgent = vi.fn().mockResolvedValue({
      ok: true,
      iterations: 2,
      audit: [
        { name: 'get_chat_history', result: { ok: true } },
        { name: 'reply_to_message', result: { ok: true, id: '500' }, permissionResult: 'auto_confirmed' },
      ],
    })
    const appendAudit = vi.fn()
    const deps = { getRules: () => rules, runAgent, appendAudit }
    await processNewMessage(basePayload(), deps, NOW)
    // 2 per-tool + 1 summary = 3
    expect(appendAudit).toHaveBeenCalledTimes(3)
    const calls = appendAudit.mock.calls.map(c => c[0])
    expect(calls[0].actionId).toBe('get_chat_history')
    expect(calls[1].actionId).toBe('reply_to_message')
    expect(calls[2].actionId).toBe('ai_reply_summary')
    expect(calls[2].iterations).toBe(2)
    // Все ai_auto
    expect(calls.every(c => c.actor === 'ai_auto')).toBe(true)
  })

  it('audit ошибки в ai_reply → summary с error', async () => {
    const rules = [makeRule()]
    const runAgent = vi.fn().mockResolvedValue({ ok: false, error: 'no_active_provider', audit: [] })
    const appendAudit = vi.fn()
    const deps = { getRules: () => rules, runAgent, appendAudit }
    await processNewMessage(basePayload(), deps, NOW)
    const summary = appendAudit.mock.calls.find(c => c[0].actionId === 'ai_reply_summary')
    expect(summary).toBeTruthy()
    expect(summary[0].executionResult).toBe('error')
    expect(summary[0].errorMessage).toBe('no_active_provider')
  })

  it('audit не падает если appendAudit throws', async () => {
    const rules = [makeRule({ action: { type: 'mark_read' } })]
    const markAsRead = vi.fn().mockResolvedValue({ ok: true })
    const appendAudit = vi.fn(() => { throw new Error('disk full') })
    const deps = { getRules: () => rules, handlerContext: { markAsRead }, runAgent: vi.fn(), appendAudit }
    const r = await processNewMessage(basePayload(), deps, NOW)
    expect(r.fired).toBe(1)  // mark_read всё равно сработал
  })

  it('appendAudit не задан → no-op (тесты без audit)', async () => {
    const rules = [makeRule({ action: { type: 'mark_read' } })]
    const markAsRead = vi.fn().mockResolvedValue({ ok: true })
    const deps = { getRules: () => rules, handlerContext: { markAsRead }, runAgent: vi.fn() }
    const r = await processNewMessage(basePayload(), deps, NOW)
    expect(r.fired).toBe(1)
  })
})

// ─── initAutoReplyDispatcher ───────────────────────────────────────────────

describe('initAutoReplyDispatcher', () => {
  it('manager отсутствует → ok:false', () => {
    const r = initAutoReplyDispatcher({})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('manager_required')
  })

  it('подписывается на manager.on("message:new")', () => {
    const handlers = {}
    const manager = {
      on: (event, fn) => { handlers[event] = fn },
      off: (event) => { delete handlers[event] },
    }
    const r = initAutoReplyDispatcher({ manager, getRules: () => [] })
    expect(r.ok).toBe(true)
    expect(handlers['message:new']).toBeDefined()
    // unsubscribe работает
    r.unsubscribe()
    expect(handlers['message:new']).toBeUndefined()
  })

  it('обработчик не падает при throw', async () => {
    const handlers = {}
    const manager = { on: (e, fn) => { handlers[e] = fn } }
    const log = vi.fn()
    initAutoReplyDispatcher({
      manager,
      getRules: () => { throw new Error('rules broke') },
      log,
    })
    // Эмуляция события — handler async (try/catch внутри)
    await handlers['message:new']({ chatId: 'x', message: { text: 'x', isOutgoing: false } })
    expect(log).toHaveBeenCalledWith('error', expect.stringContaining('processNewMessage threw'))
  })
})
