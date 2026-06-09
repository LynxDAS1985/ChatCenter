# Phase 5 — Native extension: подключение других мессенджеров через native API

> **Цель**: Расширить Native режим с одного мессенджера (Telegram через TDLib) на несколько,
> через их official native API. Каждый новый native мессенджер автоматически получит AI-агента.

## Зачем

Сейчас (v0.97.0):
- Native = только `messengerId='native_cc'` (Telegram через TDLib)
- AI-агент работает только для Telegram
- Webview-мессенджеры — без AI агента

После Phase 5+:
- Native = много мессенджеров через их native API
- AI-агент работает для ВСЕХ native мессенджеров автоматически (архитектура уже extensible)
- Webview мессенджеры остаются как fallback для тех у кого нет native API

## Архитектурная готовность

**Хорошие новости** — Phase 0+1 уже **готовы к расширению**:

- `NotificationSource.messengerId: string` — extensible, не enum
- Tool handlers получают backend через `handlerContext` — TDLib store сейчас, любой store потом
- IPC каналы `ai:agent:run/cancel/step` — provider-agnostic
- Action Bus в App.jsx — слушает все notify:clicked, не привязан к конкретному мессенджеру
- 4 AI провайдера (Anthropic/OpenAI/DeepSeek/ГигаЧат) — работают независимо от мессенджера

**Что нужно сделать для каждого нового native мессенджера**:
1. Подключить его native API (отдельный backend в `main/native/`)
2. Создать store для его сообщений (по аналогии с `src/native/store/nativeStore.js`)
3. Создать NotificationSource при входящем сообщении (как `nativeStoreIpc.js`)
4. Реализовать tool handlers для его API (sendMessage / getHistory / etc)
5. Добавить новую вкладку в UI (по аналогии с `NATIVE_CC_TAB`)

Стандартное «вертикальное» расширение, никаких изменений в AI-агент коде.

## План мессенджеров по приоритету

### Sub-phase 5.1 — WhatsApp Business API (приоритет 1)

**Зачем**: WhatsApp — самый популярный мессенджер у целевой аудитории (операторы клиентов).

**Что подключаем**: [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/)
(официальный, Meta) или [whatsapp-web.js](https://wwebjs.dev/) (unofficial, но широко используется).

**Сравнение**:

| Критерий | WhatsApp Business API (Cloud) | whatsapp-web.js (unofficial) |
|---|---|---|
| Официальный | ✅ Да (Meta) | ❌ Нет |
| Стоимость | Платно (per conversation) | Бесплатно |
| Установка | Verified Business Account нужен | Просто QR-код как WhatsApp Web |
| ToS risk | ❌ Нет — официальный | ⚠️ Есть (unofficial) |
| API качество | Высокое, документация | Среднее, reverse-engineered |
| Подходит для | Crews / Enterprise | Solo / Small Business |

**Рекомендация**: начать с whatsapp-web.js для прототипа (бесплатно, быстро), потом
если будет нужна стабильность — переход на Cloud API.

**Файлы для создания**:
```
main/native/whatsapp/                ← новая папка
├── whatsappBackend.js               ← основа (по аналогии с tdlibBackend)
├── whatsappClient.js                ← обёртка над whatsapp-web.js
├── whatsappMessages.js              ← messages CRUD
├── whatsappSend.js                  ← sendMessage / forward
└── whatsappAvatars.js               ← avatars
src/native/whatsapp/                 ← новая папка
├── store/whatsappStore.js
├── store/whatsappStoreIpc.js
└── modes/WhatsappInboxMode.jsx
```

**messengerId**: `'native_wa_business'`

**Срок**: ~1-2 месяца на полную реализацию (включая UI).

### Sub-phase 5.2 — VK API (приоритет 2)

**Зачем**: ВК — популярен в России. Уже есть webview-вкладка (с DOM injection).
Перевод на native API уберёт хрупкость DOM селекторов.

**Что подключаем**: [VK API](https://dev.vk.com/) (официальный).

**Особенности**:
- OAuth2 авторизация
- LongPoll для real-time сообщений
- Лимиты rate-limit per second

**messengerId**: `'native_vk_api'`

**Срок**: ~2-3 недели.

### Sub-phase 5.3 — Viber API (приоритет 3)

**Что подключаем**: [Viber REST API](https://developers.viber.com/docs/api/rest-bot-api/).

**Особенности**: только bot accounts, не personal. Подходит для бизнес-чатов.

**messengerId**: `'native_viber'`

**Срок**: ~1-2 недели.

### Sub-phase 5.4 — MAX (если появится API)

**Текущая ситуация**: у мессенджера МАХ **нет публичного API**. Поэтому пока только webview.

**План**: следить за развитием. Если появится API → подключить как `native_max`.

### Sub-phase 5.5 — Discord / Slack (если будет нужно)

Возможно по запросу пользователей. У обоих есть отличные native API.

## Что НЕ делаем в Phase 5

- ❌ Не удаляем webview мессенджеры — они остаются как fallback и для тех у кого нет native API
- ❌ Не делаем native для МАХ (нет API)
- ❌ Не строим единый messenger-агностический слой — каждый мессенджер уникален

## Workflow для каждого sub-phase

1. **Исследование API**: документация, лимиты, особенности
2. **Backend**: `main/native/<messenger>/<messenger>Backend.js` + IPC
3. **Store**: `src/native/<messenger>/store/<messenger>Store.js`
4. **NotificationSource integration**: при входящем сообщении → создать source с правильным messengerId
5. **UI**: новая вкладка по аналогии с native_cc
6. **AI tools работают автоматически** — никаких изменений в `src/shared/tools/`
7. **Тесты**: vitest для backend + integration с tool handlers

## Готовность к Phase 5

После Phase 0+1 (v0.97.0):
- ✅ NotificationSource — universal паспорт
- ✅ Tool Use — universal API (any messengerId)
- ✅ Action Bus — listens to all messages

После Phase 2-4:
- ✅ Permission system — universal
- ✅ Audit log — universal
- ✅ Tasks / Reminders — universal (привязка через NotificationSource)
- ✅ AI Agent UI — кнопка «🤖» для любого native уведомления

**Готовность к Phase 5**: 100% архитектурно. Нужна только реализация backend для каждого
нового мессенджера.

## Когда делать Phase 5

После завершения Phase 2-4 (полноценный AI агент для TDLib).
Phase 5 — это **отдельный долгосрочный трек** (~3-6 месяцев на 2-3 мессенджера).

Решение «делать ли Phase 5» — на основе **спроса**: если юзеры просят WhatsApp/VK
через native API (стабильность важнее webview) — приоритет 5.1+ повышается.

## Ссылки

- [overview.md](../overview.md) — общий план
- [architecture.md](../architecture.md) — три уровня
- [phase-4-extensions.md](./phase-4-extensions.md) — Tasks/Reminders (предыдущая фаза)
