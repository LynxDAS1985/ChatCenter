# Features Archive — v0.95.27

Архив: расширенная диагностика send pipeline (v0.95.27 — 1 июня 2026).
Стабилизировано v0.95.29 (логи использованы, проблема диагностирована).
Заменено на минимальную диагностику или удалено в более поздних версиях.

---

### v0.95.27 — Расширенная диагностика send pipeline (ловим «двойную отправку»)

Юзер: «я не отправлял 2 сообщения». Лог v0.95.26 показал 2 `send-start`, но `lastUserType=wheel` (между ними юзер только скроллил, не нажимал). Подозрение — что-то programmatically вызывает `handleReplySend`, или это **TDLib двойной emit** `updateNewMessage` (provisional + final id после `updateMessageSendSucceeded`).

**Без смены поведения**, добавил полные логи в 3 точках send pipeline:

1. **`InboxMessageInput`** — каждый вызов `handleReplySend` теперь идёт с явным `source`:
   - `'keyboard:Enter'` — нажатие Enter
   - `'click:button'` — клик «Отпр.»
   - Если в логе появится `source='unknown'` → значит **что-то ещё** programmatically вызвало → нашли корень.

2. **`InboxMode.handleReplySend`** — расширен лог `send-start`:
   - `callSource` — источник из п.1
   - `textPreview` — первые 40 символов текста (для сопоставления возможных дублей)
   - `outgoingCountBefore` — сколько своих сообщений в DOM до отправки
   - `lastOutgoingId` + `lastOutgoingTextPreview` — последнее своё (если только что было такое же → дубль)
   - `msSinceLastOutgoing` — мс с последнего своего (если <2с → подозрительно)
   - `stackHint` — первые 3 фрейма stack для callSource=unknown

3. **`store.sendMessage`** — лог `store-send-message-invoke` перед IPC:
   - `len`, `textPreview`, `replyTo` — точное содержимое invoke

4. **`tg:new-message` handler** — расширен лог:
   - `textPreview` — первые 40 символов сообщения
   - `replyToId` — на какое сообщение reply
   - Если придут 2 события с **разными** `msgId` но **одинаковым** `textPreview` → это TDLib двойной emit (provisional + final).

После реальной сессии юзера лог покажет точный корень — либо UI baba dispatches second send (тогда callSource=unknown + stack), либо TDLib эмитит дважды (одинаковый textPreview, разные id).

**НЕ менялось**:
- Поведение send / receive
- Дедупликация в `tg:new-message` handler
- `state.messages` логика
- Все защиты v0.95.0-26 не задействуются

**Регрессия**: lint 0, vitest 840/840 (без изменений), check-memory ✅.

**Следующий шаг**: после сессии юзера → точный фикс по реальным данным.
