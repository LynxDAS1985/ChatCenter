// v1.2.484 — большой снимок страницы ВК (`runVkFullProbe`) ожил и перестал быть опасным.
// @vitest-environment jsdom
//
// 🔴 ЧТО БЫЛО НЕ ТАК (две беды сразу, обе доказаны фактом):
// (1) Снимок НЕ СОБИРАЛСЯ НИ РАЗУ. Условие запуска было «мессенджер называется vk ИЛИ адрес
//     содержит vk.com». ВК переехал на vk.ru ещё в v1.2.109 (тогда починили четыре других места,
//     это пропустили), а мессенджер у пользователя пользовательский (`custom_…`). Проверка по
//     журналу `chatcenter.log`: записей `vkFull` — 0 за всю историю файла.
// (2) Если бы он ожил «как есть», он залил бы журнал: строки с меткой `vkFull` пишутся в файл
//     ЦЕЛИКОМ (правило в webviewSetup.js), а снимок содержал до 30 сообщений с разметкой по
//     12 000 знаков каждое плюс 3 000 знаков текста страницы — сотни килобайт на КАЖДЫЙ переход
//     между чатами.
//
// Тест прогоняет НАСТОЯЩИЙ снимок на поддельной странице: подсовывает функции фальшивую вкладку,
// перехватывает текст скрипта и выполняет его.
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import {
  runVkFullProbe, VK_FULL_MSGS, VK_FULL_ROWS, VK_FULL_MAX_CHARS, VK_FULL_MAX_RUNS, VK_FULL_MIN_GAP_MS,
} from '../../shared/webviewDiagnostics.js'

const SRC = fs.readFileSync('shared/webviewDiagnostics.js', 'utf8')

/** Поддельная страница ВК: переписка из 25 сообщений и список из 20 чатов. */
function buildPage() {
  document.body.innerHTML = ''
  const history = document.createElement('div')
  history.className = 'ConvoMain__history'
  for (let i = 0; i < 25; i++) {
    const m = document.createElement('div')
    m.className = 'ConvoMessage'
    m.setAttribute('data-msgid', String(1000 + i))
    const t = document.createElement('div')
    t.className = 'ConvoMessage__text'
    t.textContent = 'Сообщение номер ' + i + ' — ' + 'x'.repeat(300) // длинное, чтобы проверить потолок
    m.appendChild(t)
    history.appendChild(m)
  }
  document.body.appendChild(history)
  for (let i = 0; i < 20; i++) {
    const row = document.createElement('div')
    row.className = 'ConvoListItem'
    row.textContent = 'Чат ' + i + ' последнее сообщение'
    document.body.appendChild(row)
  }
}

/** Фальшивая вкладка: перехватывает скрипт и выполняет его прямо здесь. */
function fakeTab(url) {
  const calls = []
  return {
    calls,
    getURL: () => url,
    executeJavaScript: (code) => {
      let value = null
      let printed = []
      const orig = console.log
      console.log = (m) => printed.push(String(m))
      try { value = new Function(`return ${code}`)() } finally { console.log = orig }
      calls.push({ value, printed })
      return Promise.resolve(value)
    },
  }
}

/** Достаём выгрузку из напечатанной строки. */
function payloadOf(tab, idx = 0) {
  const line = (tab.calls[idx]?.printed || []).find(l => l.startsWith('__CC_DIAG__vkFull '))
  expect(line, 'снимок ничего не напечатал').toBeTruthy()
  return line.slice('__CC_DIAG__vkFull '.length)
}

describe('снимок страницы ВК запускается там, где нужно', () => {
  beforeEach(() => { delete window.__ccVkFullRuns; delete window.__ccVkFullTs; buildPage() })

  it('[!] ЛОВУШКА (та самая поломка): vk.ru + пользовательский мессенджер — снимок СОБИРАЕТСЯ', () => {
    const tab = fakeTab('https://vk.ru/im')
    runVkFullProbe(tab, 'custom_1784262905316')
    expect(tab.calls.length).toBe(1)
    expect(tab.calls[0].value).toBe('ok')
  })

  it('старый домен vk.com тоже работает (регресса нет)', () => {
    const tab = fakeTab('https://vk.com/im')
    runVkFullProbe(tab, 'custom_1')
    expect(tab.calls.length).toBe(1)
  })

  it('[!] ЛОВУШКА: чужие мессенджеры снимок НЕ запускают', () => {
    for (const url of ['https://web.max.ru/', 'https://web.telegram.org/', 'https://climax.ru/']) {
      const tab = fakeTab(url)
      runVkFullProbe(tab, 'custom_2')
      expect(tab.calls.length, `не должен запускаться на ${url}`).toBe(0)
    }
  })

  it('вкладка без возможности выполнить код не роняет программу', () => {
    expect(() => runVkFullProbe({}, 'vk')).not.toThrow()
    expect(() => runVkFullProbe(null, 'vk')).not.toThrow()
  })

  it('[!] ЛОВУШКА: старое условие «только vk.com» не вернулось', () => {
    expect(SRC).not.toContain("messengerId !== 'vk' && !/vk\\.com/i.test(url)")
    expect(SRC).toContain("detectMessengerType(url) !== 'vk'")
  })
})

describe('снимок не заливает журнал', () => {
  beforeEach(() => { delete window.__ccVkFullRuns; delete window.__ccVkFullTs; buildPage() })

  it('выгрузка укладывается в потолок и остаётся ЧИТАЕМОЙ (не рваной)', () => {
    const tab = fakeTab('https://vk.ru/im')
    runVkFullProbe(tab, 'vk')
    const out = payloadOf(tab)
    expect(out.length).toBeLessThanOrEqual(VK_FULL_MAX_CHARS)
    expect(() => JSON.parse(out), 'выгрузку должно быть можно прочитать целиком').not.toThrow()
  })

  it('[!] ЛОВУШКА: если снимок всё же не влез — печатаем КОРОТКУЮ СВОДКУ, а не огрызок', () => {
    // Раньше замысел был «обрезать строку» — получался нечитаемый кусок JSON. Проверяем запасной путь.
    const big = document.createElement('div')
    big.className = 'ConvoMain__history'
    for (let i = 0; i < 10; i++) {
      const m = document.createElement('div'); m.className = 'ConvoMessage'
      m.setAttribute('data-msgid', 'x'.repeat(4000) + i)   // раздуваем то, что не ограничено длиной
      m.textContent = 'текст'
      big.appendChild(m)
    }
    document.body.innerHTML = ''
    document.body.appendChild(big)
    const tab = fakeTab('https://vk.ru/im')
    runVkFullProbe(tab, 'vk')
    const out = payloadOf(tab)
    expect(tab.calls[0].value).toBe('too-big')
    expect(() => JSON.parse(out), 'сводка тоже должна читаться').not.toThrow()
    expect(JSON.parse(out).kind).toBe('vkFull-short')
  })

  it('сводка собирается ЧЕРЕЗ JSON.stringify, а не склейкой строк', () => {
    // Честно: воспроизвести поломку склейки не удалось — адреса страниц кодируют кавычки (%22),
    // а список контейнеров фиксированный. Поэтому это не «пойманный баг», а страховка: сборка
    // объектом не зависит от того, что попадёт в значения. Проверяем именно способ сборки.
    expect(SRC).toContain("JSON.stringify({kind:'vkFull-short'")
    expect(SRC).not.toContain('__CC_DIAG__vkFull {\\"kind\\":\\"vkFull-short\\"')
  })

  it('[!] ЛОВУШКА: разметки сообщений (самая тяжёлая часть) в выгрузке НЕТ', () => {
    const tab = fakeTab('https://vk.ru/im')
    runVkFullProbe(tab, 'vk')
    expect(payloadOf(tab)).not.toContain('outerHTML')
    expect(SRC).not.toContain('outerHTML:(m.outerHTML')
  })

  it('берём только последние сообщения и часть списка чатов', () => {
    const tab = fakeTab('https://vk.ru/im')
    runVkFullProbe(tab, 'vk')
    const data = JSON.parse(payloadOf(tab).replace(/ …ОБРЕЗАНО.*$/, ''))
    expect(data.messages.length).toBeLessThanOrEqual(VK_FULL_MSGS)
    expect(data.sidebar.length).toBeLessThanOrEqual(VK_FULL_ROWS)
    expect(data.bodyTextSample.length).toBeLessThanOrEqual(400)
  })

  it('[!] ЛОВУШКА: снимок не чаще одного раза в две минуты и не больше трёх на страницу', () => {
    const tab = fakeTab('https://vk.ru/im')
    runVkFullProbe(tab, 'vk')
    runVkFullProbe(tab, 'vk')
    expect(tab.calls[1].value).toBe('too-soon')       // второй сразу — отказ
    window.__ccVkFullTs = Date.now() - VK_FULL_MIN_GAP_MS - 1
    runVkFullProbe(tab, 'vk')
    window.__ccVkFullTs = Date.now() - VK_FULL_MIN_GAP_MS - 1
    runVkFullProbe(tab, 'vk')
    window.__ccVkFullTs = Date.now() - VK_FULL_MIN_GAP_MS - 1
    runVkFullProbe(tab, 'vk')
    expect(tab.calls[tab.calls.length - 1].value).toBe('limit')
    expect(window.__ccVkFullRuns).toBe(VK_FULL_MAX_RUNS)
  })

  it('снимок по-прежнему отвечает на свои вопросы (поля на месте)', () => {
    const tab = fakeTab('https://vk.ru/im')
    runVkFullProbe(tab, 'vk')
    const data = JSON.parse(payloadOf(tab).replace(/ …ОБРЕЗАНО.*$/, ''))
    for (const field of ['containerFound', 'containerSelector', 'messageCount', 'header', 'messages', 'sidebar']) {
      expect(data, `поле ${field} пропало из снимка`).toHaveProperty(field)
    }
    expect(data.messages[0]).toHaveProperty('outgoingEvidence')
    expect(data.messages[0]).toHaveProperty('authorFromMessage')
  })
})
