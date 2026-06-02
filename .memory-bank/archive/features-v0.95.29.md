# Features Archive — v0.95.29

Реакции 👍❤️🔥 + Telegram-style header + дефолтная иконка General + render-counter для дубля. Стабилизировано v0.95.31-34.

---

### v0.95.29 — Реакции 👍❤️🔥 + Telegram-style header + дефолтная иконка General + render-counter для дубля

Большой UX-релиз — 4 фичи по запросу юзера.

**1. Реакции на сообщениях (полные)** — backend+UI+IPC:
- В `tdlibMapper.js` функция `extractReactions(tdMsg)` мапит `interaction_info.reactions` → `[{emoji, count, chosen, customEmojiId?}]`. Premium custom emoji пока placeholder ⭐.
- В `tdlibBackend.js` метод `messages.setReaction({chatId, msgId, emoji, action})` — TDLib `addMessageReaction` / `removeMessageReaction`.
- Новый IPC `tg:set-reaction` в `tdlibIpcHandlers.js`.
- Новый store метод `setReaction(chatId, messageId, emoji, action)` в `nativeStore.js`.
- Новый компонент `MessageReactions.jsx` — `ReactionsList` (показ реакций под bubble, click → toggle) + `ReactionPicker` (popup с 8 стандартными emoji: 👍 ❤️ 🔥 🥰 👏 😁 🤔 🤯).
- Интеграция в `MessageBubble.jsx` — кнопка 😀 в action-bar открывает picker, реакции рендерятся под текстом, chosen реакции подсвечены.

**2. Telegram-style header** — аватарка + статус под именем чата:
- В backend `tdlibClient.getAccountChats` пробрасываем `user` объект в `mapChat` для chatTypePrivate.
- В `tdlibMapper.js` добавлены поля `lastSeenAt`, `userStatusType`, `memberCount` (для групп/каналов через supergroup.member_count).
- Новый чистый util `formatChatStatus.js` — Telegram-style строки: «в сети» / «был(а) в 14:25» / «был(а) вчера в 17:15» / «был(а) 15 мин назад» / «N участников» / «N подписчиков». Правила склонения (1 участник / 2 участника / 5 участников). Локализация русская.
- В `InboxChatPanel.jsx` header: новый `ChatHeaderAvatar` 40x40px (с зелёной точкой онлайн), `formatChatStatus(activeChat)` под именем.

**3. Дефолтная иконка General форум-темы** — раньше показывалась буква «G»:
- В `tdlibForumEmoji.js` для тем с `isGeneral=true` и без custom_emoji_id ставим `iconEmoji='📢'` (Telegram Desktop использует SVG-домик, у нас emoji-placeholder).

**4. Расширенные логи для дубля сообщений + custom emoji**:
- В `MessageBubble.jsx` глобальный `__ccBubbleRenderCount` Map — лог `[bubble-render-dup]` при renderCount > 1 для одного msg.id.
- В `nativeStore.sendMessage` dump последних 6 outgoing из state.messages + общее число.
- В `tdlibForumEmoji.js` детальные логи `[forum-emoji] resolve summary` (topics / withCustomId / cached / toFetch / applied url/alt/default).

**Тесты** (+27 unit):
- `formatChatStatus.vitest.js` — 19 тестов (онлайн / offline / typing / разные временные диапазоны / склонение участников)
- `MessageReactions.vitest.jsx` — 8 тестов (QUICK_REACTIONS, рендер с count, chosen подсветка, toggle add/remove, outgoing-стиль, пустые reactions)

**Эталоны** (production messengers 2026):
- Telegram Web K — `reactionElement.ts`, `chatBar` header с avatar + status
- Telegram Desktop — `reactions.cpp`, `info_top_bar.cpp` (avatar + name + status)
- WhatsApp Web — те же паттерны

**НЕ менялось** (стабильность):
- Schmitt-trigger atBottom (v0.95.2)
- markRead логика (v0.87.41, v0.95.26)
- useNewBelowCounter + auto-scroll (v0.95.28)
- contiguity check tg:new-message (v0.95.0)

**Регрессия**: lint 0, vitest 871/871 (+27 новых), fileSizeLimits, check-memory ✅.
