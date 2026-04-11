package telegram

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gotd/td/tg"
)

const (
	defaultPollInterval = 5 * time.Second
	maxMediaBytes       = 50 << 20
)

// CrawlerStatus reports the crawler's running state.
type CrawlerStatus struct {
	Running       bool   `json:"running"`
	AccountStatus string `json:"account_status"`
	TargetCount   int    `json:"target_count"`
}

// Crawler manages watch targets and dispatches incoming Telegram messages.
type Crawler struct {
	client       *Client
	store        *Store
	processor    *Processor
	targets      map[int64]*WatchTarget
	pollInterval time.Duration
	mu           sync.RWMutex
	running      atomic.Bool
	cancel       context.CancelFunc
}

// NewCrawler creates a new Telegram crawler.
func NewCrawler(client *Client, store *Store, processor *Processor) *Crawler {
	return &Crawler{
		client:       client,
		store:        store,
		processor:    processor,
		targets:      make(map[int64]*WatchTarget),
		pollInterval: defaultPollInterval,
	}
}

// Store returns the underlying data store.
func (c *Crawler) Store() *Store { return c.store }

// Start begins monitoring all enabled watch targets.
func (c *Crawler) Start(ctx context.Context) error {
	if c.running.Load() {
		return nil
	}

	if err := c.client.Connect(ctx); err != nil {
		return fmt.Errorf("connect telegram client: %w", err)
	}

	account, err := c.store.GetAccount(ctx)
	if err != nil {
		return fmt.Errorf("get account: %w", err)
	}

	targets, err := c.store.ListTargets(ctx, account.ID)
	if err != nil {
		return fmt.Errorf("list targets: %w", err)
	}

	loaded := make(map[int64]*WatchTarget, len(targets))
	for _, target := range targets {
		if !target.Enabled {
			continue
		}
		targetCopy := target
		loaded[target.ChatID] = &targetCopy
	}

	crawlCtx, cancel := context.WithCancel(context.Background())

	c.mu.Lock()
	c.targets = loaded
	c.cancel = cancel
	c.running.Store(true)
	c.mu.Unlock()

	go c.listenUpdates(crawlCtx)

	slog.Info("telegram crawler started", "targets", len(loaded))
	return nil
}

// Stop halts the crawler.
func (c *Crawler) Stop() {
	if !c.running.Load() {
		return
	}

	c.mu.Lock()
	cancel := c.cancel
	c.cancel = nil
	c.running.Store(false)
	c.mu.Unlock()

	if cancel != nil {
		cancel()
	}

	slog.Info("telegram crawler stopped")
}

// Status returns the current crawler status.
func (c *Crawler) Status() CrawlerStatus {
	c.mu.RLock()
	targetCount := len(c.targets)
	c.mu.RUnlock()

	status := CrawlerStatus{
		Running:       c.running.Load(),
		TargetCount:   targetCount,
		AccountStatus: "not_configured",
	}

	account, err := c.store.GetAccount(context.Background())
	if err == nil {
		status.AccountStatus = account.Status
	}

	return status
}

// AddTarget adds a new watch target and starts monitoring it immediately.
func (c *Crawler) AddTarget(target *WatchTarget) {
	c.mu.Lock()
	defer c.mu.Unlock()
	targetCopy := *target
	c.targets[target.ChatID] = &targetCopy
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
	if !enabled {
		delete(c.targets, chatID)
		slog.Info("telegram target disabled", "chat_id", chatID)
		return
	}
	slog.Info("telegram target enabled", "chat_id", chatID)
}

// ResolveTarget resolves a @username or invite link to a WatchTarget.
func (c *Crawler) ResolveTarget(ctx context.Context, input string) (*WatchTarget, error) {
	api := c.client.API()
	if api == nil {
		return nil, fmt.Errorf("not connected")
	}

	input = strings.TrimSpace(input)
	if isInviteLink(input) {
		return c.resolveInviteLink(ctx, api, input)
	}

	return c.resolveUsername(ctx, api, input)
}

func (c *Crawler) listenUpdates(ctx context.Context) {
	api := c.client.API()
	if api == nil {
		slog.Error("telegram crawler: no API connection")
		c.Stop()
		return
	}

	c.pollMessages(ctx, api)

	ticker := time.NewTicker(c.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.pollMessages(ctx, api)
		}
	}
}

func (c *Crawler) pollMessages(ctx context.Context, api *tg.Client) {
	c.mu.RLock()
	targetsCopy := make([]*WatchTarget, 0, len(c.targets))
	for _, target := range c.targets {
		targetCopy := *target
		targetsCopy = append(targetsCopy, &targetCopy)
	}
	c.mu.RUnlock()

	if len(targetsCopy) == 0 {
		return
	}

	sort.Slice(targetsCopy, func(i, j int) bool {
		return targetsCopy[i].ChatID < targetsCopy[j].ChatID
	})

	for _, target := range targetsCopy {
		messages, err := c.fetchNewMessages(ctx, api, target)
		if err != nil {
			slog.Warn("fetch messages failed", "chat_id", target.ChatID, "title", target.Title, "err", err)
			if isAccessError(err) {
				_ = c.store.SetTargetError(ctx, target.ID, err.Error())
				c.mu.Lock()
				delete(c.targets, target.ChatID)
				c.mu.Unlock()
			}
			continue
		}

		lastSeen := target.LastSeenMsgID
		for _, msg := range messages {
			if msg.MessageID <= lastSeen {
				continue
			}
			if err := c.processor.ProcessMessage(ctx, target, msg); err != nil {
				slog.Warn("process message failed", "chat_id", target.ChatID, "msg_id", msg.MessageID, "err", err)
				break
			}
			lastSeen = msg.MessageID
		}

		if lastSeen > target.LastSeenMsgID {
			if err := c.store.UpdateTargetProgress(ctx, target.ID, lastSeen); err != nil {
				slog.Warn("update target progress failed", "target_id", target.ID, "last_seen", lastSeen, "err", err)
				continue
			}
			c.mu.Lock()
			if live := c.targets[target.ChatID]; live != nil {
				live.LastSeenMsgID = lastSeen
			}
			c.mu.Unlock()
		}
	}
}

// fetchNewMessages retrieves new messages from a chat.
func (c *Crawler) fetchNewMessages(ctx context.Context, api *tg.Client, target *WatchTarget) ([]*InboundMessage, error) {
	peer, err := chatIDToPeer(target)
	if err != nil {
		return nil, err
	}

	resp, err := api.MessagesGetHistory(ctx, &tg.MessagesGetHistoryRequest{
		Peer:  peer,
		Limit: 50,
		MinID: int(target.LastSeenMsgID),
	})
	if err != nil {
		return nil, fmt.Errorf("get history: %w", err)
	}

	switch typed := resp.(type) {
	case *tg.MessagesMessages:
		return c.extractMessages(ctx, api, typed.Messages), nil
	case *tg.MessagesMessagesSlice:
		return c.extractMessages(ctx, api, typed.Messages), nil
	case *tg.MessagesChannelMessages:
		return c.extractMessages(ctx, api, typed.Messages), nil
	default:
		return nil, nil
	}
}

func (c *Crawler) extractMessages(ctx context.Context, api *tg.Client, tgMessages []tg.MessageClass) []*InboundMessage {
	result := make([]*InboundMessage, 0, len(tgMessages))

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

		if msg.FromID != nil {
			switch from := msg.FromID.(type) {
			case *tg.PeerUser:
				inbound.SenderID = from.UserID
			case *tg.PeerChannel:
				inbound.SenderID = from.ChannelID
			case *tg.PeerChat:
				inbound.SenderID = from.ChatID
			}
		}

		if msg.Media != nil {
			c.extractMedia(ctx, api, msg.Media, inbound)
		}

		if inbound.Text == "" && inbound.MediaType == "" {
			continue
		}

		result = append(result, inbound)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].MessageID < result[j].MessageID
	})

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
		data, err := c.downloadPhoto(ctx, api, photo)
		if err != nil {
			slog.Warn("download photo failed", "err", err)
			inbound.MediaType = ""
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
		if doc.Size > maxMediaBytes {
			slog.Warn("skip oversized document", "size", doc.Size, "limit", maxMediaBytes)
			return
		}

		inbound.MimeType = doc.MimeType
		for _, attr := range doc.Attributes {
			switch typed := attr.(type) {
			case *tg.DocumentAttributeVideo:
				inbound.MediaType = "video"
			case *tg.DocumentAttributeAnimated:
				inbound.MediaType = "animation"
			case *tg.DocumentAttributeFilename:
				inbound.FileName = typed.FileName
			}
		}
		if inbound.MediaType == "" {
			if isSticker(doc) || isAudio(doc) {
				return
			}
			inbound.MediaType = "document"
		}

		data, err := c.downloadDocument(ctx, api, doc)
		if err != nil {
			slog.Warn("download document failed", "err", err)
			inbound.MediaType = ""
			return
		}
		inbound.MediaData = data
	}
}

func (c *Crawler) downloadPhoto(ctx context.Context, api *tg.Client, photo *tg.Photo) ([]byte, error) {
	if len(photo.Sizes) == 0 {
		return nil, fmt.Errorf("no photo sizes")
	}

	var bestSize tg.PhotoSizeClass
	var maxArea int
	for _, size := range photo.Sizes {
		switch typed := size.(type) {
		case *tg.PhotoSize:
			area := typed.W * typed.H
			if area > maxArea {
				maxArea = area
				bestSize = size
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
	const chunkSize = 1024 * 1024
	data := make([]byte, 0, chunkSize)
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
			return nil, fmt.Errorf("unexpected response type %T", result)
		}

		if int64(len(data))+int64(len(file.Bytes)) > maxMediaBytes {
			return nil, fmt.Errorf("media exceeds %d bytes limit", maxMediaBytes)
		}

		data = append(data, file.Bytes...)
		if len(file.Bytes) < chunkSize {
			break
		}
		offset += chunkSize
	}

	return data, nil
}

func (c *Crawler) resolveUsername(ctx context.Context, api *tg.Client, input string) (*WatchTarget, error) {
	username := strings.TrimPrefix(input, "@")
	resolved, err := api.ContactsResolveUsername(ctx, &tg.ContactsResolveUsernameRequest{Username: username})
	if err != nil {
		return nil, fmt.Errorf("could not resolve: username not found")
	}

	target := &WatchTarget{Username: username}
	for _, chat := range resolved.Chats {
		switch ch := chat.(type) {
		case *tg.Channel:
			target.AccessHash = ch.AccessHash
			target.Title = ch.Title
			target.ChatID = -1000000000000 - ch.ID
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
		switch ch := inv.Chat.(type) {
		case *tg.Channel:
			target.AccessHash = ch.AccessHash
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
		updates, err := api.MessagesImportChatInvite(ctx, hash)
		if err != nil {
			return nil, fmt.Errorf("failed to join: %w", err)
		}
		if typed, ok := updates.(*tg.Updates); ok {
			for _, chat := range typed.Chats {
				switch ch := chat.(type) {
				case *tg.Channel:
					target.AccessHash = ch.AccessHash
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

func chatIDToPeer(target *WatchTarget) (tg.InputPeerClass, error) {
	if target.AccessHash != 0 {
		channelID := -target.ChatID
		if channelID > 1000000000000 {
			channelID -= 1000000000000
		}
		return &tg.InputPeerChannel{ChannelID: channelID, AccessHash: target.AccessHash}, nil
	}
	if target.ChatID < 0 {
		return &tg.InputPeerChat{ChatID: -target.ChatID}, nil
	}
	return &tg.InputPeerChat{ChatID: target.ChatID}, nil
}

func photoSizeType(size tg.PhotoSizeClass) string {
	switch typed := size.(type) {
	case *tg.PhotoSize:
		return typed.Type
	case *tg.PhotoCachedSize:
		return typed.Type
	case *tg.PhotoStrippedSize:
		return typed.Type
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
	return strings.Contains(msg, "CHANNEL_PRIVATE") ||
		strings.Contains(msg, "CHAT_FORBIDDEN") ||
		strings.Contains(msg, "USER_BANNED_IN_CHANNEL") ||
		strings.Contains(msg, "CHANNEL_INVALID") ||
		strings.Contains(msg, "ACCESS_HASH_INVALID")
}

func isInviteLink(s string) bool {
	return strings.HasPrefix(s, "https://t.me/+") ||
		strings.HasPrefix(s, "https://t.me/joinchat/") ||
		strings.HasPrefix(s, "t.me/+")
}

func extractInviteHash(link string) string {
	if i := strings.LastIndex(link, "+"); i >= 0 {
		return link[i+1:]
	}
	if i := strings.LastIndex(link, "joinchat/"); i >= 0 {
		return link[i+9:]
	}
	return ""
}
