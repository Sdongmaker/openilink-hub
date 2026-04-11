-- +goose Up
CREATE TABLE IF NOT EXISTS tg_accounts (
    id           BIGSERIAL PRIMARY KEY,
    phone        TEXT    NOT NULL UNIQUE,
    session_data BYTEA,
    status       TEXT    NOT NULL DEFAULT 'auth_required',
    last_test_at BIGINT,
    last_test_ok BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   BIGINT  NOT NULL,
    updated_at   BIGINT  NOT NULL
);

CREATE TABLE IF NOT EXISTS tg_watch_targets (
    id               BIGSERIAL PRIMARY KEY,
    account_id       BIGINT  NOT NULL REFERENCES tg_accounts(id) ON DELETE CASCADE,
    chat_id          BIGINT  NOT NULL,
    access_hash      BIGINT  NOT NULL DEFAULT 0,
    chat_type        TEXT    NOT NULL,
    title            TEXT    NOT NULL,
    username         TEXT,
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    last_error       TEXT,
    last_seen_msg_id BIGINT  NOT NULL DEFAULT 0,
    created_at       BIGINT  NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tg_watch_targets_chat ON tg_watch_targets(account_id, chat_id);

CREATE TABLE IF NOT EXISTS tg_messages (
    id            BIGSERIAL PRIMARY KEY,
    target_id     BIGINT           NOT NULL REFERENCES tg_watch_targets(id) ON DELETE CASCADE,
    tg_message_id BIGINT           NOT NULL,
    sender_id     BIGINT           NOT NULL,
    sender_name   TEXT             NOT NULL DEFAULT '',
    content_type  TEXT             NOT NULL,
    text_content  TEXT,
    media_key     TEXT,
    is_ad         BOOLEAN          NOT NULL DEFAULT FALSE,
    ad_confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at    BIGINT           NOT NULL,
    stored_at     BIGINT           NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tg_messages_target_created ON tg_messages(target_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tg_messages_is_ad ON tg_messages(is_ad);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tg_messages_unique ON tg_messages(tg_message_id, target_id);

-- +goose Down
DROP TABLE IF EXISTS tg_messages;
DROP TABLE IF EXISTS tg_watch_targets;
DROP TABLE IF EXISTS tg_accounts;