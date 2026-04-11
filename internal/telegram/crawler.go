package telegram

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gotd/td/tg"
)

// CrawlerStatus reports the crawler's running state.
type CrawlerStatus struct {
	Running       bool   `json:"running"`
	AccountStatus string `json:"account_status"`
	TargetCount   int    `json:"target_count"`
}

// Crawler manages watch targets and dispatches incoming Telegram messages.
type Crawler struct {
	client    *Client
	store     *Store
	processor *Processor

	targets map[int64]*WatchTarget // chat_id → target
	mu      sync.RWMutex
	running atomic.Bool
	cancel  context.CancelFunc
}

// NewCrawler creates a new Telegram crawler.
func NewCrawler(client *Client, store *Store, processor *Processor) *Crawler {
	return &Crawler{
		client:    client,
		store:     store,
		processor: processor,
		targets:   make(map[int64]*WatchTarget),
	}
}

// Store returns the underlying data store.
func (c *Crawler) Store() *Store { return c.store }

// Start begins monitoring all enabled watch targets.
func (c *Crawler) Start(ctx context.Context) error {
	if c.running.Load() {
		return nil // idempotent
	}

	// Connect client if not already connected
	if !c.client.IsConnected() {
		if err := c.client.Connect(ctx); err != nil {
			return fmt.Errorf("connect telegram client: %w", err)
		}
		// Wait briefly for connection
		time.Sleep(2 * time.Second)
	}

	// Load targets from database
	account, err := c.store.GetAccount(ctx)
	if err != nil {
		return fmt.Errorf("get account: %w", err)
	}

	targets, err := c.store.ListTargets(ctx, account.ID)
	if err != nil {
		return fmt.Errorf("list targets: %w", err)
	}

	c.mu.Lock()
	for _, t := range targets {
		if t.Enabled {
			t := t // copy
			c.targets[t.ChatID] = &t
		}
	}
	c.mu.Unlock()

	crawlCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel
	c.running.Store(true)

	go c.listenUpdates(crawlCtx)

	slog.Info("telegram crawler started", "targets", len(c.targets))
	return nil
}

// Stop halts the crawler.
func (c *Crawler) Stop() {
	if !c.running.Load() {
		return // idempotent
	}
	if c.cancel != nil {
		c.cancel()
	}
	c.running.Store(false)
	slog.Info("telegram crawler stopped")
}

// Status returns the current crawler status.
func (c *Crawler) Status() CrawlerStatus {
	c.mu.RLock()
	defer c.mu.RUnlock()

	status := CrawlerStatus{
		Running:     c.running.Load(),
		TargetCount: len(c.targets),
	}

	if c.client.account != nil {
		status.AccountStatus = c.client.account.Status
	} else {
		status.AccountStatus = "not_configured"
	}

	return status
}

// AddTarget adds a new watch target and starts monitoring it immediately.
func (c *Crawler) AddTarget(target *WatchTarget) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.targets[target.ChatID] = target
	slog.Info("telegram target added", "chat_id", target.ChatID, "title", target.Title)
}

// RemoveTarget stops monitoring a chat.
func (c *Crawler) RemoveTarget(chatID int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.targets, chatID)
	slog.Info("telegram target removed", "chat_id", chatID)
}

// EnableTarget enables or disables a target in the live map.
func (c *Crawler) EnableTarget(chatID int64, enabled bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if enabled {
		// Need to re-add from DB; for now just log
		slog.Info("telegram target enabled", "chat_id", chatID)
	} else {
		delete(c.targets, chatID)
		slog.Info("telegram target disabled", "chat_id", chatID)
	}
}

// listenUpdates registers an update handler and processes incoming messages.
func (c *Crawler) listenUpdates(ctx context.Context) {
	api := c.client.API()
	if api == nil {
		slog.Error("telegram crawler: no API connection")
		return
	}

	// Use long polling via GetUpdates pattern
	// gotd/td handles updates through the client.Run callback
	// We'll use a polling approach for simplicity
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	// Track last processed update info per target
	var pts int

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.pollMessages(ctx, api, &pts)
		}
	}
}

func (c *Crawler) pollMessages(ctx context.Context, api *tg.Client, pts *int) {
	c.mu.RLock()
	targetsCopy := make(map[int64]*WatchTarget, len(c.targets))
	for k, v := range c.targets {
		targetsCopy[k] = v
	}
	c.mu.RUnlock()

	if len(targetsCopy) == 0 {
		return
	}

	// For each target, fetch recent messages
	for chatID, target := range targetsCopy {
		messages, err := c.fetchNewMessages(ctx, api, chatID, target)
		if err != nil {
			slog.Warn("fetch messages failed", "chat_id", chatID, "title", target.Title, "err", err)
			// Check if kicked/banned
			if isAccessError(err) {
				_ = c.store.SetTargetError(ctx, target.ID, err.Error())
				c.mu.Lock()
				delete(c.targets, chatID)
				c.mu.Unlock()
			}
			continue
		}

		for _, msg := range messages {
			if err := c.processor.ProcessMessage(ctx, target, msg); err != nil {
				slog.Warn("process message failed", "chat_id", chatID, "msg_id", msg.MessageID, "err", err)
			}
		}
	}
}

// fetchNewMessages retrieves new messages from a chat.
func (c *Crawler) fetchNewMessages(ctx context.Context, api *tg.Client, chatID int64, target *WatchTarget) ([]*InboundMessage, error) {
	peer := chatIDToPeer(chatID)

	resp, err := api.MessagesGetHistory(ctx, &tg.MessagesGetHistoryRequest{
		Peer:  peer,
		Limit: 20,
	})
	if err != nil {
		return nil, fmt.Errorf("get history: %w", err)
	}

	var msgs []*InboundMessage

	switch v := resp.(type) {
	case *tg.MessagesMessages:
		msgs = c.extractMessages(ctx, api, v.Messages)
	case *tg.MessagesMessagesSlice:
		msgs = c.extractMessages(ctx, api, v.Messages)
	case *tg.MessagesChannelMessages:
		msgs = c.extractMessages(ctx, api, v.Messages)
	}

	return msgs, nil
}

func (c *Crawler) extractMessages(ctx context.Context, api *tg.Client, tgMessages []tg.MessageClass) []*InboundMessage {
	var result []*InboundMessage

	for _, msgClass := range tgMessages {
		msg, ok := msgClass.(*tg.Message)
		if !ok {
			continue
		}

		inbound := &InboundMessage{
			MessageID: int64(msg.ID),
			Date:      int64(msg.Date),
			Text:      msg.Message,
		}

		// Extract sender info
		if msg.FromID != nil {
			switch from := msg.FromID.(type) {
			case *tg.PeerUser:
				inbound.SenderID = from.UserID
			case *tg.PeerChannel:
				inbound.SenderID = from.ChannelID
			}
		}

		// Extract media
		if msg.Media != nil {
			c.extractMedia(ctx, api, msg.Media, inbound)
		}

		// Apply storage rule: must have text or supported media
		if inbound.Text == "" && inbound.MediaType == "" {
			continue
		}

		result = append(result, inbound)
	}

	return result
}

func (c *Crawler) extractMedia(ctx context.Context, api *tg.Client, media tg.MessageMediaClass, inbound *InboundMessage) {
	switch m := media.(type) {
	case *tg.MessageMediaPhoto:
		if m.Photo == nil {
			return
		}
		photo, ok := m.Photo.(*tg.Photo)
		if !ok {
			return
		}
		inbound.MediaType = "photo"
		inbound.MimeType = "image/jpeg"
		// Download photo
		data, err := c.downloadPhoto(ctx, api, photo)
		if err != nil {
			slog.Warn("download photo failed", "err", err)
			return
		}
		inbound.MediaData = data

	case *tg.MessageMediaDocument:
		if m.Document == nil {
			return
		}
		doc, ok := m.Document.(*tg.Document)
		if !ok {
			return
		}
		inbound.MimeType = doc.MimeType

		// Determine document subtype
		for _, attr := range doc.Attributes {
			switch attr.(type) {
			case *tg.DocumentAttributeVideo:
				inbound.MediaType = "video"
			case *tg.DocumentAttributeAnimated:
				inbound.MediaType = "animation"
			case *tg.DocumentAttributeFilename:
				inbound.FileName = attr.(*tg.DocumentAttributeFilename).FileName
			}
		}
		if inbound.MediaType == "" {
			// Check if it's a supported document type
			if isSticker(doc) || isAudio(doc) {
				return // skip unsupported types
			}
			inbound.MediaType = "document"
		}

		// Download document
		data, err := c.downloadDocument(ctx, api, doc)
		if err != nil {
			slog.Warn("download document failed", "err", err)
			return
		}
		inbound.MediaData = data
	}
}

func (c *Crawler) downloadPhoto(ctx context.Context, api *tg.Client, photo *tg.Photo) ([]byte, error) {
	// Get the largest photo size
	if len(photo.Sizes) == 0 {
		return nil, fmt.Errorf("no photo sizes")
	}
	var bestSize tg.PhotoSizeClass
	var maxSize int
	for _, s := range photo.Sizes {
		switch sz := s.(type) {
		case *tg.PhotoSize:
			area := sz.W * sz.H
			if area > maxSize {
				maxSize = area
				bestSize = s
			}
		}
	}
	if bestSize == nil {
		bestSize = photo.Sizes[len(photo.Sizes)-1]
	}

	loc := &tg.InputPhotoFileLocation{
		ID:            photo.ID,
		AccessHash:    photo.AccessHash,
		FileReference: photo.FileReference,
		ThumbSize:     photoSizeType(bestSize),
	}

	return c.downloadFileLocation(ctx, api, loc)
}

func (c *Crawler) downloadDocument(ctx context.Context, api *tg.Client, doc *tg.Document) ([]byte, error) {
	loc := &tg.InputDocumentFileLocation{
		ID:            doc.ID,
		AccessHash:    doc.AccessHash,
		FileReference: doc.FileReference,
	}
	return c.downloadFileLocation(ctx, api, loc)
}

func (c *Crawler) downloadFileLocation(ctx context.Context, api *tg.Client, loc tg.InputFileLocationClass) ([]byte, error) {
	const chunkSize = 1024 * 1024 // 1MB chunks
	var data []byte
	offset := 0

	for {
		result, err := api.UploadGetFile(ctx, &tg.UploadGetFileRequest{
			Location: loc,
			Offset:   int64(offset),
			Limit:    chunkSize,
		})
		if err != nil {
			return nil, fmt.Errorf("download chunk at offset %d: %w", offset, err)
		}

		file, ok := result.(*tg.UploadFile)
		if !ok {
			return nil, fmt.Errorf("unexpected response type")
		}

		data = append(data, file.Bytes...)
		if len(file.Bytes) < chunkSize {
			break
		}
		offset += chunkSize
	}

	return data, nil
}

// chatIDToPeer converts a chat ID to an InputPeer.
func chatIDToPeer(chatID int64) tg.InputPeerClass {
	if chatID < 0 {
		// Supergroups and channels have negative IDs starting with -100
		channelID := -chatID
		if channelID > 1000000000000 {
			channelID -= 1000000000000
		}
		return &tg.InputPeerChannel{ChannelID: channelID}
	}
	return &tg.InputPeerChat{ChatID: chatID}
}

func photoSizeType(s tg.PhotoSizeClass) string {
	switch sz := s.(type) {
	case *tg.PhotoSize:
		return sz.Type
	case *tg.PhotoCachedSize:
		return sz.Type
	case *tg.PhotoStrippedSize:
		return sz.Type
	default:
		return "x"
	}
}

func isSticker(doc *tg.Document) bool {
	for _, attr := range doc.Attributes {
		if _, ok := attr.(*tg.DocumentAttributeSticker); ok {
			return true
		}
	}
	return false
}

func isAudio(doc *tg.Document) bool {
	for _, attr := range doc.Attributes {
		if _, ok := attr.(*tg.DocumentAttributeAudio); ok {
			return true
		}
	}
	return false
}

func isAccessError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return contains(msg, "CHANNEL_PRIVATE") ||
		contains(msg, "CHAT_FORBIDDEN") ||
		contains(msg, "USER_BANNED_IN_CHANNEL") ||
		contains(msg, "CHANNEL_INVALID")
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && searchString(s, sub)
}

func searchString(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

// ResolveTarget resolves a @username or invite link to a WatchTarget.
func (c *Crawler) ResolveTarget(ctx context.Context, input string) (*WatchTarget, error) {
	api := c.client.API()
	if api == nil {
		return nil, fmt.Errorf("not connected")
	}

	input = trimString(input)

	if isInviteLink(input) {
		return c.resolveInviteLink(ctx, api, input)
	}

	return c.resolveUsername(ctx, api, input)
}

func (c *Crawler) resolveUsername(ctx context.Context, api *tg.Client, input string) (*WatchTarget, error) {
	username := input
	if len(username) > 0 && username[0] == '@' {
		username = username[1:]
	}

	resolved, err := api.ContactsResolveUsername(ctx, &tg.ContactsResolveUsernameRequest{Username: username})
	if err != nil {
		return nil, fmt.Errorf("could not resolve: username not found")
	}

	target := &WatchTarget{Username: username}

	for _, chat := range resolved.Chats {
		switch ch := chat.(type) {
		case *tg.Channel:
			target.ChatID = ch.ID
			target.Title = ch.Title
			if ch.Broadcast {
				target.ChatType = "channel"
			} else {
				target.ChatType = "group"
			}
			// Convert to supergroup/channel ID format
			target.ChatID = -1000000000000 - ch.ID
			return target, nil
		case *tg.Chat:
			target.ChatID = -ch.ID
			target.Title = ch.Title
			target.ChatType = "group"
			return target, nil
		}
	}

	return nil, fmt.Errorf("could not resolve: no chat found for username")
}

func (c *Crawler) resolveInviteLink(ctx context.Context, api *tg.Client, link string) (*WatchTarget, error) {
	hash := extractInviteHash(link)
	if hash == "" {
		return nil, fmt.Errorf("invalid invite link")
	}

	invite, err := api.MessagesCheckChatInvite(ctx, hash)
	if err != nil {
		return nil, fmt.Errorf("invite link expired or invalid")
	}

	target := &WatchTarget{}

	switch inv := invite.(type) {
	case *tg.ChatInviteAlready:
		// Already a member
		switch ch := inv.Chat.(type) {
		case *tg.Channel:
			target.ChatID = -1000000000000 - ch.ID
			target.Title = ch.Title
			if ch.Broadcast {
				target.ChatType = "channel"
			} else {
				target.ChatType = "group"
			}
		case *tg.Chat:
			target.ChatID = -ch.ID
			target.Title = ch.Title
			target.ChatType = "group"
		}
		return target, nil

	case *tg.ChatInvite:
		// Need to join
		updates, err := api.MessagesImportChatInvite(ctx, hash)
		if err != nil {
			return nil, fmt.Errorf("failed to join: %w", err)
		}
		// Extract chat info from updates
		if u, ok := updates.(*tg.Updates); ok {
			for _, chat := range u.Chats {
				switch ch := chat.(type) {
				case *tg.Channel:
					target.ChatID = -1000000000000 - ch.ID
					target.Title = ch.Title
					if ch.Broadcast {
						target.ChatType = "channel"
					} else {
						target.ChatType = "group"
					}
					return target, nil
				case *tg.Chat:
					target.ChatID = -ch.ID
					target.Title = ch.Title
					target.ChatType = "group"
					return target, nil
				}
			}
		}
	}

	return nil, fmt.Errorf("could not resolve invite link")
}

func isInviteLink(s string) bool {
	return len(s) > 5 && (hasPrefix(s, "https://t.me/+") || hasPrefix(s, "https://t.me/joinchat/") || hasPrefix(s, "t.me/+"))
}

func hasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}

func extractInviteHash(link string) string {
	// https://t.me/+HASH or https://t.me/joinchat/HASH
	if i := lastIndex(link, "+"); i >= 0 {
		return link[i+1:]
	}
	if i := lastIndex(link, "joinchat/"); i >= 0 {
		return link[i+9:]
	}
	return ""
}

func lastIndex(s, sub string) int {
	for i := len(s) - len(sub); i >= 0; i-- {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func trimString(s string) string {
	start := 0
	end := len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n') {
		end--
	}
	return s[start:end]
}
