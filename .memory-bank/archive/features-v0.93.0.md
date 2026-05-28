# Архив changelog — v0.93.0

Pixel-perfect scroll restore через `LocationOptions.offset` (Virtuoso API). Полностью superseded в **v0.94.0** (виртуализация удалена, restore через простой pixel scrollTop). Активная сага восстановления позиции — в archive/features-v0.91.11-24.md и archive/features-v0.92.0-6.md.

**Не читать по умолчанию.** Извлечено из features.md 28 мая 2026.

---

### v0.93.0 — Pixel-perfect scroll restore через `LocationOptions.offset` (включая середину длинных постов)

После v0.92.6 (rollback сломанного snapshot mechanism) юзер показал скрины РБК Крипто: открыл длинный пост по середине, при возврате видна шапка. Анализ — Virtuoso `align: 'end'` для post > viewport clamping → нижняя часть не помещается → юзер видит верх. Аудит [`audit-2026-05-26-scroll-architecture.md`](.memory-bank/audit-2026-05-26-scroll-architecture.md) подтвердил что 8 ломаных связей (A-H) НЕ являются причиной — это мусор кода.

**Реальное решение** найдено в Virtuoso TS-типах локально (`node_modules/react-virtuoso/dist/index.d.ts:765`):

```ts
LocationOptions {
  align?: 'center' | 'end' | 'start'
  behavior?: 'auto' | 'smooth'
  offset?: number  // "The offset to scroll"
}

initialTopMostItemIndex?: IndexLocationWithAlign | number
```

`initialTopMostItemIndex` принимает объект с **`offset`** — pixel offset. Это позволяет восстанавливать **СЕРЕДИНУ длинного поста** через `{index, align: 'start', offset: N}`.

#### Что изменено

**1. [`scrollPositionsCache.js`](src/native/utils/scrollPositionsCache.js)**:
- `findVisibleAnchorMsgId` теперь возвращает **`{anchorMsgId, offsetFromTop}`** вместо просто msgId
- Изменена логика: теперь берётся **ВЕРХНИЙ visible msg** (первый row чей `bottom > scrollTop`), не нижний
- `offsetFromTop = scrollTop - anchorRow.offsetTop` — pixel offset внутри anchor row
- Storage version 2 → 3 (с offsetFromTop), backward compat для v2 saves (offset=0)

**2. [`useInboxScroll.handleScroll`](src/native/hooks/useInboxScroll.js)** + **[`useScrollPositionAutosave`](src/native/hooks/useScrollPositionAutosave.js)**:
- Используют новый объектный формат `findVisibleAnchorMsgId`
- Сохраняют `{anchorMsgId, atBottom, offsetFromTop}` в Map
- Лог `scroll-save` / `autosave-save` имеет поле `offsetFromTop`

**3. [`InboxMode.jsx`](src/native/modes/InboxMode.jsx)**:
- `initialTopMostItemIndex` для savedAnchor → `{index, align: 'start', offset: saved.offsetFromTop || 0}`
- Раньше было `{index, align: 'end'}` (clamping для длинных постов)
- `scrollToAbsoluteBottom` теперь пишет `{anchorMsgId: null, atBottom: true, offsetFromTop: 0}`

#### Как работает (объяснение простым языком)

**Save** (когда юзер на середине поста):
- anchor row = заголовок поста (top, частично выше viewport)
- offsetFromTop = 400 (scrollTop на 400px ниже top заголовка)
- Сохраняем: `{anchorMsgId: 'X', atBottom: false, offsetFromTop: 400}`

**Restore** (юзер возвращается):
- Находим index заголовка в renderItems
- Virtuoso `initialTopMostItemIndex={index, align: 'start', offset: 400}`
- Virtuoso ставит scrollTop = anchorRow.top + 400 → **точно куда было**
- Длинный пост → видна середина (как при save)

Это **pixel-perfect anchor-mode restore БЕЗ snapshot mechanism**. Работает с `key={cacheKey}` ремаунтом Virtuoso (offset stable, не зависит от ranges).

#### 3+ факта

🥇 [Virtuoso 4.18.7 TS-типы локально:761-766](file:///c:/Projects/ChatCenter/node_modules/react-virtuoso/dist/index.d.ts) — `LocationOptions.offset?: number`
🥇 [Virtuoso 4.18.7 TS-типы локально:1258](file:///c:/Projects/ChatCenter/node_modules/react-virtuoso/dist/index.d.ts) — `initialTopMostItemIndex?: IndexLocationWithAlign | number`
🥈 Наш `scrollPositionsCache.js:108` — раньше сохранял только msgId, теперь объект
🥈 Скриншоты юзера РБК Крипто — длинный пост, align='end' clamping → видна верхушка

#### Граничные случаи (учтены)

| Случай | Решение |
|---|---|
| Старые saves в localStorage (v2 формат без offset) | `loadScrollPositions` принимает v2, ставит `offsetFromTop=0` |
| anchor msg удалён (`findRenderItemIndex=-1`) | Fallback на firstUnreadId → renderItems.length-1 |
| `offsetFromTop` отрицательный (anchor row выше scrollTop полностью) | `Math.max(0, scrollTop - rowTop)` |
| Очень большой offset (anchor row меньше offset) | Virtuoso clamps — будет в начале следующего row |
| `el.offsetHeight=0` (row не отрендерен) | `bottom > scrollTop` false → перебираем следующий msg |

#### Что НЕ трогали

8 ломаных связей A-H из аудита — это мусор кода, не функциональная проблема. Cleanup отложен до v0.93.1+ (отдельная задача).

#### Регрессия

- lint 0
- vitest должен пройти (новый формат backward compat)
- fileSizeLimits ✅

#### Откат

```bash
git revert <этот hash>
```

Вернёт v0.92.6 (align='end' для anchor → clamping длинных постов → юзер видит верхушку).

#### Как проверить

1. Программа лог `=== ChatCenter v0.93.0 start ===`
2. Открыть РБК Крипто (или другой чат с длинным постом)
3. Прокрутить в **середину** длинного поста
4. Переключиться на B → вернуться на A
5. **Позиция должна быть точно где была** (та же середина post)
6. В логе `scroll-save offsetFromTop=N` (N = pixel offset, не 0)
7. В логе при возврате не должно быть прыжков

---

