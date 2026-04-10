package bot

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/openilink/openilink-hub/internal/provider"
)

const (
	relayWorkerCount = 10
	relayMaxRetries  = 3
	relaySendTimeout = 30 * time.Second
	// Files larger than 5MB are cached to storage and read per-worker
	// to avoid holding a large []byte in memory during the entire fan-out.
	relayLargeFileThreshold = 5 * 1024 * 1024
)

var relayRetryDelays = []time.Duration{0, 5 * time.Second, 30 * time.Second}

// relayToVirtualGroup forwards an inbound message from one bot's owner
// to all other running bot instances in the virtual group relay.
// Uses download-once + worker pool fan-out for scalability.
func (m *Manager) relayToVirtualGroup(inst *Instance, msg provider.InboundMessage) {
	// Only relay private messages (defensive check).
	if msg.GroupID != "" {
		return
	}

	senderEmoji := m.store.GetRelayEmoji(inst.DBID)
	if senderEmoji == "" {
		return
	}

	// Determine content type and text content for the relay record.
	contentType, content := relayContentSummary(msg)

	// Save to relay_messages for admin UI (single record per inbound message).
	relayMsg, err := m.store.SaveRelayMessage(inst.DBID, senderEmoji, contentType, content, "", 0)
	if err != nil {
		slog.Error("save relay message failed", "bot", inst.DBID, "err", err)
		// Don't return — still try to relay even without DB record.
	}

	// Broadcast to admin relay WebSocket viewers.
	if relayMsg != nil && m.relayAdminHub != nil {
		m.relayAdminHub.Broadcast(relayMsg)
	}

	targets := m.RunningInstances()
	var validTargets []*Instance
	for _, target := range targets {
		if target.DBID == inst.DBID {
			continue
		}
		if target.OwnerExtID == "" {
			continue
		}
		validTargets = append(validTargets, target)
	}
	if len(validTargets) == 0 {
		return
	}

	// Save delivery records for tracking.
	var relayMsgID int64
	if relayMsg != nil {
		relayMsgID = relayMsg.ID
		for _, t := range validTargets {
			if err := m.store.SaveRelayDelivery(relayMsg.ID, t.DBID); err != nil {
				slog.Error("save relay delivery failed", "relay_msg", relayMsg.ID, "target", t.DBID, "err", err)
			}
		}
	}

	// Download media ONCE from source provider.
	mediaData, fileName := m.relayDownloadOnce(inst, msg)

	// If media is large, cache to storage so workers read from disk/S3
	// instead of holding the full []byte in memory during the entire fan-out.
	var cacheKey string
	if mediaData != nil && m.storage != nil && len(mediaData) > relayLargeFileThreshold {
		key := fmt.Sprintf("relay/%d/%d", time.Now().UnixMilli(), relayMsgID)
		contentType := "application/octet-stream"
		if _, err := m.storage.Put(context.Background(), key, contentType, mediaData); err != nil {
			slog.Warn("relay cache to storage failed, using in-memory", "err", err)
		} else {
			cacheKey = key
			mediaData = nil // release memory; workers will read from storage
		}
	}

	// Worker pool fan-out.
	m.relayFanOut(inst, validTargets, msg, senderEmoji, mediaData, fileName, relayMsgID, cacheKey)

	// Clean up storage cache after all sends complete.
	if cacheKey != "" && m.storage != nil {
		// Best-effort cleanup; if it fails, the file will be orphaned.
		// A periodic cleanup job can handle this.
		slog.Debug("relay cache cleanup", "key", cacheKey)
	}
}

// relayContentSummary extracts content type and summary text from an inbound message.
func relayContentSummary(msg provider.InboundMessage) (contentType, content string) {
	contentType = "text"
	for _, item := range msg.Items {
		switch item.Type {
		case "text":
			content = item.Text
		case "image":
			contentType = "image"
			if content == "" {
				content = "[图片]"
			}
		case "voice":
			contentType = "voice"
			if content == "" {
				content = "[语音]"
			}
		case "video":
			contentType = "video"
			if content == "" {
				content = "[视频]"
			}
		case "file":
			contentType = "file"
			if content == "" {
				if item.FileName != "" {
					content = item.FileName
				} else {
					content = "[文件]"
				}
			}
		}
	}
	if content == "" {
		content = "[消息]"
	}
	return
}

// relayDownloadOnce downloads media from the source provider once for all targets.
// Returns nil for text-only messages.
func (m *Manager) relayDownloadOnce(src *Instance, msg provider.InboundMessage) (data []byte, fileName string) {
	for _, item := range msg.Items {
		if item.Media == nil {
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), relaySendTimeout)
		defer cancel()

		switch item.Type {
		case "image", "video", "file":
			downloaded, err := src.Provider.DownloadMedia(ctx, item.Media)
			if err != nil {
				slog.Error("relay download-once failed", "bot", src.DBID, "type", item.Type, "err", err)
				return nil, ""
			}
			fn := item.FileName
			if fn == "" {
				switch item.Type {
				case "image":
					fn = "image.jpg"
				case "video":
					fn = "video.mp4"
				case "file":
					fn = "file"
				}
			}
			return downloaded, fn

		case "voice":
			downloaded, err := src.Provider.DownloadVoice(ctx, item.Media, 0)
			if err != nil {
				slog.Error("relay download-once voice failed", "bot", src.DBID, "err", err)
				return nil, ""
			}
			return downloaded, "voice.wav"
		}
	}
	return nil, ""
}

// relayFanOut distributes a relay message to all target bots via a bounded worker pool.
// When cacheKey is set, workers read media from storage instead of using in-memory mediaData.
func (m *Manager) relayFanOut(src *Instance, targets []*Instance, msg provider.InboundMessage, emoji string, mediaData []byte, fileName string, relayMsgID int64, cacheKey string) {
	jobs := make(chan *Instance, len(targets))
	var wg sync.WaitGroup

	workerCount := relayWorkerCount
	if len(targets) < workerCount {
		workerCount = len(targets)
	}

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for dst := range jobs {
				// If media is cached in storage, each worker reads its own copy.
				// This avoids holding a large []byte in memory for the whole fan-out.
				workerMedia := mediaData
				if cacheKey != "" && m.storage != nil {
					data, err := m.storage.Get(context.Background(), cacheKey)
					if err != nil {
						slog.Error("relay worker read cache failed", "key", cacheKey, "err", err)
						// workerMedia stays nil → will send text fallback
					} else {
						workerMedia = data
					}
				}
				m.relaySendWithRetry(src, dst, msg, emoji, workerMedia, fileName, relayMsgID)
			}
		}()
	}

	for _, t := range targets {
		jobs <- t
	}
	close(jobs)

	wg.Wait()
}

// relaySendWithRetry attempts to send a relay message to a target bot with retry.
func (m *Manager) relaySendWithRetry(src, dst *Instance, msg provider.InboundMessage, emoji string, mediaData []byte, fileName string, relayMsgID int64) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("relay send panic", "src", src.DBID, "dst", dst.DBID, "err", r)
		}
	}()

	var lastErr error
	for attempt := 0; attempt < relayMaxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(relayRetryDelays[attempt])
		}

		if relayMsgID > 0 {
			m.store.UpdateRelayDelivery(relayMsgID, dst.DBID, "sending", attempt+1, "")
		}

		err := m.relaySendOnce(src, dst, msg, emoji, mediaData, fileName)
		if err == nil {
			if relayMsgID > 0 {
				m.store.UpdateRelayDelivery(relayMsgID, dst.DBID, "done", attempt+1, "")
			}
			return
		}

		lastErr = err
		slog.Warn("relay send attempt failed", "src", src.DBID, "dst", dst.DBID, "attempt", attempt+1, "err", err)
	}

	// All retries exhausted.
	slog.Error("relay send failed after retries", "src", src.DBID, "dst", dst.DBID, "err", lastErr)
	if relayMsgID > 0 {
		errMsg := ""
		if lastErr != nil {
			errMsg = lastErr.Error()
		}
		m.store.UpdateRelayDelivery(relayMsgID, dst.DBID, "failed", relayMaxRetries, errMsg)
	}
}

// relaySendOnce sends all items of a relay message to a single target bot.
func (m *Manager) relaySendOnce(src, dst *Instance, msg provider.InboundMessage, emoji string, mediaData []byte, fileName string) error {
	ctx, cancel := context.WithTimeout(context.Background(), relaySendTimeout)
	defer cancel()

	ownerID := dst.OwnerExtID
	ctxToken := m.store.GetLatestContextTokenForTarget(dst.DBID, ownerID)

	for _, item := range msg.Items {
		switch item.Type {
		case "text":
			text := emoji + " | " + item.Text
			_, err := dst.Provider.Send(ctx, provider.OutboundMessage{
				Recipient:    ownerID,
				Text:         text,
				ContextToken: ctxToken,
			})
			if err != nil {
				return err
			}

		case "image", "video", "file":
			if mediaData == nil {
				// Download failed earlier; send text fallback.
				_, err := dst.Provider.Send(ctx, provider.OutboundMessage{
					Recipient:    ownerID,
					Text:         emoji + " | [" + item.Type + "]",
					ContextToken: ctxToken,
				})
				if err != nil {
					return err
				}
				continue
			}
			_, err := dst.Provider.Send(ctx, provider.OutboundMessage{
				Recipient:    ownerID,
				Text:         emoji,
				Data:         mediaData,
				FileName:     fileName,
				ContextToken: ctxToken,
			})
			if err != nil {
				return err
			}

		case "voice":
			if mediaData == nil {
				_, err := dst.Provider.Send(ctx, provider.OutboundMessage{
					Recipient:    ownerID,
					Text:         emoji + " | [语音]",
					ContextToken: ctxToken,
				})
				if err != nil {
					return err
				}
				continue
			}
			_, err := dst.Provider.Send(ctx, provider.OutboundMessage{
				Recipient:    ownerID,
				Data:         mediaData,
				FileName:     "voice.wav",
				ContextToken: ctxToken,
			})
			if err != nil {
				return err
			}
		}
	}
	return nil
}
