// v1.2.454 — СТРАЖ РАСКЛАДКИ: «панели не уезжают за край окна».
//
// ЖАЛОБА (11 сентября 2026, скриншот): правая панель (ИИ) была срезана краем окна —
// «окно чата уехало за границы».
//
// ПРИЧИНА (доказана чтением кода, а не догадкой): в главном ряду приложения
// [App.jsx] стоят рядом — боковая полоса, СЕРЕДИНА (растягивается), разделитель
// и панель ИИ. Панель ИИ сжиматься НЕ умеет по построению (`shrink-0` + жёсткая
// ширина из настроек, 458 точек в жалобе), а растягивающийся блок по правилам
// вёрстки не сжимается меньше своего содержимого, пока ему это ПРЯМО не разрешить
// (`min-width: 0`). Сам ряд помечен «лишнее срезать» (`overflow-hidden`) → лишнее
// уезжало за край МОЛЧА, без полосы прокрутки и без ошибки в журнале.
//
// Правка микроскопическая (три «можно сжиматься») — именно поэтому её легко
// потерять при любой соседней правке вёрстки, и именно поэтому нужен страж:
// обратная поломка снова НИЧЕГО не сломает заметно, просто панель уедет за край.
//
// Почему .cjs, а не .vitest: правка живёт в .jsx, но проверка нужна ВСЕГДА,
// в том числе когда меняли только .js — так же устроен transparentWindowGuard.

const fs = require('fs')
const path = require('path')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8')

console.log('\n📐 Страж раскладки: панели не уезжают за край окна (v1.2.454)\n')

// Метка → (файл, как в нём записывается «можно сжиматься»).
// Метки `data-cc-layout` носят двойную службу: по ним же измеритель раскладки
// в boot-probe.js находит блоки, чтобы написать в журнал «кто не влез».
const SHRINKABLE = [
  { mark: 'middle', file: 'src/App.jsx', style: 'min-w-0', human: 'средняя область главного окна' },
  { mark: 'inbox-row', file: 'src/native/modes/InboxMode.jsx', style: 'minWidth: 0', human: 'ряд «список чатов + переписка»' },
  { mark: 'messages', file: 'src/native/modes/InboxMode.jsx', style: 'minWidth: 0', human: 'область переписки' },
]

for (const { mark, file, style, human } of SHRINKABLE) {
  test(`${human} (${mark}) умеет сжиматься`, () => {
    const src = read(file)
    const re = new RegExp(`<div[^>]*data-cc-layout="${mark}"[^>]*>`)
    const m = src.match(re)
    assert(m, `в ${file} не найден блок с меткой data-cc-layout="${mark}".\n` +
      '     Метку убрали? Тогда измеритель раскладки перестал видеть этот блок —\n' +
      '     верни метку или обнови этот страж вместе с boot-probe.js.')
    // Разрешение сжиматься может стоять и в className, и в style — ищем в целом теге.
    assert(m[0].includes(style), `у блока «${human}» пропало «${style}».\n` +
      '     Это ТА САМАЯ правка v1.2.454. Без неё растягивающийся блок не уступает\n' +
      '     место, а панель ИИ сжиматься не умеет → правая панель уезжает за край окна\n' +
      '     и молча срезается (ряд помечен overflow-hidden). Жалоба от 11.09.2026.')
  })
}

test('панель ИИ по-прежнему НЕ умеет сжиматься — значит уступать должна середина', () => {
  const src = read('src/components/AISidebar.jsx')
  const m = src.match(/data-cc-layout="ai-panel"[\s\S]{0,200}/)
  assert(m, 'в AISidebar.jsx пропала метка data-cc-layout="ai-panel" (её читает измеритель).')
  assert(/shrink-0/.test(m[0]),
    'панель ИИ перестала быть «несжимаемой» (shrink-0).\n' +
    '     Это не поломка сама по себе, но исходное условие фикса изменилось:\n' +
    '     перечитай причину в комментарии этого стража и в features.md v1.2.454.')
})

test('главный ряд всё ещё срезает лишнее — поэтому поломка была бы незаметной', () => {
  const src = read('src/App.jsx')
  const m = src.match(/<div[^>]*data-cc-layout="row"[^>]*>/)
  assert(m, 'в App.jsx пропала метка data-cc-layout="row".')
  assert(/overflow-hidden/.test(m[0]),
    'у главного ряда убрали overflow-hidden. Тогда лишнее больше не срезается, а\n' +
    '     даёт прокрутку всего окна — это другое поведение, проверь вид руками.')
})

test('измеритель раскладки на месте и реально запускается', () => {
  const probe = read('src/boot-probe.js')
  assert(/function ccLayoutProbe/.test(probe), 'функция измерителя ccLayoutProbe удалена.')
  assert(/window\.__ccLayoutProbe\s*=\s*ccLayoutProbe/.test(probe),
    'измеритель не выставлен в window.__ccLayoutProbe — руками его уже не позвать.')
  assert(/setTimeout\(\s*\(\)\s*=>\s*ccLayoutProbe\(/.test(probe),
    'измеритель объявлен, но НИКТО его не вызывает — в журнал ничего не попадёт.\n' +
    '     Ровно такую «немую» правку ловит страж sharedWiring для общего кода.')
  assert(/__ccStartupMark\(/.test(probe),
    'измеритель пишет не в журнал приложения — в renderer запрещён console.*,\n' +
    '     запись обязана идти через __ccStartupMark (он шлёт app:log).')
})

test('каждая метка, которую ищет измеритель, есть в коде интерфейса', () => {
  const probe = read('src/boot-probe.js')
  const marks = [...probe.matchAll(/data-cc-layout="([a-z-]+)"/g)].map(m => m[1])
  assert(marks.length >= 5, 'измеритель почти ничего не измеряет — проверь его список блоков.')
  const ui = ['src/App.jsx', 'src/native/modes/InboxMode.jsx', 'src/components/AISidebar.jsx'].map(read).join('\n')
  for (const mark of marks) {
    assert(ui.includes(`data-cc-layout="${mark}"`),
      `измеритель ищет блок «${mark}», а в интерфейсе такой метки НЕТ →\n` +
      `     в журнале навсегда будет «${mark}=нет» вместо чисел (тихая дыра в проверке).`)
  }
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) {
  console.log('\n❌ Защита раскладки сломана: панели снова могут уехать за край окна,')
  console.log('   и увидеть это можно будет только глазами на скриншоте.')
  process.exit(1)
}
