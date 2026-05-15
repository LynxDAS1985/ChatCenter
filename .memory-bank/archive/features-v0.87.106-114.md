# Архив: features.md записи v0.87.106 — v0.87.114

Заархивировано 15 мая 2026 при релизе v0.89.5 (`features.md` перевалил 100 КБ лимит после трёх audit-релизов v0.89.2/3/4 + четвёртого v0.89.5).

См. историю архивации в [`../CHANGELOG.md`](../CHANGELOG.md) и [`./README.md`](./README.md).

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
