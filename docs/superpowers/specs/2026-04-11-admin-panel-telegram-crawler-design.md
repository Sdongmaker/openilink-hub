# Admin Panel & Telegram Crawler Design

**Date:** 2026-04-11
**Status:** Draft
**Author:** Brainstorming session

## Overview

Add an admin management panel and Telegram crawler to OpeniLink Hub. The admin panel provides a login page and dashboard for managing Telegram message crawling. The crawler monitors Telegram channels and groups using a real user account (via gotd/td MTProto), downloads media to MinIO/S3, and uses AI to classify messages as ads.

These modules are independent from the existing iLink/Bot system. They share only infrastructure: database, object storage, and AI service.

## Goals

1. Admin-only management panel with password login (no user registration, no user management)
2. Existing `/join` onboarding page remains unaffected
3. Telegram crawler: monitor channels (content collection) and groups (content collection + ad filtering)
4. Media files stored to existing MinIO/S3 with path-prefix isolation
5. AI-based ad detection on message text, applied in real-time before storage
6. Management UI for Telegram account, watch targets, message browsing, and storage configuration

## Non-Goals

- No NSFW classification (all collected content stored equally; ad tagging is the only classification)
- No multi-user support for the admin panel
- No Telegram message sending (read-only crawling)
- No integration with the existing Bot/Provider/Relay system

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     React SPA (web/)                         │
│  ┌────────────┐  ┌─────────────────────────────────────────┐ │
│  │ /join       │  │ /admin/*                                │ │
│  │ (existing)  │  │ login | dashboard | account | targets  │ │
│  │             │  │ messages | storage-settings             │ │
│  └────────────┘  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                            │
                      HTTP API Layer
                            │
┌──────────────────────────────────────────────────────────────┐
│                    Go Backend (main.go)                       │
│                                                              │
│  ┌──────────────────┐       ┌─────────────────────────────┐ │
│  │ Existing modules  │       │ New modules                 │ │
│  │ api/ auth/ bot/   │       │ api/telegram_handler.go     │ │
│  │ provider/ sink/   │       │ internal/telegram/          │ │
│  │ relay/ app/       │       │   client.go   (MTProto)    │ │
│  │                   │       │   crawler.go  (dispatcher) │ │
│  │                   │       │   processor.go (pipeline)  │ │
│  │                   │       │   store.go    (data layer) │ │
│  └────────┬──────────┘       └────────────┬────────────────┘ │
│           └──────────┬────────────────────┘                  │
│                      │                                       │
│             ┌────────▼────────┐                              │
│             │ Shared infra    │                              │
│             │ store/  (DB)    │                              │
│             │ storage/ (OSS)  │                              │
│             │ ai/     (LLM)  │                              │
│             │ config/         │                              │
│             └─────────────────┘                              │
└──────────────────────────────────────────────────────────────┘
```

## Data Model

Three new tables, isolated from existing tables.

### tg_accounts

Telegram user accounts. Single account initially, schema supports multiple.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| phone | TEXT UNIQUE | Phone number |
| session_data | BLOB | MTProto session persistence |
| status | TEXT | `active` / `disconnected` / `auth_required` |
| last_test_at | TIMESTAMP | Last connection test time |
| last_test_ok | BOOLEAN | Last test result |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### tg_watch_targets

Channels and groups to monitor.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| account_id | INTEGER FK | References tg_accounts.id |
| chat_id | BIGINT | Telegram chat ID |
| chat_type | TEXT | `channel` / `group` |
| title | TEXT | Channel/group display name |
| username | TEXT | @username (nullable) |
| enabled | BOOLEAN | Whether monitoring is active |
| created_at | TIMESTAMP | |

### tg_messages

Collected messages with ad classification.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| target_id | INTEGER FK | References tg_watch_targets.id |
| tg_message_id | BIGINT | Original Telegram message ID |
| sender_id | BIGINT | Sender's Telegram user ID |
| sender_name | TEXT | Sender display name |
| content_type | TEXT | `text` / `photo` / `video` / `document` |
| text_content | TEXT | Text body |
| media_key | TEXT | OSS storage key (nullable) |
| is_ad | BOOLEAN | AI ad classification result |
| ad_confidence | REAL | Classification confidence 0.0–1.0 |
| created_at | TIMESTAMP | Telegram message timestamp |
| stored_at | TIMESTAMP | Time written to database |

Indexes: `(target_id, created_at)`, `(is_ad)`, `(tg_message_id, target_id) UNIQUE`.

## Telegram Crawler Module

Package: `internal/telegram/`

### client.go — MTProto Client

Wraps gotd/td. Responsibilities:
- Load session from `tg_accounts.session_data` on startup
- Auth flow: send code → verify code (+ optional 2FA password) → persist session
- Auto-reconnect on disconnect (gotd/td built-in)
- Update account status in DB on state changes

```go
type Client struct {
    api     *tg.Client
    account *TGAccount
    store   *Store
}

func (c *Client) SendCode(ctx context.Context, phone string) (codeHash string, err error)
func (c *Client) Verify(ctx context.Context, phone, code, codeHash, password2FA string) error
func (c *Client) Test(ctx context.Context) (*TestResult, error)
func (c *Client) Start(ctx context.Context) error
func (c *Client) Stop()
```

### crawler.go — Watch Dispatcher

Manages the set of active watch targets. Routes incoming Telegram updates to the processor.

```go
type Crawler struct {
    client    *Client
    store     *Store
    processor *Processor
    targets   map[int64]*WatchTarget // chat_id → target
    mu        sync.RWMutex
    running   atomic.Bool
}

func (c *Crawler) Start(ctx context.Context) error
func (c *Crawler) Stop()
func (c *Crawler) AddTarget(target WatchTarget) error
func (c *Crawler) RemoveTarget(chatID int64) error
func (c *Crawler) Status() CrawlerStatus
```

- Registers `message.NewMessage` handler via gotd/td UpdateDispatcher
- Checks `chat_id` against active targets map
- Matched messages forwarded to Processor
- `AddTarget`/`RemoveTarget` take effect immediately (hot reload)

### processor.go — Message Pipeline

```
Receive message
    → Extract text + media metadata
    → Has text? → AI ad classification (real-time)
    → Has media? → Download via gotd/td → Upload to MinIO
    → Write tg_messages row (text, media_key, is_ad, ad_confidence)
```

```go
type Processor struct {
    ai      *ai.Client
    storage storage.Storage
    store   *Store
    sem     chan struct{} // media download semaphore (cap 5)
}

func (p *Processor) Process(ctx context.Context, target *WatchTarget, msg *tg.Message) error
```

**Ad classification prompt:**

```
Determine if the following Telegram message is an advertisement.
Return ONLY JSON: {"is_ad": true/false, "confidence": 0.0-1.0}
Message: {text_content}
```

**If the message text is classified as ad, both the text and any associated media are marked `is_ad = true`.**

### store.go — Data Access

Follows existing store package patterns.

```go
func (s *Store) CreateAccount(ctx, account) error
func (s *Store) GetAccount(ctx) (*TGAccount, error)
func (s *Store) UpdateAccountStatus(ctx, id, status) error
func (s *Store) HasActiveAccount(ctx) bool

func (s *Store) ListTargets(ctx, accountID) ([]WatchTarget, error)
func (s *Store) CreateTarget(ctx, target) error
func (s *Store) UpdateTarget(ctx, id, patch) error
func (s *Store) DeleteTarget(ctx, id) error

func (s *Store) InsertMessage(ctx, msg) error
func (s *Store) ListMessages(ctx, filter, page) ([]TGMessage, total int, error)
func (s *Store) GetMessage(ctx, id) (*TGMessage, error)
func (s *Store) GetStats(ctx) (*TGStats, error)
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| AI API call fails | Log error, set `is_ad = false`, `ad_confidence = 0` (fail open) |
| AI returns invalid JSON | Same as above — degrade to non-ad |
| Media download fails | Store message without media, `media_key` = NULL, log error |
| OSS upload fails | Retry up to 3 times with backoff; on final failure discard media, log error |
| MTProto disconnect | gotd/td auto-reconnect; account status → `disconnected` → `active` on recovery |
| Watch target kicked/banned | Set `enabled = false`, surface error in admin panel |

## Admin API Routes

All routes require `requireAdmin` middleware (existing).

### Account Management

```
POST   /api/admin/telegram/account             // Add account (submit phone)
POST   /api/admin/telegram/auth/send-code      // Send verification code
POST   /api/admin/telegram/auth/verify         // Verify code + optional 2FA
POST   /api/admin/telegram/account/test        // Run connection test
GET    /api/admin/telegram/account             // Get account status
DELETE /api/admin/telegram/account             // Logout / delete account
```

### Connection Test Checks

| Check | Description |
|-------|-------------|
| MTProto connection | Can connect to Telegram servers |
| Read chat list | `messages.getDialogs` succeeds |
| Receive updates | Brief listen for update events |
| Session persistence | `session_data` written to database |

### Watch Targets

```
GET    /api/admin/telegram/targets             // List all targets
POST   /api/admin/telegram/targets             // Add target (by @username or invite link)
PATCH  /api/admin/telegram/targets/{id}        // Enable/disable/update
DELETE /api/admin/telegram/targets/{id}        // Remove target
```

### Messages

```
GET    /api/admin/telegram/messages            // List (paginated, filterable)
GET    /api/admin/telegram/messages/{id}       // Detail view
```

Query parameters for list: `target_id`, `is_ad` (true/false/omit), `content_type`, `page`, `per_page`.

### Crawler Control & Stats

```
GET    /api/admin/telegram/status              // Crawler running state
POST   /api/admin/telegram/crawler/start       // Start crawler
POST   /api/admin/telegram/crawler/stop        // Stop crawler
GET    /api/admin/telegram/stats               // Collection statistics
```

## Frontend Pages

Tech stack: React 19 + TypeScript + Vite + shadcn/ui + TailwindCSS + react-router. Existing `/join` route unchanged.

### 1. `/admin/login` — Admin Login

- Username + password form
- Calls `POST /api/auth/login`
- Redirects to `/admin` on success
- Unauthenticated `/admin/*` access redirects here

### 2. `/admin` — Dashboard

- Status cards: crawler state, target count, today's message count, ad filter rate
- Recent messages preview with ad messages visually dimmed (strikethrough + opacity)
- Data from `GET /api/admin/telegram/stats` + `GET /api/admin/telegram/messages?per_page=10`

### 3. `/admin/telegram/account` — Telegram Account

- 3-step wizard: enter phone → verify code (+ optional 2FA) → connection test
- After setup: account status, online duration, last active time
- Actions: re-test, re-login, delete account
- Crawler start/stop controls

### 4. `/admin/telegram/targets` — Watch Targets

- Target list: name, type (channel/group), enabled status, today's message count
- Add target: enter @username or invite link → resolve → start monitoring
- Per-target: enable/disable toggle, delete
- Hot reload — no restart needed

### 5. `/admin/telegram/messages` — Message Browser

- Filters: by target, by ad flag, by content type
- List: timestamp, source, text preview, media thumbnail, ad badge
- Detail view: full text + full media preview (loaded from OSS)

### 6. `/admin/settings/storage` — Storage Config

- View/edit MinIO/S3 settings (endpoint, bucket, access key, etc.)
- Connection test button
- Storage usage stats

## OSS Storage Layout

All Telegram media stored under existing MinIO/S3 bucket with path prefix:

```
telegram/{target_id}/{msg_id}.{ext}
```

No separate bucket needed. Path prefix provides sufficient isolation from existing WeChat media stored under different prefixes.

## Configuration

New environment variables:

```env
TG_API_ID=           # Telegram API ID (from my.telegram.org)
TG_API_HASH=         # Telegram API Hash
TG_PHONE=            # Initial phone number (optional, can configure via admin panel)
```

Reused from existing config (no changes needed):
- `STORAGE_*` — MinIO/S3 connection
- `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` — OpenAI-compatible API for ad classification
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — Admin login credentials

## Lifecycle Integration

```go
// In main.go startup sequence
tgStore := telegram.NewStore(store.DB())
tgClient := telegram.NewClient(cfg.TGApiID, cfg.TGApiHash, tgStore)
tgProcessor := telegram.NewProcessor(aiClient, storage, tgStore)
tgCrawler := telegram.NewCrawler(tgClient, tgStore, tgProcessor)

router := api.NewRouter(..., tgCrawler)

// Auto-start only if a previously authenticated account exists
if tgStore.HasActiveAccount(ctx) {
    go tgCrawler.Start(ctx)
}

// Graceful shutdown
tgCrawler.Stop()
```

Crawler does not auto-start on fresh deployment. Admin must first add a Telegram account via the panel. On subsequent restarts, if an active session exists in the database, the crawler starts automatically.

## Concurrency

- Media download/upload: semaphore capped at 5 concurrent operations
- AI ad classification: no extra throttle (text-only, fast; OpenAI rate limits apply)
- DB writes: serial for SQLite write lock; connection pool for PostgreSQL

## Migration

One new Goose migration file covering all three tables (`tg_accounts`, `tg_watch_targets`, `tg_messages`). Follows existing migration pattern in `internal/store/sqlite/migrations/` and `internal/store/postgres/migrations/`.

## Dependencies

New Go module dependency:

- `github.com/gotd/td` — Pure Go MTProto implementation

No other new dependencies. Frontend uses existing shadcn/ui component library.
