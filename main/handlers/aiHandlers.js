// v0.83.1: AI IPC handlers — refactored: провайдеры через конфиг, без дублирования
import { ipcMain } from 'electron'

let _httpsPostSkipSsl, _getGigaChatToken, _ruError, _GIGACHAT_CHAT_URL

// Конфигурация провайдеров — один раз, для streaming и обычной генерации
const PROVIDERS = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-haiku-4-5-20251001',
    keyError: 'Укажите API-ключ Anthropic (sk-ant-...)',
    headers: (apiKey) => ({ 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }),
    body: (model, messages, systemPrompt, stream) => ({ model, max_tokens: 1024, ...(stream ? { stream: true } : {}), system: systemPrompt || '', messages }),
    extractStream: (p) => p.delta?.text || '',
    extractResult: (data) => data.content?.[0]?.text || '',
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    keyError: 'Укажите API-ключ DeepSeek',
    headers: (apiKey) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }),
    body: (model, messages, systemPrompt, stream) => ({ model, ...(stream ? { stream: true } : {}), messages: [{ role: 'system', content: systemPrompt || '' }, ...messages] }),
    extractStream: (p) => p.choices?.[0]?.delta?.content || '',
    extractResult: (data) => data.choices?.[0]?.message?.content || '',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    keyError: 'Укажите API-ключ OpenAI (sk-...)',
    headers: (apiKey) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }),
    body: (model, messages, systemPrompt, stream) => ({ model, ...(stream ? { stream: true } : {}), messages: [{ role: 'system', content: systemPrompt || '' }, ...messages] }),
    extractStream: (p) => p.choices?.[0]?.delta?.content || '',
    extractResult: (data) => data.choices?.[0]?.message?.content || '',
  },
}

// SSE-парсер: читает ReadableStream и вызывает onChunk для каждого фрагмента
async function pipeSSE(reader, extractFn, chunk) {
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') continue
      try { const c = extractFn(JSON.parse(raw)); if (c) chunk(c) } catch {}
    }
  }
}

export function initAIHandlers({ httpsPostSkipSsl, getGigaChatToken, ruError, GIGACHAT_CHAT_URL }) {
  _httpsPostSkipSsl = httpsPostSkipSsl
  _getGigaChatToken = getGigaChatToken
  _ruError = ruError
  _GIGACHAT_CHAT_URL = GIGACHAT_CHAT_URL

  // ── Стриминг (SSE) ──
  ipcMain.on('ai:generate-stream', async (event, { messages, settings: aiCfg, requestId }) => {
    const { provider, apiKey, clientSecret, model, systemPrompt } = aiCfg || {}
    const send = (ch, payload) => { if (!event.sender.isDestroyed()) event.sender.send(ch, payload) }
    const chunk = (c) => send('ai:stream-chunk', { requestId, chunk: c })
    const done = () => send('ai:stream-done', { requestId })
    const errOut = (e) => send('ai:stream-error', { requestId, error: _ruError(e) })

    try {
      // ГигаЧат — без стриминга (SSL-bypass не поддерживает ReadableStream)
      if (provider === 'gigachat') {
        if (!apiKey || !clientSecret) { errOut('Укажите Client ID и Client Secret ГигаЧат'); return }
        const token = await _getGigaChatToken(apiKey.trim(), clientSecret.trim())
        const sysMsg = systemPrompt ? [{ role: 'system', content: systemPrompt }] : []
        const result = await _httpsPostSkipSsl(_GIGACHAT_CHAT_URL,
          JSON.stringify({ model: model || 'GigaChat', messages: [...sysMsg, ...messages] }),
          { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        )
        if (!result.ok) { errOut(result.data?.error?.message || 'HTTP ошибка'); return }
        const text = result.data.choices?.[0]?.message?.content || ''
        if (text) chunk(text)
        done()
        return
      }
      // OpenAI / Anthropic / DeepSeek — через SSE
      const cfg = PROVIDERS[provider] || PROVIDERS.openai
      if (!apiKey) { errOut(cfg.keyError); return }
      const resp = await fetch(cfg.url, {
        method: 'POST', headers: cfg.headers(apiKey),
        body: JSON.stringify(cfg.body(model || cfg.defaultModel, messages, systemPrompt, true))
      })
      if (!resp.ok) { const d = await resp.json(); errOut(d.error?.message || `HTTP ${resp.status}`); return }
      await pipeSSE(resp.body.getReader(), cfg.extractStream, chunk)
      done()
    } catch (e) { errOut(e.message) }
  })

  // ── Обычная генерация ──
  ipcMain.handle('ai:generate', async (event, { messages, settings: aiCfg }) => {
    const { provider, apiKey, clientSecret, model, systemPrompt } = aiCfg || {}
    try {
      if (provider === 'gigachat') {
        if (!apiKey || !clientSecret) return { ok: false, error: 'Укажите Client ID и Client Secret ГигаЧат' }
        const token = await _getGigaChatToken(apiKey.trim(), clientSecret.trim())
        const sysMsg = systemPrompt ? [{ role: 'system', content: systemPrompt }] : []
        const result = await _httpsPostSkipSsl(_GIGACHAT_CHAT_URL,
          JSON.stringify({ model: model || 'GigaChat', messages: [...sysMsg, ...messages] }),
          { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        )
        if (!result.ok) return { ok: false, error: _ruError(result.data?.error?.message || 'HTTP ошибка') }
        return { ok: true, result: result.data.choices?.[0]?.message?.content || '' }
      }
      const cfg = PROVIDERS[provider] || PROVIDERS.openai
      if (!apiKey) return { ok: false, error: cfg.keyError }
      const resp = await fetch(cfg.url, {
        method: 'POST', headers: cfg.headers(apiKey),
        body: JSON.stringify(cfg.body(model || cfg.defaultModel, messages, systemPrompt, false))
      })
      const data = await resp.json()
      if (data.error) return { ok: false, error: _ruError(data.error.message || JSON.stringify(data.error)) }
      return { ok: true, result: cfg.extractResult(data) }
    } catch (e) { return { ok: false, error: _ruError(e.message) } }
  })
}
