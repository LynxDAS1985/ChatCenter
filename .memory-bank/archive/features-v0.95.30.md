# Features Archive — v0.95.30

Renderer-only UX-релиз: плавная auto-scroll, цветовая тема (5 вариантов), dropdown режимов, opacity 0.95. Стабилизировано v0.95.33-37 (CSS specificity фикс + дополнительная UX-обратная связь).

---

### v0.95.30 — Плавная auto-scroll + цветовая тема bubble + dropdown режимов + opacity 0.95

UX-релиз (renderer-only, низкий риск) — 4 фичи по запросу юзера. Никаких структурных изменений main/backend.

**1. Плавная auto-scroll к новым сообщениям** — заменён браузерный `el.scrollTo({behavior:'smooth'})` на `smoothScrollTo()` (easeOutCubic 250мс + twoPhase) в 2-х местах `InboxMode.jsx`:
- `onAutoScroll` (incoming новое + юзер у низа) — анимация 250мс стабильнее. Раньше `behavior:'smooth'` дёргал на больших дистанциях (>5×viewport), `smoothScrollTo` делает мгновенный prelude к (target − 1 viewport) + плавный последний экран. Эталон: Telegram Web K `bubbles.ts scrollToEnd` (cubic-bezier 250мс).
- `send-scroll-done` (после отправки своего сообщения) — единый стиль с onAutoScroll.

**2. Цветовая тема bubble (5 вариантов)** — новый модуль `themeColor.js` + модалка `ThemePickerModal.jsx`:
- 5 тем: Telegram (#2AABEE), Индиго #3B5BA9 (Discord/Signal), Тёмно-бирюзовый #1A6B8C (Slack DM), Premium #229ED9 (Telegram Premium), Фиолетовый #5B5FE2 (Discord Nitro).
- Применяется через CSS-переменные `--amoled-accent`, `--amoled-accent-hover`, `--amoled-accent-shadow` на `document.documentElement.style`.
- Persistence: `localStorage['cc-native-theme']`. На старте `NativeApp.jsx` вызывает `applyTheme(loadTheme())`.
- Кнопка 🎨 в правом верхнем header (на месте старого mode-switcher).
- **РЕГРЕССИЯ v0.95.33**: в этой версии applyTheme не работал — CSS specificity `.native-mode` перебивал inline на html. Фикс в v0.95.33+v0.95.34 (перенос в `:root`).

**3. Dropdown «Чаты/Клиенты/Доска»** — `ChatTypesDropdown.jsx`:
- Переехал из шапки правой панели в верх списка чатов слева (как Telegram Desktop folder switch / Slack workspace).
- Иконки emoji 💬👥📋 + label, текущий режим в закрытом состоянии, меню при клике, Escape / click мимо.
- В compact mode (sidebar < 128px) dropdown скрыт.

**4. Opacity 0.95 на bubble** — CSS-переменная `--bubble-opacity: 0.95` в `styles-base.css` через `opacity: var(--bubble-opacity, 1)` в bubble div `MessageBubble.jsx`. Эталон Telegram Desktop.

**Эталоны** (production 2026):
- Telegram Web K `bubbles.ts` — `scrollToEnd` RAF + cubic-bezier ~250мс.
- Telegram Desktop `history_widget.cpp` — `_scrollDown` Qt animator easeOutQuart 200мс.
- Telegram Settings → Color theme — модалка с превью + сохранение.
- Slack workspace switcher — dropdown слева вверху.

**Тесты** (+9 unit):
- `themeColor.vitest.js` — 10 тестов (THEMES структура, getThemeById валидация, save/load, applyTheme CSS, защита от мусора).
- `changelogData.vitest.js` — обновлён prevVersion=null → '0.95.30'.

**Регрессия**: lint 0, vitest +9, fileSizeLimits ✅, check-memory ✅.
