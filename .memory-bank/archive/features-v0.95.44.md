# v0.95.44 — Прогресс % загрузки файлов через TDLib updateFile

Расширяет v0.95.43 (скрепка) — % загрузки больших файлов.

- TDLib spec `updateFile`: эмитится при изменении файла. `remote.uploaded_size / size + is_uploading_active/_completed`.
- tdlibClient.js `'updateFile'` case расширен: если `remote && size > 0 && (isActive || isCompleted)` → emit `'upload:progress'`.
- tdlibIpcBridge.js: channel `'tg:upload-progress'`. **Throttle Math.floor(percent)** — emit только при изменении целого %.
- nativeStoreIpc.js: handler обновляет `state.uploads[fileId]`. Auto-cleanup 60с (orphan защита).
- useUploadProgress.js: агрегатный прогресс всех uploads.
- FilePreviewBar.jsx: прогресс-bar 4px + текст «Загрузка... 5.2 МБ / 10.3 МБ».

Эталоны: tweb appDownloadManager (throttle 1%), Discord upload bar.

Тесты (+11): useUploadProgress +6, tdlibEmitContracts +3, formatBytes +5.

Регрессия: lint 0, vitest 1016/1016, fileSizeLimits 334/334, check-memory ✅.
