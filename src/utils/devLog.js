/**
 * Условный логгер — console.log только в development mode.
 * В production ничего не выводит.
 */

const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development'

export const devLog = isDev ? console.log.bind(console) : () => {}
export const devWarn = isDev ? console.warn.bind(console) : () => {}
export const devError = console.error.bind(console) // ошибки всегда показываем
