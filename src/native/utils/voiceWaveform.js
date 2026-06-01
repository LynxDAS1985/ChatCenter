// v0.95.25: декодер TDLib voice waveform.
//
// TDLib для голосовых сообщений возвращает `voice_note.waveform` — байтовую
// строку (base64 в JSON), содержащую N sample'ов по 5 бит каждый. Это готовая
// сэмплированная огибающая аудио от Telegram (~100 столбиков).
//
// Структура: байт за байтом, big-endian биты. Каждый sample = 0..31 (5 бит).
// Для извлечения i-го sample'а:
//   bitOffset = i * 5
//   byteIndex = floor(bitOffset / 8)
//   bitInByte = bitOffset % 8
//   sample = ((bytes[byteIndex] << bitInByte) | (bytes[byteIndex+1] >> (8 - bitInByte))) >> 3
//   sample &= 0x1F  // только нижние 5 бит
//
// Источник: TDLib `voiceNote.waveform` spec + реализация в Telegram Web K
// (tweb/src/components/audio/audioWaveform.ts).
//
// Возвращает массив амплитуд 0..1 (нормализованных, готовых для рисования).
// Если waveform null/invalid — возвращает пустой массив (UI fallback на простой плеер).

/**
 * Декодирует base64-строку waveform от TDLib в массив амплитуд 0..1.
 * @param {string|Uint8Array} waveform - base64-строка или Uint8Array от TDLib
 * @param {number} targetCount - сколько столбиков нужно (default 50 — оптимум для UI)
 * @returns {number[]} массив амплитуд 0..1 (длина = targetCount)
 */
export function decodeWaveform(waveform, targetCount = 50) {
  if (!waveform) return []
  const bytes = toUint8Array(waveform)
  if (!bytes || bytes.length === 0) return []

  // Извлекаем ВСЕ sample'ы (по 5 бит каждый).
  const totalSamples = Math.floor((bytes.length * 8) / 5)
  if (totalSamples === 0) return []

  const samples = new Array(totalSamples)
  for (let i = 0; i < totalSamples; i++) {
    samples[i] = extractSample(bytes, i)
  }

  // Downsample/upsample к targetCount. Group-average для downsample.
  if (totalSamples === targetCount) {
    return samples.map(s => s / 31)
  }
  return resample(samples, targetCount).map(s => s / 31)
}

/**
 * Безопасно конвертирует input в Uint8Array.
 * Поддерживает: Uint8Array, base64-строку, массив чисел.
 */
function toUint8Array(input) {
  if (input instanceof Uint8Array) return input
  if (Array.isArray(input)) return new Uint8Array(input)
  if (typeof input === 'string') {
    try {
      // base64 → bytes (browser API atob, в Node — Buffer)
      if (typeof atob === 'function') {
        const binary = atob(input)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return bytes
      }
      // Node fallback
      if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(input, 'base64'))
      }
    } catch (_) {
      return null
    }
  }
  return null
}

/**
 * Извлекает i-й 5-битный sample из байтового массива.
 * Cross-byte boundary через сдвиги — sample может пересекать два байта.
 */
function extractSample(bytes, i) {
  const bitOffset = i * 5
  const byteIndex = Math.floor(bitOffset / 8)
  const bitInByte = bitOffset % 8
  if (byteIndex >= bytes.length) return 0
  const b0 = bytes[byteIndex] || 0
  const b1 = bytes[byteIndex + 1] || 0
  // Big-endian: верхние биты b0 ← нижние биты b1.
  // sample занимает 5 бит, начиная с bitInByte позиции b0.
  // Если bitInByte=3, то sample = b0[3..7] + b1[0..0] (5 битов).
  const combined = ((b0 << 8) | b1) >>> 0  // 16-bit unsigned
  // Смещаем чтобы 5 нужных бит оказались в нижних разрядах.
  const shifted = combined >> (16 - bitInByte - 5)
  return shifted & 0x1F
}

/**
 * Простой downsample/upsample массива.
 * Downsample: group-average по равным окнам (предотвращает aliasing).
 * Upsample: повторение значений (для очень коротких записей).
 */
function resample(samples, targetCount) {
  if (samples.length === 0 || targetCount === 0) return []
  if (samples.length === targetCount) return samples.slice()

  const result = new Array(targetCount)
  const ratio = samples.length / targetCount

  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.floor((i + 1) * ratio)
    if (end <= start) {
      // upsample case: одна нативная точка → несколько result-точек
      result[i] = samples[Math.min(start, samples.length - 1)] || 0
      continue
    }
    // downsample: усредняем точки в окне
    let sum = 0
    let count = 0
    for (let j = start; j < end && j < samples.length; j++) {
      sum += samples[j]
      count++
    }
    result[i] = count > 0 ? sum / count : 0
  }
  return result
}
