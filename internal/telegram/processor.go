package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"
	"time"

	"github.com/openilink/openilink-hub/internal/ai"
	"github.com/openilink/openilink-hub/internal/storage"
	"github.com/openilink/openilink-hub/internal/store"
)

// Processor handles message classification and media storage.
type Processor struct {
	aiConfig func() store.AIConfig
	storage  storage.Store
	store    *Store
	sem      chan struct{} // media download semaphore
}

// NewProcessor creates a new message processor.
func NewProcessor(aiConfig func() store.AIConfig, objStore storage.Store, tgStore *Store) *Processor {
	return &Processor{
		aiConfig: aiConfig,
		storage:  objStore,
		store:    tgStore,
		sem:      make(chan struct{}, 5),
	}
}

func (p *Processor) resolveAIConfig() store.AIConfig {
	if p.aiConfig == nil {
		return store.AIConfig{}
	}
	return p.aiConfig()
}

// adResult is the expected JSON response from the AI ad classifier.
type adResult struct {
	IsAd       bool    `json:"is_ad"`
	Confidence float64 `json:"confidence"`
}

const adClassifyPrompt = `Determine if the following Telegram message is an advertisement.
Return ONLY JSON: {"is_ad": true, "confidence": 0.95} or {"is_ad": false, "confidence": 0.1}
Message: %s`

// ClassifyAd calls the AI to determine if text is an advertisement.
func (p *Processor) ClassifyAd(ctx context.Context, text string) (bool, float64) {
	cfg := p.resolveAIConfig()
	if text == "" || cfg.APIKey == "" {
		return false, 0
	}

	prompt := fmt.Sprintf(adClassifyPrompt, text)
	messages := []ai.Message{
		{Role: "user", Content: prompt},
	}

	result, err := ai.CompleteMessages(ctx, cfg, messages, nil)
	if err != nil {
		slog.Warn("ad classification failed", "err", err)
		return false, 0
	}

	var ad adResult
	// Try to parse the response as JSON
	content := strings.TrimSpace(result.Content)
	// Strip markdown code fences if present
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	if err := json.Unmarshal([]byte(content), &ad); err != nil {
		slog.Warn("ad classification: invalid JSON response", "content", result.Content, "err", err)
		return false, 0
	}
	return ad.IsAd, ad.Confidence
}

// ProcessMessage processes a single Telegram message through the pipeline.
func (p *Processor) ProcessMessage(ctx context.Context, target *WatchTarget, msg *InboundMessage) error {
	// Check storage rule: must have text or supported media
	if msg.Text == "" && msg.MediaType == "" {
		return nil // silently discard
	}

	tgMsg := &TGMessage{
		TargetID:    target.ID,
		TGMessageID: msg.MessageID,
		SenderID:    msg.SenderID,
		SenderName:  msg.SenderName,
		ContentType: msg.ContentType(),
		TextContent: msg.Text,
		CreatedAt:   msg.Date,
	}

	// AI ad classification (text-based only)
	if msg.Text != "" {
		isAd, confidence := p.ClassifyAd(ctx, msg.Text)
		tgMsg.IsAd = isAd
		tgMsg.AdConfidence = confidence
	}

	// Media download + upload to OSS
	if msg.MediaType != "" && msg.MediaData != nil && p.storage != nil {
		p.sem <- struct{}{} // acquire semaphore
		defer func() { <-p.sem }()

		ext := mediaExtension(msg.MediaType, msg.MimeType, msg.FileName)
		key := fmt.Sprintf("telegram/%d/%d%s", target.ID, msg.MessageID, ext)

		contentType := msg.MimeType
		if contentType == "" {
			contentType = "application/octet-stream"
		}

		var lastErr error
		for attempt := 0; attempt < 3; attempt++ {
			_, err := p.storage.Put(ctx, key, contentType, msg.MediaData)
			if err == nil {
				tgMsg.MediaKey = key
				break
			}
			lastErr = err
			slog.Warn("oss upload retry", "key", key, "attempt", attempt+1, "err", err)
			time.Sleep(time.Duration(attempt+1) * time.Second)
		}
		if tgMsg.MediaKey == "" && lastErr != nil {
			slog.Error("oss upload failed after retries", "key", key, "err", lastErr)
		}
	}

	return p.store.InsertMessage(ctx, tgMsg)
}

// InboundMessage is a parsed Telegram message ready for processing.
type InboundMessage struct {
	MessageID  int64
	SenderID   int64
	SenderName string
	Text       string
	Date       int64
	MediaType  string // photo, video, document, animation, or empty
	MimeType   string
	FileName   string
	MediaData  []byte
}

// ContentType returns the tg_messages content_type value.
func (m *InboundMessage) ContentType() string {
	if m.MediaType != "" {
		return m.MediaType
	}
	return "text"
}

// mediaExtension returns the file extension for a given media type.
func mediaExtension(mediaType, mimeType, fileName string) string {
	switch mediaType {
	case "photo":
		return ".jpg"
	case "animation":
		return ".mp4"
	case "video":
		return mimeToExt(mimeType, ".mp4")
	case "document":
		if fileName != "" {
			if ext := filepath.Ext(fileName); ext != "" {
				return ext
			}
		}
		return mimeToExt(mimeType, ".bin")
	}
	return ".bin"
}

func mimeToExt(mime, fallback string) string {
	switch mime {
	case "video/mp4":
		return ".mp4"
	case "video/quicktime":
		return ".mov"
	case "video/webm":
		return ".webm"
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "application/pdf":
		return ".pdf"
	}
	return fallback
}
