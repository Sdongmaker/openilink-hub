package bot

import (
	"context"
	"log/slog"
	"time"

	"github.com/openilink/openilink-hub/internal/provider"
)

// relayToVirtualGroup forwards an inbound message from one bot's owner
// to all other running bot instances in the virtual group relay.
func (m *Manager) relayToVirtualGroup(inst *Instance, msg provider.InboundMessage) {
	// Only relay private messages (defensive check).
	if msg.GroupID != "" {
		return
	}

	senderEmoji := m.store.GetRelayEmoji(inst.DBID)
	if senderEmoji == "" {
		return
	}

	targets := m.RunningInstances()

	for _, target := range targets {
		if target.DBID == inst.DBID {
			continue // don't relay to self
		}
		if target.OwnerExtID == "" {
			continue // no known recipient
		}

		go m.relayMessage(inst, target, msg, senderEmoji)
	}
}

// relayMessage sends a single relayed message from src bot to dst bot's owner.
func (m *Manager) relayMessage(src, dst *Instance, msg provider.InboundMessage, emoji string) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("relay panic", "src", src.DBID, "dst", dst.DBID, "err", r)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
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
				slog.Error("relay text failed", "src", src.DBID, "dst", dst.DBID, "err", err)
			}

		case "image", "video", "file":
			data, err := src.Provider.DownloadMedia(ctx, item.Media)
			if err != nil {
				slog.Error("relay download media failed", "src", src.DBID, "type", item.Type, "err", err)
				// Fallback: send text notification
				dst.Provider.Send(ctx, provider.OutboundMessage{
					Recipient:    ownerID,
					Text:         emoji + " | [" + item.Type + "]",
					ContextToken: ctxToken,
				})
				continue
			}
			_, err = dst.Provider.Send(ctx, provider.OutboundMessage{
				Recipient:    ownerID,
				Text:         emoji,
				Data:         data,
				FileName:     item.FileName,
				ContextToken: ctxToken,
			})
			if err != nil {
				slog.Error("relay media failed", "src", src.DBID, "dst", dst.DBID, "type", item.Type, "err", err)
			}

		case "voice":
			data, err := src.Provider.DownloadVoice(ctx, item.Media, 0)
			if err != nil {
				slog.Error("relay download voice failed", "src", src.DBID, "err", err)
				dst.Provider.Send(ctx, provider.OutboundMessage{
					Recipient:    ownerID,
					Text:         emoji + " | [语音]",
					ContextToken: ctxToken,
				})
				continue
			}
			_, err = dst.Provider.Send(ctx, provider.OutboundMessage{
				Recipient:    ownerID,
				Data:         data,
				FileName:     "voice.wav",
				ContextToken: ctxToken,
			})
			if err != nil {
				slog.Error("relay voice failed", "src", src.DBID, "dst", dst.DBID, "err", err)
			}
		}
	}
}
