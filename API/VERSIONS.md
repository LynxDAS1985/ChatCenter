# Актуальные версии API — проверено 2026-04-14

## NPM пакеты

| Пакет | Версия | Последнее обновление | Статус |
|---|---|---|---|
| `telegram` (GramJS) | **2.26.22** | 2025-02-12 | Stable ✅ |
| `baileys` | **7.0.0-rc.9** | 2025-11-21 | RC (breaking changes из v6) ⚠️ |
| `vk-io` | **4.10.1** | 2025-10-31 | Stable ✅ |

**Проверка**:
```bash
npm view telegram version
npm view baileys version
npm view vk-io version
```

## Telegram MTProto Schema

- **Layer 214** (актуальный на апрель 2026)
- Новейшие фичи по Layer:
  - Layer 160+: Stories
  - Layer 176+: Business features
  - Layer 181+: Stars currency
  - Layer 202: Conference calls
  - Layer 205: TODO lists
  - Layer 214: Chat Themes with collectible gifts

Полная схема: https://core.telegram.org/schema

## Telegram Bot API

- **Bot API 8.0+**: Full-screen Mini Apps, home screen shortcuts, emoji status, biometric auth, cloud storage
- **Bot API 7.x** и ранее — legacy фичи

## WhatsApp / Baileys

- **v7.0.0** — breaking changes из v6:
  - Новый pairing flow
  - `useMultiFileAuthState` только для dev
  - Переработан event system
  - Новые типы сообщений
- Migration guide: https://whiskey.so/migrate-latest

## VK API

- **API version 5.199** (актуальный `v=5.199` в параметрах)
- Устаревшие: audio.* методы (после 2016 требуют спец-разрешение)

## MAX Bot API

- HTTP REST, без версионирования
- Rate limit: **30 req/sec**
- Базовый URL: `https://platform-api.max.ru`

---

## Новое что добавлено в обновлённую доку

### Telegram

✅ **Business API** — `telegram/business.md`
- Opening hours, quick replies
- Greeting/Away messages
- Connected bots
- Business chat links

✅ **Stars / платежи** — `telegram/stars.md`
- Paid media, subscriptions, gifts
- Revenue в Toncoin через Fragment

✅ **Reactions** — `telegram/reactions.md`
- `messages.sendReaction`
- Custom emoji + paid star reactions
- Notifications settings

✅ **Stories** — `telegram/stories.md`
- `stories.sendStory` / `editStory` / `getAllStories`
- Media areas (location, polls)
- Stealth mode

✅ **Mini Apps** — `telegram/mini-apps.md`
- WebApp launcher, Bot API 8.0+
- Full-screen, biometric, cloud storage

### Baileys

✅ Обновлён raw пример из README (ubuntu browser, image URL)
✅ v7 breaking changes зафиксированы

### VK

⚠️ API version 5.199 — указан в README.md

### MAX

✅ Полный endpoint reference уже есть в api-full.md
