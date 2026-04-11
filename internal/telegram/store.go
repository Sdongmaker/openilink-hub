package telegram

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// TGAccount represents a Telegram user account.
type TGAccount struct {
	ID          int64  `json:"id"`
	Phone       string `json:"phone"`
	SessionData []byte `json:"-"`
	Status      string `json:"status"` // auth_required, connecting, active, disconnected
	LastTestAt  *int64 `json:"last_test_at,omitempty"`
	LastTestOk  bool   `json:"last_test_ok"`
	CreatedAt   int64  `json:"created_at"`
	UpdatedAt   int64  `json:"updated_at"`
}

// WatchTarget represents a monitored Telegram channel or group.
type WatchTarget struct {
	ID        int64  `json:"id"`
	AccountID int64  `json:"account_id"`
	ChatID    int64  `json:"chat_id"`
	ChatType  string `json:"chat_type"` // channel, group
	Title     string `json:"title"`
	Username  string `json:"username,omitempty"`
	Enabled   bool   `json:"enabled"`
	LastError string `json:"last_error,omitempty"`
	CreatedAt int64  `json:"created_at"`
}

// TGMessage represents a collected Telegram message.
type TGMessage struct {
	ID           int64   `json:"id"`
	TargetID     int64   `json:"target_id"`
	TGMessageID  int64   `json:"tg_message_id"`
	SenderID     int64   `json:"sender_id"`
	SenderName   string  `json:"sender_name"`
	ContentType  string  `json:"content_type"` // text, photo, video, document, animation
	TextContent  string  `json:"text_content,omitempty"`
	MediaKey     string  `json:"media_key,omitempty"`
	IsAd         bool    `json:"is_ad"`
	AdConfidence float64 `json:"ad_confidence"`
	CreatedAt    int64   `json:"created_at"`
	StoredAt     int64   `json:"stored_at"`
}

// TGMessageWithTarget extends TGMessage with target info for API responses.
type TGMessageWithTarget struct {
	TGMessage
	TargetTitle string `json:"target_title"`
}

// TGStats holds aggregated crawler statistics.
type TGStats struct {
	CrawlerRunning   bool           `json:"crawler_running"`
	AccountStatus    string         `json:"account_status"`
	TargetCount      map[string]int `json:"target_count"`
	TodayTotal       int            `json:"today_total"`
	TodayAds         int            `json:"today_ads"`
	AdRate           float64        `json:"ad_rate"`
	StorageUsedBytes int64          `json:"storage_used_bytes"`
}

// MessageFilter for listing messages.
type MessageFilter struct {
	TargetID    *int64
	IsAd        *bool
	ContentType string
}

// DBTX is the minimal database interface used by the store.
type DBTX interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// Store provides data access for Telegram crawler tables.
type Store struct {
	db DBTX
}

// NewStore creates a new Telegram store using the given database connection.
func NewStore(db DBTX) *Store {
	return &Store{db: db}
}

// --- Account ---

func (s *Store) CreateAccount(ctx context.Context, phone string) (*TGAccount, error) {
	now := time.Now().Unix()
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO tg_accounts (phone, status, created_at, updated_at) VALUES (?, 'auth_required', ?, ?)`,
		phone, now, now)
	if err != nil {
		return nil, fmt.Errorf("create tg account: %w", err)
	}
	id, _ := res.LastInsertId()
	return &TGAccount{ID: id, Phone: phone, Status: "auth_required", CreatedAt: now, UpdatedAt: now}, nil
}

func (s *Store) GetAccount(ctx context.Context) (*TGAccount, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, phone, session_data, status, last_test_at, last_test_ok, created_at, updated_at FROM tg_accounts ORDER BY id LIMIT 1`)
	a := &TGAccount{}
	var lastTestAt sql.NullInt64
	err := row.Scan(&a.ID, &a.Phone, &a.SessionData, &a.Status, &lastTestAt, &a.LastTestOk, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if lastTestAt.Valid {
		a.LastTestAt = &lastTestAt.Int64
	}
	return a, nil
}

func (s *Store) UpdateAccountStatus(ctx context.Context, id int64, status string) error {
	now := time.Now().Unix()
	_, err := s.db.ExecContext(ctx,
		`UPDATE tg_accounts SET status = ?, updated_at = ? WHERE id = ?`,
		status, now, id)
	return err
}

func (s *Store) UpdateAccountSession(ctx context.Context, id int64, sessionData []byte) error {
	now := time.Now().Unix()
	_, err := s.db.ExecContext(ctx,
		`UPDATE tg_accounts SET session_data = ?, status = 'active', updated_at = ? WHERE id = ?`,
		sessionData, now, id)
	return err
}

func (s *Store) UpdateAccountTest(ctx context.Context, id int64, ok bool) error {
	now := time.Now().Unix()
	_, err := s.db.ExecContext(ctx,
		`UPDATE tg_accounts SET last_test_at = ?, last_test_ok = ?, updated_at = ? WHERE id = ?`,
		now, ok, now, id)
	return err
}

func (s *Store) DeleteAccount(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM tg_accounts WHERE id = ?`, id)
	return err
}

func (s *Store) HasActiveAccount(ctx context.Context) bool {
	var count int
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tg_accounts WHERE status = 'active'`).Scan(&count)
	return count > 0
}

// --- Watch Targets ---

func (s *Store) CreateTarget(ctx context.Context, t *WatchTarget) error {
	now := time.Now().Unix()
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO tg_watch_targets (account_id, chat_id, chat_type, title, username, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`,
		t.AccountID, t.ChatID, t.ChatType, t.Title, t.Username, now)
	if err != nil {
		return fmt.Errorf("create target: %w", err)
	}
	t.ID, _ = res.LastInsertId()
	t.CreatedAt = now
	t.Enabled = true
	return nil
}

func (s *Store) ListTargets(ctx context.Context, accountID int64) ([]WatchTarget, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, account_id, chat_id, chat_type, title, username, enabled, last_error, created_at FROM tg_watch_targets WHERE account_id = ? ORDER BY id`,
		accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var targets []WatchTarget
	for rows.Next() {
		var t WatchTarget
		var username, lastError sql.NullString
		if err := rows.Scan(&t.ID, &t.AccountID, &t.ChatID, &t.ChatType, &t.Title, &username, &t.Enabled, &lastError, &t.CreatedAt); err != nil {
			return nil, err
		}
		t.Username = username.String
		t.LastError = lastError.String
		targets = append(targets, t)
	}
	return targets, nil
}

func (s *Store) UpdateTarget(ctx context.Context, id int64, enabled bool) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE tg_watch_targets SET enabled = ?, last_error = NULL WHERE id = ?`, enabled, id)
	return err
}

func (s *Store) SetTargetError(ctx context.Context, id int64, errMsg string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE tg_watch_targets SET enabled = 0, last_error = ? WHERE id = ?`, errMsg, id)
	return err
}

func (s *Store) DeleteTarget(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM tg_watch_targets WHERE id = ?`, id)
	return err
}

func (s *Store) GetTarget(ctx context.Context, id int64) (*WatchTarget, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, account_id, chat_id, chat_type, title, username, enabled, last_error, created_at FROM tg_watch_targets WHERE id = ?`, id)
	var t WatchTarget
	var username, lastError sql.NullString
	err := row.Scan(&t.ID, &t.AccountID, &t.ChatID, &t.ChatType, &t.Title, &username, &t.Enabled, &lastError, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	t.Username = username.String
	t.LastError = lastError.String
	return &t, nil
}

// --- Messages ---

func (s *Store) InsertMessage(ctx context.Context, m *TGMessage) error {
	now := time.Now().Unix()
	res, err := s.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO tg_messages (target_id, tg_message_id, sender_id, sender_name, content_type, text_content, media_key, is_ad, ad_confidence, created_at, stored_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		m.TargetID, m.TGMessageID, m.SenderID, m.SenderName, m.ContentType, m.TextContent, m.MediaKey, m.IsAd, m.AdConfidence, m.CreatedAt, now)
	if err != nil {
		return fmt.Errorf("insert tg message: %w", err)
	}
	m.ID, _ = res.LastInsertId()
	m.StoredAt = now
	return nil
}

func (s *Store) ListMessages(ctx context.Context, filter MessageFilter, page, perPage int) ([]TGMessageWithTarget, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}

	where := "1=1"
	var args []any
	if filter.TargetID != nil {
		where += " AND m.target_id = ?"
		args = append(args, *filter.TargetID)
	}
	if filter.IsAd != nil {
		where += " AND m.is_ad = ?"
		if *filter.IsAd {
			args = append(args, 1)
		} else {
			args = append(args, 0)
		}
	}
	if filter.ContentType != "" {
		where += " AND m.content_type = ?"
		args = append(args, filter.ContentType)
	}

	var total int
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM tg_messages m WHERE %s`, where)
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * perPage
	query := fmt.Sprintf(
		`SELECT m.id, m.target_id, t.title, m.tg_message_id, m.sender_id, m.sender_name, m.content_type, m.text_content, m.media_key, m.is_ad, m.ad_confidence, m.created_at, m.stored_at
		 FROM tg_messages m LEFT JOIN tg_watch_targets t ON m.target_id = t.id
		 WHERE %s ORDER BY m.created_at DESC LIMIT ? OFFSET ?`, where)
	args = append(args, perPage, offset)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var msgs []TGMessageWithTarget
	for rows.Next() {
		var m TGMessageWithTarget
		var textContent, mediaKey sql.NullString
		var title sql.NullString
		if err := rows.Scan(&m.ID, &m.TargetID, &title, &m.TGMessageID, &m.SenderID, &m.SenderName, &m.ContentType, &textContent, &mediaKey, &m.IsAd, &m.AdConfidence, &m.CreatedAt, &m.StoredAt); err != nil {
			return nil, 0, err
		}
		m.TextContent = textContent.String
		m.MediaKey = mediaKey.String
		m.TargetTitle = title.String
		msgs = append(msgs, m)
	}
	return msgs, total, nil
}

func (s *Store) GetMessage(ctx context.Context, id int64) (*TGMessageWithTarget, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT m.id, m.target_id, t.title, m.tg_message_id, m.sender_id, m.sender_name, m.content_type, m.text_content, m.media_key, m.is_ad, m.ad_confidence, m.created_at, m.stored_at
		 FROM tg_messages m LEFT JOIN tg_watch_targets t ON m.target_id = t.id WHERE m.id = ?`, id)
	var m TGMessageWithTarget
	var textContent, mediaKey, title sql.NullString
	err := row.Scan(&m.ID, &m.TargetID, &title, &m.TGMessageID, &m.SenderID, &m.SenderName, &m.ContentType, &textContent, &mediaKey, &m.IsAd, &m.AdConfidence, &m.CreatedAt, &m.StoredAt)
	if err != nil {
		return nil, err
	}
	m.TextContent = textContent.String
	m.MediaKey = mediaKey.String
	m.TargetTitle = title.String
	return &m, nil
}

func (s *Store) GetStats(ctx context.Context) (todayTotal, todayAds int, err error) {
	startOfDay := time.Now().Truncate(24 * time.Hour).Unix()
	err = s.db.QueryRowContext(ctx,
		`SELECT COUNT(*), COALESCE(SUM(CASE WHEN is_ad = 1 THEN 1 ELSE 0 END), 0) FROM tg_messages WHERE created_at >= ?`,
		startOfDay).Scan(&todayTotal, &todayAds)
	return
}

// TodayCountByTarget returns today's message count for a specific target.
func (s *Store) TodayCountByTarget(ctx context.Context, targetID int64) int {
	startOfDay := time.Now().Truncate(24 * time.Hour).Unix()
	var count int
	_ = s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM tg_messages WHERE target_id = ? AND created_at >= ?`,
		targetID, startOfDay).Scan(&count)
	return count
}

// TelegramFileCount returns the total number of messages with media.
func (s *Store) TelegramFileCount(ctx context.Context) int {
	var count int
	_ = s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM tg_messages WHERE media_key IS NOT NULL AND media_key != ''`).Scan(&count)
	return count
}
