# API Documentation — ChatCenter

Документация по API всех мессенджеров для миграции с WebView на нативные клиенты.

**Актуальность проверена**: 2026-04-14. Подробности → [VERSIONS.md](./VERSIONS.md)

## Структура

- [telegram/](./telegram/) — Telegram MTProto API + GramJS (v2.26.22)
- [whatsapp/](./whatsapp/) — WhatsApp через Baileys (v7.0.0-rc.9)
- [vk/](./vk/) — VK API + vk-io (v4.10.1, API 5.199)
- [max/](./max/) — ⭐ MAX Bot API (официальный, platform-api.max.ru)
- [VERSIONS.md](./VERSIONS.md) — актуальные версии пакетов и API-layer

## Стоимость: 0 ₽

Все четыре API — **бесплатные** для личного и коммерческого использования.

| Мессенджер | Легальность | Цена | Регистрация |
|---|---|---|---|
| Telegram (MTProto) | ✅ официально поощряется | 0 ₽ | my.telegram.org |
| VK | ✅ официальный API | 0 ₽ | dev.vk.com |
| MAX | ✅ официальный Bot API | 0 ₽ | dev.max.ru + partners.max.ru |
| WhatsApp (Baileys) | ⚠️ серая зона (ToS) | 0 ₽ | QR-скан |

## Приоритет миграции

1. **Telegram** — сейчас чёрный экран на чатах с файлами → критично
2. **WhatsApp** — фантомные уведомления (status-dblcheck, ic-expand-more) → важно
3. **VK** — работает, но парсинг DOM → в планах
4. **MAX** — Bot API для клиентов-бизнесов. Для личных чатов остаётся WebView.

## Общая архитектура

```
Наш UI ← ChatAdapter Interface → { TelegramAdapter, WhatsAppAdapter, VKAdapter, MaxAdapter }
                                           ↓
                                       Серверы мессенджеров
```

Каждый адаптер приводит данные к единому формату `Message`, `Chat`, `User` — наш UI не знает откуда приходит сообщение.

## Индекс документов

### Telegram
- [telegram/README.md](./telegram/README.md) — GramJS, установка, базовый API
- [telegram/auth.md](./telegram/auth.md) — полный flow авторизации (sendCode, 2FA, QR)
- [telegram/methods.md](./telegram/methods.md) — каталог методов по namespace
- [telegram/files.md](./telegram/files.md) — загрузка/скачивание файлов
- [telegram/updates.md](./telegram/updates.md) — events, gap recovery
- [telegram/business.md](./telegram/business.md) — ⭐ Business API, Connected Bots, Quick Replies
- [telegram/reactions.md](./telegram/reactions.md) — ⭐ Reactions API
- [telegram/stars-stories-miniapps.md](./telegram/stars-stories-miniapps.md) — ⭐ Stars, Stories, Mini Apps

### WhatsApp
- [whatsapp/README.md](./whatsapp/README.md) — Baileys, QR, send/receive
- [whatsapp/connecting.md](./whatsapp/connecting.md) — connection.update, DisconnectReason, pairing
- [whatsapp/configuration.md](./whatsapp/configuration.md) — все опции makeWASocket
- [whatsapp/events.md](./whatsapp/events.md) — все события

### VK
- [vk/README.md](./vk/README.md) — vk-io, основы
- [vk/auth.md](./vk/auth.md) — OAuth, токены, Electron
- [vk/messages.md](./vk/messages.md) — messages.* + attachments
- [vk/methods.md](./vk/methods.md) — каталог по namespace
- [vk/updates.md](./vk/updates.md) — Long Poll, hear, scenes

### MAX
- [max/README.md](./max/README.md) — Bot API overview + ограничения
- [max/api-full.md](./max/api-full.md) — все endpoints с параметрами

## Что покрыто (полнота документации)

### Telegram ✅ Полная
- ✅ Авторизация (все методы)
- ✅ Messages API (send/edit/delete/history/search)
- ✅ Files (upload/download/thumbnails/albums)
- ✅ Updates (все типы + gap recovery)
- ✅ Contacts, Users, Channels
- ✅ Business API (NEW)
- ✅ Reactions (NEW)
- ✅ Stars / Stories / Mini Apps (NEW)
- ✅ Schema Layer 214

### WhatsApp ✅ Полная
- ✅ QR + Pairing Code авторизация
- ✅ Все типы сообщений (text/image/video/audio/document/sticker/location/contact/poll)
- ✅ Группы, mentions, reply, edit, delete, reactions
- ✅ Все события (upsert/update/reaction/receipt/presence/chats/groups/call)
- ✅ Disconnect reasons
- ✅ Prod vs dev конфиги
- ✅ Group metadata caching

### VK ✅ Полная
- ✅ OAuth Implicit Flow
- ✅ Все методы messages.*
- ✅ Все типы attachments + uploads
- ✅ User Long Poll / Bots Long Poll / Callback API
- ✅ Session, Scenes, Hear managers
- ✅ Peer ID conventions

### MAX ✅ Полная
- ✅ Все endpoints (Bots/Chats/Messages/Subscriptions/Updates/Uploads)
- ✅ HTTP codes, rate limits
- ✅ Long Polling + Webhooks
- ✅ Inline keyboards, callbacks
- ✅ Markdown/HTML formatting
- ✅ TypeScript client template

## Проверка свежести

Каждый `.md` файл содержит ссылку на источник (`https://...`) — можно в любой момент свериться с официальной доками.

Для пересборки документации:
```bash
# Проверить npm-версии
npm view telegram version
npm view baileys version
npm view vk-io version

# Проверить Telegram Layer
curl https://core.telegram.org/schema | grep -i layer
```
