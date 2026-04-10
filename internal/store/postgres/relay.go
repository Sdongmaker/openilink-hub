package postgres

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/openilink/openilink-hub/internal/store"
)

func (db *DB) EnsureRelayMember(botID string) (string, error) {
	// Check if already a member.
	var emoji string
	err := db.QueryRow("SELECT emoji FROM relay_members WHERE bot_id = $1", botID).Scan(&emoji)
	if err == nil {
		return emoji, nil
	}
	if err != sql.ErrNoRows {
		return "", fmt.Errorf("check relay member: %w", err)
	}

	// Find used emojis.
	rows, err := db.Query("SELECT emoji FROM relay_members")
	if err != nil {
		return "", fmt.Errorf("list used emojis: %w", err)
	}
	defer rows.Close()
	used := map[string]bool{}
	for rows.Next() {
		var e string
		rows.Scan(&e)
		used[e] = true
	}

	// Pick first available from pool.
	for _, e := range store.EmojiPool {
		if !used[e] {
			emoji = e
			break
		}
	}
	// Pool exhausted: generate numbered emoji.
	if emoji == "" {
		for i := 1; ; i++ {
			candidate := fmt.Sprintf("🎯%d", i)
			if !used[candidate] {
				emoji = candidate
				break
			}
		}
	}

	now := time.Now().UnixMilli()
	_, err = db.Exec("INSERT INTO relay_members (bot_id, emoji, joined_at) VALUES ($1, $2, $3)", botID, emoji, now)
	if err != nil {
		// Race: another connection inserted first. Read theirs.
		var existing string
		if err2 := db.QueryRow("SELECT emoji FROM relay_members WHERE bot_id = $1", botID).Scan(&existing); err2 == nil {
			return existing, nil
		}
		return "", fmt.Errorf("insert relay member: %w", err)
	}
	return emoji, nil
}

func (db *DB) GetRelayEmoji(botID string) string {
	var emoji string
	db.QueryRow("SELECT emoji FROM relay_members WHERE bot_id = $1", botID).Scan(&emoji)
	return emoji
}

func (db *DB) ListRelayMembers() ([]store.RelayMember, error) {
	rows, err := db.Query("SELECT bot_id, emoji, joined_at FROM relay_members ORDER BY joined_at")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var members []store.RelayMember
	for rows.Next() {
		var m store.RelayMember
		if err := rows.Scan(&m.BotID, &m.Emoji, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, nil
}

func (db *DB) RemoveRelayMember(botID string) error {
	_, err := db.Exec("DELETE FROM relay_members WHERE bot_id = $1", botID)
	return err
}

func (db *DB) SaveRelayMessage(sourceBotID, emoji, contentType, content, mediaKey string, originalMsgID int64) (*store.RelayMessage, error) {
	now := time.Now().UnixMilli()
	var id int64
	err := db.QueryRow(
		"INSERT INTO relay_messages (source_bot_id, emoji, content_type, content, media_key, original_msg_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
		sourceBotID, emoji, contentType, content, mediaKey, originalMsgID, now,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("save relay message: %w", err)
	}
	return &store.RelayMessage{
		ID: id, SourceBotID: sourceBotID, Emoji: emoji,
		ContentType: contentType, Content: content, MediaKey: mediaKey,
		OriginalMsgID: originalMsgID, CreatedAt: now,
	}, nil
}

func (db *DB) ListRelayMessages(limit int, beforeID int64) ([]store.RelayMessage, error) {
	var rows *sql.Rows
	var err error
	if beforeID > 0 {
		rows, err = db.Query(
			"SELECT id, source_bot_id, emoji, content_type, content, COALESCE(media_key,''), COALESCE(original_msg_id,0), created_at FROM relay_messages WHERE id < $1 ORDER BY id DESC LIMIT $2",
			beforeID, limit,
		)
	} else {
		rows, err = db.Query(
			"SELECT id, source_bot_id, emoji, content_type, content, COALESCE(media_key,''), COALESCE(original_msg_id,0), created_at FROM relay_messages ORDER BY id DESC LIMIT $1",
			limit,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var msgs []store.RelayMessage
	for rows.Next() {
		var m store.RelayMessage
		if err := rows.Scan(&m.ID, &m.SourceBotID, &m.Emoji, &m.ContentType, &m.Content, &m.MediaKey, &m.OriginalMsgID, &m.CreatedAt); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	return msgs, nil
}

func (db *DB) SaveRelayDelivery(relayMsgID int64, targetBotID string) error {
	now := time.Now().UnixMilli()
	_, err := db.Exec(
		"INSERT INTO relay_deliveries (relay_msg_id, target_bot_id, status, attempts, created_at, updated_at) VALUES ($1, $2, 'pending', 0, $3, $4)",
		relayMsgID, targetBotID, now, now,
	)
	return err
}

func (db *DB) UpdateRelayDelivery(relayMsgID int64, targetBotID, status string, attempts int, lastError string) error {
	now := time.Now().UnixMilli()
	_, err := db.Exec(
		"UPDATE relay_deliveries SET status = $1, attempts = $2, last_error = $3, updated_at = $4 WHERE relay_msg_id = $5 AND target_bot_id = $6",
		status, attempts, lastError, now, relayMsgID, targetBotID,
	)
	return err
}

func (db *DB) ListPendingDeliveries(targetBotID string) ([]store.RelayDelivery, error) {
	rows, err := db.Query(
		"SELECT id, relay_msg_id, target_bot_id, status, attempts, COALESCE(last_error,''), created_at, updated_at FROM relay_deliveries WHERE target_bot_id = $1 AND status IN ('pending', 'sending') ORDER BY created_at",
		targetBotID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []store.RelayDelivery
	for rows.Next() {
		var d store.RelayDelivery
		if err := rows.Scan(&d.ID, &d.RelayMsgID, &d.TargetBotID, &d.Status, &d.Attempts, &d.LastError, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, nil
}
