// shared/ozonSections.js — v1.2.500
//
// Разделы кабинета продавца Ozon и разбор метки уведомления. Общие данные и чистые расчёты —
// лежат в shared/ и не занимают бюджет строк экранов (правило проекта ADR-044).
//
// ЗАЧЕМ. Уведомления Ozon бывают трёх видов: сообщение покупателя, вопрос к товару и отзыв.
// Живут они в РАЗНЫХ разделах кабинета, поэтому переход по нажатию обязан знать, куда идти.

/**
 * Адреса разделов. Те же, что открывает быстрый виджет Ozon (src/native/components/OzonQuickWidget.jsx)
 * и фоновые страницы (src/App.jsx) — включая подраздел покупателей у «Сообщений»: без него
 * открывается не тот список (найдено ревью v1.2.499).
 */
export const OZON_SECTION_URL = {
  q: 'https://seller.ozon.ru/app/reviews/questions',
  rv: 'https://seller.ozon.ru/app/reviews',
  list: 'https://seller.ozon.ru/app/messenger?group=customers_v2',
}

/** Путь раздела без имени сайта и без параметров — для ТОЧНОГО сравнения «мы уже здесь?». */
export const OZON_SECTION_PATH = {
  q: '/app/reviews/questions',
  rv: '/app/reviews',
  list: '/app/messenger',
}

/**
 * Какой раздел открывать — по метке уведомления. Метку ставит сторож страницы
 * (main/preloads/hooks/ozon.hook.js) и она доезжает до нажатия как chatTag.
 * @param {string} chatTag — `ozon-q:<отпечаток>` (вопрос) / `ozon-rv:<…>` (отзыв) / `ozon-list:<…>` (чат)
 * @returns {'q'|'rv'|'list'} метки нет или она чужая → считаем чатом покупателя
 */
export function ozonSectionOf(chatTag) {
  const t = String(chatTag || '')
  if (t.startsWith('ozon-q:')) return 'q'
  if (t.startsWith('ozon-rv:')) return 'rv'
  return 'list'
}

/**
 * 🔴 ЛОВУШКА (ревью v1.2.499, исправлено в v1.2.500): сравнивать раздел ПОДСТРОКОЙ нельзя —
 * путь отзывов `/app/reviews` целиком входит в путь вопросов `/app/reviews/questions`.
 * Из-за этого, стоя на странице «Вопросы», программа считала, что она уже в «Отзывах», и
 * никуда не переходила. Сравниваем ТОЧНО, с точностью до завершающей косой черты.
 * @param {string} pathname — location.pathname текущей страницы
 * @param {'q'|'rv'|'list'} section
 */
export function ozonHereAlready(pathname, section) {
  const want = OZON_SECTION_PATH[section]
  if (!want) return false
  const p = String(pathname || '').replace(/\/+$/, '')
  return p === want
}

/**
 * Название товара для поиска строки: чистим пробелы и хвостовое многоточие.
 *
 * 🔴 ЛОВУШКА (ревью v1.2.499, исправлено в v1.2.500): раньше здесь обрезалось до 25 символов, и у
 * товаров одной линейки («Ремень генератора Contitech 10PK1555» и «…10PK1600») строка поиска
 * получалась ОДИНАКОВОЙ — открывался чужой товар, причём с отчётом «успех». Название приходит в
 * уведомление ЦЕЛИКОМ (сторож берёт textContent ссылки), многоточие рисует только оформление —
 * значит резать его нам незачем. Короткий запасной вариант — ниже, в ozonNeedleShort.
 */
export function ozonNeedle(senderName) {
  return String(senderName || '').replace(/\s+/g, ' ').replace(/[.…\s]+$/, '').trim()
}

/** Сколько символов берёт ЗАПАСНОЙ короткий поиск, если по полному названию ничего не нашлось. */
export const OZON_MATCH_LEN = 40

/** Запасное начало названия — на случай, если на странице текст записан иначе (перенос, лишний знак). */
export function ozonNeedleShort(senderName) {
  return ozonNeedle(senderName).slice(0, OZON_MATCH_LEN)
}
