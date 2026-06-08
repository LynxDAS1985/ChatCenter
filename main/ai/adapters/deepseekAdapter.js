// v0.97.0 (Phase 1 M1.5): DeepSeek adapter.
//
// DeepSeek API полностью OpenAI-compatible — используем openaiAdapter.
// Отличие только endpoint URL (https://api.deepseek.com/v1/chat/completions)
// и модели (deepseek-chat / deepseek-reasoner).
//
// Note: deepseek-reasoner НЕ поддерживает tool use (только deepseek-chat).

export {
  toOpenAITools as toDeepSeekTools,
  parseOpenAIToolCalls as parseDeepSeekToolCalls,
  parseOpenAIText as parseDeepSeekText,
  formatToolResult,
  getFinishReason,
} from './openaiAdapter.js'
