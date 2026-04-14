# VK — авторизация и токены

## Три типа токенов

| Тип | Где используется | Права |
|---|---|---|
| **User token** | От имени пользователя | Полный доступ к аккаунту |
| **Group token** | От имени сообщества | Только в рамках сообщества |
| **Service token** | Серверные запросы | Очень ограниченный |

Нам нужен **User token** для нашей задачи (читать переписку, отправлять как пользователь).

## OAuth Implicit Flow (для Standalone приложения)

### Шаг 1: Открыть в браузере/webview
```
https://oauth.vk.com/authorize?
  client_id={APP_ID}&
  display=page&
  redirect_uri=https://oauth.vk.com/blank.html&
  scope=messages,friends,offline,groups,notify,photos,docs,audio,video,wall&
  response_type=token&
  v=5.199
```

### Шаг 2: Пользователь логинится и разрешает доступ

### Шаг 3: После редиректа URL содержит
```
https://oauth.vk.com/blank.html#access_token=XXXX&expires_in=0&user_id=123
```

- `access_token` — сохраняем
- `expires_in=0` + scope `offline` = токен вечный
- `user_id` — ID пользователя

## Scope — права

| Scope | Доступ |
|---|---|
| `messages` | Чтение/отправка сообщений |
| `friends` | Список друзей |
| `groups` | Сообщества |
| `wall` | Стена |
| `photos`, `video`, `audio`, `docs` | Медиа |
| `notify` | Уведомления |
| `offline` | ⭐ **Вечный токен** — без истечения |
| `market` | Товары |
| `email` | Email пользователя |
| `phone` | Телефон |
| `notes` | Заметки |
| `pages` | Вики |
| `stats` | Статистика |
| `stories` | Истории |

Для ChatCenter достаточно: `messages,friends,offline,groups,notify,photos,docs,video,audio`.

## Реализация в Electron (наш случай)

```javascript
// В main.js — открываем отдельное окно для VK OAuth
const { BrowserWindow } = require('electron');

async function vkLogin(appId) {
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 650,
      height: 800,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    const scope = 'messages,friends,offline,groups,notify,photos,docs,video,audio';
    const authUrl = `https://oauth.vk.com/authorize?client_id=${appId}&display=page&redirect_uri=https://oauth.vk.com/blank.html&scope=${scope}&response_type=token&v=5.199`;

    authWindow.loadURL(authUrl);

    authWindow.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith('https://oauth.vk.com/blank.html')) {
        const hash = url.split('#')[1];
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        const userId = params.get('user_id');

        if (token) {
          authWindow.close();
          resolve({ token, userId });
        } else {
          reject(new Error('No token'));
        }
      }
    });

    authWindow.on('closed', () => reject(new Error('Auth cancelled')));
  });
}
```

## User token через прямую авторизацию (deprecated, только для тестов)

VK постепенно закрывает direct auth по логину/паролю — часто ловит captcha. НЕ использовать в production.

```javascript
// vk-io direct auth (deprecated)
import { DirectAuthorization } from '@vk-io/authorization';

const direct = new DirectAuthorization({
  app: APP_ID,
  key: APP_SECRET,
  login: 'username',
  phone: '+79001234567',
  password: 'password',
  scope: 'messages,friends,offline'
});

const response = await direct.run();
// response.token
```

## Хранение токена

- В Electron: `safeStorage.encryptString(token)` → в `settings.json`
- На Windows: используется DPAPI (Win32) — ключ привязан к пользователю ОС
- Восстановление: `safeStorage.decryptString(buffer)`

```javascript
import { safeStorage } from 'electron';

// Сохранить
const encrypted = safeStorage.encryptString(token);
await fs.writeFile('vk-token.bin', encrypted);

// Восстановить
const buffer = await fs.readFile('vk-token.bin');
const token = safeStorage.decryptString(buffer);
```

## Проверка токена

```javascript
const vk = new VK({ token });
try {
  const [me] = await vk.api.users.get({});
  console.log('Logged in as:', me.first_name, me.last_name);
} catch (e) {
  // e.code === 5 — token invalid
  console.log('Token invalid, need re-auth');
}
```

## Выход

```javascript
// Отозвать токен
await vk.api.account.setOffline();
// Удалить локально
await fs.unlink('vk-token.bin');
```

Либо через https://vk.com/settings?act=connected — пользователь сам может отозвать приложение.

## Group token (для бота сообщества)

1. Управление сообществом → **Работа с API** → **Создать ключ**
2. Выбрать права (сообщения, фото и т.д.)
3. Получить `access_token` группы
4. Использовать как обычно:
```javascript
const vk = new VK({ token: GROUP_TOKEN });
```

## Безопасность

- Токен = доступ ко всему аккаунту
- НЕ хранить в plain text
- НЕ логировать
- НЕ отправлять по сети без HTTPS
- Для отзыва — `vk.api.auth.logout()` или через веб-интерфейс VK
