// v1.2.478 — фотография вложения из веб-мессенджера (ВК) в карточке уведомления.
//
// Жалоба 2026-09-18: «просил, чтобы показывало сообщения фото, а не описывало фото словом».
// Раньше картинка в карточке была только у нативного Telegram (данные TDLib). Здесь появился
// путь для веб-мессенджеров: перехватчик страницы отдаёт ССЫЛКУ на картинку → главный процесс
// её скачивает → карточка показывает.
//
// ЧЕСТНАЯ ГРАНИЦА, которую эти проверки и стерегут: ссылки может не быть (ВК в списке чатов
// обычно пишет слово «Фотография»). Тогда всё обязано работать как раньше — карточка без фото.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { buildWebPhotoAlbum, isWebPhotoAlbumId, WEB_PHOTO_ALBUM_PREFIX, WEB_PHOTO_MAX_WIDTH } from '../../shared/webPhotoAlbum.js'

const VK_HOOK = fs.readFileSync('main/preloads/hooks/vk.hook.js', 'utf8')
const CONSOLE_SRC = fs.readFileSync('src/utils/consoleMessageHandler.js', 'utf8')
const HANDLE_SRC = fs.readFileSync('src/utils/webviewHandleNewMessage.js', 'utf8')
const MGR_SRC = fs.readFileSync('main/handlers/notificationManager.js', 'utf8')
const HELPERS_SRC = fs.readFileSync('main/notification-album.js', 'utf8') // v1.2.479: отрисовка альбома вынесена сюда

const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('сборка карточки с фотографией', () => {
  it('из готовой картинки собирается альбом из одной плитки', () => {
    const a = buildWebPhotoAlbum(PNG, 'vk_7')
    expect(a.id).toBe(WEB_PHOTO_ALBUM_PREFIX + 'vk_7')
    expect(a.tileThumb).toBe(PNG)
    expect(a.chatId).toBe('')            // чата TDLib нет — смотрелке нечего открывать
    expect(a.tileMessageId).toBeNull()
  })

  it('[!] ЛОВУШКА: без картинки альбома НЕТ — карточка выходит как раньше', () => {
    for (const bad of ['', null, undefined, 'https://vk.ru/photo.jpg', 42, {}]) {
      expect(buildWebPhotoAlbum(bad, 'k')).toBeNull()
    }
  })

  it('пустой ключ не ломает сборку — идентификатор всё равно уникальный', () => {
    const a = buildWebPhotoAlbum(PNG, '')
    expect(isWebPhotoAlbumId(a.id)).toBe(true)
    expect(a.id.length).toBeGreaterThan(WEB_PHOTO_ALBUM_PREFIX.length)
  })

  it('признак «готовое веб-фото» узнаётся по началу идентификатора', () => {
    expect(isWebPhotoAlbumId('single_web_x')).toBe(true)
    expect(isWebPhotoAlbumId('single_123')).toBe(false)   // одиночное фото Telegram
    expect(isWebPhotoAlbumId('12345')).toBe(false)        // медиа-группа Telegram
    expect(isWebPhotoAlbumId(null)).toBe(false)
  })
})

describe('🔴 ЛОВУШКИ проводки: ссылка на фото доходит от страницы до карточки', () => {
  it('перехватчик ВК ищет картинку ТОЛЬКО внутри блока превью', () => {
    // Аватар собеседника лежит в другом блоке строки — так его нельзя принять за вложение.
    const fn = VK_HOOK.slice(VK_HOOK.indexOf('function _vkRowPhoto'), VK_HOOK.indexOf('function _scanVkList'))
    expect(fn).toContain('PostPreview')
    expect(fn).toContain("img[src^=\"http\"]")
    expect(fn).toContain('naturalWidth')   // значки/пустышки отсекаем по размеру
    expect(fn).toContain('emoji')          // смайлик-картинка — не вложение
  })

  it('перехватчик кладёт ссылку в сообщение (поле p)', () => {
    expect(VK_HOOK).toContain('ph: _vkRowPhoto(rows[i])')
    expect(VK_HOOK).toContain('p: cand[k].ph')
  })

  it('интерфейс принимает ссылку и передаёт в главный процесс', () => {
    expect(CONSOLE_SRC).toContain('if (data.p) extra.photoUrl = data.p')
    expect(HANDLE_SRC).toContain('photoUrl: extra?.photoUrl || undefined')
  })

  it('[!] ЛОВУШКА: комментарий про фото НЕ съел код справа от себя', () => {
    // Реальная ошибка этой же правки (поймана перепроверкой 2026-09-18): комментарий поставили
    // ПОСЕРЕДИНЕ длинной строки, и всё, что было правее — приклейка номера сообщения МАКСа и
    // флаг «открытый чат» — стало комментарием. Ни линтер, ни проверки «есть такая строка»
    // этого не видят: текст-то в файле остался.
    const line = CONSOLE_SRC.split(/\r?\n/).find(l => l.includes('extra.photoUrl = data.p'))
    expect(line, 'строка с фото не найдена').toBeTruthy()
    const code = line.slice(0, line.indexOf('//') === -1 ? line.length : line.indexOf('//'))
    expect(code).toContain('extra.messageId = ')   // приклейка номера сообщения МАКСа жива
    expect(code).toContain('extra.openChat = 1')   // флаг «открытый чат» жив
  })

  it('[!] ЛОВУШКА: в журнале видно, ДАЛ ли ВК ссылку на фото', () => {
    // Без этой записи нельзя отличить «ВК картинку не даёт» от «наш код не сработал» —
    // а на этом вопросе и держится вся затея с фото в карточке ВК.
    expect(HANDLE_SRC).toContain('ссылка-на-фото=')
    expect(HANDLE_SRC).toContain('НЕТ — ВК её в списке чатов не даёт')
  })

  it('[!] ЛОВУШКА: готовый альбом Telegram главнее — веб-фото его НЕ подменяет', () => {
    expect(MGR_SRC).toContain('const finalAlbum = album || (photoUrl ? await loadWebPhotoAlbum(')
    expect(MGR_SRC).toContain('album: finalAlbum || null')
  })

  it('ожидание фото ограничено и снимок ужимается — карточка не тормозит и не пухнет', () => {
    expect(MGR_SRC).toMatch(/const PHOTO_PREWAIT_MS = \d{3,4}/)
    expect(MGR_SRC).toContain('Promise.race([loading, timeout])')
    expect(MGR_SRC).toContain('img.resize({ width: WEB_PHOTO_MAX_WIDTH })')
    expect(WEB_PHOTO_MAX_WIDTH).toBeGreaterThan(200)
  })

  it('оба исхода попадают в журнал — и с фото, и без', () => {
    expect(MGR_SRC).toContain('[notif-photo] фото в карточке: ')
    expect(MGR_SRC).toContain("'нет — не успели за '")   // честная причина, а не молчание
    expect(MGR_SRC).toContain('[notif-photo] фото НЕ скачалось')
    expect(MGR_SRC).toContain('[notif-photo] фото скачано за ')
    expect(MGR_SRC).toContain('[notif-photo] сбой загрузки фото')
  })

  it('[!] ЛОВУШКА: файл альбома реально подключён к окну и попадает в сборку', () => {
    // v1.2.479: альбом вынесен из notification-helpers.js в свой файл. Если забыть строку в окне
    // или в списке копирования, карточка альбома молча исчезнет в собранной программе, а тесты
    // (они читают файл напрямую) этого НЕ заметят. Реальный случай такой потери — v1.2.446.
    const html = fs.readFileSync('main/notification.html', 'utf8')
    const build = fs.readFileSync('electron.vite.config.js', 'utf8')
    expect(html).toContain('notification-album.js')
    expect(build).toContain("to: 'out/main/notification-album.js'")
    // и набор ДОПОЛНЯЕТСЯ, а не пересоздаётся — иначе файлы затёрли бы функции друг друга
    const album = fs.readFileSync('main/notification-album.js', 'utf8')
    const helpers = fs.readFileSync('main/notification-helpers.js', 'utf8')
    expect(album).toContain('Object.assign(window.__ccNotifHelpers = window.__ccNotifHelpers || {}')
    expect(helpers).toContain('Object.assign(window.__ccNotifHelpers = window.__ccNotifHelpers || {}')
  })

  it('[!] ЛОВУШКА: клик по веб-фото не уходит в смотрелку TDLib', () => {
    // Смотрелка качает оригинал по номеру сообщения TDLib; у веб-фото его нет — открылось бы пустое окно.
    const i = HELPERS_SRC.indexOf('if (isWeb) return')
    const j = HELPERS_SRC.indexOf('e.stopPropagation()', i)
    expect(i).toBeGreaterThan(0)
    expect(j).toBeGreaterThan(i)          // выход РАНЬШЕ подавления клика → переход в чат работает
    expect(HELPERS_SRC).toContain("startsWith('single_web_')")
  })
})
