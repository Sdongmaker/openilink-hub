package api

import (
	"net/http"
	"strings"

	"github.com/openilink/openilink-hub/internal/auth"
)

// GET /api/v1/channels/media?key=xxx&eqp=xxx&aes=xxx
// Proxy: downloads from CDN via bot provider, decrypts and streams back.
// Used when MinIO is not configured.
func (s *Server) handleChannelMedia(w http.ResponseWriter, r *http.Request) {
	ch, err := s.authenticateChannel(r)
	if ch == nil {
		if err != nil {
			http.Error(w, "invalid key", http.StatusUnauthorized)
		} else {
			http.Error(w, "api key required", http.StatusUnauthorized)
		}
		return
	}

	eqp := r.URL.Query().Get("eqp")
	aes := r.URL.Query().Get("aes")
	if eqp == "" || aes == "" {
		http.Error(w, "eqp and aes required", http.StatusBadRequest)
		return
	}

	inst, ok := s.BotManager.GetInstance(ch.BotID)
	if !ok {
		http.Error(w, "bot not connected", http.StatusServiceUnavailable)
		return
	}

	data, err := inst.Provider.DownloadMedia(r.Context(), eqp, aes)
	if err != nil {
		http.Error(w, "download failed", http.StatusBadGateway)
		return
	}

	ct := r.URL.Query().Get("ct")
	if ct == "" {
		ct = http.DetectContentType(data)
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Write(data)
}

// GET /api/v1/media/{key...}
// Proxy: serves files from MinIO through Hub's own domain.
// Auth: session cookie (browser) or channel API key (?key=xxx).
func (s *Server) handleMediaProxy(w http.ResponseWriter, r *http.Request) {
	if s.Store == nil {
		http.Error(w, "storage not configured", http.StatusNotFound)
		return
	}

	// Auth: session cookie or channel API key
	authed := false
	if cookie, err := r.Cookie("session"); err == nil {
		if uid, err := auth.ValidateSession(s.DB, cookie.Value); err == nil && uid != "" {
			authed = true
		}
	}
	if !authed {
		if ch, _ := s.authenticateChannel(r); ch != nil {
			authed = true
		}
	}
	if !authed {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	key := strings.TrimPrefix(r.URL.Path, "/api/v1/media/")
	if key == "" {
		http.Error(w, "key required", http.StatusBadRequest)
		return
	}

	data, err := s.Store.Get(r.Context(), key)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	ct := http.DetectContentType(data)
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Write(data)
}
