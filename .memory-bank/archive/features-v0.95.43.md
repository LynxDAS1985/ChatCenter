# Features Archive — v0.95.43

Скрепка 📎 + альбомы sendMessageAlbum + превью + caption + DnD overlay. Стабилизировано v0.95.44+.

---

### v0.95.43 — Скрепка 📎 + альбомы sendMessageAlbum + превью + caption + DnD overlay

5 фич отправки файлов. TDLib spec sendMessageAlbum (10 файлов max), Telegram Web K SendMessage, Discord upload preview.

- **📎 кнопка** [FileAttachButton.jsx](src/native/components/FileAttachButton.jsx) NEW: hidden `<input multiple>` + paperclip → file picker.
- **Превью + caption** [FilePreviewBar.jsx](src/native/components/FilePreviewBar.jsx) NEW: thumbnails 72×72 через URL.createObjectURL (revoke в cleanup), ✕ на каждом, caption input + Отправить. Заменяет input в [InboxMessageInput.jsx](src/native/components/InboxMessageInput.jsx) при hasAttachedFiles.
- **Альбомы** [tdlibAlbum.js](main/native/backends/tdlibAlbum.js) NEW: `sendMessageAlbum` через TDLib, split на батчи 10 при > 10 файлах. albumCaption на первом, replyTo только в первом батче. IPC `tg:send-album`, store action `sendAlbum`.
- **DnD overlay** [DragDropOverlay.jsx](src/native/components/DragDropOverlay.jsx) NEW: dashed accent border + 📎 64px + текст. Заменяет inline старый.
- **useFileAttach hook** [useFileAttach.js](src/native/hooks/useFileAttach.js) NEW: state + addFiles/removeFile/clear, защита >2GB. [InboxMode.jsx](src/native/modes/InboxMode.jsx) handleAttachSend — 1 файл → sendFile, 2+ → sendAlbum.

**Конфликты ✅**: tdlibSend.sendFile, handleReplySend, useDropAndPaste, lastAutoScrollAtRef — не задевается.
**Граничные ✅**: пусто→noop, >10→split, >2GB→фильтр, нет file.path→toast.
**Тесты** (+19): tdlibAlbum +12 (buildContent типы, split 11/21, caption, replyTo, errors), useFileAttach +7.
**Не сделано**: прогресс % через updateFile — отложено в v0.95.44+ (spinner на кнопке достаточно для MVP).

**Регрессия**: lint 0, vitest 994/994 (+19), fileSizeLimits 332/332, check-memory ✅.

---

### v0.95.38 — Фикс дубля сообщений + ⏳ индикатор + dedup тесты

Корень: `updateMessageSendSucceeded` не обрабатывался в tdlibClient → после server ACK provisional id (huge) → финал (12345) → 2 копии в DOM. Решение: emit `message:send-succeeded` → store replaces по oldId. ⏳ pending / ✓ sent / ✓✓ read в MessageBubble. Static guard F. в modernPatternsGuard для 4 message-handler файлов. +7 тестов. Полный текст: [`archive/features-v0.95.38.md`](./archive/features-v0.95.38.md).

---

### v0.95.35-37 — Путь к фиксу дубля сообщений (диагностика + sending_state)

v0.95.35: fade-in для «Полная история» + диагностика TODO (outgoing с других устройств).
v0.95.36: фикс auto-scroll outgoing-from-other-device через TDLib sending_state (tdlibMapper isSending + useNewBelowCounter фильтр + lastAutoScrollAtRef guard).
v0.95.37: sending_state polish (Edit скрыт пока isSending), лог fromOtherDevice, защита re-emit (seenOutgoingIdsRef Set), анализ дубля (TODO → реализовано в v0.95.38). Новый файл `mistakes/outgoing-two-cases.md`.
Полный текст: [`archive/features-v0.95.35-37.md`](./archive/features-v0.95.35-37.md).

---

### v0.95.34 — Темовые переменные в :root + вспышка bubble + WhatsNewModal UX

Архитектурное решение: переменные `.native-mode` → `:root` устранило CSS specificity ловушку v0.95.33. Вспышка outgoing bubble при смене темы (.cc-theme-flash 550мс). WhatsNewModal hover-эффект на «Понятно» + кнопка «Полная история». Полный текст: [`archive/features-v0.95.34.md`](./archive/features-v0.95.34.md).

---

### v0.95.33 — Фикс «выбор цвета не применяется» + регресс-тест на blur в модалках

Корень: CSS specificity — `.native-mode { --amoled-accent }` (class) перебивал inline на html → applyTheme не работал. Промежуточное решение querySelectorAll(.native-mode), финал в v0.95.34 (перенос в :root). Регресс-тест modernPatternsGuard E. — blur запрещён в модалках. Деловой стиль changelog v0.95.20-29. Полный текст: [`archive/features-v0.95.33.md`](./archive/features-v0.95.33.md).

---
