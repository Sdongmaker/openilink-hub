# Virtual Group UI — Design Spec

**Date**: 2026-04-10  
**Status**: Approved  
**Scope**: Add admin-facing UI for the existing relay (virtual group) system: message aggregation view, member management, and sidebar navigation entry.

## Context

The relay system already forwards private messages between all online bots using emoji-based anonymity (`relay_members` table, `relayToVirtualGroup()` in `manager.go`). However, **no frontend UI exists** for this feature — admins cannot view the aggregated message flow or manage relay members from the dashboard.

## Requirements

1. Admin can view a unified, chronological message stream of all relayed messages.
2. Admin can see which bots are relay members, their emoji, online status, and owning user.
3. Admin can remove a bot from the relay group.
4. Sidebar shows a "Virtual Group" navigation entry (admin-only).
5. New relay messages appear in real-time via WebSocket.

## Data Model

### New table: `relay_messages`

```sql
CREATE TABLE IF NOT EXISTS relay_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_bot_id   TEXT    NOT NULL,
    emoji           TEXT    NOT NULL,
    content_type    TEXT    NOT NULL,  -- "text", "image", "voice", "video", "file"
    content         TEXT    NOT NULL,
    media_key       TEXT,
    original_msg_id INTEGER,
    created_at      BIGINT  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relay_messages_created ON relay_messages(created_at);
```

Each relay event is recorded **once** (inbound direction only — when a user's message enters the relay pipeline). No per-target-bot rows.

### Store interface additions (`RelayStore`)

```go
type RelayMessage struct {
    ID            int64  `json:"id"`
    SourceBotID   string `json:"source_bot_id"`
    Emoji         string `json:"emoji"`
    ContentType   string `json:"content_type"`
    Content       string `json:"content"`
    MediaKey      string `json:"media_key,omitempty"`
    OriginalMsgID int64  `json:"original_msg_id,omitempty"`
    CreatedAt     int64  `json:"created_at"`
}

// Added to existing RelayStore interface
SaveRelayMessage(sourceBotID, emoji, contentType, content, mediaKey string, originalMsgID int64) (*RelayMessage, error)
ListRelayMessages(limit int, beforeID int64) ([]RelayMessage, error)
```

## Backend API

All endpoints require `requireAdmin` middleware.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/relay/messages` | List relay messages. Query: `?limit=50&cursor=<encoded_id>` |
| `GET` | `/api/admin/relay/members` | List relay members with bot info, owner name, online status |
| `DELETE` | `/api/admin/relay/members/{botID}` | Remove a bot from the relay |
| `GET` | `/api/admin/relay/ws` | WebSocket for real-time relay message push |

### `GET /api/admin/relay/messages` response

```json
{
  "messages": [
    {
      "id": 42,
      "source_bot_id": "abc123",
      "emoji": "🦊",
      "content_type": "text",
      "content": "今天心情不太好",
      "created_at": 1712736000000
    }
  ],
  "next_cursor": "...",
  "has_more": true
}
```

### `GET /api/admin/relay/members` response

```json
[
  {
    "bot_id": "abc123",
    "emoji": "🦊",
    "bot_name": "Bot-43726eca",
    "owner_name": "user1",
    "online": true,
    "joined_at": 1712736000000
  }
]
```

### WebSocket `/api/admin/relay/ws`

Server pushes new `RelayMessage` JSON objects as they are saved. Admin client appends to the message stream in real-time.

## Write Path

In `internal/bot/relay.go` → `relayToVirtualGroup()`:

1. Before broadcasting to target bots, call `m.store.SaveRelayMessage(...)`.
2. After save, broadcast the saved `RelayMessage` to admin WebSocket connections via a new `RelayAdminHub`.

```
User sends private msg → bot inbound → relayToVirtualGroup()
  → SaveRelayMessage() ← NEW
  → Broadcast to admin WS ← NEW
  → Forward to all other bots (existing)
```

## Frontend

### Sidebar (`layout.tsx`)

New top-level group between "账号管理" and "应用市场", visible only when `isAdmin`:

```
├─ 🌐 虚拟群组
│  ├─ 消息广场    → /dashboard/relay
│  └─ 群组成员    → /dashboard/relay/members
```

### Page: 消息广场 (`relay-chat.tsx`)

- Chat-like message stream, newest at bottom.
- Each message: emoji badge + content + relative timestamp.
- Click emoji → tooltip showing real bot name + owner.
- Media messages: inline preview (image thumbnail, audio player).
- Scroll up to load older messages (cursor-based pagination).
- New messages arrive via WebSocket and auto-append.
- Header bar: online member count + emoji avatars row.

### Page: 群组成员 (`relay-members.tsx`)

- Table/card view of all `relay_members`.
- Columns: Emoji, Bot Name, Owner, Status (online/offline), Joined At, Actions.
- Action: "Remove" button → confirm dialog → `DELETE /api/admin/relay/members/{botID}`.

## File Changes

| Layer | File | Change |
|-------|------|--------|
| Store definition | `internal/store/relay.go` | Add `RelayMessage` struct, `SaveRelayMessage`, `ListRelayMessages` to interface |
| Store impl (SQLite) | `internal/store/sqlite/relay.go` | Create table, implement save/list |
| Store impl (Postgres) | `internal/store/postgres/relay.go` | Same |
| Store impl (memstore) | `internal/store/memstore/memstore.go` | Stub implementations |
| Relay logic | `internal/bot/relay.go` | Call `SaveRelayMessage()` in `relayToVirtualGroup()` |
| API handler | `internal/api/relay_handler.go` (new) | `handleRelayMessages`, `handleRelayMembers`, `handleRemoveRelayMember`, `handleRelayWS` |
| Router | `internal/api/router.go` | Register 4 admin relay endpoints |
| Frontend API | `web/src/lib/api.ts` | Add `relayMessages()`, `relayMembers()`, `removeRelayMember()` |
| Frontend hooks | `web/src/hooks/use-relay.ts` (new) | `useRelayMessages`, `useRelayMembers` |
| Frontend page | `web/src/pages/relay-chat.tsx` (new) | Message stream page |
| Frontend page | `web/src/pages/relay-members.tsx` (new) | Member management page |
| Sidebar | `web/src/components/layout.tsx` | Add "虚拟群组" nav group |
| Routing | Frontend router config | Register `/dashboard/relay` and `/dashboard/relay/members` |

## Message Relay Detailed Flow (500-1000 Members)

### Problem Analysis

Current implementation issues at scale:

1. **Media re-download per target**: For each target bot, `DownloadMedia()` is called from the **source provider**. With 999 targets this means 999 identical downloads — the CDN/provider will rate-limit or block.
2. **Goroutine explosion**: `go m.relayMessage(...)` spawns one goroutine per target. 1000 concurrent goroutines each doing network I/O.
3. **No delivery tracking**: Fire-and-forget — if a target bot is temporarily offline or the send fails, the message is lost.
4. **Memory pressure**: A 10MB video × 999 copies = ~10GB peak memory.

### Revised Architecture: Download-Once, Fan-Out-Many

```
User A sends image via Bot-A
  │
  ├─ 1. relayToVirtualGroup() entry
  │    ├─ SaveRelayMessage() → DB + admin WS broadcast
  │    ├─ [text only] skip download, go to fan-out
  │    └─ [media] Download ONCE from source provider
  │         ├─ DownloadMedia(src, item.Media) → []byte
  │         │   or DownloadVoice(src, item.Media, 0) → []byte
  │         └─ Store to relay media cache (storage.Put)
  │              → cache key: "relay/{msgID}/{index}"
  │
  ├─ 2. Create relay delivery tasks
  │    ├─ One task per target bot (excl. self, excl. no OwnerExtID)
  │    ├─ Task status: pending → sending → done / failed
  │    └─ Tasks saved to DB (relay_deliveries table)
  │
  └─ 3. Worker pool fan-out (bounded concurrency)
       ├─ N worker goroutines (configurable, default 10)
       ├─ Each worker picks a pending task:
       │    ├─ Read cached media bytes (or text from DB)
       │    ├─ dst.Provider.Send(ctx, OutboundMessage{...})
       │    ├─ On success: mark task done
       │    └─ On failure: retry with backoff (max 3 attempts)
       └─ After all tasks: clean up media cache (async)
```

### Per-Message-Type Flow

#### Text Message

```
Source bot receives text from user
  → relayToVirtualGroup()
     → SaveRelayMessage(botID, emoji, "text", text, "", msgID)
     → For each target (worker pool):
         GetLatestContextTokenForTarget(dst.DBID, dst.OwnerExtID)
         dst.Provider.Send(ctx, OutboundMessage{
           Recipient:    dst.OwnerExtID,
           Text:         "🦊 | Hello World",
           ContextToken: ctxToken,
         })
```

**Cost**: Minimal. No download, no caching. Text is < 1KB per send.

**Rate control**: Worker pool limits to 10 concurrent API calls. Provider-side rate limits handled by per-send retry.

#### Image Message

```
Source bot receives image from user
  → relayToVirtualGroup()
     → SaveRelayMessage(botID, emoji, "image", "[图片]", mediaKey, msgID)
     → Download ONCE: data := src.Provider.DownloadMedia(ctx, item.Media)
     → Cache: storage.Put("relay/{relayMsgID}/0", "image/...", data)
     → For each target (worker pool):
         dst.Provider.Send(ctx, OutboundMessage{
           Recipient:    dst.OwnerExtID,
           Text:         "🦊",
           Data:         data,       // shared []byte slice, NOT copied
           FileName:     "image.jpg",
           ContextToken: ctxToken,
         })
     → Cleanup: storage.Delete("relay/{relayMsgID}/0") after all done
```

**Memory**: One copy of image bytes (~50KB-5MB) shared across all sends via the same `[]byte` pointer. Not 999 copies.

**Fallback**: If `DownloadMedia` fails, send text placeholder `"🦊 | [图片]"` to all targets.

#### Voice Message

```
Source bot receives voice from user
  → relayToVirtualGroup()
     → SaveRelayMessage(botID, emoji, "voice", "[语音]", mediaKey, msgID)
     → Download ONCE: data := src.Provider.DownloadVoice(ctx, item.Media, 0)
     → Cache: storage.Put("relay/{relayMsgID}/0", "audio/wav", data)
     → For each target (worker pool):
         dst.Provider.Send(ctx, OutboundMessage{
           Recipient:    dst.OwnerExtID,
           Data:         data,
           FileName:     "voice.wav",
           ContextToken: ctxToken,
         })
```

**Note**: Voice files are typically small (10-300KB for 1-60s audio). Memory pressure is low.

#### Video Message

```
Source bot receives video from user
  → relayToVirtualGroup()
     → SaveRelayMessage(botID, emoji, "video", "[视频]", mediaKey, msgID)
     → Download ONCE: data := src.Provider.DownloadMedia(ctx, item.Media)
     → Cache: storage.Put("relay/{relayMsgID}/0", "video/mp4", data)
     → For each target (worker pool):
         dst.Provider.Send(ctx, OutboundMessage{
           Recipient:    dst.OwnerExtID,
           Text:         "🦊",
           Data:         data,
           FileName:     item.FileName or "video.mp4",
           ContextToken: ctxToken,
         })
     → Cleanup after all sends complete
```

**Concern**: Videos can be 10-50MB. For 1000-member groups:
- Download: 1 × 50MB = 50MB (once)
- Memory: 50MB sustained during fan-out (single copy, Go GC frees after all goroutines finish)
- Upload: 50MB × 999 sends (sequential in worker pool, not concurrent)
- **Duration**: 999 sends × ~1-3s each ÷ 10 workers ≈ 100-300 seconds for large videos. Acceptable for async relay.

**Optimization for large files (>5MB)**: Workers read from storage cache instead of holding `[]byte` in memory. Each worker calls `storage.Get(key)` → send → GC.

#### File Message

Same flow as Image/Video, with `FileName` preserved from the original message.

### New Table: `relay_deliveries`

```sql
CREATE TABLE IF NOT EXISTS relay_deliveries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    relay_msg_id    INTEGER NOT NULL REFERENCES relay_messages(id),
    target_bot_id   TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending',  -- pending, sending, done, failed
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    created_at      BIGINT  NOT NULL,
    updated_at      BIGINT  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relay_deliveries_pending
    ON relay_deliveries(status, created_at) WHERE status IN ('pending', 'failed');
```

### Worker Pool Design

```go
const relayWorkerCount = 10      // concurrent sends
const relayMaxRetries  = 3       // per-target retry
const relaySendTimeout = 30 * time.Second

type relayJob struct {
    relayMsgID  int64
    targetInst  *Instance
    emoji       string
    items       []provider.MessageItem
    mediaData   []byte    // nil for text, pre-downloaded for media
    fileName    string
}

// relayFanOut runs in a goroutine, fans out one relay message to all targets.
func (m *Manager) relayFanOut(msg relayJob, targets []*Instance) {
    jobs := make(chan *Instance, len(targets))
    var wg sync.WaitGroup
    
    // Start worker pool
    for i := 0; i < relayWorkerCount; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for dst := range jobs {
                m.relaySendWithRetry(msg, dst)
            }
        }()
    }
    
    // Enqueue targets
    for _, t := range targets {
        jobs <- t
    }
    close(jobs)
    
    wg.Wait()
}
```

### Retry Strategy

| Attempt | Delay | Action |
|---------|-------|--------|
| 1 | 0s | Immediate send |
| 2 | 5s | Retry after short delay |
| 3 | 30s | Final retry |
| Failed | — | Log error, mark `relay_deliveries.status = 'failed'` |

For **persistent failures** (bot offline, session expired), the delivery is marked failed. No infinite retry — the relay is best-effort and not intended to guarantee delivery like a message queue.

### Crash Recovery

On `StartBot()` → `recoverUnprocessed()`:
- Query `relay_deliveries WHERE status IN ('pending', 'sending') AND target_bot_id = ?`
- Re-enqueue to worker pool
- Media data re-loaded from storage cache (key `relay/{relayMsgID}/{index}`)

### Rate Limiting

- **Per-provider throttle**: Each provider implementation should respect its own rate limits. The worker pool's concurrency (10) already limits parallel sends.
- **Global relay rate limit**: If >50 messages/minute enter the relay, newer messages are queued (channel buffer) rather than spawning more goroutines.
- **Media download semaphore**: Reuse existing `dlSem` (capacity 5) for relay media downloads.

### Sequence Diagram (Image Message, 3 Members)

```
Bot-A (sender)        Manager             Storage        Bot-B (target)    Bot-C (target)
    │                    │                    │               │                 │
    │─ InboundMessage ─→ │                    │               │                 │
    │                    │── SaveRelayMsg() ──│               │                 │
    │                    │                    │               │                 │
    │                    │── DownloadMedia ─→ │               │                 │
    │                    │   (from src CDN)   │               │                 │
    │                    │←── []byte ─────────│               │                 │
    │                    │                    │               │                 │
    │                    │── storage.Put() ──→│               │                 │
    │                    │   "relay/42/0"     │               │                 │
    │                    │                    │               │                 │
    │                    │   ┌──Worker 1──────│───────────────│                 │
    │                    │   │ Send(data)     │               │                 │
    │                    │   │                │          ←────│                 │
    │                    │   │                │    emoji+image │                 │
    │                    │   └────────────────│───────────────│                 │
    │                    │                    │               │                 │
    │                    │   ┌──Worker 2──────│───────────────│─────────────────│
    │                    │   │ Send(data)     │               │                 │
    │                    │   │                │               │            ←────│
    │                    │   │                │               │  emoji+image    │
    │                    │   └────────────────│───────────────│─────────────────│
    │                    │                    │               │                 │
    │                    │── storage.Del() ──→│               │                 │
    │                    │   cleanup cache    │               │                 │
```

### Performance Estimates (1000 Members)

| Message Type | Download | Memory Peak | Fan-out Time (10 workers) | Total API Calls |
|-------------|----------|-------------|---------------------------|-----------------|
| Text | 0 | ~1KB | ~100s | 999 |
| Image (500KB) | 1 × 500KB | ~500KB | ~100s | 999 |
| Voice (100KB) | 1 × 100KB | ~100KB | ~100s | 999 |
| Video (20MB) | 1 × 20MB | ~20MB | ~300s | 999 |
| File (50MB) | 1 × 50MB | ~50MB* | ~500s | 999 |

\* Large files use streaming from cache — actual memory is ~5MB per worker.

**Fan-out time** can be reduced by increasing `relayWorkerCount`. At 50 workers, a text message reaches all 999 bots in ~20 seconds. Trade-off: higher provider rate-limit risk.

## Non-goals

- Multiple virtual groups (only the single global group).
- Admin sending messages into the relay from the dashboard.
- Editing emoji assignments from the UI (future enhancement).
- Message deletion/moderation from the aggregated view.
