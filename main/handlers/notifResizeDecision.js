// v1.2.107: чистое РЕШЕНИЕ «что делать с окном уведомления по отчёту высоты».
// Вынесено из обработчика notif:resize (notifHandlers.js), чтобы логику можно было
// проверить поведенческим тестом — раньше она жила внутри ipcMain.on и проверялась
// только текстовым grep'ом (см. mistakes: тест был зелёным, пока баг был жив).
//
// Возвращает ДЕЙСТВИЕ (сами side-effect'ы — в обработчике):
//   'clear-hide' — renderer сообщил, что у него ПУСТО (terminal signal rendererPure):
//                  очистить main notifItems от мусора + спрятать окно.
//   'ignore'     — запоздалый reportHeight(0), но у main УЖЕ есть сообщение (renderer
//                  ещё не отрисовал) → НЕ прятать окно раньше времени.
//   'hide'       — спрятать окно: нулевая высота ЛИБО положительная высота, но
//                  сообщений в main нет (осиротевший отчёт — иначе «невидимая стена»).
//   'show'       — показать/переставить окно (есть высота И есть сообщения).
//
// Ловушки, которые закрывает (см. mistakes/notifications-ribbon.md):
//   #26 (v0.89.27): renderer — источник истины terminal state (rendererPure).
//   v0.89.23: не прятать по «стале-0», если main уже знает о новом сообщении.
//   v1.2.106: НЕ показывать пустое окно при height>0 && items=0 (иначе прозрачное
//             окно ловит клики = «невидимая стена» до перезапуска).
export function decideNotifResize({ height, itemsCount, rendererPure } = {}) {
  const h = Math.round(Number(height) || 0)
  const items = Number(itemsCount) || 0
  if (h <= 0 && rendererPure) return 'clear-hide'
  if (h <= 0 && items > 0) return 'ignore'
  if (h <= 0) return 'hide'
  if (items === 0) return 'hide'
  return 'show'
}
