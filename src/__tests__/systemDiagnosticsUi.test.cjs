const fs = require('fs')

const modal = fs.readFileSync('src/components/SystemDiagnosticsModal.jsx', 'utf8')
const floating = fs.readFileSync('src/components/DiagnosticsFloatingPanel.jsx', 'utf8')
const settings = fs.readFileSync('src/components/SettingsPanel.jsx', 'utf8')

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
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
