// panelWidthCap.vitest.js — v1.2.455
//
// Панель ИИ не должна быть шире, чем позволяет окно (совет после жалобы
// «окно чата уехало за границы», v1.2.454).
//
// Тут две половины:
//   1) сам расчёт (чистые функции — проверяются числами);
//   2) страж проводки: правило должно РЕАЛЬНО стоять во всех четырёх местах, где
//      задаётся ширина панели. Иначе получится «правило есть, но его никто не
//      применяет» — ровно такую тихую дыру ловит страж sharedWiring для общего кода.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  aiPanelMaxPx, aiPanelWidthCss,
  AI_PANEL_MAX_PX, AI_PANEL_MIN_PX, AI_PANEL_MAX_WINDOW_SHARE, AI_PANEL_MAX_CSS,
} from '../../shared/panelWidthCap.js'

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('предел ширины панели ИИ в точках (для перетаскивания)', () => {
  it('в широком окне действует старый потолок 600', () => {
    // Половина от 1542 — это 771, но растягивать панель больше 600 мы не даём.
    expect(aiPanelMaxPx(1542)).toBe(AI_PANEL_MAX_PX)
  })

  it('в окне поуже предел считается от окна — половина', () => {
    expect(aiPanelMaxPx(1000)).toBe(500)
    expect(aiPanelMaxPx(1100)).toBe(550)
  })

  it('на самом узком возможном окне (900 — меньше Windows не даст) это 450', () => {
    // Факт: minWidth: 900 в main/utils/windowManager.js — окно нельзя сузить сильнее.
    expect(aiPanelMaxPx(900)).toBe(450)
    expect(aiPanelMaxPx(900)).toBeGreaterThan(AI_PANEL_MIN_PX)
  })

  it('ширина окна неизвестна — ведём себя как раньше (600), а не ломаемся', () => {
    expect(aiPanelMaxPx(undefined)).toBe(AI_PANEL_MAX_PX)
    expect(aiPanelMaxPx(NaN)).toBe(AI_PANEL_MAX_PX)
    expect(aiPanelMaxPx(0)).toBe(AI_PANEL_MAX_PX)
    expect(aiPanelMaxPx(-100)).toBe(AI_PANEL_MAX_PX)
  })

  it('предел никогда не опускается ниже минимальной ширины панели', () => {
    // Подстраховка: даже при абсурдно узком окне панель остаётся «хватаемой».
    expect(aiPanelMaxPx(300)).toBe(AI_PANEL_MIN_PX)
  })
})

describe('правило ширины для вёрстки', () => {
  it('даёт «сколько просили, но не больше половины окна»', () => {
    expect(aiPanelWidthCss(458)).toBe('min(458px, 50vw)')
  })

  it('дробную ширину (её сохраняет перетаскивание) округляет', () => {
    // На диске у пользователя лежало 458.4 — в вёрстке дробь не нужна.
    expect(aiPanelWidthCss(458.4)).toBe('min(458px, 50vw)')
  })

  it('мусор вместо числа не превращается в битую вёрстку', () => {
    expect(aiPanelWidthCss(undefined)).toBe(`min(${AI_PANEL_MIN_PX}px, 50vw)`)
    expect(aiPanelWidthCss(NaN)).toBe(`min(${AI_PANEL_MIN_PX}px, 50vw)`)
    expect(aiPanelWidthCss(0)).toBe(`min(${AI_PANEL_MIN_PX}px, 50vw)`)
  })

  it('доля окна в правиле совпадает с долей в расчёте (одно число, не два)', () => {
    const share = Math.round(AI_PANEL_MAX_WINDOW_SHARE * 100)
    expect(aiPanelWidthCss(1000)).toContain(`${share}vw`)
  })
})

describe('страж проводки: правило реально применено', () => {
  it('🔴 ЛОВУШКА v1.2.456: у ВНЕШНЕГО слоя ширина постоянная, а потолок — отдельным правилом', () => {
    const src = read('src/components/AISidebar.jsx')
    // Постоянная ширина + отдельный потолок. Если вписать потолок ВНУТРЬ ширины (как было
    // в v1.2.455), её вычисленное значение начнёт меняться при изменении размера окна, а на
    // ширине висит плавный переход 0.15с → край панели поедет за краем окна с отставанием.
    expect(src).toMatch(/width: visible \? `\$\{width\}px` : '0px'/)
    expect(src).toMatch(/maxWidth: AI_PANEL_MAX_CSS/)
    expect(src).not.toMatch(/width: visible \? aiPanelWidthCss/)
    // Переход по ширине остаётся — он и делает плавное сворачивание панели.
    expect(src).toContain("transition: 'width 0.15s'")
  })

  it('у ВНУТРЕННЕГО слоя — наоборот, выражение с потолком (минимум побеждает отдельный потолок)', () => {
    const src = read('src/components/AISidebar.jsx')
    expect(src).toMatch(/width: aiPanelWidthCss\(width\), minWidth: aiPanelWidthCss\(width\)/)
    expect(src).not.toMatch(/minWidth: `\$\{width\}px`/)
  })

  it('перетаскивание считает предел от окна и пишет то же, что отрисовка', () => {
    const src = read('src/hooks/useAIPanelResize.js')
    expect(src).toContain('aiPanelMaxPx(window.innerWidth)')
    expect(src).toMatch(/style\.width = `\$\{newW\}px`/)   // снаружи — постоянное число
    expect(src).toContain('aiPanelWidthCss(newW)')          // внутри — выражение с потолком
    // Жёсткий потолок 600 в самой формуле перетаскивания остаться не должен —
    // иначе панель снова «упрётся в невидимую стену» на узком окне.
    expect(src).not.toMatch(/Math\.min\(600,/)
  })

  it('заглушка панели (пока грузится код) имеет тот же потолок — не будет прыжка', () => {
    const src = read('src/appFallbacks.jsx')
    expect(src).toContain('AI_PANEL_MAX_CSS')
  })

  it('🔴 v1.2.456: восстановление ширины при запуске берёт числа из ОБЩЕГО файла', () => {
    // Раньше 240 и 600 были зашиты второй раз — смена потолка в общем файле молча
    // не доезжала бы до восстановления.
    const src = read('src/hooks/useAppBootstrap.js')
    expect(src).toContain('AI_PANEL_MIN_PX')
    expect(src).toContain('AI_PANEL_MAX_PX')
    expect(src).not.toMatch(/Math\.max\(240, Math\.min\(600,/)
  })

  it('измеритель раскладки показывает, сработал ли потолок', () => {
    // Без этого о срабатывании потолка в журнале не было ни слова.
    const probe = read('src/boot-probe.js')
    expect(probe).toContain('СРАБОТАЛ ПОТОЛОК')
    // 🔴 Мало проверить, что функция НАПИСАНА — надо, чтобы её РЕАЛЬНО звали в строке
    // замера. Первая редакция этой проверки смотрела только на наличие имени, и удаление
    // вызова она пропустила (поймал прогон «наоборот»). Это та же «немая правка», от
    // которой в проекте есть отдельный страж проводки для общего кода.
    expect(probe).toMatch(/box\('\[data-cc-layout="ai-panel"\]'\)\s*\+\s*ccWantWidth\(\)/)
    const panel = read('src/components/AISidebar.jsx')
    expect(panel).toContain('data-cc-width-want')
  })

  it('ширина списка чатов СПЕЦИАЛЬНО не ограничена — и это записано, а не забыто', () => {
    // Ограничить её вёрсткой нельзя: «узкий» вид списка включается по числу из
    // состояния, а не по реальной ширине → панель стала бы узкой, а строки внутри
    // рисовались бы широкими. Решение отложено осознанно — проверяем, что причина
    // зафиксирована в коде, а не потеряна.
    const src = read('shared/panelWidthCap.js')
    expect(src).toContain('списка чатов')
    expect(src).toContain('TODO-40')
    const sidebar = read('src/native/components/InboxChatListSidebar.jsx')
    expect(sidebar).not.toContain('aiPanelWidthCss')
  })
})

describe('потолок как отдельное правило', () => {
  it('доля окна в правиле-потолке та же, что в расчёте', () => {
    expect(AI_PANEL_MAX_CSS).toBe(`${Math.round(AI_PANEL_MAX_WINDOW_SHARE * 100)}vw`)
    expect(AI_PANEL_MAX_CSS).toBe('50vw')
  })
})
