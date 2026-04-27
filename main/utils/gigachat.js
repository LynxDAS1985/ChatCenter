// v0.87.81: вынесено из main.js — GigaChat HTTPS без проверки SSL Сбербанка.
// Сбербанк использует нестандартный CA, поэтому rejectUnauthorized: false.
// Применяется ТОЛЬКО для запросов к gigachat.devices.sberbank.ru / ngw.devices.sberbank.ru.

import https from 'node:https'
import crypto from 'node:crypto'

const GIGACHAT_AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'
export const GIGACHAT_CHAT_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions'

const aiTokenCache = {}

export function httpsPostSkipSsl(url, bodyStr, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const agent = new https.Agent({ rejectUnauthorized: false })
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) },
      agent
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(data) }) }
        catch { reject(new Error(`GigaChat parse error: ${data.slice(0, 200)}`)) }
      })
    })
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}

export async function getGigaChatToken(clientId, clientSecret) {
  const cacheKey = `${clientId}:${clientSecret}`
  const cached = aiTokenCache[cacheKey]
  if (cached && cached.expires_at > Date.now() + 60000) return cached.access_token

  const credentials = Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString('base64')
  const result = await httpsPostSkipSsl(
    GIGACHAT_AUTH_URL,
    'scope=GIGACHAT_API_PERS',
    {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'RqUID': crypto.randomUUID()
    }
  )
  if (!result.ok || !result.data.access_token) {
    throw new Error(`GigaChat auth failed: ${result.data?.message || 'нет токена'}`)
  }
  aiTokenCache[cacheKey] = result.data
  return result.data.access_token
}
