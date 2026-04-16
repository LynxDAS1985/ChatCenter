// v0.87.35: тест LRU-квоты для tg-media — проверяем логику в изоляции.
// Создаёт временную директорию с файлами разных размеров и времён,
// имитирует логику cleanup-media (по возрасту + LRU).

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 LRU-квота tg-media\n')

// Повторяем логику из telegramHandler.js cleanup
function cleanupMedia(dir, { maxDays = 30, maxBytes = 2 * 1024 * 1024 * 1024 } = {}) {
  const entries = []
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f)
    const st = fs.statSync(fp)
    entries.push({ fp, size: st.size, mtime: st.mtimeMs })
  }
  const cutoff = Date.now() - maxDays * 86400000
  let removed = 0, bytesFree = 0
  for (const e of entries) {
    if (e.mtime < cutoff) {
      fs.unlinkSync(e.fp); bytesFree += e.size; removed++; e.deleted = true
    }
  }
  const remaining = entries.filter(e => !e.deleted).sort((a, b) => a.mtime - b.mtime)
  let totalSize = remaining.reduce((s, e) => s + e.size, 0)
  for (const e of remaining) {
    if (totalSize <= maxBytes) break
    fs.unlinkSync(e.fp); totalSize -= e.size; bytesFree += e.size; removed++
  }
  return { removed, bytesFree, totalSize }
}

function mkTempDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-media-test-'))
  return d
}

function mkFile(dir, name, sizeBytes, ageDays = 0) {
  const fp = path.join(dir, name)
  fs.writeFileSync(fp, Buffer.alloc(sizeBytes))
  if (ageDays > 0) {
    const mtime = (Date.now() - ageDays * 86400000) / 1000
    fs.utimesSync(fp, mtime, mtime)
  }
  return fp
}

test('удаляет файлы старше maxDays', () => {
  const dir = mkTempDir()
  try {
    mkFile(dir, 'old.jpg', 1024, 40)  // 40 дней
    mkFile(dir, 'fresh.jpg', 1024, 5)  // 5 дней
    const r = cleanupMedia(dir, { maxDays: 30, maxBytes: Infinity })
    assert(r.removed === 1, `удалён должен быть 1, реально: ${r.removed}`)
    assert(fs.existsSync(path.join(dir, 'fresh.jpg')), 'fresh.jpg должен остаться')
    assert(!fs.existsSync(path.join(dir, 'old.jpg')), 'old.jpg должен быть удалён')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('LRU: удаляет самый старый файл когда превышен maxBytes', () => {
  const dir = mkTempDir()
  try {
    mkFile(dir, 'a.jpg', 1000, 3)  // старейший
    mkFile(dir, 'b.jpg', 1000, 2)
    mkFile(dir, 'c.jpg', 1000, 1)  // свежайший
    // Квота 2500 байт → должен удалить 1 файл (самый старый)
    const r = cleanupMedia(dir, { maxDays: 1000, maxBytes: 2500 })
    assert(r.removed === 1, `должно быть удалено 1, реально: ${r.removed}`)
    assert(!fs.existsSync(path.join(dir, 'a.jpg')), 'a.jpg самый старый — должен быть удалён')
    assert(fs.existsSync(path.join(dir, 'b.jpg')), 'b.jpg должен остаться')
    assert(fs.existsSync(path.join(dir, 'c.jpg')), 'c.jpg должен остаться')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('LRU: не удаляет если общий размер ≤ maxBytes', () => {
  const dir = mkTempDir()
  try {
    mkFile(dir, 'a.jpg', 500, 3)
    mkFile(dir, 'b.jpg', 500, 2)
    const r = cleanupMedia(dir, { maxDays: 1000, maxBytes: 2000 })
    assert(r.removed === 0, `ничего не должно быть удалено, реально: ${r.removed}`)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('LRU + возраст комбинируются', () => {
  const dir = mkTempDir()
  try {
    mkFile(dir, 'ancient.jpg', 1000, 40)  // удалить по возрасту
    mkFile(dir, 'old.jpg', 1000, 3)       // удалить по LRU (остаётся 3000 из 1500 квоты)
    mkFile(dir, 'mid.jpg', 1000, 2)
    mkFile(dir, 'new.jpg', 1000, 1)
    const r = cleanupMedia(dir, { maxDays: 30, maxBytes: 1500 })
    // ancient удалён по возрасту, old удалён по LRU (3000 - 1000 = 2000 > 1500, ещё одно → 1000 ≤ 1500)
    assert(r.removed >= 3, `должно быть удалено ≥ 3, реально: ${r.removed}`)
    assert(fs.existsSync(path.join(dir, 'new.jpg')), 'new.jpg самый новый должен остаться')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('пустая директория — без ошибок', () => {
  const dir = mkTempDir()
  try {
    const r = cleanupMedia(dir)
    assert(r.removed === 0)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
