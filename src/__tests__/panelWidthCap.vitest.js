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
  AI_PANEL_MAX_PX, AI_PANEL_MIN_PX, AI_PANEL_MAX_WINDOW_SHARE,
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
  it('панель ИИ задаёт ширину через правило — и снаружи, и внутри', () => {
    const src = read('src/components/AISidebar.jsx')
    expect(src).toContain('aiPanelWidthCss')
    // Внешний слой (его ширину видит раскладка окна).
    expect(src).toMatch(/width: visible \? aiPanelWidthCss\(width\) : '0px'/)
    // Внутренний слой: если ему оставить жёсткие точки, он вылезет за внешний
    // и будет обрезан — та же беда, что чинили в v1.2.454, только внутри панели.
    expect(src).toMatch(/width: aiPanelWidthCss\(width\), minWidth: aiPanelWidthCss\(width\)/)
    expect(src).not.toMatch(/minWidth: `\$\{width\}px`/)
  })

  it('перетаскивание считает предел от окна и пишет то же правило', () => {
    const src = read('src/hooks/useAIPanelResize.js')
    expect(src).toContain('aiPanelMaxPx(window.innerWidth)')
    expect(src).toContain('aiPanelWidthCss(newW)')
    // Жёсткий потолок 600 в самой формуле перетаскивания остаться не должен —
    // иначе панель снова «упрётся в невидимую стену» на узком окне.
    expect(src).not.toMatch(/Math\.min\(600,/)
  })

  it('заглушка панели (пока грузится код) имеет тот же потолок — не будет прыжка', () => {
    const src = read('src/appFallbacks.jsx')
    expect(src).toContain('aiPanelWidthCss(width)')
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
