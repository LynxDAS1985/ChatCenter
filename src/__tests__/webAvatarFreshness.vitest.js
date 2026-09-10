// v1.2.439: тест «срока годности» аватарки веб-аккаунта.
//
// 🔴 ЛОВУШКИ НА ДВЕ РЕАЛЬНЫЕ ЖАЛОБЫ (2026-09-09):
//   (1) «у телеграмма веб стоит ЧУЖАЯ аватарка, а не моя» — снимок лежал в localStorage
//       страницы под ключом `__cc_account_avatar_crisp2` и возвращался НЕМЕДЛЕННО, без
//       проверки «чей снимок» и «когда сделан». По доке MDN у localStorage нет срока
//       годности → раз попавшее чужое фото залипало НАВСЕГДА. Замер подтвердил: в хранилище
//       страницы Telegram лежали ДВЕ картинки (чужое лицо и правильный логотип), значок
//       показывал чужое, а журнал писал `sel=crisp-stored`.
//   (2) «у Макса пропала аватарка» — accountScript ставил вечный флаг `__cc_avatar_tried='1'`
//       ДО того, как убедиться, что фото сохранилось. Замер хранилища МАКСа: имя есть,
//       флаг стоит, фото НЕТ → повторная попытка была запрещена навсегда.
//
// Тест читает РЕАЛЬНЫЕ файлы (не копии): достаёт из впрыскиваемой строки функцию проверки
// конверта и прогоняет её, плюс сторожит сами строки фикса.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const AV_SRC = fs.readFileSync('src/utils/webAvatarScript.js', 'utf8')
const CONST_SRC = fs.readFileSync('src/constants.js', 'utf8')
const DAY = 86400000

/** Достаём НАСТОЯЩУЮ функцию проверки конверта из впрыскиваемого скрипта */
function realAvOk() {
  // отступ может быть 4 или 6 пробелов: в v1.2.440 помощники подняли ВЫШЕ блока «только Telegram»,
  // чтобы снимок сохранялся для любого веб-мессенджера (МАКС тоже) — отступ при этом уменьшился
  const m = AV_SRC.match(/var __avOk = function \(raw, who, now, maxAge\) \{[\s\S]*?\n {4,6}\};/)
  expect(m, 'функция __avOk не найдена в скрипте — тест устарел').toBeTruthy()
  return new Function(`${m[0].replace(/^\s*var __avOk = /, 'const f = ')} return f`)()
}

const pack = (b, who, ts) => JSON.stringify({ b, who, ts })
// v1.2.440: «фото» должно быть РЕАЛИСТИЧНОГО размера — теперь проверяется не только «это картинка»,
// но и размер (настоящие снимки в замере: 4360 и 6556 символов; пустышка 1x1 ~80).
const PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(600)
const TINY = 'data:image/png;base64,iVBORw0KGgo='  // прозрачный квадратик-пустышка

describe('Годность сохранённого снимка (__avOk)', () => {
  const ok = realAvOk()
  const now = 1_700_000_000_000

  it('свежий снимок этого же аккаунта → берём', () => {
    const r = ok(pack(PHOTO, 'Avtoliberty', now - 1000), 'Avtoliberty', now, DAY)
    expect(r.b).toBe(PHOTO)
    expect(r.why).toBe('ok')
  })

  it('🔴 ЛОВУШКА №1: снимок ЧУЖОГО аккаунта → НЕ берём (жалоба «стоит чужая аватарка»)', () => {
    const r = ok(pack(PHOTO, 'Кто-то другой', now - 1000), 'Avtoliberty', now, DAY)
    expect(r.b).toBe('')
    expect(r.why).toBe('чужой-аккаунт')
  })

  it('🔴 ЛОВУШКА №1b: СТАРЫЙ формат (просто картинка, без подписи) → НЕ берём', () => {
    // именно так лежало залипшее чужое фото в ключе crisp2 — простая строка-картинка.
    // Это не JSON, поэтому разбор конверта падает и мы попадаем в ветку «битый» —
    // тоже ОТКАЗ, что и требуется. Главное: снимок НЕ используется.
    const r = ok(PHOTO, 'Avtoliberty', now, DAY)
    expect(r.b).toBe('')
    expect(['нет-конверта', 'битый']).toContain(r.why)
  })

  it('🔴 ЛОВУШКА №3: снимок-ПУСТЫШКА (крошечная картинка) → НЕ берём', () => {
    // без этой проверки прозрачный квадратик 1x1 считался бы готовым фото → значок пустой,
    // а программа думала бы, что фото есть, и никогда не переснимала
    const r = ok(pack(TINY, 'Avtoliberty', now - 1000), 'Avtoliberty', now, DAY)
    expect(r.b).toBe('')
    expect(r.why).toMatch(/^мелкий-\d+$/)
  })

  it('снимок старше суток → переснять', () => {
    expect(ok(pack(PHOTO, 'A', now - DAY - 1), 'A', now, DAY).why).toBe('устарел')
    expect(ok(pack(PHOTO, 'A', now - DAY + 1000), 'A', now, DAY).why).toBe('ok')
  })

  it('имя аккаунта неизвестно → по имени не отбраковываем (только по сроку)', () => {
    expect(ok(pack(PHOTO, 'A', now - 1000), '', now, DAY).why).toBe('ok')
    expect(ok(pack(PHOTO, '', now - 1000), 'A', now, DAY).why).toBe('ok')
  })

  it('крайние случаи: пусто / мусор / не картинка → НЕ берём и не падаем', () => {
    for (const raw of [null, undefined, '', '{}', 'не json', '{"b":"мусор","ts":' + now + '}', pack('', 'A', now)]) {
      const r = ok(raw, 'A', now, DAY)
      expect(r.b).toBe('')
      expect(typeof r.why).toBe('string')
    }
  })
})

describe('Строки фикса на месте (сторож исходника)', () => {
  it('Telegram: снимок пишется КОНВЕРТОМ в ключ v3, старый v2 удаляется', () => {
    expect(AV_SRC).toMatch(/__cc_account_avatar_crisp3/)
    expect(AV_SRC).toMatch(/removeItem\('__cc_account_avatar_crisp2'\)/)
    // старое «доверяем ключу навсегда» должно быть удалено
    expect(AV_SRC).not.toMatch(/var crisp = localStorage\.getItem\('__cc_account_avatar_crisp2'\)/)
  })

  it('причина отказа снимка уходит НАРУЖУ (в журнал), а не только внутрь страницы', () => {
    expect(AV_SRC).toMatch(/avwhy: __avChk\.why/)
    const HOOK = fs.readFileSync('src/hooks/useWebAccountAvatars.js', 'utf8')
    expect(HOOK).toMatch(/avwhy/)
  })

  it('v1.2.441: общий путь (МАКС/ВК/WhatsApp) тоже сообщает причину в журнал', () => {
    // раньше __avRet возвращал только avatar/sel/err → у нелегко достающихся мессенджеров
    // в журнале не было причины, и разбор «откуда это фото» был неполным
    expect(AV_SRC).toMatch(/__avRet = function \(b, sel[^)]*\).*avwhy:/)
  })

  it('v1.2.442: ЗАМЕР «имя аккаунта рядом со снимком» есть и НИЧЕГО не отбраковывает', () => {
    // помощник появился
    expect(AV_SRC).toMatch(/var __avNear = function \(el\)/)
    // отдаёт три понятных ответа
    expect(AV_SRC).toMatch(/'имя-неизвестно'/)
    expect(AV_SRC).toMatch(/return 'да';/)
    expect(AV_SRC).toMatch(/return 'нет';/)
    // 🔴 ГЛАВНОЕ: это только наблюдение — снимок по-прежнему СОХРАНЯЕТСЯ и возвращается,
    // никакого «если имени нет рядом — выбросить» тут быть не должно, пока журнал не подтвердит,
    // что признак надёжен для каждого мессенджера (иначе сломаем только что заработавший МАКС).
    expect(AV_SRC).toMatch(/__avRet = function \([^)]*\) \{ __avSave\(b\); return \{ avatar: b/)
    // защита от «текста всей переписки» в корне одностраничного приложения (грабля v1.2.434)
    expect(AV_SRC).toMatch(/t\.length < 3000/)
  })

  it('у снимка проверяется РАЗМЕР, а не только «это картинка»', () => {
    expect(AV_SRC).toMatch(/String\(o\.b\)\.length < 512/)
  })

  it('Telegram: конверт несёт имя аккаунта и время съёмки', () => {
    expect(AV_SRC).toMatch(/who: __avWho\(\)/)
    expect(AV_SRC).toMatch(/ts: Date\.now\(\)/)
  })

  it('Telegram: счётчик попыток открыть Настройки — ПО ДНЯМ (не вечный)', () => {
    expect(AV_SRC).toMatch(/__cc_tg_open_tries_' \+ __avDay/)
    expect(AV_SRC).not.toMatch(/__cc_tg_open_tries7/)
  })

  it('🔴 ЛОВУШКА №2: МАКС — флаг «уже пробовали» сравнивается с ДАТОЙ, а не просто «есть»', () => {
    expect(CONST_SRC).toMatch(/localStorage\.getItem\(TK\) === today/)
    expect(CONST_SRC).toMatch(/localStorage\.setItem\(TK, today\)/)
    // вечный флаг '1' должен уйти
    expect(CONST_SRC).not.toMatch(/localStorage\.setItem\(TK, '1'\)/)
  })

  it('оба впрыскиваемых скрипта остаются синтаксически корректными', () => {
    for (const src of [AV_SRC, CONST_SRC]) {
      const strings = src.match(/`\(([\s\S]*?)\)`/g) || []
      expect(strings.length).toBeGreaterThan(0)
      for (const s of strings) {
        const body = s.slice(1, -1)
        expect(() => new Function(`return function(){ return ${body} }`)).not.toThrow()
      }
    }
  })
})
