// shared/openPageWatch.js — v1.2.491
//
// ЧИСТАЯ логика присмотра за ОТКРЫТОЙ страницей мессенджера («пациент на столе»).
// Проводка (счётчики, подписка на пульс) — src/hooks/useOpenPageWatch.js.
//
// ЗАЧЕМ. Механизм переподключения (reconnectPlan.js) видит только СОРВАВШУЮСЯ ЗАГРУЗКУ: по
// документации Electron события did-fail-load / did-finish-load — про навигацию. Если страница
// уже открыта и интернет пропал, никакой навигации нет — программа этого не замечала вовсе
// (журнал 21–22.09.2026: у открытых Telegram Web и WhatsApp при обрыве — ни одной строки).
// Единственный, кто это видит, — «пробы здоровья» (fetch внутри страницы, раз в 30–300 с), но они
// только красили кружок в панели. Теперь их исход решает судьбу страницы — вот правило:
//
//   проба прошла            → всё хорошо, счётчик провалов = 0
//   1-й провал              → наблюдаем (мессенджеры сами переподключаются, не мешаем)
//   2-й провал, интернет ЕСТЬ (пульс) → страница зависла → перезагрузить по лестнице (5 с … )
//   2-й провал, интернета НЕТ          → показать экран «Нет интернета», страницу НЕ трогать;
//                                        когда пульс скажет «появился» — сначала спросим страницу,
//                                        ожила ли сама, и только потом перезагрузим
//
// Почему два провала, а не один: одна неудачная проба бывает и при живом интернете (сайт
// тормознул, окно свернуто); перезагрузка стирает недописанный текст — цена ошибки высокая.

export const OPEN_PAGE_FAILS_TO_ACT = 2

/**
 * @param {{fails:number, ok:boolean, netOnline:boolean|null, alreadyWatched:boolean}} p
 *   fails — провалов подряд ВКЛЮЧАЯ текущий; netOnline — вердикт пульса (null = неизвестно);
 *   alreadyWatched — у мессенджера уже есть запись переподключения (экран показан)
 * @returns {'clear'|'watch'|'stuck'|'net-down'|'none'}
 */
export function decideProbe({ fails, ok, netOnline, alreadyWatched }) {
  if (ok) return 'clear'
  if (alreadyWatched) return 'none'           // уже под присмотром механизма повторов — не дублируем
  if ((fails || 0) < OPEN_PAGE_FAILS_TO_ACT) return 'watch'
  return netOnline === false ? 'net-down' : 'stuck'
}

export function logWatchLine(name, fails) {
  return `[open-page] ${name}: проба не прошла (${fails} из ${OPEN_PAGE_FAILS_TO_ACT}) — наблюдаем, страницу не трогаем`
}
export function logStuckLine(name) {
  return `[open-page] ${name}: страница не отвечает ${OPEN_PAGE_FAILS_TO_ACT} пробы подряд при живом интернете → передаю механизму повторов (перезагрузка по лестнице)`
}
export function logNetDownLine(name) {
  return `[open-page] ${name}: страница не отвечает и интернета нет → показываю «Нет интернета», страницу не трогаю до возврата сети`
}
export function logRecoveredLine(name, fails) {
  return `[open-page] ${name}: проба снова проходит (было провалов: ${fails})`
}
