package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/openilink/openilink-hub/internal/auth"
	"github.com/openilink/openilink-hub/internal/bot"
	"github.com/openilink/openilink-hub/internal/store"
)

// GET /api/admin/relay/messages — list relay messages (cursor-based pagination)
func (s *Server) handleRelayMessages(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	var beforeID int64
	if cursor := r.URL.Query().Get("cursor"); cursor != "" {
		if id, err := strconv.ParseInt(cursor, 10, 64); err == nil {
			beforeID = id
		}
	}

	msgs, err := s.Store.ListRelayMessages(limit+1, beforeID)
	if err != nil {
		jsonError(w, "list failed", http.StatusInternalServerError)
		return
	}

	hasMore := len(msgs) > limit
	if hasMore {
		msgs = msgs[:limit]
	}

	var nextCursor string
	if hasMore && len(msgs) > 0 {
		nextCursor = strconv.FormatInt(msgs[len(msgs)-1].ID, 10)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"messages":    msgs,
		"next_cursor": nextCursor,
		"has_more":    hasMore,
	})
}

// GET /api/admin/relay/members — list relay members with enriched info
func (s *Server) handleRelayMembers(w http.ResponseWriter, r *http.Request) {
	members, err := s.Store.ListRelayMembers()
	if err != nil {
		jsonError(w, "list failed", http.StatusInternalServerError)
		return
	}

	type memberInfo struct {
		BotID     string `json:"bot_id"`
		Emoji     string `json:"emoji"`
		BotName   string `json:"bot_name"`
		OwnerName string `json:"owner_name"`
		Online    bool   `json:"online"`
		JoinedAt  int64  `json:"joined_at"`
	}

	result := make([]memberInfo, 0, len(members))
	for _, m := range members {
		info := memberInfo{
			BotID:    m.BotID,
			Emoji:    m.Emoji,
			JoinedAt: m.JoinedAt,
		}

		// Enrich with bot info.
		b, err := s.Store.GetBot(m.BotID)
		if err == nil && b != nil {
			if b.DisplayName != "" {
				info.BotName = b.DisplayName
			} else {
				info.BotName = b.Name
			}
			// Get owner name.
			if u, err := s.Store.GetUserByID(b.UserID); err == nil && u != nil {
				info.OwnerName = u.Username
			}
		}

		// Check online status.
		if inst, ok := s.BotManager.GetInstance(m.BotID); ok {
			info.Online = inst.Status() == "connected"
		}

		result = append(result, info)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// DELETE /api/admin/relay/members/{botID} — remove a bot from relay
func (s *Server) handleRemoveRelayMember(w http.ResponseWriter, r *http.Request) {
	botID := r.PathValue("botID")
	if botID == "" {
		jsonError(w, "bot_id required", http.StatusBadRequest)
		return
	}

	if err := s.Store.RemoveRelayMember(botID); err != nil {
		jsonError(w, "remove failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// GET /api/admin/relay/ws — WebSocket for real-time relay messages
func (s *Server) handleRelayWS(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	wsUpgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true
			}
			u, err := url.Parse(origin)
			if err != nil {
				return false
			}
			expected, err := url.Parse(s.Config.RPOrigin)
			if err != nil || expected.Host == "" {
				return false
			}
			return strings.EqualFold(u.Scheme, expected.Scheme) &&
				strings.EqualFold(u.Host, expected.Host)
		},
	}

	ws, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("relay admin ws upgrade failed", "err", err)
		return
	}

	hub := s.BotManager.RelayAdminHubRef()
	if hub == nil {
		ws.Close()
		return
	}

	c := bot.NewRelayAdminConn(ws, hub)
	hub.Register(c)

	go c.WritePump()
	c.ReadPump() // blocks
}

// GET /api/admin/relay/stats — relay statistics
func (s *Server) handleRelayStats(w http.ResponseWriter, r *http.Request) {
	members, _ := s.Store.ListRelayMembers()

	onlineCount := 0
	for _, m := range members {
		if inst, ok := s.BotManager.GetInstance(m.BotID); ok {
			if inst.Status() == "connected" {
				onlineCount++
			}
		}
	}

	// Get recent message count (last 24h).
	recentMsgs, _ := s.Store.ListRelayMessages(1, 0)
	var lastMsgAt int64
	if len(recentMsgs) > 0 {
		lastMsgAt = recentMsgs[0].CreatedAt
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"total_members":  len(members),
		"online_members": onlineCount,
		"last_message_at": lastMsgAt,
	})
}

// Ensure unused imports are used.
var _ = store.RelayMessage{}
