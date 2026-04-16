// v0.87.32: форсируем UTC для Date.toLocaleTimeString / toLocaleDateString
// в vitest, чтобы snapshot-тесты не зависели от часового пояса машины.
// Без этого CI (UTC) и локальная разработка (например MSK +3) дают разные
// результаты «19:33» vs «00:33» и snapshots падают.

const _time = Date.prototype.toLocaleTimeString
const _date = Date.prototype.toLocaleDateString
const _string = Date.prototype.toLocaleString

Date.prototype.toLocaleTimeString = function (locale, opts = {}) {
  return _time.call(this, locale, { ...opts, timeZone: 'UTC' })
}
Date.prototype.toLocaleDateString = function (locale, opts = {}) {
  return _date.call(this, locale, { ...opts, timeZone: 'UTC' })
}
Date.prototype.toLocaleString = function (locale, opts = {}) {
  return _string.call(this, locale, { ...opts, timeZone: 'UTC' })
}
