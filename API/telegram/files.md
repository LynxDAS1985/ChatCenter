# Telegram Files — загрузка и скачивание

Источник: https://core.telegram.org/api/files

## Загрузка файлов

### Разбиение на части
- `part_size % 1024 = 0`
- `512KB % part_size = 0`
- Последняя часть может быть меньше
- Номер части `file_part` начинается с 0

### Методы
- `upload.saveBigFilePart` — для файлов > 10MB
- `upload.saveFilePart` — для файлов ≤ 10MB
- Сервер хранит части несколько минут-часов

### Оптимизация
- Локальные очереди (не `invokeAfterMsgs`) с X параллельными загрузками
- Несколько очередей на разных TCP-соединениях увеличивают пропускную способность

### Ошибки загрузки
- `FILE_PARTS_INVALID` — неправильное количество частей
- `FILE_PART_TOO_BIG` — > 512KB
- `FILE_PART_SIZE_CHANGED` — разный размер частей
- `FLOOD_PREMIUM_WAIT_X` — лимит для не-Premium

## Типы файлов (Input Constructors)

- `inputFile` — стандартная загрузка с MD5
- `inputFileBig` — большие файлы
- `inputEncryptedFile` — секретные чаты
- `inputSecureFile` — документы Telegram Passport
- `inputMediaUploadedPhoto` / `inputMediaUploadedDocument` — медиа с метаданными

## Скачивание файлов

### Метод: `upload.getFile` с параметром `InputFileLocation`

### Типы локации
- `inputPhotoFileLocation` — фото с thumbnails
- `inputDocumentFileLocation` — документы/видео
- `inputPeerPhotoFileLocation` — аватары профилей
- `inputEncryptedFileLocation` — секретные чаты
- `inputSecureFileLocation` — Passport

### Ограничения скачивания
**Без флага precise**:
- `offset` должен делиться на 4KB
- `limit` должен делиться на 4KB
- Все данные в одном 1MB chunk

**С флагом precise**:
- Делится на 1KB
- `limit` < 1MB

## Thumbnails

### Размеры (box-filter)
Типы `s`, `m`, `x`, `y`, `w` — от 100×100 до 2560×2560

### Размеры (crop)
Типы `a-d` — от 160×160 до 1280×1280

### Специальные
- `photoStrippedSize` (тип `i`) — сверхмалое JPG для мгновенного показа
- `photoPathSize` (тип `j`) — SVG path для стикеров

## Профили и фото чатов

### Методы
- `photos.uploadProfilePhoto` — пользователь/бот
- `messages.editChatPhoto` — группа
- `channels.editPhoto` — канал/супергруппа

### Возможности
- Анимированные видео (квадратный MPEG4, до 1080×1080)
- Профили на базе стикеров/эмодзи с фоном
- `video_start_ts` — выбор кадра старта

## Альбомы

`messages.sendMultiMedia` — до 10 элементов группой. Использовать `inputSingleMedia` обёртки.

## Видео

- Кастомные обложки: `video_cover`
- Стартовый timestamp: `video_timestamp`
- Авто-конвертация в несколько качеств для больших каналов

## Переиспользование файлов

Незащищённые медиа можно переотправлять без повторной загрузки через `inputMediaPhoto` / `inputMediaDocument`.

## Ошибки скачивания
- `FILE_REFERENCE_EXPIRED` / `FILE_REFERENCE_INVALID` — обновить file_reference
- `FILE_MIGRATE_X` — файл в DC X
- `FLOOD_WAIT_X` — ждать X секунд
- `LIMIT_INVALID` — неверный диапазон байтов

## Проверка целостности

`upload.getFileHashes` — SHA-256 хэши скачанных chunks.

## Web Files

Удалённые HTTP-файлы от inline-ботов: `upload.getWebFile`. Спецлокации:
- `inputWebFileGeoPointLocation` — превью карт
- `inputWebFileAudioAlbumThumbLocation` — обложки альбомов

## GramJS — высокоуровневые методы

```javascript
// Скачать медиа из сообщения
const buffer = await client.downloadMedia(message, {
  progressCallback: (rec, tot) => console.log(rec, "/", tot)
});

// Отправить файл
await client.sendFile(chatId, {
  file: "./document.pdf",
  caption: "Договор",
  forceDocument: true
});

// Отправить фото
await client.sendFile(chatId, {
  file: "./photo.jpg",
  caption: "Фото"
});

// Отправить альбом
await client.sendFile(chatId, {
  file: ["./1.jpg", "./2.jpg", "./3.jpg"],
  caption: "Альбом"
});
```
