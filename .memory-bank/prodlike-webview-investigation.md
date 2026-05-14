# Закрыто: WebView в `start:prodlike` и слабый интернет

**Статус**: ✅ Закрыто как ложная тревога  
**Создано**: 7 мая 2026  
**Закрыто**: 8 мая 2026  
**Связано**: [`startup-load-investigation.md`](./startup-load-investigation.md)

---

## Итог

Проблема, что в `npm run start:prodlike` VK/MAX почти не грузились, а Telegram WebView работал медленнее, оказалась не багом приложения.

Фактическая причина: слабый интернет.

Вывод, что `start:prodlike` ломает WebView, был ложным. `start:prodlike` быстро запускает shell и грузит готовый `out/renderer/index.html`; скорость VK/MAX/Telegram WebView дальше зависит от сети, доступности сайтов и состояния WebView session/cache.

---

## Как работают режимы запуска

### `npm start`

- Dev-режим.
- Renderer грузится через Vite dev server: `http://localhost:5173`.
- Старт shell может быть медленнее, потому что Chromium тянет `/src/*`, CSS, hooks и компоненты отдельными dev-модулями.
- По проверке пользователя все мессенджеры при запуске работают.

### `npm run start:prodlike`

- Production-like режим.
- Сначала `npm run build`, потом `electron-vite preview`.
- Окно грузит готовый `out/renderer/index.html` через `loadFile`.
- Shell стартует быстро; WebView-вкладки всё равно ходят в интернет напрямую: `vk.com`, `web.max.ru`, `web.telegram.org`, `web.whatsapp.com`.

### `npm run dist:win`

- Собирает установщик.
- Установленная программа грузит `resources/app.asar/out/renderer/index.html`.
- По shell-стартапу ближе к `start:prodlike`.
- WebView-вкладки так же зависят от интернета и своих sessions.

---

## Как не сделать ложный вывод в будущем

Перед выводом “сломался режим запуска” сначала проверить сеть.

Мини-чеклист:

1. Открыть `https://vk.com/im`, `https://web.max.ru`, `https://web.telegram.org/k/` в обычном браузере.
2. Проверить, грузятся ли сайты быстро без ChatCenter.
3. Проверить, нет ли VPN/прокси/провайдера/роутера, который режет соединение.
4. Посмотреть лог установленной программы:

```text
C:\Users\Директор\AppData\Roaming\ЦентрЧатов\chatcenter.log
```

5. Если в логе есть `HTTP2_PING_FAILED`, `TIMEOUT`, `ERR_*`, долгая пауза между `did-start-loading` и `dom-ready`, сначала считать это сетевой проблемой, пока не доказано обратное.

---

## Что НЕ делать первым

🔴 Не чистить WebView partition без backup: можно выкинуть из аккаунтов.  
🔴 Не удалять Telegram/VK/MAX sessions из-за одного медленного запуска.  
🔴 Не менять код загрузки, пока обычный браузер на той же сети тоже тормозит.  
🔴 Не смешивать native Telegram API ошибки GramJS с обычными WebView-вкладками.

---

## Когда снова открывать расследование

Открывать заново только если:

- интернет нормальный;
- сайты быстро открываются в обычном браузере;
- `npm start` стабильно грузит VK/MAX быстро;
- `npm run start:prodlike` или установленная версия стабильно грузят те же сайты медленно;
- есть чистый лог с точным временем `did-start-loading`, `dom-ready`, `did-finish-load`, `did-fail-load`.
