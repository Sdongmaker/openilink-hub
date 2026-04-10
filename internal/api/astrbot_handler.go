package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const astrBotOnboardPollIntervalMs = 2000

type astrBotCreateResponse struct {
	PlatformID string `json:"platform_id"`
	Status     string `json:"status"`
}

type astrBotOnboardResponse struct {
	PlatformID     string `json:"platform_id"`
	Status         string `json:"status"`
	QRURL          string `json:"qr_url,omitempty"`
	PollIntervalMs int    `json:"poll_interval_ms,omitempty"`
}

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

func astrBotErrorSummary(body []byte) string {
	summary := strings.TrimSpace(string(body))
	if summary == "" {
		return "empty upstream response"
	}
	if len(summary) > 300 {
		return summary[:300]
	}
	return summary
}

func normalizeAstrBotStatus(status string) string {
	if status == "" {
		return "initializing"
	}
	return status
}

func (s *Server) astrBotRequest(ctx context.Context, method, target string, body io.Reader, contentType string) (int, []byte, error) {
	token, err := astrBotJWT(s.Config.AstrBotJWTSecret)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to sign token: %w", err)
	}

	targetURL := strings.TrimRight(s.Config.AstrBotURL, "/") + "/api" + target
	req, err := http.NewRequestWithContext(ctx, method, targetURL, body)
	if err != nil {
		return 0, nil, err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()

	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp.StatusCode, nil, err
	}
	return resp.StatusCode, payload, nil
}

func (s *Server) astrBotFetchOnboardStatus(ctx context.Context, platformID string) (astrBotOnboardResponse, int, string, error) {
	statusCode, payload, err := s.astrBotRequest(ctx, http.MethodGet, "/bot/"+url.PathEscape(platformID)+"/qr", nil, "")
	if err != nil {
		return astrBotOnboardResponse{}, statusCode, "", err
	}
	if statusCode < 200 || statusCode >= 300 {
		summary := astrBotErrorSummary(payload)
		return astrBotOnboardResponse{}, statusCode, summary, fmt.Errorf("astrbot status returned %d", statusCode)
	}

	var state astrBotOnboardResponse
	if err := json.Unmarshal(payload, &state); err != nil {
		return astrBotOnboardResponse{}, statusCode, "invalid json", err
	}
	if state.PlatformID == "" {
		state.PlatformID = platformID
	}
	state.Status = normalizeAstrBotStatus(state.Status)
	state.PollIntervalMs = astrBotOnboardPollIntervalMs
	return state, statusCode, "", nil
}

func (s *Server) handleAstrBotPublicOnboardStart(w http.ResponseWriter, r *http.Request) {
	if s.Config.AstrBotURL == "" || s.Config.AstrBotJWTSecret == "" {
		jsonError(w, "AstrBot service not configured", http.StatusServiceUnavailable)
		return
	}

	startedAt := time.Now()
	statusCode, payload, err := s.astrBotRequest(r.Context(), http.MethodPost, "/bot/create", nil, "application/json")
	if err != nil {
		slog.Error("astrbot_onboard_error", "stage", "create", "upstream_status", statusCode, "error_summary", err.Error(), "duration_ms", time.Since(startedAt).Milliseconds())
		jsonError(w, "astrbot create failed", http.StatusBadGateway)
		return
	}
	if statusCode < 200 || statusCode >= 300 {
		summary := astrBotErrorSummary(payload)
		slog.Error("astrbot_onboard_error", "stage", "create", "upstream_status", statusCode, "error_summary", summary, "duration_ms", time.Since(startedAt).Milliseconds())
		jsonError(w, "astrbot create failed", http.StatusBadGateway)
		return
	}

	var created astrBotCreateResponse
	if err := json.Unmarshal(payload, &created); err != nil || created.PlatformID == "" {
		slog.Error("astrbot_onboard_error", "stage", "create", "upstream_status", statusCode, "error_summary", "invalid create response", "duration_ms", time.Since(startedAt).Milliseconds())
		jsonError(w, "invalid astrbot create response", http.StatusBadGateway)
		return
	}

	state := astrBotOnboardResponse{
		PlatformID:     created.PlatformID,
		Status:         normalizeAstrBotStatus(created.Status),
		PollIntervalMs: astrBotOnboardPollIntervalMs,
	}

	qrState, qrStatusCode, qrSummary, qrErr := s.astrBotFetchOnboardStatus(r.Context(), created.PlatformID)
	if qrErr == nil {
		state = qrState
	} else {
		slog.Warn("astrbot_onboard_error", "stage", "status", "platform_id", created.PlatformID, "upstream_status", qrStatusCode, "error_summary", coalesceAstrBotSummary(qrSummary, qrErr.Error()), "duration_ms", time.Since(startedAt).Milliseconds())
	}

	slog.Info("astrbot_onboard_start", "upstream", s.Config.AstrBotURL, "platform_id", state.PlatformID, "status", state.Status, "duration_ms", time.Since(startedAt).Milliseconds())
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
}

func coalesceAstrBotSummary(summary, fallback string) string {
	if summary != "" {
		return summary
	}
	return fallback
}

func (s *Server) handleAstrBotPublicOnboardStatus(w http.ResponseWriter, r *http.Request) {
	if s.Config.AstrBotURL == "" || s.Config.AstrBotJWTSecret == "" {
		jsonError(w, "AstrBot service not configured", http.StatusServiceUnavailable)
		return
	}

	platformID := r.PathValue("platformID")
	if platformID == "" {
		jsonError(w, "missing platform id", http.StatusBadRequest)
		return
	}

	startedAt := time.Now()
	state, statusCode, summary, err := s.astrBotFetchOnboardStatus(r.Context(), platformID)
	if err != nil {
		slog.Error("astrbot_onboard_error", "stage", "status", "platform_id", platformID, "upstream_status", statusCode, "error_summary", coalesceAstrBotSummary(summary, err.Error()), "duration_ms", time.Since(startedAt).Milliseconds())
		jsonError(w, "astrbot status failed", http.StatusBadGateway)
		return
	}

	slog.Info("astrbot_onboard_status", "platform_id", state.PlatformID, "status", state.Status, "has_qr", state.QRURL != "", "duration_ms", time.Since(startedAt).Milliseconds())
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
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
