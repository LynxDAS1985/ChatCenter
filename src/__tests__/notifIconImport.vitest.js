// v1.2.382: ТЕСТ-ЛОВУШКА. Каждая функция логотипа из messengerLogos, ВЫЗВАННАЯ в webviewHandleNewMessage.js,
// обязана быть ИМПОРТИРОВАНА. Ловит регресс v1.2.381: авто-ответ звал resolveMessengerLogo(mInfo) ПОСЛЕ смены
// импорта на pickNotifIconDataUrl → ReferenceError при срабатывании авто-ответа. Линт это НЕ поймал: правило
// no-undef ВЫКЛЮЧЕНО в eslint.config.js (ESLint без TypeScript не понимает JSX/замыкания). Значит нужен статический тест.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const src = fs.readFileSync(path.join(process.cwd(), 'src/utils/webviewHandleNewMessage.js'), 'utf8')
const m = src.match(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*messengerLogos\.js['"]/)
const imported = m ? m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()) : []

describe('webviewHandleNewMessage — вызванные функции логотипа импортированы (no-undef выключен)', () => {
  for (const fn of ['getMessengerLogo', 'resolveMessengerLogo', 'pickNotifIconDataUrl']) {
    it(`${fn}: если вызывается в файле — то импортирован из messengerLogos.js`, () => {
      const called = new RegExp('\\b' + fn + '\\s*\\(').test(src)
      if (called) expect(imported).toContain(fn) // осиротевший вызов = регресс v1.2.381 (падение авто-ответа)
    })
  }
})
