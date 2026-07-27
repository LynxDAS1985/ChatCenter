// v1.2.131: единое правило префикса имени автора в превью списка чатов.
import { describe, it, expect } from 'vitest'
import { lastSenderLabel } from '../../shared/chatPreviewSender.js'

describe('lastSenderLabel', () => {
  it('группа + входящее → имя отправителя', () => {
    expect(lastSenderLabel('group', 'Мария', false)).toBe('Мария')
  })

  it('группа + исходящее (своё) → «Вы»', () => {
    expect(lastSenderLabel('group', 'Мария', true)).toBe('Вы')
    // Имя своё игнорируется — всегда «Вы».
    expect(lastSenderLabel('group', 'Я сам', true)).toBe('Вы')
  })

  it('группа + входящее без имени → пусто (не рисуем «: »)', () => {
    expect(lastSenderLabel('group', '', false)).toBe('')
    expect(lastSenderLabel('group', undefined, false)).toBe('')
  })

  it('канал → пусто (даже исходящее)', () => {
    expect(lastSenderLabel('channel', 'Канал', false)).toBe('')
    expect(lastSenderLabel('channel', 'Канал', true)).toBe('')
  })

  it('личка → пусто', () => {
    expect(lastSenderLabel('user', 'Иван', false)).toBe('')
    expect(lastSenderLabel('user', 'Иван', true)).toBe('')
  })
})
