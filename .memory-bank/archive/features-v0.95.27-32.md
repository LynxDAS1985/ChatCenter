# Архив changelog v0.95.27 – v0.95.32

Заархивировано 11 июня 2026 (при выпуске v1.1.8) для соблюдения лимита 100 КБ на `features.md`. Все эти версии уже стабилизированы и зафиксированы в коде, диагностика снята.

---

### v0.95.32 — Производительность WhatsNewModal + деловой стиль changelog

Убран `backdrop-filter: blur(8px)` на overlay (Chromium пересчитывал blur каждый кадр скролла → 30-60мс/кадр), box-shadow blur 40→16px, добавлены `isolation: isolate` + `contain: layout style paint` + `overscroll-behavior: contain`. Эталоны: Telegram Web K / Discord / Linear modals. Полный текст: [`features-v0.95.32.md`](./features-v0.95.32.md).

---

### v0.95.31 — Аккаунты вниз + Drag-n-drop + множественный typing + throttle реакций

Структурный UX-релиз: аккаунты вниз левой колонки (Telegram Desktop / Slack паттерн) с HTML5 drag-n-drop через localStorage, множественный typing «Иван и Маша печатают...» (расширение `state.typing[chatId]` до Map<userId>), throttle реакций 200мс leading-edge (защита от FLOOD_WAIT). +32 unit-теста (accountOrder/formatTypingUsers/reactionThrottle). Полный текст: [`features-v0.95.31.md`](./features-v0.95.31.md).

---

### v0.95.30 — Плавная auto-scroll + цветовая тема + dropdown + opacity 0.95

UX-релиз renderer-only: smoothScrollTo easeOutCubic 250мс, 5 цветовых тем (Telegram/Индиго/Teal/Premium/Violet), ChatTypesDropdown, `--bubble-opacity: 0.95`. Цветовая тема в v0.95.30 НЕ работала (CSS specificity ловушка — фикс v0.95.33+v0.95.34). Полный текст: [`features-v0.95.30.md`](./features-v0.95.30.md).

---

### v0.95.29 — Реакции + Telegram-style header + General иконка + render-counter

Реакции 👍❤️🔥🥰👏😁🤔🤯 (backend+IPC+UI), Telegram-style header (аватар + статус «в сети»/«был(а) в HH:MM»/«N участников»), дефолтная 📢 для General форум-темы, render-counter для диагностики дубля сообщений. +27 unit-тестов. Полный текст: [`features-v0.95.29.md`](./features-v0.95.29.md).

---

### v0.95.28 — Telegram-style auto-scroll + счётчик ↓N без «слепой зоны»

Разделение на 2 флага: `atBottom` через Schmitt-trigger 40/120 (только для UI кнопки ↓, не сломан фикс v0.95.2) + новый `physicallyAtBottom` (порог 30px без Schmitt) для логики auto-scroll и счётчика ↓N. Закрыта «слепая зона» 40-120px, где счётчик не рос и не было auto-scroll. Эталоны: Telegram Web K `isAtBottom() + scrollToEnd()`, Telegram Desktop `scrollTop >= scrollTopMax - threshold`. Полный текст: [`features-v0.95.28.md`](./features-v0.95.28.md).

---

### v0.95.27 — Расширенная диагностика send pipeline

Логи `callSource` / `textPreview` / `outgoingCountBefore` / `lastOutgoingId` в `InboxMessageInput` / `InboxMode.handleReplySend` / `store.sendMessage` / `tg:new-message` handler — ловим «двойную отправку». Стабилизировано v0.95.29 (логи использованы). Полный текст: [`features-v0.95.27.md`](./features-v0.95.27.md).
