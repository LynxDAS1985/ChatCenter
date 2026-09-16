# Telegram forum/group topics investigation

**Created**: 2026-05-12  
**Status**: Investigation open  
**Scope**: Native CenterChats, Telegram API accounts, forum/supergroup topics.

---

## Problem

In native CenterChats a Telegram group like `parts-soft-ru` opens as one chat and immediately shows messages. In Telegram WebView the same group opens as a forum-style group with a topic list/menu, for example separate topics like "Обмен опытом + MAX", "Проблемы с кроссами / ...", "Флуд" and others.

User-visible symptoms:

- no topic/group menu in native CenterChats;
- messages appear under the group title, but it is not clear from which topic they were loaded;
- native UI differs from Telegram WebView for forum groups;
- unread counters can be confusing because Telegram forum topics may have their own unread state, while native UI currently shows only one top-level group row.

---

## Current Code Path

### Chat list

Files:

- `main/native/telegramChatsIpc.js`
- `main/native/telegramChats.js`
- `src/native/store/nativeStore.js`
- `src/native/modes/InboxMode.jsx`

Current flow:

```text
InboxMode mount
  -> store.loadChats()
  -> ipc tg:get-chats
  -> client.getDialogs({ limit: PAGE, folder: 0 })
  -> mapDialog(d, accountId)
  -> chat id = `${accountId}:${dialog.id}`
  -> emit tg:chats
```

`mapDialog()` stores only one row per Telegram dialog:

```text
chatEntityMap.set(chatId, d.inputEntity || d.entity || d.id)
```

Current `NativeChat` has:

- `id`
- `accountId`
- `title`
- `type`
- `lastMessage`
- `unreadCount`
- `rawId`
- avatar/status/mute fields

It does **not** have:

- `isForum`
- `topicId`
- `topicTitle`
- `topMessageId`
- `parentChatId`
- topic unread counters.

### Message loading

Files:

- `main/native/telegramMessages.js`
- `main/native/telegramMessageMapper.js`
- `src/native/store/nativeStore.js`
- `src/native/components/InboxChatPanel.jsx`

Current flow:

```text
click chat
  -> store.setActiveChat(chatId)
  -> store.loadMessages(chatId, 50)
  -> ipc tg:get-messages
  -> entity = chatEntityMap.get(chatId)
  -> client.getMessages(entity, { limit, offsetId })
  -> emit tg:messages { chatId, messages }
```

This loads messages from the top-level peer. It does not request a specific Telegram forum topic/thread.

`telegramMessageMapper.js` maps only simple reply data:

```text
replyToId = m.replyTo?.replyToMsgId
```

It does **not** preserve forum-specific fields such as `replyToTopId` / topic root id.

---

## Telegram API Facts

Official Telegram MTProto has a dedicated method for forum topics:

- `channels.getForumTopics` returns topics for a forum supergroup.
- It can fail with `CHANNEL_FORUM_MISSING` when the supergroup is not a forum.

Official Telegram MTProto also has a reply-thread method:

- `messages.getReplies` returns messages in a reply thread.
- It can fail with `TOPIC_ID_INVALID` when a topic/thread id is wrong.

Useful official references:

- https://core.telegram.org/method/channels.getForumTopics
- https://core.telegram.org/method/messages.getReplies

Conclusion: forum topics are not just a UI detail. Telegram exposes them as a separate API concept, so native CenterChats needs separate topic support instead of plain `getMessages(peer)`.

---

## Root Cause

**Root cause**: native CenterChats currently treats every Telegram dialog as one flat chat.

For normal private chats, channels and ordinary groups this is fine. For Telegram forum groups it is incomplete:

```text
Current native model:
Telegram group -> one NativeChat -> one message list

Required forum model:
Telegram forum group -> parent group -> topic list -> selected topic -> topic messages
```

That is why:

- there is no menu/list of topics in the native group;
- native UI cannot show "which topic" the loaded messages belong to;
- clicking `parts-soft-ru` cannot behave like Telegram WebView, because the native API code never loads forum topics.

---

## What This Is Not

This is **not** the same problem as:

- startup slowness;
- WebView slow network;
- connection-health checks;
- Telegram session loss;
- avatar loading;
- unread-rescan scheduling.

Those are separate areas. This investigation is specifically about Telegram forum topics inside native CenterChats.

---

## Safe Solution Options

### ⭐⭐⭐⭐⭐ Option A — Add real forum topic support

Add topic support as a first-class native feature.

Expected behavior:

```text
Click forum group
  -> show topic list/menu before loading ambiguous group messages
  -> click topic
  -> load messages only for that topic
  -> header shows group + topic name
```

Likely changes:

- add topic detection/load path in main process;
- add IPC like `tg:get-forum-topics`;
- add message loading path for a selected topic/thread;
- extend store with `topicsByChatId` and selected topic state;
- add a topic sidebar/menu inside `InboxChatPanel`;
- preserve old flat behavior for non-forum chats.

Pros:

- correct Telegram-like behavior;
- user always sees which topic is open;
- scalable for forum groups.

Cons:

- biggest change;
- must be tested carefully with ordinary groups, channels, private chats and both Telegram API accounts.

### ⭐⭐⭐⭐ Option B — Detect forum groups and stop ambiguous loading

Before full support, detect that a group is a forum and show a clear placeholder:

```text
Это группа с темами. Native-режим пока не показывает темы.
Откройте Telegram WebView или дождитесь реализации тем.
```

Pros:

- very safe;
- prevents confusing "непонятно откуда сообщения";
- small implementation.

Cons:

- does not solve working inside topics;
- user still needs WebView for that group.

### ⭐⭐⭐ Option C — Keep flat group, but label it as "Общий чат / без темы"

Do not add topic support yet. Only make current behavior explicit.

Pros:

- smallest UI/code change;
- useful if quick clarity is needed.

Cons:

- still cannot open topic list;
- still not equivalent to Telegram WebView;
- weak solution for real forum groups.

---

## Decision

### 2026-05-12 — Selected solution

Selected option: **⭐⭐⭐⭐⭐ Option A — Add real forum topic support**.

Reason:

- the user needs native CenterChats to behave clearly for Telegram forum groups;
- hiding/labeling the current flat load is only a temporary workaround;
- Telegram WebView already proves that the target group has topic structure;
- the correct native model must support `group -> topics -> topic messages`;
- future multi-messenger unified inbox will need explicit source context, so "messages from unclear place" is not acceptable.

Implementation rule:

Do this in stages. Do not rewrite native Telegram at once. Preserve current flat behavior for ordinary chats, private chats and channels.

---

## Detailed Work Plan

### Stage 1 — Diagnostics and detection only

Goal:

Find out reliably whether a Telegram group is a forum group without changing how messages are loaded.

What to add:

- small backend helper that checks a selected Telegram chat for forum topics;
- diagnostic logs:
  - account id;
  - chat id;
  - chat title;
  - whether Telegram returned topics;
  - Telegram error like `CHANNEL_FORUM_MISSING`;
- store flag on chat object, for example `isForum: true/false/unknown`.

What not to change:

- do not change `tg:get-messages`;
- do not change sending messages;
- do not change unread counters;
- do not change ordinary chat behavior.

How to check:

- open `parts-soft-ru`;
- logs should say this chat is a forum group;
- open ordinary group/private chat;
- logs should say no forum topics or skip safely;
- old message loading still works exactly as before.

Risk:

- low. This stage only detects and logs.

---

### Stage 2 — Read-only topic list

Goal:

Show the user a real list of topics for a forum group.

Chosen UX mechanics:

Use the Telegram-style mechanic from WebView:

```text
normal state:
left panel = account/chat list

click forum group:
left panel = topic list for this group
top of left panel = close/back button + forum group title

click topic:
right panel = selected topic messages
header = topic title + "in <group title>"

click close/back:
left panel returns to normal account/chat list
```

Important UX rules:

- topic list replaces the normal chat list only for the opened forum group;
- there must be a visible close/back button;
- if topic messages are not loaded yet, the right panel must not pretend that parent-group messages are topic messages;
- ordinary chats, channels and non-forum groups keep the old behavior;
- the selected topic must be visible in the header, so the user always knows where messages came from.

What to add:

- IPC channel, likely:

```text
tg:get-forum-topics { chatId, limit?, offset? }
```

- backend call through Telegram MTProto `channels.getForumTopics`;
- topic DTO:

```js
{
  id: string,              // topic id / top message id
  chatId: string,          // parent group chat id
  title: string,
  unreadCount: number,
  lastMessagePreview: string,
  lastMessageTs: number,
  isPinned: boolean,
  isClosed: boolean
}
```

- store field, for example:

```js
topicsByChatId: {
  [chatId]: Topic[]
}
```

- UI block in opened group:
  - if group is forum, show topic list/menu before message list;
  - user clearly sees topic names;
  - no topic selected = no ambiguous "random" messages.

What not to change:

- still do not load topic messages;
- still do not send into topics;
- ordinary chats must not show topic UI.

How to check:

- `parts-soft-ru` shows topics like Telegram WebView;
- ordinary groups do not show topic list;
- two Telegram API accounts keep their own separate topics.

Risk:

- medium. UI/state is added, but message sending remains untouched.

---

### Stage 3 — Load messages for selected topic

Goal:

Click a topic and load messages only from that topic.

What to add:

- topic-aware message loading IPC, likely:

```text
tg:get-topic-messages { chatId, topicId, limit?, offsetId? }
```

- backend loading through Telegram reply/thread API, likely `messages.getReplies`;
- separate message cache key so parent group messages and topic messages do not mix:

```text
messageKey = `${chatId}:topic:${topicId}`
```

- UI header must show both:

```text
parts-soft-ru / Проблемы с кроссами
```

- message list must clearly belong to selected topic.

What not to change:

- do not remove existing `tg:get-messages`;
- do not use topic message cache for parent chat;
- do not send messages yet until read path is stable.

How to check:

- click topic A -> see only topic A messages;
- click topic B -> see topic B messages;
- switch back -> topic A cache is not overwritten;
- ordinary chats still load with old `tg:get-messages`.

Risk:

- medium/high. This is the main correctness point.

---

### Stage 4 — Unread counters and navigation clarity

Goal:

Make it clear where unread counts come from.

What to add:

- parent group row can show total unread;
- topic rows can show topic unread;
- selected topic can mark/read only its own visible messages when Telegram API supports that safely;
- logs must show whether unread came from parent dialog or topic.

What not to do:

- do not fake topic unread by subtracting locally;
- do not reset parent unread incorrectly;
- do not mix topic unread into another account.

How to check:

- unread on parent group remains stable;
- topic unread is shown only for that topic;
- switching accounts does not mix counters.

Risk:

- medium/high. Unread logic is historically fragile, so this stage must be separate.

---

### Stage 5 — Sending/replying inside selected topic

Goal:

Allow sending messages into the selected topic only after reading and navigation are stable.

What to add:

- send path that knows selected `topicId`;
- reply path that keeps reply inside the selected topic;
- input/header should make the target obvious:

```text
Отправка в: parts-soft-ru / Проблемы с кроссами
```

What not to do:

- do not send to parent group when topic is selected;
- do not enable sending if selected topic is closed or not loaded correctly.

How to check:

- send in topic A appears in topic A;
- send in topic B appears in topic B;
- ordinary chat sending still works.

Risk:

- high. Sending is user-facing and must be done after read path.

---

## Test Plan

Minimum tests before code is considered done:

1. Ordinary private Telegram chat still opens and sends.
2. Ordinary Telegram group without topics still opens and sends.
3. Telegram channel still opens.
4. Forum group detects `isForum`.
5. Forum group shows topic list.
6. Topic A and Topic B do not share message cache.
7. Two Telegram API accounts do not share topic state.
8. Existing `tg:get-messages` behavior remains unchanged for non-forum chats.
9. No `chatEntityMap` fallback for topic loading.
10. Memory Bank docs updated after each stage.

Suggested automated tests:

- extend `src/__tests__/multiAccount.test.cjs` with topic id/account id separation checks;
- add a lightweight static test that confirms new topic IPC does not replace old `tg:get-messages`;
- add store test for message key separation: parent chat vs topic chat.

Manual tests:

- `parts-soft-ru` in native;
- same group in Telegram WebView for visual comparison;
- both API accounts: `БНК` and `Avtoliberty`;
- ordinary Telegram WebView tabs must remain unrelated and untouched.

---

## Recommended Direction

Use Option A as the final solution, but implement it in safe stages:

1. Add diagnostics and topic detection only.
2. Add read-only topic list for forum groups.
3. Add topic selection and topic message loading.
4. Add sending/replying into selected topic only after read path is stable.
5. Add tests for:
   - normal group without topics;
   - forum group with topics;
   - two Telegram API accounts;
   - chat id uniqueness;
   - no regression for `tg:get-messages` on ordinary chats.

Do **not** mix topic support with unrelated startup, WebView or connection-health changes.

---

## Open Questions Before Implementation

1. Should forum topics appear as nested rows under the group in the left chat list, or as a topic menu inside the opened group panel?
2. Should "Все/общий чат" remain available for forum groups?
3. How should unread counters be displayed: parent group total, per-topic, or both?
4. Should topic messages be cached separately from parent group messages?
5. Should sending be disabled until topic message loading is verified?

---

## Журнал расследования — в архиве

Хронология по дням (май 2026) вынесена в
[archive/group-topic-investigation-log.md](archive/group-topic-investigation-log.md)
(разгрузка 2026-09-16: файл упёрся в предел 100 КБ).
Выше — постановка задачи, факты Telegram API, корень и план; с них и надо начинать.
