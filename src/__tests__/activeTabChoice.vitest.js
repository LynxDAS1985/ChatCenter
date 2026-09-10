// v1.2.436: тест выбора активной вкладки при загрузке списка мессенджеров.
//
// 🔴 ЛОВУШКА НА РЕАЛЬНУЮ ЖАЛОБУ (2026-09-09): «постоянно выкидывает в ЦентрЧатов,
// очень часто, с озона, я сам не переходил». Корень: код ставил активной вкладкой
// «ЦентрЧатов» БЕЗУСЛОВНО при каждой загрузке списка, а список загружается на каждое
// монтирование дерева — в режиме разработки это КАЖДАЯ горячая перезагрузка от правки
// файла. Журнал подтвердил: 5 лишних загрузок за 70 секунд, каждая через ~1с после
// `dev-request /src/App.jsx?t=…`. Тест ниже падает, если условие снова уберут.
import { describe, it, expect } from 'vitest'
import { pickActiveTabId } from '../../shared/activeTabChoice.js'

const NATIVE = 'native_cc'
const LIST = [
  { id: 'custom_max' },
  { id: 'custom_ozon' },
  { id: NATIVE },
]

describe('Выбор активной вкладки (pickActiveTabId)', () => {
  it('ПЕРВЫЙ запуск (вкладка не выбрана) → «ЦентрЧатов» (поведение v1.2.399 сохранено)', () => {
    expect(pickActiveTabId(null, LIST, NATIVE)).toBe(NATIVE)
    expect(pickActiveTabId(undefined, LIST, NATIVE)).toBe(NATIVE)
    expect(pickActiveTabId('', LIST, NATIVE)).toBe(NATIVE)
  })

  it('🔴 ЛОВУШКА: повторная загрузка (горячая перезагрузка) НЕ отбирает вкладку у пользователя', () => {
    // пользователь сидит в Ozon — после перезагрузки списка он должен остаться в Ozon
    expect(pickActiveTabId('custom_ozon', LIST, NATIVE)).toBe('custom_ozon')
    // и в любом другом веб-мессенджере тоже
    expect(pickActiveTabId('custom_max', LIST, NATIVE)).toBe('custom_max')
    // и если он сам выбрал «ЦентрЧатов» — тоже остаётся
    expect(pickActiveTabId(NATIVE, LIST, NATIVE)).toBe(NATIVE)
  })

  it('выбранная вкладка УДАЛЕНА из списка → уходим на «ЦентрЧатов», а не остаёмся на пустой', () => {
    expect(pickActiveTabId('custom_deleted', LIST, NATIVE)).toBe(NATIVE)
  })

  it('нативной вкладки в списке нет → первая вкладка списка (запасной путь)', () => {
    const noNative = [{ id: 'custom_max' }, { id: 'custom_ozon' }]
    expect(pickActiveTabId(null, noNative, NATIVE)).toBe('custom_max')
    expect(pickActiveTabId('custom_deleted', noNative, NATIVE)).toBe('custom_max')
    // но уже выбранную существующую вкладку всё равно не трогаем
    expect(pickActiveTabId('custom_ozon', noNative, NATIVE)).toBe('custom_ozon')
  })

  it('крайние случаи: пустой список / не массив / битые записи', () => {
    expect(pickActiveTabId(null, [], NATIVE)).toBe(null)
    expect(pickActiveTabId('custom_ozon', [], NATIVE)).toBe(null)
    expect(pickActiveTabId(null, null, NATIVE)).toBe(null)
    expect(pickActiveTabId(null, undefined, NATIVE)).toBe(null)
    expect(pickActiveTabId(null, [null, undefined, { id: 'a' }], NATIVE)).toBe('a')
    expect(pickActiveTabId('a', [null, { id: 'a' }], NATIVE)).toBe('a')
  })

  it('функция чистая: не меняет переданный список', () => {
    const list = [{ id: 'x' }, { id: NATIVE }]
    const copy = JSON.parse(JSON.stringify(list))
    pickActiveTabId('x', list, NATIVE)
    expect(list).toEqual(copy)
  })
})
