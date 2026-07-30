// v1.2.163: ЧИСТАЯ логика фильтра аккаунтов в едином списке чатов (множественный выбор + «соло»).
// Лежит в корневом shared/ (как pinnedChats.js / accountColors.js), вне renderer-бюджета.
// Обёртка над localStorage — в src/native/store/accountFilter.js.
//
// Модель (заменяет прежний одиночный chatFilter 'all'|accountId, ADR-016):
//  • hiddenIds — массив id СКРЫТЫХ аккаунтов. Пусто = показаны все. ПЕРСИСТЕНТНО (localStorage).
//    Переключается одиночным кликом по аватарке (галочка вкл/выкл).
//  • soloId — id аккаунта в режиме «только этот». ВРЕМЕННЫЙ (не сохраняется, сбрасывается при
//    перезапуске). Ставится двойным кликом. Пока soloId задан — виден только он, hiddenIds
//    игнорируются (запоминаются, применятся после выхода из соло).

// Виден ли аккаунт accId сейчас (с учётом соло и скрытых)?
export function isAccountVisible(accId, hiddenIds, soloId) {
  if (soloId) return accId === soloId
  return !(Array.isArray(hiddenIds) && hiddenIds.includes(accId))
}

// Переключить видимость аккаунта (одиночный клик). ЗАЩИТА: нельзя скрыть ПОСЛЕДНИЙ видимый —
// всегда остаётся минимум один показанный аккаунт (иначе список стал бы пустым и непонятным).
// allIds — все id аккаунтов. Чистая: не мутирует, возвращает новый массив (или тот же, если no-op).
export function toggleAccountHidden(hiddenIds, accId, allIds) {
  const hidden = Array.isArray(hiddenIds) ? hiddenIds : []
  if (!accId) return hidden
  if (hidden.includes(accId)) return hidden.filter(id => id !== accId) // показать снова
  const all = Array.isArray(allIds) ? allIds : []
  const visibleCount = all.filter(id => !hidden.includes(id)).length
  if (visibleCount <= 1) return hidden // нельзя скрыть последний видимый → без изменений
  return [...hidden, accId]
}

// Сколько аккаунтов сейчас показано (для счётчика на кнопке «Все»).
export function visibleAccountCount(allIds, hiddenIds, soloId) {
  const all = Array.isArray(allIds) ? allIds : []
  if (soloId) return all.includes(soloId) ? 1 : 0
  const hidden = Array.isArray(hiddenIds) ? hiddenIds : []
  return all.filter(id => !hidden.includes(id)).length
}

// Показаны ли ВСЕ (кнопка «Все» горит)? true когда нет соло и нет скрытых.
export function isAllVisible(hiddenIds, soloId) {
  return !soloId && (!Array.isArray(hiddenIds) || hiddenIds.length === 0)
}
