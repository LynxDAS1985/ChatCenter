# Features Archive — v0.95.32

Точечный фикс производительности WhatsNewModal + деловой стиль changelog. Стабилизировано v0.95.33+.

---

### v0.95.32 — Производительность WhatsNewModal + деловой стиль changelog

Точечный фикс по жалобе юзера: «тормозит скролл в WhatsNewModal, тексты написаны как ребёнок».

**Корень тормозов**:
1. `backdrop-filter: blur(8px)` на overlay — Chromium пересчитывает blur ВСЕХ пикселей под полупрозрачным overlay на каждый кадр скролла. 30-60мс на кадр (≤16мс для 60fps). Chrome bug Issue 749421.
2. `box-shadow: 0 12px 40px` (40px blur) — каждый кадр перерисовывает shadow вокруг модалки.
3. Нет `contain`/`isolation` — repaint скроллируемой области протекает на parent → весь viewport repaint.

**Решение**:
- Убран `backdrop-filter: blur(8px)`. Заменён на `rgba(0,0,0,0.75)`. Эталоны: Telegram Web K, Discord (нет blur в modals).
- `box-shadow` blur 40 → 16px.
- `isolation: isolate` на modal card — новый stacking context.
- Скроллируемый список: `contain: layout style paint` + `overscroll-behavior: contain`. Эталон Linear modals.

**Деловой стиль changelog**: записи v0.95.30 и v0.95.31 переписаны без неформальной лексики.

**Регрессия**: lint 0, vitest 914/914, fileSizeLimits ✅, check-memory ✅.
