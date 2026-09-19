// v1.2.462: ЖАЛОБА «почему так много уведомлений» — на одно сообщение в МАКС приходило ТРИ карточки.
//
// Доказано журналом (chatcenter.log, 2026-09-15, 17:13:44–45): карточки id=18 и id=19 несли ОДИН И ТОТ
// ЖЕ текст («Новые сообщения … PDF check.pdf Скачать • 9.17 KB»), но разные имена отправителя:
//   id=18 → «Бузов Алексей Николаевич      Бузов Алек…»  (задвоено)
//   id=19 → «Бузов Алексей Николаевич»                    (нормально)
// Имя входит в ключ сравнения повторов (buildMessageDedupScope) → задвоенное читалось как «другой
// человек» → защита от повторов не срабатывала. Задвоение в журнале за день — 128 строк, не случайность.
//
// Проверки берут НАСТОЯЩУЮ функцию из кода (не копию) — копии расходятся с кодом молча.
import { describe, it, expect } from 'vitest'
import { cleanSenderStatus, buildMessageDedupScope, isDuplicateExact, isDuplicateSubstring } from '../../shared/messageProcessing.js'

const DOUBLED = 'Бузов Алексей Николаевич Бузов Алексей Николаевич'
const CLEAN = 'Бузов Алексей Николаевич'

describe('cleanSenderStatus — задвоенное имя из заголовка чата МАКС (v1.2.462)', () => {
  it('реальная строка из журнала: имя задвоено + подпись «Только что» → чистое имя', () => {
    expect(cleanSenderStatus(DOUBLED + ' Только что')).toBe(CLEAN)
  })

  it('реальная строка из журнала: другой чат, «1 мин назад»', () => {
    const d = 'Лаптев Александр Анатольевич Лаптев Александр Анатольевич'
    expect(cleanSenderStatus(d + ' 1 мин назад')).toBe('Лаптев Александр Анатольевич')
  })

  it('задвоено через МНОГО пробелов (так и приходит из вёрстки) → чистое имя', () => {
    expect(cleanSenderStatus('Бузов Алексей Николаевич      Бузов Алексей Николаевич')).toBe(CLEAN)
  })

  it('задвоено ВПЛОТНУЮ, без пробела между копиями → чистое имя', () => {
    expect(cleanSenderStatus(CLEAN + CLEAN)).toBe(CLEAN)
  })

  it('время в конце режется во всех известных видах', () => {
    expect(cleanSenderStatus('Пётр 12:30')).toBe('Пётр')
    expect(cleanSenderStatus('Пётр вчера')).toBe('Пётр')
    expect(cleanSenderStatus('Пётр 2 часа назад')).toBe('Пётр')
    expect(cleanSenderStatus('Пётр только что')).toBe('Пётр')
  })

  it('🔴 ЛОВУШКА: настоящее имя НЕ трогаем — обычное имя проходит как есть', () => {
    expect(cleanSenderStatus('Иван Иванов')).toBe('Иван Иванов')
    expect(cleanSenderStatus('Анна-Мария О’Коннор')).toBe('Анна-Мария О’Коннор')
    // Короткий повтор (меньше 4 букв на половину) НЕ схлопываем — «Ян Ян» может быть настоящим.
    expect(cleanSenderStatus('Ян Ян')).toBe('Ян Ян')
  })

  it('🔴 ЛОВУШКА: слово «назад» ВНУТРИ имени не режет хвост (режем только известные формы времени)', () => {
    expect(cleanSenderStatus('Назад в будущее')).toBe('Назад в будущее')
  })

  it('старое поведение (статусы ВК) сохранено', () => {
    expect(cleanSenderStatus('Елена Дугинаonline')).toBe('Елена Дугина')
    expect(cleanSenderStatus('Елена Дугиназаходила 6 минут назад')).toBe('Елена Дугина')
    expect(cleanSenderStatus('Пётр печатает')).toBe('Пётр')
  })

  it('пустое/отсутствующее имя не ломает функцию', () => {
    expect(cleanSenderStatus('')).toBe('')
    expect(cleanSenderStatus(null)).toBe(null)
  })
})

describe('последствие для защиты от повторов — тот самый случай из журнала (v1.2.462)', () => {
  it('🔴 ГЛАВНОЕ: задвоенное и чистое имя дают ОДИН ключ сравнения (раньше — разные)', () => {
    const a = buildMessageDedupScope(cleanSenderStatus(DOUBLED + ' Только что'), '', '')
    const b = buildMessageDedupScope(cleanSenderStatus(CLEAN), '', '')
    expect(a).toBe(b)
    // И доказательство, что РАНЬШЕ они расходились (иначе проверка выше ничего не стоит):
    expect(buildMessageDedupScope(DOUBLED, '', '')).not.toBe(buildMessageDedupScope(CLEAN, '', ''))
  })

  it('вторая карточка с тем же текстом теперь блокируется', () => {
    const map = new Map()
    const text = 'Новые сообщения PDF check.pdf Скачать • 9.17 KB'
    const scope1 = buildMessageDedupScope(cleanSenderStatus(DOUBLED + ' Только что'), '', '')
    const first = isDuplicateExact('max', text, map, 10000, scope1)
    expect(first.blocked).toBe(false)
    map.set(first.key, first.now)
    const scope2 = buildMessageDedupScope(cleanSenderStatus(CLEAN), '', '')
    expect(isDuplicateExact('max', text, map, 10000, scope2).blocked).toBe(true)
  })

  it('короткий текст, который целиком входит в длинный, тоже ловится — в ОДНОМ ключе сравнения', () => {
    const map = new Map()
    const scope = buildMessageDedupScope(cleanSenderStatus(DOUBLED), '', '')
    const short = isDuplicateExact('max', 'check.pdf', map, 10000, scope)
    map.set(short.key, short.now)
    const long = 'Новые сообщения PDF check.pdf Скачать • 9.17 KB'
    expect(isDuplicateSubstring('max', long, map, 5000, scope).blocked).toBe(true)
  })
})

describe('запись в журнал о ПРОПУСКЕ повтора (v1.2.462)', () => {
  it('код обработчика пишет строку «ПРОПУЩЕНО» с ключом сравнения', async () => {
    const fs = await import('node:fs')
    const code = fs.readFileSync('src/utils/webviewHandleNewMessage.js', 'utf8')
    expect(code).toContain("traceNotif('dedup', 'pass'")
    expect(code).toContain('ПРОПУЩЕНО')
    expect(code).toContain('${dedupScope')
    // Запись обязана стоять ДО того, как ключ кладётся в память, иначе «вМоменте» соврёт на единицу.
    expect(code.indexOf('ПРОПУЩЕНО')).toBeLessThan(code.indexOf('recentNotifsRef.current.set(exactDedup.key'))
  })
})
