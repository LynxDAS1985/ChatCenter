// v0.95.31: drag-n-drop порядка аккаунтов в left sidebar.
//
// Раньше: аккаунты рендерились в порядке store.accounts (порядок добавления, неизменяем).
// Теперь: юзер может перетащить аккаунт мышью на новое место. Порядок сохраняется
// в localStorage по списку id ['account-id-1', 'account-id-2', ...].
//
// applyOrder() — чистая функция, переставляет аккаунты по сохранённому порядку.
// Новые аккаунты (которых нет в order) идут В КОНЕЦ — это поведение Telegram Desktop /
// Slack workspace switcher.

const STORAGE_KEY = 'cc-account-order'

export function loadAccountOrder() {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : []
  } catch (_) { return [] }
}

export function saveAccountOrder(ids) {
  try {
    if (typeof localStorage === 'undefined') return
    if (!Array.isArray(ids)) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.filter(x => typeof x === 'string')))
  } catch (_) {}
}

// Применяет сохранённый порядок к массиву аккаунтов.
// Аккаунты из order идут первыми (в порядке order), новые (не из order) — в КОНЕЦ.
// accounts: [{id, ...}], order: ['id1', 'id2', ...]
// Возвращает НОВЫЙ массив (не мутирует accounts).
export function applyAccountOrder(accounts, order) {
  if (!Array.isArray(accounts)) return []
  if (!Array.isArray(order) || order.length === 0) return [...accounts]
  const map = new Map(accounts.map(a => [a.id, a]))
  const result = []
  // Сначала — те что в order и существуют в accounts
  for (const id of order) {
    const acc = map.get(id)
    if (acc) {
      result.push(acc)
      map.delete(id)
    }
  }
  // Потом — новые (не в order)
  for (const acc of accounts) {
    if (map.has(acc.id)) result.push(acc)
  }
  return result
}

// Перемещает аккаунт с fromIndex на toIndex (immutable).
// Возвращает новый порядок ids.
export function moveAccount(accounts, fromIndex, toIndex) {
  if (!Array.isArray(accounts) || accounts.length === 0) return []
  const ids = accounts.map(a => a.id)
  const fi = Math.max(0, Math.min(fromIndex, ids.length - 1))
  const ti = Math.max(0, Math.min(toIndex, ids.length - 1))
  if (fi === ti) return ids
  const next = [...ids]
  const [moved] = next.splice(fi, 1)
  next.splice(ti, 0, moved)
  return next
}
