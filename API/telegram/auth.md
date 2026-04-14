# Telegram Authorization Flow (MTProto)

Источник: https://core.telegram.org/api/auth

## Обзор

Авторизация привязана к `auth_key_id` (ключу шифрования клиента). После входа все вызовы API идут от имени пользователя.

## Шаг 1: Отправка кода

Вызвать **`auth.sendCode`** с параметрами:
- `phone_number` — телефон
- `api_id`, `api_hash` — креды приложения
- `settings` — настройки доставки (Firebase, flash call, missed call, logout tokens)

Ответ: **`auth.sentCode`** содержит:
- `type` — способ доставки (SMS, app, email, call, flash call)
- `phone_code_hash` — нужен для следующих вызовов
- `next_type` — fallback если код не пришёл
- `timeout` — секунд до повторной отправки

### Способы доставки кода
- SMS (или SMS с словом/фразой)
- Голосовой звонок / flash call
- Уведомление в приложении Telegram (если есть активная сессия)
- Email
- Fragment (для номеров Fragment)
- Firebase (только для официальных приложений)

### Future Auth Tokens

Если пользователь выходит из существующей сессии, сервер может вернуть `future_auth_token`. Можно хранить до 20 токенов. При `auth.sendCode` передавать их в `codeSettings.logout_tokens` — если токен совпадает с аккаунтом, вход пройдёт без SMS.

## Шаг 2: Подтверждение email (если требуется)

Если сервер вернул **`auth.sentCodeTypeSetUpEmailRequired`**:

**Вариант A** — Social login:
Авторизация через Google/Apple ID → **`account.verifyEmail`** с ID token.

**Вариант B** — Email-код:
1. **`account.sendVerifyEmailCode`** с адресом email
2. Пользователь получает код
3. **`account.verifyEmail`** с кодом

После успеха возвращается **`auth.sentCode`** — обрабатывать как обычно.

## Шаг 3: Вход по коду

**`auth.signIn`** с параметрами:
- `phone_number`
- `phone_code_hash`
- `phone_code` — код введённый пользователем

## Шаг 4: Регистрация (если новый аккаунт)

Если **`auth.signIn`** вернул **`auth.authorizationSignUpRequired`** — номер не зарегистрирован. Вызвать **`auth.signUp`**:
- `phone_number`
- `phone_code_hash`
- `first_name`, `last_name`
- Принять Terms of Service

## Шаг 5: 2FA (если включена)

Если **`auth.signIn`** вернул ошибку **`SESSION_PASSWORD_NEEDED`** — включена двухфакторная аутентификация. Следовать [SRP 2FA](https://core.telegram.org/api/srp):

1. **`account.getPassword`** — получить параметры SRP
2. Вычислить hash пароля по алгоритму SRP
3. **`auth.checkPassword`** — проверить

## Шаг 6: Подтверждение входа

При успешном входе другие активные сессии получают **`updateNewAuthorization`**. Если флаг `unconfirmed` — остальные сессии показывают уведомление. Пользователь может:
- Подтвердить: **`account.changeAuthorizationSettings`**
- Отклонить: **`account.resetAuthorization`**

## Шаг 7: Готово

Клиент получает `auth_key_id`. Большинство методов API доступны.

## Безопасность

- «Серверы Telegram автоматически аннулируют коды, если их переслали в другой чат Telegram»
- Клиенты должны сами аннулировать коды если пользователь сделал скриншот → **`account.invalidateSignInCodes`**

## QR-авторизация (альтернатива)

1. **`auth.exportLoginToken`** — получить токен для QR
2. Показать QR с `tg://login?token=...`
3. Пользователь сканирует в Telegram на телефоне
4. Сервер шлёт `updateLoginToken` → **`auth.acceptLoginToken`**

## Тестовые DC

Тестовые телефоны формата `99966XYYYY`:
- X — номер DC (1-3)
- YYYY — случайные цифры

Код входа: `XXXXX` (X повторяется 5 раз).

## Реализация в GramJS

Метод `client.start({...})` автоматически выполняет все шаги:

```javascript
await client.start({
  phoneNumber: async () => await input.text("Телефон: "),
  password: async () => await input.text("Пароль 2FA: "),
  phoneCode: async () => await input.text("Код: "),
  onError: (err) => console.log(err),
});
```

Для QR-логина используется отдельный метод `client.signInUserWithQrCode`.
