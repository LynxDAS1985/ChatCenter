# Features Archive — v0.95.34

Темовые переменные в `:root` + вспышка bubble при смене темы + WhatsNewModal hover/«Полная история». Стабилизировано v0.95.40+.

---

### v0.95.34 — Темовые переменные в :root + вспышка bubble + WhatsNewModal UX

**(1) Темовые vars `.native-mode` → `:root`** (styles-base.css): `--amoled-accent/-hover/-shadow/--bubble-opacity` теперь в `:root`. CSS specificity ловушка v0.95.33 устранена архитектурно — `documentElement.style.setProperty` работает напрямую. `applyTheme()` упрощён (themeColor.js): основной таргет documentElement, `.native-mode` элементы — страховка.

**(2) Вспышка outgoing bubble при смене темы** (themeColor.js `flashOutgoingBubbles()`): querySelectorAll `[data-cc-outgoing="true"]`, класс `.cc-theme-flash` 550мс. CSS keyframes 3 фазы (нет → 4px accent → 12px shadow). Атрибут в MessageBubble.jsx outgoing. ThemePickerModal.jsx handleSelect зовёт после applyTheme+saveTheme. Эталон: Telegram wallpaper change.

**(3) WhatsNewModal hover + «Полная история»**: PrimaryButton с useState(hover) (inline `:hover` не работает в React) — затемнение accent + translateY(-1px) + shadow. HistoryToggleButton переключает showAll → весь CHANGELOG. Эталон: VS Code Release Notes.

**Регрессия**: lint 0, vitest 916/916, fileSizeLimits 316/316, check-memory ✅.
