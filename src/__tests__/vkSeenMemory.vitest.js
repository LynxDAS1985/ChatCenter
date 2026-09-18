// v1.2.481 — ПАМЯТЬ «уже видели» у перехватчика ВКонтакте.
//
// 🔴 РЕАЛЬНАЯ ЖАЛОБА 2026-09-18: одно сообщение «Угуу» показалось ТРЕМЯ карточками.
// Журнал (`chatcenter.log`, версия 1.2.477) зафиксировал ЧЕТЫРЕ отправки одного и того же
// сообщения за 37 секунд: 13:30:08, 13:30:28, 13:30:34, 13:30:41. Одну погасила защита от
// повторов (окно 10 секунд, возраст 6008 мс), три дошли до экрана. Отпечаток сообщения во всех
// четырёх ОДИНАКОВЫЙ (`sender:vk-list:440736423`), то есть текст не менялся.
//
// КОРЕНЬ: память «что уже видели» ЗАМЕНЯЛАСЬ набором текущего прохода, а в набор попадали только
// строки, прошедшие все фильтры. Строка на миг выпадает из осмотра (статус «печатает» вместо
// текста, перерисовка списка) → её отпечаток исчезает из памяти → на следующем проходе сообщение
// снова считается новым. Тот же корень чинили у Ozon в v1.2.437 (там память тоже заменялась).
//
// Тест достаёт НАСТОЯЩУЮ функцию памяти из файла перехватчика (приём проекта — так же устроен
// `ozonQuestionFingerprint.vitest.js`) и проигрывает на ней реальный сценарий жалобы.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const HOOK = fs.readFileSync('main/preloads/hooks/vk.hook.js', 'utf8')

/** Собираем рабочую копию памяти из реального кода перехватчика (не копию-переписку). */
function realMemory() {
  const ttl = HOOK.match(/var _VK_SEEN_TTL = (\d+);/)
  const fn = HOOK.match(/function _vkRemember\(fps, now\) \{[\s\S]*?\n {2}\}/)
  expect(ttl, 'срок годности памяти не найден — тест устарел').toBeTruthy()
  expect(fn, 'функция памяти _vkRemember не найдена — тест устарел').toBeTruthy()
  return new Function(`
    var _vkSeen = null;
    var _VK_SEEN_TTL = ${ttl[1]};
    ${fn[0]}
    return {
      remember: _vkRemember,
      seen: function (fp) { return !!(_vkSeen && _vkSeen[fp]) },
      size: function () { return _vkSeen ? Object.keys(_vkSeen).length : 0 },
      ttl: _VK_SEEN_TTL,
    }
  `)()
}

describe('память «уже видели» копится, а не переписывается', () => {
  it('отпечаток остаётся, даже если в следующем осмотре строка ВЫПАЛА', () => {
    // Это и есть сценарий жалобы: сообщение увидели, потом строка на миг пропала из осмотра.
    const m = realMemory()
    const t0 = 1_000_000
    m.remember(['угуу'], t0)
    m.remember([], t0 + 20_000)          // проход, в котором строки не было вовсе
    expect(m.seen('угуу')).toBe(true)     // ⇒ повторной карточки не будет
  })

  it('разные чаты не затирают друг друга', () => {
    const m = realMemory()
    m.remember(['чат1'], 1000)
    m.remember(['чат2'], 2000)
    expect(m.seen('чат1')).toBe(true)
    expect(m.seen('чат2')).toBe(true)
    expect(m.size()).toBe(2)
  })

  it('через срок годности отпечаток забывается — одинаковый текст позже снова уведомит', () => {
    const m = realMemory()
    m.remember(['ок'], 1000)
    m.remember(['другое'], 1000 + m.ttl + 1)
    expect(m.seen('ок')).toBe(false)      // старое забыли
    expect(m.seen('другое')).toBe(true)
  })

  it('память не растёт бесконечно — старое вычищается на каждом пополнении', () => {
    const m = realMemory()
    for (let i = 0; i < 500; i++) m.remember(['стар' + i], 1000 + i)
    m.remember(['свежий'], 1000 + m.ttl + 10_000)
    expect(m.size()).toBe(1)              // осталось только свежее
  })

  it('срок годности разумный: минуты, а не секунды и не вечность', () => {
    const m = realMemory()
    expect(m.ttl).toBeGreaterThanOrEqual(60_000)
    expect(m.ttl).toBeLessThanOrEqual(3_600_000)
  })
})

describe('🔴 ЛОВУШКИ: старое поведение не должно вернуться', () => {
  it('память НЕ присваивается набором текущего прохода', () => {
    // Именно эта строка и была причиной: `_vkPrevUnread = current`.
    expect(HOOK).not.toMatch(/_vk\w*\s*=\s*current;/)
    expect(HOOK).toContain('_vkRemember(Object.keys(current), Date.now())')
  })

  it('старое имя памяти нигде не осталось (хвост правки убран)', () => {
    expect(HOOK).not.toContain('_vkPrevUnread')
  })

  it('базовая линия цела: первый проход НЕ уведомляет о старых непрочитанных', () => {
    expect(HOOK).toContain('var _vkSeen = null;')   // null = базовая линия ещё не снята
    expect(HOOK).toContain('if (_vkSeen) {')        // пока памяти нет — не шлём вообще ничего
    expect(HOOK).toContain('if (rows.length > 0)')  // и не снимаем линию на пустом списке
  })

  it('повод выпадения строки виден в журнале (иначе разбирать нечем)', () => {
    expect(HOOK).toContain('skipTx++')
    expect(HOOK).toContain('skipSpam++')
    expect(HOOK).toContain("' skipTx=' + skipTx")
    expect(HOOK).toContain("' память=' + (_vkSeen ? Object.keys(_vkSeen).length : 0)")
  })

  it('прочие защиты на месте: беззвучные чаты, спам-фильтр, анти-дубль между путями', () => {
    expect(HOOK).toContain('_vkRowMuted(rows[i])')
    expect(HOOK).toContain('_isSpam(text)')
    expect(HOOK).toContain('_dupEmit(cand[k].sender, cand[k].text)')
  })
})
