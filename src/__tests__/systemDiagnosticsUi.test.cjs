const fs = require('fs')

const modal = fs.readFileSync('src/components/SystemDiagnosticsModal.jsx', 'utf8')
const floating = fs.readFileSync('src/components/DiagnosticsFloatingPanel.jsx', 'utf8')
const settings = fs.readFileSync('src/components/SettingsPanel.jsx', 'utf8')
const webviewSetup = fs.readFileSync('src/utils/webviewSetup.js', 'utf8')
const consoleHandler = fs.readFileSync('src/utils/consoleMessageHandler.js', 'utf8')
const diagnosticsSession = fs.readFileSync('src/utils/diagnosticsSession.js', 'utf8')
const diagnosticsTargets = fs.readFileSync('src/utils/diagnosticsTargets.js', 'utf8')
const diagnosticsHook = fs.readFileSync('src/hooks/useDiagnosticsSession.js', 'utf8')
const webviewDiagnostics = fs.readFileSync('src/utils/webviewDiagnostics.js', 'utf8')
const app = fs.readFileSync('src/App.jsx', 'utf8')
const systemDiagnostics = fs.readFileSync('src/utils/systemDiagnostics.js', 'utf8')
const selectedDeepCheck = fs.readFileSync('src/utils/runSelectedDiagnosticsDeepCheck.js', 'utf8')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 Тест UI диагностики\n')

test('Большая диагностика содержит один блок управления записью и отчётом', () => {
  ;['Что диагностируем', 'Включить запись', 'Отключить и сохранить', 'Свернуть в фон', 'Сохранить для ИИ', 'Скопировать для ИИ', 'Очистить экран'].forEach(text => {
    assert(modal.includes(text), `нет кнопки: ${text}`)
  })
  assert(modal.includes('<select') && modal.includes('chooseTargetId'), 'выбор цели должен быть компактным выпадающим списком рядом с запуском')
  assert(!modal.includes('targetBtn'), 'полный список карточек целей диагностики должен быть убран')
  assert(!modal.includes('Отчёт для разбора'), 'дублирующий блок отчёта должен быть убран')
  assert(!modal.includes('Обновить снимок'), 'ручная кнопка снимка не нужна при фоновой диагностике')
  assert((modal.match(/Свернуть в фон/g) || []).length <= 2, 'Свернуть в фон не должно дублироваться как две кнопки')
  assert(modal.includes('Автообновление включено'), 'пользователь должен видеть, что запись обновляется автоматически')
  assert(modal.includes('Очистить экран, не логи'), 'кнопка очистки должна объяснять, что общие логи не трогает')
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
  assert(floating.includes('Стоп и закрыть'), 'нужна понятная кнопка полного закрытия')
  assert(floating.includes('slice(-3)'), 'маленькая панель должна показывать короткую live-ленту без перегруза')
})

test('Настройки не показывают отдельную плашку статуса диагностики', () => {
  assert(!settings.includes('Статус записи'), 'старую плашку статуса нужно убрать из настроек')
  assert(!settings.includes('diagLabel'), 'старый вычисляемый статус не должен оставаться')
  assert(!settings.includes('diagnosticsStatus'), 'SettingsPanel больше не должен принимать diagnosticsStatus')
  assert(!settings.includes('savedDiagnosticsCount'), 'SettingsPanel не должен хранить отдельный счётчик отчёта')
  assert(settings.includes('Диагностика системы'), 'кнопка открытия диагностики должна остаться')
})

test('Диагностика выбирает конкретную вкладку и сохраняет target в отчёт', () => {
  assert(modal.includes('diagnosticsTargets'), 'модалка должна получать список диагностируемых вкладок')
  assert(modal.includes('selectedTarget'), 'модалка должна знать выбранную цель')
  assert(modal.includes('diagnosticsTargetTitle'), 'модалка должна показывать цель отчёта')
  assert(diagnosticsSession.includes('diagnosticsTarget'), 'JSON-отчёт должен иметь верхний diagnosticsTarget')
  assert(diagnosticsSession.includes('diagnosticsSession') && diagnosticsSession.includes('target,'), 'diagnosticsSession должен сохранять target')
  assert(diagnosticsSession.includes('sections') && diagnosticsSession.includes('messengerSpecific'), 'отчёт должен делиться на секции выбранного мессенджера')
  assert(diagnosticsTargets.includes('buildDiagnosticsTargets'), 'нужен построитель списка целей диагностики')
  assert(diagnosticsTargets.includes('native_api'), 'в списке целей должен быть API-режим ЦентрЧатов')
})

test('MAX sidebar диагностика не режет полный decision payload', () => {
  assert(webviewSetup.includes('keepFullTraceText') && webviewSetup.includes('max-sidebar'), 'trace buffer должен хранить полный max-sidebar text')
  assert(webviewSetup.includes('fullLogText') && webviewSetup.includes('detailLimit'), 'chatcenter.log должен писать полный max-sidebar detail')
  assert(consoleHandler.includes('diagDetail') && consoleHandler.includes('max-sidebar'), 'console handler должен переносить полный __CC_DIAG__ в detail')
  assert(diagnosticsSession.includes('maxLen') && diagnosticsSession.includes('max-sidebar'), 'diagnostics session должна держать длинный max-sidebar payload')
  assert(diagnosticsSession.includes("`${row?.detail || ''} ${row?.text || ''}`"), 'filter должен проверять detail и text одновременно')
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
test('VK live diagnostics uses selected WebView deep-check path', () => {
  assert(diagnosticsHook.includes('deepCheckRef.current(current.target)'), 'background diagnostics must pass selected target to deep check')
  assert(app.includes('runSelectedDiagnosticsDeepCheck') && selectedDeepCheck.includes('const targetId = target?.tabId || target?.id') && selectedDeepCheck.includes('runDomProbe(webview, targetId, traceNotif)'), 'App must deep-probe the selected WebView, not only problematic connections')
  assert(webviewDiagnostics.includes('export function runVkFullProbe') && webviewDiagnostics.includes('__CC_DIAG__vkFull'), 'VK full snapshot must be emitted through console-message diagnostics')
  assert(webviewDiagnostics.includes('containerSelector') && webviewDiagnostics.includes('outgoing') && webviewDiagnostics.includes('header') && webviewDiagnostics.includes('sidebar'), 'vkFull must include container, outgoing flag, header/avatar and sidebar evidence')
  assert(webviewDiagnostics.includes('outgoingEvidence') && webviewDiagnostics.includes('classBroadOutOwnSelfSent') && webviewDiagnostics.includes('authorFromMessage'), 'vkFull must explain outgoing detection and message author evidence')
})

test('VK diagnostic payload is kept full in report pipeline', () => {
  assert(webviewSetup.includes('VK-DIAG|vkFull'), 'webviewSetup must keep full VK diagnostic text')
  assert(diagnosticsSession.includes('VK-DIAG|vkFull'), 'diagnosticsSession must keep VK diagnostic events visible')
  assert(systemDiagnostics.includes('vkfull'), 'systemDiagnostics must classify vkFull as WebView')
})

test('Diagnostics floating panel keeps long payload inside scrollable event area', () => {
  assert(floating.includes('eventList') && floating.includes('maxHeight: 260') && floating.includes("overflowY: 'auto'"), 'floating panel must cap live event list height')
  assert(floating.includes('eventText') && floating.includes("overflowWrap: 'anywhere'") && floating.includes("wordBreak: 'break-word'"), 'long diagnostic payload must wrap inside one event')
  assert(floating.includes('style={css.eventList}') && floating.includes('style={css.eventText}'), 'floating panel must apply bounded styles to live events')
  assert(modal.includes("overflowWrap: 'anywhere'") && modal.includes("wordBreak: 'break-word'"), 'large modal mono text must not stretch layout horizontally')
})

console.log('\nDiagnostics UI result: ' + passed + ' passed / ' + failed + ' failed / ' + (passed + failed) + ' total')
if (failed > 0) process.exit(1)
