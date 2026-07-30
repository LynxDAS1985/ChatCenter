// v1.2.153: обёртка над localStorage для локальных цветов-меток аккаунтов.
// Чистая логика (палитра, getAccountColor, withAccountColor) — в shared/accountColors.js
// (вне renderer-бюджета). Здесь только чтение/запись карты { accountId: '#hex' }.

export { ACCOUNT_PALETTE, getAccountColor, withAccountColor, assignMissingColors } from '../../../shared/accountColors.js'

const KEY = 'cc-native-account-colors'

// Загрузить карту цветов. Любая ошибка/мусор → пустая карта.
export function loadAccountColors() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {}
  } catch (_) {
    return {}
  }
}

// Сохранить карту цветов.
export function saveAccountColors(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map && typeof map === 'object' ? map : {}))
  } catch (_) {}
}
