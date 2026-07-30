// v1.2.153: ЛОКАЛЬНЫЙ цвет-метка аккаунта (только в нашем приложении, НЕ в Telegram).
// Нужен, чтобы при нескольких подключённых аккаунтах сразу видеть, чей чат: цветная
// полоска слева в списке + обводка аватара в панели аккаунтов. Чистая логика (без
// localStorage/DOM) — в shared/, чтобы не входить в renderer-бюджет и быть тестируемой.
//
// v1.2.154 (по ревью): дефолт больше НЕ по хешу id (мог дать двум аккаунтам ОДИН цвет).
// Теперь каждому аккаунту без сохранённого цвета назначается ПЕРВЫЙ СВОБОДНЫЙ цвет
// палитры и СОХРАНЯЕТСЯ (assignMissingColors + эффект в сторе) → различимо (до 8) и
// стабильно (существующие цвета не «прыгают» при добавлении нового аккаунта).

// Палитра из 8 приятных различимых цветов (тёмная тема).
export const ACCOUNT_PALETTE = [
  '#e0a92e', // янтарный
  '#2aabee', // голубой
  '#3ec78a', // изумрудный
  '#a877f0', // фиолетовый
  '#f0617a', // розовый
  '#f2903a', // оранжевый
  '#17b6b0', // бирюзовый
  '#6b8cff', // индиго
]

// Цвет аккаунта из карты (сохранённый выбор или уже назначенный дефолт). Fallback —
// первый цвет палитры (нужен лишь на 1 кадр, пока эффект в сторе не назначил цвета).
export function getAccountColor(colorsMap, accountId) {
  if (!accountId) return ACCOUNT_PALETTE[0]
  const c = colorsMap && colorsMap[accountId]
  return (c && typeof c === 'string') ? c : ACCOUNT_PALETTE[0]
}

// Назначить цвета аккаунтам, у которых их ещё нет: первый СВОБОДНЫЙ цвет палитры
// (не занятый другими). Сохранённые/уже назначенные НЕ трогаем → существующие цвета
// не меняются при добавлении нового аккаунта. Порядок назначения — по отсортированным
// id (детерминированно, не зависит от порядка в панели). Возвращает ТОТ ЖЕ объект,
// если назначать нечего (чтобы стор не делал лишний ре-рендер). Не мутирует вход.
export function assignMissingColors(colorsMap, accountIds) {
  const map = (colorsMap && typeof colorsMap === 'object') ? colorsMap : {}
  const ids = Array.isArray(accountIds) ? accountIds : []
  const missing = ids.filter(id => id && !map[id])
  if (missing.length === 0) return map
  const next = { ...map }
  const used = new Set(Object.values(next))
  for (const id of [...missing].sort()) {
    let color = ACCOUNT_PALETTE.find(c => !used.has(c))
    if (!color) color = ACCOUNT_PALETTE[Object.keys(next).length % ACCOUNT_PALETTE.length] // >8 аккаунтов — по кругу
    next[id] = color
    used.add(color)
  }
  return next
}

// Установить цвет аккаунта (пустой/null → снять выбор). Не мутирует вход.
export function withAccountColor(colorsMap, accountId, color) {
  const next = { ...(colorsMap || {}) }
  if (!accountId) return next
  if (color) next[accountId] = color
  else delete next[accountId]
  return next
}
