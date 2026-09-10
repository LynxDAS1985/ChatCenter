// v0.98.0 (Phase 2 M2.1): тесты Permission Guard.

import { describe, it, expect } from 'vitest'
import {
  checkPermission,
  getPermissionTier,
  isUserCustomizable,
} from './aiPermissionGuard.js'
import { createNotificationSource } from '../../shared/notificationSource.js'

const SOURCE_NATIVE = createNotificationSource({
  messengerId: 'native_cc',
  accountId: 'tg_1',
  chatId: '-100',
  messageId: '1',
})

const SOURCE_WEBVIEW = {
  messengerId: 'webview-telegram',
  accountId: 'wv_1',
  chatId: 'wv_chat',
  messageId: 'wv_msg',
}

describe('checkPermission — read-only tools (auto)', () => {
  it('goto_message → auto, allowed без confirm', () => {
    const r = checkPermission('goto_message', SOURCE_NATIVE, {}, {})
    expect(r.allowed).toBe(true)
    expect(r.requiresConfirm).toBe(false)
    expect(r.tier).toBe('auto')
  })

  it('get_chat_history → auto', () => {
    const r = checkPermission('get_chat_history', SOURCE_NATIVE, {}, {})
    expect(r.tier).toBe('auto')
    expect(r.allowed).toBe(true)
  })

  it('search_messages → auto', () => {
    const r = checkPermission('search_messages', SOURCE_NATIVE, {}, {})
    expect(r.tier).toBe('auto')
  })
})

describe('checkPermission — write tools (confirm HARDCODED)', () => {
  it('reply_to_message → confirm обязательно, allowed но requiresConfirm', () => {
    const r = checkPermission('reply_to_message', SOURCE_NATIVE, { text: 'hi' }, {})
    expect(r.allowed).toBe(true)
    expect(r.requiresConfirm).toBe(true)
    expect(r.tier).toBe('confirm')
    expect(r.reason).toBe('hardcoded_confirm')
  })

  it('reply_to_message: юзер пытается переопределить в auto → ИГНОРИРУЕТСЯ', () => {
    const userSettings = { aiPermissions: { overrides: { reply_to_message: 'auto' } } }
    const r = checkPermission('reply_to_message', SOURCE_NATIVE, {}, userSettings)
    expect(r.requiresConfirm).toBe(true)  // всё равно confirm
    expect(r.reason).toBe('hardcoded_confirm')
  })

  it('send_message → confirm HARDCODED', () => {
    const r = checkPermission('send_message', SOURCE_NATIVE, {}, {})
    expect(r.requiresConfirm).toBe(true)
    expect(r.reason).toBe('hardcoded_confirm')
  })
})

describe('checkPermission — deny tools (HARDCODED)', () => {
  it('delete_message → deny, NOT allowed', () => {
    const r = checkPermission('delete_message', SOURCE_NATIVE, {}, {})
    expect(r.allowed).toBe(false)
    expect(r.tier).toBe('deny')
    expect(r.reason).toBe('hardcoded_deny')
  })

  it('юзер пытается allow delete_message → ИГНОРИРУЕТСЯ', () => {
    const userSettings = { aiPermissions: { overrides: { delete_message: 'auto' } } }
    const r = checkPermission('delete_message', SOURCE_NATIVE, {}, userSettings)
    expect(r.allowed).toBe(false)
    expect(r.tier).toBe('deny')
  })

  it('leave_chat / block_user / clear_chat_history / change_settings / set_api_key / export_data → deny', () => {
    for (const tool of ['leave_chat', 'block_user', 'clear_chat_history', 'change_settings', 'set_api_key', 'export_data']) {
      const r = checkPermission(tool, SOURCE_NATIVE, {}, {})
      expect(r.allowed, `${tool} should be deny`).toBe(false)
      expect(r.tier).toBe('deny')
    }
  })
})

describe('checkPermission — scope (только native_*)', () => {
  it('messengerId=webview-* → deny, reason=webview_messenger_not_supported', () => {
    const r = checkPermission('goto_message', SOURCE_WEBVIEW, {}, {})
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('webview_messenger_not_supported')
  })

  it('messengerId=native_wa_business (будущий) → allowed', () => {
    const futureSource = {
      messengerId: 'native_wa_business',
      accountId: 'wa_1',
      chatId: '+79991234567',
      messageId: 'wa_msg_1',
    }
    const r = checkPermission('goto_message', futureSource, {}, {})
    expect(r.allowed).toBe(true)
  })
})

describe('checkPermission — user override', () => {
  it('mark_as_read default=confirm, user=auto → auto', () => {
    const userSettings = { aiPermissions: { overrides: { mark_as_read: 'auto' } } }
    const r = checkPermission('mark_as_read', SOURCE_NATIVE, {}, userSettings)
    expect(r.tier).toBe('auto')
    expect(r.requiresConfirm).toBe(false)
    expect(r.reason).toBe('user_override')
  })

  it('user=deny → blocked', () => {
    const userSettings = { aiPermissions: { overrides: { mark_as_read: 'deny' } } }
    const r = checkPermission('mark_as_read', SOURCE_NATIVE, {}, userSettings)
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('user_deny')
  })

  it('invalid override tier → fallback to default', () => {
    const userSettings = { aiPermissions: { overrides: { goto_message: 'invalid_tier' } } }
    const r = checkPermission('goto_message', SOURCE_NATIVE, {}, userSettings)
    expect(r.tier).toBe('auto')  // default
  })
})

describe('checkPermission — unknown tool', () => {
  it('unknown tool → deny safe default', () => {
    const r = checkPermission('totally_unknown_tool', SOURCE_NATIVE, {}, {})
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('unknown_tool')
  })
})

describe('getPermissionTier', () => {
  it('возвращает tier без выполнения', () => {
    expect(getPermissionTier('goto_message', {})).toBe('auto')
    expect(getPermissionTier('reply_to_message', {})).toBe('confirm')
    expect(getPermissionTier('delete_message', {})).toBe('deny')
    expect(getPermissionTier('unknown', {})).toBe('deny')
  })

  it('user override применяется (если не hardcoded)', () => {
    expect(getPermissionTier('mark_as_read', {
      aiPermissions: { overrides: { mark_as_read: 'auto' } },
    })).toBe('auto')
  })

  it('hardcoded не override', () => {
    expect(getPermissionTier('reply_to_message', {
      aiPermissions: { overrides: { reply_to_message: 'auto' } },
    })).toBe('confirm')
  })
})

describe('isUserCustomizable', () => {
  it('reply_to_message → false (hardcoded)', () => {
    expect(isUserCustomizable('reply_to_message')).toBe(false)
  })

  it('delete_message → false (hardcoded deny)', () => {
    expect(isUserCustomizable('delete_message')).toBe(false)
  })

  it('mark_as_read → true', () => {
    expect(isUserCustomizable('mark_as_read')).toBe(true)
  })

  it('goto_message → true', () => {
    expect(isUserCustomizable('goto_message')).toBe(true)
  })
})
