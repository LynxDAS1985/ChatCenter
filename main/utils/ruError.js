// v0.87.81: вынесено из main.js — перевод типовых API-ошибок на русский.
// Применяется ко всем 4 ИИ-провайдерам (OpenAI, Anthropic, DeepSeek, GigaChat).
// Незнакомые ошибки оставляет как есть.

export function ruError(msg) {
  if (!msg) return 'Неизвестная ошибка'
  const m = msg.toLowerCase()
  if (m.includes('exceeded') && m.includes('quota') || m.includes('insufficient_quota') || m.includes('insufficient balance') || m.includes('insufficient_balance'))
    return 'Недостаточно средств на балансе. Пополните счёт на сайте провайдера'
  if (m.includes('invalid api key') || m.includes('incorrect api key') || m.includes('no api key'))
    return 'Неверный API-ключ. Проверьте ключ в настройках'
  if (m.includes('rate limit') || m.includes('too many requests'))
    return 'Слишком много запросов. Подождите немного и попробуйте снова'
  if (m.includes('model') && (m.includes('not exist') || m.includes('not found') || m.includes('does not exist')))
    return 'Указанная модель не найдена. Проверьте название модели'
  if (m.includes('context') && m.includes('length'))
    return 'Сообщение слишком длинное для этой модели'
  if (m.includes('can\'t decode') || m.includes('cannot decode') || m.includes('decode') && m.includes('header'))
    return 'Неверный формат Client ID или Client Secret. Убедитесь что скопировали без пробелов'
  if (m.includes('unauthorized') || m.includes('authentication') || m.includes('authorization'))
    return 'Ошибка авторизации. Проверьте Client ID и Client Secret'
  if (m.includes('billing') || m.includes('payment'))
    return 'Проблема с оплатой. Проверьте платёжные данные у провайдера'
  if (m.includes('overloaded') || m.includes('capacity') || m.includes('unavailable'))
    return 'Сервер провайдера перегружен. Попробуйте позже'
  if (m.includes('network') || m.includes('fetch') || m.includes('connect'))
    return 'Нет соединения с сервером провайдера. Проверьте интернет'
  if (m.includes('timeout'))
    return 'Превышено время ожидания ответа от провайдера'
  return msg // не переводим неизвестные — оставляем как есть
}
