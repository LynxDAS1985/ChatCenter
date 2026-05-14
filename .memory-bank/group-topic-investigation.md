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

## Investigation Log

### 2026-05-12

Checked:

- `main/native/telegramChatsIpc.js`
- `main/native/telegramChats.js`
- `main/native/telegramMessages.js`
- `main/native/telegramMessageMapper.js`
- `src/native/store/nativeStore.js`
- `src/native/modes/InboxMode.jsx`
- `src/native/components/InboxChatPanel.jsx`
- `src/native/components/InboxChatListSidebar.jsx`
- `API/telegram/` local docs search for `getForumTopics`, `ForumTopic`, `messages.getReplies`, `TOPIC_ID`, `forum`

Found:

- no `channels.getForumTopics`;
- no `messages.getReplies`;
- no `topicId` / `threadId` in native store;
- no forum/topic UI in `InboxChatPanel`;
- no topic fields in message mapper;
- native chat id currently identifies only account + peer, not account + peer + topic.
- local `API/telegram/` docs do not currently document forum topic methods, so official Telegram MTProto docs must be used for this feature.

Current conclusion:

The native Telegram API layer is working as designed for flat dialogs, but Telegram forum groups need a separate feature. Without that, native UI cannot know which topic to show and cannot offer the group topic menu seen in Telegram WebView.

### 2026-05-12 — Stage 1/2 implementation started

Implemented first working slice of the selected Telegram-style mechanic:

- backend IPC `tg:get-forum-topics`;
- backend IPC `tg:get-topic-messages`;
- native store state:
  - `forumTopics`;
  - `forumTopicsLoading`;
  - `forumTopicPanelChatId`;
  - `activeForumTopic`;
- topic message cache key format: `${chatId}:topic:${topicId}`;
- `InboxMode` now tries to load forum topics for group/channel chats before falling back to normal parent `tg:get-messages`;
- left sidebar can switch from normal chat list to topic list;
- topic panel has close/back button;
- selected topic is shown in chat header as `topic title` + `in group title`;
- input is disabled for forum groups in this first slice, including selected topics, because topic sending/replying needs a separate safe implementation;
- `handleReplySend` has a defensive guard for forum groups so a topic message cannot accidentally be sent into the parent group;
- topic mode disables parent `markRead` to avoid accidentally marking the whole group while topic unread handling is not implemented.

Still not completed:

- manual runtime verification in the app;
- topic sending/replying;
- topic unread mark-read;
- visual polish of topic icons/rows;
- pagination for long topic lists.

### 2026-05-12 — Manual check after Stage 1/2

User verified in the app:

- forum group opens;
- topic list is visible;
- topic rows and unread counters are visible.

Found problems:

1. Selecting a topic can show an empty message area.
2. Closing the topic list can leave the left chat list empty instead of returning to the account chat list.
3. Opening/closing the topic panel feels abrupt and visually jumps.

Root causes found in code:

- `tg:get-topic-messages` used only `messages.GetReplies`. For Telegram forum topics this can return zero messages for some topics; we need fallback loading through `messages.Search` with `topMsgId`.
- `InboxChatPanel` still checked `loadingMessages[activeChatId]`, while selected topics use a separate cache key `${chatId}:topic:${topicId}`.
- `closeForumTopics()` only cleared `forumTopicPanelChatId`; it did not clear the active selected topic / selected forum chat state, so the UI could remain in a mixed state.
- `InboxChatListSidebar` measured virtual list height only once. After replacing topic panel with chat list, the normal list could render with stale/zero height.

Fixes applied:

- `tg:get-topic-messages` now tries `messages.GetReplies` first and falls back to `messages.Search({ topMsgId })` when replies are empty.
- `InboxChatPanel` receives `messagesLoading` from `InboxMode`, using the correct topic cache key.
- `closeForumTopics()` clears selected topic and resets active chat when a topic was selected.
- Sidebar resize effect now reruns when `forumTopicPanelChatId` changes.
- Added lightweight `native-panel-slide-in` animation for chat list/topic panel transitions and row hover smoothing.

### 2026-05-12 — Topic panel transition refinement

User requested Telegram-like behavior:

- opening topic panel should slide in from the right side;
- closing should slide back to the right side;
- after closing, clicking the same forum group again must reopen the topic panel;
- row hover should not shift rows, it should softly lighten the row like Telegram.

Changes:

- `InboxChatListSidebar` now keeps a temporary `visibleForumChatId` while the close animation plays.
- Closing no longer instantly unmounts the topic panel; it plays a 180ms slide-out first.
- Reopening during/after close is supported by resetting the local animation state when `forumTopicPanelChatId` appears again.
- Topic row hover was changed from horizontal movement to a light background highlight.
- Active topic row now uses a neutral light highlight instead of the previous purple-heavy background.

### 2026-05-12 — Reopen active forum group after closing topics

Manual issue:

- after opening a forum group and closing the topic panel, the user remains on the same active group row;
- clicking the same row again did not reopen topics, because `activeChatId` did not change and the `InboxMode` effect did not rerun.

Fix:

- `setActiveChat(id)` now detects repeated click on an already active known forum group;
- if topics are known or `chat.isForum === true`, it restores `forumTopicPanelChatId = id`;
- this reopens the topic panel from cached topics without forcing a new Telegram API call.

### 2026-05-12 — Topic icons and empty messages follow-up

Manual issue:

- topic panel opens and reopens correctly;
- transitions and closing/opening are working;
- topic rows still showed `#` instead of Telegram topic emoji;
- selected topics still showed no messages.

Root causes:

- Telegram forum topic `iconEmojiId` is a custom emoji document id, not a ready plain text emoji. The renderer cannot display it unless backend resolves it through `messages.GetCustomEmojiDocuments`.
- The code used `ForumTopic.topMessage` as the topic root. For loading forum thread messages the stable root is `ForumTopic.id`; `topMessage` is useful for the topic preview/last message.

Fixes:

- `tg:get-forum-topics` now resolves `iconEmojiId` through `messages.GetCustomEmojiDocuments` and sends `iconEmoji` to renderer when Telegram provides an `alt` emoji.
- `topMessageId` is now set to the topic root id (`ForumTopic.id`), while `lastMessageId` keeps `ForumTopic.topMessage` for previews.
- topic message cache key now prefers `topicId/id` over `topMessageId`.
- `tg:get-topic-messages` now prefers `topicId` as the root message id.

### 2026-05-12 — Parent messages hidden before topic selection

Manual issue:

- opening a forum group showed messages on the right before the user selected a topic;
- this was confusing because it looked like a random/unknown chat.

Root cause:

- `InboxMode` still used parent `messages[chatId]` when `activeChat.isForum === true` and `activeTopic` was not selected.
- pinned parent message and parent mark-read logic could also appear/run before a topic was selected.

Fix:

- forum group without selected topic now uses an empty message list;
- unread count is forced to `0` until a topic is selected;
- parent pinned message is not loaded for forum groups in topic mode;
- parent `markRead` is disabled for forum groups until topic-specific read handling is implemented.

Tests added/updated:

- `src/__tests__/multiAccount.test.cjs` now checks topic state, topic IPC, topic message cache separation, topic panel close button, and topic-first loading.

### 2026-05-12 — Topic read/scroll and real custom emoji media

Manual issue:

- after selecting a topic, the message area could jump to the first unread message;
- the topic unread counter did not decrease;
- the scroll button badge also stayed visible;
- topic icons still used emoji fallback instead of Telegram custom emoji media when available.

Root causes:

- forum topic read handling was intentionally disabled in the first slice to avoid marking the whole parent group as read;
- without topic-specific mark-read, `activeUnread` stayed non-zero, so initial-scroll and the down button kept treating the topic as unread;
- scroll state used the parent `chatId`, so different topics inside one forum group did not have independent view state;
- Telegram `iconEmojiId` points to a custom emoji document. Resolving only `DocumentAttributeCustomEmoji.alt` gives a text fallback, not the actual Telegram media.

Fixes:

- added backend IPC `tg:mark-topic-read`;
- backend uses `messages.ReadDiscussion({ peer, msgId: topicRootId, readMaxId })` for topic-specific read cursor;
- store added `markTopicRead(chatId, topic, maxId)`;
- initial implementation cleared the selected topic unread counter locally; this was later corrected because unread counters must come from Telegram refresh;
- `InboxMode` now uses `activeViewKey`: parent chat id for normal chats, `${chatId}:topic:${topicId}` for selected topics;
- initial scroll, saved scroll, visibility read and force-read-at-bottom now use the topic view key;
- `useInboxScroll` accepts `scrollKey`, so topic scroll positions are stored separately while `loadOlderMessages()` still receives the real parent chat id;
- `tg:get-forum-topics` now caches Telegram custom emoji documents into `tg-media/custom_emoji_<id>.<ext>` and returns `iconEmojiUrl`;
- topic rows render real `cc-media://media/...` static images or webm video when supported;
- `.tgs` animated stickers remain safely on `alt` fallback because Chromium cannot render TGS directly in `<img>`.

Expected behavior now:

- opening a forum group without selecting a topic shows no random parent messages;
- selecting a topic loads only that topic;
- each topic keeps its own scroll position;
- visible/bottom topic messages can mark that topic read without touching the parent group or another topic;
- topic unread badge can drop after topic read succeeds;
- custom emoji icons show as real Telegram media where the file type is renderable.

Tests/checks:

- `node src\__tests__\multiAccount.test.cjs` — passed;
- `node src\__tests__\memoryBankSizeLimits.test.cjs` — passed;
- `npm.cmd run lint` — passed;
- `npm.cmd run build` — passed.

Manual checks still required:

- open a forum group and confirm the right message panel is empty until a topic is selected;
- select a topic with unread messages and confirm scrolling no longer keeps jumping after messages become visible;
- confirm the topic unread badge decreases/clears after the visible read event reaches Telegram;
- confirm repeated close/open of topic panel still works;
- confirm normal non-forum chats still load, scroll and mark read as before.

### 2026-05-12 — Fix topic unread counter source

Manual issue:

- user opened topic `OZON` with unread badge like `185`;
- after slight scrolling the topic unread badges disappeared or became wrong;
- this repeated an old class of native unread bugs: UI guessed the counter locally instead of waiting for Telegram truth.

Root cause:

- `src/native/store/nativeStore.js` called `tg:mark-topic-read`;
- after successful IPC it immediately changed the selected topic to `unreadCount: 0`;
- this broke the project rule from `.memory-bank/mistakes/native-scroll-unread.md`: unread counters must come from Telegram/server sync, not optimistic local math.

Chosen fix — Variant A:

```text
ReadDiscussion OK
  -> do NOT set unreadCount = 0 locally
  -> silently call tg:get-forum-topics for the same forum group
  -> replace topic list with Telegram's fresh counters
  -> update activeForumTopic from the refreshed topic row
  -> if refresh failed, keep old counters visible
```

Why this is safer:

- no fake zero;
- no jump `185 -> 0 -> real number`;
- if Telegram has not recalculated yet, UI keeps the previous value instead of lying;
- selected topic and topic list use the same refreshed topic object;
- parent group unread and other topics/accounts are not touched.

Files changed:

- `src/native/store/nativeStore.js`
  - added `topicIdentity(topic)`;
  - `markTopicRead()` now refreshes `tg:get-forum-topics` after successful `tg:mark-topic-read`;
  - removed local selected-topic `unreadCount: 0` mutation.
- `src/native/store/nativeStore.vitest.jsx`
  - added regression tests for topic unread refresh;
  - added failed-refresh case: old unread count remains.
- `src/__tests__/multiAccount.test.cjs`
  - static test now forbids optimistic local topic zero and requires refresh from Telegram.

Expected behavior now:

- topic unread badge changes only after Telegram returns a refreshed topic list;
- if the network/API refresh fails, the previous number remains visible;
- scrolling/visibility read can still request mark-read, but it does not invent the new count locally.

### 2026-05-12 — Faster topic unread refresh and double-click bottom

Manual issue:

- after the local-zero fix, the topic unread counter became correct but could update slowly;
- reason: Telegram can accept `ReadDiscussion`, but `channels.getForumTopics` may still return the old topic `unreadCount` for a short time;
- user also requested double-click on the down arrow to jump directly to the bottom of the chat.

Fix:

- `markTopicRead()` now runs a bounded refresh loop:
  - immediate `tg:get-forum-topics`;
  - retry after `700 ms`;
  - retry after `1500 ms`;
  - retry after `3000 ms`;
  - one loop per topic at a time, duplicates are skipped;
  - if Telegram still returns the same unread count, the UI keeps the honest server value.
- scroll button behavior:
  - single click waits `220 ms` and keeps the Telegram-style behavior: jump to the first unread message;
  - double click cancels the single-click timer, scrolls to the real bottom, and sends mark-read up to the last loaded message;
  - double click also starts the same safe topic-read refresh path through `markReadCurrentView`.

Why this was chosen:

- faster than one refresh;
- still does not fake unread counters locally;
- bounded API usage, no endless polling;
- double-click gives an explicit "skip to bottom" action without breaking the normal one-click reading flow.

Files changed:

- `src/native/store/nativeStore.js`
  - added `TOPIC_READ_REFRESH_DELAYS_MS`;
  - added per-topic in-flight guard for refresh loops;
  - `markTopicRead()` now retries topic counter refresh when Telegram still returns the old number.
- `src/native/modes/InboxMode.jsx`
  - added delayed single-click handler for the scroll button;
  - added `scrollToAbsoluteBottom()` for double-click;
  - double-click marks read to the last loaded message.
- `src/native/components/InboxChatPanel.jsx`
  - scroll button now wires `onDoubleClick` to absolute-bottom behavior.
- `src/native/store/nativeStore.vitest.jsx`
  - test now verifies retry refresh after Telegram initially returns stale topic unread.
- `src/__tests__/multiAccount.test.cjs`
  - static checks added for retry loop and double-click bottom behavior.

Manual checks:

1. Open forum topic with unread badge.
2. Scroll messages so read-by-visibility fires.
3. Counter may stay for a moment, then should update faster than before after Telegram refresh catches up.
4. Single-click `↓` should go to the first unread message.
5. Double-click `↓` should go straight to the bottom and then refresh the topic unread badge.
## 2026-05-12 — Open issue: unread badge flicker and huge unread window

User-visible symptoms found during manual testing:

1. Topic unread badge can briefly show an older server value during refresh.
   Example: it was `8`, user scrolls/read advances to `6`, then old `8` appears again for a moment, then `6` returns.
2. Topic/chat can show `999+` unread, but after opening/scrolling a little the UI can show a much smaller number like `48`.
3. This looks like the app "lost" unread messages, even if the root cause is the current loading/read algorithm.

Current code facts:

- `selectForumTopic(chatId, topic, limit = 50)` loads only one page by default.
- `loadOlderMessages(chatId, beforeId, limit = 50)` also loads older messages in pages of 50.
- `tg:get-topic-messages` calls Telegram `messages.GetReplies` / fallback `messages.Search({ topMsgId })` with `limit = 50`.
- `activeUnread` uses the real Telegram unread counter from the topic/chat object.
- `firstUnreadId` is calculated with `clampedUnread = Math.min(realUnread, incoming.length)`.
- If Telegram says `999+`, but only 50 incoming messages are loaded, the UI can only anchor inside those 50 loaded messages.
- `useReadByVisibility`, `useForceReadAtBottom`, and double-click bottom can call topic `markRead` with `readMaxId` from the last loaded message.
- Backend topic read uses `messages.ReadDiscussion({ peer, msgId: topicRootId, readMaxId })`.

Likely root causes:

1. **Unread badge flicker**: Telegram can return stale topic counters for a short time after `ReadDiscussion`. The current bounded refresh loop writes every server response back to UI, so a stale bigger number can flash between two smaller numbers.
2. **`999+` becomes `48`**: the current topic message window is small. For a large unread topic, native loads only the last 50 messages, clamps the first unread anchor to those loaded messages, and can send `ReadDiscussion` with the last loaded message id. Telegram then moves the read cursor by `readMaxId`, so the server counter can collapse even though native did not show the full unread backlog.

What must be fixed next:

1. Add a pending/read-refresh state for topic counters so old server values do not visibly jump during read refresh.
2. Add a large-unread guard: if `activeUnread > loadedIncomingCount`, automatic topic mark-read must not mark to the last loaded message as if the user saw all unread messages.
3. Add bounded unread-window loading for topics: load older pages until loaded incoming messages cover unread count, or until a safe cap is reached.
4. Keep Telegram truth as the counter source: no local subtraction, no fake zero.

Safe solution options:

| Priority | Option | What it does | Pros | Cons |
|---|---|---|---|---|
| ⭐⭐⭐⭐⭐ | A. Stabilize counters + unread-window guard | Stops badge flicker and blocks unsafe mark-read when unread window is incomplete | Safest first fix, prevents wrong-looking jumps | Does not yet load all 999+ automatically |
| ⭐⭐⭐⭐⭐ | B. Batch-load unread window | Loads enough older topic messages to cover unread count, like Telegram behavior | Correct UX for large unread topics | Needs careful limits to avoid heavy API/memory usage |
| ⭐⭐⭐⭐ | C. Explicit "load unread" mode | If unread is too large, show a state/button instead of auto-loading too much | Very safe for huge topics | One extra user action |
| ⭐⭐⭐ | D. Only animate badges | Hides 8->6->8 flicker | Cosmetic only, does not fix 999+ -> 48 root cause |

Recommended next implementation:

```text
Step 1: Add unread refresh/pending state so counters do not visibly jump.
Step 2: Add guard: do not auto mark-read a topic when activeUnread > loaded incoming messages.
Step 3: Add bounded unread-window loader for topics.
Step 4: Add tests:
  - stale refresh must not flash older counter;
  - 999+ unread with only 50 loaded must not mark-read to last loaded message automatically;
  - after enough unread messages are loaded, mark-read is allowed;
  - final counter still comes from Telegram topic refresh.
```

Status: not fixed yet. Root cause documented. Recommended solution for next stage: combine Option A + Option B with safe caps.

## 2026-05-13 — Start implementing Telegram-like unread opening

Decision:

Implement Telegram-like opening for native Telegram chats and forum topics:

```text
unreadCount can be any number: 76, 458, 900, 999+
the chat/topic must open at the first unread message, not at the last 50 messages
```

Why:

- Current native logic loads the last 50 messages and clamps `firstUnread` to the loaded window.
- This is wrong when Telegram reports more unread messages than loaded incoming messages.
- It can cause confusing behavior like `999+` turning into `48` after a small scroll.
- Telegram API exposes the needed read cursor:
  - dialogs have `readInboxMaxId` / `read_inbox_max_id`;
  - forum topics have `readInboxMaxId` / `read_inbox_max_id`;
  - history/replies APIs support offset loading around a message id.

Target behavior:

```text
open chat/topic
  -> if unreadCount > 0 and readInboxMaxId exists:
       load messages around readInboxMaxId
       show first unread after readInboxMaxId
       show "Unread messages" divider
       do not mark-read until this unread window is loaded
  -> if cursor load cannot find the unread window:
       fallback to bounded batch loading
  -> if unread is very large:
       load in safe chunks and show progress instead of jumping counters
```

Implementation rules:

- Do not fake unread counters locally.
- Do not use local subtraction.
- Do not call `markRead`/`ReadDiscussion` against the last loaded message while `activeUnread > loadedIncomingCount` and the unread window is incomplete.
- Keep ordinary chats, channels, private chats and forum topics separate.
- Keep final unread values sourced from Telegram refresh/sync.

First implementation slice:

1. Add `readInboxMaxId` to native chat DTO from Telegram dialogs.
2. Preserve `readInboxMaxId` already returned for forum topics.
3. Add unread-window loading path:
   - ordinary chats through `tg:get-messages` with `aroundId`;
   - forum topics through `tg:get-topic-messages` with `aroundId`;
   - backend uses `offsetId = aroundId` and negative `addOffset` to fetch a window around the read cursor.
4. Add store metadata for message windows:
   - whether an unread window was requested;
   - whether loaded incoming messages cover `unreadCount`;
   - whether mark-read is safe.
5. Add guards in read-by-visibility / force-read / double-click so incomplete unread windows do not get marked read accidentally.
6. Add tests for:
   - DTO includes `readInboxMaxId`;
   - unread window calls pass `aroundId`;
   - incomplete unread window blocks mark-read;
   - safe window allows mark-read.

Implemented in this slice:

- `main/native/telegramChats.js`
  - `mapDialog()` now stores `readInboxMaxId` from Telegram dialog data.
- `main/native/telegramMessages.js`
  - `tg:get-messages` now accepts `aroundId` and `addOffset`;
  - `tg:get-topic-messages` now accepts `aroundId` and `addOffset`;
  - both handlers log the around-window request.
- `src/native/store/nativeStore.js`
  - added bounded unread-window request planning;
  - ordinary chats with `unreadCount > 0` and `readInboxMaxId` request a window around the read cursor;
  - forum topics with `unreadCount > 0` and `readInboxMaxId` request a topic window around the topic read cursor;
  - added `messageWindows` metadata with loaded incoming count and whether the unread window is complete.
- `src/native/modes/InboxMode.jsx`
  - read-by-visibility, force-read-at-bottom and double-click-bottom now share `markReadCurrentView`;
  - `markReadCurrentView` skips marking read if `activeUnread` is larger than the number of loaded incoming messages;
  - this prevents a partially loaded `999+` window from being marked as read by the last loaded message.
- `.memory-bank/api.md`
  - documented `aroundId/addOffset` for message loading IPC.
- Tests:
  - store tests cover ordinary chat unread-window request;
  - store tests cover forum topic unread-window request;
  - static tests cover `readInboxMaxId`, `aroundId/addOffset`, store request planning, and incomplete-window mark-read guard.

Checks passed:

```text
npm.cmd run test:vitest -- src/native/store/nativeStore.vitest.jsx
node src\__tests__\multiAccount.test.cjs
node src\__tests__\memoryBankSizeLimits.test.cjs
npm.cmd run lint
npm.cmd run build
```

Manual checks required:

1. Open ordinary native Telegram chat with small unread count, for example 5-20.
   - Expected: opens at first unread, not random latest position.
2. Open ordinary native Telegram chat with larger unread count, for example 76/100+.
   - Expected: app requests a larger unread window and does not collapse unread counter after slight scroll.
3. Open forum topic with unread count.
   - Expected: selected topic opens around first unread.
4. Open topic/chat with `999+`.
   - Expected in this slice: app should not auto mark-read if loaded incoming messages are fewer than unread count.
   - Further improvement still needed: visible progress UI like "loading unread X of Y".

Remaining work:

- Add visible loading/progress state for huge unread windows.
- Add multi-page unread-window loading when `unreadCount` is bigger than the first bounded request.
- Add stable/pending badge animation so old Telegram counters do not visually flicker during refresh.

## 2026-05-13 — Open issue: small unread count does not decrease after visible scroll

User-visible symptom:

- Opened a native Telegram chat with `21` unread.
- User scrolled through 2-3 visible messages.
- Chat list badge and down-arrow badge stayed `21`.

What was found in code:

- `InboxMode.jsx` added a broad unread-window guard:

```text
if activeUnread > loadedIncomingCount:
  skip markRead
```

- This protects large incomplete windows like `999+`, but it is too broad.
- It can also block normal read-by-visibility, where the user really saw several messages and the app should send `markRead` for those visible message ids.

Why this is wrong:

- Safe guard is needed only for risky actions that mark everything up to the last loaded message:
  - force-read-at-bottom;
  - double-click absolute bottom;
  - any "mark to last loaded" path.
- Normal read-by-visibility should be allowed because it marks only messages that entered the visible area.

Required fix:

1. Split mark-read source:
   - `visibility` = allowed even if unread window is incomplete;
   - `bottom` / `absolute-bottom` = blocked while unread window is incomplete.
2. Base incomplete-window detection on `messageWindows[activeMessageKey]`, not only on `activeUnread > loadedIncomingCount`.
3. Add visible unread-window loading state:
   - while the app loads a window around `readInboxMaxId`, show progress/state in the message panel;
   - do not show jumping counters without context.
4. Add tests:
   - visibility mark-read is not blocked by incomplete unread window;
   - force bottom / double-click bottom are blocked while unread window is incomplete;
   - unread-window loading metadata is visible to the UI.

Status: documented before fix. Next code change must address this exact regression without returning the old `999+ -> 48` bug.

## 2026-05-13 — Fix: visible read is allowed, unsafe bottom read stays guarded

Implemented:

- `useReadByVisibility.js`
  - read-by-visibility now calls `markRead(..., { source: 'visibility' })`;
  - this path is for messages that actually entered the visible area.
- `useForceReadAtBottom.js`
  - bottom auto-read now calls `markRead(..., { source: 'bottom' })`.
- `InboxMode.jsx`
  - incomplete unread-window detection now uses `store.messageWindows[activeMessageKey]`;
  - `source: 'visibility'` is allowed even if the unread window is incomplete;
  - `source: 'bottom'` and `source: 'absolute-bottom'` stay blocked while the unread window is incomplete;
  - this preserves protection from the old `999+ -> 48` bug, but no longer blocks normal partial reading.
- `nativeStore.js`
  - unread-window metadata now has `unreadWindowLoading`;
  - loading state is written before the IPC request starts and cleared after messages are returned.
- `InboxChatPanel.jsx` + `styles-messages.css`
  - added visible unread-window status:

```text
Загружаю непрочитанные сообщения: X из Y
Загружена часть непрочитанных сообщений: X из Y
```

Why this is safer:

- We still do not fake unread counters locally.
- We still do not mark a huge incomplete unread window as read by the last loaded message.
- But if the user scrolls through visible messages, those messages can now be marked read normally.

Checks passed:

```text
npm.cmd run test:vitest -- src/native/store/nativeStore.vitest.jsx src/native/hooks/useForceReadAtBottom.vitest.jsx
node src\__tests__\multiAccount.test.cjs
node src\__tests__\memoryBankSizeLimits.test.cjs
npm.cmd run lint
npm.cmd run build
```

Manual checks required:

1. Open a normal Telegram API chat with a small unread count, for example `21`.
   - Scroll through 2-3 unread messages.
   - Expected: unread count should decrease after Telegram confirms read sync.
2. Open a topic/chat with large unread count, for example `999+`.
   - Slight scroll must not collapse the count to a small fake value.
3. Double-click the down arrow in an incomplete large unread window.
   - Expected: it can scroll to the bottom visually, but unsafe mark-read is skipped until the unread window is complete.
4. While unread-window loading is incomplete, the message panel should show a visible loading/partial status.

## 2026-05-13 - Open issue: unread count stays unchanged after scrolling visible posts in any native Telegram chat type

User-visible symptom:

- Opened a native Telegram chat/channel/forum topic with unread count.
- Examples seen during manual checks:
  - normal channel/group-style chat: `GitHub Community`, unread `111`;
  - forum topic: `Geely EX5 EM-i / Запчасти, расходники, ТО`, unread `243`, loaded `69 of 243`.
- User scrolled through several posts/messages.
- In some cases chat-list unread badge and down-arrow badge stayed unchanged.

Facts checked:

- Telegram API supports the required server-side read cursors:
  - `messages.readHistory(peer, max_id)` marks normal user/basic group history read up to `max_id`;
  - `channels.readHistory(channel, max_id)` marks channel/supergroup history read up to `max_id`;
  - `messages.readDiscussion(peer, msg_id, read_max_id)` marks a forum/thread read up to `read_max_id`;
  - dialogs expose `read_inbox_max_id` and `unread_count`.
- Therefore this is a universal native Telegram read-tracking problem, not only a forum-topic problem:
  - private/direct chats use the flat `markRead` path;
  - ordinary groups and channels/supergroups use the flat `markRead` path with channel fallback;
  - forum topics use the topic `markTopicRead` path.
- Current backend already has the correct channel fallback path:
  - `client.markAsRead(entity, maxId)`;
  - fallback to `Api.channels.ReadHistory` for channel peers.
- Current UI intentionally does not subtract unread counters locally. This is correct and must stay: old local subtraction caused counter jumps like `36 -> 25 -> 35`.

Most likely root cause in current frontend:

- `MessageBubble` uses `useReadOnScrollAway`.
- That hook has an initial-visibility guard: messages already visible on the first observer callback are not marked read.
- Current implementation marks read only when a message intersects after that first callback.
- For large posts/media cards, or posts already visible after opening around the unread cursor, the user can scroll through content without producing enough `read-fire -> read-batch-send -> tg:mark-read` events.
- If no `tg:mark-read` reaches main, Telegram never moves `read_inbox_max_id`, so `tg:chat-unread-sync` correctly returns the same unread number.
- For forum topics the same visible-read failure prevents `tg:mark-topic-read` / `messages.ReadDiscussion` from being called often enough.

Important: this is not fixed by local badge animation. The real fix must make the read-tracker send correct `maxId` only for messages that the user actually passed/read.

Recommended fix:

1. Replace the current "intersects after initial callback" read trigger with a Telegram-style reading line:
   - create one central viewport/scroll-container line;
   - when a message crosses that line during user scroll, mark it as seen/read candidate;
   - when it moves past the reading area, send `markRead` with that message id.
2. Pass the real message scroll container as `IntersectionObserver.root`, not only the browser viewport.
3. Keep the existing safety rules:
   - no local unread subtraction;
   - keep `markReadMaxSent` guard;
   - bottom/double-click mark-read remains blocked while an unread window is incomplete;
   - visibility read is allowed, but only for messages confirmed as passed by the reading line.
4. Add diagnostics before/with the fix:
   - `read-line-seen`;
   - `read-line-read`;
   - `read-batch-send`;
   - `mark-read OK`;
   - `UNREAD SYNC server=N`.
5. Add tests:
   - long message taller than viewport still becomes readable when crossed;
   - initially visible unread message is not auto-read on open, but is read after user scrolls past it;
   - incomplete `999+` window does not allow unsafe bottom mark-read;
   - normal small unread count decreases through visibility path after server sync.

Status: root cause documented. Code fix is still pending.

## 2026-05-13 - Clarification: forum topic counter can change while unread-window banner stays stale

User-visible symptom:

- In forum topic `Шины и диски`:
  - topic badge changed, for example `271 -> 262 -> 258`;
  - banner still showed `84 of 271`.
- In another topic `Запчасти, расходники, ТО`:
  - banner showed `85 of 221`;
  - topic badge stayed `221` while user scrolled.

Code facts:

- `messageWindows[key]` is created in `selectForumTopic()` from the topic object that existed at the moment of opening.
- The banner in `InboxChatPanel` reads only this frozen `messageWindows[key].unreadCount` and `loadedIncoming`.
- `markTopicRead()` refreshes `forumTopics[chatId]` from Telegram after `messages.ReadDiscussion`, so the topic row badge can change.
- That refresh does not currently update `messageWindows[key]`.

Therefore:

- If the topic row badge changes but the banner does not, this does not mean messages are not read.
- It means the topic counter was refreshed, but the unread-window metadata shown in the banner stayed stale.

Second issue:

- If the topic row badge does not change at all after scrolling, then `markTopicRead()` probably did not run for the messages the user actually viewed.
- The likely reason is still `useReadOnScrollAway`: initially visible messages and some large/media posts can be skipped by the current visibility trigger.

Required fixes:

1. Keep the unread-window banner derived from fresh state:
   - when `forumTopics[chatId]` refreshes, update the matching `messageWindows[key].unreadCount`;
   - or compute banner total from the current active topic instead of the stale window snapshot.
2. Rename/reword the banner so it is clear:
   - loaded count = how many unread messages are loaded in the current window;
   - unread count = Telegram's current server counter.
3. Fix read detection globally for all native Telegram message types:
   - private chats;
   - ordinary groups;
   - channels/supergroups;
   - forum topics.
4. Add diagnostics to distinguish the two states:
   - `read-line-read` / `read-batch-send` happened but server counter stayed;
   - no read event happened at all.

Status: documented. Code fix still pending.

## 2026-05-13 - Decision: implement A + B + diagnostics

Selected option:

```text
A. One read tracker for all native Telegram API chat types
B. Fresh unread-window banner/state
C. Diagnostics proving where the chain stops
```

Why this option:

- The problem is not only forum topics. It affects the shared native Telegram message viewport used by:
  - private chats;
  - ordinary groups;
  - channels/supergroups;
  - forum topics.
- Telegram API already has the needed read methods. The weak point is our UI read-detection and stale unread-window metadata.
- Fixing only the banner would hide confusion but would not make read events reliable.
- Fixing only forum topic read would leave the same bug in simple groups/private chats.

Old mistakes that must not be repeated:

1. Do not subtract unread counters locally.
   - Previous local subtraction caused visible jumps like `36 -> 25 -> 35`.
   - Counter source must remain Telegram sync/refresh.
2. Do not auto-mark messages read just because the chat opened.
   - `atBottom=true` / initial viewport read caused unread collapse on open.
3. Do not call mark-read with a lower `maxId`.
   - Telegram read cursor is absolute. Lower `maxId` can move the watermark backwards.
4. Do not mark a huge incomplete unread window as read by the last loaded message.
   - This caused `999+ -> 48` style collapses.
5. Do not treat forum topics as the only case.
   - The read viewport is shared by all native Telegram API messages.

Implementation plan:

1. Replace the current read trigger with a root-aware "reading line" tracker:
   - uses the real message scroll container as `IntersectionObserver.root`;
   - a message becomes read only after user scrolls it through/past the reading line;
   - initially visible messages are not read immediately on open.
2. Wire this tracker through `MessageBubble` and `AlbumBubble`.
3. Keep `source: visibility` for real visible-read events.
4. Keep bottom/double-click guards for incomplete unread windows.
5. Refresh or derive unread-window banner values from fresh chat/topic state so the banner does not keep an old `84 of 271` after the topic badge changes.
6. Add diagnostics:
   - `read-line-initial`;
   - `read-line-seen`;
   - `read-line-read`;
   - existing `read-batch-send`;
   - backend `mark-read OK` / `mark-topic-read OK`.

Manual checks after implementation:

1. Private Telegram API chat: scroll several unread messages, badge decreases only after Telegram confirms.
2. Ordinary group/channel: same behavior.
3. Forum topic where badge already changed: banner total must also reflect fresh topic unread.
4. Forum topic where badge did not change: logs must show whether read-line fired and whether `markTopicRead` reached backend.
5. Large unread window, for example `999+`: slight scroll must not collapse the counter by unsafe bottom mark-read.

Status: implementation started.

## 2026-05-13 - Implementation: A + B + diagnostics completed

Implemented:

1. Universal read tracker for all native Telegram API message views:
   - file: `src/native/hooks/useReadOnScrollAway.js`;
   - uses the real message scroll container as `IntersectionObserver.root`;
   - uses a middle reading line via `rootMargin: -48%`;
   - does not mark messages read on initial open;
   - marks read after the user scrolls the message through the reading line and it leaves upward;
   - logs `read-line-initial`, `read-line-seen`, `read-line-read`.
2. Wired the tracker into:
   - `MessageBubble`;
   - `AlbumBubble`;
   - `InboxChatPanel` passes `msgsScrollRef.current` as `readRoot`.
3. Fixed stale unread-window banner:
   - banner now derives total unread from fresh `activeTopic.unreadCount` or `activeChat.unreadCount`;
   - topic refresh updates the matching `messageWindows[topicKey]`;
   - normal `tg:chat-unread-sync` and bulk unread sync update matching flat chat `messageWindows`.
4. Tests updated:
   - read-line behavior;
   - album visibility read;
   - topic unread-window refresh;
   - static multi-account/read safeguards.

Checks passed:

```text
npm.cmd run test:vitest -- src/native/components/MessageBubble.vitest.jsx src/native/components/MediaAlbum.vitest.jsx src/native/modes/InboxMode.vitest.jsx src/native/hooks/useReadOnScrollAway.vitest.jsx src/native/store/nativeStore.vitest.jsx
node src\__tests__\multiAccount.test.cjs
node src\__tests__\memoryBankSizeLimits.test.cjs
npm.cmd run lint
npm.cmd run build
```

Manual checks required:

1. Private Telegram API chat:
   - open with unread;
   - scroll several unread messages;
   - expected: badge decreases after Telegram confirms.
2. Ordinary group/channel:
   - same check, especially long posts/media.
3. Forum topic where badge changes:
   - expected: left topic badge and yellow banner total stay consistent.
4. Forum topic where badge previously did not change:
   - expected: after scrolling messages through the middle area, read-line logs and topic badge update after Telegram refresh.
5. Large unread window:
   - expected: slight scroll does not collapse `999+` to a small fake value; bottom/double-click guard still protects incomplete windows.

Status: code implemented and automated checks passed. Waiting for manual app verification.

## 2026-05-13 - Manual check: counter still did not change while scrolling

User check:

- Chat: native Telegram API, ordinary channel/group example `Машинное обучение`.
- Visible state: left badge stayed around `138`, banner showed `100 из 138`.
- User scrolled down through messages, but the badge did not decrease.
- User also confirmed the log window exists and asked whether diagnostics are written there.

Log file:

- Main log path: `%APPDATA%\ЦентрЧатов\chatcenter.log`.
- The diagnostics are already written into this same file through `app:log`.
- Relevant prefix: `[native-scroll]`.

What the log showed:

```text
store-load-messages ... unread=138 aroundId=79871
store-tg-messages ... firstId=79773 lastId=79943
read-batch-send ... maxId=79773
mark-read OK ... maxId=79773
UNREAD SYNC ... Telegram сервер=138
read-batch-send ... maxId=79784
mark-read OK ... maxId=79784
UNREAD SYNC ... Telegram сервер=138
```

Conclusion:

- The read diagnostics did work.
- The UI did send `mark-read`.
- Backend accepted the request.
- Telegram returned the same server unread value.
- Reason: the app was marking old loaded messages before/at the previous Telegram read cursor instead of only messages after `readInboxMaxId`.
- Example: the chat was loaded around `readInboxMaxId=79871`, but early read events sent `maxId=79773`, `79784`, etc. Those messages are already behind Telegram's unread boundary, so they cannot reduce unread.

Second issue found by tests:

- `firstUnreadId` was stored only in `useRef`.
- A ref update does not rerender React.
- Result: the code could calculate a better first unread id, but the unread divider/render tree could stay stale until another render happened.

Fix implemented:

1. `findFirstUnreadId(messages, unreadCount, readInboxMaxId)` now prefers the first incoming message with `id > readInboxMaxId`.
2. `InboxMode` now derives `activeReadInboxMaxId` from active topic/chat/window metadata.
3. `InboxMode` stores `firstUnreadId` in React state and mirrors it into `firstUnreadIdRef`.
4. `useReadByVisibility` skips messages with `id <= readInboxMaxId` and logs:
   - `read-skip-before-cursor`.

Expected behavior after this fix:

- On opening an unread window, the divider/scroll target should point to the first message after Telegram's read cursor.
- Scrolling older messages before `readInboxMaxId` must not send useless `mark-read`.
- Scrolling unread messages after `readInboxMaxId` should send a meaningful `maxId`, and then Telegram should return a lower `unreadCount` through `tg:chat-unread-sync`.

Checks added:

- Unit test for `findFirstUnreadId(..., readInboxMaxId)`.
- Inbox render test that the unread divider is not placed on an old message before `readInboxMaxId`.
- Inbox behavior test that read logic does not send `mark-read` for messages older than cursor.

Automated checks passed:

```text
npm.cmd run test:vitest -- src/native/modes/InboxMode.vitest.jsx src/native/hooks/useReadOnScrollAway.vitest.jsx src/native/utils/scrollDiagnostics.vitest.js src/native/store/nativeStore.vitest.jsx
node src\__tests__\multiAccount.test.cjs
```

Manual check still required:

1. Restart the app or refresh native renderer.
2. Open a Telegram API chat with unread count.
3. In logs check that `first-unread-calc` now includes `readInboxMaxId` and `firstUnreadId` greater than it.
4. Scroll unread messages.
5. Expected log:
   - possible `read-skip-before-cursor` for old messages;
   - then `read-batch-send maxId=...` where maxId is greater than `readInboxMaxId`;
   - then `UNREAD SYNC ... Telegram сервер=<smaller number>`.
## 2026-05-13 - Root cause: stale read guard blocked first chat entry

User check:

- First open of some native Telegram API chats still did not reduce the unread badge while scrolling.
- If the user opened another chat and returned back, the counter sometimes started working.

Fresh log evidence:

```text
initial-run ... firstUnread=17228 activeUnread=452
read-scrolled-away ... msgId=17228
read-batch-skip ... lastReadMax=17228 maxEverSent=17699
```

Meaning:

- Telegram's server cursor said unread starts near `17228`.
- Our local guard `maxEverSentRef` still remembered `17699` from an older/stale attempt.
- Because `17228 < 17699`, the UI blocked a valid `mark-read`.
- That is why the first entry could fail, while switching away/back reset enough state for it to start working.

How Telegram-style behavior should work:

- The source of truth is Telegram's read cursor: `readInboxMaxId`.
- The app must only mark messages with `id > readInboxMaxId`.
- Local "already sent" guards may prevent duplicates, but must not outrank the server cursor.

Fix implemented:

1. `useReadByVisibility` now resets local read guards on chat/cursor change:
   - `lastReadMaxRef = readInboxMaxId`;
   - `maxEverSentRef = readInboxMaxId`;
   - diagnostic: `read-guard-reset`.
2. `nativeStore.markRead(chatId, maxId, options)` now passes `readInboxMaxId` to backend.
3. `InboxMode.markReadCurrentView` passes `activeReadInboxMaxId` for ordinary non-topic chats.
4. `tg:mark-read` backend now also receives `readInboxMaxId`:
   - skips useless calls `maxId <= readInboxMaxId`;
   - if backend's local guard is above the server cursor, it resets that guard to the server cursor;
   - diagnostic: `mark-read guard reset by server cursor`.

Why this is safe:

- We still do not mark messages older than Telegram's server cursor.
- We still keep the guard against real duplicate/lower `maxId` calls.
- We only lower the local guard when the renderer passes Telegram's own `readInboxMaxId`, meaning the previous local highwater is stale compared with server state.

Added checks:

- `src/native/hooks/useReadByVisibility.vitest.jsx` verifies stale `maxEverSentRef=17699` is reset to `readInboxMaxId=17227` and a valid read for `17228/17229` is sent.
- `src/native/store/nativeStore.vitest.jsx` verifies `markRead` passes `readInboxMaxId`.
- `src/__tests__/multiAccount.test.cjs` verifies the renderer, store and backend all keep this cursor-based guard.

Manual check:

1. Restart the app.
2. Open an unread native Telegram API chat once, without switching away/back.
3. Scroll through unread messages.
4. In logs expected:
   - `read-guard-reset ... readInboxMaxId=<server cursor>`;
   - no `read-batch-skip` where `maxEverSent` is much higher than the server cursor;
   - `read-batch-send maxId=<id greater than cursor>`;
   - `mark-read OK`;
   - `UNREAD SYNC ... Telegram server=<smaller number>`.

## 2026-05-13 - Telegram-style unread badge formatting

User request:

- Make the native unread message counters look like Telegram.
- Problem examples:
  - chat list showed `999+` instead of Telegram-like `2.1K`;
  - scroll-to-bottom button showed `99+`, hiding the real unread number.

Decision:

- Use one shared formatter for native unread counters.
- Chat list, forum topic list, account sidebar badges: compact Telegram-style format:
  - `999` -> `999`;
  - `1000` -> `1K`;
  - `2150` -> `2.1K`;
  - `12000` -> `12K`.
- Scroll-to-bottom button keeps exact numbers longer:
  - `2150` -> `2150`;
  - after `9999` it also switches to compact `K`.

Files changed:

- `src/native/utils/unreadFormat.js` - shared formatter.
- `src/native/components/ChatListItem.jsx` - ordinary native chat rows.
- `src/native/components/InboxChatListSidebar.jsx` - forum topic rows.
- `src/native/components/InboxChatPanel.jsx` - unread-window banner and scroll-to-bottom badge.
- `src/native/NativeApp.jsx` - account sidebar unread badge.

Checks:

- `src/native/utils/unreadFormat.vitest.js` covers `1K`, `2.1K`, `9.9K`, `12K` and exact scroll-button mode.
- `src/native/components/ChatListItem.vitest.jsx` now expects `1.5K` instead of `999+`.
- `src/__tests__/multiAccount.test.cjs` checks that native unread badges use the shared formatter and the bottom button no longer hard-caps at `99+`.

Manual check:

1. Open native CenterChats.
2. Find a chat with more than 999 unread messages.
3. Expected in the left list: compact value like `2.1K`, not `999+`.
4. Open that chat.
5. Expected on the down button: exact large value while it is below 10000, not `99+`.

## 2026-05-13 - Handoff for next AI

Purpose of this document:

- This is the main working file for the Telegram native/API forum topics and unread counter investigation.
- It records why the task exists, what was changed, which bugs were found, which diagnostics exist, and what must be checked next.
- The task is not about WebView Telegram tabs. It is about the native CenterChats Telegram API mode where multiple Telegram API accounts are shown in one interface.

Current user goal:

- Make unread counters and forum topic behavior work like Telegram as closely as possible.
- This applies to ordinary chats, channels/supergroups, forum topics, and private messages.
- The user wants counters to be understandable, stable, and not jump with stale values.
- The user also wants visible loading/progress when only part of the unread window is loaded.

What is already implemented:

1. Forum topic mode:
   - When a Telegram group has forum topics, opening the parent group replaces the left chat list with a topic list.
   - The right message panel no longer shows random parent/group messages before a topic is selected.
   - Messages are shown only after the user selects a concrete topic.
   - Topic messages use a topic-specific key, not the parent group key.
   - Closing the topic list returns to the normal account chat list.
   - Reopening the same forum group works again after closing.
   - The topic panel has a slide transition from the right and a less abrupt hover state.

2. Telegram custom emoji topic icons:
   - Forum topic icons can use Telegram custom emoji documents when available.
   - Backend fetches custom emoji documents through Telegram API.
   - Renderer displays image/video custom emoji where possible.
   - Fallback emoji remains only when Telegram custom emoji media is unavailable.

3. Unread-window loading:
   - For chats/topics with unread messages, loading starts around Telegram's `readInboxMaxId`.
   - The app does not blindly open at the newest message when there are unread messages.
   - A visible banner shows that only part of the unread window is loaded, for example `100 из 138`.
   - This was added because Telegram can have hundreds or thousands of unread messages and loading everything at once would be heavy.

4. Scroll-to-bottom button:
   - Single click tries to go to the unread boundary / loaded unread area.
   - Double click jumps to the absolute bottom.
   - The button no longer hard-caps every value at `99+`; it uses the shared formatter.

5. Read marking for ordinary chats:
   - Ordinary non-topic chats use the visibility-based read tracker.
   - Messages are marked read only when they are actually seen/scrolled past.
   - The renderer sends `readInboxMaxId` together with `maxId`.
   - Backend skips useless read calls where `maxId <= readInboxMaxId`.
   - Backend resets its stale local guard if Telegram's server cursor is lower than the app's previous local high-water mark.

6. Read marking for forum topics:
   - Forum topics use the topic-specific read path, not the flat parent group read path.
   - Existing implementation uses `tg:mark-topic-read` / Telegram discussion read behavior.
   - After topic read calls, the topic list is refreshed so topic unread counters can update from Telegram server state.

7. Counter source of truth:
   - Counters should come from Telegram server sync/refresh.
   - Do not fake final unread values by locally subtracting from the UI as the main truth.
   - Local UI may show loading/progress, but the stored unread count must be reconciled from Telegram.

8. Telegram-style unread badge formatting:
   - Native counters now use `src/native/utils/unreadFormat.js`.
   - Examples:
     - `999` -> `999`;
     - `1000` -> `1K`;
     - `2150` -> `2.1K`;
     - `12000` -> `12K`.
   - Chat list, forum topic list, account sidebar, unread-window banner, and down button use this formatter.

Important root cause already found:

- Bug: on first entry into some unread chats, scrolling did not reduce the unread counter.
- Evidence from logs showed:
  - `initial-run ... firstUnread=17228 activeUnread=452`;
  - `read-scrolled-away ... msgId=17228`;
  - `read-batch-skip ... lastReadMax=17228 maxEverSent=17699`.
- Meaning:
  - The local duplicate/read guard remembered an old high message id (`17699`).
  - Telegram server cursor was still lower (`readInboxMaxId=17227`).
  - The app incorrectly skipped a valid first read call because local state was stale.
  - Switching away and back reset local state, which is why the same chat started working later.
- Fix:
  - `useReadByVisibility` resets local read guards on chat/cursor change.
  - Backend `tg:mark-read` also receives `readInboxMaxId` and can reset its guard to Telegram's server cursor.

Key files changed for this work:

- `main/native/telegramChatsIpc.js`
  - Telegram IPC handlers.
  - Forum topic fetch/read behavior.
  - Custom emoji document loading.
  - `tg:mark-read` guard reset using `readInboxMaxId`.

- `src/native/store/nativeStore.js`
  - Native Telegram store.
  - `markRead(chatId, maxId, options)` passes `readInboxMaxId`.
  - Unread-window request/meta helpers live here.

- `src/native/modes/InboxMode.jsx`
  - Main native inbox mode.
  - Selects ordinary chats and forum topics.
  - Passes active `readInboxMaxId` into read calls.

- `src/native/components/InboxChatListSidebar.jsx`
  - Left topic list.
  - Forum topic rows, custom emoji icon rendering, topic unread badges.

- `src/native/components/InboxChatPanel.jsx`
  - Message panel.
  - Unread-window banner.
  - Down button behavior and badge formatting.

- `src/native/components/ChatListItem.jsx`
  - Ordinary chat rows and unread badge formatting.

- `src/native/NativeApp.jsx`
  - Account sidebar unread badge formatting.

- `src/native/hooks/useReadByVisibility.js`
  - Main visibility-based read tracker.
  - Important diagnostics: `read-guard-reset`, `read-scrolled-away`, `read-batch-send`, `read-batch-skip`.

- `src/native/utils/unreadFormat.js`
  - Shared unread count formatter.

Tests added or updated:

- `src/native/hooks/useReadByVisibility.vitest.jsx`
  - Verifies stale local read guard is reset to Telegram's `readInboxMaxId`.
  - Verifies messages at/before the server cursor do not trigger read calls.

- `src/native/store/nativeStore.vitest.jsx`
  - Verifies `markRead` passes `readInboxMaxId`.

- `src/native/utils/unreadFormat.vitest.js`
  - Verifies Telegram-style compact count formatting.

- `src/native/components/ChatListItem.vitest.jsx`
  - Verifies chat row uses compact formatting instead of `999+`.

- `src/__tests__/multiAccount.test.cjs`
  - Static regression checks for read cursor guard and shared unread formatter usage.

Validation commands that passed after the last implementation:

```powershell
npm.cmd run test:vitest -- src/native/utils/unreadFormat.vitest.js src/native/components/ChatListItem.vitest.jsx src/native/hooks/useReadByVisibility.vitest.jsx src/native/modes/InboxMode.vitest.jsx src/native/store/nativeStore.vitest.jsx
node src\__tests__\multiAccount.test.cjs
node src\__tests__\memoryBankSizeLimits.test.cjs
npm.cmd run lint
npm.cmd run build
```

Where diagnostics should appear:

- User-facing log window reads the app log file.
- Installed app log path observed earlier:
  - `C:\Users\Директор\AppData\Roaming\ЦентрЧатов\chatcenter.log`
- Diagnostics relevant to this task use prefixes such as:
  - `[native-scroll]`;
  - `read-guard-reset`;
  - `read-scrolled-away`;
  - `read-batch-send`;
  - `read-batch-skip`;
  - `mark-read OK`;
  - `mark-read SKIP`;
  - `mark-read guard reset by server cursor`;
  - topic read/refresh logs.

Known remaining problem to continue:

- The unread counter can still appear inconsistent in manual testing.
- User examples:
  - Open chat with unread count.
  - Scroll several messages.
  - Counter sometimes does not reduce immediately.
  - Sometimes entering another chat and returning makes the counter start updating.
  - In forum topics one selected topic may update, while another does not.
  - For large unread counts, the banner may show only a partial loaded window such as `100 из 138` or `50 из 999+`.

Most likely areas to inspect next:

1. Visibility tracker attachment:
   - If logs do not show `read-scrolled-away` while scrolling visible messages, the observer/root is not attached to the active message container.
   - Check ordinary chat, channel, private chat, and forum topic separately.

2. Read call emission:
   - If `read-scrolled-away` appears but `read-batch-send` does not, the batching/guard layer is still suppressing the call.
   - Check `activeChatId`, `readInboxMaxId`, `lastReadMaxRef`, and `maxEverSentRef`.

3. Backend acceptance:
   - If `read-batch-send` appears but backend logs `mark-read SKIP`, check whether `maxId` is actually higher than `readInboxMaxId`.
   - If backend logs `mark-read OK` but server unread does not reduce, verify ordinary chat vs topic read path.

4. Server sync:
   - If backend read succeeds but UI counter stays old, inspect unread rescan / chat refresh.
   - Counter should update from Telegram server state, not only local state.

5. Forum topic mismatch:
   - Forum topics must not use flat parent `tg:mark-read`.
   - They need topic/discussion read behavior and topic list refresh.
   - If a topic counter does not move, inspect `topicId`, parent `chatId`, and refreshed topic unread count.

Important constraints for the next AI:

- Do not replace server truth with local fake subtraction as the final unread count.
- Do not mark a whole parent forum group read when only one topic was viewed.
- Do not use one flat chat key for all topics in a forum group.
- Do not remove `readInboxMaxId` from read calls.
- Do not restore hard-coded caps like `99+` or `999+` for native unread badges.
- Do not make the app load thousands of unread messages at once without batching or user-visible progress.
- Do not change Telegram sessions, account storage, or WebView partitions for this task.

Recommended next implementation direction:

1. Confirm logging is written into the normal app log file, not only DevTools console.
2. Add or verify explicit diagnostics for each stage:
   - observer sees message;
   - message crosses read threshold;
   - batch chooses max id;
   - backend receives mark-read;
   - Telegram API accepts/rejects;
   - unread sync returns new count.
3. Run manual test matrix:
   - private chat;
   - ordinary group/supergroup;
   - channel;
   - forum topic;
   - large unread chat (`999+`);
   - two Telegram API accounts.
4. Fix the first broken stage only after logs prove where the chain stops.
5. Keep tests close to the found root cause.

Text for another AI:

```text
You are continuing work in C:\Projects\ChatCenter.

Read first:
- CLAUDE.md
- .memory-bank/README.md
- .memory-bank/group-topic-investigation.md

Current task:
Continue the native Telegram API unread-counter/forum-topic investigation. This is not WebView Telegram. It is the CenterChats native Telegram API mode with multiple Telegram accounts in one interface.

What is already done:
- Forum groups open a topic list instead of showing random parent messages.
- No messages are shown until a concrete topic is selected.
- Topic messages use topic-specific state keys.
- Topic list close/reopen and slide transition were implemented.
- Telegram custom emoji topic icons were added.
- Unread-window loading around Telegram readInboxMaxId was added.
- Visibility-based read marking was fixed to reset stale local guards to Telegram server readInboxMaxId.
- Backend tg:mark-read receives readInboxMaxId and skips/resets safely.
- Native unread badges use Telegram-style formatting through src/native/utils/unreadFormat.js.
- Tests and build passed after these changes.

Known remaining issue:
Counters can still fail to reduce in some real manual cases. Sometimes they start working only after switching to another chat and back. In forums, one topic may update while another does not. Large unread windows show partial loading like "100 из 138" or "50 из 999+".

Do not guess. Use logs:
- [native-scroll]
- read-guard-reset
- read-scrolled-away
- read-batch-send
- read-batch-skip
- mark-read OK/SKIP
- topic read/refresh logs

Find which stage breaks:
1. Does observer see visible/scrolled messages?
2. Does batch send markRead with maxId > readInboxMaxId?
3. Does backend accept and call Telegram?
4. Does Telegram server unread count reduce on rescan/refresh?
5. For forum topics, is topic-specific read path used instead of parent chat mark-read?

Keep server as source of truth. Do not fake unread counts with permanent local subtraction. Do not mark parent forum group read for a topic. Do not remove readInboxMaxId. Do not restore 99+/999+ hard caps.

Before final response, update .memory-bank/group-topic-investigation.md with what you found, what you changed, what tests passed, and what remains.
```

## 2026-05-13 - Stage: Newer-messages auto-prefetch (Telegram-style infinite scroll down)

User goal:

- Open chat with thousands of unread (real case: chat "1337" has 4253 unread).
- Cursor lands on the first unread message.
- User scrolls down → unread counter decreases → newer messages auto-load in batches.
- No huge batch load, no extra network traffic.
- Must work for ordinary chats, channels/supergroups and forum topics.

Facts verified before coding:

- Telegram MTProto `messages.getHistory` hard limit per request = **100 messages**. Source: core.telegram.org/api/offsets.
- TDLib `getChatHistory` hard limit per request = **100**.
- For loading messages NEWER than a known id: pass `min_id = lastKnownId`, `offset_id = 0`, negative `add_offset`.
- For loading messages OLDER than a known id: pass `offset_id = oldestKnownId` (already implemented as `loadOlderMessages`).
- react-virtualized default prefetch threshold = 15 rows. Industry-standard 10-20.
- Telegram, Discord, Slack, Stream Chat all use pagination-by-100 + virtualization.
- VirtuosoMessageList is commercial/paid. Free Virtuoso for chats requires full render rewrite. Decision: virtualization is a separate Stage 2, not in this slice.

Current code state before this change:

- `nativeStore.js` const `UNREAD_WINDOW_MAX_MESSAGES = 500` — but Telegram API caps at 100. Real bug: banner stuck on "100 из 138" because the app thought 500 was possible.
- `unreadWindowRequestParams()` uses `addOffset = -limit/4` — for huge unread chats this loads ~25 unread + ~75 context.
- `tg:get-messages` and `tg:get-topic-messages` accept `aroundId` / `addOffset` but NOT `afterId` for newer-direction pagination.
- `loadOlderMessages` exists for scroll-up pagination, no symmetric `loadNewerMessages`.
- `useInboxScroll` triggers infinite scroll up at `scrollTop < 100`, no symmetric trigger near bottom.
- `tg:messages` IPC handler supports `append:true` only for prepend (older), no append-newer mode.
- `InboxChatPanel` has the "X из Y" banner, no separate "loading more newer" indicator.

What this change implements (Stage 1 — safe, no virtualization, no library):

1. **Telegram-correct page size**: `UNREAD_WINDOW_MAX_MESSAGES` 500 → 100 (real API ceiling).
2. **Smart addOffset for first window**: when `unread > 30`, allocate 90% of window to unread messages instead of 25%. Tiny unread chats keep more context.
3. **Backend `afterId` parameter** in `tg:get-messages` and `tg:get-topic-messages`: maps to MTProto `min_id` + `offset_id=0` + negative `add_offset = -limit`.
4. **Store `loadNewerMessages(chatId, afterId, limit=100)`** with built-in throttle 300 ms per chatId to protect against `FLOOD_WAIT`.
5. **`useInboxScroll` prefetch trigger**: when user scrolls within `1500 px` of the bottom AND newest loaded message is incoming → call `loadNewerMessages(chatId, newestId)`. Guarded by `loadingNewerRef`.
6. **`tg:messages` listener**: new `appendNewer:true` field → append-after-existing with dedup. Existing `append:true` (older) untouched.
7. **UI indicator**: small `native-msgs-loading-newer` strip inside the scroll container, visible only while a newer-page request is in flight.
8. **No array-size limit** for now. Reason: hard cap (e.g. 1500) would force re-fetching from Telegram if user scrolls back up — that risks `FLOOD_WAIT` and lag. RAM growth is bounded by user behavior (one open chat at a time).

What this change does NOT do (Stage 2, deferred):

- DOM virtualization (`react-virtuoso` free version / `react-window`). Adding it now requires rewriting message grouping (day/sender), mark-read via reading-line, and scroll-to-reply (`scrollToIndex` instead of DOM lookup). Estimated 600-800 lines of refactor with regressions risk. Will be a separate stage after this one is verified in production.
- Stale-badge animation. Explicitly cut by the user as "unnecessary cosmetic".
- Sending into forum topics (Stage 5 from the older plan, separate).

Why these specific numbers:

- `100` per request — hard ceiling of the Telegram API itself, not a chosen number.
- `300 ms` throttle — safe rate that lets one account avoid FLOOD_WAIT in practice (verified in MadelineProto / Telethon community reports).
- `1500 px` prefetch threshold — roughly 20 messages of typical height (~70-80 px each).
- Smart addOffset 0.9 — leaves a 10-message context above the cursor while keeping the loaded page mostly unread.

Files to change in this slice:

- `main/native/telegramMessages.js` — add `afterId` parameter to `tg:get-messages` and `tg:get-topic-messages`. Emit `appendNewer:true` when `afterId` provided.
- `src/native/store/nativeStore.js` — change `UNREAD_WINDOW_MAX_MESSAGES` to 100, smart `addOffset`, add `loadNewerMessages`, expose it from the hook.
- `src/native/store/nativeStoreIpc.js` — handle `appendNewer` in `tg:messages` listener with dedup.
- `src/native/hooks/useInboxScroll.js` — add prefetch trigger near bottom with `loadingNewerRef`.
- `src/native/modes/InboxMode.jsx` — pass `loadingNewer` state into `InboxChatPanel`, wire `store.loadNewerMessages` into `useInboxScroll`.
- `src/native/components/InboxChatPanel.jsx` — render `native-msgs-loading-newer` strip when active.
- `src/native/styles-messages.css` — CSS for the new indicator.
- Version bump v0.87.136 → v0.88.0 (new feature per project rule).
- Tests in `src/native/store/nativeStore.vitest.jsx`, `src/__tests__/multiAccount.test.cjs`.

Implementation status: **completed**.

### Files actually changed in this slice

- `main/native/telegramMessages.js` — `tg:get-messages` and `tg:get-topic-messages` accept `afterId` and pass it as MTProto `min_id` with `offset_id=0` and `add_offset=-limit`. Emit `appendNewer:true` when `afterId` provided.
- `src/native/store/nativeStore.js`:
  - `UNREAD_WINDOW_MAX_MESSAGES` 500 → **100** (real Telegram API ceiling).
  - Smart `addOffset` in `unreadWindowRequestParams`: 90% of window for unread when `unread > 30`, else 25%.
  - New constants `NEWER_PAGE_SIZE = 100`, `NEWER_PAGE_MIN_INTERVAL_MS = 300`.
  - New `loadNewerMessages(chatId, afterId, limit=100)` with per-key throttle via `loadingNewerRef` Map.
  - Exposed `loadNewerMessages` from the hook return.
- `src/native/store/nativeStoreIpc.js` — `tg:messages` listener handles `appendNewer:true` by appending after existing array with dedup by id.
- `src/native/hooks/useInboxScroll.js`:
  - New constant `NEWER_PREFETCH_THRESHOLD_PX = 1500`.
  - When `fromBottomPx < threshold` AND `loadingNewerRef.current === false` AND `initialScrollDoneRef.current === viewKey` AND the last incoming message has an id → calls `store.loadNewerMessages(chatAtStart, afterId, 100)` and toggles `setLoadingNewer`.
  - Diagnostics events: `load-newer-trigger`, `load-newer-result`, `load-newer-error`.
- `src/native/modes/InboxMode.jsx` — added `loadingNewerRef = useRef(false)` and `[loadingNewer, setLoadingNewer] = useState(false)`; pass them into `useInboxScroll` and `InboxChatPanel`.
- `src/native/components/InboxChatPanel.jsx` — new `loadingNewer` prop, renders `<div className="native-msgs-loading-newer">` indicator at the end of the message list when active.
- `src/native/styles-messages.css` — added `.native-msgs-loading-newer` and `.native-msgs-loading-newer__dot` with `@keyframes native-msgs-loading-newer-pulse` animation.
- `package.json`, `package-lock.json`, `CLAUDE.md`, `.memory-bank/features.md` — version v0.87.135/0.87.136 → **v0.88.0**.

### Tests added/updated

- `src/native/store/nativeStore.vitest.jsx`:
  - 5 new vitest tests for `loadNewerMessages` (IPC params, topic routing, throttle, missing afterId, `appendNewer` dedup).
  - 2 new vitest tests for `unreadWindowRequestParams` with the new limit=100 and smart addOffset.
  - Updated 2 existing tests that expected old `limit: 488`/`limit: 106` and `addOffset: -26`/`-122` — now expect `limit: 100` and the new smart addOffset (`-90` for big unread, `-12` for small).
- `src/__tests__/unreadAutoPrefetch.test.cjs` — new static-checks file with 13 assertions covering backend, store, listener, hook, UI and CSS. Created as a separate file to avoid growing `multiAccount.test.cjs` past its already-exceeded 400-line limit.
- `src/__tests__/multiAccount.test.cjs` — reverted earlier in-place additions (size hygiene); newer-prefetch coverage lives in `unreadAutoPrefetch.test.cjs`.

### Validation commands that passed

```powershell
npm.cmd run lint                                                   # OK
npm.cmd run test:vitest                                             # 19 files / 164 tests passed
node src\__tests__\multiAccount.test.cjs                            # 81/81
node src\__tests__\unreadAutoPrefetch.test.cjs                      # 13/13
node src\__tests__\memoryBankSizeLimits.test.cjs                    # 27/27
node src\__tests__\featuresReferences.test.cjs                      # 2/2 (last-10-versions refs valid)
node src\__tests__\fileSizeLimits.test.cjs                          # no NEW regressions (7 pre-existing exceptions unchanged)
```

### What still needs manual verification in the running app

1. Open ordinary native Telegram chat with 1000+ unread (real example from screenshot: chat «1337», 4253 unread).
   - Expected: chat opens near first unread (around `readInboxMaxId`).
   - Scroll down through messages.
   - Expected log sequence: `load-newer-trigger`, `load-newer-result hasMore=true`, store dispatch with `appendNewer:true`.
   - Unread badge should keep decreasing (existing read-line behavior).
   - At the bottom of the list a small `Загружаю ещё...` indicator with pulsing dot should appear during the request.
2. Open forum topic with many unread messages and verify the same behavior with `tg:get-topic-messages`.
3. Verify the banner `«100 из 138»` no longer gets stuck — it should disappear as soon as `loadedIncoming >= unreadCount`.
4. Scroll very fast — verify no `FLOOD_WAIT` from Telegram (throttle 300 ms should hold).

### What is explicitly NOT in this slice (next stages)

- **Stage 2 — DOM virtualization**: not implemented. Reason: free `Virtuoso` and `react-window` require rewriting message grouping (day/sender headers), mark-read via reading-line, scroll-to-reply via `scrollToIndex`. ~600-800 lines of refactor with regression risk. Will be a separate stage when needed for very large chats (>5000 visible messages in memory).
- **Stage 5 — sending into forum topics**: input still disabled with text `«Отправка в темы будет следующим этапом»`.
- **Stale-badge animation**: explicitly cut by the user as unnecessary cosmetic.

### Known size-limit notes (pre-existing, not regressions)

- `src/__tests__/multiAccount.test.cjs` was 542 lines before this work and is 498 lines after. Still above the 400-line limit — pre-existing technical debt tracked in `.memory-bank/handoff-code-limits.md`. This slice **did not** add to it; newer-prefetch tests live in the dedicated `unreadAutoPrefetch.test.cjs` (121 lines).

## 2026-05-13 - v0.88.1 hotfix: infinite prefetch loop at end-of-chat

**User-visible bug from v0.88.0** (screenshot evidence: chat «Департамент вайб-кодинга», 0 unread, indicator `Загружаю ещё...` stuck visible, chat window twitching periodically):

- After opening a chat where everything is already read (or after reaching the end of unread messages during scroll), the `Загружаю ещё...` indicator stayed on indefinitely.
- Chat window jittered roughly every 300 ms.
- No new messages appeared because there were none.

**Root cause analysis**:

```text
Scroll reaches bottom (fromBottomPx < 1500)
  -> prefetch triggers loadNewerMessages(afterId = last loaded id)
  -> Telegram returns messages=[] (no newer messages exist)
  -> backend STILL emits tg:messages with empty array + appendNewer:true
  -> store listener does setState({ messages: [...existing, ...[]] })
     => NEW array reference with same contents
     => React re-renders the chat panel (visible "twitch")
  -> after 300 ms throttle releases, loadingNewerRef.current = false
  -> scroll position unchanged, fromBottomPx still < 1500
  -> handleScroll fires again on the next scroll/resize event -> prefetch fires again
  -> INFINITE LOOP
```

The v0.88.0 implementation had no concept of "end-of-chat reached — stop trying for this view".

**Fix (three layers of defence)**:

1. **Backend layer** (`main/native/telegramMessages.js`):
   - `tg:get-messages` does NOT emit `tg:messages` event when `afterId` is set and `msgs.length === 0`.
   - `tg:get-topic-messages` does NOT emit `tg:messages` when `afterId` is set and `messages.length === 0`.
   - Empty afterId-response is still returned to caller (`{ ok: true, messages: [], hasMore: false }`) so the hook can mark the view as exhausted.

2. **IPC listener layer** (`src/native/store/nativeStoreIpc.js`):
   - In `tg:messages` handler, when `appendNewer:true` and after dedup `newNewer.length === 0` → return current state object unchanged (only `loadingMessages` flag is cleared). No new `messages` array reference.
   - This is a belt-and-suspenders guard: even if some older code path emits an empty afterId-response, UI no longer twitches.

3. **Hook layer** (`src/native/hooks/useInboxScroll.js`):
   - New `noMoreNewerRef = useRef(new Map())` — per-`viewKey` flag «Telegram already said no more newer».
   - Trigger condition extended: `!noMoreNewerRef.current.get(viewKey)`.
   - In `.then(result)` of `loadNewerMessages`: when `result.ok && (result.hasMore === false || messages.length === 0)` → `noMoreNewerRef.current.set(viewKey, true)`.
   - Naturally resets when user switches chat/topic (new `viewKey` → no entry in Map).
   - New diagnostics field `reachedEnd:true` in `load-newer-result` event.

**Tests added**:

- `nativeStore.vitest.jsx`:
  - `appendNewer with empty messages does NOT change array reference` — strict `expect(refAfter).toBe(refBefore)` check, fails if React would re-render unnecessarily.
  - `appendNewer with only duplicates does NOT change array reference` — same.
- `unreadAutoPrefetch.test.cjs` (3 new):
  - `noMoreNewerRef блокирует бесконечный цикл у конца чата` — checks both the ref name and the condition `!noMoreNewerRef.current.get(viewKey)` in the trigger.
  - `listener делает ранний return когда нет новых сообщений` — checks `newNewer.length === 0` short-circuit.
  - `backend НЕ эмитит tg:messages при пустом afterId-ответе` — checks both `tg:get-messages` and `tg:get-topic-messages` guards.

**Validation**:

```powershell
npm.cmd run lint                                                # OK
npm.cmd run test:vitest                                          # 19 files, 166 tests (+2 from v0.88.0)
node src\__tests__\unreadAutoPrefetch.test.cjs                   # 16/16 (+3)
node src\__tests__\multiAccount.test.cjs                         # 81/81
node src\__tests__\memoryBankSizeLimits.test.cjs                 # 27/27
```

**Version bump**: v0.88.0 → v0.88.1 (patch — bug fix on a feature shipped same day).

**Trade-off documented**:

- `noMoreNewerRef` is sticky per session. If the user stays in a chat for hours and a new message arrives via push (`tg:new-message`), the flag is NOT auto-cleared. This is intentional and safe: push events add the message to the array directly, so the user does see new content without prefetch involvement.
- If at some future point push events become unreliable, the simplest extension is: clear `noMoreNewerRef` entry for `chatId` inside the `tg:new-message` handler in `nativeStoreIpc.js`. Not added now to keep this hotfix focused.

## 2026-05-13 - v0.88.2 push safety net + Stage 2 protective tests

**Why** (this is the "Step 1" from the pre-Stage-2 plan):

User asked an excellent question after seeing v0.88.1 fix: «if new messages arrive in 5 sec / 10 min / tomorrow — what happens?». Answer from Telegram docs (core.telegram.org/api/updates): **server-push** delivers them through the persistent MTProto connection (`attachMessageListener` in `telegramMessages.js`). GramJS handles auto-reconnect + `updates.getDifference` internally. Push adds the message to the store array via `tg:new-message` handler in `nativeStoreIpc.js`. So in 99% of cases real-time works without any prefetch involvement.

The remaining theoretical gap: if push **rasync** (gap in pts that GramJS didn't catch up), the `noMoreNewerRef` flag from v0.88.1 blocks the "rescue" prefetch indefinitely. To close this gap **before** the larger Stage 2 (virtualization) refactor.

**What was added in v0.88.2**:

1. `src/native/hooks/useInboxScroll.js` — new `useEffect` that tracks `activeMessages.length` per `scrollKey`. When the array grows within the same `viewKey` (either push delivered a new message or load-newer returned something), `noMoreNewerRef.current.delete(key)` clears the flag automatically. Logged through `load-newer-flag-reset` event.
2. `src/__tests__/unreadAutoPrefetch.test.cjs` — 3 new static checks for the reset logic, plus 5 new "Stage 2 protection" checks for fragile integrations that will need careful handling under virtualization:
   - `MessageBubble` and `AlbumBubble` accept `onReplyClick` (reply-to-message → scroll).
   - `InboxChatPanel` wires `scrollToMessage` into `onReplyClick`.
   - `groupMessages(visibleMessages, firstUnreadId)` — message grouping with «Новые сообщения» divider.
   - `useInitialScroll` reads `firstUnreadIdRef`.
   - `useReadOnScrollAway` uses `rootMargin: '-48% 0px -48% 0px'` (reading line).
   - If Stage 2 (virtualization) breaks any of these — the corresponding static test will fail loud.

**Behavior after v0.88.2**:

```text
Chat with 0 unread, end of chat
  -> scroll near bottom triggers prefetch
  -> Telegram returns 0 messages -> noMoreNewerRef.set(key, true)
  -> next scroll: blocked (good)

10 minutes later, push arrives via tg:new-message
  -> nativeStoreIpc adds the message to messages[chatId]
  -> activeMessages.length grows from N to N+1
  -> useEffect in useInboxScroll detects growth
  -> noMoreNewerRef.delete(key)
  -> next scroll: prefetch allowed again (good)
```

**Archive split** (separate concern, same release):

After adding v0.88.0/1/2 entries to `.memory-bank/features.md` the file grew to 102 KB — above the 100 KB hard limit enforced by `memoryBankSizeLimits.test.cjs`. Solution: extracted v0.87.93..v0.87.105 (13 versions, ~30 KB of changelog) into a new archive file `.memory-bank/archive/features-v0.87.93-105.md`. Active features.md is now 62 KB. Archive index in `.memory-bank/archive/README.md` updated with a new journal entry.

**Version bump**: v0.88.1 → v0.88.2 (patch — protective improvement, no new user-visible feature).

**Validation**:

```powershell
npm.cmd run lint                                                # OK
npm.cmd run test:vitest                                          # 19 files / 166 tests passed
node src\__tests__\unreadAutoPrefetch.test.cjs                   # 22/22 (+8 from v0.88.0..v0.88.1)
node src\__tests__\multiAccount.test.cjs                         # 81/81
node src\__tests__\memoryBankSizeLimits.test.cjs                 # 27/27
node src\__tests__\featuresReferences.test.cjs                   # 2/2 (4 unique refs valid)
```

## 2026-05-13 - Plan for Stage 2: DOM virtualization

**Goal**: render plays smoothly even when the in-memory array has 4000-10000+ messages (real example: user's chat «1337» has 4253 unread).

**Why now**: v0.88.0..v0.88.2 introduced infinite-scroll-down. In long sessions the in-memory array can grow to multi-thousand messages — at that scale the existing 1-to-1 array→DOM mapping becomes the bottleneck (slow scroll, high RAM for DOM nodes).

**Constraints from earlier discussion with the user**:
- Free `VirtuosoMessageList` is commercial — not usable.
- Free `Virtuoso` + `react-window` need a render rewrite — high risk but necessary.
- Project **already has `react-window` 2.2.7** installed (used in `InboxChatListSidebar.jsx` for the chat list).
- Must preserve: reply-to-message scroll, mark-read via reading line, day/sender grouping, "Новые сообщения" divider, initial scroll to first unread, push delivery.

**Pre-flight done before Stage 2 (this commit)**:
- ✅ Step 1: push safety net (v0.88.2) — done.
- ✅ Step 4: protective static tests — done (see above).
- ⏳ Step 3: git commit + branch — to be done now.
- ⏳ Step 2: manual user verification — explicit user choice: «after all Stage 2 work».

**Stage 2 implementation outline** (to be filled with concrete files + diff after execution):

1. Add `react-window` `<List>` integration in `InboxChatPanel.jsx` for the messages area.
2. Adapt `renderItems` so each entry has a stable index for `scrollToRow`.
3. Replace DOM-based `scrollToMessage(id)` with index-based `scrollToRow({ index })`.
4. Keep `MessageBubble`/`AlbumBubble` inside the row renderer — their `useReadOnScrollAway` IntersectionObserver still fires for rows that are mounted in DOM (this is the same set as before, minus far-off rows that virtualization keeps unmounted).
5. Verify dynamic row heights work (text/media/album → variable height).
6. Update `useInitialScroll` to use `scrollToRow` for initial-unread jump.
7. Run vitest + protective static tests; visual manual check after all of it.

**Risk register for Stage 2** (will document outcomes):
- Reply-to-message scroll: medium risk (DOM lookup → index lookup).
- mark-read via reading line: medium risk (rows outside virtualization window won't fire observer; this is the same as current behavior for messages above/below viewport, but the rescue prefetch interactions need testing).
- Initial scroll to first unread: medium-high risk (`react-window` `scrollToRow` timing depends on row heights being measured first).
- Group rendering (day separators, sender avatars): low-medium risk if grouping logic is kept in `messageGrouping.js` and only the rendering layer is virtualized.
- Image/media height jumps: medium risk (height changes after load require list to re-measure).

Implementation status: in progress.
