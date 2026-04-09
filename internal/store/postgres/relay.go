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
