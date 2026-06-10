# v0.95.45 — Фикс «Перейти к чату» в уведомлениях для native режима

Юзер: «кнопка "Перейти к чату" в native НЕ работает, в webview работает».

Корень: useNotifyNavigation.js:38-39 `webviewRefs.current['native_cc']=undefined → silent return`. Native не имел отдельного слушателя `notify:clicked`. nativeStoreIpc шлёт уведомления с `messengerId='native_cc'`, `chatTag=chatId`.

Решение (2 файла):
- useNotifyNavigation.js: early return `if (messengerId === 'native_cc') return`.
- NativeApp.jsx: новый useEffect для `notify:clicked` native_cc → парсит chatTag (`accountId:rawId`) → `store.setActiveAccount + setActiveChat`.

Регрессия: lint 0, vitest 1016/1016, fileSizeLimits 334/334, check-memory ✅.
