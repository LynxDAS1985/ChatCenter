# Features Archive — v0.95.39

Убран twoPhase smoothScroll + RAF×2 + 350мс easeOutCubic — плавный auto-scroll к новому сообщению. Стабилизировано v0.95.40+.

---

### v0.95.39 — Плавный auto-scroll к новому (убран twoPhase + RAF×2 + 350мс)

Юзер: «когда приходит новое — дёрганием, надо плавно». Корень в [InboxMode.jsx](src/native/modes/InboxMode.jsx) `onAutoScroll` и `send-scroll-done`: `twoPhase: true` делал INSTANT prelude при distance > 1 viewport (большие bubble с reply+медиа) — это правильно для jump-to-end из далека, но **избыточно** для auto-scroll к новому (atBottom=true, distance мал). `requestAnimationFrame` одиночный — React commit мог не успеть → scrollHeight «старый». `duration: 250` мало для distance 200+px.

**Решение**: `requestAnimationFrame × 2` + `smoothScrollTo({ duration: 350 })` **БЕЗ twoPhase** в обеих точках. Эталоны: Telegram Web K `bubbles.ts scrollToEnd` (RAF×2 + cubic-bezier 350мс), Telegram Desktop `_scrollDown` (easeOutQuart 300мс).

**НЕ менялось**: smoothScroll.js (twoPhase остаётся для кнопки ↓ v0.95.18), guard 600мс (v0.95.36), Schmitt (v0.95.2/28), useNewBelowCounter (v0.95.37).

**Регрессия**: lint 0, vitest 930/930, fileSizeLimits 316/316, check-memory ✅.

---
