// v0.95.24: гейт «initial backfill» — догрузка истории при первом открытии чата.
//
// Корневая проблема (лог чата tg_611696632:5006720692 «Страховая Компания»):
//   [get-msgs] from=0 offset=0 count=3 first=X last=X hasMore=false
//
// TDLib local cache для давних чатов может содержать всего 1-3 последних
// сообщения. `getChatHistory(from=0, limit=50)` возвращает count=3, hasMore=false
// — TDLib НЕ догружает историю automatically. Юзер видит «обрезанный» чат хотя
// в Telegram история есть.
//
// Это та же quirk что в jump-to-end-saga: TDLib намеренно возвращает меньше limit
// ([TDLib issue #740](https://github.com/tdlib/td/issues/740) — ответ levlam).
// Решение — итеративный fetch (как `getIterativeUntil` для jump-to-end).
//
// При первом открытии чата (без unread окна / force / override) если результат
// мал → запускаем backfill через `offsetId=oldest_received` → tg:messages event
// придёт с `append: true` → prepend старых к существующим.

export function shouldTriggerInitialBackfill({
  got, force, hasOverride, threshold = 30,
} = {}) {
  if (force) return false
  if (hasOverride) return false
  if (!Number.isFinite(got)) return false
  if (got <= 0) return false  // пустой ответ — backfill не поможет
  if (got >= threshold) return false  // уже достаточно
  return true
}
