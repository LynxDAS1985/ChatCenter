const fs = require('fs')

const modal = fs.readFileSync('src/components/SystemDiagnosticsModal.jsx', 'utf8')
const floating = fs.readFileSync('src/components/DiagnosticsFloatingPanel.jsx', 'utf8')
const settings = fs.readFileSync('src/components/SettingsPanel.jsx', 'utf8')
const webviewSetup = fs.readFileSync('src/utils/webviewSetup.js', 'utf8')
const consoleHandler = fs.readFileSync('src/utils/consoleMessageHandler.js', 'utf8')
const diagnosticsSession = fs.readFileSync('src/utils/diagnosticsSession.js', 'utf8')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 Тест UI диагностики\n')

test('Большая диагностика содержит один блок управления записью и отчётом', () => {
  ;['Включить запись', 'Отключить и сохранить', 'Свернуть в фон', 'Сохранить для ИИ', 'Скопировать для ИИ', 'Очистить экран'].forEach(text => {
    assert(modal.includes(text), `нет кнопки: ${text}`)
  })
  assert(!modal.includes('Отчёт для разбора'), 'дублирующий блок отчёта должен быть убран')
})

test('Большая диагностика подгружает последний сохранённый отчёт', () => {
  assert(modal.includes('app:diagnostics-read-report'), 'модалка должна читать сохранённый отчёт')
  assert(modal.includes('Последний сохранённый отчёт загружен'), 'пользователь должен видеть что отчёт загружен')
  assert(modal.includes('visibleSessionEvents'), 'live-лента должна показывать текущую или сохранённую сессию')
})

test('Глубокая WebView проверка больше не переключается вручную', () => {
  assert(modal.includes('Глубокая WebView-проверка включена всегда'), 'в большой модалке должно быть понятное состояние')
  assert(floating.includes('Глубокая WebView включена всегда'), 'в маленькой панели должно быть понятное состояние')
  assert(!modal.includes('toggleDeep'), 'большая модалка не должна вызывать toggleDeep')
  assert(!floating.includes('onToggleDeep'), 'маленькая панель не должна принимать onToggleDeep')
})

test('Маленькая панель умеет снова запустить запись после стопа', () => {
  assert(floating.includes('onStart'), 'нужен callback запуска')
  assert(floating.includes('Запустить'), 'нужна кнопка запуска')
  assert(floating.includes('Закрыть'), 'нужна кнопка полного закрытия')
})

test('Настройки показывают статус записи рядом с кнопкой диагностики', () => {
  assert(settings.includes('Статус записи'), 'нет подписи статуса')
  assert(settings.includes('diagLabel'), 'нет вычисления статуса')
  assert(settings.includes('diagnosticsStatus'), 'SettingsPanel не принимает статус')
  assert(settings.includes('savedDiagnosticsCount'), 'SettingsPanel должен помнить счётчик последнего сохранённого отчёта')
  assert(settings.includes('app:diagnostics-read-report'), 'SettingsPanel должен читать последний diagnostics report')
  assert(settings.includes('последний отчёт'), 'индикатор должен объяснять, что число взято из сохранённого отчёта')
})

test('MAX sidebar диагностика не режет полный decision payload', () => {
  assert(webviewSetup.includes('keepFullTraceText') && webviewSetup.includes('max-sidebar'), 'trace buffer должен хранить полный max-sidebar text')
  assert(webviewSetup.includes('fullLogText') && webviewSetup.includes('detailLimit'), 'chatcenter.log должен писать полный max-sidebar detail')
  assert(consoleHandler.includes('diagDetail') && consoleHandler.includes('max-sidebar'), 'console handler должен переносить полный __CC_DIAG__ в detail')
  assert(diagnosticsSession.includes('maxLen') && diagnosticsSession.includes('max-sidebar'), 'diagnostics session должна держать длинный max-sidebar payload')
  assert(diagnosticsSession.includes("`${row?.detail || ''} ${row?.text || ''}`"), 'filter должен проверять detail и text одновременно')
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
