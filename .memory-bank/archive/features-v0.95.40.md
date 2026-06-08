# Features Archive — v0.95.40

Большие emoji (messageAnimatedEmoji) + a11y reduced-motion + sticky bottom on media + scroll metric. Стабилизировано v0.95.41+.

---

### v0.95.40 — Большие emoji + a11y reduced-motion + sticky bottom on media + scroll metric

**(1) messageAnimatedEmoji + isLargeEmoji** ([tdlibMapper.js](main/native/backends/tdlibMapper.js)): Юзер видел ПУСТОЕ сообщение вместо ☺️. Корень — `messageAnimatedEmoji` content type не маппился (нет .text, только .emoji). Fallback `formattedText = {text: content.emoji}`. Новый флаг `isLargeEmoji` — true если messageAnimatedEmoji ИЛИ regex (Unicode TR51, 1-3 emoji подряд). [MessageBubble.jsx](src/native/components/MessageBubble.jsx) рендерит font-size 56px + прозрачный фон + без shadow. messagePreview тоже маппит. Эталоны: tweb bubbles.ts `isAllEmojiBlocks`, WhatsApp jumbo, iMessage tapback.

**(2) auto-scroll-completed метрика** ([InboxMode.jsx](src/native/modes/InboxMode.jsx)): onComplete в smoothScrollTo → лог `{messageId, distance, actualMs, finalBottomGap}`. Диагностика будущих жалоб.

**(3) prefers-reduced-motion global** ([styles-base.css](src/native/styles-base.css)): глобальный `@media (prefers-reduced-motion: reduce)` отключает все CSS анимации/transitions (cc-theme-flash, cc-changelog-fadein, theme dropdown). Раньше respect был только в smoothScroll.js. W3C WCAG 2.2 standard pattern.

**(4) useStickyBottomOnMedia** ([useStickyBottomOnMedia.js](src/native/hooks/useStickyBottomOnMedia.js)): ResizeObserver на scrollContainer + `physicallyAtBottomRef`. Если delta > 4px и юзер был у низа → instant `scrollTop = scrollHeight` (без анимации, throttle rAF). Решает sticky bottom при lazy-load картинок. Эталоны: tweb ResizeObserver+scrollToEnd, Discord MutationObserver+onload, Slack onload+scrollIntoView.

**Конфликты ✅**: smoothScroll twoPhase (v0.95.18 кнопка ↓), lastAutoScrollAtRef guard (v0.95.36), Schmitt-trigger, seenOutgoingIdsRef (v0.95.37) — не задевается. Производительность: regex 1×/сообщение, ResizeObserver fires только при layout change + rAF throttle.

**Тесты** (+12): tdlibMapper +6 (animatedEmoji/1emoji/3emoji/text/emoji+text/4emoji), useStickyBottomOnMedia +6 (atBottom true/false, delta<4, unmount, null ref, throttle).

**Регрессия**: lint 0, vitest 942/942, fileSizeLimits 316/316, check-memory ✅.

---
