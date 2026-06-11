// v1.2.0-alpha.1 (Этап 1 AI Bridge): JSDoc-контракты для AI Bridge.
//
// Эта надстройка над текущим AI слоем (Phase 0-4 + GigaChat tool use) даёт
// единый плоский интерфейс «ask(question) → answer» поверх ТРЁХ источников:
//   1) `webui` — webview-сайт (chat.openai.com / chat.deepseek.com / claude.ai / giga.chat)
//   2) `api`   — прямой HTTP к Anthropic/OpenAI/DeepSeek/GigaChat (aiProviderCaller)
//   3) `local` — Ollama HTTP на 127.0.0.1:11434
//
// ВАЖНО:
// - Чистые типы. Никаких side-effects на импорт.
// - JSDoc, потому что у проекта нет TypeScript.
// - При смене формата bumping `version` поля сохраняет обратную совместимость в IPC.

/**
 * Уникальный идентификатор провайдера AI (как в aiProviders.js + 'local').
 * @typedef {'anthropic' | 'openai' | 'deepseek' | 'gigachat' | 'local'} AiProviderId
 */

/**
 * Режим работы Bridge.
 *  - `api`   — HTTP к официальному API провайдера. Нужны ключи (apiKey / clientSecret).
 *  - `webui` — webview-сайт + DOM injection. Ключи не нужны (юзер залогинен в браузере).
 *  - `local` — Ollama на той же машине, без ключей.
 * @typedef {'api' | 'webui' | 'local'} AiBridgeMode
 */

/**
 * Какой текстовый контекст подмешать к вопросу.
 *  - `none` — только текущее сообщение клиента, без истории.
 *  - `last` — последнее сообщение клиента + 1-2 предыдущих (по умолчанию).
 *  - `full` — последние N сообщений (N задаёт хост, обычно 10).
 * @typedef {'none' | 'last' | 'full'} AiContextMode
 */

/**
 * Источник вопроса — паспорт сообщения от которого идёт диалог.
 * Совместим с NotificationSource (v0.96.0), но shape проще — без UI-полей.
 * @typedef {Object} AiBridgeSource
 * @property {string} messengerId  — messengerId (например `native_cc`).
 * @property {string=} accountId   — TDLib accountId для multi-account.
 * @property {string=} chatId      — Composite chatId (`accountId:rawId` или сырой rawId).
 * @property {string=} messageId   — Composite messageId.
 * @property {string=} clientName  — Имя клиента (для system prompt).
 */

/**
 * Один диалоговый ход: один абзац от human или assistant.
 * Используется в `Question.history`.
 * @typedef {Object} AiBridgeTurn
 * @property {'user' | 'assistant'} role
 * @property {string} text
 * @property {number=} ts   — Unix timestamp в мс (для сортировки + UI).
 */

/**
 * Вход в bridge — что отправляем в AI.
 * @typedef {Object} AiBridgeQuestion
 * @property {number} version           — Контракт версии. Сейчас всегда 1.
 * @property {string} text              — Основной текст вопроса (последнее сообщение клиента).
 * @property {AiBridgeSource} source    — Откуда пришёл вопрос (паспорт сообщения).
 * @property {AiBridgeTurn[]=} history  — Предыдущие ходы (опционально, для contextMode='full').
 * @property {string=} systemPrompt     — Кастомный system prompt (опционально).
 * @property {AiContextMode=} contextMode — `none` / `last` / `full` (default: `last`).
 * @property {number=} timeoutMs        — Максимум ожидания (default: 60000).
 * @property {AbortSignal=} signal      — Для отмены.
 */

/**
 * Выход bridge — что вернули из AI.
 * @typedef {Object} AiBridgeAnswer
 * @property {number} version            — Контракт версии. Сейчас всегда 1.
 * @property {boolean} ok                — true → answer заполнен, false → error заполнен.
 * @property {string} text               — Сгенерированный ответ AI (если ok).
 * @property {AiProviderId} providerId   — Кто отвечал (для логов / fallback chain).
 * @property {AiBridgeMode} mode         — Через какой bridge (api/webui/local).
 * @property {number} latencyMs          — Сколько ответ занял (для метрик).
 * @property {string=} model             — Модель если известна (gpt-4o, deepseek-chat, ...).
 * @property {AiBridgeError=} error      — Если ok=false.
 * @property {Object=} debug             — Доп. инфо (например URL webview, raw response).
 */

/**
 * Ошибка bridge. Стандартизована, чтобы UI/fallback могли единообразно обработать.
 * @typedef {Object} AiBridgeError
 * @property {AiBridgeErrorCode} code
 * @property {string} message            — Человекочитаемое сообщение для UI.
 * @property {string=} detail            — Доп. детали (например stack или HTTP body).
 * @property {boolean=} retryable        — Имеет смысл повторить (true) или сразу fallback (false).
 */

/**
 * Перечень кодов ошибок bridge. Закрытый список — UI завязан на него.
 * @typedef {'auth_required' | 'input_not_found' | 'submit_not_found' | 'no_answer'
 *   | 'streaming_timeout' | 'rate_limited' | 'network_error' | 'server_error'
 *   | 'aborted' | 'config_invalid' | 'unsupported_mode' | 'unknown'} AiBridgeErrorCode
 */

/**
 * Настройки одного провайдера в режиме webui (DOM injection).
 * @typedef {Object} AiWebviewProviderConfig
 * @property {AiProviderId} id
 * @property {string} label              — Имя для UI («ChatGPT», «DeepSeek», ...).
 * @property {string} defaultUrl         — Дефолтный URL сайта.
 * @property {string[]} hostPatterns     — Шаблоны host для detectAiProvider (`chat.openai.com`, `chatgpt.com`).
 * @property {AiWebviewSelectors} selectors — Дефолтные селекторы.
 * @property {number=} debounceMs        — Сколько ждать тишины MutationObserver (default 800).
 * @property {number=} cooldownMs        — Минимум между запросами в этот webui (default 3000).
 */

/**
 * Селекторы DOM для injection / extraction.
 * @typedef {Object} AiWebviewSelectors
 * @property {string} input              — Поле ввода (textarea / contenteditable div).
 * @property {string} submitButton       — Кнопка отправки.
 * @property {string} lastAssistantMessage — Последний ответ AI.
 * @property {string} streamingIndicator — Элемент который ЕСТЬ во время генерации.
 */

/**
 * Настройки local bridge (Ollama).
 * @typedef {Object} AiLocalBridgeConfig
 * @property {string} baseUrl            — Default `http://127.0.0.1:11434`.
 * @property {string} model              — Имя модели Ollama (`llama3.1`, `qwen2.5`, ...).
 * @property {number=} timeoutMs         — Default 60000.
 */

/**
 * Какие bridges пробовать по очереди если основной отвалился.
 * Используется в multi-bridge fallback chain (Этап 9).
 * @typedef {Object} AiBridgeFallbackEntry
 * @property {AiBridgeMode} mode
 * @property {AiProviderId} providerId
 */

export const AI_BRIDGE_CONTRACT_VERSION = 1
