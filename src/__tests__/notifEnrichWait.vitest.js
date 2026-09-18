// v1.2.475: сколько ждать «богатую» версию сообщения перед показом бедной + фото до показа карточки.
//
// ЖАЛОБА 2026-09-17: на одно сообщение МАКСа приходили ДВЕ карточки, на одной фото отправителя,
// на другой логотип. Журнал 15:25:04 показал причину разъезда: быстрый путь ждал богатую версию
// 500 мс и сдавался (`IPC fallback | __CC_NOTIF__ не пришёл за 500мс`), а богатая версия МАКСа
// приходит примерно через секунду — то есть ПОЗЖЕ. Запасной путь в это же время ждал 1200 мс.
// Два срока жили в разных файлах и разъехались.
//
// Склейка таких пар сделана отдельно (v1.2.474) — она лечит следствие. Здесь убрана причина.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { enrichWaitMsFor, isMaxUrl, MAX_ENRICH_WAIT_MS, HANDLED_GRACE_MS, alreadyHandledWindowMs } from '../../shared/notifEnrichWait.js'

describe('сколько ждать богатую версию (v1.2.475)', () => {
  it('[!] ГЛАВНОЕ: у МАКСа срок один и тот же для ОБОИХ путей', () => {
    const url = 'https://web.max.ru/343038491'
    expect(enrichWaitMsFor(url, 500), 'быстрый путь').toBe(MAX_ENRICH_WAIT_MS)
    expect(enrichWaitMsFor(url, 200), 'запасной путь').toBe(MAX_ENRICH_WAIT_MS)
  })

  it('прочим мессенджерам оставлен ИХ привычный срок', () => {
    expect(enrichWaitMsFor('https://vk.ru/im', 500)).toBe(500)
    expect(enrichWaitMsFor('https://web.whatsapp.com/', 200)).toBe(200)
  })

  it('[!] ЛОВУШКА: climax.ru и formax.ru — НЕ МАКС (реальная грабля v1.2.418)', () => {
    expect(isMaxUrl('https://climax.ru/')).toBe(false)
    expect(isMaxUrl('https://formax.ru/chat')).toBe(false)
    expect(enrichWaitMsFor('https://climax.ru/', 500)).toBe(500)
  })

  it('пустой или кривой адрес не роняет и отдаёт привычный срок', () => {
    expect(enrichWaitMsFor('', 500)).toBe(500)
    expect(enrichWaitMsFor(null, 500)).toBe(500)
    expect(enrichWaitMsFor(undefined, 200)).toBe(200)
    expect(isMaxUrl(null)).toBe(false)
  })

  it('срок МАКСа больше, чем у прочих — иначе ждать было бы незачем', () => {
    expect(MAX_ENRICH_WAIT_MS).toBeGreaterThan(500)
  })
})

// Проводка. Само число проверяется выше, но пользы от него нет, если пути его не спрашивают —
// а это невидимо для проверок. Страж ловит молчаливый возврат старых чисел.
describe('проводка срока ожидания (v1.2.475)', () => {
  const fast = readFileSync('src/utils/webviewSetup.js', 'utf8')
  const backup = readFileSync('src/utils/consoleMessageHandler.js', 'utf8')

  it('[!] ЛОВУШКА: быстрый путь берёт срок из общего файла, а не своё число', () => {
    expect(fast).toContain("enrichWaitMsFor(ipcUrl, 500)")
    expect(fast, 'старое жёсткое ожидание 500 мс должно исчезнуть').not.toContain('}, 500)')
  })

  it('[!] ЛОВУШКА: запасной путь тоже берёт срок из общего файла', () => {
    expect(backup).toContain('enrichWaitMsFor(')
    expect(backup, 'число 1200 больше не живёт в этом файле').not.toContain('? 1200 :')
  })

  it('в журнал пишется РЕАЛЬНЫЙ срок ожидания, а не зашитый текст', () => {
    expect(fast).toContain('ожидание ${ipcWaitMs}мс')
    expect(fast).toContain('не пришёл за ${ipcWaitMs}мс')
  })
})

// v1.2.475: фото по ссылке — короткое ожидание ПЕРЕД показом карточки.
// Раньше карточка выходила мгновенно с логотипом, а фото подставлялось уже потом — было видно
// подмену. Проверить загрузку живьём в этих проверках нельзя (нужен Electron), поэтому здесь
// страж проводки; сама загрузка и её кэш проверяются вручную по журналу.
describe('фото до показа карточки (v1.2.475)', () => {
  const mgr = readFileSync('main/handlers/notificationManager.js', 'utf8')

  it('[!] ЛОВУШКА: карточка ждёт фото перед показом', () => {
    expect(mgr).toContain('const iconDataUrl = preDataUrl || await waitIconBriefly(iconUrl)')
  })

  it('ожидание ограничено — иначе карточка застряла бы', () => {
    expect(mgr).toMatch(/const ICON_PREWAIT_MS = \d{2,4}\b/)
    expect(mgr).toContain('setTimeout(() => resolve(null), ms)')
  })

  it('не успели — показываем без фото и догружаем в фоне (старый путь цел)', () => {
    expect(mgr).toContain('if (!iconDataUrl) updateNotificationIconLater(id, iconUrl)')
  })

  it('обе ветки ожидания попадают в журнал', () => {
    expect(mgr).toContain('[notif-icon] фото до показа: ')
    expect(mgr).toContain('не успели за ')
  })
})

// v1.2.477: окно «это сообщение уже показал кто-то другой» больше не зашитое число.
describe('окно «уже показано» считается ОТ срока ожидания', () => {
  const setup = readFileSync('src/utils/webviewSetup.js', 'utf8')

  it('окно = срок ожидания + запас 1 секунда', () => {
    expect(alreadyHandledWindowMs(500)).toBe(1500)
    expect(alreadyHandledWindowMs(MAX_ENRICH_WAIT_MS)).toBe(MAX_ENRICH_WAIT_MS + HANDLED_GRACE_MS)
  })

  it('мусор на входе не делает окно отрицательным', () => {
    for (const bad of [undefined, null, NaN, -100, 'abc']) expect(alreadyHandledWindowMs(bad)).toBe(HANDLED_GRACE_MS)
  })

  it('[!] ЛОВУШКА: у МАКСа запас остался целой секундой, а не 300 мс', () => {
    // Арифметика прежнего зашитого 1500: при ожидании 1200 мс богатая копия, показанная
    // за 400 мс до проверки, давала возраст 1600 > 1500 → выходила ВТОРАЯ карточка.
    expect(alreadyHandledWindowMs(MAX_ENRICH_WAIT_MS)).toBeGreaterThan(1500)
    expect(alreadyHandledWindowMs(MAX_ENRICH_WAIT_MS) - MAX_ENRICH_WAIT_MS).toBe(1000)
  })

  it('[!] ЛОВУШКА проводки: быстрый путь берёт окно из общего файла, зашитого 1500 там нет', () => {
    expect(setup).toContain('alreadyHandledWindowMs(ipcWaitMs)')
    expect(setup).not.toContain('nowIpcFallback - ts <= 1500')
  })
})
