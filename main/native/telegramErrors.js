// v0.87.85: перевод ошибок GramJS/Telegram на русский. Изолированный модуль.
// Извлечён из telegramHandler.js (Шаг 7/7 разбиения).

// v0.87.5: перевод типичных ошибок GramJS/Telegram на понятный русский
export function translateTelegramError(raw) {
  if (!raw) return 'Неизвестная ошибка'
  const s = String(raw)
  const map = [
    [/PHONE_NUMBER_INVALID/i, 'Неверный формат номера. Введите в формате +79001234567'],
    [/PHONE_NUMBER_BANNED/i, 'Этот номер забанен в Telegram. Обратитесь в поддержку Telegram'],
    [/PHONE_NUMBER_FLOOD/i, 'Слишком много попыток с этого номера. Попробуйте через несколько часов'],
    [/PHONE_NUMBER_UNOCCUPIED/i, 'Этот номер не зарегистрирован в Telegram. Сначала создайте аккаунт через приложение Telegram'],
    [/PHONE_CODE_INVALID/i, 'Неверный код. Проверьте что ввели правильно (код из Telegram, не SMS если есть Telegram)'],
    [/PHONE_CODE_EXPIRED/i, 'Срок кода истёк. Нажмите «Отмена» и запросите новый'],
    [/PHONE_CODE_EMPTY/i, 'Код не введён'],
    [/PASSWORD_HASH_INVALID/i, 'Неверный облачный пароль. Проверьте раскладку и Caps Lock'],
    [/SESSION_PASSWORD_NEEDED/i, 'Требуется облачный пароль Telegram (2FA)'],
    // FLOOD_WAIT может приходить в разных форматах от GramJS
    [/FLOOD_WAIT_(\d+)/i, (m) => `⏱ Слишком много попыток. Подождите ${formatSeconds(parseInt(m[1]))} и попробуйте снова.\n\nTelegram временно блокирует новые коды с этого номера, чтобы защитить аккаунт.`],
    [/A wait of (\d+) seconds is required/i, (m) => `⏱ Слишком много попыток. Подождите ${formatSeconds(parseInt(m[1]))} и попробуйте снова.\n\nTelegram временно блокирует новые коды с этого номера, чтобы защитить аккаунт.`],
    [/wait of (\d+) seconds/i, (m) => `⏱ Подождите ${formatSeconds(parseInt(m[1]))} перед следующей попыткой.`],
    [/API_ID_INVALID/i, 'Ошибка приложения ChatCenter. Свяжитесь с разработчиком'],
    [/AUTH_KEY_UNREGISTERED/i, 'Сессия устарела. Нажмите «Отмена» и войдите заново'],
    [/AUTH_KEY_DUPLICATED/i, 'Этот аккаунт используется в другой копии программы'],
    [/NETWORK|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i, 'Нет подключения к серверам Telegram. Проверьте интернет и отключите VPN если есть'],
    [/disconnected|CONNECTION_NOT_INITED/i, 'Соединение с Telegram прервано. Попробуйте ещё раз'],
    [/CODE_HASH_INVALID|PHONE_CODE_HASH_EMPTY/i, 'Ошибка авторизации. Нажмите «Отмена» и начните заново'],
    [/USER_DEACTIVATED/i, 'Аккаунт удалён'],
    [/Отменено пользователем/i, 'Авторизация отменена'],
  ]
  for (const [re, repl] of map) {
    const m = s.match(re)
    if (m) return typeof repl === 'function' ? repl(m) : repl
  }
  return 'Ошибка Telegram: ' + s.slice(0, 200)
}

function formatSeconds(sec) {
  if (sec < 60) return `${sec} секунд`
  if (sec < 3600) return `${Math.round(sec / 60)} минут`
  return `${Math.round(sec / 3600)} часов`
}
