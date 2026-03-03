# Авто-ответчик — ChatCenter

## Концепция

AutoReplyService получает каждое входящее сообщение, проверяет его по всем активным правилам,
и если правило срабатывает — отправляет ответ с задержкой.

---

## Типы правил

### 1. По ключевым словам (`keyword`)

Срабатывает, если в тексте сообщения есть ключевое слово или фраза.

```js
{
  type: 'keyword',
  keywords: ['цена', 'стоимость', 'сколько стоит'],
  matchType: 'any',    // 'any' = хотя бы одно, 'all' = все
  caseSensitive: false,
  replyType: 'template',
  templateId: 'price-info',
  delay: { min: 3, max: 7 }  // секунды
}
```

### 2. По расписанию (`schedule`)

Активен в определённые часы. Например, нерабочее время.

```js
{
  type: 'schedule',
  schedule: {
    days: [0, 6],           // 0=вс, 1=пн, ..., 6=сб
    from: '18:00',
    to: '09:00'
  },
  replyType: 'template',
  templateId: 'out-of-office',
  delay: { min: 1, max: 3 }
}
```

### 3. По чату (`chat`)

Авто-ответ только в определённых чатах.

```js
{
  type: 'chat',
  messengerId: 'telegram',
  chatIds: ['@support_channel', '123456789'],
  replyType: 'ai',
  aiPrompt: 'Отвечай как специалист по технической поддержке',
  delay: { min: 5, max: 10 }
}
```

---

## Логика обработки (AutoReplyService)

```
Входящее сообщение
        │
        ▼
Проверить: это исходящее? → ДА → Пропустить
        │ НЕТ
        ▼
Глобальный авто-ответ включён? → НЕТ → Пропустить
        │ ДА
        ▼
Перебрать правила (по приоритету):
  ┌─────────────────────────────────┐
  │ Для каждого активного правила:  │
  │ 1. Проверить тип правила        │
  │ 2. Проверить условие            │
  │ 3. Если совпало — выполнить     │
  │    и СТОП (первое совпадение)   │
  └─────────────────────────────────┘
        │ Нет совпадений
        ▼
     Пропустить
```

---

## AutoReplyService.js — скелет

```js
// main/services/AutoReplyService.js
class AutoReplyService {
  constructor({ store, aiService, messengerService }) {
    this.store = store
    this.aiService = aiService
    this.messengerService = messengerService
  }

  async handle(message) {
    // Пропускаем исходящие
    if (!message.isIncoming) return

    // Проверяем глобальный флаг
    const settings = this.store.get('settings')
    if (!settings.autoReplyEnabled) return

    // Получаем активные правила
    const rules = this.store.get('autoReplyRules', [])
      .filter(r => r.enabled)
      .sort((a, b) => (a.priority || 0) - (b.priority || 0))

    for (const rule of rules) {
      if (await this.matchesRule(rule, message)) {
        await this.executeRule(rule, message)
        break  // первое совпадение — стоп
      }
    }
  }

  async matchesRule(rule, message) {
    switch (rule.type) {
      case 'keyword':
        return this.matchKeyword(rule, message.text)
      case 'schedule':
        return this.matchSchedule(rule)
      case 'chat':
        return this.matchChat(rule, message)
      default:
        return false
    }
  }

  matchKeyword(rule, text) {
    const lowerText = rule.caseSensitive ? text : text.toLowerCase()
    const keywords = rule.keywords.map(k =>
      rule.caseSensitive ? k : k.toLowerCase()
    )
    if (rule.matchType === 'all') {
      return keywords.every(k => lowerText.includes(k))
    }
    return keywords.some(k => lowerText.includes(k))
  }

  matchSchedule(rule) {
    const now = new Date()
    const day = now.getDay()
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`

    if (!rule.schedule.days.includes(day)) return false

    const { from, to } = rule.schedule
    // Поддержка диапазона через полночь (18:00 - 09:00)
    if (from > to) {
      return time >= from || time <= to
    }
    return time >= from && time <= to
  }

  matchChat(rule, message) {
    if (rule.messengerId && rule.messengerId !== message.messengerId) return false
    if (!rule.chatIds || rule.chatIds.length === 0) return true
    return rule.chatIds.includes(message.chatId)
  }

  async executeRule(rule, message) {
    // Задержка
    const delay = rule.delay || { min: 2, max: 5 }
    const ms = (Math.random() * (delay.max - delay.min) + delay.min) * 1000
    await new Promise(r => setTimeout(r, ms))

    let replyText = ''

    if (rule.replyType === 'template') {
      const templates = this.store.get('templates', [])
      const tpl = templates.find(t => t.id === rule.templateId)
      replyText = tpl?.text || ''
    } else if (rule.replyType === 'ai') {
      const result = await this.aiService.reply(rule.aiPrompt, [message])
      replyText = result
    }

    if (replyText) {
      await this.messengerService.send(message.messengerId, message.chatId, replyText)
    }
  }
}
```

---

## Защита от циклов

- Помечать и игнорировать исходящие сообщения
- Хранить Set отправленных message.id за последние 60 секунд — не отвечать дважды
- Лимит: не более 1 авто-ответа на чат за X секунд (настраивается)

---

## Расписание (SchedulerService)

Для правил типа `schedule` — нет нужды в cron. AutoReplyService проверяет время в момент получения сообщения. Отдельный планировщик нужен только для:
- "Отправить в 10:00" (отложенные сообщения) — TODO
- Периодические рассылки — TODO (v2+)
