# Features Archive — v0.95.28

Telegram-style auto-scroll к новому сообщению + счётчик ↓N без «слепой зоны» Schmitt-trigger. Стабилизировано v0.95.31-32 (множественный typing и проч.).

---

### v0.95.28 — Telegram-style auto-scroll к новому + счётчик ↓N без «слепой зоны»

Юзер: «не показывает новые сообщения на стрелки что появились когда написали». Лог v0.95.26 показал: после отправки `bottomGap=91`, `atBottom=true` через Schmitt-trigger 40/120, но новые incoming не попадали в счётчик `↓N` (потому что `atBottom=true`) и не было auto-scroll (потому что у нас его не было вовсе).

**Корень**: до v0.95.28 у нас **один** atBottom-флаг через Schmitt-trigger (порог вход 40px, выход 120px, был добавлен в v0.95.2 от дребезга кнопки ↓). В зоне 40–120px `atBottom=true` ложно → счётчик ↓N не растёт + auto-scroll отсутствует → **юзер не видит новых сообщений** и **не понимает что они появились**.

**Эталоны** (Telegram Web K / Desktop / WhatsApp Web):
- Юзер **точно** у низа (bottomGap ≈ 0-30px) + incoming → **auto-scroll** к новому (smooth)
- Юзер НЕ у низа (bottomGap > 30) + incoming → счётчик **↓N** растёт
- НИКАКОГО Schmitt-trigger для этой логики — только физический порог
- Schmitt используется только для **визуальной стабильности кнопки ↓** (отдельно)

**Решение** (разделение на 2 независимых флага):
1. **`atBottom` через Schmitt-trigger 40/120** — остаётся **только** для UI кнопки ↓ (стабильность, фикс v0.95.2 не сломан)
2. **Новый `physicallyAtBottom`** — `bottomGap <= 30`, **БЕЗ** Schmitt — для логики auto-scroll и счётчика ↓N

**Изменения** (3 файла):

**[useInboxScroll.js](../../src/native/hooks/useInboxScroll.js)**:
- Новая чистая функция `isPhysicallyAtBottom(bottomGap)` с константой `PHYSICAL_BOTTOM_THRESHOLD = 30`
- Новый optional prop `setPhysicallyAtBottom` — вызывается параллельно с `setAtBottom` (Schmitt)

**[useNewBelowCounter.js](../../src/native/hooks/useNewBelowCounter.js)**:
- Новый optional callback `onAutoScroll({ messageId })`
- При `atBottomRef.current=true` + incoming:
  - Если `onAutoScroll` передан → вызывается (Telegram-style auto-scroll)
  - Иначе → fallback на старый `onSkip` (backward compatibility)

**[InboxMode.jsx](../../src/native/modes/InboxMode.jsx)**:
- Новый state `[physicallyAtBottom, setPhysicallyAtBottom] = useState(false)`
- Передан в `useInboxScroll` → setter
- Передан в `useNewBelowCounter` как `atBottom` (теперь physical, не Schmitt)
- Новый `onAutoScroll` handler — `requestAnimationFrame` + `el.scrollTo({behavior:'smooth'})`

**Что юзер увидел**:

| Сценарий | До v0.95.28 | После v0.95.28 |
|---|---|---|
| Юзер у низа (bottomGap=10), пришло сообщение | Тихо добавляется в DOM — юзер может не заметить | **Auto-scroll** к нему (smooth) — видит сразу |
| Юзер на 91px от низа, пришло сообщение | atBottom=true (Schmitt 40/120) → counter не растёт → юзер не знает | counter **+1** → видит «↓ 1» |
| Юзер вверху, пришло сообщение | counter +1 (как раньше) | counter +1 (без изменений) |
| Юзер сам отправил → атBottom после auto-scroll | atBottom=true, новое incoming → counter 0 | atBottom (physical) проверяется в момент incoming — если scrollHeight вырос и юзер не у низа → +1 |

**Что НЕ менялось**:
- Schmitt-trigger 40/120 для **кнопки ↓** — фикс v0.95.2 (дребезг) НЕ сломан
- `useForceReadAtBottom` использует Schmitt `atBottom` — для markRead — НЕ задевается
- `scroll save` через Schmitt `nearBottom` — НЕ задевается
- `handleReplySend` свой `el.scrollTo` после send — НЕ задевается
- `tg:new-message` handler в nativeStoreIpc — НЕ задевается
- v0.95.26 фикс обнуления unreadCount — НЕ задевается

**Эталоны проверены**:
- Telegram Web K `bubbles.ts` — `isAtBottom()` + `scrollToEnd()` при новом сообщении
- Telegram Desktop `history_widget.cpp` — `scrollTop >= scrollTopMax - threshold` → `scrollToEnd`
- WhatsApp Web — тот же паттерн через IntersectionObserver
- Порог 30px — стандарт всех клиентов

**Тесты** (4 новых в `useNewBelowCounter.vitest.jsx`):
- `atBottom=true + incoming → onAutoScroll({ messageId })` (НЕ skip)
- `atBottom=true + outgoing → skip outgoing` (auto-scroll НЕ зовётся для своих)
- `atBottom=true + другой чат → skip other-chat` (фильтр чата первичнее)
- `atBottom=false + incoming → onAdded (как раньше)`, `onAutoScroll НЕ зовётся`
- Backward compat: если `onAutoScroll` не передан → fallback на старый `onSkip`

**Регрессия**: lint 0, vitest 844/844 (+4 новых), fileSizeLimits 302/302, check-memory ✅.
