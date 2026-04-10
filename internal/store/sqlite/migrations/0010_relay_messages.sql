-- +goose Up
CREATE TABLE IF NOT EXISTS relay_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_bot_id   TEXT    NOT NULL,
    emoji           TEXT    NOT NULL,
    content_type    TEXT    NOT NULL,
    content         TEXT    NOT NULL,
    media_key       TEXT,
    original_msg_id INTEGER,
    created_at      BIGINT  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relay_messages_created ON relay_messages(created_at);

CREATE TABLE IF NOT EXISTS relay_deliveries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    relay_msg_id    INTEGER NOT NULL REFERENCES relay_messages(id),
    target_bot_id   TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending',
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    created_at      BIGINT  NOT NULL,
    updated_at      BIGINT  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relay_deliveries_pending ON relay_deliveries(status, created_at);

-- +goose Down
DROP TABLE IF EXISTS relay_deliveries;
DROP TABLE IF EXISTS relay_messages;
