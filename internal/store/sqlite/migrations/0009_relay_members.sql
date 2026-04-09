-- +goose Up
CREATE TABLE IF NOT EXISTS relay_members (
    bot_id    TEXT PRIMARY KEY REFERENCES bots(id) ON DELETE CASCADE,
    emoji     TEXT NOT NULL,
    joined_at BIGINT NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_members_emoji ON relay_members(emoji);

-- +goose Down
DROP TABLE IF EXISTS relay_members;
