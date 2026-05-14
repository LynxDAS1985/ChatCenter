// v0.88.x: Forum topics IPC handlers — вынесено из telegramChatsIpc.js
// (тот файл уже за лимитом 500 строк, см. fileSizeLimits.test.cjs).
//
// Содержит:
//  - tg:get-forum-topics — список тем форум-группы через channels.getForumTopics
//    + кэширование custom emoji иконок (cc-media://media/custom_emoji_*).
//  - tg:mark-topic-read — отдельный read-cursor для темы через messages.readDiscussion
//    (НЕ переиспользуем tg:mark-read — у форум-тем своя ветка непрочитанных).
//
// Helpers (mediaCacheDir, extensionForDocument, cacheCustomEmojiDocument) тоже здесь,
// потому что они используются только в forum-topics handler.
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { state, chatEntityMap, log, Api, getClientForChat } from './telegramState.js'
import { mapMessage } from './telegramMessageMapper.js'

function mediaCacheDir() {
  const base = state.cachePath ? path.dirname(state.cachePath) : process.cwd()
  const dir = path.join(base, 'tg-media')
  try { fs.mkdirSync(dir, { recursive: true }) } catch (_) {}
  return dir
}

function extensionForDocument(doc) {
  const mime = String(doc?.mimeType || '').toLowerCase()
  if (mime.includes('webp')) return '.webp'
  if (mime.includes('png')) return '.png'
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg'
  if (mime.includes('webm')) return '.webm'
  if (mime.includes('x-tgsticker')) return '.tgs'
  return '.bin'
}

async function cacheCustomEmojiDocument(client, doc) {
  const id = String(doc?.id || '')
  if (!client || !doc || !id) return null
  const ext = extensionForDocument(doc)
  const fileName = `custom_emoji_${id}${ext}`
  const filePath = path.join(mediaCacheDir(), fileName)
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    return { url: `cc-media://media/${encodeURIComponent(fileName)}`, mimeType: doc.mimeType || '', ext }
  }
  try {
    const buf = await client.downloadMedia(doc, {})
    if (!buf || !buf.length) return null
    fs.writeFileSync(filePath, buf)
    return { url: `cc-media://media/${encodeURIComponent(fileName)}`, mimeType: doc.mimeType || '', ext }
  } catch (e) {
    log(`forum-topics emoji download err: id=${id} ${e.message}`)
    return null
  }
}

export function initForumTopicsHandlers() {
  // Forum topics have their own read cursor. Do not use flat tg:mark-read for them.
  ipcMain.handle('tg:mark-topic-read', async (_, { chatId, topicId, topMessageId, maxId }) => {
    try {
      const client = getClientForChat(chatId)
      if (!client) return { ok: false, error: 'Не подключён' }
      const entity = chatEntityMap.get(chatId)
      if (!entity) return { ok: false, error: 'Чат не найден в кеше' }
      const topicRootId = Number(topicId || topMessageId)
      const readMaxId = Number(maxId) || 0
      if (!topicRootId) return { ok: false, error: 'Не выбрана тема' }
      await client.invoke(new Api.messages.ReadDiscussion({
        peer: entity,
        msgId: topicRootId,
        readMaxId,
      }))
      log(`mark-topic-read OK: chat=${chatId} topic=${topicRootId} maxId=${readMaxId || 'all'}`)
      return { ok: true, topicId: String(topicRootId), maxId: readMaxId }
    } catch (e) {
      log(`mark-topic-read error: chat=${chatId} topic=${topicId || topMessageId} ${e.message}`)
      return { ok: false, error: e.message }
    }
  })

  // Non-forum chats return isForum=false so the renderer can keep the normal chat list.
  ipcMain.handle('tg:get-forum-topics', async (_, { chatId, limit = 50, offsetDate = 0, offsetId = 0, offsetTopic = 0 }) => {
    try {
      const client = getClientForChat(chatId)
      if (!client) return { ok: false, error: 'Не подключён', isForum: false, topics: [] }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      const res = await client.invoke(new Api.channels.GetForumTopics({
        channel: entity,
        q: '',
        offsetDate: Number(offsetDate) || 0,
        offsetId: Number(offsetId) || 0,
        offsetTopic: Number(offsetTopic) || 0,
        limit: Number(limit) || 50,
      }))
      const messageById = new Map((res.messages || []).map(m => [String(m.id), m]))
      const emojiIds = [...new Set((res.topics || [])
        .filter(t => t.className === 'ForumTopic' && t.iconEmojiId)
        .map(t => String(t.iconEmojiId)))]
      const emojiById = new Map()
      if (emojiIds.length) {
        try {
          const docs = await client.invoke(new Api.messages.GetCustomEmojiDocuments({
            documentId: emojiIds,
          }))
          for (const doc of docs || []) {
            const attr = doc.attributes?.find(a => a.className === 'DocumentAttributeCustomEmoji')
            const cached = await cacheCustomEmojiDocument(client, doc)
            emojiById.set(String(doc.id), {
              alt: attr?.alt || '',
              url: cached?.url || '',
              mimeType: cached?.mimeType || doc.mimeType || '',
              ext: cached?.ext || extensionForDocument(doc),
            })
          }
        } catch (emojiErr) {
          log(`forum-topics emoji err: chat=${chatId} ${emojiErr.message}`)
        }
      }
      const topics = (res.topics || [])
        .filter(t => t.className === 'ForumTopic')
        .map(t => {
          const topicRootId = String(t.id)
          const lastMessageId = String(t.topMessage || t.id)
          const previewMsg = messageById.get(lastMessageId)
          return {
            id: String(t.id),
            topicId: String(t.id),
            topMessageId: topicRootId,
            lastMessageId,
            chatId,
            title: t.title || 'Тема',
            iconEmoji: t.iconEmojiId ? (emojiById.get(String(t.iconEmojiId))?.alt || '') : '',
            iconEmojiUrl: t.iconEmojiId ? (emojiById.get(String(t.iconEmojiId))?.url || '') : '',
            iconEmojiMimeType: t.iconEmojiId ? (emojiById.get(String(t.iconEmojiId))?.mimeType || '') : '',
            iconEmojiId: t.iconEmojiId ? String(t.iconEmojiId) : null,
            iconColor: t.iconColor || null,
            readInboxMaxId: Number(t.readInboxMaxId || 0),
            readOutboxMaxId: Number(t.readOutboxMaxId || 0),
            unreadCount: Number(t.unreadCount || 0),
            unreadMentionsCount: Number(t.unreadMentionsCount || 0),
            unreadReactionsCount: Number(t.unreadReactionsCount || 0),
            lastMessage: previewMsg ? mapMessage(previewMsg, chatId).text : '',
            lastMessageTs: previewMsg?.date ? previewMsg.date * 1000 : (t.date ? t.date * 1000 : 0),
            isPinned: !!t.pinned,
            isClosed: !!t.closed,
            isHidden: !!t.hidden,
          }
        })
      log(`forum-topics: chat=${chatId} topics=${topics.length} count=${res.count || topics.length}`)
      return { ok: true, isForum: true, topics, count: res.count || topics.length }
    } catch (e) {
      const msg = e?.message || String(e)
      if (/CHANNEL_FORUM_MISSING/i.test(msg)) {
        log(`forum-topics: chat=${chatId} not-forum`)
        return { ok: true, isForum: false, topics: [] }
      }
      log(`forum-topics err: chat=${chatId} ${msg}`)
      return { ok: false, error: msg, isForum: false, topics: [] }
    }
  })
}
