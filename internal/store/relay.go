package store

// RelayMember represents a user's bot in the virtual group relay.
type RelayMember struct {
	BotID    string `json:"bot_id"`
	Emoji    string `json:"emoji"`
	JoinedAt int64  `json:"joined_at"`
}

// RelayMessage represents a single message that entered the relay pipeline.
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

// RelayDelivery tracks the delivery status of a relay message to a target bot.
type RelayDelivery struct {
	ID          int64  `json:"id"`
	RelayMsgID  int64  `json:"relay_msg_id"`
	TargetBotID string `json:"target_bot_id"`
	Status      string `json:"status"` // pending, sending, done, failed
	Attempts    int    `json:"attempts"`
	LastError   string `json:"last_error,omitempty"`
	CreatedAt   int64  `json:"created_at"`
	UpdatedAt   int64  `json:"updated_at"`
}

// RelayStore manages the virtual group relay membership.
type RelayStore interface {
	// EnsureRelayMember idempotently adds a bot to the relay group.
	// If already a member, returns the existing emoji.
	EnsureRelayMember(botID string) (emoji string, err error)
	// GetRelayEmoji returns the emoji for a bot, or "" if not a member.
	GetRelayEmoji(botID string) string
	// ListRelayMembers returns all relay members.
	ListRelayMembers() ([]RelayMember, error)
	// RemoveRelayMember removes a bot from the relay group.
	RemoveRelayMember(botID string) error

	// SaveRelayMessage records a message entering the relay pipeline.
	SaveRelayMessage(sourceBotID, emoji, contentType, content, mediaKey string, originalMsgID int64) (*RelayMessage, error)
	// ListRelayMessages returns relay messages ordered by created_at desc.
	// If beforeID > 0, only returns messages with id < beforeID.
	ListRelayMessages(limit int, beforeID int64) ([]RelayMessage, error)

	// SaveRelayDelivery creates a pending delivery record.
	SaveRelayDelivery(relayMsgID int64, targetBotID string) error
	// UpdateRelayDelivery updates a delivery's status, attempts, and error.
	UpdateRelayDelivery(relayMsgID int64, targetBotID, status string, attempts int, lastError string) error
	// ListPendingDeliveries returns unfinished deliveries for a target bot.
	ListPendingDeliveries(targetBotID string) ([]RelayDelivery, error)
}
