// v0.95.25: Spellchecker context menu — ПКМ на ошибку показывает варианты замены.
//
// Стандартный паттерн Electron ([docs](https://www.electronjs.org/docs/latest/tutorial/spellchecker)):
// webContents.on('context-menu', (event, params)) даёт `params.misspelledWord`
// и `params.dictionarySuggestions[]`. Мы строим Menu с вариантами + опциями
// «Добавить в словарь» / «Копировать» / «Вставить».
//
// Используется во всех Electron-приложениях (Slack, Discord, VS Code, Notion).
// Hunspell словари для RU + EN включены в Chromium — никаких внешних зависимостей.

/**
 * @param {object} deps
 * @param {object} deps.Menu - electron.Menu
 * @param {object} deps.MenuItem - electron.MenuItem
 * @param {object} deps.webContents - WebContents куда повесить обработчик
 */
export function attachSpellcheckContextMenu({ Menu, MenuItem, webContents }) {
  if (!webContents || typeof webContents.on !== 'function') return () => {}

  const handler = (_event, params) => {
    // Игнорируем events для editable=false (не текстовое поле). Контекстное меню
    // правописания нужно только в input/textarea/contentEditable.
    if (!params.isEditable) return

    const menu = new Menu()

    // Предложения вариантов (max 5 — стандарт UX, дальше пугает юзера длинным меню)
    const suggestions = (params.dictionarySuggestions || []).slice(0, 5)
    for (const suggestion of suggestions) {
      menu.append(new MenuItem({
        label: suggestion,
        click: () => {
          try { webContents.replaceMisspelling(suggestion) } catch (_) {}
        },
      }))
    }

    if (suggestions.length > 0) {
      menu.append(new MenuItem({ type: 'separator' }))
    }

    // Добавить в словарь (если есть подсвеченное слово — даже если нет предложений)
    if (params.misspelledWord) {
      menu.append(new MenuItem({
        label: `Добавить «${params.misspelledWord}» в словарь`,
        click: () => {
          try {
            webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
          } catch (_) {}
        },
      }))
      menu.append(new MenuItem({ type: 'separator' }))
    }

    // Стандартные edit actions — Copy / Paste / Cut. Электрон умеет сам через
    // `role: 'copy'` / `role: 'paste'` / `role: 'cut'`. Disabled если контекст
    // не позволяет (например paste без clipboard).
    if (params.editFlags?.canCut) {
      menu.append(new MenuItem({ label: 'Вырезать', role: 'cut' }))
    }
    if (params.editFlags?.canCopy) {
      menu.append(new MenuItem({ label: 'Копировать', role: 'copy' }))
    }
    if (params.editFlags?.canPaste) {
      menu.append(new MenuItem({ label: 'Вставить', role: 'paste' }))
    }
    if (params.editFlags?.canSelectAll) {
      menu.append(new MenuItem({ label: 'Выделить всё', role: 'selectAll' }))
    }

    // Показать меню только если есть хотя бы один пункт
    if (menu.items.length > 0) {
      menu.popup({ window: webContents.getOwnerBrowserWindow?.() })
    }
  }

  webContents.on('context-menu', handler)

  // Возвращаем функцию-detach для тестов / cleanup при reload
  return () => {
    try { webContents.removeListener('context-menu', handler) } catch (_) {}
  }
}
