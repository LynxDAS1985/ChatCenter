// v1.2.483 — осмотр строки списка чатов ВК: есть ли в ней картинка вложения.
// @vitest-environment jsdom
//
// ЗАЧЕМ. Жалоба 2026-09-18 «фото не показывается в уведомлении». Журнал ответил
// `ссылка-на-фото=НЕТ` — перехватчик искал картинку ВНУТРИ блока превью и не нашёл. Из журнала
// не понять, картинки нет вовсе или она лежит в другом месте строки. Осмотр отвечает на это
// одним взглядом на живую страницу.
//
// ВАЖНО ПРО СПОСОБ ДОСТАВКИ: прошлая попытка (дописать файл к перехватчику) 2026-09-18 молча не
// выполнилась (ADR-067). Здесь запуск кода в странице из интерфейса — путь, доказанный журналом
// (строки `probe[...]`). Тест прогоняет НАСТОЯЩИЙ текст осмотра на поддельной странице.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import { VK_ROW_PROBE_SCRIPT, VK_ROW_PROBE_MAX_RUNS, isVkPageUrl, runVkRowProbe } from '../../shared/vkRowProbe.js'

const SETUP_SRC = fs.readFileSync('src/utils/webviewSetup.js', 'utf8')

/** Поддельный список чатов ВК: одна обычная строка и одна «с фотографией». */
function buildList({ withImage = true, withBackground = true } = {}) {
  document.body.innerHTML = ''
  const plain = document.createElement('div')
  plain.className = 'ConvoListItem'
  plain.textContent = 'Артём Понимаю'
  document.body.appendChild(plain)

  const row = document.createElement('div')
  row.className = 'ConvoListItem ConvoListItem--unread'
  const title = document.createElement('div')
  title.className = 'ConvoTitle__author'
  title.textContent = 'Елена Дугина'
  const preview = document.createElement('div')
  preview.className = 'ConvoPostPreview__text'
  preview.textContent = 'Только не забудь Фотография'
  row.appendChild(title)
  row.appendChild(preview)
  if (withImage) {
    const img = document.createElement('img')
    img.src = 'https://sun9-42.vkuserphoto.ru/abc/preview.jpg'
    Object.defineProperty(img, 'naturalWidth', { value: 130 })
    Object.defineProperty(img, 'naturalHeight', { value: 90 })
    preview.appendChild(img)
  }
  if (withBackground) {
    const bg = document.createElement('div')
    bg.className = 'ConvoAvatar__image'
    bg.style.backgroundImage = 'url("https://sun9-1.vkuserphoto.ru/xyz/avatar.jpg")'
    row.appendChild(bg)
  }
  document.body.appendChild(row)
  return row
}

/** Прогоняем НАСТОЯЩИЙ текст осмотра и собираем то, что он написал бы в журнал. */
function runProbe() {
  const lines = []
  const spy = vi.spyOn(console, 'log').mockImplementation((msg) => lines.push(String(msg)))
  const result = new Function(`return ${VK_ROW_PROBE_SCRIPT}`)()
  spy.mockRestore()
  return { result, lines, text: lines.join('\n') }
}

describe('осмотр строки списка ВК', () => {
  beforeEach(() => { delete window.__ccVkRowProbeRuns })

  it('находит строку с пометкой «Фотография» и рассказывает про картинку', () => {
    buildList()
    const { result, text } = runProbe()
    expect(result).toBe('ok')
    expect(text).toContain('всего строк=2 с пометкой вложения=1')
    expect(text).toContain('блок-превью=ЕСТЬ')
    expect(text).toContain('картинок=1')
    expect(text).toContain('файл=130x90')       // реальный размер файла
    expect(text).toContain('в-превью=да')        // и где картинка лежит
    expect(text).toContain('preview.jpg')        // хвост адреса — видно, что это за картинка
  })

  it('честно сообщает, когда картинки в строке НЕТ (это и есть ответ на жалобу)', () => {
    buildList({ withImage: false, withBackground: false })
    const { text } = runProbe()
    expect(text).toContain('картинок=0 (ни одной)')
    expect(text).toContain('фон-картинки=0 (ни одной)')
  })

  it('видит картинку, нарисованную ФОНОМ — её перехватчик не заметил бы', () => {
    buildList({ withImage: false, withBackground: true })
    const { text } = runProbe()
    expect(text).toContain('фон-картинки=1')
    expect(text).toContain('avatar.jpg')
  })

  it('[!] ЛОВУШКА: каждая строка отчёта помечена VK-DIAG — иначе журнал обрежет её до 60 знаков', () => {
    buildList()
    const { lines } = runProbe()
    expect(lines.length).toBeGreaterThan(3)
    for (const l of lines) expect(l.startsWith('__CC_DIAG__VK-DIAG ')).toBe(true)
  })

  it('[!] ЛОВУШКА: осмотр не спамит — не больше трёх раз на страницу', () => {
    buildList()
    for (let i = 0; i < VK_ROW_PROBE_MAX_RUNS; i++) expect(runProbe().result).toBe('ok')
    expect(runProbe().result).toBe('limit')
  })

  it('пустая страница не роняет осмотр', () => {
    document.body.innerHTML = ''
    const { result, text } = runProbe()
    expect(result).toBe('no-rows')
    expect(text).toContain('строк списка чатов НЕ найдено')
  })

  it('[!] ЛОВУШКА: осмотр ТОЛЬКО читает страницу', () => {
    for (const bad of ['.click(', '.remove(', '.innerHTML =', '.textContent =', 'appendChild', '.style.']) {
      expect(VK_ROW_PROBE_SCRIPT.includes(bad), `осмотр не должен менять страницу: ${bad}`).toBe(false)
    }
  })
})

describe('запуск осмотра', () => {
  it('идёт только на страницы ВК (оба домена), чужие — мимо', () => {
    expect(isVkPageUrl('https://vk.ru/im')).toBe(true)
    expect(isVkPageUrl('https://vk.com/im')).toBe(true)
    expect(isVkPageUrl('https://m.vk.ru/im')).toBe(true)
    expect(isVkPageUrl('https://climax.ru/')).toBe(false)     // ловушка прошлого: подстрока вместо хоста
    expect(isVkPageUrl('https://vk.ru.evil.com/')).toBe(false)
    expect(isVkPageUrl('')).toBe(false)
  })

  it('без вкладки или без адреса ВК осмотр не запускается', () => {
    expect(runVkRowProbe(null, 'https://vk.ru/im')).toBe(false)
    expect(runVkRowProbe({}, 'https://vk.ru/im')).toBe(false)               // вкладка не умеет выполнять код
    expect(runVkRowProbe({ executeJavaScript: () => {} }, 'https://web.max.ru/')).toBe(false)
  })

  it('сбой запуска не ломает вкладку, а пишется в журнал', () => {
    const said = []
    const el = { executeJavaScript: () => { throw new Error('вкладка занята') } }
    expect(runVkRowProbe(el, 'https://vk.ru/im', (m) => said.push(m), 0)).toBe(true)
    return new Promise((done) => setTimeout(() => {
      expect(said.join(' ')).toContain('отклонён')
      done()
    }, 10))
  })
})

describe('🔴 ЛОВУШКИ проводки', () => {
  it('осмотр подключён к вкладке мессенджера', () => {
    expect(SETUP_SRC).toContain("from '../../shared/vkRowProbe.js'")
    expect(SETUP_SRC).toContain('runVkRowProbe(el, url,')
  })

  it('[!] ЛОВУШКА: строка сканера ВК больше не режется на 60 знаках', () => {
    // v1.2.481 добавил в неё счётчики (skipTx/skipSpam/память), но журнал обрезал строку и
    // числа были не видны — проверено по chatcenter.log 17:45.
    expect(SETUP_SRC).toContain('|vk-list/i')
    // и правило для остальных меток не потеряно — его сторожит systemDiagnosticsUi.test.cjs
    expect(SETUP_SRC).toContain('VK-DIAG|vkFull')
  })
})
