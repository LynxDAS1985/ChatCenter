/**
 * Звуковые уведомления (Web Audio API)
 * Уникальная тональность для каждого мессенджера по цвету.
 */

const MESSENGER_SOUNDS = {
  '#2AABEE': { f1: 1047, f2: 1319, type: 'sine' },       // Telegram — C6 + E6
  '#25D366': { f1: 784,  f2: 1175, type: 'sine' },       // WhatsApp — G5 + D6
  '#4C75A3': { f1: 659,  f2: 880,  type: 'triangle' },   // VK — E5 + A5
  '#E1306C': { f1: 988,  f2: 1397, type: 'sine' },       // Instagram — B5 + F6
  '#5865F2': { f1: 740,  f2: 1109, type: 'triangle' },   // Discord — F#5 + C#6
  '#7360F2': { f1: 831,  f2: 1245, type: 'sine' },       // Viber — G#5 + D#6
  '#00AAFF': { f1: 880,  f2: 1320, type: 'sine' },       // Авито — A5 + E6
  '#A855F7': { f1: 932,  f2: 1175, type: 'triangle' },   // Wildberries — A#5 + D6
  '#005BFF': { f1: 698,  f2: 1047, type: 'sine' },       // Ozon — F5 + C6
  '#2688EB': { f1: 784,  f2: 1047, type: 'triangle' },   // Макс — G5 + C6
}

export function getSoundForColor(color) {
  if (color && MESSENGER_SOUNDS[color]) return MESSENGER_SOUNDS[color]
  let hash = 0
  for (let i = 0; i < (color || '').length; i++) hash = ((hash << 5) - hash + color.charCodeAt(i)) | 0
  const f1 = 600 + Math.abs(hash % 500)
  const f2 = f1 + 200 + Math.abs((hash >> 8) % 300)
  return { f1, f2, type: Math.abs(hash) % 2 === 0 ? 'sine' : 'triangle' }
}

export function playNotificationSound(color) {
  try {
    const { f1, f2, type } = getSoundForColor(color)
    const ctx = new AudioContext()
    const t = ctx.currentTime
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = type
    osc1.frequency.value = f1
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    gain1.gain.setValueAtTime(0.15, t)
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    osc1.start(t)
    osc1.stop(t + 0.12)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = type
    osc2.frequency.value = f2
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    gain2.gain.setValueAtTime(0, t)
    gain2.gain.setValueAtTime(0.12, t + 0.08)
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.23)
    osc2.start(t + 0.08)
    osc2.stop(t + 0.23)
  } catch {}
}
