// v1.2.171: тесты разбора статуса собеседника (единый для mapChat + live tg:user-status).

import { describe, it, expect } from 'vitest'
import { mapUserStatus } from './userStatusMap.js'

describe('mapUserStatus (v1.2.171)', () => {
  it('userStatusOnline → в сети', () => {
    expect(mapUserStatus({ '@type': 'userStatusOnline', expires: 123 }))
      .toEqual({ isOnline: true, lastSeenAt: null, userStatusType: 'userStatusOnline' })
  })

  it('userStatusOffline с was_online → точное время (unix→мс)', () => {
    expect(mapUserStatus({ '@type': 'userStatusOffline', was_online: 1717200000 }))
      .toEqual({ isOnline: false, lastSeenAt: 1717200000000, userStatusType: 'userStatusOffline' })
  })

  it('userStatusOffline без was_online → без времени', () => {
    expect(mapUserStatus({ '@type': 'userStatusOffline' }))
      .toEqual({ isOnline: false, lastSeenAt: null, userStatusType: 'userStatusOffline' })
  })

  it('userStatusRecently → только тип (юзер скрыл время)', () => {
    expect(mapUserStatus({ '@type': 'userStatusRecently' }))
      .toEqual({ isOnline: false, lastSeenAt: null, userStatusType: 'userStatusRecently' })
  })

  it('userStatusLastWeek / LastMonth → только тип', () => {
    expect(mapUserStatus({ '@type': 'userStatusLastWeek' }).userStatusType).toBe('userStatusLastWeek')
    expect(mapUserStatus({ '@type': 'userStatusLastMonth' }).lastSeenAt).toBeNull()
  })

  it('null/undefined/пусто → всё безопасно null/false', () => {
    expect(mapUserStatus(null)).toEqual({ isOnline: false, lastSeenAt: null, userStatusType: null })
    expect(mapUserStatus(undefined)).toEqual({ isOnline: false, lastSeenAt: null, userStatusType: null })
    expect(mapUserStatus({})).toEqual({ isOnline: false, lastSeenAt: null, userStatusType: null })
  })
})
