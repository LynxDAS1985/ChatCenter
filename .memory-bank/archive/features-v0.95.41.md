# Features Archive — v0.95.41

Custom emoji premium (WebM/WebP вместо ⭐) + reduced-motion интеграционные тесты. Стабилизировано v0.95.42+.

---

### v0.95.41 — Custom emoji premium + reduced-motion интеграционные тесты

3 задачи. Эталоны: tweb/Telegram Desktop/WhatsApp/Discord. Все по TDLib spec.

**(1+2) Custom emoji premium + animatedEmojiInfo** — Premium custom emoji в реакциях/animated теперь WebM/WebP вместо `⭐`:
- Backend [tdlibCustomEmoji.js](main/native/backends/tdlibCustomEmoji.js) (NEW): `resolveCustomEmojiIds(ids[], ctx)` паттерн tdlibForumEmoji (v0.91.6). Batch `getCustomEmojiStickers` + `downloadFile` + `stabilizeForPlayback` → cc-media://. Кэш + persist `custom-emoji-meta.json`.
- [tdlibBackend.js](main/native/backends/tdlibBackend.js) `customEmoji.resolve()`. IPC `tg:resolve-custom-emojis` ([tdlibIpcHandlers.js](main/native/tdlibIpcHandlers.js)).
- Store [nativeStore.js](src/native/store/nativeStore.js) action `resolveCustomEmojis(ids)` + state `customEmojis`. Дедуп.
- [tdlibMapper.js](main/native/backends/tdlibMapper.js): `messageAnimatedEmoji.animated_emoji.sticker.full_type.custom_emoji_id` → поле `animatedEmojiInfo: {customEmojiId}`.
- Renderer [CustomEmojiRenderer.jsx](src/native/components/CustomEmojiRenderer.jsx) (NEW): WebM → `<video autoplay loop muted>`, WebP/PNG → `<img>`, TGS/нет URL → alt unicode.
- [MessageReactions.jsx](src/native/components/MessageReactions.jsx) + [MessageBubble.jsx](src/native/components/MessageBubble.jsx) + [VirtualMessageList.jsx](src/native/components/VirtualMessageList.jsx) интегрированы (useEffect resolve + проброс store.customEmojis).

Покрытие ~50-60% (Telegram Premium перешёл на WebM с 2023). TGS lottie — отдельная задача (+260KB lottie-web).

**(3) prefers-reduced-motion интеграционные тесты** [smoothScroll.vitest.js](src/native/utils/smoothScroll.vitest.js): +4 теста через mockMatchMedia (Object.defineProperty + vi.fn). reduce=true → instant + onComplete, reduce=true+twoPhase+большая дистанция → instant, reduce=false → rAF, exception → no-crash. W3C WCAG 2.2.

**Конфликты ✅**: тот же паттерн что resolveTopicEmojis (v0.91.6), отдельный кэш. **Производительность**: in-memory + persist → 1 invoke/сессию, batch 10-50 ids.

**Регрессия**: lint 0, vitest 946+ (+4), fileSizeLimits 320/320, check-memory ✅.

---
