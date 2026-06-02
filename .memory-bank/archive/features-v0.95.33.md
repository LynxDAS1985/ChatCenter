# Features Archive — v0.95.33

Фикс «выбор цвета не применяется» + регресс-тест на backdrop-filter в модалках + деловой стиль changelog. Стабилизировано v0.95.34+ (переносом переменных в :root).

---

### v0.95.33 — Фикс «выбор цвета не применяется» + регресс-тест на blur в модалках + деловой changelog

Фикс по жалобе юзера v0.95.32 + перепроверка остальных модалок + регресс-тест + перевод changelog v0.95.20-29 в деловой стиль.

**(1) Корень бага «выбор цвета не применяется»** (`themeColor.js`):
`styles-base.css` объявлял переменные в селекторе `.native-mode { --amoled-accent: ... }`. CSS specificity: `.native-mode` (class) **перебивает** `:root`/`html` (inherited). Поэтому `document.documentElement.style.setProperty('--amoled-accent', ...)` НЕ применялся к bubble — на `<html>` ставилось, но `.native-mode` своим scope **переопределял** обратно к `#2AABEE`. Доказательство: юзер выбрал «Индиго» (галочка стояла), но bubble остались Telegram-blue.

**Решение** (v0.95.33): `applyTheme(theme)` ищет все элементы с классом `.native-mode` через `querySelectorAll('.native-mode')`. Финальное решение — v0.95.34 перенёс переменные в `:root` (архитектурно).

**(2) Перепроверка модалок на backdrop-filter**:
- WhatsNewModal.jsx — уже убран в v0.95.32
- ThemePickerModal.jsx — был `backdropFilter: 'blur(6px)'`. Заменён на `rgba(0,0,0,0.75)`.
- Остальные blur — popup/tooltip/overlay без скроллируемой области, тормоза не возникают.

**(3) Регресс-тест отсутствия backdrop-filter в модалках** (`modernPatternsGuard.test.cjs` E.):
Список `MODAL_FILES_NO_BLUR` (`WhatsNewModal.jsx`, `ThemePickerModal.jsx`) — тест падает если blur вернётся. Снимает комментарии перед поиском.

**(4) Деловой стиль changelog v0.95.20-29**:
Переписаны 8 записей в едином деловом тоне. Убраны эмодзи и разговорные обороты.

**Тесты** (+3 unit + 2 регрессионных): themeColor +2 (.native-mode элемент / два элемента), modernPatternsGuard +2 (нет backdrop-filter в 2 файлах), changelogData обновлён.

**Регрессия**: lint 0, vitest +3, fileSizeLimits ✅, check-memory ✅.
