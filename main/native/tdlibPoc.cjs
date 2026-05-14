// v0.89.0 / TDLib Migration Etap 0 — minimum smoke-test.
//
// Цель: убедиться что `tdl` + `prebuilt-tdlib` загружаются в node CLI без ошибок,
// libtdjson возвращает версию, инстанс клиента создаётся (БЕЗ реальной авторизации).
//
// Запуск: node main/native/tdlibPoc.cjs
//
// Что НЕ делается: реальное подключение к Telegram, login flow, реальные запросы.
// Это отдельный этап (Этап 0.5 — Electron + smoke login через UI приложения).
//
// Файл одноразовый, удаляется при переходе в Этап 1 (абстракция backend).

const path = require('node:path')

function main() {
  console.log('=== TDLib POC ===')

  // 1. prebuilt-tdlib — путь к нативной библиотеке (libtdjson.dll на Windows)
  let prebuiltLib
  try {
    prebuiltLib = require('prebuilt-tdlib')
    console.log(`✅ prebuilt-tdlib загружен`)
    console.log(`   getTdjson() = ${prebuiltLib.getTdjson()}`)
    const libPath = prebuiltLib.getTdjson()
    const fs = require('node:fs')
    if (!fs.existsSync(libPath)) {
      throw new Error(`Library file НЕ найден: ${libPath}`)
    }
    const size = fs.statSync(libPath).size
    console.log(`   Размер библиотеки: ${(size / 1024 / 1024).toFixed(1)} МБ`)
  } catch (e) {
    console.error('❌ prebuilt-tdlib FAILED:', e.message)
    process.exit(1)
  }

  // 2. tdl — Node.js обёртка
  let tdl
  try {
    tdl = require('tdl')
    console.log(`✅ tdl загружен`)
    console.log(`   tdl.configure доступен: ${typeof tdl.configure === 'function'}`)
    console.log(`   tdl.createClient доступен: ${typeof tdl.createClient === 'function'}`)
  } catch (e) {
    console.error('❌ tdl FAILED:', e.message)
    process.exit(1)
  }

  // 3. Связка tdl + prebuilt-tdlib — конфигурация
  try {
    tdl.configure({ tdjson: prebuiltLib.getTdjson() })
    console.log(`✅ tdl.configure() с prebuilt путём — OK`)
  } catch (e) {
    console.error('❌ tdl.configure FAILED:', e.message)
    process.exit(1)
  }

  // 4. Создание инстанса клиента (без подключения — просто проверка что объект создаётся)
  try {
    const client = tdl.createClient({
      apiId: 8392940,                          // наш Telegram api_id (из src/native/config.js)
      apiHash: '33a9605b6f86a176e240cc141e864bf5',
      tdlibParameters: {
        application_version: 'ChatCenter-POC',
        device_model: 'POC',
        system_language_code: 'ru',
        database_directory: path.join(__dirname, '..', '..', '.tdlib-poc-tmp'),
        files_directory: path.join(__dirname, '..', '..', '.tdlib-poc-tmp', 'files'),
        use_message_database: true,
        use_file_database: false,
        use_chat_info_database: true,
        use_secret_chats: false,
      },
    })
    console.log(`✅ tdl.createClient() — клиент создан`)
    console.log(`   typeof client.invoke: ${typeof client.invoke}`)
    console.log(`   typeof client.on: ${typeof client.on}`)
    console.log(`   typeof client.close: ${typeof client.close}`)

    // НЕ подключаемся к серверу — закрываем клиент сразу
    // client.close() запускает full shutdown, что вызывает реальное соединение для logout.
    // Для smoke-теста этого делать не нужно — просто завершаем процесс.
    console.log(`✅ Клиент создан и НЕ подключался к серверу — корректно для POC`)
  } catch (e) {
    console.error('❌ tdl.createClient FAILED:', e.message)
    process.exit(1)
  }

  console.log('')
  console.log('=== POC ПРОШЁЛ ===')
  console.log('TDLib загружается, инстанс клиента создаётся.')
  console.log('Этап 0 завершён, можно переходить к Этапу 1 (абстракция backend).')

  // Завершаем процесс (не ждём async TDLib операций — они и не запускались)
  process.exit(0)
}

main()
