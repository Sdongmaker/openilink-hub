-- +goose Up
ALTER TABLE tg_watch_targets ADD COLUMN access_hash BIGINT NOT NULL DEFAULT 0;
ALTER TABLE tg_watch_targets ADD COLUMN last_seen_msg_id BIGINT NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE tg_watch_targets DROP COLUMN last_seen_msg_id;
ALTER TABLE tg_watch_targets DROP COLUMN access_hash;