// v1.2.510: страж «как приложение представляется сайтам» (заголовок User-Agent).
//
// ЖАЛОБА, из которой это выросло: вкладка ИИ DeepSeek показывала страницу «403 ERROR —
// The request could not be satisfied» от CloudFront (это охрана на входе сайта).
//
// КОРЕНЬ (доказан): Electron строит запасное представление из ИМЕНИ приложения ДОСЛОВНО
// (официальный исходник Electron shell/common/application_info.cc, BuildApplicationUserAgent).
// Имя у нас русское — «ЦентрЧатов», а в заголовке запроса допустимы только латинские символы.
// Живая проверка chat.deepseek.com: русское имя → 403 (3 из 3), латинское → 202 (3 из 3).
// Мессенджерам представление задаёт setupSession, а вкладке ИИ (persist:ai-webview) — никто,
// поэтому 403 ловила именно она.
//
// 🔴 ЧТО СТОРОЖИМ: (1) запасное представление вообще задано в main.js; (2) в нём НЕТ ничего
// кроме латиницы. Уберут строку или подставят туда имя приложения — проверка покраснеет.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { NATIVE_CHROME_UA } from '../../main/utils/sessionSetup.js'

const mainSrc = fs.readFileSync(path.join(process.cwd(), 'main/main.js'), 'utf8')

describe('Представление приложения для сайтов (v1.2.510)', () => {
  it('🔴 состоит ТОЛЬКО из латиницы и обычных знаков — иначе строгие сайты отдают 403', () => {
    // допустимы печатные символы латиницы (коды 32..126) — так требует заголовок запроса
    expect(NATIVE_CHROME_UA).toMatch(/^[\x20-\x7E]+$/)
  })

  it('выглядит как обычный браузер: есть Chrome/<версия>, нет слова Electron и имени приложения', () => {
    expect(NATIVE_CHROME_UA).toMatch(/Chrome\/\d+/)
    expect(NATIVE_CHROME_UA).not.toMatch(/Electron/i)
    expect(NATIVE_CHROME_UA).not.toMatch(/ЦентрЧатов|ChatCenter/i)
  })

  it('🔴 main.js задаёт запасное представление — без этого вкладка ИИ снова возьмёт русское имя', () => {
    expect(mainSrc).toMatch(/app\.userAgentFallback\s*=\s*NATIVE_CHROME_UA/)
  })

  it('ловушка-напоминание: имя приложения русское — потому запасное представление и нужно', () => {
    // если имя когда-нибудь станет латинским, страж выше всё равно останется верным,
    // но эта строка объясняет следующему человеку, откуда взялась проблема
    expect(mainSrc).toMatch(/app\.setName\('ЦентрЧатов'\)/)
  })
})
