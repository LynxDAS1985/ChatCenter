// Регрессионные тесты «чистых» функций уведомлений ВК/Telegram (v1.2.123).
// Читают РЕАЛЬНЫЙ код хуков и проверяют логику текста/спама/сторис БЕЗ запуска приложения
// и БЕЗ перестройки впрыска (хук инжектится как один самодостаточный <script>, импортов нет).
// Функции извлекаются из файла регуляркой и вычисляются через new Function — тестируем то,
// что реально работает в проде, без дубля кода.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const vkSrc = fs.readFileSync(path.join(process.cwd(), 'main/preloads/hooks/vk.hook.js'), 'utf8')
const tgSrc = fs.readFileSync(path.join(process.cwd(), 'main/preloads/hooks/telegram.hook.js'), 'utf8')

function grab(src, re, label) {
  const m = src.match(re)
  if (!m) throw new Error('Не найден фрагмент в хуке: ' + label)
  return m[0]
}

// VK _cleanMultiline (одна строка): сохраняет переносы строк
const vkCleanMultiline = new Function(
  grab(vkSrc, /function _cleanMultiline\(v\) \{.*\}/, '_cleanMultiline') + '\nreturn _cleanMultiline;'
)()

// VK _isSpam + его regex-переменные
const vkIsSpam = new Function(
  grab(vkSrc, /var _spam = \/.*\/i;/, '_spam') + '\n' +
  grab(vkSrc, /var _outgoing = \/.*\/i;/, '_outgoing') + '\n' +
  grab(vkSrc, /var _statusEnd = \/.*\/i;/, '_statusEnd') + '\n' +
  grab(vkSrc, /var _sysText = \/.*\/i;/, '_sysText') + '\n' +
  grab(vkSrc, /function _isSpam\(body\) \{[\s\S]*?\n {2}\}/, '_isSpam') + '\nreturn _isSpam;'
)()

// Telegram фильтр сторис (историй): _story + _storyEn
const tgIsStory = new Function(
  grab(tgSrc, /var _story = \/.*\/i;/, '_story') + '\n' +
  grab(tgSrc, /var _storyEn = \/.*\/i;/, '_storyEn') + '\n' +
  'return function (b) { b = String(b).trim(); return _story.test(b) || _storyEn.test(b); };'
)()

// VK _vkNodeText — собирает текст ЭЛЕМЕНТА, включая эмодзи-картинки (<img alt="🧡">)
const vkNodeText = new Function(
  grab(vkSrc, /function _vkNodeText\(node\) \{[\s\S]*?\n {2}\}/, '_vkNodeText') + '\nreturn _vkNodeText;'
)()

describe('VK _cleanMultiline — сохраняет переносы строк (формат постов не «простыня»)', () => {
  it('оставляет переносы, схлопывает пробелы, максимум одна пустая строка', () => {
    const out = vkCleanMultiline('Заголовок\n\n\n✅ раз   (моро);  \n✅ два')
    expect(out).toBe('Заголовок\n\n✅ раз (моро);\n✅ два')
    expect(out.includes('\n')).toBe(true)
  })
  it('пустое/undefined → пустая строка', () => {
    expect(vkCleanMultiline('')).toBe('')
    expect(vkCleanMultiline(undefined)).toBe('')
  })
})

describe('VK _isSpam — гасит служебное, пропускает обычное', () => {
  it('гасит статусы/исходящие/пустое', () => {
    expect(vkIsSpam('online')).toBeTruthy()
    expect(vkIsSpam('печатает')).toBeTruthy()
    expect(vkIsSpam('Вы: привет')).toBeTruthy()
    expect(vkIsSpam('')).toBe('empty')
  })
  it('пропускает обычный текст (в т.ч. с превью-словами)', () => {
    expect(vkIsSpam('Привет, как дела?')).toBe('')
    expect(vkIsSpam('Фотография')).toBe('')
  })
})

describe('Telegram — фильтр сторис (историй) не трогает обычные сообщения', () => {
  it('гасит системную фразу-сторис целиком', () => {
    expect(tgIsStory('опубликовал(а) историю')).toBe(true)
    expect(tgIsStory('опубликовала историю')).toBe(true)
    expect(tgIsStory('posted a story')).toBe(true)
  })
  it('НЕ трогает живые сообщения со словом «история»', () => {
    expect(tgIsStory('расскажи историю')).toBe(false)
    expect(tgIsStory('это долгая история')).toBe(false)
    expect(tgIsStory('опубликовал новую историю сегодня')).toBe(false)
  })
})

describe('VK _vkNodeText — достаёт эмодзи из картинок (VK рисует эмодзи как <img>)', () => {
  const T = (v) => ({ nodeType: 3, nodeValue: v })
  const IMG = (alt) => ({ nodeType: 1, tagName: 'IMG', getAttribute: (a) => (a === 'alt' ? alt : null), childNodes: [] })
  const EL = (kids) => ({ nodeType: 1, tagName: 'SPAN', getAttribute: () => null, childNodes: kids })
  it('текст + эмодзи-картинка → символ остаётся на месте', () => {
    expect(vkNodeText(EL([T('Хорошего дня любимка '), IMG('🧡')]))).toBe('Хорошего дня любимка 🧡')
  })
  it('вложенные элементы обходятся вглубь', () => {
    expect(vkNodeText(EL([T('привет '), EL([IMG('😀'), T(' мир')])]))).toBe('привет 😀 мир')
  })
  it('картинка без alt (эмодзи фоном) → пропускается, текст не ломается', () => {
    expect(vkNodeText(EL([T('текст'), IMG(null)]))).toBe('текст')
  })
})

// v1.2.129: переносы строк поста (VK хранит их РАЗМЕТКОЙ — <br>/блоки, не буквами;
// textContent их не видит → «простыня»). Сборщик должен ставить \n.
describe('VK _vkNodeText — сохраняет переносы из разметки (абзацы поста не «простыня»)', () => {
  const T = (v) => ({ nodeType: 3, nodeValue: v })
  const TAG = (tag, kids) => ({ nodeType: 1, tagName: tag, getAttribute: () => null, childNodes: kids || [] })
  const BR = () => ({ nodeType: 1, tagName: 'BR', getAttribute: () => null, childNodes: [] })

  it('<br> → перенос строки', () => {
    expect(vkNodeText(TAG('SPAN', [T('строка 1'), BR(), T('строка 2')]))).toBe('строка 1\nстрока 2')
  })
  it('блочные абзацы (DIV/P) → перенос между ними', () => {
    const out = vkNodeText(TAG('DIV', [TAG('P', [T('Абзац один')]), TAG('P', [T('Абзац два')])]))
    expect(out.includes('Абзац один')).toBe(true)
    expect(out.includes('Абзац два')).toBe(true)
    expect(/Абзац один\s*\n\s*Абзац два/.test(out)).toBe(true)
  })
  it('инлайн-тег (SPAN) НЕ добавляет лишних переносов', () => {
    expect(vkNodeText(TAG('SPAN', [T('а'), TAG('SPAN', [T('б')])]))).toBe('аб')
  })
})
