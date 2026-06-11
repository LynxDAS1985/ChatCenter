# Архив v0.95.26 — Фикс 47-дневного бага unreadCount

Заархивировано 11 июня 2026 при выпуске v1.1.12. Учебный пример сохранён — полный разбор в `.memory-bank/mistakes/native-scroll-unread.md`.

---

### v0.95.26 — Фикс: tg:new-message обнулял unreadCount для активного чата (47-дневный баг)

Юзер: открыл чат «Вайбкодинг комьюнити» с unread=48, прокручен вверх, листает → counter не убирается → **резко 0**, но можно ещё листать вниз.

**Прямое доказательство** (chatcenter.log 15:00:33-34):
```
15:00:33  store-unread-sync unread=48 active=true   ← server ВСЁ ЕЩЁ 48
15:00:33  tg-new-message msgId=118640082944
          action=skipped-non-contiguous gapMessages=3758 isActiveChat=true
15:00:34  badge-state unread=0 prevUnread=48        ← 💥 ЛОКАЛЬНОЕ обнуление
15:00:34  bottomGap=2056                            ← юзер НЕ у низа
```

**Корень**: в `nativeStoreIpc.js:396` (с **15 апреля 2026**, v0.87.14 — **47 дней не ловили**) была строка:

```js
unreadCount: s.activeChatId === chatId ? 0 : (c.unreadCount || 0) + (message.isOutgoing ? 0 : 1),
```

Это нарушало правило **v0.87.41** (документировано для функции `markRead`, но НЕ применялось к другим handlers):
> «Локально unreadCount обновляется ТОЛЬКО из server sync».

**Решение** (1 строка):
```js
// БЫЛО:  unreadCount: s.activeChatId === chatId ? 0 : (c.unreadCount || 0) + (message.isOutgoing ? 0 : 1)
// СТАЛО: unreadCount: (c.unreadCount || 0) + (message.isOutgoing ? 0 : 1)
```

Decrement остаётся **ТОЛЬКО** через `tg:chat-unread-sync` (3 server-driven handlers: sync, bulk-sync, read).

**Эталоны** (research-агент проверил исходники):
- **Telegram Web K** `appMessagesManager.ts:7577`: `++dialog.unread_count` БЕЗУСЛОВНО. Decrement только в `onUpdateReadHistoryInbox`.
- **Telegram Desktop** `history_widget.cpp:3946`: atBottom guard ПЕРЕД `readInboxOnNewMessage` — если НЕ в низу, не трогает counter.
- **WhatsApp Web / Discord**: ACK только при `isActive && focused && atBottom`.

Наш фикс = tweb pattern (самый простой, decrement только server).

**Почему 47 дней не ловили** (7 факторов — полный анализ в `mistakes/native-scroll-unread.md`):
1. `useReadByVisibility` маскировал — для большинства сообщений server обновлял правильно, локальное обнуление совпадало по значению
2. Тест-пробел: проверяли только `tg:chat-unread-sync`, не `tg:new-message`
3. Сага v0.87.41 затронула только `markRead`, никто не сопоставил с `tg:new-message`
4. Code review v0.87.103 (разбиение файлов) был архитектурным, не функциональным
5. В логах не виден — оба events валидны по отдельности
6. Невозможно поймать в jsdom (нужны scroll + push + server delay)
7. Два параллельных «unread» счётчика путали (chat.unreadCount + useNewBelowCounter)

**3 уровня защиты** (чтобы НИКОГДА не вернулось):
1. **4 регресс-теста** в `nativeStore.vitest.jsx` — `tg:new-message для активного чата +1`, `outgoing не меняет`, `decrement через server sync`
2. **Static-test** в `modernPatternsGuard.test.cjs` — regex проверка что строка не вернётся
3. **Запись** в `mistakes/native-scroll-unread.md` — полный разбор + правило для будущих сессий

**Что юзер увидит**:
| Сценарий | Раньше | После фикса |
|---|---|---|
| Чат активен, юзер atBottom, новое сообщение | 48 → 0 (моментально) | 48 → 49 → 0 (~500мс через server) — точно как Telegram |
| Чат активен, юзер НЕ atBottom | 48 → 0 ❌ **БАГ** | 48 → 49 (остаётся пока не дочитает) |
| Чат неактивен | +1 (без изменений) | +1 (без изменений) |
| Своё сообщение | без изменений | без изменений |

**Регрессия**: lint 0, vitest 840/840 (+4 новых), modernPatternsGuard 16/16 (+1), check-memory ✅.
