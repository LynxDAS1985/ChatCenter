// v0.82.2: AI IPC handlers — вынесены из main.js для уменьшения размера файла
// Стриминг (SSE) + обычная генерация для 4 провайдеров: OpenAI, Anthropic, DeepSeek, ГигаЧат
import { ipcMain } from 'electron'

// Зависимости передаются через init() из main.js
let _httpsPostSkipSsl, _getGigaChatToken, _ruError, _GIGACHAT_CHAT_URL

export function initAIHandlers({ httpsPostSkipSsl, getGigaChatToken, ruError, GIGACHAT_CHAT_URL }) {
  _httpsPostSkipSsl = httpsPostSkipSsl
  _getGigaChatToken = getGigaChatToken
  _ruError = ruError
  _GIGACHAT_CHAT_URL = GIGACHAT_CHAT_URL

  // SSE-парсер: читает ReadableStream и вызывает onChunk для каждого фрагмента
  const pipeSSE = async (reader, extractFn, chunk) => {
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { done: d, value } = await reader.read()
      if (d) break
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

  // ── Стриминг (SSE) ──────────────────────────────────────────────────────────
  ipcMain.on('ai:generate-stream', async (event, { messages, settings: aiCfg, requestId }) => {
    const { provider, apiKey, clientSecret, model, systemPrompt } = aiCfg || {}
    const send = (ch, payload) => { if (!event.sender.isDestroyed()) event.sender.send(ch, payload) }
    const chunk = (c) => send('ai:stream-chunk', { requestId, chunk: c })
    const done = () => send('ai:stream-done', { requestId })
    const errOut = (e) => send('ai:stream-error', { requestId, error: _ruError(e) })

    try {
      if (provider === 'anthropic') {
        if (!apiKey) { errOut('Укажите API-ключ Anthropic (sk-ant-...)'); return }
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: model || 'claude-haiku-4-5-20251001', max_tokens: 1024, stream: true, system: systemPrompt || '', messages })
        })
        if (!resp.ok) { const d = await resp.json(); errOut(d.error?.message || `HTTP ${resp.status}`); return }
        await pipeSSE(resp.body.getReader(), p => p.delta?.text || '', chunk)
        done()
      } else if (provider === 'deepseek') {
        if (!apiKey) { errOut('Укажите API-ключ DeepSeek'); return }
        const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: model || 'deepseek-chat', stream: true, messages: [{ role: 'system', content: systemPrompt || '' }, ...messages] })
        })
        if (!resp.ok) { const d = await resp.json(); errOut(d.error?.message || `HTTP ${resp.status}`); return }
        await pipeSSE(resp.body.getReader(), p => p.choices?.[0]?.delta?.content || '', chunk)
        done()
      } else if (provider === 'gigachat') {
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
      } else {
        if (!apiKey) { errOut('Укажите API-ключ OpenAI (sk-...)'); return }
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: model || 'gpt-4o-mini', stream: true, messages: [{ role: 'system', content: systemPrompt || '' }, ...messages] })
        })
        if (!resp.ok) { const d = await resp.json(); errOut(d.error?.message || `HTTP ${resp.status}`); return }
        await pipeSSE(resp.body.getReader(), p => p.choices?.[0]?.delta?.content || '', chunk)
        done()
      }
    } catch (e) { errOut(e.message) }
  })

  // ── Обычная генерация (без стриминга) ───────────────────────────────────────
  ipcMain.handle('ai:generate', async (event, { messages, settings: aiCfg }) => {
    const { provider, apiKey, clientSecret, model, systemPrompt } = aiCfg || {}
    try {
      if (provider === 'anthropic') {
        if (!apiKey) return { ok: false, error: 'Укажите API-ключ Anthropic (sk-ant-...)' }
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: model || 'claude-haiku-4-5-20251001', max_tokens: 1024, system: systemPrompt || '', messages })
        })
        const data = await resp.json()
        if (data.error) return { ok: false, error: _ruError(data.error.message || JSON.stringify(data.error)) }
        return { ok: true, result: data.content?.[0]?.text || '' }
      } else if (provider === 'deepseek') {
        if (!apiKey) return { ok: false, error: 'Укажите API-ключ DeepSeek' }
        const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: model || 'deepseek-chat', messages: [{ role: 'system', content: systemPrompt || '' }, ...messages] })
        })
        const data = await resp.json()
        if (data.error) return { ok: false, error: _ruError(data.error.message || JSON.stringify(data.error)) }
        return { ok: true, result: data.choices?.[0]?.message?.content || '' }
      } else if (provider === 'gigachat') {
        if (!apiKey || !clientSecret) return { ok: false, error: 'Укажите Client ID и Client Secret ГигаЧат' }
        const token = await _getGigaChatToken(apiKey.trim(), clientSecret.trim())
        const sysMsg = systemPrompt ? [{ role: 'system', content: systemPrompt }] : []
        const result = await _httpsPostSkipSsl(_GIGACHAT_CHAT_URL,
          JSON.stringify({ model: model || 'GigaChat', messages: [...sysMsg, ...messages] }),
          { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        )
        if (!result.ok) return { ok: false, error: _ruError(result.data?.error?.message || 'HTTP ошибка') }
        return { ok: true, result: result.data.choices?.[0]?.message?.content || '' }
      } else {
        if (!apiKey) return { ok: false, error: 'Укажите API-ключ OpenAI (sk-...)' }
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt || '' }, ...messages] })
        })
        const data = await resp.json()
        if (data.error) return { ok: false, error: _ruError(data.error.message || JSON.stringify(data.error)) }
        return { ok: true, result: data.choices?.[0]?.message?.content || '' }
      }
    } catch (e) { return { ok: false, error: _ruError(e.message) } }
  })
}
