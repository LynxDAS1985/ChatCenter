# Реализованные функции — ChatCenter

## Текущая версия: v1.2.8 (19 июня 2026)

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

### v1.2.8 — системная диагностика в настройках

19 июня 2026: в окно настроек добавлена отдельная кнопка `🩺 Диагностика системы`. Старый блок `ai-errors.log` не заменён и продолжает отвечать только за ошибки AI-провайдеров.

22 июня 2026: исправлен UX самой модалки диагностики после ручной проверки пользователем. Переключатели больше не показывают непонятный знак `?`, состояние написано словами `вкл/выкл`; кнопки получили hover/pressed/focus-отклик; текст под кнопками объясняет обычное обновление и глубокую WebView-проверку простыми словами. Убрано дёргание окна при обновлении: `runtimeContext` и deep-check callback переведены на `useRef`, поэтому модалка не перезапускает загрузку из-за каждого родительского рендера. Overlay поднят выше остальных слоёв (`zIndex: 1000001`), чтобы после Alt-Tab/смены окна диагностика не терялась под настройками и её можно было закрыть без перезапуска приложения.

**Зачем**: раньше можно было посмотреть только `userData/ai-errors.log`, поэтому при проблемах WebView, уведомлений, native backend или общих IPC приходилось вручную искать разные логи и было сложно дать Codex/другому ИИ полную картину. Новая диагностика собирает единый снимок состояния приложения и показывает цепочки событий.

**Что делает решение**:
- читает общий `chatcenter.log` через новый IPC `app:diagnostics-snapshot`;
- читает `ai-errors.log`, но показывает его как отдельный AI-журнал;
- анализирует ошибки, цепочки notification/WebView/native, статусы подключений и runtime-контекст приложения;
- сохраняет JSON-отчёт в `userData/system-diagnostics-report.json`, чтобы Codex/другой ИИ мог прочитать его без ручного копирования из UI;
- маскирует `token`, `apiKey`, `clientSecret`, `password`, `Authorization Bearer` перед показом/сохранением;
- кнопка `Очистить экран` очищает только экран/буфер новой диагностики и не удаляет `chatcenter.log` или `ai-errors.log`;
- глубокая WebView-проверка выключена по умолчанию и запускается только вручную/переключателем, чтобы не нагружать приложение постоянно.

**Файлы изменения**: `src/components/SystemDiagnosticsModal.jsx`, `src/utils/systemDiagnostics.js`, `main/utils/systemDiagnostics.js`, `main/handlers/mainIpcHandlers.js`, `src/components/SettingsPanel.jsx`, `src/App.jsx`.

**Проверки**: добавлены `systemDiagnostics.test.cjs`, `systemDiagnosticsMain.test.cjs`; `appStructure.test.cjs` проверяет lazy-подключение модалки; `ipcChannels.test.cjs` проверяет IPC `app:diagnostics-snapshot` и `app:diagnostics-save-report`.

**Deploy-вывод**: в документации проекта не найдена Docker/server deploy-команда. Доступны только `npm run build`, `npm run start:prodlike`, `npm run dist:win` и CI. Серверный deploy нельзя выполнять без точной документированной команды.
---
### v1.2.7 — MAX WebView: rich title-fallback для ribbon

18 июня 2026: добавлен MAX-only fallback для случая, когда `web.max.ru` увеличил `title/unread`, но не прислал `__CC_NOTIF__`/`__CC_MSG__`. Через `700мс` он достает text/sender/avatar из DOM MAX и вызывает обычный `handleNewMessage()`, поэтому внешний вид ribbon остается прежним; опасные `body-fallback`/`Path 2` не возвращались. Исправлена опечатка `senderNotifTsRef` → `notifSenderTsRef`. Подробная проблема, диагностика, риски и откат: [`mistakes/notifications-ribbon.md` Ловушка #32](./mistakes/notifications-ribbon.md).

---

### v1.2.7 — WhatsApp: защита от фантомных ribbon при входе в чат

**Зачем**: при входе в WhatsApp-чат sidebar watcher мог отправлять фантомные уведомления `ic-expand-more` и старое preview `Фото`. Факты из `chatcenter.log` 17 июня 2026: `wa-open: chat="Виноградов Александр" picked="ic-expand-more"` → `Источник: ic-expand-more | __CC_NOTIF__` → `Ribbon: ic-expand-more | отправлен`; через секунду аналогично `Фото`. Это совпало с ранее задокументированной Ловушкой 62 (`archive/features-pre-v0.87.md` v0.86.2-v0.86.4): `ic-expand-more` бывает SVG title без `data-icon`, поэтому старый фильтр `closest('[data-icon]')` не срабатывал.

**Что изменено**:
- [`main/preloads/hooks/whatsapp.hook.js`](main/preloads/hooks/whatsapp.hook.js) — добавлен фильтр служебных SVG/UI-текстов: `svg title`, `ic-*`, `wds-ic-*`, `status-*`, `default-user`, `down-context`, `x`.
- Открытая строка чата без unread badge теперь только обновляет `_lastSidebarTexts` и пишет DIAG `skip open chat`, но не шлёт `__CC_NOTIF__`.
- [`src/__tests__/notifHooks.test.cjs`](src/__tests__/notifHooks.test.cjs) — guard-тесты на SVG title без `data-icon`, icon-name тексты и `isOpen && !badge` skip.

**Почему так**: Memory Bank прямо предупреждает, что `MutationObserver/getLastMessageText` не отличает новое сообщение от старого DOM при смене/открытии чата (`mistakes/notifications-ribbon.md`). Полностью выключать watcher нельзя: для WhatsApp/MAX/VK он нужен, когда Notification API или unread count не дают отдельный ribbon. Поэтому выбран минимальный фильтр доказанных служебных фантомов + блок только открытой строки без badge.

---

### v1.2.6 — AI Agent автоматически использует WebView Bridge

**Зачем**: при выбранном `ГигаЧат free` нижний ИИ-помощник работал как WebView, но верхний AI Agent мог идти в API-путь и падал с ошибкой `gigachat needs both clientId (apiKey) and clientSecret`. Пользователь выбирал бесплатный WebView-режим, а агент всё равно просил API-секреты.

**Что изменено**:
- [`src/components/AISidebarAgent.jsx`](src/components/AISidebarAgent.jsx) — если активный провайдер в `mode='webview'`, Agent сам включает Bridge и показывает «Авто: через Bridge/WebView».
- [`src/components/AISidebar.jsx`](src/components/AISidebar.jsx) — Agent получает `onSettingsChange`, ручной Bridge-toggle для API-провайдеров сохраняется.
- [`src/utils/aiBridge/agentBridgeRunner.js`](src/utils/aiBridge/agentBridgeRunner.js) — первый шаг chain теперь строится по режиму провайдера: `webview → webui`, `api → api`.
- [`src/utils/aiBridge/buildAutoChain.js`](src/utils/aiBridge/buildAutoChain.js) — GigaChat API добавляется в резерв только если есть оба значения: `apiKey/clientId` и `clientSecret`.
- [`src/utils/aiBridge/agentBridgeErrors.js`](src/utils/aiBridge/agentBridgeErrors.js) — технические ошибки WebView Bridge переводятся в понятные сообщения для пользователя.

**Как теперь работает**:
```
ГигаЧат free / WebView
        ↓
AI Agent сам включает Bridge
        ↓
Первый шаг: mode='webui'
        ↓
Запрос идёт в открытый сайт ГигаЧат
        ↓
API clientId/clientSecret не требуются
```

**Тесты (+9)**:
- Новый [`src/components/AISidebarAgent.vitest.jsx`](src/components/AISidebarAgent.vitest.jsx): авто-Bridge для WebView и сохранение ручного Bridge для API.
- Обновлены `agentBridgeRunner.vitest.js`, `buildAutoChain.vitest.js`, `useAIAgent.vitest.jsx`.
- Точечная проверка: `npm.cmd run test:vitest -- buildAutoChain agentBridgeRunner AISidebarAgent useAIAgent agentBridgeErrors`.

---

### Старые версии

Остальные версии хранятся в архиве выше по ссылкам, чтобы память не разрасталась. Файл `features.md` держим коротким: только последние активные изменения, чтобы он не превышал лимит 100 КБ и не замедлял чтение ИИ.
