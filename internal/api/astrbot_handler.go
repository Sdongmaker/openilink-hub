package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// astrBotJWT builds a HS256 JWT for AstrBot API authentication.
func astrBotJWT(secret string) (string, error) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))

	now := time.Now().Unix()
	payload := map[string]any{
		"sub": "openilink-hub",
		"iat": now,
		"exp": now + 3600,
	}
	payloadJSON, _ := json.Marshal(payload)
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)

	unsigned := header + "." + payloadB64
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(unsigned))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return unsigned + "." + sig, nil
}

// handleAstrBotProxy proxies requests from /api/admin/astrbot/* to the external
// AstrBot service, adding JWT Bearer auth. The Hub acts as a secure gateway so
// the JWT secret is never exposed to the browser.
func (s *Server) handleAstrBotProxy(w http.ResponseWriter, r *http.Request) {
	if s.Config.AstrBotURL == "" || s.Config.AstrBotJWTSecret == "" {
		jsonError(w, "AstrBot service not configured", http.StatusServiceUnavailable)
		return
	}

	// Strip the Hub prefix to get the target path:
	// /api/admin/astrbot/bot/create → /api/bot/create
	target := strings.TrimPrefix(r.URL.Path, "/api/admin/astrbot")
	if target == "" {
		target = "/"
	}
	targetURL := strings.TrimRight(s.Config.AstrBotURL, "/") + "/api" + target
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	token, err := astrBotJWT(s.Config.AstrBotJWTSecret)
	if err != nil {
		jsonError(w, "failed to sign token", http.StatusInternalServerError)
		return
	}

	// Health check bypasses JWT
	isHealth := target == "/health"

	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, r.Body)
	if err != nil {
		jsonError(w, "bad request", http.StatusBadRequest)
		return
	}
	proxyReq.Header.Set("Content-Type", r.Header.Get("Content-Type"))
	if !isHealth {
		proxyReq.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(proxyReq)
	if err != nil {
		slog.Error("astrbot proxy failed", "url", targetURL, "err", err)
		jsonError(w, fmt.Sprintf("astrbot unreachable: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Copy response headers and body
	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
