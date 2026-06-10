# v0.95.4 — Фикс «дёрг при повторном открытии seen-чата» (useLayoutEffect) + Windows CI timeout

**Корень**: в `useInitialScroll.js` ветка 2 (already-seen) использовала `useEffect` — он выполняется ПОСЛЕ paint. При смене seen-чата React сначала рисует новый кадр (где scrollContainer показывает позицию ПРЕДЫДУЩЕГО чата — это общий persistent DOM-контейнер), потом выполняется effect и ставит `scrollTop=saved` → юзер на 1 кадр видит чужую позицию = «дёрг».

**Решение**: `useEffect` → `useLayoutEffect` в `useInitialScroll.js`. Restore выполняется до paint → юзер видит сразу правильную позицию.

**Критически важно** (useLayoutEffect блокирует paint): внутри ТОЛЬКО micro-операция `scrollTop=N`, никаких fetch/тяжёлой работы. Поведение ветки 1 (initial scroll первого открытия) НЕ менялось.

**Windows CI timeout fix**: `AccountContextMenu.vitest.jsx` cold-start 5671мс на Windows runner-е. Решение: `testTimeout: 15000` в `vitest.config.mjs`.
