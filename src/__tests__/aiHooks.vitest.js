// v1.2.0 (Этапы 5-6): sanity тесты hook файлов для 4 AI провайдеров.
// Реальная инъекция в DOM сайта — отдельная задача (e2e в Этапе 11).
// Здесь проверяем: hook загружается, регистрирует обработчик, не падает,
// корректно реагирует на отсутствие DOM элементов (input_not_found / submit_not_found).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const hooksDir = path.resolve(__dirname, '../../main/preloads/hooks/ai')

const PROVIDERS = ['openai', 'deepseek', 'anthropic', 'gigachat']

function loadHook(provider) {
  const code = fs.readFileSync(path.join(hooksDir, provider + '.hook.js'), 'utf8')
  // Запускаем в текущем window (jsdom) — eval в IIFE контексте.
  new Function(code)()
}

let lastSetHandler = null
let logs = []
let errors = []
let answers = []

beforeEach(() => {
  // Изолировать состояние между тестами через delete'ы
  delete window.__ccAiHookLoaded
  delete window.__ccAiBridge
  lastSetHandler = null
  logs = []
  errors = []
  answers = []
  // Mock bridge API
  window.__ccAiBridge = {
    log: (level, msg) => { logs.push({ level, msg }) },
    answer: (id, text) => { answers.push({ id, text }) },
    error: (id, code, msg) => { errors.push({ id, code, msg }) },
    setInjectHandler: (fn) => { lastSetHandler = fn },
    _enqueueInject: () => {},
  }
  // Чистый DOM
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

describe('AI hooks — sanity check', () => {
  for (const provider of PROVIDERS) {
    describe(provider, () => {
      it('файл существует и не пустой', () => {
        const filePath = path.join(hooksDir, provider + '.hook.js')
        expect(fs.existsSync(filePath)).toBe(true)
        const size = fs.statSync(filePath).size
        expect(size).toBeGreaterThan(1000)  // не stub
      })

      it('загружается без ошибок', () => {
        expect(() => loadHook(provider)).not.toThrow()
      })

      it('регистрирует setInjectHandler', () => {
        loadHook(provider)
        // Может быть синхронный или delayed через setTimeout(50)
        if (!lastSetHandler) {
          // Дать setTimeout(0)
          return new Promise((resolve) => setTimeout(() => {
            expect(typeof lastSetHandler).toBe('function')
            resolve()
          }, 100))
        }
        expect(typeof lastSetHandler).toBe('function')
      })

      it('логирует "hook готов" с правильным provider', () => {
        loadHook(provider)
        return new Promise((resolve) => setTimeout(() => {
          const ready = logs.find(l => l.msg && l.msg.includes('hook готов'))
          expect(ready).toBeTruthy()
          expect(ready.msg).toContain(provider)
          resolve()
        }, 100))
      })

      it('handleInject с пустым input → input_not_found', () => {
        loadHook(provider)
        return new Promise((resolve) => setTimeout(() => {
          // Вызвать handler с реальным payload
          lastSetHandler({ questionId: 'test1', text: 'Привет' })
          // setTimeout INJECT_DELAY=100-150мс — ждём чуть больше
          setTimeout(() => {
            const err = errors.find(e => e.id === 'test1')
            expect(err).toBeTruthy()
            expect(err.code).toBe('input_not_found')
            resolve()
          }, 250)
        }, 100))
      })

      it('защита от двойной загрузки — повторный load не падает', () => {
        loadHook(provider)
        // window.__ccAiHookLoaded теперь true — повторная загрузка должна exit early
        expect(() => loadHook(provider)).not.toThrow()
      })

      it('handleInject с пустым text → return без ошибки', () => {
        loadHook(provider)
        return new Promise((resolve) => setTimeout(() => {
          lastSetHandler({ questionId: 'test2', text: '' })
          setTimeout(() => {
            // Не должно быть error или answer
            const err = errors.find(e => e.id === 'test2')
            const ans = answers.find(a => a.id === 'test2')
            expect(err).toBeFalsy()
            expect(ans).toBeFalsy()
            resolve()
          }, 250)
        }, 100))
      })
    })
  }
})

describe('AI hooks — общее', () => {
  it('все 4 hook файла присутствуют', () => {
    const files = fs.readdirSync(hooksDir).filter(f => f.endsWith('.hook.js'))
    for (const p of PROVIDERS) {
      expect(files).toContain(p + '.hook.js')
    }
  })

  it('.hookTemplate.js не имеет .hook.js suffix → не попадёт в копирование', () => {
    const files = fs.readdirSync(hooksDir)
    const template = files.find(f => f === '.hookTemplate.js')
    expect(template).toBeTruthy()
    // Файл начинается с точки → исключается фильтром в vite.config.js
  })
})
