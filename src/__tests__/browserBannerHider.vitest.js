// v1.2.434: тест «прятальщика плашек ОБНОВИТЕ БРАУЗЕР».
//
// ЛОВУШКИ НА РЕАЛЬНЫЙ ПРОВАЛ (чёрный экран веб-МАКС):
//  🔴 №1 — коробка во ВЕСЬ ЭКРАН со словами внутри ОБЯЗАНА остаться видимой.
//          Раньше именно так пряталось всё приложение целиком: textContent
//          корня содержит текст всей переписки, детей у корня меньше 20 →
//          условие срабатывало → display:none на приложении → чёрный экран
//          при полном DOM (в журнале контейнер чата отдавал 0,0,0x0).
//  🔴 №2 — ДЛИННЫЙ текст (переписка со словом «браузер») → не прячем.
//  🟡 №3 — элемент с нулевыми размерами (скрыт родителем / ещё не разложен)
//          → не трогаем: иначе наш инлайн display:none остался бы на нём
//          навсегда, даже когда родитель снова покажется.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  bannerVerdict,
  buildBannerHiderScript,
  BANNER_MAX_TEXT,
  BANNER_MAX_HEIGHT,
  BANNER_MAX_AREA_RATIO,
  BANNER_MAX_CHILDREN,
} from '../../shared/browserBannerHider.js'

const WIN = { innerWidth: 1000, innerHeight: 800 }

/** Поддельный элемент: текст, размеры, число детей */
function fake(text, width, height, kids = 0) {
  return {
    tagName: 'DIV',
    textContent: text,
    children: { length: kids },
    style: {},
    getBoundingClientRect: () => ({ width, height }),
  }
}

describe('Решение «это плашка браузера?» (bannerVerdict)', () => {
  it('слов нет → элемент нас не касается', () => {
    expect(bannerVerdict(fake('Привет, как дела?', 900, 40), WIN)).toBe('')
    expect(bannerVerdict(null, WIN)).toBe('')
  })

  it('настоящая плашка (короткая, невысокая) → прячем', () => {
    expect(bannerVerdict(fake('Обновите браузер для корректной работы', 900, 48), WIN)).toBe('ok')
    expect(bannerVerdict(fake('Ваш браузер устарел', 900, 60), WIN)).toBe('ok')
    expect(bannerVerdict(fake('Please update your browser', 900, 44), WIN)).toBe('ok')
  })

  it('🔴 ЛОВУШКА №1: коробка во ВЕСЬ ЭКРАН со словами → НЕ прячем (это был чёрный экран МАКС)', () => {
    // корень приложения: 1000×800 при окне 1000×800, детей 4 — ровно случай веб-МАКС
    const v = bannerVerdict(fake('Обновите браузер', 1000, 800, 4), WIN)
    expect(v).not.toBe('ok')
    expect(v).toContain('skip:')
    // отсекается предохранителем высоты (срабатывает раньше площади) — причина видна в журнале
    expect(v).toBe('skip:высота-800')
    // широкая, но невысокая коробка на пол-экрана — отсекается уже по площади
    expect(bannerVerdict(fake('Обновите браузер', 1000, 190), { innerWidth: 1000, innerHeight: 500 }))
      .toContain('skip:площадь-')
  })

  it('🔴 ЛОВУШКА №2: длинная переписка со словами внутри → НЕ прячем', () => {
    const long = 'обновите пожалуйста браузер ' + 'текст сообщения. '.repeat(60)
    expect(long.length).toBeGreaterThan(BANNER_MAX_TEXT)
    expect(bannerVerdict(fake(long, 900, 40), WIN)).toContain('skip:текст-')
  })

  it('🟡 ЛОВУШКА №3: нулевые размеры (скрыт родителем) → не трогаем', () => {
    expect(bannerVerdict(fake('Обновите браузер', 0, 0), WIN)).toBe('skip:не-отрисован')
    // элемента без замера размеров тоже не трогаем
    const noRect = { tagName: 'DIV', textContent: 'Обновите браузер', children: { length: 0 }, style: {} }
    expect(bannerVerdict(noRect, WIN)).toBe('skip:не-отрисован')
  })

  it('слишком высокий блок → не прячем (границы порога)', () => {
    expect(bannerVerdict(fake('Обновите браузер', 300, BANNER_MAX_HEIGHT), WIN)).toBe('ok')
    expect(bannerVerdict(fake('Обновите браузер', 300, BANNER_MAX_HEIGHT + 1), WIN)).toContain('skip:высота-')
  })

  it('много прямых детей → это контейнер, не плашка', () => {
    expect(bannerVerdict(fake('Обновите браузер', 900, 40, BANNER_MAX_CHILDREN), WIN)).toContain('skip:детей-')
    expect(bannerVerdict(fake('Обновите браузер', 900, 40, BANNER_MAX_CHILDREN - 1), WIN)).toBe('ok')
  })

  it('порог площади считается от размера окна, а не от абсолютных чисел', () => {
    const area = WIN.innerWidth * WIN.innerHeight * BANNER_MAX_AREA_RATIO
    // 990×150 = 148 500 < 280 000 → плашка
    expect(bannerVerdict(fake('Обновите браузер', 990, 150), WIN)).toBe('ok')
    expect(990 * 150).toBeLessThan(area)
    // в маленьком окне та же плашка занимает слишком много → отказ
    expect(bannerVerdict(fake('Обновите браузер', 990, 150), { innerWidth: 500, innerHeight: 400 }))
      .toContain('skip:площадь-')
  })

  it('размеров окна нет → по площади не отказываем (нечем мерить)', () => {
    expect(bannerVerdict(fake('Обновите браузер', 900, 40), {})).toBe('ok')
  })
})

describe('Скрипт для впрыска (buildBannerHiderScript)', () => {
  const script = buildBannerHiderScript()

  it('это синтаксически корректный JS', () => {
    expect(() => new Function(script)).not.toThrow()
  })

  it('решение ВСТРОЕНО в скрипт (один источник истины, без расхождения с тестом)', () => {
    expect(script).toContain('браузер устарел')
    expect(script).toContain('skip:не-отрисован')
    expect(script).toContain('getBoundingClientRect')
  })

  it('пишет в журнал и когда спрятал, и когда отказался', () => {
    expect(script).toContain('__CC_DIAG__banner')
    expect(script).toContain("say('спрятал ")
    expect(script).toContain("say('НЕ прячу ")
  })

  it('спрятанное помечается, чтобы не разбирать его снова', () => {
    expect(script).toContain('data-cc-banner')
  })

  it('наблюдатель за DOM с тормозом (не на каждое изменение)', () => {
    expect(script).toContain('MutationObserver')
    expect(script).toContain('passSoon')
  })
})

describe('Живой прогон скрипта в странице', () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

  it('маленькую плашку прячет, коробку во весь экран — НЕТ', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="app"><div id="bar">Обновите браузер</div><p>привет</p></div>'
    const app = document.getElementById('app')
    const bar = document.getElementById('bar')
    // happy-dom не считает раскладку → задаём размеры руками
    app.getBoundingClientRect = () => ({ width: 1000, height: 800 })
    bar.getBoundingClientRect = () => ({ width: 900, height: 48 })
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })

    new Function(buildBannerHiderScript())()

    expect(bar.style.display).toBe('none')
    expect(app.style.display).not.toBe('none')   // 🔴 главное: приложение осталось видимым
    expect(bar.getAttribute('data-cc-banner')).toBe('1')
  })

  // v1.2.435 ТЕСТ-ЛОВУШКА на реальную дыру в диагностике (найдена ревью 2026-09-09):
  // в журнале оказалось 8 строк отказа, и ВСЕ — одной причины `skip:текст-<разные числа>`.
  // Ключ повторов включал число, поэтому весь бюджет записей уходил на одну причину, а
  // более опасная (`skip:площадь-…` — попытка спрятать элемент во весь экран) в журнал
  // уже не попала бы. Теперь ключ строится БЕЗ цифр → одна строка на ВИД причины.
  it('🟡 ЛОВУШКА: три отказа одной причины с разными числами → в журнале ОДНА строка', () => {
    vi.useFakeTimers()
    const said = []
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => { said.push(String(m)) })
    // три контейнера с РАЗНОЙ длиной текста, все со словами-триггерами → все skip:текст-*
    document.body.innerHTML = ['a', 'b', 'c']
      .map((id, i) => `<div id="${id}">обновите браузер ${'текст '.repeat(60 + i * 10)}</div>`)
      .join('')
    for (const id of ['a', 'b', 'c']) {
      document.getElementById(id).getBoundingClientRect = () => ({ width: 900, height: 40 })
    }
    new Function(buildBannerHiderScript())()
    spy.mockRestore()

    const refusals = said.filter(m => m.includes('НЕ прячу'))
    expect(refusals.length).toBe(1)                       // было бы 3 при ключе с цифрами
    expect(refusals[0]).toContain('skip:текст-')          // число в тексте записи осталось
    // и ни один из трёх не спрятан (они не плашки)
    for (const id of ['a', 'b', 'c']) expect(document.getElementById(id).style.display).not.toBe('none')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// v1.2.446: 🔴 СТРАЖ ПРОВОДКИ. Отдельный файл с предохранителями бесполезен,
// если приложение его не зовёт. Ровно это и случилось: правки в webviewSetup.js
// были потеряны (файл вернулся к состоянию последнего коммита), опасное условие
// «есть слова + меньше 20 детей» ожило, а НИ ОДИН тест этого не заметил — все
// проверки смотрели только внутрь shared/browserBannerHider.js.
describe('Проводка: приложение действительно зовёт безопасный прятальщик', () => {
  const setup = readFileSync('src/utils/webviewSetup.js', 'utf8')
  // v1.2.447: блок доводок страницы переехал в shared/webviewPageFixups.js, поэтому
  // вызов идёт ЦЕПОЧКОЙ: webviewSetup → webviewPageFixups → browserBannerHider.
  // Страж проверяет ВСЮ цепочку: обрыв на любом звене = защита снова не работает.
  const fixups = readFileSync('shared/webviewPageFixups.js', 'utf8')

  it('звено 1: webviewSetup.js зовёт доводки страницы', () => {
    expect(setup).toContain("from '../../shared/webviewPageFixups.js'")
    expect(setup).toContain('applyPageFixups(')
  })

  it('звено 2: доводки страницы впрыскивают именно buildBannerHiderScript()', () => {
    expect(fixups).toContain("from './browserBannerHider.js'")
    expect(fixups).toContain('el.executeJavaScript(buildBannerHiderScript())')
  })

  it('🔴 ЛОВУШКА: старое опасное условие не вернулось НИ В ОДНО звено', () => {
    for (const src of [setup, fixups]) {
      expect(src).not.toContain('children.length < 20')
      expect(src).not.toContain('hideBrowserBanners')
    }
  })

  it('сбой впрыска пишется в журнал, а не глотается пустым catch', () => {
    expect(fixups).toContain('[banner-hider] впрыск НЕ прошёл')
    expect(fixups).not.toMatch(/catch\s*\(\s*\)\s*=>\s*\{\s*\}\)/)
  })
})
