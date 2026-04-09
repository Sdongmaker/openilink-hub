package store

// RelayMember represents a user's bot in the virtual group relay.
type RelayMember struct {
	BotID    string `json:"bot_id"`
	Emoji    string `json:"emoji"`
	JoinedAt int64  `json:"joined_at"`
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
}
