# Реализованные функции — ChatCenter

## Текущая версия: v0.87.117 (6 мая 2026)

**Структура файла**: этот features.md содержит только **последние активные версии** (v0.87.93 → v0.87.109). Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
| [`archive/features-v0.87.80-92.md`](./archive/features-v0.87.80-92.md) | v0.87.80 – v0.87.92 (pre-push hook, разбиения 4-7, AccountContextMenu) | ~16 КБ |
| [`archive/features-v0.87.65-79.md`](./archive/features-v0.87.65-79.md) | v0.87.65 – v0.87.79 (план разбиения 1-3, pre-push hook, bubble UI) | ~54 КБ |
| [`archive/features-v0.87.51-64.md`](./archive/features-v0.87.51-64.md) | v0.87.51 – v0.87.64 (groupedUnread удалён, pre-commit hook) | ~54 КБ |
| [`archive/features-v0.87.40-50.md`](./archive/features-v0.87.40-50.md) | v0.87.40 – v0.87.50 (итерации native scroll + unread) | ~40 КБ |
| [`archive/features-v0.87-early.md`](./archive/features-v0.87-early.md) | v0.87.0 – v0.87.39 (запуск native + ранние фиксы) | ~140 КБ |
| [`archive/features-pre-v0.87.md`](./archive/features-pre-v0.87.md) | v0.1.0 – v0.86.10 (до native-режима, 3 марта – 14 апреля 2026) | ~210 КБ |

**Архив не читается по умолчанию.** Запрос к нему — только при явной просьбе («что было в v0.85», «покажи старый changelog»).

**До рефакторинга v0.87.57** файл был 445 КБ (3371 строк, 323 версии). После — ~100 КБ в корне.

---

### v0.87.117 — Диагностические логи: «1 сообщение в чате»

Добавлены диагностические логи в `tg:get-messages` для расследования бага «в чате показывается только 1 сообщение вместо 50»:
- Предупреждение `WARN: entity-fallback` когда `chatEntityMap` пуст и GramJS получает числовую строку вместо полноценного entity
- Лог фактического числа сообщений и источника entity (`hasEntity=true/false`)
- Детекция `FLOOD_WAIT` в catch-блоке — основная причина пустого ответа при старте (загрузка 659 аватарок ~132с держит Telegram rate-limit)

**Затронутые файлы:**
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — 496/500 строк (критически близко к лимиту)

---

### v0.87.116 — Время сбоку + аватарки +20%

- Время сообщения перенесено вправо на уровень текста (flex-row). Для фото/видео и пустых сообщений — остаётся снизу.
- Аватарки в списке чатов: 44px → 53px (+20%), шрифт инициалов 16→19px, высота строки 64→74px.
- Аватарки отправителей в сообщениях: 32px → 38px (+20%), шрифт инициалов 12→14px.

**Затронутые файлы:**
- [`src/native/components/MessageBubble.jsx`](../src/native/components/MessageBubble.jsx)
- [`src/native/components/ChatListItem.jsx`](../src/native/components/ChatListItem.jsx)
- [`src/native/components/InboxChatListSidebar.jsx`](../src/native/components/InboxChatListSidebar.jsx)
- [`src/native/styles-messages.css`](../src/native/styles-messages.css)

---

### v0.87.115 — Фикс пустой аватарки чата (показывались blank вместо инициалов)

**Причина**: `loadAvatarsAsync` сохранял 0-байтовые JPEG и слал URL как `chat.avatar` → CSS пытался рендерить пустой файл → белый/пустой круг. Код `!chat.avatar` был `false` → инициалы не рисовались.

**Фикс**:
1. `telegramChats.js` (кэш): если файл существует, но размер 0 байт — удаляем, скачиваем заново
2. `telegramChats.js` (скачивание): `if (!buffer || buffer.length === 0)` — не сохранять и не эмитировать 0-байтовый файл
3. `telegramMessages.js` (`mapMessage`): добавлена проверка размера файла при чтении `senderAvatar` из кэша

**Результат**: при следующем запуске приложения 0-байтовые файлы удалятся, аватарки попытаются скачаться заново. Если фото нет — `chat.avatar` остаётся `null` → отображаются инициалы как в настоящем Telegram.

**Затронутые файлы:**
- [`main/native/telegramChats.js`](../main/native/telegramChats.js)
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js)

---

### v0.87.114 — Убран счётчик чатов + правило в CLAUDE.md

- Убран `💬 659` из шапки списка чатов (`InboxChatListSidebar.jsx` строка 138). Теперь строка с количеством показывается **только при активном поиске** («найдено X из Y»), в обычном режиме — скрыта.
- В `CLAUDE.md` добавлен пункт §4 «Никаких изменений без прямой просьбы».

**Затронутые файлы:**
- [`src/native/components/InboxChatListSidebar.jsx`](../src/native/components/InboxChatListSidebar.jsx)

---

### v0.87.113 — ГЛАВНЫЙ фикс аватарок отправителей в групповых чатах ✅ РАБОТАЕТ

**Результат**: аватарки отправителей в групповых чатах появляются через несколько секунд после открытия чата. При повторном открытии — сразу.

**Полная история проблемы (4 шага неудач)**:

| Версия | Что делали | Почему не помогло |
|---|---|---|
| v0.87.110 | `mapMessage` читает аватарку из файлового кэша | Кэш пустой — `loadAvatarsAsync` не скачивает участников групп |
| v0.87.111 | Фоновое скачивание `downloadSenderAvatarsInBackground` | Файлы скачивались, IPC слал события — но аватарки не появлялись |
| v0.87.112 | `GetFullUser` для User без photo в базовой entity | Скачивалось больше — но всё равно не показывалось |
| **v0.87.113** | **`senderAvatar` добавлен в `messageGrouping.js`** | **← настоящая причина** |

**Корень**: `groupMessages()` создавал group-объекты без поля `senderAvatar`. `InboxChatPanel.jsx` читает `item.senderAvatar` — поле отсутствовало → всегда `undefined`. Файлы были, IPC работал, данные терялись при группировке сообщений.

**Правило на будущее**: при добавлении нового поля в message — сразу проверять `messageGrouping.js` строки ~22 и ~62. Любое поле не перечисленное в `currentGroup = {...}` — недоступно в `InboxChatPanel.jsx`.

**Затронутые файлы (v0.87.111–113)**:
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — `downloadSenderAvatarsInBackground` + `GetFullUser` fallback
- [`src/native/store/nativeStoreIpc.js`](../src/native/store/nativeStoreIpc.js) — обработчик `tg:sender-avatar`
- [`src/native/utils/messageGrouping.js`](../src/native/utils/messageGrouping.js) — `senderAvatar` в group и album объектах

---

### v0.87.112 — Фикс аватарок: GetFullUser для User без photo в базовой entity

**Причина** (найдена через логи): `downloadSenderAvatarsInBackground` вызывал `downloadProfilePhoto(m.sender)` напрямую. У части User-объектов из группы `photo=n/a` — базовая GramJS entity не содержит атрибут photo. `downloadProfilePhoto` при `entity.photo === null` немедленно возвращает `null` без запроса к серверу. Буфер null → тихий пропуск.

**Из логов**: `total=50 noSender=0 toDownload=7` — 7 хотели скачать, только 3 получили `OK`. Остальные 4 имели `photo=n/a`.

**Фикс**: перед `downloadProfilePhoto` — если `sender.photo` отсутствует/пустой, вызываем `Api.users.GetFullUser` чтобы получить полный профиль (то же что делает `loadAvatarsAsync` для диалогов). Если и в полном профиле нет фото — пропускаем. Добавлено логирование ошибок (было тихо).

**Затронутые файлы:**
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — `GetFullUser` fallback в `downloadSenderAvatarsInBackground`

---

### v0.87.111 — Фоновое скачивание аватарок отправителей групп

**Причина**: `loadAvatarsAsync` скачивает аватарки только для диалогов из списка чатов. Участники групповых чатов, с которыми нет прямого диалога, никогда не попадали в кэш → в сообщениях всегда показывались цветные круги с инициалами вместо фотографий.

**Как работает:**
- Бэкенд: после `tg:get-messages` запускается `downloadSenderAvatarsInBackground(msgs, chatId, client)` без `await` — не блокирует UI
- Функция собирает уникальных отправителей (не исходящих), у которых нет файла `tg-avatars/{senderId}.jpg`
- Скачивает через `client.downloadProfilePhoto(m.sender, { isBig: false })` с throttle 200мс между запросами + обработкой FLOOD_WAIT
- После каждой загрузки эмитирует `tg:sender-avatar { chatId, senderId, avatarUrl }`
- Фронт: новый обработчик в `nativeStoreIpc.js` — обновляет `senderAvatar` во всех сообщениях этого чата с совпадающим `senderId`
- При повторном открытии чата файлы уже есть → `mapMessage` сразу возвращает URL, без задержки

**Затронутые файлы:**
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — функция `downloadSenderAvatarsInBackground` + вызов после emit `tg:messages`
- [`src/native/store/nativeStoreIpc.js`](../src/native/store/nativeStoreIpc.js) — обработчик `tg:sender-avatar`

---

### v0.87.110 — Визуал мьюта + двухуровневое меню + аватарки отправителей в группах

**Три изменения в одном релизе:**

**1. Тёмная аватарка для заглушённых чатов** (`ChatListItem.jsx`)
- `filter: brightness(0.5) saturate(0.4)` — аватарка становится тёмно-серой
- Маленький кружок 16px со значком 🔕 в левом нижнем углу аватарки
- Отдельная иконка 🔕 в строке убрана — всё на аватарке
- Серый бейдж непрочитанных сохраняется

**2. Двухуровневое меню мьюта** (`MuteMenu.jsx`)
- Шаг 1 «main»: «🔕 Выключить уведомления ›» (если не заглушён) или «🔔 Включить» + «Изменить время ›»
- Шаг 2 «times»: «‹ Назад» в шапке + 6 временных интервалов
- Esc на шаге 2 → возврат на шаг 1 (не закрывает меню)
- Стрелка › в конце кнопки показывает что есть подменю

**3. Фикс аватарок отправителей в групповых чатах** (`InboxChatPanel.jsx` + `telegramMessages.js`)
- **Проблема**: все сообщения показывали аватарку самого чата (`activeChat.avatar`) — баг с v0.87.27
- **Причина**: `const groupChat = !item.isOutgoing ? activeChat : null` → брал фото чата для всех
- **Решение**: `mapMessage` теперь добавляет поле `senderAvatar` — путь к кэшированному фото отправителя из `tg-avatars/{senderId}.jpg` (если скачано). Фронт использует `item.senderAvatar`, при отсутствии — цветной круг с инициалами по хэшу `senderId`
- **Ограничение**: фото отображается только если аватарка отправителя уже скачана `loadAvatarsAsync`. При первом открытии чата может быть цветной круг — после перезапуска/обновления появится фото

**Затронутые файлы:**
- [`src/native/components/ChatListItem.jsx`](../src/native/components/ChatListItem.jsx) — тёмная аватарка + 🔕 кружок, убрана строчная иконка
- [`src/native/components/MuteMenu.jsx`](../src/native/components/MuteMenu.jsx) — двухуровневый step-state ('main'|'times')
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — `senderAvatar` в mapMessage из кэша
- [`src/native/components/InboxChatPanel.jsx`](../src/native/components/InboxChatPanel.jsx) — `item.senderAvatar` вместо `activeChat.avatar`, fallback-цвет по хэшу senderId

---

### v0.87.109 — Заглушение уведомлений чата (мьют)

**Что изменилось:** ПКМ по чату в списке → контекстное меню как в Telegram.

**Временные интервалы:** На час / На 4 часа / На 8 часов / На 1 день / На 3 дня / Навсегда.
Если чат уже заглушён — первым пунктом «Включить уведомления» (зелёный).

**Затронутые файлы:**
- [`main/native/telegramChats.js`](../main/native/telegramChats.js) — `mapDialog` извлекает `isMuted` + `muteUntil` из `d.dialog?.notifySettings?.muteUntil`
- [`main/native/telegramChatsIpc.js`](../main/native/telegramChatsIpc.js) — новый handler `tg:set-mute` через `Api.account.UpdateNotifySettings`
- [`src/native/store/nativeStore.js`](../src/native/store/nativeStore.js) — action `setMute(chatId, muteUntil)` с оптимистичным обновлением
- [`src/native/components/MuteMenu.jsx`](../src/native/components/MuteMenu.jsx) — **новый** компонент, `position: fixed`, закрывается по Esc/клику снаружи
- [`src/native/components/InboxChatListSidebar.jsx`](../src/native/components/InboxChatListSidebar.jsx) — `muteMenu` state + `handleContextMenu` + передаёт `onContextMenu` в `rowProps`
- [`src/native/components/ChatRow.jsx`](../src/native/components/ChatRow.jsx) — пробрасывает `onContextMenu` в `ChatListItem`
- [`src/native/components/ChatListItem.jsx`](../src/native/components/ChatListItem.jsx) — 🔕 иконка + серый бейдж для заглушённых чатов

---

### v0.87.108 — Кнопки режимов перенесены в шапку правой панели (Вариант A)

**Что изменилось:**

| Было | Стало |
|---|---|
| Шапка `native-header` (48px) с «ЦентрЧатов» + [Чаты][Клиенты][Доска] над всем | Шапки нет — список чатов и правая панель занимают всю высоту |
| Кнопки режимов слева над списком чатов | Кнопки в шапке правой панели (над окном чата) |

**Затронутые файлы:**
- `src/native/NativeApp.jsx` — удалён `<div className="native-header">`, кнопки убраны оттуда; `modes={MODES}` передаётся в `<InboxMode>`; для non-inbox placeholder добавлена обёртка с кнопками сверху
- `src/native/modes/InboxMode.jsx` — принимает `modes` пропом; в шапке правой колонки рисует переключатель 48px с теми же CSS-классами

**Итоговый вид:**
```
┌─ боковая ─┬────────────────────┬──────────────────────────────┐
│           │  🔍 Поиск...       │  [Чаты ●][Клиенты][Доска]    │
│  БНК 🟢   │  [Все][БНК][Avto] │  ─────────────────────────   │
│  Avto 🟢  │  ── 659 ──         │  [Имя чата]     ✈️ Tg · БНК  │
│  [ + ]    │  список чатов      │  сообщения...                │
└───────────┴────────────────────┴──────────────────────────────┘
```

**Тесты:** lint 0 / vitest 143/143

---

### v0.87.107 — Убрана угловая иконка с аватарки чата

**Изменение**: в `ChatListItem.jsx` удалён блок с угловой ✈️ на аватарке 44px.
**Причина**: под именем чата уже есть микро-строка «✈️ Telegram · БНК» — двойного обозначения не нужно.
**Что не тронуто**: полоса слева, микро-строка (с tooltip), hover-поведение, всё остальное.

**Подтверждено работающим (визуальная приёмка v0.87.106)**:
- ✅ Sidebar: два круга 48px с фото профиля + имена снизу
- ✅ На круге аккаунта: ✈️ в углу + зелёная точка онлайн
- ✅ Красный кружок с цифрой при наличии непрочитанных
- ✅ Поиск сверху, фильтр-кнопки ПОД поиском
- ✅ Синяя полоса слева на каждом чате
- ✅ Микро-строка «✈️ Telegram · БНК» под именем чата (tooltip работает)
- ✅ Hover на аккаунте → его чаты подсвечены, чужие приглушены
- ✅ В шапке открытого чата — серый маркер «✈️ Telegram · БНК»

---

### v0.87.106 — Финальный multi-account UI (визуальный пакет)

**Контекст**: в v0.87.105 multi-account был реализован функционально — два аккаунта работали, чаты не путались. Но визуально UI был сырой: квадратные бейджи с буквой `Б` рядом с именем чата, sidebar с яркой синей подсветкой активного, фильтр сверху над поиском. Пользователь по итогам обсуждения 3 вариантов выбрал финальный дизайн.

**Что выбрано** (после 3 итераций обсуждения):

| Блок | Решение |
|---|---|
| Sidebar | Круг + имя + ✈️ + точка онлайн + бейдж непрочит. **БЕЗ** яркого фона активного |
| Фильтр-кнопки | Перенесены **ПОД** поиск |
| Список чатов | Цветная полоса слева 3px (фирменный цвет мессенджера) + ✈️ в углу аватарки + микро-строка «✈️ Telegram · БНК» |
| Цвет полосы | Telegram=#2AABEE, WhatsApp=#25D366, VK=#0077FF, MAX=#7B3FE4, Viber=#7360F2 |
| Hover-tooltip | На бейджах в sidebar и на угловой ✈️ в чатах |
| Иконка типа чата | 👤 👥 📢 🤖 — оставлена ПЕРЕД именем (как было) |
| Бонус | В шапке открытого чата — серый маркер «✈️ Telegram · БНК» |
| Улучшение 1 | Hover на аккаунте в sidebar → его чаты подсвечиваются (rgba(42,171,238,0.05)), чужие приглушаются (opacity 0.35) |

**Затронутые файлы (9)**:

1. **`src/native/utils/messengerBranding.js`** (новый) — `MESSENGER_COLORS`, `MESSENGER_EMOJI`, `MESSENGER_NAMES` константы + helpers `getMessengerColor/Emoji/Name`. Готов к расширению при добавлении WhatsApp/VK/MAX.

2. **`src/native/NativeApp.jsx`**:
   - Новый компонент `AccountAvatar` (круг 48px + ✈️ в углу + точка онлайн + бейдж непрочит + имя снизу).
   - `unreadByAccount` useMemo — подсчёт непрочитанных по аккаунтам.
   - `hoveredAccountId` state + `onMouseEnter`/`Leave` на `AccountAvatar`.
   - Передача `hoveredAccountId` в `<InboxMode>`.
   - Удалена логика яркой подсветки активного (`native-account--active`).

3. **`src/native/components/ChatListItem.jsx`** — переписан:
   - Цветная полоса слева 3px (`stripeColor` из `messengerBranding`) — рисуется только при `multiAccount=true`.
   - Угловая ✈️ (18px) в правом нижнем углу 44px-аватарки чата.
   - Микро-строка под именем «✈️ Telegram · БНК» серым 10px (только в multi-account).
   - `dimmed` (opacity 0.35) когда `hoveredAccountId !== chat.accountId` (Улучшение 1).
   - `highlighted` (фоновое подсвечивание) когда `hoveredAccountId === chat.accountId`.
   - Tooltip с именем мессенджера + аккаунта + телефоном.
   - Удалена старая `accBadge` логика (квадратик с буквой).

4. **`src/native/components/ChatRow.jsx`** — пробрасывает `hoveredAccountId` + `multiAccount` (вместо `showAccountBadge`).

5. **`src/native/components/InboxChatListSidebar.jsx`**:
   - Поиск перенесён ВВЕРХ кода (= ВЫШЕ в UI).
   - Фильтр-кнопки идут ПОСЛЕ поиска (= ПОД поиском в UI).
   - Принимает `hoveredAccountId` пропом и пробрасывает в `ChatRow.rowProps`.

6. **`src/native/modes/InboxMode.jsx`** — принимает `hoveredAccountId` от родителя, пробрасывает в `<InboxChatListSidebar>`.

7. **`src/native/components/InboxChatPanel.jsx`** — в шапке открытого чата при 2+ аккаунтах рисуется маркер `✈️ Telegram · БНК` серым 11px справа от имени чата (Бонус).

8. **`src/__tests__/multiAccount.test.cjs`** — обновлён, +14 проверок:
   - `messengerBranding`: фирменные цвета `#2AABEE`/`#25D366` + `✈️`.
   - `ChatListItem`: импорт `messengerBranding`, полоса слева, угловая ✈️, микро-строка, dimmed.
   - `ChatRow`: пробрасывает `hoveredAccountId`.
   - `Sidebar (NativeApp.jsx)`: компонент `AccountAvatar`, угловой ✈️, `unreadByAccount`, `setHoveredAccountId`.
   - Удалена яркая подсветка активного (тест проверяет отсутствие `'native-account--active'` в условиях рендера).
   - `InboxChatPanel` импортирует `messengerBranding`.
   - Поиск идёт В КОДЕ выше блока фильтров (= в UI выше).
   - Итого: 56 проверок (было 42).

9. **`src/native/components/__snapshots__/ChatListItem.vitest.jsx.snap`** — обновлён под новую разметку (полоса слева добавила `padding-left: 14px` и `transition: opacity`).

**Что юзер увидит**:

- **1 аккаунт** — UI почти как раньше: фильтр и бейджи скрыты, sidebar показывает один круг с именем.
- **2+ аккаунтов**:
  - Sidebar: два круга с реальными фото профиля Telegram, под каждым — имя «БНК» / «Avtoliberty». В углу — ✈️ синий. Снизу справа — зелёная точка-индикатор онлайн. Если в аккаунте есть непрочитанные — красный кружок с цифрой в левом верхнем углу.
  - Поиск сверху, под ним — кнопки `[Все 655] [БНК 458] [Avtoliberty 197]`.
  - Каждый чат: синяя полоса слева, на 44px-аватарке в углу мини-✈️, под именем чата мелким серым «✈️ Telegram · БНК».
  - Hover на круге БНК в sidebar → все его чаты подсвечиваются, чужие приглушаются.
  - В открытом чате в шапке справа от имени — «✈️ Telegram · БНК» серым.

**Тесты**: все 32 cjs-теста (включая новый `multiAccount` 56/56) + vitest 143/143 + lint 0 ошибок + fileSizeLimits 206/206.

**Что не задето**: бизнес-логика multi-account из v0.87.105 (Map клиентов, IPC routing, миграция старой сессии), Login flow, отправка/приём сообщений, scroll/markRead, AI-помощник, WebView режим.

---

### v0.87.105 — Реализация multi-account для нативного Telegram (Шаг 2.5)

**Контекст**: в v0.87.104 задокументирован план (ADR-016 + Шаг 2.5). В этой версии — полная реализация согласно плану, без отступлений.

**UX согласно Варианту B** (выбрано в обсуждении):

```
┌──────┬─────────────────────────────────────┐
│ ●BН  │  [Все] [BНК] [Avtoliberty]          │  ← фильтр (при 2+ аккаунтах)
│ ●AV  │  ──────────                          │
│ ───  │  🔍 Поиск по чатам                   │
│  +   │  ──────────                          │
│      │  💬 458 чатов                        │
│      │  ──────────                          │
│      │  [BН] OZONовая Дыра (999+)           │  ← цветной бейдж аккаунта
│      │  [AV] Иванов клиент (3)              │
│      │  [BН] Эксплойт ✓ (25)                │
│      │  [AV] Заявка #12345 (1)              │
│      │  ...                                 │
└──────┴──────────────────────────────────────┘
```

**Backend (8 файлов)**:

1. **`telegramState.js`** — `state.clients: Map<accountId, TelegramClient>`, `state.accounts: Map<accountId, NativeAccount>`, `state.activeAccountId`, `state.sessionsDir`. Backward-compat алиасы `state.client` / `state.currentAccount` указывают на активный. Helpers: `accountIdFromChat(chatId)`, `getClientForChat(chatId)`, `getAccountForChat(chatId)`, `registerAccount(id, client, account)`, `setActiveAccount(id)`, `unregisterAccount(id)`.

2. **`telegramAuth.js`** — `startLogin` создаёт ЛОКАЛЬНЫЙ `newClient` (не `state.client`). После success → `registerAccount(accountId, newClient, account)`, `attachMessageListener(newClient, accountId)`. Сохранение в `tg-sessions/{accountId}.txt`. При login fail — уничтожаем только локальный newClient, существующие в state.clients не задеваем.

3. **`telegramAuth.js → autoRestoreSessions`** — сканирует `tg-sessions/` и восстанавливает все. Для каждого: `restoreOneSession(sessionStr, accountId)` → `registerAccount` → `attachMessageListener`.

4. **`telegramAuth.js → migrateLegacySession`** — при первом запуске v0.87.105 читает старый `tg-session.txt`, делает `getMe()`, переносит в `tg-sessions/{id}.txt`, удаляет старый.

5. **`telegramHandler.js`** — `state.sessionsDir = path.join(userData, 'tg-sessions')` + `mkdirSync`. Вызов `autoRestoreSessions` (новое имя). Старый `autoRestoreSession` остался как backward-compat alias.

6. **`telegramMessages.js`** — `attachMessageListener(client, accountId)` параметризован. Все handlers (`tg:send-message`, `tg:get-messages`, `tg:edit-message`, `tg:delete-message`, `tg:forward`, `tg:send-file`, `tg:send-clipboard-image`) маршрутизируют через `getClientForChat(chatId)`.

7. **`telegramChatsIpc.js`** — все handlers через `getClientForChat`. `tg:get-chats` принимает `args.accountId` (если не передан — итерирует по всем `state.clients`). `tg:remove-account` принимает `args.accountId` (per-account wipe; full wipe только если последний). `tg:get-cached-chats` читает все `tg-cache-{accountId}.json`.

8. **`telegramChats.js`** — `mapDialog(d, accountId)`, `saveChatsCache(chats, accountId)` (per-account кэш), `loadAvatarsAsync(dialogs, accountId)`, `loadRestPagesAsync(firstPage, client, accountId)`. `fetchAllUnreadUpdates` итерирует по всем `state.clients`.

9. **`telegramMedia.js`** — `download-video` / `download-media` через `getClientForChat`.

**Renderer (4 файла)**:

10. **`store/nativeStore.js`** — добавлено `chatFilter: 'all'` в `DEFAULT_STATE`, callback `setChatFilter`. `loadChats` без аргумента (multi-account default).

11. **`store/nativeStoreIpc.js`** — `tg:account-update` `removed: true` при `isLast=false` точечно удаляет ТОЛЬКО чаты/сообщения этого аккаунта (фильтрация по prefix accountId в chatId), остальные аккаунты сохраняются.

12. **`components/InboxChatListSidebar.jsx`** — фильтр-кнопки `[Все] [Account1] [Account2]` сверху (показываются при 2+ аккаунтах). Бейджи аккаунтов передаются в `ChatRow → ChatListItem`.

13. **`components/ChatListItem.jsx`** — рендер инициалов аккаунта (accBadge) слева от иконки чата.

14. **`modes/InboxMode.jsx`** — фильтр чатов через `store.chatFilter` (по умолчанию 'all'). `loadChats()` без аргумента.

**Тесты**:

- **`src/__tests__/multiAccount.test.cjs`** — новый, 42 проверки (state, helpers, auth, handler, IPC routing, mapDialog, UI chatFilter, sidebar buttons, account badge).
- Добавлен в `scripts/hooks/pre-push` и `package.json:scripts.test`.

**Миграция данных**:

При первом запуске v0.87.105 — `migrateLegacySession()`:
1. Если `tg-session.txt` существует — читаем, `getMe()`, перемещаем в `tg-sessions/{accountId}.txt`, удаляем старый.
2. Если миграция упала — старый файл оставляем (резерв на следующий запуск).

**Что юзер увидит**:

- Один аккаунт — UI как раньше (фильтр-кнопки скрыты, бейджи аккаунта не показываются).
- Два аккаунта — фильтр сверху + бейджи `[BH]` / `[AV]` слева в каждом чате.
- Logout одного из двух — второй продолжает работать, его чаты/сообщения остаются.
- При перезапуске оба аккаунта восстанавливаются автоматически.

**Что НЕ задето** (поведение сохранено):
- Login flow (phone → code → 2FA), CodeInput, CountryPicker
- Send/edit/delete/forward сообщений
- Markread, pin, typing, аватарки, медиа
- Kanban / Контакты / AI-помощник
- WebView вкладки (Telegram Web БНК / Avtoliberty работают по-старому через `app:register-webview` v0.84.0)

**Pre-push pipeline**: 32 cjs-тестов (был 31) + vitest 143/143 + lint 0 ошибок.

---

### v0.87.104 — План multi-account для нативного Telegram (документация)

**Контекст**: Пользователь сообщил баг — при добавлении второго Telegram-аккаунта в native режим первый исчезает. Расследование показало:

1. `state.client` / `state.currentAccount` / `state.sessionPath` — singleton (один на процесс)
2. UI (`nativeStore.js: accounts: []`) **уже** массив — поддержка multi заложена
3. План `native-mode-plan.md` в архитектуре (`accountId` поле, sidebar, SQL accounts table) тоже подразумевает multi-account
4. **Конкретный шаг реализации был упущен** — Шаг 2 описал MVP с одним файлом сессии

При login второго аккаунта пересоздаётся `state.client`, перезаписывается `tg-session.txt` → первый аккаунт навсегда теряется.

**Что задокументировано в этой версии**:

1. **`decisions.md` → ADR-016**: полное архитектурное решение
   - State refactor (Map вместо singleton)
   - Сессии — отдельный файл на аккаунт (`tg-sessions/{id}.txt`)
   - IPC контракт (маршрутизация по `chatId.split(':')[0]`)
   - UI единая лента (Вариант B)
   - autoRestoreSession — сканирование папки
   - Миграция старого `tg-session.txt`
   - 5 явных ловушек чтобы не повторить
   - Список 12 затрагиваемых файлов

2. **`native-mode-plan.md` → Шаг 2.5**: пошаговая реализация
   - Backend: 8 файлов (`telegramState`/`telegramAuth`/`telegramHandler`/`telegramChats`/`telegramChatsIpc`/`telegramMessages`/`telegramMedia`/`telegramCleanup`)
   - UI: 4 файла (`nativeStore.js`/`nativeStoreIpc.js`/`InboxChatListSidebar.jsx`/`LoginModal.jsx`)
   - Тесты — какие создать/обновить
   - Код миграции при первом запуске v0.87.104
   - ASCII-мокап финального UI с фильтр-кнопками и цветными бейджами

**Выбранная UX-схема**: единая лента (Вариант B) — все чаты со всех аккаунтов в одном scroll, отсортированы по времени, цветной бейдж аккаунта слева, фильтр-кнопки «Все / БНК / Avtoliberty» сверху. Звук+ribbon на ВСЕ аккаунты с лейблом аккаунта.

**Почему именно Вариант B (не A «как Telegram Desktop»)**: целевая аудитория плана — «1-5 операторов» (`native-mode-plan.md` строка 410). Оператор не должен переключать контекст между аккаунтами весь день. Единая лента + фильтр на случай нужды сосредоточиться.

**Реализация**: следующая итерация (v0.87.105+). Текущая версия только документирует план чтобы не упустить снова.

**Что уже работает (не требует доработки)**:
- WebView multi-account через `app:register-webview` (v0.84.0) — две вкладки Telegram (БНК, Avtoliberty) в верхней панели работают штатно
- UI для нескольких аккаунтов (`nativeStore.js: accounts: []` массив, sidebar мини-иконок)
- IPC контракт `tg:account-update { id, ... }` — добавляет в массив, не заменяет
- Формат `chatId = {accountId}:{chatNumericId}` уже используется (готов к маршрутизации)

**Что не работает (требует Шага 2.5)**:
- Native-режим (нативный Telegram через GramJS) поддерживает только ОДНУ сессию

---

### v0.87.103 — Разбиение 5 файлов на 80%+ от лимита

**Контекст**: тест `fileSizeLimits` показывал 5 файлов на 80–95% от лимита. При следующих фичах они бы пробили потолок, поэтому разбиваем сейчас.

**Что разбито**:

| Файл | До | После | Куда вынесено |
|---|---|---|---|
| `src/native/modes/InboxMode.jsx` | 567 (95%) | **391** ✅ | `components/InboxChatPanel.jsx` (~210 строк JSX окна чата) |
| `main/native/telegramChats.js` | 475 (95%) | **217** ✅ | `telegramChatsIpc.js` (~270 строк, все `ipcMain.handle('tg:*')`) |
| `src/native/store/nativeStore.js` | 445 (89%) | **209** ✅ | `store/nativeStoreIpc.js` (~250 строк, `attachTelegramIpcListeners` + cache helpers) |
| `main/main.js` | 484 (81%) | **247** ✅ | `handlers/mainIpcHandlers.js` (~250 строк, `registerMainIpcHandlers` со всеми app:*/messengers:*/settings:*/tray:*) |
| `src/hooks/useTabContextMenu.js` | 127 (85%) | **88** ✅ | `hooks/tabContextMenuDiag.js` (~50 строк, runTabDiag для diagDOM/diagFull/diagAccount) |

**Принципы разбиения**:
- В каждом случае выделен **самостоятельный логический кусок** (UI рендер, IPC handlers, диагностика).
- Состояние не дублируется — передаётся через `setState` callback или объект deps.
- Импорты и контракты не задеты — тесты `vitest 143/143`, `lint clean`.

**Тесты обновлены под новую структуру** (10 тестов считают content нескольких файлов как объединённый):
- `appStructure.test.cjs` — добавлен `webviewHandleNewMessage.js`
- `storageErrors.test.cjs` — добавлен `mainIpcHandlers.js` + `dockPinState.js`
- `ipcChannels.test.cjs` — добавлены `mainIpcHandlers.js` + `dockPinState.js`
- `mainProcess.test.cjs` — добавлен `mainIpcHandlers.js`, обновлён тест overlayIcon (теперь в trayManager.js + mainIpcHandlers.js)
- `notifHooks.test.cjs` — добавлен `mainIpcHandlers.js`
- `integrationChains.test.cjs` — добавлен `webviewHandleNewMessage.js`, обновлён mainCode
- `smokeTest.test.cjs` — добавлен `mainIpcHandlers.js`

**Финальные результаты**:
- `fileSizeLimits` 199 → **204** проходят (5 новых файлов, ни одного предупреждения 80%+)
- `vitest` 143/143 ✅
- `lint` 0 ошибок
- pre-commit static tests: все проходят (storageErrors, componentScope, appStructure, mainImports, mainProcess, smokeTest, integrationChains, notifHooks, ipcChannels, ...)

**Что не задето**: ВСЯ бизнес-логика, IPC контракты, UI поведение, рендер-выводы. Это чистый рефакторинг — функциональность 100% сохранена.

---

### v0.87.102 — CodeInput: 5 отдельных ячеек для кода Telegram

**Контекст**: пользователь сообщил что placeholder `12345` в поле ввода кода непонятен — глаз воспринимает цифры как настоящий код. Стандарт индустрии (Telegram, WhatsApp, банки, 2FA) — отдельные ячейки.

**Что сделано** ([components/CodeInput.jsx](src/native/components/CodeInput.jsx) — новый файл, ~95 строк):

- 5 отдельных `<input maxLength={1}>` в ряд, в каждом placeholder `–` (тире)
- `inputMode="numeric"` + `autoComplete="one-time-code"` — на iOS появится клавиатура с цифрами и подсказка кода из SMS
- Цифра введена → авто-focus на следующую ячейку
- `Backspace`: если в ячейке цифра — стираем; если пусто — переходим в предыдущую и стираем там
- Стрелки `←/→` — перемещение между ячейками
- `Paste` — текст из буфера разбивается на цифры и распределяется по ячейкам (юзер копирует «12345» → авто-заполняется)
- `onComplete` callback срабатывает когда все 5 цифр введены → авто-submit
- `Enter` — submit если все цифры есть

**Стили** ([styles-login.css](src/native/styles-login.css)) — `.code-input` (flex), `.code-input__cell` (48×56px, 24px font, accent-border при focus), `--filled` модификатор когда цифра введена.

**Использование в LoginModal**: заменил `<input type="text" placeholder="12345">` на `<CodeInput length={5} ... />`. Кнопка «Подтвердить» disabled пока `code.length < 5`.

**Преимущества перед старым input**:
- 🟢 Юзер сразу видит «5 цифр»
- 🟢 Не путается с placeholder-цифрами как с введёнными
- 🟢 Быстрый ввод — auto-focus экономит клики
- 🟢 Paste из буфера работает как ожидается
- 🟢 Знакомый паттерн (банки, СМС, 2FA — везде так)

**Тесты обновлены**: `AuthFlow.vitest.jsx` ищет `.code-input__cell` (5 ячеек) вместо `placeholder="12345"`.

**Что не задето**: handleCode, ввод 2FA-пароля, обработка ошибок, переходы между шагами, optimistic UI, countdown.

---

### v0.87.101 — libphonenumber-js + фикс двух багов retry-цикла

**Контекст**: после v0.87.98–v0.87.100 retry-цикл GramJS ВЕРНУЛСЯ когда юзер ввёл 9 цифр для России (вместо 10) — кнопка была активна, номер ушёл в Telegram, начался спам.

**Найдено два бага и причина**:

1. **Frontend пропускал короткие номера**. В [LoginModal.jsx](src/native/components/LoginModal.jsx) была проверка `minDigits = nationalDigits - 1` (для России 9 вместо 10). Это «запас на разные форматы» оказался слишком мягким и пропустил неполный номер.

2. **Счётчик попыток `phoneNumber` callback сбрасывался**. В [telegramAuth.js](main/native/telegramAuth.js) счётчик хранился в `state.pendingLogin.phoneAttempts`. После первой ошибки `state.pendingLogin = null` → при следующем вызове счётчик `0 + 1 = 1` (а не `2`) → проверка `n > 1` не срабатывала → throw не происходил → retry-цикл GramJS продолжался.

**Решение — libphonenumber-js + closure-счётчик**:

| Слой | Где | Что изменилось |
|---|---|---|
| Валидация frontend | `LoginModal.jsx` | `isValidPhoneNumber('+' + dial + national)` из libphonenumber-js — настоящая проверка формата для каждой страны. Кнопка disabled пока номер реально не валиден. |
| Валидация main | `telegramAuth.js` (handler `tg:login-start`) | Та же `isValidPhoneNumber()` — последний слой защиты. Старая ручная проверка «8-15 цифр» удалена. |
| Счётчик попыток | `telegramAuth.js` (внутри `startLogin`) | Из `state.pendingLogin.phoneAttempts` → в **closure-переменную** `let phoneAttempts = 0`. Не сбрасывается при `state.pendingLogin = null`, живёт пока живёт замыкание. |
| Первая ошибка | `telegramAuth.js` | Аналогично — `let firstError = null` в closure вместо `state.pendingLogin.firstError`. |
| Сообщения юзеру | `LoginModal.jsx` | Конкретно: «Номер слишком короткий: 9 цифр, нужно 10 для России». Раньше было общее «Введи 10 цифр». |

**Зависимость**: `libphonenumber-js` 1.12.42 (~145 KB). Это форк Google libphonenumber для JS, минимальная версия. Используют Telegram Web, WhatsApp Web, Viber.

**Почему именно closure а не state**:
- `state.pendingLogin` сбрасывается на `null` чтобы НОВАЯ авторизация могла стартовать
- Но GramJS внутри ещё может звать наш callback (асинхронно, через retry)
- Если счётчик в state — он 0 → кажется что это первая попытка → разрешаем
- Closure-переменная привязана к КОНКРЕТНОЙ сессии `startLogin()` — она правильно знает «уже было»

**Что не задето**: список 23 стран, CountryPicker, авто-выбор по локали, перевод ошибок Telegram, autoRestoreSession.

---

### v0.87.100 — Фиксы CountryPicker: позиционирование + флаги на Windows

**Проблема 1: dropdown вылезал за нижний край модалки/экрана.**
Когда LoginModal был внизу экрана и юзер кликал picker, список из 23 стран открывался ВНИЗ и выходил за границу окна — крайние пункты списка («Сербия», «Черногория») были недоступны.

**Решение** ([CountryPicker.jsx](src/native/components/CountryPicker.jsx)):
- При открытии замеряем `wrapRef.current.getBoundingClientRect()` через `useLayoutEffect`
- Если снизу < 340px И сверху больше места → ставим класс `--up`
- В CSS `.country-picker__dropdown--up { top: auto; bottom: calc(100% + 4px) }` — открывается вверх
- Высота списка уменьшена с 280px до 220px (`styles-login.css`)

**Проблема 2: эмодзи-флаги не отображались.**
На Windows стандартный шрифт Segoe UI Emoji **не имеет regional indicator pairs** (это известный косяк системы — Microsoft принципиально не поддерживает). Пары символов вроде `🇷🇺` (U+1F1F7 U+1F1FA) показывались просто как буквы «RU». Это видно на скриншоте пользователя.

**Решение**: компонент `CountryBadge` рисует стилизованный квадратик с ISO-кодом через CSS (gradient + accent-border), выглядит одинаково на всех ОС. Лучше чем сломанный эмодзи. Если в будущем понадобятся реальные флаги — встроить SVG-набор `country-flag-icons` или Twemoji.

**Что НЕ трогали**: список 23 стран, `getDefaultCountry(locale)`, валидация в `LoginModal.jsx`, защита от retry-цикла в `telegramAuth.js`.

---

### v0.87.99 — CountryPicker в LoginModal (выбор страны как в Telegram)

**Контекст**: после v0.87.98 хинт «+ и 8–15 цифр» был непонятен и не учитывал что у разных стран разные форматы. Пользователь попросил picker по образцу Telegram/WhatsApp.

**Что сделано**:

1. **`src/native/data/countries.js`** (новый файл, ~100 строк) — статичный список 23 стран:
   - СНГ: RU, BY, KZ, UA, UZ, AM, GE, AZ, KG, TJ, TM, MD
   - Популярные у мигрантов: TR, DE, IL, US, CY, AE, TH, VN, CN, ME, RS
   - Поля: `code` (ISO), `name` (рус.), `dial` (без +), `flag` (эмодзи), `nationalDigits` (длина без кода)
   - Функция `getDefaultCountry(locale)` — определяет страну по `navigator.language` (RU/BY/UA/KZ → автоматический выбор; иначе fallback на RU)

2. **`src/native/components/CountryPicker.jsx`** (новый файл, ~80 строк) — компонент:
   - Кнопка-триггер `[флаг +код ▾]` слева от input номера
   - Dropdown снизу с поиском (по имени/коду/dial)
   - Закрытие при клике вне (через `mousedown` listener)
   - Активный пункт подсвечен accent-цветом
   - `Esc` закрывает, `Enter` выбирает первый из результата

3. **`src/native/components/LoginModal.jsx`** — переработка:
   - Состояние разделено: `country` (объект) + `nationalNumber` (только цифры без кода)
   - Финальный номер собирается: `'+' + country.dial + nationalNumber` → отправляется в `startLogin`
   - Кнопка disabled пока цифр меньше `country.nationalDigits - 1` (запас на разные форматы)
   - Понятные ошибки: «Введи 10 цифр номера для России»
   - Дефолт при открытии — Россия (для русской локали системы)

4. **`src/native/styles-login.css`** — стили `.country-picker`, `.country-picker__dropdown`, `.country-picker__list`, `.country-picker__item`. Использует `--amoled-*` переменные темы. Анимация `native-menu-fadein` уже была.

5. **`src/native/components/LoginModal.vitest.jsx`** — тесты обновлены под новый API (input принимает только цифры без +, проверка disabled-кнопки).

**Архитектура**: НЕ через API — список встроен в bundle (~3 КБ). Без зависимостей `npm`. Если нужна редкая страна — добавить одну строку в `countries.js`.

**Защита от retry-цикла из v0.87.98 ОСТАЁТСЯ** — это второй слой (на случай если фронт пропустит мусор):
- Валидация в `tg:login-start` handler
- Счётчик попыток в `phoneNumber` callback
- Запоминание первой ошибки

---

### v0.87.98 — Фикс бесконечного retry-цикла GramJS при неполном номере

**Симптом** (репорт пользователя): при вводе неполного номера в LoginModal Telegram-авторизации (например `+795213030` вместо полных 11 цифр) программа зависала, а в журнал бесконечно сыпалось:

```
[tg] client asked phoneNumber
[tg] client onError: Cannot send requests while disconnected. Please reconnect.
[tg] emit tg:login-step phone
```

**Причины**:
1. **Нет валидации формата** ни в renderer ни в main — любой текст уходил в GramJS
2. `phoneNumber` callback в [telegramAuth.js:115](main/native/telegramAuth.js#L115) **всегда возвращал тот же неполный номер** — каждая попытка GramJS получала тот же мусор
3. `Cannot send requests while disconnected` — не считалась фатальной → `state.client` не уничтожался → внутренний retry-цикл GramJS продолжался
4. Юзеру показывалось **последнее** сообщение об ошибке (`Соединение прервано`) вместо ПЕРВОЙ реальной (`PHONE_NUMBER_INVALID`)

**4 слоя защиты**:

| Слой | Файл | Что делает |
|---|---|---|
| 1. Renderer-валидация | `src/native/components/LoginModal.jsx` | `validatePhoneFormat()` проверяет `+` и 8–15 цифр. Кнопка «Получить код» disabled пока формат не верный. Хинт «+ и 8–15 цифр» под инпутом. Ввод подсвечивается красной рамкой. |
| 2. Main-валидация | `main/native/telegramAuth.js` (handler `tg:login-start`) | Та же проверка ДО `startLogin()` — если плохо, возвращаем error, в GramJS даже не лезем. |
| 3. Счётчик попыток | `phoneNumber` callback в `startLogin` | `state.pendingLogin.phoneAttempts`. После 1-й попытки → `throw new Error('PHONE_NUMBER_INVALID')` → прерывает retry-цикл GramJS. |
| 4. Первая ошибка | `onError` + `.catch` | `state.pendingLogin.firstError` запоминает ПЕРВУЮ ошибку (не SESSION_PASSWORD_NEEDED). При фатальном эмитим именно её через `translateTelegramError`. Флаг `_emitted` подавляет повторные emit чтобы UI не моргал. |

**Что увидит юзер теперь**:
- ✅ При вводе короткого номера: кнопка серая + хинт «+ и 8–15 цифр»
- ✅ При корректном но забаненном/несуществующем: понятный текст «Неверный формат номера. Введите +79001234567» (а не «Соединение прервано»)
- ✅ В журнале одна строка ошибки вместо тысячи

**Что не задето**: успешный flow phone → code → password → success, обработка `SESSION_PASSWORD_NEEDED` / `PHONE_CODE_INVALID` / `FLOOD_WAIT`, autoRestoreSession. Перевод `PHONE_NUMBER_INVALID` уже был в `telegramErrors.js:9`.

---

### v0.87.97 — Low Priority cleanup: разбиение 4 крупных файлов

Завершён последний пакет «Low Priority» из плана разбиения файлов. Цель — убрать или ужать крупные `KNOWN_EXCEPTIONS`, чтобы автоматический тест размеров покрывал реальные потолки, а не индивидуальные исключения.

**Что разбито**:

1. **`main/pin-dock.html`** 717 → **25 строк**.
   Вынесено: `main/pin-dock.css` (180), `main/pin-dock.js` (511). По паттерну `notification.html` (v0.87.78). В `electron.vite.config.js → copyStaticPlugin` добавлены копии новых файлов в `out/main/` для production. `pin-dock.js` добавлен в `KNOWN_EXCEPTIONS` с потолком 600 (renderer-код для отдельного BrowserWindow, цельный).

2. **`src/native/styles.css`** 776 → **10 строк** (точка входа с `@import`).
   Вынесено в 6 тематических файлов:
   - `styles-base.css` (203) — AMOLED-тема, header, sidebar, аккаунты, main, empty-state
   - `styles-buttons.css` (81) — `native-btn` + ripple + ghost/danger варианты
   - `styles-login.css` (83) — login screen, sticky-ошибка, спиннер, hint
   - `styles-animations.css` (86) — fade-in, popin, slide-in, sheen, shake
   - `styles-messages.css` (235) — bubbles, разделители, ссылки, аватарки, shimmer, glow
   - `styles-overlays.css` (101) — scroll-to-bottom, PhotoViewer, toast

3. **`src/utils/webviewSetup.js`** 589 → **434 строки**.
   Вынесена функция `handleNewMessage` в `webviewHandleNewMessage.js` (178 строк) — обработка одного входящего сообщения: дедуп → strip-sender → viewing-фильтр → звук + ribbon + preview + history + auto-reply. В `KNOWN_EXCEPTIONS` потолок понижен 600 → 500.

4. **`main/handlers/dockPinHandlers.js`** 571 → **326 строк**.
   Вынесен state (`pinItems` Map, `dockState` объект, `pinIdCounter`) и helper-функции (`savePinItems`, `loadPinItems`, `restorePin`, `ensureDockWindow`, `addToDock`, `removeFromDock`, `removePin`, `checkDockVisibility`, `findPinIdByWin`) в `dockPinState.js` (239 строк). В `dockPinHandlers.js` остались только IPC-handlers. Файл **убран из `KNOWN_EXCEPTIONS`** — теперь в стандартном лимите 500 для `main/handlers/`.

**Результат**:
- Тест `fileSizeLimits` 188 → **196** ✅ (учитывает все новые файлы)
- `KNOWN_EXCEPTIONS` сокращён на одну запись (`dockPinHandlers.js`)
- Все 4 типа разбиения соответствуют существующим паттернам проекта (HTML+CSS+JS как `notification.html`, factory state как в `useWebViewZoom`)

**Что не задето**: логика поведения, IPC контракты, имена CSS-классов, точки входа в JSX. Все импорты обновлены, тест проходит без warning'ов кроме известных 5 файлов на 80%+ от лимита.

---

### v0.87.96 — Фильтр GramJS TIMEOUT: ERROR → WARN

Проблема: при обычных переподключениях к серверам Telegram (раз в 1-3 часа) в журнале пишется `[ERROR] Error: TIMEOUT at .../telegram/client/updates.js:250`. Это не ошибка приложения, а нормальное сетевое событие, но красный цвет в кнопке «Ошибки» пугает пользователя.

**Что сделано** (`main/utils/logger.js`):
- В патче `console.error` добавлена проверка: если в тексте сообщения есть `Error: TIMEOUT` И в стеке `node_modules/telegram/client/updates` → перенаправить в `writeLog('WARN', ...)` с префиксом `[GramJS reconnect]`
- ERROR-уровень не вызывается → не открывается журнал автоматически (autoOpenLogOnError не срабатывает)
- В журнале сообщение попадает в кнопку «Предупр.» вместо «Ошибки»

**Эффект**:
- Кнопка «Ошибки» в журнале — теперь только настоящие ошибки приложения
- Кнопка «Предупр.» — переподключения GramJS видны как полезный сигнал
- Если случится **настоящая** ошибка — она по-прежнему попадёт в «Ошибки» (фильтр срабатывает только при наличии обоих маркеров: `TIMEOUT` И путь GramJS)

**Безопасность фильтра**:
- Не подавляет, а перенаправляет — ничего не теряется
- Срабатывает только при двух одновременных маркерах (TIMEOUT в тексте + telegram/client/updates в стеке)
- При длительной потере связи (10+ минут) GramJS бросит другие ошибки — они попадут в ERROR

**Проверки**: pre-push 31/31 cjs ✅, vitest 142/142 ✅.

**Файлы**: `main/utils/logger.js`, версия 0.87.96.

---

### v0.87.95 — Полный выход из аккаунта (Вариант Б): призрак исправлен + предпросмотр + toast

Проблема: после выхода в боковой панели появлялся призрак «Без имени» (синий вопросительный знак). Корень — backend отправлял `emit('tg:account-update', { id: 'self', ... })` с НОВЫМ id вместо старого. UI не находил «self» в списке и ДОБАВЛЯЛ как новый аккаунт.

**Что сделано**:

A) **Backend (telegramChats.js)**:
- Запоминаем `oldId` ДО обнуления `state.currentAccount`
- В `emit('tg:account-update', { id: oldId, removed: true, wipeStats })` — правильный id
- Новый IPC `tg:get-cleanup-stats` — подсчёт что будет удалено (без удаления)
- В `tg:remove-account` — полная уборка через `performFullWipe()` + проверка после (post-wipe verification)

B) **Новый модуль `main/native/telegramCleanup.js`** (~128 строк):
- `collectCleanupStats()` — безопасный подсчёт (для предпросмотра)
- `performFullWipe()` — реальное удаление session + avatars + cache + media + tmp + чистка Map'ов + clearInterval таймера
- 5 категорий: session, avatars, cache, media, tmp
- Возвращает отчёт: `{ totalFiles, totalBytes, byCategory }`

C) **Frontend (nativeStore.js)**:
- Handler `tg:account-update` с флагом `removed: true` — удаляет аккаунт + обнуляет `chats`, `messages`, `activeChatId`, `activeAccountId`, `loadingMessages`, `typing`
- Сохраняет `lastWipe` в state — для toast в UI
- Новая функция `getCleanupStats()` — обёртка IPC

D) **UI (AccountContextMenu.jsx)**:
- При клике «🚪 Выйти из аккаунта» — асинхронно зовётся `getCleanupStats()` для предпросмотра
- В confirm-блоке таблица категорий с количеством файлов и размером (форматировано: `1.4 МБ`, `245 КБ`)
- ИТОГО снизу — общее число файлов и мегабайт
- Загрузка: «Считаем что удалится...» пока IPC отвечает

E) **Toast в NativeApp.jsx**:
- При смене `store.lastWipe` — показывается toast «✅ Аккаунт удалён. Освобождено N МБ»
- Spring-анимация появления (popin), исчезает через 4 секунды

**Контракт**: после успешного выхода в боковой панели **только** кнопка `+ Добавить аккаунт`. Никаких призраков, никаких следов на диске.

Тесты: 31/31 cjs ✅, 142/142 vitest ✅. Тест confirm-шага обновлён — текст изменился из-за предпросмотра.

**Файлы**: telegramChats.js, telegramCleanup.js (новый), nativeStore.js, AccountContextMenu.jsx + .vitest.jsx, NativeApp.jsx. Версия 0.87.95.

---

### v0.87.94 — Умный logger: Error/DOM Event/stack для пустых объектов

**Зачем**: в `chatcenter.log` каждые 40 секунд писалось `[ERROR] {}` (пустой объект). Невозможно понять что за ошибка и откуда. Корень: `JSON.stringify(error)` возвращает `'{}'` потому что `Error.message`/`stack` — non-enumerable. То же для DOM Event.

**Что сделано** (`main/utils/logger.js`):

**A) Новый smartStringify(a)** — заменяет `JSON.stringify` в `writeLog`:
- `Error` → `name: message | STACK: <первые 4 строки>`
- Объект сериализуется в `{}` → пробуем `Object.getOwnPropertyNames` (берём первые 10 не-функций)
- Не-стрингифицируемое → `{stringify-failed: <reason>}`
- Циклические ссылки безопасны

**B) Stack trace для пустых объектов в console.error**:
- Если все args — пустые объекты без enumerable И non-enumerable свойств
- Добавляется `STACK_TRACE: <первые 4 строки текущего стека>`
- Раньше: `[ERROR] {}` → теперь: `[ERROR] {empty-object} STACK_TRACE: at funcName (file.js:42)...`

**Эффект**:
- Error в логе теперь полные с stack
- Загадочные `{}` теперь покажут реальный источник
- Стандартный JSON-логирование объектов работает как раньше

**Проверки**: pre-push 31/31 cjs ✅ + vitest 142/142 ✅, ESLint ✅.

После следующего использования приложения (~5 минут) в `chatcenter.log` появится **источник** загадочных `{}` ошибок — и можно будет точечно фиксить.

**Файлы**: `main/utils/logger.js`, версия 0.87.94.

---

### v0.87.93 — ФИКС аватарки: cc-media:// + размер 80px + ловушка зафиксирована

**Причина проблемы (v0.87.91-92)**: Chromium блокировал `file:///` URL в renderer (DevTools показывал `Not allowed to load local resource: file:///...`). Файл скачан backend'ом (5318 bytes), но не отрисовывался — это базовая security policy браузера: renderer на `http://localhost:5173` не может загружать `file:///`.

**Решение**: использовать готовый `cc-media://` protocol (`main/native/ccMediaProtocol.js`, v0.87.21) — privileged scheme с `bypassCSP: true`. Изменил `loadOwnAvatar()` → возвращает `cc-media://avatars/me_<id>.jpg`.

**Что сделано**:
- `main/native/telegramAuth.js` — `file:///` → `cc-media://avatars/<filename>`
- Убраны диагностические логи (проблема найдена)
- Аватарка 68→80px, padding шапки 14→8/10, gap 12→8 (маленькие отступы от краёв)
- `nativeStore.js` — убран `console.log` (это была ошибка — у проекта свой логер)

**🔴 Ловушка зафиксирована** в `mistakes/electron-core.md` (~80 строк):
- Что НЕЛЬЗЯ: `'file:///' + encodeURI(filepath)` из main в renderer
- Что НАДО: `cc-media://avatars|media|video/<filename>`
- Как диагностировать: `chatcenter.log` через grep, **НЕ DevTools**
- Чек-лист для будущих фич с локальными файлами

Тест обновлён: `file:///` → `cc-media://`. Vitest 142/142 ✅, cjs 31/31 ✅.

**UI-проверка**: перезапуск → ПКМ на аватарку → круг 80px с фото пользователя + текст ближе слева.

---
