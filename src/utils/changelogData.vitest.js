// v0.95.25: тесты getChangelogSince.

import { describe, it, expect } from 'vitest'
import { getChangelogSince, CHANGELOG } from './changelogData.js'

describe('getChangelogSince (v0.95.25)', () => {
  it('первая установка (prevVersion=null) → только последний changelog', () => {
    const result = getChangelogSince(null, '0.95.32')
    expect(result).toHaveLength(1)
    expect(result[0].version).toBe('0.95.32')
  })

  it('первая установка (prevVersion=undefined) → только последний', () => {
    const result = getChangelogSince(undefined, '0.95.32')
    expect(result).toHaveLength(1)
  })

  it('одна версия назад (0.95.24 → 0.95.25) → только 0.95.25', () => {
    const result = getChangelogSince('0.95.24', '0.95.25')
    expect(result).toHaveLength(1)
    expect(result[0].version).toBe('0.95.25')
  })

  it('несколько версий назад (0.95.22 → 0.95.25) → 3 changelog', () => {
    const result = getChangelogSince('0.95.22', '0.95.25')
    expect(result.length).toBeGreaterThanOrEqual(3)
    // Все версии между prev и current
    expect(result.find(e => e.version === '0.95.23')).toBeTruthy()
    expect(result.find(e => e.version === '0.95.24')).toBeTruthy()
    expect(result.find(e => e.version === '0.95.25')).toBeTruthy()
  })

  it('равные версии → []', () => {
    expect(getChangelogSince('0.95.25', '0.95.25')).toEqual([])
  })

  it('currentVersion=null → []', () => {
    expect(getChangelogSince('0.95.20', null)).toEqual([])
    expect(getChangelogSince(null, null)).toEqual([])
  })

  it('CHANGELOG содержит обязательные поля', () => {
    for (const entry of CHANGELOG) {
      expect(entry.version).toBeTruthy()
      expect(entry.date).toBeTruthy()
      expect(entry.title).toBeTruthy()
      expect(Array.isArray(entry.features)).toBe(true)
      expect(entry.features.length).toBeGreaterThan(0)
    }
  })

  it('версии в CHANGELOG отсортированы DESC (новые вверху)', () => {
    for (let i = 0; i < CHANGELOG.length - 1; i++) {
      const v1 = CHANGELOG[i].version.split('.').map(Number)
      const v2 = CHANGELOG[i + 1].version.split('.').map(Number)
      const cmp = v1[0] - v2[0] || v1[1] - v2[1] || v1[2] - v2[2]
      expect(cmp).toBeGreaterThan(0)
    }
  })
})
