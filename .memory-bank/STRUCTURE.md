# Структура Memory Bank (авто-список файлов)

> Вынесено из CLAUDE.md (v1.2.19), чтобы CLAUDE.md не рос — он грузится в контекст КАЖДУЮ сессию.
> Регенерируется `npm run regen-claude-structure` (скрипт `scripts/regen-claude-structure.sh`).
> НЕ редактировать вручную между маркерами.

<!-- STRUCTURE-AUTO-START -->
<!-- Регенерируется скриптом scripts/regen-claude-structure.sh. НЕ редактировать вручную между маркерами. -->

### Активные файлы в корне

| Файл | Размер |
|------|--------|
| `CHANGELOG.md` | 93 КБ |
| `README.md` | 11 КБ |
| `STRUCTURE.md` | 9 КБ |
| `ai-bridge.md` | 16 КБ |
| `ai-integration.md` | 13 КБ |
| `api.md` | 37 КБ |
| `architecture.md` | 16 КБ |
| `autoreply.md` | 6 КБ |
| `code-limits-status.md` | 17 КБ |
| `code-todo.md` | 84 КБ |
| `coding-rules.md` | 9 КБ |
| `common-mistakes.md` | 10 КБ |
| `decisions.md` | 78 КБ |
| `electron-breaking-changes.md` | 14 КБ |
| `features.md` | 80 КБ |
| `group-topic-investigation.md` | 96 КБ |
| `handoff-code-limits.md` | 9 КБ |
| `jump-to-end-saga.md` | 23 КБ |
| `messengers.md` | 16 КБ |
| `native-mode-plan.md` | 30 КБ |
| `phase-2-visual-test.md` | 16 КБ |
| `prodlike-webview-investigation.md` | 4 КБ |
| `reconnect-plan.md` | 23 КБ |
| `side-rail-migration-plan.md` | 34 КБ |
| `startup-load-investigation.md` | 98 КБ |
| `tdlib-migration-plan.md` | 27 КБ |
| `ui-components.md` | 33 КБ |
| `virtuoso-migration-plan.md` | 18 КБ |
| `webcontents-view-pilot-results.md` | 5 КБ |
| `webcontentsview-migration-plan.md` | 26 КБ |
| `workflow.md` | 12 КБ |

### Подпапка `mistakes/` — детали ловушек

| Файл | Размер |
|------|--------|
| `mistakes/app-layout.md` | 12 КБ |
| `mistakes/electron-core-history.md` | 148 КБ |
| `mistakes/electron-core.md` | 55 КБ |
| `mistakes/native-scroll-unread.md` | 131 КБ |
| `mistakes/notifications-ribbon-history.md` | 139 КБ |
| `mistakes/notifications-ribbon.md` | 104 КБ |
| `mistakes/outgoing-two-cases.md` | 14 КБ |
| `mistakes/tdlib-forum.md` | 19 КБ |
| `mistakes/tdlib-video-player.md` | 31 КБ |
| `mistakes/webview-injection.md` | 82 КБ |
| `mistakes/webview-navigation-ui.md` | 113 КБ |
| `mistakes/webview-stack-grouping.md` | 125 КБ |

### Подпапка `archive/` — НЕ читать по умолчанию

| Файл | Размер |
|------|--------|
| `archive/2026-04-common-mistakes-resolved.md` | 11 КБ |
| `archive/2026-04-handoff-telegram-handler-split.md` | 62 КБ |
| `archive/2026-05-connection-health-plan.md` | 53 КБ |
| `archive/2026-06-notifications-ribbon-max-title-control.md` | 6 КБ |
| `archive/2026-07-notifications-ribbon-max-title-fallback-v1.2.24-27.md` | 16 КБ |
| `archive/README.md` | 65 КБ |
| `archive/audit-2026-05-26-scroll-architecture-CLOSED.md` | 19 КБ |
| `archive/changelog-v0.87.56-68.md` | 18 КБ |
| `archive/decisions-adr-001-014.md` | 17 КБ |
| `archive/decisions-adr-015-022.md` | 39 КБ |
| `archive/decisions-adr-023-027.md` | 23 КБ |
| `archive/decisions-adr-028-033.md` | 32 КБ |
| `archive/decisions-adr-034-036.md` | 16 КБ |
| `archive/decisions-adr-037-039.md` | 17 КБ |
| `archive/decisions-adr-040-041.md` | 11 КБ |
| `archive/decisions-adr-042-045.md` | 30 КБ |
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
| `archive/features-v1.2.101-107.md` | 21 КБ |
| `archive/features-v1.2.108-115.md` | 25 КБ |
| `archive/features-v1.2.116-121.md` | 15 КБ |
| `archive/features-v1.2.122-125.md` | 14 КБ |
| `archive/features-v1.2.126-129.md` | 11 КБ |
| `archive/features-v1.2.130-133.md` | 7 КБ |
| `archive/features-v1.2.134-137.md` | 8 КБ |
| `archive/features-v1.2.138-139.md` | 5 КБ |
| `archive/features-v1.2.140-146.md` | 4 КБ |
| `archive/features-v1.2.147-155.md` | 29 КБ |
| `archive/features-v1.2.156-160.md` | 5 КБ |
| `archive/features-v1.2.161-169.md` | 30 КБ |
| `archive/features-v1.2.170-184.md` | 38 КБ |
| `archive/features-v1.2.185-196.md` | 36 КБ |
| `archive/features-v1.2.197-204.md` | 29 КБ |
| `archive/features-v1.2.205-213.md` | 21 КБ |
| `archive/features-v1.2.214-221.md` | 23 КБ |
| `archive/features-v1.2.222-236.md` | 39 КБ |
| `archive/features-v1.2.237-243.md` | 13 КБ |
| `archive/features-v1.2.244-255.md` | 27 КБ |
| `archive/features-v1.2.256-267.md` | 30 КБ |
| `archive/features-v1.2.268-288.md` | 27 КБ |
| `archive/features-v1.2.27-and-older.md` | 76 КБ |
| `archive/features-v1.2.28.md` | 3 КБ |
| `archive/features-v1.2.29.md` | 5 КБ |
| `archive/features-v1.2.293-302.md` | 19 КБ |
| `archive/features-v1.2.3-1.2.4.md` | 10 КБ |
| `archive/features-v1.2.30-36.md` | 29 КБ |
| `archive/features-v1.2.303-312.md` | 9 КБ |
| `archive/features-v1.2.305-311.md` | 16 КБ |
| `archive/features-v1.2.313-328.md` | 41 КБ |
| `archive/features-v1.2.329-348.md` | 58 КБ |
| `archive/features-v1.2.349-360.md` | 36 КБ |
| `archive/features-v1.2.361-366.md` | 15 КБ |
| `archive/features-v1.2.367-372.md` | 16 КБ |
| `archive/features-v1.2.37-45.md` | 42 КБ |
| `archive/features-v1.2.373-380.md` | 28 КБ |
| `archive/features-v1.2.381-388.md` | 27 КБ |
| `archive/features-v1.2.389-392.md` | 14 КБ |
| `archive/features-v1.2.393-395.md` | 16 КБ |
| `archive/features-v1.2.396-400.md` | 18 КБ |
| `archive/features-v1.2.401-405.md` | 18 КБ |
| `archive/features-v1.2.406-415.md` | 30 КБ |
| `archive/features-v1.2.416-423.md` | 26 КБ |
| `archive/features-v1.2.424-433.md` | 44 КБ |
| `archive/features-v1.2.434.md` | 14 КБ |
| `archive/features-v1.2.435.md` | 10 КБ |
| `archive/features-v1.2.436.md` | 7 КБ |
| `archive/features-v1.2.437.md` | 9 КБ |
| `archive/features-v1.2.438.md` | 10 КБ |
| `archive/features-v1.2.439-440.md` | 16 КБ |
| `archive/features-v1.2.441-442.md` | 20 КБ |
| `archive/features-v1.2.443-444.md` | 19 КБ |
| `archive/features-v1.2.445-446.md` | 15 КБ |
| `archive/features-v1.2.447-451.md` | 39 КБ |
| `archive/features-v1.2.452-453.md` | 23 КБ |
| `archive/features-v1.2.46-58.md` | 33 КБ |
| `archive/features-v1.2.59-73.md` | 49 КБ |
| `archive/features-v1.2.74-89.md` | 40 КБ |
| `archive/features-v1.2.90-100.md` | 29 КБ |
| `archive/native-scroll-diagnostics-handoff-CLOSED.md` | 18 КБ |
| `archive/native-scroll-restore-saga-CLOSED.md` | 40 КБ |

_Регенерировано: 2026-09-11_
<!-- STRUCTURE-AUTO-END -->
