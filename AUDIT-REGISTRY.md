# AUDIT REGISTRY

Единый стандарт аудита и append-only реестр для этого репозитория.

У этого файла две роли:
- audit-prompt, которому должен следовать каждый ИИ при аудите проекта
- общий append-only реестр, куда каждый ИИ дописывает только свою новую audit-запись

Не создавай второй audit-prompt или второй audit-ledger в корне репозитория.

## AUDIT II — отдельный файл для итогов всех ИИ

Все ИИ записывают результаты своей проверки в ОДИН общий файл `AUDIT II.md` в корне репозитория.

Правила:
- Файл `AUDIT II.md` — один для всех ИИ, НЕ создавай отдельные файлы для каждого ИИ
- Каждый ИИ дописывает свою секцию в КОНЕЦ файла `AUDIT II.md`
- Никогда НЕ удаляй, НЕ стирай и НЕ изменяй записи других ИИ
- Если предыдущая запись ошибочна — пиши исправление ТОЛЬКО в своей новой записи
- Формат: заголовок с именем/датой ИИ, таблица findings, verified facts, risks, mismatches, validation results
- Append-only: только добавляй в конец, никогда не редактируй чужое

Таким образом:
- `AUDIT-REGISTRY.md` — содержит prompt/правила (этот файл)
- `AUDIT II.md` — содержит реальные записи-результаты всех ИИ (append-only, один файл)

Основной язык файла должен быть русским. Стабильные служебные метки, статусы, команды и кодовые значения можно сохранять в виде значений в backticks.

## Назначение

Любой ИИ, который делает аудит проекта, обязан:
1. Полностью прочитать `CLAUDE.md`.
2. Прочитать обязательные файлы в `.memory-bank/`.
3. Полностью прочитать этот файл перед началом.
4. Проверять реальный код, а не только документацию.
5. Для claims по стеку сверяться с локальной документацией в `DOCS/`.
6. Сравнивать свои выводы с предыдущими записями в этом файле.
7. Записать итоги своей проверки в `AUDIT II.md` (дописать в конец, не трогая чужие записи).

## Реальный стек и структура этого проекта

Этот репозиторий сейчас построен так:
- Electron app на `electron@41.1.0`
- bundler/runtime tooling: `electron-vite@5.0.0`, `vite@7.3.1`
- renderer: `react@19.2.4`, `react-dom@19.2.4`
- styles: `tailwindcss@3.4.19`, `postcss@8.5.8`, `autoprefixer@10.4.27`
- lint: `eslint@9.39.4`, `@eslint/js@9.39.4`
- testing: custom Node-based tests in `src/__tests__/*.cjs`, custom E2E in `e2e/*.cjs`, dependency `@playwright/test` присутствует
- icons and helper deps: `lucide-react`, `globals`, `@vitejs/plugin-react`

Активные проектные зоны:
- root runtime/config: `package.json`, `electron.vite.config.js`, `eslint.config.js`, `postcss.config.js`, `tailwind.config.js`, `index.html`, `CLAUDE.md`, `AUDIT-REGISTRY.md`
- main process: `main/**/*.js`
- preloads: `main/preloads/**/*.cjs`, `main/preloads/hooks/**/*.js`, `main/preloads/utils/**/*.js`
- local window HTML: `main/*.html`
- renderer: `src/**/*.{js,jsx}`, `src/index.css`
- shared runtime data: `shared/**/*`
- tests: `src/__tests__/**/*.cjs`, `e2e/**/*.cjs`
- scripts/hooks: `scripts/**/*`
- CI: `.github/workflows/*`
- project memory/docs: `.memory-bank/*.md`
- local stack docs: `DOCS/*`

Не считать актуальной архитектурой старые пути из прошлых записей вроде `modules/`, `utils/`, `src/core/`, `src/renderer/`, `src/renderer-modules/`, `renderer.js`, `preload.js`, `webpack.config.js`, `build.files`, если этих путей нет в текущем репозитории.

## Жесткие правила

0. **Stage 3 (DOCS Compliance) НЕЛЬЗЯ пропускать.** Сразу после чтения кода — сверяй с `DOCS/` по каждому стеку. Это частая ошибка — делать inventory/lint/build и забыть DOCS. DOCS проверка = обязательная стадия, не опциональная.
1. Код важнее документации, если код и docs расходятся.
2. Никогда не редактируй, не удаляй и не переписывай audit-запись другого ИИ.
3. Всегда разделяй:
   - `runtime code`
   - `test-only code`
   - `stale docs`
   - `stale comments`
   - `environment-limited checks`
4. Каждый вывод должен быть помечен как один из:
   - `Verified`
   - `Inference`
   - `Unverified`
5. Для claims по соответствию стеку добавляй отдельный docs-статус:
   - `Docs-compliant`
   - `Intentional-deviation`
   - `Docs-gap`
   - `Docs-unverified`
   - `Not-applicable`
6. Если не уверен, помечай как `Unverified`. Нельзя превращать неопределенность в утверждение.
7. Нельзя называть аудит `Full` или `Exhaustive`, если обязательное покрытие реально не выполнено.
8. Для `Full` и `Exhaustive` нельзя использовать формулировки вроде `selected files`, `representative files`, `sampled files`.
9. Первое обязательное действие аудита: перепроверить baseline-числа из предыдущих записей и только потом делать новые сильные выводы.
10. Если предыдущая запись ссылается на путь, которого больше нет в репозитории, такую запись нельзя использовать как baseline без явной пометки `legacy-entry-not-applicable`.
11. Нельзя вручную запускать приложение, если это запрещает `CLAUDE.md`.
12. Нельзя переустанавливать `node_modules`, если пользователь прямо этого не просил.
13. Нельзя бездумно запускать все `package.json` scripts подряд. Разрешены только safe-checks и явно уместные команды.
14. Если команда не была выполнена из-за политики, среды, GUI-ограничений, `EPERM`, sandbox или времени, это нужно явно записать как `environment-limited`.
15. Если coverage не был перепроверен заново, нужно писать `coverage not revalidated`.
16. При указании чисел, размеров, версий и line counts обязательно записывай точный метод измерения.

## Исключение для поддержки файла

Если пользователь явно просит улучшить сам этот реестр, структурные prompt-секции можно редактировать.
Исторические audit-записи других ИИ все равно должны оставаться append-only.

## Стандарт работы с локальной документацией

Для этого репозитория локальная документация по стеку лежит в `DOCS/`. Перед выводами о корректности реализации по стеку нужно:
1. Сначала посмотреть `CLAUDE.md`, раздел про документацию.
2. Затем использовать локальные docs из `DOCS/`.
3. Только после этого сравнивать docs с кодом.

Актуальные локальные docs bundles:
- `DOCS/Electron docs`
- `DOCS/electron-vite docs`
- `DOCS/Vite docs`
- `DOCS/Node.js docs`
- `DOCS/React docs`
- `DOCS/MDN docs`
- `DOCS/Tailwind CSS docs`
- `DOCS/PostCSS docs`
- `DOCS/Autoprefixer docs`
- `DOCS/ESLint docs`
- `DOCS/ESLint JS docs`
- `DOCS/Playwright docs`
- `DOCS/Vite Plugin React docs`
- `DOCS/lucide-react docs`
- `DOCS/globals docs`

Обязательное правило:
- MDN не заменяет Electron docs для `BrowserWindow`, `ipcMain`, `contextBridge`, `webview`, `session`, `preload`, `webContents`
- MDN не заменяет Node.js docs для `fs`, `path`, `process`, `child_process`, `https`, TLS/SSL
- claims про `electron-vite`, `vite`, `react`, `tailwind`, `postcss`, `eslint`, `playwright` должны сверяться с соответствующими локальными docs folders, если вопрос касается их поведения

Если claim сделан без точного docs source по активной зоне стека, docs-status должен быть `Docs-unverified`, а не `Docs-compliant`.

## Режимы аудита

### Quick Audit

Используется, если время ограничено.

Обязательный порядок приоритета:
1. Stage 5. Security, WebView, and Remote Content Surface
2. Stage 1. Inventory and Integrity
3. Stage 3. Stack Docs Compliance
4. Stage 6. Validation and Code Quality
5. Stage 4. IPC Cross-Reference

Минимум строк в findings table: `5`

### Partial Audit

Используется, если часть обязательных зон или проверок не была завершена.

Нужно явно перечислить, что именно не было проверено.

Минимум строк в findings table: `10`

### Full Audit

Аудит можно называть `Full` только если одновременно выполнены все условия:
1. Обязательные docs и `.memory-bank` прочитаны.
2. Все активные source/config зоны из этого prompt прочитаны полностью.
3. По активным зонам стека выполнена docs compliance review через локальные `DOCS/`.
4. Safe validation checks выполнены, если их не блокирует политика или среда.
5. Предыдущие claims из реестра сравнены, а несовпадения зафиксированы.

Минимум строк в findings table: `10`

### Exhaustive Audit

Это `Full Audit` плюс:
1. полный `BrowserWindow -> preload -> HTML/URL -> IPC -> tests` map
2. полный `webview/session/partition/remote-content` map
3. полный IPC map по preload, renderer и main
4. scripts classification по `package.json` и hook/CI contract
5. docs mapping по каждому активному stack area

Минимум строк в findings table: `15`

## Глобальный приоритет стадий

Если время, context window или tool limits ограничены, стадии нужно приоритизировать так:
1. Stage 5. Security, WebView, and Remote Content Surface
2. Stage 1. Inventory and Integrity
3. Stage 3. Stack Docs Compliance
4. Stage 4. IPC Cross-Reference
5. Stage 6. Validation and Code Quality
6. Stage 2. Window / Preload / HTML Contract Map
7. Stage 11. CI, Scripts, and Packaging
8. Stage 10. Docs Drift, Memory-Bank Drift, and Legacy
9. Stage 9. State, Storage, and Cleanup Risks
10. Stage 8. Renderer, CSS, HTML, and Asset Wiring
11. Stage 7. Tests and Runtime Verification
12. Stage 12. Final Sanity

Если какая-то stage пропущена, в audit entry нужно записать `SKIP` и конкретную причину.

## Что обязательно прочитать перед аудитом

Минимально нужно прочитать:
1. `CLAUDE.md`
2. `.memory-bank/README.md`
3. `.memory-bank/architecture.md`
4. `.memory-bank/coding-rules.md`
5. `.memory-bank/workflow.md`
6. `.memory-bank/common-mistakes.md`
7. `.memory-bank/features.md`
8. `.memory-bank/decisions.md`
9. `.memory-bank/api.md`
10. `.memory-bank/ai-integration.md` если аудит затрагивает AI, webview, auth, providers, remote content, sessions или IPC
11. `package.json`
12. `electron.vite.config.js`
13. `eslint.config.js`
14. `postcss.config.js`
15. `tailwind.config.js`
16. `index.html`
17. `.github/workflows/test.yml` для `Full` и `Exhaustive`
18. `AUDIT-REGISTRY.md`

Если какой-то обязательный файл отсутствует, это нужно явно записать.
Root `README.md` не является обязательным файлом для этого проекта, потому что в текущем репозитории его нет.

## Обязательное покрытие для Full Audit

Если хотя бы одна зона ниже не была полностью проверена, аудит нельзя считать `Full`:
- root runtime and tooling files
- `main/**/*.js`
- `main/preloads/**/*.cjs`
- `main/preloads/hooks/**/*.js`
- `main/preloads/utils/**/*.js`
- `main/*.html`
- `src/**/*.{js,jsx}`
- `src/index.css`
- `shared/**/*`
- `src/__tests__/**/*.cjs`
- `e2e/**/*.cjs`
- `scripts/**/*`
- `.github/workflows/*`
- `.memory-bank/*.md`
- relevant local docs pages from `DOCS/` for every active stack area touched by the audit

## Стандарт измерений

Когда записываешь counts, используй точные методы и фиксируй их явно.

Предпочтительные методы в этом репозитории:
- raw physical line count: `Get-Content <file> -Raw | Measure-Object -Line`
- file count in a directory: `@(Get-ChildItem <path> -File).Count`
- recursive pattern count: `rg -n "<pattern>" <paths> | Measure-Object -Line`
- command validation: записывать `command`, `exit`, `method` и ключевой результат

Если используешь другой метод, укажи это явно.

## Базовый safe-command набор

Сначала всегда делай статический осмотр.

Обычно безопасно запускать:
- чтение файлов
- `rg`, `Get-ChildItem`, `Get-Content`, `git status --short`, `git diff --stat`, `git ls-files`
- проверку `package.json` и runtime/config файлов
- проверку `.memory-bank/`
- проверку `.github/workflows/`
- `npm run lint`
- `npm run build`
- `node src/__tests__/smokeTest.test.cjs`
- `node e2e/app.e2e.cjs` если среда разрешает запуск Electron child process

Разрешено запускать условно, с обязательной пометкой `environment-limited`, если среда мешает:
- `node e2e/ui.e2e.cjs`
- `npm test`

Нельзя автоматически запускать:
- `npm install`, `npm update`, `npm ci`
- `npm run dev`
- `npm start`
- `electron-vite preview`
- `setup-hooks` и `postinstall`, потому что они изменяют `.git/hooks`
- scripts, которым нужна сеть
- scripts с потенциально destructive behavior

Если команда падает из-за `spawn EPERM`, GUI policy, sandbox или недоступного display/child process, это не равно доказанной поломке проекта. Это нужно фиксировать отдельно как `environment-limited`.

## Классификация scripts

При аудите `package.json` scripts каждый важный script нужно отнести к одному из классов:
- `safe-run`
- `static-only`
- `conditional-run`
- `not-run-by-policy`
- `user-approval-required`
- `stale-or-suspicious`

## Порядок аудита

Каждая stage ниже ожидается в `Full` и `Exhaustive` аудитах, если этому не мешает политика или среда.
Если stage пропущена, нужно записать `SKIP` и точную причину.

### Stage 0. Start Checklist

Перед аудитом нужно подтвердить:
- `CLAUDE.md` read
- required `.memory-bank` files read
- prior registry entries read
- audit mode selected
- baseline numbers scheduled for revalidation first
- local `DOCS/` availability checked

### Stage 0.5. Baseline Revalidation

Перепроверь baseline-числа до того, как делать более широкие выводы.

Минимально перепроверить:
- project version
- `main/main.js` raw physical line count
- `src/App.jsx` raw physical line count
- `src/utils/webviewSetup.js` raw physical line count
- `main/preloads/monitor.preload.cjs` raw physical line count
- `main/handlers/dockPinHandlers.js` raw physical line count
- `src/components/AISidebar.jsx` raw physical line count
- preload count
- preload hook count
- main HTML count
- component/hook/util/test counts
- `ipcMain.handle`, `ipcMain.on`, `contextBridge.exposeInMainWorld`, `new BrowserWindow(` counts
- build presence and major size numbers if build is run

Первые строки findings table должны покрывать самые важные заново перепроверенные baseline-числа.

### Stage 1. Inventory and Integrity

Проверить:
- root project composition
- active runtime files
- active windows and preload files
- active HTML and CSS
- required file existence
- HTML references to JS and CSS
- electron-vite entrypoints and output contract
- obvious orphan files or removed folders still mentioned in docs/comments
- version drift across code, docs and configs

### Stage 2. Window / Preload / HTML Contract Map

Обязательно:
1. собрать список всех `new BrowserWindow(`
2. для каждого окна определить creator file
3. определить preload file или отсутствие preload
4. определить local HTML file или remote URL
5. определить security prefs: `contextIsolation`, `nodeIntegration`, `sandbox`, `webviewTag`, `partition`
6. определить связанный IPC surface и tests

Для этого проекта отдельно зафиксировать карту как минимум для:
- main window
- notification window
- pin notification window
- pin dock window
- log viewer window
- AI login window

Также обязательно зафиксировать consumer для всех `5` preload bundles. Если preload не привязан напрямую к `BrowserWindow`, нужно явно описать реальный consumer.

### Stage 3. Stack Docs Compliance

Это обязательная стадия для этого проекта.

Проверить соответствие кода локальной документации по стеку:
- Electron: `BrowserWindow`, `webPreferences`, `contextIsolation`, `nodeIntegration`, `sandbox`, `contextBridge`, `ipcMain`, `webContents`, `shell`, `session`, `permissions`, `<webview>`, `executeJavaScript`
- Node.js: `fs`, `path`, `process`, `child_process`, `https`, TLS/SSL
- electron-vite / Vite: main/preload/renderer entries, build output, static assets, preview/dev/build contract
- React / MDN: renderer lifecycle, effects cleanup, DOM listeners, browser APIs, HTML/CSS contract
- Tailwind / PostCSS / Autoprefixer: CSS pipeline and config wiring
- ESLint / `@eslint/js`: flat config, ignores, lint surface
- Playwright: только если фактически участвует в текущей тестовой цепочке
- `@vitejs/plugin-react`, `lucide-react`, `globals`: только если finding относится к ним

Требования:
- указывать точный local docs source
- не подменять Electron docs MDN-страницами
- не подменять Node.js docs MDN-страницами
- если код осознанно расходится с docs, помечать как `Intentional-deviation`

### Stage 4. IPC Cross-Reference

Обязательно:
1. собрать список surfaces из preload
2. собрать список `ipcMain.on` и `ipcMain.handle`
3. сравнить preload с main
4. сравнить main с preload
5. сравнить это с `.memory-bank/api.md`

Отдельно зафиксировать:
- preload-only channels
- main-only channels
- docs-only channels
- code-only undocumented channels
- broad bridges versus narrow bridges

### Stage 5. Security, WebView, and Remote Content Surface

Это главная зона риска этого проекта. Проверить:
- `contextIsolation`
- `nodeIntegration`
- `sandbox`
- `contextBridge` surface size
- unsafe IPC usage
- path traversal risks
- shell and file-open guards
- `executeJavaScript`
- `shell.openExternal`
- `https.Agent` and TLS bypass
- `webviewTag`
- `allowpopups`
- `partition` и persist session usage
- `session.setPermissionRequestHandler`
- response header rewriting, CSP and `X-Frame-Options` changes
- remote login windows
- unsafe user data interpolation into executable JS
- risky `innerHTML` or DOM injection paths that affect provider DOM or webview scripts

Если код использует удаленный контент, эта стадия не может быть `SKIP` в `Full` или `Exhaustive`.

### Stage 6. Validation and Code Quality

Проверить:
- `npm run lint`
- `npm run build`
- presence of build artifacts in `out/main`, `out/preload`, `out/renderer`, если build запускался
- file-size limits and project health tests, если они релевантны выводам
- lint/build drift between local runs and CI contract

Важно:
- обязательного `tsc`/typecheck pipeline у этого репозитория сейчас нет
- `Typecheck` нужно помечать как `not-applicable`, если в проекте реально нет активной TS/typecheck стадии
- нельзя требовать `webpack build`, `build:ts`, `electron-builder` или `build.files`, если соответствующих файлов и scripts нет

### Stage 7. Tests and Runtime Verification

Проверить:
- test topology из `package.json`
- exact suite/test counts, только если они получены из текущего запуска
- `.only`, `.skip`, `xit`, `xdescribe`
- risky runtime modules without tests
- smoke coverage for runtime contracts
- E2E app test status
- E2E UI status

Если `node e2e/ui.e2e.cjs` или `npm test` упираются в `spawn EPERM`/GUI policy/sandbox, это нужно помечать как `environment-limited`, а не автоматически как runtime regression.

### Stage 8. Renderer, CSS, HTML, and Asset Wiring

Проверить:
- full list of active CSS files
- where each CSS file is linked
- Tailwind/PostCSS wiring
- broken CSS or asset references
- broken HTML references
- build-time asset drift
- obvious global selector conflicts
- renderer entry wiring

Если CSS parser или linter не запускался, это нужно пометить как `manual CSS inspection only`.

### Stage 9. State, Storage, and Cleanup Risks

Проверить:
- app settings and storage flows
- compatibility with old configs, если есть миграции
- merge behavior
- timers without cleanup
- listeners without cleanup
- potential memory leaks
- webview cleanup
- notification cleanup
- session cleanup
- clipboard restore behavior
- early DOM queries before `DOMContentLoaded`
- `fs`/`path`/`process`/`child_process` usage versus documented expectations

### Stage 10. Docs Drift, Memory-Bank Drift, and Legacy

Проверить:
- drift versus `.memory-bank/*`
- feature claims in `.memory-bank/features.md` that no longer match code
- stale comments with outdated counts or architecture
- runtime-unreachable code kept alive only by tests
- dead IPC
- dead deps in `dependencies` or `devDependencies`
- legacy bridge layers
- prior audit entries that reference files or tooling no longer existing in this repo

Если прошлая запись опирается на несуществующие пути, нужно явно указать `legacy-entry-not-applicable`.

### Stage 11. CI, Scripts, and Packaging

Проверить:
- `.github/workflows/test.yml`
- `scripts/hooks/pre-commit`
- relevant `package.json` scripts
- `electron.vite.config.js`
- `out/main`, `out/preload`, `out/renderer` contract, если build запускался

Не считать обязательными для этого проекта:
- `.husky/*`
- `electron-builder`
- `build.files`
- `webpack.config.js`

Если такие вещи упомянуты в предыдущих записях, их нужно трактовать как legacy-context, а не как текущий baseline.

### Stage 12. Final Sanity

Ответить значениями `yes`, `no`, `unverified`, `not-applicable` или `environment-limited`:
- safe validation checks pass?
- critical runtime files exist?
- docs compliance reviewed across active stack?
- remote-content surface fully mapped?
- legacy registry mismatches handled?
- runtime-only verification complete?

## Актуальный baseline snapshot

Ниже advisory snapshot по текущему проекту. Его нужно перепроверять в начале нового аудита.

Метод line counts:
- `Get-Content <file> -Raw | Measure-Object -Line`

Метод pattern counts:
- `rg -n "<pattern>" <paths> | Measure-Object -Line`

As of `2026-04-10` (перепроверено аудитом Qwen Code):
- project version: `0.86.1`
- `main/main.js`: `500` lines (было 575 — код вынесен в handlers/utils)
- `src/App.jsx`: `518` lines (было 566 — код вынесен в hooks/components)
- `src/utils/webviewSetup.js`: `574` lines (совпадает)
- `main/preloads/monitor.preload.cjs`: `474` lines (совпадает)
- `main/handlers/dockPinHandlers.js`: `571` lines (совпадает)
- `src/components/AISidebar.jsx`: `542` lines (совпадает)
- preload `.cjs` files: `5` (совпадает)
- preload hook `.js` files: `4` (совпадает)
- main HTML files: `4` (совпадает)
- React component `.jsx` files: `13` (совпадает)
- `src/hooks/*.js`: `9` (совпадает)
- `src/utils/*.js`: `13` (совпадает)
- `src/__tests__/*.cjs`: `24` (совпадает)
- `e2e/*.cjs`: `3` (было 2 — +1 новый файл)
- `.memory-bank/*.md`: `12` (совпадает)
- `DOCS` folders: `15` (совпадает)
- `ipcMain.handle`: `23` (было 24 — handler удалён/объединён)
- `ipcMain.on`: `26` (совпадает)
- `contextBridge.exposeInMainWorld`: `4` (совпадает)
- `new BrowserWindow(`: `6` (совпадает)

Validation snapshot as of `2026-04-10`:
- `npm run lint`: pass
- `npm run build`: pass
- `node src/__tests__/smokeTest.test.cjs`: pass (`39/39`)
- `node e2e/app.e2e.cjs`: pass
- `node e2e/ui.e2e.cjs`: `environment-limited` in restricted environment (`spawn EPERM`)
- `npm test`: cannot be treated as clean signal in restricted environment if it fails only on the UI E2E tail with `spawn EPERM`

## Taxonomy причин расхождений

Если твой вывод конфликтует с предыдущей записью, нужно выбрать одну или несколько причин:
- `stale-docs`
- `stale-prior-audit`
- `legacy-entry-not-applicable`
- `actual-code-change`
- `runtime-vs-test-confusion`
- `docs-vs-code-intentional-deviation`
- `file-confusion`
- `command-mismatch`
- `partial-inspection-error`
- `environment-limitation`
- `other`

## Шаблон Audit Entry

Добавляй свою запись в конец файла по этой структуре:

```md
## Audit Entry

- Date: YYYY-MM-DD
- Timezone: <timezone>
- AI: <model or system name>
- Auditor Label: <short identifier>
- Scope: Quick audit | Partial audit | Full audit | Exhaustive audit

### Files Read
- ...

### Areas Traversed
- ...

### Docs Consulted
- `DOCS/...`

### Commands Run
- command: ...
  exit: ...
  method: ...
  result: ...

### Skipped Stages
- Stage X: SKIP - <reason>

### Findings Table
| Priority | Area | File | Claim | Code Evidence | Docs Source | Evidence Status | Docs Status | Action |
|----------|------|------|-------|---------------|-------------|-----------------|-------------|--------|
| P0-P4 | ... | ... | ... | ... | ... | Verified / Inference / Unverified | Docs-compliant / Intentional-deviation / Docs-gap / Docs-unverified / Not-applicable | ... |

### Verified Facts
- ...

### Inferences
- ...

### Unverified
- ...

### Mismatches Against Prior Entries
- Prior claim: ...
- Re-check result: ...
- Reason: stale-docs | stale-prior-audit | legacy-entry-not-applicable | actual-code-change | runtime-vs-test-confusion | docs-vs-code-intentional-deviation | file-confusion | command-mismatch | partial-inspection-error | environment-limitation | other
- Final verdict: ...

### Risks
- P0 ...
- P1 ...
- P2 ...
- P3 ...
- P4 ...

### Validation Results
- Lint: pass | fail | not-run
- Build: pass | fail | not-run
- Smoke: pass | fail | not-run
- E2E App: pass | fail | environment-limited | not-run
- E2E UI: pass | fail | environment-limited | not-run
- Typecheck: pass | fail | not-applicable | not-run
- Docs Compliance: reviewed | partial | not-run
- Coverage: pass | fail | not-run | not-revalidated

### Scripts Classification
- script: ...
  class: safe-run | static-only | conditional-run | not-run-by-policy | user-approval-required | stale-or-suspicious
  note: ...

### Final Sanity
- safe validation checks pass? yes/no/unverified/environment-limited
- critical runtime files exist? yes/no/unverified
- docs compliance reviewed across active stack? yes/no/unverified
- remote-content surface fully mapped? yes/no/unverified
- legacy registry mismatches handled? yes/no/unverified
- runtime-only verification complete? yes/no/unverified/environment-limited

### Unique Findings
- ...

### Notes For Next AI
- ...
```

Правила для записи:
1. Для `Partial`, `Full` и `Exhaustive` нужно минимум `10` evidence-backed строк в findings table.
2. Для `Quick` нужно минимум `5` evidence-backed строк.
3. Строки findings table могут быть как проблемами, так и подтвержденными корректными проверками, но у них обязательно должно быть evidence.
4. Если что-то не было проверено, это нужно писать прямо.
5. Для line counts и похожих измерений обязательно записывать метод.
6. Если stage была пропущена, ее нужно добавить в `Skipped Stages` как `SKIP + reason`.
7. Если в реестре уже есть предыдущие записи, первые evidence-backed строки должны перепроверять ключевые baseline-числа.
8. Старые записи могут использовать более раннюю версию шаблона и могут не содержать все новые поля.

## Append-only правила

1. Всегда дописывай новую запись в конец файла.
2. Никогда не переписывай запись другого ИИ.
3. Если предыдущая запись ошибочна, исправление нужно писать только внутри своей новой записи.
4. Любой спорный claim должен подтверждаться кодом, docs source или command evidence.
5. `Inference` допустим только если он явно помечен и не выдается за факт.
6. При улучшении этого файла можно редактировать только prompt/template часть; исторические audit entries ниже должны оставаться append-only.

## Audit Entry

- Date: 2026-04-09
- Timezone: Asia/Yekaterinburg
- AI: GPT-5 Codex
- Auditor Label: codex-baseline
- Scope: Partial audit

### Files Read
- `CLAUDE.md`
- `.memory-bank/README.md`
- `.memory-bank/architecture.md`
- `.memory-bank/api.md`
- `.memory-bank/decisions.md`
- `.memory-bank/features.md`
- `README.md`
- `package.json`
- `main.js`
- `preload.js`
- `renderer.js`
- `modules/*.js`
- parts of `src/renderer/`
- parts of `src/core/`
- parts of `src/renderer-modules/`
- `.husky/pre-commit`
- `.husky/pre-push`
- `.github/workflows/ci.yml`

### Areas Traversed
- root runtime and tooling files
- `modules/`
- `utils/`
- `src/core/`
- `src/renderer/`
- `src/renderer-modules/`
- active preload files
- active HTML files
- active CSS files
- `e2e/`
- `.husky/`
- `.github/workflows/`
- `.memory-bank/`

### Commands Run
- command: `npm run check:syntax`
  exit: `0`
  method: direct local run
  result: pass
- command: `npm run build:ts`
  exit: `0`
  method: direct local run
  result: pass
- command: `npm test -- --runInBand`
  exit: `0`
  method: direct local run
  result: `69/69` suites, `2293/2293` tests passed
- command: `npx tsc --noEmit`
  exit: non-zero
  method: direct local run
  result: fail across tests and multiple renderer modules
- command: `npx eslint src/ --ext .ts`
  exit: non-zero
  method: direct local run
  result: `371 warnings`, `0 errors`
- command: PowerShell file and line counts
  exit: `0`
  method: raw lines via `Get-Content <file> -Raw | Measure-Object -Line`; file counts via `@(Get-ChildItem <path> -File).Count`
  result: structure and major file sizes verified

### Findings Table
| Priority | Area | File | Claim | Evidence | Verdict |
|----------|------|------|-------|----------|---------|
| P0 | Typecheck | `src/renderer-modules/*`, `src/__tests__/*` | `tsc --noEmit` fails across tests and renderer modules | direct `tsc` run | verified |
| P1 | Build | `webpack.config.js` | build passes even though typecheck fails because transpilation is separate | passing webpack build plus failing `tsc` | verified |
| P1 | Tests | `package.json`, test suite | unit tests pass | direct Jest run with exact counts | verified |
| P1 | Docs drift | `README.md`, `.memory-bank/*` | docs are stale relative to current code | direct file comparison | verified |
| P1 | Structure | `modules/` | main-process module count is `11` | direct file count | verified |
| P1 | Structure | preload and HTML windows | there are `4` active preload files and `4` active HTML windows | direct file inspection | verified |
| P1 | Size limits | `src/renderer-modules/provider-settings-popup.ts` | file exceeds renderer-module limit | raw line count `618` | verified |
| P1 | Size limits | `src/renderer-modules/diag-ui.ts` | file exceeds renderer-module limit | raw line count `617` | verified |
| P1 | Size limits | `src/renderer-modules/poll-detection.ts` | file exceeds renderer-module limit | raw line count `613` | verified |
| P2 | Legacy | `main.js`, `modules/ipc-ai-handlers.js`, `utils/ai-providers.js` | `aiProviderManager` appears to be legacy wiring | code inspection shows it is injected but not called by live handlers | inference |
| P2 | IPC/docs drift | `modules/ipc-ai-handlers.js`, `preload.js`, `.memory-bank/api.md` | some older IPC routes remain in docs but not in live runtime | code inspection and comments | verified |
| P2 | Count mismatch | `main.js` | raw physical line count is `154`, not stale `143` from old docs | raw line method recorded above | verified |

### Verified Facts
- Project version is `2.8.7`.
- `modules/` contains `11` JS files.
- `src/renderer-modules/` contains `44` TS files.
- `src/renderer/` contains `34` TS files.
- `src/core/` contains `6` TS files.
- There are `4` preload files and `4` active HTML window files.
- `renderer.js` raw physical line count is `1372`.
- `main.js` raw physical line count is `154`.
- `renderer.bundle.js` is about `240853` bytes.
- `renderer-modules.bundle.js` is about `760316` bytes.
- `ai-send-message`, `ai-test-connection`, `ai-stream-*`, and `ai-stop-generation` are removed from the live UI path.
- `README.md` and parts of `.memory-bank/` are stale relative to the codebase.

### Inferences
- `aiProviderManager` is likely legacy runtime wiring and a cleanup candidate.
- dormant build or config artifacts are likely contributing to documentation confusion.

### Unverified
- manual UI behavior was not verified because `CLAUDE.md` forbids manual app launch
- E2E runtime behavior was not manually executed in this baseline
- this baseline is `Partial` because not all active source files were read completely

### Mismatches Against Prior Entries
- Prior claim: no prior registry entry existed.
- Re-check result: baseline entry initialized from direct code inspection and command output.
- Reason: other
- Final verdict: future AIs must revalidate key baseline numbers before relying on them.

### Risks
- P0 TypeScript typecheck is broken across tests and many renderer modules.
- P1 Documentation drift is large enough to mislead future audits.
- P1 Several files exceed local size limits.
- P2 Legacy wiring remains in place, especially around `aiProviderManager`.
- P4 Manual UI behavior remains unverified in this baseline.

### Validation Results
- Syntax: pass
- Build: pass
- Tests: pass
- Typecheck: fail
- Lint: warnings
- Coverage: not-revalidated

### Scripts Classification
- script: `check:syntax`
  class: `safe-run`
  note: local static syntax validation
- script: `build:ts`
  class: `safe-run`
  note: local webpack build
- script: `test`
  class: `safe-run`
  note: local Jest run
- script: `typecheck`
  class: `safe-run`
  note: local TypeScript no-emit check
- script: `start`
  class: `not-run-by-policy`
  note: manual app launch is restricted by `CLAUDE.md`

### Final Sanity
- safe validation checks pass? no
- critical runtime files exist? yes
- dead file references found? unverified
- typecheck passes? no
- docs drift present? yes
- packaging drift present? unverified
- runtime-only verification complete? no

### Notes For Next AI
- Revalidate baseline numbers first, especially line counts and test counts.
- Keep runtime code, test-only references, and stale docs separate.
- If you disagree with this baseline, record the exact command or file evidence that changed the conclusion.
