# Реализованные функции — ChatCenter

## Текущая версия: v1.0.4 (9 июня 2026)

**Структура файла**: этот features.md содержит только **последние активные версии**. Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
| [`archive/features-v0.95.39.md`](./archive/features-v0.95.39.md) | v0.95.39 (убран twoPhase + RAF×2 + 350мс easeOutCubic; стабилизировано v0.95.40+) | ~2 КБ |
| [`archive/features-v0.95.40.md`](./archive/features-v0.95.40.md) | v0.95.40 (большие emoji + a11y reduced-motion + sticky bottom on media; стабилизировано v0.95.41+) | ~3 КБ |
| [`archive/features-v0.95.41.md`](./archive/features-v0.95.41.md) | v0.95.41 (Custom emoji premium WebM/WebP + reduced-motion интеграционные тесты; стабилизировано v0.95.42+) | ~3 КБ |
| [`archive/features-v0.95.42.md`](./archive/features-v0.95.42.md) | v0.95.42 (сохранение поиска + история + ✕ + подсветка совпадений; стабилизировано v0.95.43+) | ~2 КБ |
| [`archive/features-v0.95.38.md`](./archive/features-v0.95.38.md) | v0.95.38 (фикс дубля сообщений через updateMessageSendSucceeded, ⏳ индикатор, mistakes static guard) | ~2 КБ |
| [`archive/features-v0.95.35-37.md`](./archive/features-v0.95.35-37.md) | v0.95.35-37 (fade-in changelog, auto-scroll outgoing-other-device, sending_state polish, mistakes/outgoing-two-cases.md; стабилизировано v0.95.38+) | ~3 КБ |
| [`archive/features-v0.95.34.md`](./archive/features-v0.95.34.md) | v0.95.34 (темовые vars в :root, вспышка bubble, WhatsNewModal UX; стабилизировано v0.95.40+) | ~2 КБ |
| [`archive/features-v0.95.33.md`](./archive/features-v0.95.33.md) | v0.95.33 (фикс «цвет не применяется» через querySelectorAll, регресс-тест blur, деловой стиль; финал в v0.95.34) | ~2 КБ |
| [`archive/features-v0.95.32.md`](./archive/features-v0.95.32.md) | v0.95.32 (производительность WhatsNewModal: убран backdrop-filter + contain + деловой стиль changelog) | ~2 КБ |
| [`archive/features-v0.95.31.md`](./archive/features-v0.95.31.md) | v0.95.31 (аккаунты вниз + drag-n-drop + multi-user typing + throttle реакций; стабилизировано v0.95.34+) | ~3 КБ |
| [`archive/features-v0.95.30.md`](./archive/features-v0.95.30.md) | v0.95.30 (плавная auto-scroll + 5 цветовых тем + dropdown + opacity 0.95; стабилизировано v0.95.33-34) | ~3 КБ |
| [`archive/features-v0.95.29.md`](./archive/features-v0.95.29.md) | v0.95.29 (реакции 👍❤️🔥 + Telegram-style header + General 📢 + render-counter; стабилизировано v0.95.31-34) | ~5 КБ |
| [`archive/features-v0.95.28.md`](./archive/features-v0.95.28.md) | v0.95.28 (Telegram-style auto-scroll к новому + ↓N без «слепой зоны» Schmitt; стабилизировано v0.95.31) | ~4 КБ |
| [`archive/features-v0.95.27.md`](./archive/features-v0.95.27.md) | v0.95.27 (расширенная диагностика send pipeline; стабилизировано v0.95.29) | ~3 КБ |
| [`archive/features-v0.95.23-26.md`](./archive/features-v0.95.23-26.md) | v0.95.23 – v0.95.26 (курсор в input, initial backfill, voice/spellcheck/action-bar/WhatsNew, фикс 47-дневного бага unreadCount; стабилизировано) | ~15 КБ |
| [`archive/features-v0.95.19-22.md`](./archive/features-v0.95.19-22.md) | v0.95.19 – v0.95.22 (диагностика tg-new-message, финал jump-to-end, бейдж форум-группы, форум-overlay; стабилизировано) | ~6 КБ |
| [`archive/features-v0.95.15-18.md`](./archive/features-v0.95.15-18.md) | v0.95.15 – v0.95.18 (итеративный fetch + форум-топики + двухфазный scroll + ForumTopicEmptyState; стабилизировано v0.95.20-21) | ~8 КБ |
| [`archive/features-v0.95.12-14.md`](./archive/features-v0.95.12-14.md) | v0.95.12 – v0.95.14 (3 итерации jump-to-end до итеративного fetch v0.95.15, полная сага в jump-to-end-saga.md) | ~32 КБ |
| [`archive/features-v0.95.8-9.md`](./archive/features-v0.95.8-9.md) | v0.95.8 – v0.95.9 (счётчик ↓ обнуляется + анимация + live compact + порог 128) | ~14 КБ |
| [`archive/features-v0.95.5-7.md`](./archive/features-v0.95.5-7.md) | v0.95.5 – v0.95.7 (sticky pinned overlay, кнопка ↓ Telegram-style, drag-to-resize) | ~24 КБ |
| [`archive/features-v0.95.0-3.md`](./archive/features-v0.95.0-3.md) | v0.95.0 – v0.95.3 (контигуити-фикс, afterId load-newer, мигание ↓ Schmitt trigger, диагностика «дёрг») | ~13 КБ |
| [`archive/features-v0.94.1-7.md`](./archive/features-v0.94.1-7.md) | v0.94.1 – v0.94.7 (TDLib listener leak, scroll caskade, спокойная загрузка, пилюля прогресса — стабилизированы v0.95.0-2) | ~24 КБ |
| [`archive/features-v0.93.0.md`](./archive/features-v0.93.0.md) | v0.93.0 (pixel-perfect scroll restore через LocationOptions.offset, superseded v0.94.0) | ~7 КБ |
| [`archive/features-v0.92.0-6.md`](./archive/features-v0.92.0-6.md) | v0.92.0 – v0.92.6 (сага Virtuoso scroll restore, superseded v0.94.0) | ~37 КБ |
| [`archive/features-v0.91.11-24.md`](./archive/features-v0.91.11-24.md) | v0.91.11 – v0.91.24 (сага scroll restore: 13 версий → миграция на virtuoso) | ~47 КБ |
| [`archive/features-v0.91.1-10.md`](./archive/features-v0.91.1-10.md) | v0.91.1 – v0.91.10 (initial-load, scroll-jump, newBelow, forum topics, updateChatLastMessage) | ~12 КБ |
| [`archive/features-v0.87.106-114.md`](./archive/features-v0.87.106-114.md) | v0.87.106 – v0.87.114 (multi-account UI финал, кнопки режимов, мьют чата, аватарки отправителей в группах) | ~22 КБ |
| [`archive/features-v0.87.93-105.md`](./archive/features-v0.87.93-105.md) | v0.87.93 – v0.87.105 (multi-account native, login flow, разбиения, cc-media://) | ~30 КБ |
| [`archive/features-v0.87.80-92.md`](./archive/features-v0.87.80-92.md) | v0.87.80 – v0.87.92 (pre-push hook, разбиения 4-7, AccountContextMenu) | ~16 КБ |
| [`archive/features-v0.87.65-79.md`](./archive/features-v0.87.65-79.md) | v0.87.65 – v0.87.79 (план разбиения 1-3, pre-push hook, bubble UI) | ~54 КБ |
| [`archive/features-v0.87.51-64.md`](./archive/features-v0.87.51-64.md) | v0.87.51 – v0.87.64 (groupedUnread удалён, pre-commit hook) | ~54 КБ |
| [`archive/features-v0.87.40-50.md`](./archive/features-v0.87.40-50.md) | v0.87.40 – v0.87.50 (итерации native scroll + unread) | ~40 КБ |
| [`archive/features-v0.87-early.md`](./archive/features-v0.87-early.md) | v0.87.0 – v0.87.39 (запуск native + ранние фиксы) | ~140 КБ |
| [`archive/features-pre-v0.87.md`](./archive/features-pre-v0.87.md) | v0.1.0 – v0.86.10 (до native-режима, 3 марта – 14 апреля 2026) | ~210 КБ |

**Архив не читается по умолчанию.** Запрос к нему — только при явной просьбе («что было в v0.85», «покажи старый changelog»).

**До рефакторинга v0.87.57** файл был 445 КБ (3371 строк, 323 версии). После — ~100 КБ в корне.

---

### v0.95.50 — заархивирована

Откат v0.95.49 (followup re-apply restore). Детали: [archive/features-v0.95.50.md](./archive/features-v0.95.50.md).

---

### v1.0.4 — AI стабильность: AbortSignal + confirm timeout + read retry

`aiToolExecutor.runAgentLoop` принимает: `signal` (AbortSignal — выход из цикла при abort), `confirmTimeoutMs` (default 5 мин — auto-deny если юзер не ответил, audit `permissionResult: 'confirm_timeout'`), `readRetryCount` (default 1 — ретрай для `category: 'reading'` tools при throw, безопасно потому что read idempotent). Write/navigation НЕ ретраятся (риск дубля). +13 unit-тестов. Регрессия ✅.

---

### v1.0.3 — UX: Esc для модалок Phase 4 + mutually-exclusive

PanelModal: `useEffect` с `window.keydown` listener → Esc вызывает onClose. App.jsx: 3 state сведены в один `openPanel` — открытие одной модалки закрывает остальные. +7 тестов. Регрессия ✅.

---

### v1.0.2 — TDLib backend для AI tools (реальная интеграция)

До v1.0.2 AI агент работал **«в никуда»**: `setAgentDeps` передавал `tdlibBackend` напрямую (домены `messages.get/send/markRead`), а `aiAgentSetup` ожидал плоский интерфейс. Сигнатуры не совпадали → fallback.

- **`main/ai/aiAgentBackendAdapter.js`** — адаптер, оборачивает домен-объект. Конвертирует `beforeMessageId` → `offsetId`, `replyToMessageId` → 3-й арг send, `messageId` → `id`. Graceful fallback.
- **`tdlibBackend.messages.search`** — TDLib `searchChatMessages` (с chatId) / `searchMessages` (глобальный). Лимит [1, 100]. Для глобального автосшивка `chatId = accountId:rawId`.
- **`main/main.js`** — `setAgentDeps({ tdlibBackend: createAiAgentBackendAdapter(r.backend), ... })`.
- **+30 тестов** (24 адаптер + 6 search). Регрессия: lint, vitest 1285 ✅, fileSizeLimits 392/392 ✅.

---

### v1.0.1 — UI интеграция Phase 4 панелей (Задачи / Напоминания / AI Activity)

3 иконки справа в TabBar открывают модалки с панелями Phase 4 (созданы в v1.0.0, не подключены к UI):
📝 Задачи (#f59e0b) + badge активных · ⏰ Напоминания (#eab308) + badge pending · 📊 AI Activity (#ec4899).

**Новое**: `src/hooks/useAppCounters.js` (опрос tasks:list/reminders:list каждые 30 сек + событие `tasks:changed`/`reminders:changed`), `src/components/PanelModal.jsx` (overlay + ✕ обёртка). `TabBar.jsx` HeaderButton поддерживает `badge` prop (красный кружок 14×14, "99+" max).

**Поведение**: клик по записи задачи/напоминания с source → handleGoToSource → закрывает модалку + setActiveId(NATIVE_CC) + setPendingNativeNotify (тот же путь что notify:clicked).

**Лимиты**: App.jsx exception 880→940. Регрессия: lint, vitest, fileSizeLimits ✅.

---

### v0.97.0 — AI-агент фундамент (Phase 0 + Phase 1)

**Цель**: Превратить пассивный AI-помощник (генерация текста) в активного агента который вызывает функции (Tool Use API). См. полный план: [.memory-bank/ai-agent-plan/](./ai-agent-plan/README.md).

**Phase 0 — фундамент уведомлений** (5 milestones):
- M0.1 **NotificationSource** ([src/shared/notificationSource.js](src/shared/notificationSource.js)) — паспорт сообщения (messengerId/accountId/chatId/messageId/...). Frozen объект, факторная функция, валидация. **21 unit-тест**.
- M0.2 **useNotifyDispatcher** ([src/hooks/useNotifyDispatcher.js](src/hooks/useNotifyDispatcher.js)) — Action Bus hook. register/unregister/dispatch + debounce 500ms. **9 unit-тестов**.
- M0.3 **Cross-tab notify:clicked** ([src/App.jsx](src/App.jsx) + [src/native/NativeApp.jsx](src/native/NativeApp.jsx)): подписка перенесена из NativeApp (unmount при не-native_cc) в корневой App.jsx. NativeApp принимает payload пропом pendingNotify. **Решена проблема P-01** из .memory-bank/ai-agent-plan/problems.md.
- M0.4 **NotificationSource через IPC**: [nativeStoreIpc.js](src/native/store/nativeStoreIpc.js) создаёт source, [notificationManager.js](main/handlers/notificationManager.js) хранит, [notifHandlers.js](main/handlers/notifHandlers.js) передаёт в notify:clicked. Backward compat: legacy chatTag/messageId остались. **Удалены диагностические логи v0.95.47** (notify-emit / notif-mgr saved / notif-click sending / native-notify-recv / pending-scroll-effect / scroll-to-message).
- M0.5 финал — проверки.

**Phase 1 — Tool Use каркас** (9 milestones):
- M1.1 **Tool Registry** ([src/shared/tools/toolRegistry.js](src/shared/tools/toolRegistry.js)) — реестр с register/lookup/list/schemas. Permission tiers (auto/confirm/deny). **19 unit-тестов**.
- M1.2 **Tool Schemas** ([src/shared/tools/toolSchemas.js](src/shared/tools/toolSchemas.js)) — JSON Schema для goto_message/get_chat_history/search_messages + notificationSourceSchema. **11 unit-тестов**.
- M1.3 **Handlers** ([src/shared/tools/handlers/](src/shared/tools/handlers/)): gotoMessage/getChatHistory/searchMessages. **12 unit-тестов**.
- M1.4 **Anthropic Adapter** ([main/ai/adapters/anthropicAdapter.js](main/ai/adapters/anthropicAdapter.js)): toAnthropicTools/parseAnthropicToolUse/formatToolResult.
- M1.5 **OpenAI + DeepSeek Adapter** ([main/ai/adapters/openaiAdapter.js](main/ai/adapters/openaiAdapter.js)) — DeepSeek полностью OpenAI-compatible.
- M1.6 **ГигаЧат Adapter** ([main/ai/adapters/gigachatAdapter.js](main/ai/adapters/gigachatAdapter.js)) — старый OpenAI format (functions, не tools). **16 unit-тестов на все adapters**.
- M1.7 **aiToolExecutor** ([main/ai/aiToolExecutor.js](main/ai/aiToolExecutor.js)) — main-side agent loop с max iterations 10, permission guards (deny → permission_denied, confirm → not_implemented_in_phase1), audit array. **11 unit-тестов**.
- M1.8 **aiContextBuilder** ([main/ai/aiContextBuilder.js](main/ai/aiContextBuilder.js)) — системный prompt + source паспорт + recent messages с XML-обёрткой (защита от prompt injection). **10 unit-тестов**.
- M1.9 **IPC bridge** ([main/handlers/aiToolIpcHandlers.js](main/handlers/aiToolIpcHandlers.js)) — ai:agent:run/cancel + ai:agent:step стриминг. **8 unit-тестов**.

**Эталоны** (3 источника официальной документации):
- [Anthropic Tool Use](https://docs.anthropic.com/claude/docs/tool-use) — нативный tool_use API.
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling) — JSON Schema standard.
- [DeepSeek Function Calling](https://api-docs.deepseek.com/guides/function_calling) — OpenAI-compatible.

**Тесты** +117 (Phase 0: 30 + Phase 1: 87). Регрессия: lint 0, vitest **1142/1142**, fileSizeLimits, check-memory ✅.

**ВАЖНО**: AI-агент UI кнопка «🤖 Обработать» появится в Phase 3 (см. план). Сейчас агент доступен только через консоль для разработки. AI write-actions (reply_to_message) — в Phase 2 (требует permission UI).

---

### v0.95.48 — заархивирована

Точный jump-to-message из notification (паттерн tdesktop/tweb). Детали: [archive/features-v0.95.48.md](./archive/features-v0.95.48.md).

---

### v0.95.47 — Фикс пустых bubble (sticker/animated/dice) + 5 диагностических логов для notification→scroll

**Две задачи в одном релизе.**

**(A) Фикс пустых сообщений** — юзер: «и почему тут пусто?» (скрин чата «Нейрокомьюнити», 3 bubble подряд только с временем 12:02). Корень: TDLib content types `messageSticker`, `messageAnimatedEmoji`, `messageDice` приходили без `.text` поля. v0.95.40 фиксил только `messageAnimatedEmoji`. Для `messageSticker` mapper возвращал `mediaType='other'` + пустой text → MessageBubble не имеет рендера для 'other' → bubble только с временем.

**Решение** (2 файла, 1 паттерн):
- [tdlibMapper.js](main/native/backends/tdlibMapper.js): расширил emoji fallback из v0.95.40 на 3 типа — `messageAnimatedEmoji` (uses `content.emoji`), `messageSticker` (uses `content.sticker?.emoji || '🎴'`), `messageDice` (uses `content.emoji || '🎲'`). `isLargeEmoji=true` для всех трёх → рендер 56px (Telegram-style большой emoji).
- [tdlibMapperMedia.js](main/native/backends/tdlibMapperMedia.js): `messageSticker` → mediaType=null (было 'other'), `messageDice` → новый case mediaType=null. Иначе 'other' перебивал emoji-рендер.

**Эталоны**: TDLib [messageSticker spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1message_sticker.html) — `sticker.emoji` ассоциированный emoji. [messageDice spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1message_dice.html) — `emoji` field. tweb когда стикер не загружен — fallback на текстовый emoji.

**(B) 5 диагностических логов для notification → scroll-to-message (v0.95.46 не работает в реальной сессии)**. Юзер: «так не работает, проверь почему, добавь логи». Без логов нельзя понять где именно цепочка ломается (5 шагов: emit → save → click → recv → scroll).

**Логи** (по правилу «один лог на шаг цепочки»):
1. [nativeStoreIpc.js](src/native/store/nativeStoreIpc.js) при emit `app:custom-notify` → `logNativeScroll('notify-emit', {chatId, messageId, hasMessageId})`
2. [notificationManager.js](main/handlers/notificationManager.js) при сохранении в notifItems → `console.log('[notif-mgr] saved id=X messageId=Y')`
3. [notifHandlers.js](main/handlers/notifHandlers.js) при `notif:click` → `console.log('[notif-click] sending notify:clicked ...')`
4. [NativeApp.jsx](src/native/NativeApp.jsx) handler notify:clicked → `console.log('[native-notify-recv] ...')` + проверка `hasRequestScroll`
5a. [InboxMode.jsx](src/native/modes/InboxMode.jsx) useEffect pendingScrollToMessage → `logNativeScroll('pending-scroll-effect', {chatIdMatch, msgCount, age})`
5b. [InboxMode.jsx scrollToMessage](src/native/modes/InboxMode.jsx) → `logNativeScroll('scroll-to-message', {foundDirect, domNodesWithMsgId, sampleIds, msgIdType})` — главный лог, видно НАЙДЁН ЛИ элемент в DOM через querySelector

**Конфликты ✅**: логи не меняют поведение, только print. **Лимиты**: InboxMode.jsx ceiling 1060→1080 (диагностика временная, удалить после нахождения корня), nativeStoreIpc.js 720→730.

**Тесты**: regression-only — `changelogData.vitest.js` обновлён под версию 0.95.47, новых unit-тестов нет (это диагностический релиз + 1 эмодзи-fallback).

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅.

---

### v0.95.45 — Фикс «Перейти к чату» в уведомлениях для native режима

Юзер: «кнопка "Перейти к чату" в native НЕ работает, в webview работает».

Корень: [useNotifyNavigation.js:38-39](src/hooks/useNotifyNavigation.js) `webviewRefs.current['native_cc']=undefined → silent return`. Native не имел отдельного слушателя `notify:clicked`. nativeStoreIpc шлёт уведомления с `messengerId='native_cc'`, `chatTag=chatId`.

Решение (2 файла):
- [useNotifyNavigation.js](src/hooks/useNotifyNavigation.js): early return `if (messengerId === 'native_cc') return`.
- [NativeApp.jsx](src/native/NativeApp.jsx): новый useEffect для `notify:clicked` native_cc → парсит chatTag (`accountId:rawId`) → `store.setActiveAccount + setActiveChat`.

**Конфликты ✅**: webview hook не задет, mainWindow.show()+focus() в notifHandlers уже делается ПЕРЕД emit.
**Граничные ✅**: chatTag null→return, без ':'→fallback без setActiveAccount, удалённый chatId→естественный fallback, идемпотентно.
**Регрессия**: lint 0, vitest 1016/1016, fileSizeLimits 334/334, check-memory ✅.

---

### v0.95.44 — Прогресс % загрузки файлов через TDLib updateFile

Расширяет v0.95.43 (скрепка) — % загрузки больших файлов.

- TDLib spec [`updateFile`](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1update_file.html): эмитится при изменении файла. `remote.uploaded_size / size + is_uploading_active/_completed`.
- [tdlibClient.js](main/native/backends/tdlibClient.js) `'updateFile'` case **расширен** (download path v0.94.1 не задет): если `remote && size > 0 && (isActive || isCompleted)` → emit `'upload:progress'`.
- [tdlibIpcBridge.js](main/native/tdlibIpcBridge.js): channel `'tg:upload-progress'`. **Throttle Math.floor(percent)** — emit только при изменении целого %.
- [nativeStoreIpc.js](src/native/store/nativeStoreIpc.js): handler обновляет `state.uploads[fileId]`. `done` → удалить. **Auto-cleanup 60с** (orphan защита).
- [useUploadProgress.js](src/native/hooks/useUploadProgress.js) NEW: агрегатный прогресс всех uploads.
- [FilePreviewBar.jsx](src/native/components/FilePreviewBar.jsx): прогресс-bar 4px + текст «Загрузка... 5.2 МБ / 10.3 МБ». Кнопка показывает `{percent}%`.

Эталоны: tweb appDownloadManager (throttle 1%), Discord upload bar.

**Конфликты ✅**: file:update (v0.94.1) — отдельный emit, не задет. **Граничные ✅**: size=0/uploaded>total/без remote/cancel/parallel uploads.
**Производительность**: throttle ~100/upload вместо ~100/сек.
**Тесты** (+11): useUploadProgress +6 (агрегат/clamp/null), tdlibEmitContracts +3 (emit/done/skip), formatBytes +5.

**Регрессия**: lint 0, vitest 1016/1016, fileSizeLimits 334/334, check-memory ✅.

---

### v0.95.32 — Производительность WhatsNewModal + деловой стиль changelog

Убран `backdrop-filter: blur(8px)` на overlay (Chromium пересчитывал blur каждый кадр скролла → 30-60мс/кадр), box-shadow blur 40→16px, добавлены `isolation: isolate` + `contain: layout style paint` + `overscroll-behavior: contain`. Эталоны: Telegram Web K / Discord / Linear modals. Полный текст: [`archive/features-v0.95.32.md`](./archive/features-v0.95.32.md).

---

### v0.95.31 — Аккаунты вниз + Drag-n-drop + множественный typing + throttle реакций

Структурный UX-релиз: аккаунты вниз левой колонки (Telegram Desktop / Slack паттерн) с HTML5 drag-n-drop через localStorage, множественный typing «Иван и Маша печатают...» (расширение `state.typing[chatId]` до Map<userId>), throttle реакций 200мс leading-edge (защита от FLOOD_WAIT). +32 unit-теста (accountOrder/formatTypingUsers/reactionThrottle). Полный текст: [`archive/features-v0.95.31.md`](./archive/features-v0.95.31.md).

---

### v0.95.30 — Плавная auto-scroll + цветовая тема + dropdown + opacity 0.95

UX-релиз renderer-only: smoothScrollTo easeOutCubic 250мс, 5 цветовых тем (Telegram/Индиго/Teal/Premium/Violet), ChatTypesDropdown, `--bubble-opacity: 0.95`. Цветовая тема в v0.95.30 НЕ работала (CSS specificity ловушка — фикс v0.95.33+v0.95.34). Полный текст: [`archive/features-v0.95.30.md`](./archive/features-v0.95.30.md).

---

### v0.95.29 — Реакции + Telegram-style header + General иконка + render-counter

Реакции 👍❤️🔥🥰👏😁🤔🤯 (backend+IPC+UI), Telegram-style header (аватар + статус «в сети»/«был(а) в HH:MM»/«N участников»), дефолтная 📢 для General форум-темы, render-counter для диагностики дубля сообщений. +27 unit-тестов. Полный текст: [`archive/features-v0.95.29.md`](./archive/features-v0.95.29.md).

---

### v0.95.28 — Telegram-style auto-scroll + счётчик ↓N без «слепой зоны»

Разделение на 2 флага: `atBottom` через Schmitt-trigger 40/120 (только для UI кнопки ↓, не сломан фикс v0.95.2) + новый `physicallyAtBottom` (порог 30px без Schmitt) для логики auto-scroll и счётчика ↓N. Закрыта «слепая зона» 40-120px, где счётчик не рос и не было auto-scroll. Эталоны: Telegram Web K `isAtBottom() + scrollToEnd()`, Telegram Desktop `scrollTop >= scrollTopMax - threshold`. Полный текст: [`archive/features-v0.95.28.md`](./archive/features-v0.95.28.md).

---

### v0.95.27 — Расширенная диагностика send pipeline

Логи `callSource` / `textPreview` / `outgoingCountBefore` / `lastOutgoingId` в `InboxMessageInput` / `InboxMode.handleReplySend` / `store.sendMessage` / `tg:new-message` handler — ловим «двойную отправку». Стабилизировано v0.95.29 (логи использованы). Полный текст: [`archive/features-v0.95.27.md`](./archive/features-v0.95.27.md).

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

**Корень**: в [nativeStoreIpc.js:396](src/native/store/nativeStoreIpc.js) (с **15 апреля 2026**, v0.87.14 — **47 дней не ловили**) была строка:

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
- **Telegram Web K** [appMessagesManager.ts:7577](https://github.com/morethanwords/tweb): `++dialog.unread_count` БЕЗУСЛОВНО. Decrement только в `onUpdateReadHistoryInbox`.
- **Telegram Desktop** [history_widget.cpp:3946](https://github.com/telegramdesktop/tdesktop): atBottom guard ПЕРЕД `readInboxOnNewMessage` — если НЕ в низу, не трогает counter.
- **WhatsApp Web / Discord**: ACK только при `isActive && focused && atBottom`.

Наш фикс = tweb pattern (самый простой, decrement только server).

**Почему 47 дней не ловили** (7 факторов — полный анализ в [mistakes/native-scroll-unread.md](.memory-bank/mistakes/native-scroll-unread.md)):
1. `useReadByVisibility` маскировал — для большинства сообщений server обновлял правильно, локальное обнуление совпадало по значению
2. Тест-пробел: проверяли только `tg:chat-unread-sync`, не `tg:new-message`
3. Сага v0.87.41 затронула только `markRead`, никто не сопоставил с `tg:new-message`
4. Code review v0.87.103 (разбиение файлов) был архитектурным, не функциональным
5. В логах не виден — оба events валидны по отдельности
6. Невозможно поймать в jsdom (нужны scroll + push + server delay)
7. Два параллельных «unread» счётчика путали (chat.unreadCount + useNewBelowCounter)

**3 уровня защиты** (чтобы НИКОГДА не вернулось):
1. **4 регресс-теста** в [nativeStore.vitest.jsx](src/native/store/nativeStore.vitest.jsx) — `tg:new-message для активного чата +1`, `outgoing не меняет`, `decrement через server sync`
2. **Static-test** в [modernPatternsGuard.test.cjs](src/__tests__/modernPatternsGuard.test.cjs) — regex проверка что строка не вернётся
3. **Запись** в [mistakes/native-scroll-unread.md](.memory-bank/mistakes/native-scroll-unread.md) — полный разбор + правило для будущих сессий

**Что юзер увидит**:
| Сценарий | Раньше | После фикса |
|---|---|---|
| Чат активен, юзер atBottom, новое сообщение | 48 → 0 (моментально) | 48 → 49 → 0 (~500мс через server) — точно как Telegram |
| Чат активен, юзер НЕ atBottom | 48 → 0 ❌ **БАГ** | 48 → 49 (остаётся пока не дочитает) |
| Чат неактивен | +1 (без изменений) | +1 (без изменений) |
| Своё сообщение | без изменений | без изменений |

**Регрессия**: lint 0, vitest 840/840 (+4 новых), modernPatternsGuard 16/16 (+1), check-memory ✅.

---

### v0.95.23 – v0.95.26 — заархивированы

См. [`archive/features-v0.95.23-26.md`](./archive/features-v0.95.23-26.md): курсор в input после отправки (v0.95.23), initial backfill истории TDLib quirk (v0.95.24), voice player + spellcheck + action-bar под bubble + «Что нового» (v0.95.25), фикс 47-дневного бага unreadCount (v0.95.26). Все стабилизированы.

---

### v0.95.19 – v0.95.22 — заархивированы

См. [`archive/features-v0.95.19-22.md`](./archive/features-v0.95.19-22.md): диагностика tg-new-message + tg-messages-applied (v0.95.19), финал саги jump-to-end через gapMessages > 0 (v0.95.20), бейдж форум-группы как Telegram Desktop (v0.95.21), форум-overlay + Escape focus-pattern (v0.95.22). Стабилизировано.

---

### v0.95.15 – v0.95.18 — заархивированы

Cм. [`archive/features-v0.95.15-18.md`](./archive/features-v0.95.15-18.md): итеративный fetch (v0.95.15), jump-to-end в форум-топиках + smoothScroll easeOutCubic (v0.95.16), регрессия untilMessageId early break (v0.95.17), двухфазный scroll + ForumTopicEmptyState + не мигать shimmer (v0.95.18). Стабилизировано через v0.95.20–21.

---

### v0.95.11 — Диагностика «не грузит дальше при unread > загруженного» (БЕЗ смены поведения)

Юзер жалоба + лог анализ: чат «Компьютерная | IT, Digital», unread=724, загружено 394 сообщения, юзер в самом низу (`bottomGap=0`). Клик ↓ — no-op (уже у низа загруженного). Load-newer не срабатывает потому что юзер не двигает scroll. Остальные ~330 непрочитанных — за пределами окна загрузки. **Корневой ответ — jump-to-end-of-chat** (как Telegram Desktop: при unread>0 reload вокруг `chat.lastMessage.id`). Прежде чем менять поведение — собираю реальные числа на live-сессии.

#### Что добавлено (только логи, поведение не изменено)

1. [tdlibMapper.js mapChat](main/native/backends/tdlibMapper.js) — новое поле `lastMessageId` (id последнего сообщения чата на сервере по TDLib).
2. [InboxMode.jsx scrollToBottom](src/native/modes/InboxMode.jsx) — `button-scroll-bottom` лог расширен полями:
   - `loadedIncoming` — число incoming в `activeMessages`
   - `chatLastMessageId` — id последнего на сервере
   - `loadedLastId` — id последнего загруженного
   - `gapMessages` — оценка количества пропущенных сообщений между loaded и server (TDLib msg_id step = 2^20)
   - `unreadVsLoaded` — `activeUnread - loadedIncoming` (сколько непрочитанных вне DOM)
3. [useScrollDiagnostics.js chat-open](src/native/hooks/useScrollDiagnostics.js) — добавлены `lastMessageId` + `readInboxMaxId`.

#### Что покажет лог на реальной сессии

- `chat-open lastMessageId=X readInboxMaxId=Y unread=Z messages=N` — сразу видно настройку gap'а
- При клике ↓: `button-scroll-bottom gapMessages=K unreadVsLoaded=M` — K показывает «насколько ВПЕРЁД сервер от загруженного», M — «сколько непрочитанных НЕ в DOM»

#### Что НЕ изменено

- `scrollToBottom` — поведение то же: `el.scrollTo(scrollHeight)` + mark-read до loadedLast + load-newer через handleScroll
- Без изменений: drag-resize, gate bypass mark-read (v0.95.8), loading-pulse кнопки (v0.95.9 Fix 4a), все защиты v0.94.7/v0.91.13

#### Следующий шаг

После запуска v0.95.11 юзером и анализа лога — если `gapMessages>50` и `unreadVsLoaded>0` подтвердятся → точный фикс v0.95.12 (jump-to-end через `loadMessages(chatId, { aroundId: chat.lastMessageId, force: true })` + scroll вниз + markRead до lastMessageId).

**Регрессия**: lint 0, vitest 721/721, check-memory ✅. Поведение не менялось — тесты не обновлялись.

---

### v0.95.10 — Откат scroll-continuation (юзер не просил), loading-pulse кнопки ↓ остаётся

Юзер: «Продолжение scroll после load-newer я это не просил убирай, я просил эффект загрузки на кругшке сделать, пока идет подгрузка новых сообщений». Извинения — автоматическое довинчивание scroll к низу при дозагрузке (`scrollIntentRef` + `useLayoutEffect` из v0.95.9 fix 4b) было не запрошено — юзер хотел ТОЛЬКО visual effect на кнопке.

#### Удалено

В [InboxMode.jsx](src/native/modes/InboxMode.jsx) удалены:
- `scrollIntentRef` ref + установка intent в `scrollToBottom`
- `useLayoutEffect` который слушал `activeMessages.length` / `loadingNewer` и довинчивал scroll к низу
- Комментарии о continuation

#### Остаётся (Fix 4a v0.95.9, юзер просил это)

- ✅ `--loading` класс на [ScrollBottomButton](src/native/components/InboxChatPanel.jsx) когда `loadingNewer=true`
- ✅ Accent border + box-shadow pulse 1.4s в [styles-overlays.css](src/native/styles-overlays.css)
- ✅ Tooltip «Подгружаю свежие сообщения…»
- ✅ loadingNewer prop в ScrollBottomButton

Юзер видит: кликнул ↓ → кнопка пульсирует пока идёт «Загружаю ещё…» (визуальный feedback есть). Но scroll НЕ продолжается автоматически — это поведение по-умолчанию (один scroll по клику, как в v0.95.6).

**Регрессия**: lint 0, vitest 721/721, fileSizeLimits 283/283, check-memory ✅.

---

### v0.95.4 — Фикс «дёрг при повторном открытии seen-чата» (useLayoutEffect) + Windows CI timeout

**Корень** (подтверждён диагностикой v0.95.3): в [useInitialScroll.js](src/native/hooks/useInitialScroll.js) ветка 2 (already-seen) использовала `useEffect` — он выполняется **ПОСЛЕ paint** ([React docs](https://react.dev/reference/react/useEffect): «After every render with changed dependencies»). При смене seen-чата React сначала рисует новый кадр (где scrollContainer показывает позицию ПРЕДЫДУЩЕГО чата — это общий persistent DOM-контейнер), потом выполняется effect и ставит `scrollTop=saved` → юзер на 1 кадр видит чужую позицию = «дёрг».

**Решение** ([React docs useLayoutEffect](https://react.dev/reference/react/useLayoutEffect): «fires synchronously after all DOM mutations but BEFORE the browser paints»): `useEffect` → `useLayoutEffect` в [useInitialScroll.js](src/native/hooks/useInitialScroll.js). Restore выполняется до paint → юзер видит сразу правильную позицию, без вспышки.

**Что критически важно** (по той же React-доке — useLayoutEffect блокирует paint): внутри ТОЛЬКО micro-операция `scrollTop=N` (микросекунды), никаких fetch/тяжёлой работы. Это уже соблюдено — диагностика v0.95.3 подтвердила `msSinceEffectStart=0` + `attempts=0` (restore синхронный, scrollEl сразу готов). Та же паттерн уже работает в [InboxMode load-older re-pin](src/native/modes/InboxMode.jsx) (v0.94.2). Поведение ветки 1 (initial scroll первого открытия) НЕ менялось — там `setTimeout 150ms` остаётся.

#### Windows CI timeout fix

Симптом: GitHub Actions `test-and-build (windows-latest)` упал — `AccountContextMenu.vitest.jsx` первый тест «показывает имя аккаунта» 5671мс при дефолтном vitest `testTimeout=5000` (остальные 18 тестов файла прошли за 13-36мс). Ubuntu прошёл.

Корень — **cold-start первого теста файла** на медленном Windows CI runner-е: загрузка модуля `AccountContextMenu.jsx` (большие inline styles) + первый рендер React 19 в happy-dom + первый `useEffect` с `setTimeout(0)`. На локальной машине и Ubuntu это 50-100мс, на Windows runner-е — 5-6с.

Решение ([vitest docs testTimeout](https://vitest.dev/config/#testtimeout)): глобальный `testTimeout: 15000` в [vitest.config.mjs](vitest.config.mjs). Это **потолок**, не фиксированное ожидание — нормальные тесты не замедляются, только cold-start не упирается в 5с.

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅.

---

### v0.94.0 — ПОЛНОЕ УДАЛЕНИЕ виртуализации (react-virtuoso) → простой DOM + pixel scrollTop

**Корень всей саги scroll restore (v0.91.1 – v0.93.0, ~30 версий)**: виртуализация (сначала react-window, потом react-virtuoso) фундаментально несовместима с точным восстановлением позиции. Обе библиотеки пересчитывают высоты строк при ремаунте `key={cacheKey}` → `scrollHeight` скачет → restore промахивается. Virtuoso работает с **дискретными индексами строк + alignment** (`align: 'start'/'end'`) → отсюда «прилипание» к картинкам/видео и «выравнивание» которое юзер видел на скринах. Никакой `offset`, `anchorMsgId`, `StateSnapshot` не лечит это полностью — это архитектурное ограничение.

**Решение** (как у Telegram Web K, который НЕ виртуализирует): рендерим **все сообщения обычным DOM**, сохраняем **простой пиксельный `scrollTop`** (число). При ремаунте `scrollHeight` стабилен → `el.scrollTop = saved` восстанавливает позицию ТОЧНО. Типичный чат 100–300 сообщений в памяти — без проблем с производительностью.

#### Что изменено

**1. [`scrollPositionsCache.js`](src/native/utils/scrollPositionsCache.js)** — формат `Map<chatId, {scrollTop:number, atBottom:boolean}>`. Удалён `findVisibleAnchorMsgId`. Storage version → 4 (старые v2/v3 anchor-форматы игнорируются — возвращается пустая Map).

**2. [`VirtualMessageList.jsx`](src/native/components/VirtualMessageList.jsx)** — удалён `import { Virtuoso }`. Теперь обычный `<div>` со `overflow-y:auto` + `overflow-anchor:auto` (браузер сам держит позицию при подгрузке старых сообщений сверху) + `renderItems.map(...)`. `listRef` через `useImperativeHandle`: `element` getter + `scrollToRow({index, align})` через `scrollIntoView`.

**3. [`useInitialScroll.js`](src/native/hooks/useInitialScroll.js)** — restore через `el.scrollTop = saved.scrollTop` (или `el.scrollHeight` если `atBottom`). Ветка 1 (первое открытие): saved.scrollTop → firstUnread (querySelector data-msg-id) → низ. Ветка 2 (возврат): pixel scrollTop. `isRestoringRef` closed-loop guard сохранён (500мс).

**4. [`useInboxScroll.js`](src/native/hooks/useInboxScroll.js)** — сохраняет `{scrollTop: el.scrollTop, atBottom}` с guard `isRestoringRef`. Вернул load-older (`scrollTop < 100`) и load-newer (`maybeTrigger`) БЕЗ ручной коррекции scrollTop — `overflow-anchor:auto` держит позицию при prepend.

**5. [`useScrollPositionAutosave.js`](src/native/hooks/useScrollPositionAutosave.js)** — interval 1.5с сохраняет `{scrollTop, atBottom}`, пропуск при `isRestoringRef`.

**6. [`InboxMode.jsx`](src/native/modes/InboxMode.jsx)** + **[`InboxChatPanel.jsx`](src/native/components/InboxChatPanel.jsx)** — удалены `initialTopMostItemIndex`, `firstItemIndex` state, 2 useEffect (reset firstItemIndex + tg:messages append decrement), `handleStartReached`, `handleEndReached`, `findRenderItemIndex`. `scrollToVirtualRow` переписан на querySelector `[data-msg-id]`. `scrollToAbsoluteBottom` сохраняет `{scrollTop: el.scrollHeight, atBottom: true}`.

**Удалено**: `useInitialScrollDiag.js` (git rm). Пакет `react-virtuoso` удалён (`npm uninstall`).

**Регрессия**: lint 0, vitest 658/658, fileSizeLimits 272/272, check-memory ✅. 3 теста `useInitialScroll.vitest.jsx` переписаны под pixel API (были на `onRestoreAnchor`/`onMissingTarget`/`{anchorMsgId}`).

**Проверить визуально** (просьба юзеру): открыть чат → пролистать на середину → перейти в другой чат → вернуться → позиция должна быть РОВНО где оставил, без выравнивания и прилипания к картинкам.

---

### v0.93.0 — заархивирован

Pixel-perfect scroll restore через `LocationOptions.offset` Virtuoso API. Полностью superseded в **v0.94.0** (виртуализация удалена). Детали: [`archive/features-v0.93.0.md`](./archive/features-v0.93.0.md).
### v0.92.0 – v0.92.6 — заархивированы

Сага Virtuoso scroll restore (6 версий). Полностью superseded в **v0.94.0** (виртуализация удалена, restore через простой pixel scrollTop). Детали: [`archive/features-v0.92.0-6.md`](./archive/features-v0.92.0-6.md).

---

### v0.91.24 — Фикс Проблемы 2: блок load-older во время restore + re-scroll через onRowsRendered + abort на user-scroll

### v0.91.11 — Диагностика «возврат в чат прыгает вверх» (4 лога в ветке already-seen)

Симптом: A → B → возврат в A → перелистывает вверх, не на сохранённую позицию.

В [`useInitialScroll.js`](src/native/hooks/useInitialScroll.js) ветка «already-seen» имела 3 silent edge case'а: `scrollRef.current=null` (DOM не готов), `getSavedScrollTop` вернул `undefined`, и race с react-window `useDynamicRowHeight({key: cacheKey})` — при смене `cacheKey={store.activeChatId}` ([`VirtualMessageList.jsx:211`](src/native/components/VirtualMessageList.jsx#L211)) кэш высот сбрасывается → `scrollHeight` временно мал → `el.scrollTop = savedTop` тихо обрезается по [MDN scrollTop spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop).

Добавлены 4 точки логирования (логика restore не тронута):

| Событие | Поля | Что покажет |
|---|---|---|
| `initial-restore-attempt` | `chatId, savedTop, scrollHeight, clientHeight` | Хватит ли scrollHeight для savedTop |
| `initial-restore-applied` | `chatId, requestedTop, actualTop, clamped` | `clamped=true` = scrollHeight мал |
| `initial-restore-postcheck` | `chatId, afterMs:100, finalTop, scrollHeight` | Позиция после remeasure react-window |
| `initial-restore-skip` | `chatId, reason` | `no-scrollEl` / `no-saved` / `not-returning` |

Что НЕ менял: `el.scrollTop = savedTop` присвоение, `lastActiveChatIdRef` (v0.91.7 guard), ветку 1, существующее `initial-restore-saved`.

Конфликты ✓: v0.91.7 (isReturning сохранён), v0.91.6 (ветку 1 не трогаем), react-window (listRef/cacheKey не тронуты). Граничные ✓: savedTop=0, undefined, scrollRef=null, быстрый A→B→A.

Откат: `git revert <hash>` — один коммит, только логи. После анализа лога юзера — точечный фикс, логи удалю в том же коммите.

---


### v0.89.41 → v0.91.0 — серия WebContentsView миграция, 16 версий, полный откат

Электрон рекомендовал переход с `<webview>` на WebContentsView. Серия v0.89.41-v0.90.2 — 16 итераций (12 опровергнутых гипотез, архитектурная миграция на BaseWindow). Корень провала найден через WebSearch: [Electron Issue #44934](https://github.com/electron/electron/issues/44934) — на Windows 11 `addChildView(WebContentsView)` + `loadURL` крашит main, closed «not planned».

**v0.91.0 ПОЛНЫЙ ОТКАТ**: вернули `BrowserWindow{webviewTag:true}` + `<webview>` (production-tested). Удалены: webContentsViewManager.js, webContentsViewIpcHandlers.js, WebContentsViewSlot.jsx, webContentsViewBridge.js + 3 теста.

**Сохранены полезные побочки**: UncaughtErrorToast.jsx, global error handlers, idbCacheMetrics.js, crashpad-фильтр, [`electron-breaking-changes.md`](.memory-bank/electron-breaking-changes.md).

**Полный урок и 7 правил для будущих миграций** — в [`mistakes/electron-core.md`](.memory-bank/mistakes/electron-core.md).

### v0.89.42 → v0.89.44 — Phase 2/2.3 WebContentsView миграция (откачено в v0.91.0)

Feature-flag в Settings, условный рендер `<WebContentsViewSlot>` vs `<webview>`, bridge для webviewSetup, реактивный `wcv:load-url`, cleanupPartition IPC, breaking-changes docs, IDB cache hit/miss metric. Полная история в [`mistakes/electron-core.md`](.memory-bank/mistakes/electron-core.md). Все файлы удалены в v0.91.0.

---

### v0.89.42 — Phase 2 webview миграции: feature flag + условный рендер (pilot без ChatMonitor)

Phase 2.1: toggle `useWebContentsView` в SettingsPanel (default OFF). Phase 2.2: App.jsx условный рендер `<WebContentsViewSlot>` vs `<webview>`. Phase 2.3 (min): pilot БЕЗ ChatMonitor — задокументировано. Phase 2.3 (full) — отдельная фаза. Регрессия +2 проверки.

---

### v0.89.41 — Инфраструктура миграции `<webview>` → `WebContentsView` (feature-flag, default OFF)

По [Electron docs](https://www.electronjs.org/docs/latest/api/webview-tag) «We currently recommend to not use the webview tag, consider WebContentsView». Создана инфраструктура без переключения текущего кода — нулевой риск регрессии. **Файлы**: `webContentsViewManager.js` (класс + 12 forwarded events, graceful degradation), `webContentsViewIpcHandlers.js` (7 IPC `wcv:*` + `wcv:event` bridge), `WebContentsViewSlot.jsx` (React-слот + ResizeObserver → setBounds), регистрация в `main.js`. **Tests**: 638 → 650 (+12 unit + 5 guard).

---

### v0.89.40 — IndexedDB кэш расширен на ВСЕ чаты + TTL cleanup + loadOlder/Newer save

Расширение v0.89.39 (только топики) на все типы чатов. Модуль переименован [`topicMessagesCache.js`](../src/native/utils/topicMessagesCache.js) → [`messagesCache.js`](../src/native/utils/messagesCache.js) (старый — re-export для совместимости). DB `cc-messages-cache`, ключ `chatId:topicId||_main`. **Интеграции в nativeStore.js**: (1) `loadMessages` для обычных чатов делает optimistic render из IDB + сохраняет ответ; (2) `loadOlder/loadNewerMessages` после merge сохраняют tail в IDB; (3) `selectForumTopic` переведён на новые имена. **TTL cleanup**: `cleanupExpired()` через index `ts` + `IDBKeyRange.upperBound` — удаляет всё старше 7 дней. Вызывается при инициализации store через `requestIdleCallback`. **WebContentsView перепроверка**: [`BrowserView` deprecated с **Electron v29.0.0**](https://www.electronjs.org/docs/latest/api/browser-view) (я писал v30 — ошибка). [`<webview>`](https://www.electronjs.org/docs/latest/api/webview-tag) — Electron официально пишет «we recommend to not use». **Tests**: 631 → 638 (+7).

---

### v0.89.39 — AbortController в hooks + IndexedDB кэш форум-топиков (Telegram-style optimistic render)

**Совет 2 — AbortController**: в [`MuteMenu.jsx`](../src/native/components/MuteMenu.jsx) и [`AccountContextMenu.jsx`](../src/native/components/AccountContextMenu.jsx) (по 2 listener'а: pointerdown + keydown) — `{ signal: ac.signal }` + один `ac.abort()` вместо 2 removeEventListener. В файлах с 1 listener — НЕ трогаю (SIMPLICITY).

**Совет 3 — IndexedDB optimistic render**: новый [`topicMessagesCache.js`](../src/native/utils/topicMessagesCache.js) — IDB store `cc-topic-cache`, последние 50 сообщений на топик, TTL 7 дней, graceful degradation. В [`selectForumTopic`](../src/native/store/nativeStore.js) при клике параллельно `loadTopicMessages` → если кэш есть → optimistic render. После сервера → `saveTopicMessages`. Как Telegram Desktop через TDLib local cache.

**Tests**: 624 → 631 (+7).

---

### v0.89.38 — Модернизация по документации стека (Security + Pointer Events + webview overlay)

**4 группы одним коммитом**. A: `trayManager.js` log-viewer перешёл на `contextIsolation:true + preload` (Electron Security Don't #2/#3). B: разделитель AI sidebar залипал — глобальный `position:fixed, zIndex:999999` overlay вместо локального `absolute` (Electron webview docs: события не пересекают границу). C: Mouse Events → [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) в `useAIPanelResize` (+`setPointerCapture`) и 3 dropdown'ах. D: ловушка #29 update — `forceFinalSlideInState()` теперь в ОБОИХ путях (animationend + fallback). Тесты: новый `modernPatternsGuard.test.cjs` (15), `transparentWindowGuard` (19), 624 vitest. Подключены к pre-commit/push.

---

### v0.89.37 — Skeleton overlay + race protection для форум-топиков (Telegram/Discord-style)

Пользователь: «бегает строка загрузки и всё, не грузит». Лог 09:46:24: топик 2325 загрузился за 188мс, но `hasEl=false` (DOM scrollRef ещё не подключён) → `chatReady=false` → `opacity:0` → **~600мс чёрного экрана** на первой загрузке.

**Две корневые причины**:
1. [`InboxChatPanel.jsx:157`](../src/native/components/InboxChatPanel.jsx) условие `&& visibleMessages.length > 0` скрывало overlay при `messages=0` → юзер видел чёрно вместо «Загружаю»
2. [`nativeStore.js selectForumTopic`](../src/native/store/nativeStore.js) без race protection: при быстром A→B ответ A мог затереть state

**Сверка с мессенджерами**: Telegram Desktop, WhatsApp Web, Discord, Slack — все показывают skeleton **сразу** + используют requestId/AbortController.

**Решение 1 (Skeleton, 1 строка)**: убрано `&& visibleMessages.length > 0` — overlay показывается с первого клика.

**Решение 2 (Race protection, ~15 строк)**: `selectTopicRequestRef = useRef(new Map())` хранит последний requestId на chatId. Каждый invoke получает уникальный id. После await сравниваем — если в Map другой id, ответ игнорируем (`{ ok: false, stale: true }`).

**Tests**: 623 → 624 (+1 регрессионный для race). **Ловушка** в `mistakes/native-scroll-unread.md`.

---

### v0.89.36 — Второй корень notification ribbon: force-transform в slideIn fallback (ловушка #29)

Через час после v0.89.35 пользователь снова видит «полосу». Лог 10:11:00: 4 нотификации в одну миллисекунду (race Telegram sync). DOM: `id=105 realTf=matrix(1,0,0,1,380,0) slid=true` — `slideInDone=true` поставлен, но transform застрял на translateX(380). **Корень**: в [`notification.js:573-582`](../main/notification.js) v0.89.23 fallback ставил **только флаг**, не форсировал transform. `calcHeight()` учитывал element 182px, окно расширялось. **Сверка**: Telegram Desktop / WhatsApp / Discord / Slack — все гарантируют final state через JS. **Решение** (~5 строк): fallback теперь форсирует `animation='none'` + `transform='translateX(0) scale(1)'` + `opacity='1'`. Регрессия: тест проверяет 3 force-style. **Ловушка #29** в `mistakes/notifications-ribbon.md`.

---

### v0.89.35 — Корень серии notification ribbon: `backgroundThrottling: false` (ловушка #28)

Через сутки после «закрытия» серии v0.89.18-v0.89.27 пользователь снова увидел пустую полосу + кнопка «Закрыть» не реагирует. Лог 09:07: `DOM snapshot id=17 realTf=matrix(1,0,0,1,380,0)` — item застрял с `translateX(380px)` (0% keyframe из CSS `slideIn`). Анимация не запустилась.

**Сверка с [Electron docs](https://www.electronjs.org/docs/latest/api/browser-window)** (verbatim): «If `backgroundThrottling` is disabled, the visibility state will remain `visible` even if the window is minimized, occluded, or hidden».

**Сверка с кодом**: `notificationManager.js` создавал notifWin БЕЗ `backgroundThrottling: false` → по умолчанию Chromium throttling включён → CSS animations и `requestAnimationFrame` паузятся когда окно `hide()` или occluded → `slideIn` keyframes не выполняются → item застрял → невидим но bounds учитывают высоту → **«пустая полоса»**.

**5 предыдущих фиксов (v0.89.18 safeHide, v0.89.22 убран setIgnoreMouseEvents, v0.89.23 IGNORE stale, v0.89.26 hideIfEmpty, v0.89.27 rendererPure) закрывали симптомы. Корень — `backgroundThrottling: true` по умолчанию — не трогали.**

Также закрывает старую ловушку **v0.47.2** «requestAnimationFrame НЕ работает в hidden BrowserWindow» — тот же стек, тот же throttling, тот же фикс.

**Решение** — 1 строка в [`notificationManager.js:91-97`](../main/handlers/notificationManager.js): добавлен `backgroundThrottling: false` в `webPreferences`.

**Регрессионная защита**: [`transparentWindowGuard.test.cjs`](../src/__tests__/transparentWindowGuard.test.cjs) проверяет наличие параметра. Pre-commit hook падает при удалении (верифицировано: убрал параметр → 17/18 ✅, вернул → 18/18 ✅).

**Ловушка #28** в `mistakes/notifications-ribbon.md` — полная история + правило для будущего.

---

### v0.89.34 — Массовое разбиение: 0 предупреждений 80%+ лимита (запас 20% во всех файлах)

По указанию пользователя: было 12 файлов на 80-99% лимита, стало **0**. Production: `tdlibMessages.js` (475→356, sendFile→tdlibSend.js), `tdlibMapper.js` (417→282, media→tdlibMapperMedia.js), `tdlibIpcHandlers.js` (410→323, event bridge→tdlibIpcBridge.js), `useInboxNewerPrefetch.js` (121→112). Vitest: 4 файла разбиты + 4 новых файла. Compaction: `fileSizeLimits.test.cjs` (345→277, exceptions→отдельный модуль), 3 vitest файла compaction headers/blank lines. **Tests**: 623/623, 7 новых файлов, 0 регрессий.

---

### v0.89.33 — Divider «Новые сообщения» застывает на snapshot позиции открытия

После v0.89.32: полоска постоянно перепрыгивает при прокрутке. Лог: за 36с 8 пересчётов `firstUnreadId`. **Корень**: useEffect пересчёта имел в deps живой `activeReadInboxMaxId` → каждый server sync двигал divider. **Сверка**: TDLib `openChat` lifecycle + Telegram Desktop/WhatsApp/Discord/Slack — все делают snapshot. **Решение** (~15 строк + 1 тест): `frozenReadCursorRef`, сброс по `activeViewKey`, фиксация на первом ненулевом cursor. Счётчик боковой панели остался живой (v0.87.41). **Tests**: 622 → 623. **Ловушка** в `mistakes/native-scroll-unread.md`.

---

### v0.89.32 — Диагностические логи для форум-топиков (markRead pipeline + prepend size jumps)

После v0.89.31 две жалобы: счётчик замирает / окно дёргается. Лог 17:57 показал: (1) замирания = `read-batch-skip` watermark защита v0.87.37 (правильное поведение); (2) дёргание = `top=27666→1669` после prepend 100 msg в react-window. 100% решения нет — добавлены диагностические логи: `[topic-mark] INVOKE/OK/ERROR` в backend, `[topic-mark-ui] SEND` + `[topic-mark-refresh] delta` в store, `[topic-load-older/newer] before/added/after`. **Tests**: 622 без изменений.

---

### v0.89.31 — Форум-топики: плашка «N из M» двигается, счётчик сбрасывается (ловушка #30)

После v0.89.30 пользователь сообщил: плашка «100 из 217» замирает, счётчик 217 не сбрасывается. **Три причины**: (1) `loadOlder/loadNewerMessages` для топиков не пересчитывали `messageWindows[key].loadedIncoming`; (2) [`viewMessages`](https://github.com/tdlib/td/blob/master/td/generate/scheme/td_api.tl) для форумов требует `source: messageSourceForumTopicHistory`, мы не передавали; (3) `unreadWindowIncomplete` блокировал force-read.

**Правки** (3, ~30 строк): `nativeStore.js` loadOlder/Newer для топика пересчитывают `messageWindows[key]` через `buildUnreadWindowMeta`; [`tdlibBackend.js`](../main/native/backends/tdlibBackend.js) `markTopicRead` добавляет `source: messageSourceForumTopicHistory`. **Tests**: 620 → 622. **Ловушка #30** в `mistakes/tdlib-forum.md`.

---

### v0.89.30 — Форум-топики: сообщения теперь грузятся (`forum_topic_id` ≠ `message_thread_id`, ловушка #29)

После v0.89.29: топик OZON → `Message not found`, General → `Scheduled messages can't have message threads`.

**Корень**: `forum_topic_id` (int32, UI) ≠ `message_thread_id` (int53, API). [TDLib docs](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic_info.html): `getMessageThreadHistory` ожидает **message_id первого сообщения треда**, а мы передавали короткий UI-id. Плюс General топик (`is_general=true`) = весь чат, для него `getChatHistory`.

**Решение** (3 файла, ~30 строк):
1. [`tdlibBackend.js`](../main/native/backends/tdlibBackend.js) `forum.getTopics`: добавлены `threadMessageId: t.last_message?.message_thread_id ?? t.last_message?.id ?? null` + `isGeneral: !!t.info?.is_general`
2. [`nativeStore.js`](../src/native/store/nativeStore.js) `selectForumTopic`/`loadOlder`/`loadNewer`: передают `threadMessageId` и `isGeneral` в IPC payload
3. [`tdlibBackend.js`](../main/native/backends/tdlibBackend.js) `messages.getTopic`: branch — `isGeneral` → `getChatHistory`, иначе → `getMessageThreadHistory(message_id=threadMessageId)`

**Tests**: 615 → 620 (+5: threadMessageId из last_message, fallback на last_message.id, isGeneral path, empty for missing thread). **Ловушка #29** в `mistakes/tdlib-forum.md`.

---

### v0.89.29 — TDLib 1.8 переименовал `message_thread_id` → `forum_topic_id` (ловушка #28)

**Контекст**: после v0.89.28 diagnostic logs пользователь воспроизвёл: кликает на тему OZON → справа черно. Логи 15:35:

```
[topic-ui] selectForumTopic ... topicId= topMessageId= unreadCount=215
                                ↑↑↑ ПУСТЫЕ!
[topic-be] no topicId — params={topicId:"",topMessageId:"",...}
[topic-ui] result ok=false error=no topicId
```

Для **ВСЕХ** тем (74, 215, 100 непрочитанных) `topicId` пустая строка.

#### Корневая причина — TDLib breaking change в API между 1.7 → 1.8

📚 Сверка с [официальной TDLib документацией](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic_info.html):

| Старое (TDLib 1.7.x) | Новое (TDLib 1.8+) |
|---|---|
| `forumTopicInfo.message_thread_id: int53` | `forumTopicInfo.forum_topic_id: int32` |
| — | `forumTopicInfo.chat_id: int53` (добавлено) |
| — | `forumTopicInfo.is_general: Bool` (добавлено) |

Наш проект: `prebuilt-tdlib@0.1008064.0` → **TDLib v1.8.64** (новейшая на май 2026).

Наш код в [tdlibBackend.js:488](../main/native/backends/tdlibBackend.js) читал `t.info?.message_thread_id` — **поле НЕ существует** в 1.8+ → `undefined` → `String(undefined || '') === ''` → все topics с пустым `id`.

#### Решение

```js
// Поддержка обоих имён (новое первым, старое как fallback)
const threadId = t.info?.forum_topic_id ?? t.info?.message_thread_id
const idStr = threadId !== null && threadId !== undefined ? String(threadId) : ''
```

Использовали `??` (nullish coalescing) вместо `||` — чтобы `0` (валидное значение для general topic) не fall-through на fallback.

Также добавили `isGeneral: !!t.info?.is_general` в наш topic объект — UI может отличать general от пользовательских тем.

#### Регрессионная защита

```js
// При первом полученном topic печатает СЫРУЮ структуру info от TDLib
if (result?.topics?.[0]) {
  console.log('[forum-be] sample topic[0] info=' + JSON.stringify(result.topics[0].info) + ' unread=...')
}
```

Если TDLib снова переименует поле в будущих версиях — увидим в первой сессии после апдейта.

#### Ловушка #28 — записана в `mistakes/tdlib-forum.md`

«TDLib **не использует semver** в смысле "minor не ломает API". Каждая новая версия (1.7 → 1.8) может переименовать или удалить поля. При апдейте `prebuilt-tdlib` — проверять td_api spec на breaking changes».

Добавлен список известных переименований 1.7 → 1.8 для справки.

#### Эффект

🟢 **Что починилось**:
- Forum topics получают корректные `id` (forum_topic_id или 1 для general)
- `selectForumTopic` отправляет правильный topicId → backend.getTopic не отбрасывает
- TDLib `getMessageThreadHistory` получает валидный `message_id` → возвращает сообщения
- Active state работает (id для каждого topic уникальный) — синяя полоса слева видна
- «Загружаю непрочитанные» завершается + показываются сообщения

---

### v0.89.28 — Forum topic UI: active state visible + diagnostic для load topic messages

После v0.89.25 forum-чаты показывают панель тем, но (1) активная тема почти не видна (13% alpha на AMOLED), (2) клик на тему — справа чёрно, нет логов про `tg:get-topic-messages`.

**Правки**: CSS active state увеличен с 13% alpha до `rgba(42,171,238,0.18)` + `border-left: 3px solid #2AABEE` (Telegram-style). 3 точки логирования: `selectForumTopic`, `tg:get-topic-messages` result, `backend.messages.getTopic`. Логи v0.89.29 показали `topicId=""` (см. ловушка #28).

---

### v0.89.27 — `rendererPure` авторитативный signal — ловушка #26

После v0.89.26 полоска возвращается. Лог: `IGNORE stale raw=0 (items=2 > 0)` — main process накопил мусор от ghost-stacking. Решение: renderer = source of truth для terminal state. `notif:resize` принимает `meta = { rendererPure: boolean }`. Main очищает мусор и скрывает окно если `height<=0 && rendererPure`. 3 файла: `notification.js`, `notification.preload.cjs`, `notifHandlers.js`. **Ловушка #26** в `mistakes/notifications-ribbon.md`.

---

### v0.89.26 — Окно notification не скрывалось после dismiss (ловушка #25)

После v0.89.23 race: `notif:resize(0)` приходил ДО `notif:dismiss` → защита v0.89.23 IGNORE'нула resize → больше resize не приходило → окно visible. Решение: `hideIfEmpty()` после каждого setNotifItems в 3 handler'ах (`notif:click`/`mark-read`/`dismiss`). Main process — source of truth, не ждём renderer. **Ловушка #25** в `mistakes/notifications-ribbon.md`.

---

### v0.89.25 — Fix: `is_forum` в TDLib supergroup, не в chatTypeSupergroup (ловушка #24)

[TDLib spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1supergroup.html): `is_forum` в объекте `supergroup`, не в `chatTypeSupergroup`. До v0.89.25 mapChat читал `type.is_forum` (undefined). Решение: `supergroupCache` + `updateSupergroup` handler в `tdlibClient.js`, mapChat читает `extras.supergroup.is_forum`. **Tests**: 608 → 615 (+7). **Ловушка #24** в `mistakes/tdlib-forum.md`.

---

### v0.89.24 — Diagnostic логи для forum topics pipeline

Пользователь: forum-чаты не открывают панель тем. Добавлены 4 точки логирования `[forum-ipc/be/map/ui]` без правок поведения. Логи v0.89.25 → нашли причину (is_forum в supergroup, не chatTypeSupergroup, ловушка #24).

---

### v0.89.23 — Два бага notification pipeline: «пустая полоса» + race `raw=0 items=1`

**Контекст**: после v0.89.22 пользователь прислал скриншот в 12:12 — сверху видно Telegram уведомление «vevs.home», ниже **пустая полоса**. Логи v0.89.20-21 + DOM snapshots показали: items=2 в DOM, оба op=1 tf=none, но визуально один не виден.

#### Два независимых бага, оба подтверждены документально по стеку

**Баг #1 — «Пустая полоса»**: slideIn animation 300ms + offsetHeight включён в calcHeight → окно расширяется СРАЗУ, но новый element ещё за экраном (translateX анимируется).

Подтверждение из MDN:
- 📚 [HTMLElement.offsetHeight](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetHeight): «measures layout position, not visual position. CSS transforms affect only visual rendering»
- 📚 [Using CSS animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_animations/Using_CSS_animations): «Animated property values do NOT appear in `element.style` — only computed style»

**Баг #2 — Race `raw=0 items=1`**: renderer прислал `notif:resize(0)` от прошлого dismiss ПОСЛЕ того как main process получил новое `notif:show` (items=1) → main скрывает окно ошибочно.

Подтверждение из Electron docs:
- 📚 [ipcRenderer.send](https://www.electronjs.org/docs/latest/api/ipc-renderer): «Send an **asynchronous** message to the main process»
- setTimeout 60ms в `reportHeight` не гарантирует порядок относительно других IPC

#### Решение Баг #1 — slideInDone флаг

В [`main/notification.js`](../main/notification.js):

```js
// Перед appendChild:
el.dataset.slideInDone = 'false'

// Слушаем animationend для slideIn:
el.addEventListener('animationend', (e) => {
  if (e.animationName !== 'slideIn') return
  el.dataset.slideInDone = 'true'
  reportHeight()  // ← перепроверяем теперь когда element на месте
}, { once: true })

// Страховка 600ms на случай если animationend не сработает

// В calcHeight():
if (child.dataset.slideInDone === 'false') continue  // ← новое: пропускаем анимирующиеся
```

**Эффект**: `calcHeight` НЕ включает новый element пока он анимируется → main НЕ расширяет окно раньше времени → пользователь не видит пустоты.

#### Решение Баг #2 — игнорировать stale `raw=0`

В [`main/handlers/notifHandlers.js`](../main/handlers/notifHandlers.js):

```js
const itemsCount = getNotifItems().length
if (height <= 0 && itemsCount > 0) {
  console.log('[notif-resize] IGNORE stale raw=0 (items=' + itemsCount + ' > 0)')
  return  // ← stale event от прошлого dismiss
}
```

**Эффект**: если main знает что есть item, но renderer прислал `0` (запоздалый reportHeight) — игнорируем. Следующий reportHeight от renderer пришлёт правильное значение.

#### Усиление диагностики

DOM snapshot теперь логирует:
- `inlineTf` (старый `tf`) — `el.style.transform` (inline)
- `realTf` — `getComputedStyle(el).transform` (учитывает CSS animation!)
- `slid` — флаг `slideInDone`

Если баг #1 вернётся — лог сразу покажет реальный transform.

#### Документация

Обе ловушки записаны в [`mistakes/notifications-ribbon.md`](mistakes/notifications-ribbon.md):
- Ловушка #22 — «Пустая полоса» (slideIn + offsetHeight)
- Ловушка #23 — IPC race (stale resize=0)

Каждая с MDN/Electron ссылками + правилом.

#### Урок

В v0.89.21 я добавил DOM snapshot, но логировал только `el.style.transform` — это inline style, **не** учитывает CSS animation. По MDN: animation values «only exist in computed style». Я не прочитал MDN при добавлении лога. Через 1 итерацию (v0.89.21 → v0.89.22) пользователь поймал баг через скриншот.

**Правило (для auto-memory)**: при добавлении diagnostic log для CSS-анимируемых свойств — ВСЕГДА читать `getComputedStyle()`, не `el.style`.

---

### v0.89.15 – v0.89.22 — заархивированы

Перенесены в [`archive/features-v0.89.15-22.md`](./archive/features-v0.89.15-22.md) (релиз v0.89.44, 19 мая 2026 — features.md перевалил 100 КБ после Phase 2 серии).

В архиве: серия notification ribbon (v0.89.18-v0.89.22 — корни закрыты в v0.89.35 backgroundThrottling и v0.89.36 force-transform), LRU-кеш tg-media (v0.89.17), постеры видео (v0.89.16), финал видео-pipeline (v0.89.15).

---

---

### v0.89.6 – v0.89.14 — заархивированы

Перенесены в [`archive/features-v0.89.6-14.md`](./archive/features-v0.89.6-14.md) (18 мая 2026, при превышении features.md 100 КБ в v0.89.19). 9 итераций видео-pipeline стабилизации после TDLib миграции — серия закрыта в v0.89.15-v0.89.16 (подтверждено пользователем).

### v0.89.1 – v0.89.5 — заархивированы

Перенесены в [`archive/features-v0.89.1-5.md`](./archive/features-v0.89.1-5.md) (релиз v0.89.14, 15 мая 2026 — features.md перевалил 100 КБ после серии видео-фиксов v0.89.7–v0.89.14).

В архиве: полное удаление GramJS (v0.89.1), 4 раунда аудита TDLib миграции (v0.89.2–v0.89.5).

---

### v0.89.0 — Этап 2 виртуализации: VirtualMessageList в InboxChatPanel

**Контекст**: v0.88.x подготовили почву (страховка push, защитные тесты), v0.89.0 — собственно
рефакторинг рендера. До этого `renderItems.map(...)` рендерил **весь** список сообщений в DOM
(в чатах с 4000+ непрочитанных это даёт лаги при скролле). Теперь DOM держит только
видимые ~20 строк + overscan через [`react-window`](https://github.com/bvaughn/react-window) 2.2.

**Что сделано**:

- [`src/native/components/VirtualMessageList.jsx`](src/native/components/VirtualMessageList.jsx) — компонент Phase 1 (создан в v0.88.3) расширен: принимает события `onScroll/onWheel/onTouchStart/onPointerDown/onDragOver/onDragLeave/onDrop` и пробрасывает их в outer div `<List>` через `...rest`. `MessageRow` теперь сам делает `padding: 16px по бокам + 6px снизу` (вместо старого `padding/gap` на scroll-контейнере), `boxSizing: 'border-box'` — `ResizeObserver` react-window учитывает paddingBottom как часть высоты row.
- [`src/native/components/InboxChatPanel.jsx`](src/native/components/InboxChatPanel.jsx) — `renderItems.map(...)` блок (~95 строк) заменён на `<VirtualMessageList>`. `msgsScrollRef` теперь синхронизируется с `listRef.current.element` через `useEffect` + `useState scrollElement`. Этот state нужен IntersectionObserver'у в `MessageBubble.readRoot` — при первом рендере root ещё `null`, после монтирования react-window выставляется реальный element, observer пересоздаётся (deps `[enabled, root]` в `useReadOnScrollAway`).
- [`src/native/hooks/useInitialScroll.js`](src/native/hooks/useInitialScroll.js) — добавлен опциональный `onMissingTarget(firstUnreadId)` callback. Когда `querySelector('[data-msg-id]')` промахивается (firstUnread вне видимого виртуального DOM), вызывается `onMissingTarget` → InboxMode скроллит через `listRef.current.scrollToRow({ index })`. Без fallback react-window открывал чат сверху, юзер не видел непрочитанные.
- [`src/native/modes/InboxMode.jsx`](src/native/modes/InboxMode.jsx):
  - `virtualListRef = useRef(null)` — imperative API react-window.
  - `findRenderItemIndex(msgId)` — ищет где сообщение в `renderItems` (учитывает альбомы: `item.msgs[*].msgs[*].id` для типа `album`).
  - `scrollToVirtualRow(msgId, align)` — вызывает `virtualListRef.scrollToRow({ index, align })`.
  - `scrollToMessage(msgId)` сначала пробует старый `querySelector` (видимый row), потом fallback `scrollToVirtualRow(msgId, 'center')` + повторная попытка подсветить через 200 мс.
  - `useInitialScroll` получает `onMissingTarget: id => scrollToVirtualRow(id, 'start')`.
- `src/__tests__/unreadAutoPrefetch.test.cjs` — 2 защитных теста v0.88.2 обновлены (проверка проводки `onReplyClick={scrollToMessage}` теперь смотрит в `VirtualMessageList.jsx`, не в `InboxChatPanel.jsx`); добавлено 5 новых тестов: `InboxChatPanel рендерит VirtualMessageList`, `VirtualMessageList использует react-window <List> + useDynamicRowHeight`, `InboxMode прокидывает virtualListRef`, `findRenderItemIndex + scrollToVirtualRow`, `useInitialScroll.onMissingTarget`. (v0.89.x Этап 4: файл удалён вместе с GramJS-специфичными тестами. Виртуализационные регрессии теперь покрывает [`src/native/components/VirtualMessageList.vitest.jsx`](src/native/components/VirtualMessageList.vitest.jsx).)

**Сохранено без изменений**:

- `useReadOnScrollAway` (rootMargin `-48% 0px -48% 0px`) — работает как раньше, просто root = `listRef.element` вместо div'a.
- `useInboxScroll` + `useInboxNewerPrefetch` (load-older, prefetch-newer, atBottom) — onScroll-event тот же, теперь приходит из react-window.
- `useReadByVisibility` (batch markRead 300мс) — не трогали.
- `useNewBelowCounter`, `useForceReadAtBottom`, `useMessageActions` — не трогали.
- `messageGrouping.js` — критичная защита v0.87.113 (senderAvatar в group/album) — без изменений.

**Известные риски, требующие визуальной проверки**:

- **load-older preserve scroll position** (`scrollTop = scrollHeight - prevHeight`) при виртуализации работает, но `useDynamicRowHeight` измеряет высоту row асинхронно через `ResizeObserver`. Если новые сообщения ещё не обмерены — `scrollHeight` неточен. Если будет «прыжок» при подгрузке вверх — нужна будет замена на `scrollToRow({ index: addedCount, align: 'start' })`.
- **`overflow-anchor`** браузера на virtualised DOM работает иначе. Если будут «дрожания» при добавлении сообщений сверху — добавить `overflow-anchor: none` на outer div react-window.
- **Шапка / pinned message / unread-status bar** живут вне списка — никак не должны были пострадать.

**Версия**: v0.88.2 → v0.89.0 (minor — UI-функциональность не изменилась, но внутренняя архитектура рендера переработана).

**Проверено**:

```powershell
npm.cmd run lint                                            # ожидается OK
npm.cmd run test:vitest                                      # ожидается 166/166 (не должны отвалиться без изменений в API)
node src\__tests__\unreadAutoPrefetch.test.cjs               # 27/27 (+5 виртуализационных)
node src\__tests__\fileSizeLimits.test.cjs                   # лимиты в порядке
```

⚠ **Визуальная проверка пользователем обязательна**: открыть чат с 100+ непрочитанными → должен встать на первое непрочитанное (проверка `onMissingTarget` fallback). Reply-click на старое сообщение → scroll-to-reply должен работать. Прокрутка длинного чата (4000+) — должна быть плавной без лагов DOM.

---

### v0.88.2 — страховка push для real-time + защитные тесты перед Этапом 2

**Контекст**: перед большим рефактором (виртуализация рендера, Этап 2) — две инженерные страховки.

**Страховка 1 — real-time push расhron**:

- В v0.88.1 флаг `noMoreNewerRef` блокировал бесконечный prefetch у конца чата.
- Теоретический пробел: если Telegram push (`tg:new-message`) по какой-то причине пропустит сообщение (gap в `pts`, потеря сессии), флаг остаётся `true` и блокирует prefetch как «спасательный канал» до смены чата.
- Источник: [core.telegram.org/api/updates](https://core.telegram.org/api/updates) — Telegram использует server-push, но требует клиента вызывать `updates.getDifference` при rasync; GramJS делает это сама при reconnect.
- Решение: в [`useInboxScroll.js`](src/native/hooks/useInboxScroll.js) добавлен `useEffect` который отслеживает `activeMessages.length` + `scrollKey`. Когда массив растёт в рамках одного `viewKey` (push доставил новое сообщение или load-newer вернул что-то) — флаг `noMoreNewerRef.current.delete(viewKey)` автоматически снимается. Логируется через `load-newer-flag-reset`.
- Поведение: чат с 0 unread → флаг становится `true` → приходит push через 10 минут → массив растёт → флаг снимается → следующий скролл может снова попробовать prefetch.

**Страховка 2 — защитные тесты перед Этапом 2**:

В `unreadAutoPrefetch.test.cjs` (v0.89.x Этап 4: удалён) добавлены статические проверки на критичные интеграции, которые **с большой вероятностью пострадают при внедрении виртуализации**:

- `MessageBubble` и `AlbumBubble` принимают `onReplyClick` (reply → scroll-to-message).
- `InboxChatPanel` проводит `scrollToMessage` в `onReplyClick`.
- `groupMessages(visibleMessages, firstUnreadId)` — группировка с разделителем «Новые сообщения».
- `useInitialScroll` читает `firstUnreadIdRef`.
- `useReadOnScrollAway` использует `rootMargin: '-48% 0px -48% 0px'` (читающая линия).

Если виртуализация Этапа 2 сломает любую из этих интеграций — соответствующий статический тест упадёт и сразу укажет где смотреть.

**Версия**: v0.88.1 → v0.88.2 (patch — страховочное улучшение без новой UI-функциональности).

**Проверено**:

```powershell
npm.cmd run lint                                                # OK
npm.cmd run test:vitest                                          # 19 files / 166 tests passed
node src\__tests__\unreadAutoPrefetch.test.cjs                   # 22/22 (+6 от v0.88.1)
node src\__tests__\multiAccount.test.cjs                         # 81/81
node src\__tests__\memoryBankSizeLimits.test.cjs                 # 27/27
```

---

### v0.88.1 — фикс бесконечного цикла prefetch у конца чата

**Баг из v0.88.0**: после первой автодогрузки внизу ленты индикатор «Загружаю ещё...» оставался видимым и не пропадал. Окно чата периодически «дёргалось» каждые 300 мс.

**Причина**:
1. Скролл доходил до низа (`fromBottomPx < 1500`) → срабатывал prefetch.
2. Telegram возвращал пустой массив (новее сообщений нет — пользователь у конца чата).
3. Backend всё равно эмитил `tg:messages` с пустым `messages`.
4. IPC listener делал `setState({ messages: [...existing, ...[]] })` — **новая ссылка** на тот же контент → лишний рендер («дёрг»).
5. Через 300 мс `loadingNewerRef` снимался → scroll положение то же → опять триггер → опять пустой ответ. Бесконечный цикл.

**Фикс**:
- `main/native/telegramMessages.js`: `tg:get-messages` и `tg:get-topic-messages` **не эмитят** `tg:messages` если `afterId` использован и Telegram вернул `0` сообщений.
- `src/native/store/nativeStoreIpc.js`: на случай если backend всё-таки эмитнет — listener делает **ранний return без setState** когда `appendNewer:true` и `newNewer.length === 0`.
- `src/native/hooks/useInboxScroll.js`: добавлен `noMoreNewerRef = useRef(new Map())`. Когда `loadNewerMessages` возвращает `hasMore:false` ИЛИ пустой массив — фиксируем флаг для этого `viewKey`. Условие триггера дополнено: `!noMoreNewerRef.current.get(viewKey)`. Сбрасывается естественно при смене чата/темы (новый `viewKey` → новая запись в Map).
- Новые vitest-тесты:
  - `appendNewer` с пустым массивом **не меняет ссылку** на массив сообщений (`expect(refAfter).toBe(refBefore)`).
  - `appendNewer` только с дубликатами — то же.
- Новые static-тесты в `unreadAutoPrefetch.test.cjs` (3 проверки): `noMoreNewerRef`, ранний return, отказ от пустого emit.

**Проверено**:

```powershell
npm.cmd run lint                                                # OK
npm.cmd run test:vitest                                          # 19 файлов, 166 тестов passed
node src\__tests__\unreadAutoPrefetch.test.cjs                   # 16/16
node src\__tests__\multiAccount.test.cjs                         # 81/81
node src\__tests__\memoryBankSizeLimits.test.cjs                 # 27/27
```

---

### v0.88.0 — Telegram-style автодогрузка новых сообщений вниз

**Контекст**: пользователь нашёл реальные большие чаты (например, чат «1337» с **4253 непрочитанных**). До этого фикса:
- Код запрашивал у Telegram пачку из 500 сообщений, но Telegram MTProto `messages.getHistory` имеет **жёсткий лимит 100** за запрос (источник: [core.telegram.org/api/offsets](https://core.telegram.org/api/offsets)).
- Получая 100 из «ожидаемых» 500, баннер навсегда застревал на `100 из 138` (или `50 из 999+`).
- Не было функции догрузки **новых** сообщений вниз — только `loadOlderMessages` для прокрутки вверх в историю.
- Результат: открыл чат → проскроллил вниз → застрял, остаток непрочитанных не виден.

**Что сделано**:

- `main/native/telegramMessages.js`: добавлен параметр `afterId` в `tg:get-messages` и `tg:get-topic-messages`. Маппится в MTProto `min_id` + `offset_id=0` + `add_offset=-limit`. При `afterId` бэкенд эмитит `tg:messages` с флагом `appendNewer: true`. (v0.89.x Этап 4: файл удалён, поведение перенесено в [`main/native/backends/tdlibMessages.js`](main/native/backends/tdlibMessages.js).)
- `src/native/store/nativeStore.js`:
  - Константа `UNREAD_WINDOW_MAX_MESSAGES` уменьшена 500 → **100** (реальный потолок Telegram API). Это исправляет баг «100 из 138».
  - Умная формула `addOffset` в [`unreadWindowRequestParams`](src/native/store/nativeStore.js): при `unread > 30` окно сдвигается ближе к курсору (90% непрочитанных), для маленьких unread оставляем больше контекста (25%).
  - Новая функция [`loadNewerMessages(chatId, afterId, limit=100)`](src/native/store/nativeStore.js) с per-key throttle **300 мс** (защита от `FLOOD_WAIT`).
- `src/native/store/nativeStoreIpc.js`: слушатель `tg:messages` теперь обрабатывает поле `appendNewer: true` — добавляет новые сообщения в конец массива с дедупликацией.
- `src/native/hooks/useInboxScroll.js`: добавлен prefetch-триггер: при `fromBottom < 1500px` (≈20 сообщений) → `store.loadNewerMessages(chatId, lastIncomingId)`. Защищено `loadingNewerRef`. Срабатывает только после `initialScrollDone`.
- `src/native/modes/InboxMode.jsx`: новые `loadingNewerRef` + `useState(loadingNewer)` для UI индикатора, пробрасываются в `useInboxScroll` и `InboxChatPanel`.
- `src/native/components/InboxChatPanel.jsx`: внизу ленты появляется индикатор `«Загружаю ещё...»` (CSS-класс `native-msgs-loading-newer`) во время фоновой подгрузки.
- `src/native/styles-messages.css`: добавлены стили `native-msgs-loading-newer` с пульсирующей точкой.
- Тесты обновлены: `nativeStore.vitest.jsx`, `multiAccount.test.cjs`.

**Подтверждённые числа** (а не выдуманные):

| Число | Что | Откуда |
|---|---|---|
| `100` | Размер пачки | [Telegram MTProto docs](https://core.telegram.org/api/offsets) — жёсткий потолок |
| `300 мс` | Throttle между пачками | Практика MadelineProto/Telethon — безопасный темп против FLOOD_WAIT |
| `1500 px` | Prefetch порог | ≈20 сообщений (react-virtualized default = 15) |
| `0.9 / 0.25` | Соотношение addOffset | Большой unread → почти всё окно для непрочитанных; маленький → больше контекста |

**Что НЕ сделано в этом этапе** (отдельные задачи):

- DOM-виртуализация через `react-virtuoso`/`react-window` для основного рендера: коммерческая версия `VirtuosoMessageList` платная, бесплатная требует переписать группировку/mark-read/scroll-to-reply (~600-800 строк, риск регрессий). Отдельный Этап 2 после стабилизации.
- Отправка/ответ в выбранную тему форума: вход disabled (см. журнал).
- Анимация «stale» badge при refresh: убрано из плана как лишняя нагрузка.

**Подробное расследование**: [`group-topic-investigation.md`](./group-topic-investigation.md), запись от 2026-05-13 «Stage: Newer-messages auto-prefetch».

---

### v0.87.115 – v0.87.136 — заархивированы

Перенесены в [`archive/features-v0.87.115-136.md`](./archive/features-v0.87.115-136.md) (релиз v0.89.9, 15 мая 2026 — features.md перевалил 100 КБ лимит после серии audit-релизов).

В архиве: фикс пустой аватарки чата (v0.87.115), unified connection health status (v0.87.136), Windows installer в корневой dist (v0.87.135), startup graph оптимизации (v0.87.130-134), безопасное восстановление native-аккаунтов (v0.87.127), lazy startup панелей (v0.87.126).

---

### v0.87.106 – v0.87.114 — заархивированы

Перенесены в [`archive/features-v0.87.106-114.md`](./archive/features-v0.87.106-114.md) (релиз v0.89.5, 15 мая 2026 — `features.md` перевалил 100 КБ лимит после четырёх audit-релизов).

В архиве: убран счётчик чатов (v0.87.114), главный фикс аватарок отправителей в групповых чатах (v0.87.113), `GetFullUser` для User без photo (v0.87.112), фоновое скачивание аватарок отправителей (v0.87.111), визуал мьюта + двухуровневое меню (v0.87.110), заглушение уведомлений чата (v0.87.109), кнопки режимов в шапке (v0.87.108), убрана угловая иконка с аватарки (v0.87.107), финальный multi-account UI (v0.87.106).

---

### v0.87.93 – v0.87.105 — заархивированы

Перенесены в [`archive/features-v0.87.93-105.md`](./archive/features-v0.87.93-105.md) (релиз v0.88.2, 13 мая 2026 — `features.md` перевалил 100 КБ лимит).

В архиве: реализация multi-account для native Telegram (v0.87.105), план multi-account (v0.87.104), разбиение 5 файлов на 80%+ (v0.87.103), CodeInput-ячейки (v0.87.102), libphonenumber-js (v0.87.101), CountryPicker (v0.87.99-100), фикс retry-цикла GramJS (v0.87.98), Low Priority разбиение 4 файлов (v0.87.97), фильтр GramJS TIMEOUT (v0.87.96), полный выход из аккаунта (v0.87.95), умный logger (v0.87.94), фикс аватарки через `cc-media://` (v0.87.93).

---
