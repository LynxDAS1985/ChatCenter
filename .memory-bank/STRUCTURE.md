# Структура Memory Bank (авто-список файлов)

> Вынесено из CLAUDE.md (v1.2.19), чтобы CLAUDE.md не рос — он грузится в контекст КАЖДУЮ сессию.
> Регенерируется `npm run regen-claude-structure` (скрипт `scripts/regen-claude-structure.sh`).
> НЕ редактировать вручную между маркерами.

<!-- STRUCTURE-AUTO-START -->
<!-- Регенерируется скриптом scripts/regen-claude-structure.sh. НЕ редактировать вручную между маркерами. -->

### Активные файлы в корне

| Файл | Размер |
|------|--------|
| `CHANGELOG.md` | 90 КБ |
| `README.md` | 10 КБ |
| `STRUCTURE.md` | 6 КБ |
| `ai-bridge.md` | 16 КБ |
| `ai-integration.md` | 13 КБ |
| `api.md` | 32 КБ |
| `architecture.md` | 16 КБ |
| `autoreply.md` | 6 КБ |
| `code-limits-status.md` | 4 КБ |
| `code-todo.md` | 19 КБ |
| `coding-rules.md` | 9 КБ |
| `common-mistakes.md` | 8 КБ |
| `decisions.md` | 38 КБ |
| `electron-breaking-changes.md` | 14 КБ |
| `features.md` | 56 КБ |
| `group-topic-investigation.md` | 96 КБ |
| `handoff-code-limits.md` | 9 КБ |
| `jump-to-end-saga.md` | 23 КБ |
| `messengers.md` | 14 КБ |
| `native-mode-plan.md` | 30 КБ |
| `phase-2-visual-test.md` | 16 КБ |
| `prodlike-webview-investigation.md` | 4 КБ |
| `startup-load-investigation.md` | 98 КБ |
| `tdlib-migration-plan.md` | 27 КБ |
| `ui-components.md` | 24 КБ |
| `virtuoso-migration-plan.md` | 18 КБ |
| `webcontents-view-pilot-results.md` | 5 КБ |
| `webcontentsview-migration-plan.md` | 17 КБ |
| `workflow.md` | 10 КБ |

### Подпапка `mistakes/` — детали ловушек

| Файл | Размер |
|------|--------|
| `mistakes/electron-core.md` | 110 КБ |
| `mistakes/native-scroll-unread.md` | 118 КБ |
| `mistakes/notifications-ribbon.md` | 160 КБ |
| `mistakes/outgoing-two-cases.md` | 7 КБ |
| `mistakes/tdlib-forum.md` | 19 КБ |
| `mistakes/tdlib-video-player.md` | 29 КБ |
| `mistakes/webview-injection.md` | 9 КБ |
| `mistakes/webview-navigation-ui.md` | 31 КБ |
| `mistakes/webview-stack-grouping.md` | 123 КБ |

### Подпапка `archive/` — НЕ читать по умолчанию

| Файл | Размер |
|------|--------|
| `archive/2026-04-common-mistakes-resolved.md` | 11 КБ |
| `archive/2026-04-handoff-telegram-handler-split.md` | 62 КБ |
| `archive/2026-05-connection-health-plan.md` | 53 КБ |
| `archive/README.md` | 24 КБ |
| `archive/audit-2026-05-26-scroll-architecture-CLOSED.md` | 19 КБ |
| `archive/changelog-v0.87.56-68.md` | 18 КБ |
| `archive/features-pre-v0.87.md` | 251 КБ |
| `archive/features-v0.87-early.md` | 126 КБ |
| `archive/features-v0.87.106-114.md` | 22 КБ |
| `archive/features-v0.87.115-136.md` | 27 КБ |
| `archive/features-v0.87.40-50.md` | 40 КБ |
| `archive/features-v0.87.51-64.md` | 54 КБ |
| `archive/features-v0.87.65-79.md` | 54 КБ |
| `archive/features-v0.87.80-92.md` | 8 КБ |
| `archive/features-v0.87.93-105.md` | 39 КБ |
| `archive/features-v0.89.1-5.md` | 33 КБ |
| `archive/features-v0.89.15-22.md` | 49 КБ |
| `archive/features-v0.89.6-14.md` | 46 КБ |
| `archive/features-v0.91.1-10.md` | 14 КБ |
| `archive/features-v0.91.11-24.md` | 47 КБ |
| `archive/features-v0.92.0-6.md` | 37 КБ |
| `archive/features-v0.93.0.md` | 7 КБ |
| `archive/features-v0.94.0.md` | 5 КБ |
| `archive/features-v0.94.1-7.md` | 24 КБ |
| `archive/features-v0.95.0-3.md` | 13 КБ |
| `archive/features-v0.95.10-11.md` | 5 КБ |
| `archive/features-v0.95.12-14.md` | 17 КБ |
| `archive/features-v0.95.15-18.md` | 11 КБ |
| `archive/features-v0.95.19-22.md` | 7 КБ |
| `archive/features-v0.95.23-26.md` | 15 КБ |
| `archive/features-v0.95.26.md` | 5 КБ |
| `archive/features-v0.95.27-32.md` | 4 КБ |
| `archive/features-v0.95.27.md` | 3 КБ |
| `archive/features-v0.95.28.md` | 6 КБ |
| `archive/features-v0.95.29.md` | 4 КБ |
| `archive/features-v0.95.30.md` | 4 КБ |
| `archive/features-v0.95.31.md` | 5 КБ |
| `archive/features-v0.95.32.md` | 2 КБ |
| `archive/features-v0.95.33.md` | 3 КБ |
| `archive/features-v0.95.34.md` | 2 КБ |
| `archive/features-v0.95.35-37.md` | 4 КБ |
| `archive/features-v0.95.38.md` | 1 КБ |
| `archive/features-v0.95.39.md` | 1 КБ |
| `archive/features-v0.95.4.md` | 1 КБ |
| `archive/features-v0.95.40.md` | 3 КБ |
| `archive/features-v0.95.41.md` | 3 КБ |
| `archive/features-v0.95.42.md` | 2 КБ |
| `archive/features-v0.95.43.md` | 5 КБ |
| `archive/features-v0.95.44.md` | 1 КБ |
| `archive/features-v0.95.45.md` | 1 КБ |
| `archive/features-v0.95.46.md` | 2 КБ |
| `archive/features-v0.95.47.md` | 4 КБ |
| `archive/features-v0.95.48.md` | 3 КБ |
| `archive/features-v0.95.5-7.md` | 16 КБ |
| `archive/features-v0.95.50.md` | 1 КБ |
| `archive/features-v0.95.8-9.md` | 10 КБ |
| `archive/features-v0.97.0.md` | 4 КБ |
| `archive/features-v1.0.x.md` | 5 КБ |
| `archive/features-v1.1.0-1.1.3.md` | 5 КБ |
| `archive/features-v1.1.12-1.1.13.md` | 8 КБ |
| `archive/features-v1.1.14-1.1.15.md` | 3 КБ |
| `archive/features-v1.1.16-1.1.18.md` | 19 КБ |
| `archive/features-v1.1.4-1.1.6.md` | 4 КБ |
| `archive/features-v1.2.1-1.2.2.md` | 11 КБ |
| `archive/features-v1.2.3-1.2.4.md` | 10 КБ |
| `archive/native-scroll-diagnostics-handoff-CLOSED.md` | 18 КБ |
| `archive/native-scroll-restore-saga-CLOSED.md` | 31 КБ |

_Регенерировано: 2026-06-24_
<!-- STRUCTURE-AUTO-END -->
