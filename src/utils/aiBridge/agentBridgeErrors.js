const PROVIDER_LABELS = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  deepseek: 'DeepSeek',
  gigachat: 'ГигаЧат',
}

export function formatAiAgentBridgeError(result) {
  const error = result?.error || {}
  const code = error.code || ''
  const message = error.message || ''
  const providerName = PROVIDER_LABELS[result?.providerId] || result?.providerId || 'AI'

  if (result?.mode === 'webui') {
    if (code === 'config_invalid' && /webview/i.test(message)) {
      return `${providerName} открыт как сайт, но мост ещё не готов. Откройте вкладку ${providerName} и дождитесь загрузки страницы.`
    }
    if (code === 'input_not_found' || code === 'submit_not_found') {
      return `${providerName} загрузился, но приложение не нашло поле ввода. Откройте настройки селекторов AI-сайта и проверьте поля.`
    }
    if (code === 'streaming_timeout') {
      return `${providerName} не ответил вовремя. Проверьте, что сайт открыт, вы вошли в аккаунт и страница не просит подтверждение.`
    }
  }

  return message || code || 'bridge_error'
}
