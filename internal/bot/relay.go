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
	relayWorkerCount        = 10
	relayMaxRetries         = 3
	relayDownloadTimeout    = 60 * time.Second  // CDN download can be slow for large files
	relaySendTimeout        = 120 * time.Second // CDN upload needs 60s × 3 retries internally
	relayLargeFileThreshold = 5 * 1024 * 1024
)

var relayRetryDelays = []time.Duration{0, 5 * time.Second, 30 * time.Second}

// relayDeepCopyMsg deep-copies an InboundMessage so that relay reads
// the original Media.EncryptQueryParam/AESKey fields. Without this copy,
// the concurrent downloadMedia goroutine may overwrite Media.URL with a
// Hub proxy URL, causing the SDK to prefer FullURL → 401 Unauthorized.
func relayDeepCopyMsg(src provider.InboundMessage) provider.InboundMessage {
	dst := src
	dst.Items = make([]provider.MessageItem, len(src.Items))
	for i, item := range src.Items {
		dst.Items[i] = item
		if item.Media != nil {
			copy := *item.Media
			dst.Items[i].Media = &copy
		}
		if item.RefMsg != nil {
			rc := *item.RefMsg
			if rc.Item.Media != nil {
				mc := *rc.Item.Media
				rc.Item.Media = &mc
			}
			dst.Items[i].RefMsg = &rc
		}
	}
	return dst
}

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

	relayStart := time.Now()
	slog.Info("中转开始", "bot", inst.DBID, "emoji", senderEmoji,
		"类型", contentType, "目标数", len(validTargets), "msg_id", relayMsgID)

	// Download media ONCE from source provider.
	mediaData, fileName := m.relayDownloadOnce(inst, msg)

	if mediaData != nil {
		slog.Info("中转媒体就绪", "bot", inst.DBID,
			"文件", fileName, "大小", len(mediaData),
			"MB", fmt.Sprintf("%.2f", float64(len(mediaData))/1024/1024),
			"下载耗时ms", time.Since(relayStart).Milliseconds())
	}

	// If media is large, cache to storage so workers read from disk/S3
	// instead of holding the full []byte in memory during the entire fan-out.
	var cacheKey string
	if mediaData != nil && m.storage != nil && len(mediaData) > relayLargeFileThreshold {
		key := fmt.Sprintf("relay/%d/%d", time.Now().UnixMilli(), relayMsgID)
		contentType := "application/octet-stream"
		if _, err := m.storage.Put(context.Background(), key, contentType, mediaData); err != nil {
			slog.Warn("中转缓存到存储失败，使用内存", "err", err)
		} else {
			slog.Info("中转已缓存到存储", "key", key, "大小", len(mediaData))
			cacheKey = key
			mediaData = nil // release memory; workers will read from storage
		}
	}

	// Worker pool fan-out.
	fanOutStart := time.Now()
	m.relayFanOut(inst, validTargets, msg, senderEmoji, mediaData, fileName, relayMsgID, cacheKey)

	slog.Info("中转完成", "bot", inst.DBID, "msg_id", relayMsgID,
		"目标数", len(validTargets), "分发耗时ms", time.Since(fanOutStart).Milliseconds(),
		"总耗时ms", time.Since(relayStart).Milliseconds())

	// Clean up storage cache after all sends complete.
	if cacheKey != "" && m.storage != nil {
		slog.Debug("中转缓存清理", "key", cacheKey)
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
		// Note quoted/referenced messages.
		if item.RefMsg != nil && content == "" {
			content = "[引用] " + relayRefSummary(item.RefMsg)
		}
	}
	if content == "" {
		content = "[消息]"
	}
	return
}

// relayRefSummary returns a short text summary of a RefMsg for display.
func relayRefSummary(ref *provider.RefMsg) string {
	if ref.Title != "" {
		return ref.Title
	}
	switch ref.Item.Type {
	case "text":
		runes := []rune(ref.Item.Text)
		if len(runes) > 30 {
			return string(runes[:30]) + "..."
		}
		return ref.Item.Text
	case "image":
		return "[图片]"
	case "voice":
		return "[语音]"
	case "video":
		return "[视频]"
	case "file":
		if ref.Item.FileName != "" {
			return ref.Item.FileName
		}
		return "[文件]"
	default:
		return "[消息]"
	}
}

// relayDownloadOnce downloads media from the source provider once for all targets.
// Returns nil for text-only messages.
func (m *Manager) relayDownloadOnce(src *Instance, msg provider.InboundMessage) (data []byte, fileName string) {
	for _, item := range msg.Items {
		if item.Media == nil {
			continue
		}

		slog.Info("中转下载开始", "bot", src.DBID, "类型", item.Type,
			"有EQP", item.Media.EncryptQueryParam != "",
			"有AES", item.Media.AESKey != "",
			"有URL", item.Media.URL != "",
			"文件大小", item.Media.FileSize)

		ctx, cancel := context.WithTimeout(context.Background(), relayDownloadTimeout)
		defer cancel()

		dlStart := time.Now()

		switch item.Type {
		case "image", "video", "file":
			downloaded, err := src.Provider.DownloadMedia(ctx, item.Media)
			if err != nil {
				slog.Error("中转下载失败", "bot", src.DBID, "类型", item.Type,
					"耗时ms", time.Since(dlStart).Milliseconds(), "err", err)
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
			slog.Info("中转下载完成", "bot", src.DBID, "类型", item.Type,
				"文件", fn, "大小", len(downloaded),
				"耗时ms", time.Since(dlStart).Milliseconds())
			return downloaded, fn

		case "voice":
			downloaded, err := src.Provider.DownloadVoice(ctx, item.Media, 0)
			if err != nil {
				slog.Error("中转语音下载失败", "bot", src.DBID,
					"耗时ms", time.Since(dlStart).Milliseconds(), "err", err)
				return nil, ""
			}
			slog.Info("中转下载完成", "bot", src.DBID, "类型", "voice",
				"文件", "voice.wav", "大小", len(downloaded),
				"耗时ms", time.Since(dlStart).Milliseconds())
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
						slog.Error("中转读取缓存失败", "key", cacheKey, "err", err)
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
			slog.Error("中转发送异常", "src", src.DBID, "dst", dst.DBID, "err", r)
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

		sendStart := time.Now()
		err := m.relaySendOnce(src, dst, msg, emoji, mediaData, fileName)
		sendDur := time.Since(sendStart)

		if err == nil {
			slog.Info("中转发送成功", "src", src.DBID, "dst", dst.DBID,
				"尝试次数", attempt+1, "耗时ms", sendDur.Milliseconds(),
				"有媒体", mediaData != nil, "文件", fileName)
			if relayMsgID > 0 {
				m.store.UpdateRelayDelivery(relayMsgID, dst.DBID, "done", attempt+1, "")
			}
			return
		}

		lastErr = err
		slog.Warn("中转发送失败", "src", src.DBID, "dst", dst.DBID,
			"尝试次数", attempt+1, "耗时ms", sendDur.Milliseconds(),
			"有媒体", mediaData != nil, "文件", fileName, "err", err)
	}

	// All retries exhausted.
	slog.Error("中转发送全部重试失败", "src", src.DBID, "dst", dst.DBID, "err", lastErr)
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

	// Build quote prefix once if present (applies to the whole message).
	var quotePrefix string
	for _, item := range msg.Items {
		if item.RefMsg != nil {
			quotePrefix = "「" + relayRefSummary(item.RefMsg) + "」\n"
			break
		}
	}

	for _, item := range msg.Items {
		switch item.Type {
		case "text":
			text := emoji + " | " + quotePrefix + item.Text
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
					Text:         emoji + " | " + quotePrefix + "[" + item.Type + "]",
					ContextToken: ctxToken,
				})
				if err != nil {
					return err
				}
				continue
			}
			_, err := dst.Provider.Send(ctx, provider.OutboundMessage{
				Recipient:    ownerID,
				Text:         emoji + " | " + quotePrefix,
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
					Text:         emoji + " | " + quotePrefix + "[语音]",
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
