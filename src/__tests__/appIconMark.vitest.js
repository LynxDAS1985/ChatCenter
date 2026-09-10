// v1.2.443: тесты знака приложения (shared/appIconMark.js) и его проводки.
//
// Зачем эти проверки: у приложения ДОЛГО не было своей иконки вовсе — в журнале сборки
// стояло «default Electron icon is used, reason=application icon is not set», а в трее
// был просто синий круг. Тесты сторожат, чтобы это не вернулось: файл иконки на месте,
// нужного размера, прописан в сборке, знак виден даже на 16 пикселях.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { drawMark, MARK } from '../../shared/appIconMark.js'
// v1.2.449: упаковка в файлы вынесена в appIconFiles.js (appIconMark.js перерос лимит 300)
import { encodePNG, markPNG, buildICO, ICO_SIZES } from '../../shared/appIconFiles.js'

/** Читает размер картинки прямо из заголовка PNG (ширина/высота лежат по смещению 16 и 20). */
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

/** Считает пиксели, близкие к заданному цвету (буфер RGBA). */
function countColor(rgba, [r, g, b], tol = 40) {
  let n = 0
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue
    if (Math.abs(rgba[i] - r) <= tol && Math.abs(rgba[i + 1] - g) <= tol && Math.abs(rgba[i + 2] - b) <= tol) n++
  }
  return n
}

describe('Цвета выбранного варианта «Лазурь»', () => {
  it('пузырь белый, полосы лазурные #38BDF8', () => {
    expect(MARK.bubble).toEqual([255, 255, 255])
    expect(MARK.bars).toEqual([56, 189, 248]) // #38BDF8
  })

  it('плитка тёмная (знак виден и на светлой, и на тёмной панели задач)', () => {
    for (const c of [...MARK.tileTop, ...MARK.tileBottom]) expect(c).toBeLessThan(60)
  })
})

describe('Рисунок знака', () => {
  it('буфер нужного размера для любых сторон', () => {
    for (const s of [16, 32, 64, 256]) {
      expect(drawMark({ size: s }).length).toBe(s * s * 4)
    }
  })

  it('порядок цветов rgba и bgra РАЗНЫЙ (Electron на Windows ждёт bgra)', () => {
    const rgba = drawMark({ size: 32, order: 'rgba' })
    const bgra = drawMark({ size: 32, order: 'bgra' })
    expect(rgba.length).toBe(bgra.length)
    // ищем лазурный пиксель: в rgba синий канал самый большой, в bgra он встанет первым
    let found = false
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] > 200 && rgba[i + 2] > 200 && rgba[i] < 120) {
        expect(bgra[i]).toBe(rgba[i + 2])
        expect(bgra[i + 2]).toBe(rgba[i])
        found = true
        break
      }
    }
    expect(found, 'лазурного пикселя не нашлось — знак нарисован неверно').toBe(true)
  })

  it('🔴 ГЛАВНОЕ: на 16 px видны И белый пузырь, И лазурные полосы', () => {
    // Именно это ломалось в первой попытке: при отступе 14% и тонкой линии знак
    // превращался в пятно. Проверяем не «на глаз», а по числу пикселей каждого цвета.
    const rgba = drawMark({ size: 16, order: 'rgba' })
    expect(countColor(rgba, MARK.bubble), 'белого пузыря не видно на 16 px').toBeGreaterThanOrEqual(8)
    expect(countColor(rgba, MARK.bars), 'лазурных полос не видно на 16 px').toBeGreaterThanOrEqual(6)
  })

  it('на 32 и 256 px обе части знака тоже на месте', () => {
    for (const s of [32, 256]) {
      const rgba = drawMark({ size: s, order: 'rgba' })
      expect(countColor(rgba, MARK.bubble)).toBeGreaterThan(s / 2)
      expect(countColor(rgba, MARK.bars)).toBeGreaterThan(s / 2)
    }
  })

  // v1.2.449: ПО УМОЛЧАНИЮ плитки БОЛЬШЕ НЕТ — фон прозрачный. В панели задач Windows
  // тёмный квадрат выглядел заплаткой на общем фоне (жалоба пользователя).
  it('🔴 ЛОВУШКА: по умолчанию фон ПРОЗРАЧНЫЙ, тёмная плитка не возвращается', () => {
    const s = 64
    const rgba = drawMark({ size: s, order: 'rgba' })
    const A = (x, y) => rgba[(y * s + x) * 4 + 3]
    // все четыре угла — полностью прозрачны
    for (const [x, y] of [[0, 0], [s - 1, 0], [0, s - 1], [s - 1, s - 1]]) {
      expect(A(x, y), `угол ${x},${y} должен быть прозрачным`).toBe(0)
    }
    let opaque = 0
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 200) opaque++
    expect(opaque).toBeGreaterThan(0)              // знак нарисован
    expect(opaque).toBeLessThan(s * s * 0.45)      // но фон НЕ залит
  })

  it('🔴 ЛОВУШКА: на прозрачном фоне у знака НЕТ тёмной кромки', () => {
    // Так было до v1.2.449: цвет полупрозрачных точек смешивался с цветом ПЛИТКИ,
    // и по краю знака оставался тёмный ободок. Теперь на краю меняется только
    // прозрачность, а цвет остаётся своим — значит тёмных точек быть не должно.
    const s = 64
    const rgba = drawMark({ size: s, order: 'rgba' })
    let dark = 0
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] === 0) continue
      if (rgba[i] < 45 && rgba[i + 1] < 45 && rgba[i + 2] < 45) dark++
    }
    expect(dark, 'найдены тёмные точки — вернулось смешивание с цветом плитки').toBe(0)
  })

  it('плитку можно попросить явно — тогда она закрашена почти целиком, углы скруглены', () => {
    const s = 64
    const rgba = drawMark({ size: s, order: 'rgba', tile: true })
    let opaque = 0
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 200) opaque++
    expect(opaque).toBeGreaterThan(s * s * 0.7)  // плитка есть
    expect(opaque).toBeLessThan(s * s)           // углы скруглены (не квадрат)
    expect(rgba[3]).toBeLessThan(60)             // левый верхний пиксель — прозрачный
  })

  it('🔴 ЛОВУШКА: знак увеличен, но НЕ обрезан краем ни на одном размере', () => {
    // Первая версия этой правки задала предел «на глаз» (1.12) и на 32 px срезала
    // левые концы полос: у них есть толщина, и половина её уходила за край.
    for (const size of [256, 128, 64, 48, 32, 16]) {
      const zoom = size <= 32 ? 1.2 : 1.3
      const buf = drawMark({ size, order: 'rgba', zoom })
      // столбец 0 и последний столбец: если знак вылез, кисть залила бы их плотно
      let leftEdge = 0, rightEdge = 0
      for (let y = 0; y < size; y++) {
        if (buf[(y * size + 0) * 4 + 3] > 250) leftEdge++
        if (buf[(y * size + size - 1) * 4 + 3] > 250) rightEdge++
      }
      expect(leftEdge, `size=${size}: знак прижат к левому краю — вероятен обрез`).toBeLessThan(size * 0.5)
      expect(rightEdge, `size=${size}: знак прижат к правому краю — вероятен обрез`).toBeLessThan(size * 0.5)
    }
  })

  it('увеличение реально работает на крупных размерах (+30%)', () => {
    const bbox = (o) => {
      const n = o.size
      const buf = drawMark({ order: 'rgba', ...o })
      let x0 = n, x1 = -1
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (buf[(y * n + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x }
      }
      return x1 - x0 + 1
    }
    const was = bbox({ size: 128, zoom: 1 })
    const now = bbox({ size: 128 })          // по умолчанию 1.3
    expect(now / was).toBeGreaterThan(1.25)
    expect(now / was).toBeLessThan(1.35)
  })

  it('без плитки знак прозрачный (вид для трея/мест со своим фоном)', () => {
    const rgba = drawMark({ size: 64, order: 'rgba', tile: false })
    let opaque = 0
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 200) opaque++
    expect(opaque).toBeLessThan(64 * 64 * 0.45) // залито только сам знак, фон пустой
  })
})

describe('Файл PNG собирается своими силами (без библиотек)', () => {
  it('подпись, размер в заголовке и завершающий блок на месте', () => {
    for (const s of [16, 32, 512]) {
      const png = markPNG(s)
      expect(png.slice(1, 4).toString('ascii')).toBe('PNG')
      expect(pngSize(png)).toEqual({ w: s, h: s })
      expect(png.slice(-8, -4).toString('ascii')).toBe('IEND')
      expect(png.includes(Buffer.from('IHDR'))).toBe(true)
      expect(png.includes(Buffer.from('IDAT'))).toBe(true)
    }
  })

  it('картинка сжимается (файл меньше сырых точек в разы)', () => {
    const s = 256
    const png = markPNG(s)
    expect(png.length).toBeLessThan(s * s * 4 / 4)
  })

  it('кодировщик принимает готовый буфер', () => {
    const s = 32
    const png = encodePNG(drawMark({ size: s, order: 'rgba' }), s)
    expect(pngSize(png)).toEqual({ w: s, h: s })
  })
})

describe('Файл иконки Windows (.ico) — ловушка на «серое пятно в панели задач»', () => {
  /** Разбор заголовка .ico — ТОТ ЖЕ порядок чтения, что у electron-builder (getIcoMaxSize). */
  function readIco(buf) {
    expect(buf.length).toBeGreaterThan(6)
    expect([buf[0], buf[1], buf[2], buf[3]]).toEqual([0, 0, 1, 0]) // подпись «это иконка»
    const count = buf.readUInt16LE(4)
    const items = []
    for (let i = 0; i < count; i++) {
      const o = 6 + i * 16
      items.push({
        size: buf[o] || 256,          // 0 в формате означает 256
        height: buf[o + 1] || 256,
        planes: buf.readUInt16LE(o + 4),
        bits: buf.readUInt16LE(o + 6),
        data: buf.slice(buf.readUInt32LE(o + 12), buf.readUInt32LE(o + 12) + buf.readUInt32LE(o + 8)),
      })
    }
    return items
  }

  it('🔴 ЛОВУШКА: внутри .ico лежат картинки, НАРИСОВАННЫЕ под каждый размер', () => {
    // Именно это и было сломано: electron-builder делал .ico УМЕНЬШЕНИЕМ одного большого PNG,
    // и на 16 точках от знака оставалась одна белая точка вместо сорока одной.
    // Сверяем побайтово: каждая картинка внутри файла = markPNG(этот размер).
    const items = readIco(buildICO())
    expect(items.map(i => i.size)).toEqual(ICO_SIZES)
    for (const it of items) {
      expect(it.data.equals(markPNG(it.size)), `картинка ${it.size}px внутри .ico не совпала с нарисованной`).toBe(true)
    }
  })

  it('заголовок читается так же, как его читает electron-builder, и размер ≥256', () => {
    const items = readIco(buildICO())
    expect(Math.max(...items.map(i => Math.max(i.size, i.height)))).toBeGreaterThanOrEqual(256)
    for (const it of items) {
      expect(it.planes).toBe(1)
      expect(it.bits).toBe(32)
      expect(it.data.slice(1, 4).toString('ascii')).toBe('PNG')
    }
  })

  it('размер 256 записан нулём — так велит формат', () => {
    const buf = buildICO([256, 32])
    expect(buf[6]).toBe(0)        // ширина первой картинки
    expect(buf[6 + 16]).toBe(32)  // ширина второй
  })

  it('готовый файл на диске совпадает с тем, что собирает код', () => {
    expect(fs.existsSync('build/icon.ico'), 'нет build/icon.ico — установщик возьмёт чужую иконку').toBe(true)
    expect(fs.readFileSync('build/icon.ico').equals(buildICO())).toBe(true)
  })

  it('в настройках сборки указан именно .ico (иначе он сам уменьшит PNG)', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    expect(pkg.build?.win?.icon).toBe('build/icon.ico')
  })

  it('свой список размеров тоже собирается', () => {
    const items = readIco(buildICO([48, 16]))
    expect(items.map(i => i.size)).toEqual([48, 16])
  })
})

describe('Сбой рисования не валит запуск (ловушка на «окно не откроется»)', () => {
  it('значок окна рисуется ДО создания окна и под защитой, с записью в журнал', () => {
    const src = fs.readFileSync('main/utils/windowManager.js', 'utf8')
    // рисование вынесено из списка настроек окна — иначе ошибка убивала создание окна
    expect(src).not.toMatch(/icon: nativeImage\.createFromBuffer/)
    expect(src).toMatch(/try \{[\s\S]{0,200}nativeImage\.createFromBuffer\(drawMark/)
    expect(src).toMatch(/wlog\(`icon drawn 128px in/)      // успех виден в журнале
    expect(src).toMatch(/wlog\(`icon FAILED/)               // и сбой тоже
    expect(src).toMatch(/icon: appIcon,/)                   // не получилось → окно без значка
  })

  it('значок трея тоже защищён и пишет в журнал', () => {
    const src = fs.readFileSync('main/utils/overlayIcon.js', 'utf8')
    expect(src).toMatch(/catch \(e\)[\s\S]{0,600}Buffer\.alloc\(size \* size \* 4\)/)
    expect(src).toMatch(/console\.warn\(`\[tray\] знак нарисовать не удалось/)
    expect(src).toMatch(/console\.log\(`\[tray\] значок трея готов/)
  })
})

describe('Файлы иконки на диске', () => {
  it('🔴 build/icon.png есть и НЕ МЕНЬШЕ 256×256', () => {
    // Требование electron-builder (его же код, iconConverter.js): «Icon must be at least
    // 256x256 pixels». Если файл пропадёт или уменьшится — вернётся «application icon is not set».
    expect(fs.existsSync('build/icon.png'), 'нет build/icon.png — иконки у приложения снова не будет').toBe(true)
    const { w, h } = pngSize(fs.readFileSync('build/icon.png'))
    expect(w).toBeGreaterThanOrEqual(256)
    expect(h).toBeGreaterThanOrEqual(256)
  })

  it('иконка лежит в папке с иконками других приложений', () => {
    expect(fs.existsSync('PNG/chatcenter-icon.png')).toBe(true)
    expect(pngSize(fs.readFileSync('PNG/chatcenter-icon.png'))).toEqual({ w: 256, h: 256 })
    // соседи по папке — иконки мессенджеров, значит папка та самая
    expect(fs.existsSync('PNG/max-icon.png')).toBe(true)
  })

  it('мелкие размеры сохранены отдельными файлами', () => {
    expect(pngSize(fs.readFileSync('PNG/chatcenter-icon-32.png'))).toEqual({ w: 32, h: 32 })
    expect(pngSize(fs.readFileSync('PNG/chatcenter-icon-16.png'))).toEqual({ w: 16, h: 16 })
  })

  it('иконка ПРОПИСАНА в настройках сборки и путь существует', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    expect(pkg.build?.win?.icon, 'build.win.icon не задан → electron-builder поставит свою иконку').toBeTruthy()
    expect(fs.existsSync(pkg.build.win.icon)).toBe(true)
  })

  it('скрипт делает и .ico, и картинки, и больше не пишет неиспользуемый файл', () => {
    const src = fs.readFileSync('scripts/make-app-icon.cjs', 'utf8')
    expect(src).toContain('build/icon.ico')
    expect(src).toContain('buildICO()')
    // v1.2.444: build/icon-256.png никем не использовался — убран (правило «за собой убирай»)
    expect(src).not.toContain('icon-256.png')
    expect(fs.existsSync('build/icon-256.png')).toBe(false)
  })

  it('скрипт генерации на месте (иконку можно перерисовать одной командой)', () => {
    const src = fs.readFileSync('scripts/make-app-icon.cjs', 'utf8')
    expect(src).toContain('build/icon.png')
    expect(src).toContain('PNG/chatcenter-icon.png')
    expect(src).toContain('appIconMark.js') // рисунок берётся из единого источника
  })
})

describe('Проводка: трей, окно, экраны загрузки', () => {
  it('трей рисует ЗНАК, а не прежний синий круг', () => {
    const src = fs.readFileSync('main/utils/overlayIcon.js', 'utf8')
    expect(src).toContain("import { drawMark } from '../../shared/appIconMark.js'")
    // v1.2.449: у трея появился свой множитель размера (zoom), поэтому проверяем
    // сам вызов и его обязательные части, а не дословную строку.
    expect(src).toMatch(/createTrayBadgeIcon[\s\S]{0,600}drawMark\(\{[^}]*size[^}]*order: 'bgra'[^}]*\}\)/)
    expect(src).toMatch(/drawMark\(\{[^}]*zoom: 1\.2[^}]*\}\)/)  // трей просили крупнее на 20%
    // старый круг телеграмного цвета должен уйти
    expect(src).not.toContain('setPixelBGRA(buf, size, x, y, 42, 171, 238)')
  })

  it('у окна приложения задан значок', () => {
    const src = fs.readFileSync('main/utils/windowManager.js', 'utf8')
    // v1.2.444: рисование вынесено ИЗ списка настроек окна (было `icon: nativeImage...`),
    // потому что ошибка там убивала создание окна. Проверяем связку по частям.
    expect(src).toMatch(/nativeImage\.createFromBuffer\(drawMark\(/)
    expect(src).toMatch(/icon: appIcon,/)
  })

  it('знак есть на стартовой заставке, полосы «влетают»', () => {
    const html = fs.readFileSync('index.html', 'utf8')
    expect(html).toContain('cc-splash__mark')
    expect(html).toContain('#38bdf8')                 // лазурные полосы
    expect(html).toMatch(/M31 44 V57 L43 44 Z/)       // хвостик реплики — та же геометрия
    expect(html).toContain('@keyframes ccBarIn')      // анимация загрузки
    expect(html).toMatch(/prefers-reduced-motion[\s\S]{0,200}cc-bar/) // уважаем «без анимаций»
  })

  it('знак есть на экране загрузки чатов, надпись не потеряна', () => {
    const jsx = fs.readFileSync('src/native/components/ChatListLoadingSplash.jsx', 'utf8')
    expect(jsx).toContain('native-chatload-mark')
    expect(jsx).toMatch(/M31 44 V57 L43 44 Z/)
    expect(jsx).toContain('ЦентрЧатов')
    const css = fs.readFileSync('src/native/styles-chatlist-loading.css', 'utf8')
    // 🔴 ловушка: градиент текста НЕ должен висеть на общем блоке — иначе он делает
    // прозрачным и сам знак (color: transparent наследуется внутрь)
    expect(css).toContain('.native-chatload-brandtext')
    expect(css).toMatch(/\.native-chatload-brand \{[^}]*display: flex/)
    expect(css).not.toMatch(/\.native-chatload-brand \{[^}]*color: transparent/)
  })

  it('геометрия знака одинаковая в трёх местах (иначе значки разъедутся)', () => {
    const mark = fs.readFileSync('shared/appIconMark.js', 'utf8')
    const html = fs.readFileSync('index.html', 'utf8')
    const jsx = fs.readFileSync('src/native/components/ChatListLoadingSplash.jsx', 'utf8')
    // пузырь: одни и те же числа
    expect(mark).toMatch(/x: 22, y: 10, w: 38, h: 34, r: 11/)
    for (const src of [html, jsx]) {
      expect(src).toMatch(/x="22" y="10" width="38" height="34" rx="11"/)
    }
    // полосы: одни и те же координаты
    expect(mark).toMatch(/BAR_X0 = 3, BAR_X1 = 17/)
    for (const src of [html, jsx]) {
      expect(src).toMatch(/M3 18 H17/)
      expect(src).toMatch(/M3 46 H17/)
    }
  })
})
