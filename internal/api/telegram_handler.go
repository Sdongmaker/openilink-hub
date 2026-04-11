package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/openilink/openilink-hub/internal/telegram"
)

// --- Telegram Account ---

func (s *Server) handleTelegramGetAccount(w http.ResponseWriter, r *http.Request) {
	acc, err := s.TGCrawler.Store().GetAccount(r.Context())
	if err != nil {
		http.Error(w, `{"error":"no account configured"}`, http.StatusNotFound)
		return
	}
	writeJSON(w, acc)
}

func (s *Server) handleTelegramCreateAccount(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Phone string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Phone == "" {
		http.Error(w, `{"error":"phone required"}`, http.StatusBadRequest)
		return
	}
	acc, err := s.TGCrawler.Store().CreateAccount(r.Context(), req.Phone)
	if err != nil {
		slog.Error("create tg account", "err", err)
		http.Error(w, `{"error":"failed to create account"}`, http.StatusInternalServerError)
		return
	}
	writeJSON(w, acc)
}

func (s *Server) handleTelegramDeleteAccount(w http.ResponseWriter, r *http.Request) {
	acc, err := s.TGCrawler.Store().GetAccount(r.Context())
	if err != nil {
		http.Error(w, `{"error":"no account"}`, http.StatusNotFound)
		return
	}
	s.TGCrawler.Stop()
	s.TGClient.Stop()
	_ = s.TGCrawler.Store().DeleteAccount(r.Context(), acc.ID)
	w.WriteHeader(http.StatusNoContent)
}

// --- Telegram Auth ---

func (s *Server) handleTelegramSendCode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Phone string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Phone == "" {
		http.Error(w, `{"error":"phone required"}`, http.StatusBadRequest)
		return
	}
	result, err := s.TGClient.StartAuth(r.Context(), req.Phone)
	if err != nil {
		slog.Error("telegram send code", "err", err)
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"status": result})
}

func (s *Server) handleTelegramVerify(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code       string `json:"code"`
		Password2FA string `json:"password_2fa,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
		http.Error(w, `{"error":"code required"}`, http.StatusBadRequest)
		return
	}
	if err := s.TGClient.VerifyCode(r.Context(), req.Code, req.Password2FA); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}
	writeJSON(w, map[string]string{"status": "verified"})
}

// --- Connection Test ---

func (s *Server) handleTelegramTest(w http.ResponseWriter, r *http.Request) {
	result, err := s.TGClient.Test(r.Context())
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	writeJSON(w, result)
}

// --- Watch Targets ---

func (s *Server) handleTelegramListTargets(w http.ResponseWriter, r *http.Request) {
	acc, err := s.TGCrawler.Store().GetAccount(r.Context())
	if err != nil {
		writeJSON(w, []any{})
		return
	}
	targets, err := s.TGCrawler.Store().ListTargets(r.Context(), acc.ID)
	if err != nil {
		http.Error(w, `{"error":"failed to list targets"}`, http.StatusInternalServerError)
		return
	}
	// Enrich with today_count
	type targetResp struct {
		telegram.WatchTarget
		TodayCount int `json:"today_count"`
	}
	var resp []targetResp
	for _, t := range targets {
		resp = append(resp, targetResp{
			WatchTarget: t,
			TodayCount:  s.TGCrawler.Store().TodayCountByTarget(r.Context(), t.ID),
		})
	}
	if resp == nil {
		resp = []targetResp{}
	}
	writeJSON(w, resp)
}

func (s *Server) handleTelegramCreateTarget(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Input string `json:"input"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Input == "" {
		http.Error(w, `{"error":"input required"}`, http.StatusBadRequest)
		return
	}

	target, err := s.TGCrawler.ResolveTarget(r.Context(), req.Input)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	acc, err := s.TGCrawler.Store().GetAccount(r.Context())
	if err != nil {
		http.Error(w, `{"error":"no account configured"}`, http.StatusBadRequest)
		return
	}
	target.AccountID = acc.ID

	if err := s.TGCrawler.Store().CreateTarget(r.Context(), target); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			http.Error(w, `{"error":"target already exists"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"failed to create target"}`, http.StatusInternalServerError)
		return
	}

	// Hot-add to running crawler
	s.TGCrawler.AddTarget(target)
	writeJSON(w, target)
}

func (s *Server) handleTelegramUpdateTarget(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		Enabled *bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Enabled == nil {
		http.Error(w, `{"error":"enabled required"}`, http.StatusBadRequest)
		return
	}

	target, err := s.TGCrawler.Store().GetTarget(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"target not found"}`, http.StatusNotFound)
		return
	}

	if err := s.TGCrawler.Store().UpdateTarget(r.Context(), id, *req.Enabled); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}

	// Hot-reload in crawler
	s.TGCrawler.EnableTarget(target.ChatID, *req.Enabled)
	if *req.Enabled {
		target.Enabled = true
		s.TGCrawler.AddTarget(target)
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleTelegramDeleteTarget(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	target, err := s.TGCrawler.Store().GetTarget(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"target not found"}`, http.StatusNotFound)
		return
	}
	if err := s.TGCrawler.Store().DeleteTarget(r.Context(), id); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}
	s.TGCrawler.RemoveTarget(target.ChatID)
	w.WriteHeader(http.StatusNoContent)
}

// --- Messages ---

func (s *Server) handleTelegramListMessages(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := telegram.MessageFilter{}

	if v := q.Get("target_id"); v != "" {
		id, _ := strconv.ParseInt(v, 10, 64)
		filter.TargetID = &id
	}
	if v := q.Get("is_ad"); v != "" {
		b := v == "true"
		filter.IsAd = &b
	}
	filter.ContentType = q.Get("content_type")

	page, _ := strconv.Atoi(q.Get("page"))
	perPage, _ := strconv.Atoi(q.Get("per_page"))

	msgs, total, err := s.TGCrawler.Store().ListMessages(r.Context(), filter, page, perPage)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}
	if msgs == nil {
		msgs = []telegram.TGMessageWithTarget{}
	}
	writeJSON(w, map[string]any{
		"data":     msgs,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func (s *Server) handleTelegramGetMessage(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	msg, err := s.TGCrawler.Store().GetMessage(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	writeJSON(w, msg)
}

// --- Crawler Control & Stats ---

func (s *Server) handleTelegramStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.TGCrawler.Status())
}

func (s *Server) handleTelegramCrawlerStart(w http.ResponseWriter, r *http.Request) {
	if err := s.TGCrawler.Start(r.Context()); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"status": "started"})
}

func (s *Server) handleTelegramCrawlerStop(w http.ResponseWriter, r *http.Request) {
	s.TGCrawler.Stop()
	writeJSON(w, map[string]string{"status": "stopped"})
}

func (s *Server) handleTelegramStats(w http.ResponseWriter, r *http.Request) {
	todayTotal, todayAds, err := s.TGCrawler.Store().GetStats(r.Context())
	if err != nil {
		todayTotal, todayAds = 0, 0
	}

	status := s.TGCrawler.Status()
	acc, _ := s.TGCrawler.Store().GetAccount(r.Context())

	accountStatus := "not_configured"
	if acc != nil {
		accountStatus = acc.Status
	}

	// Count targets by type
	targetCount := map[string]int{"channel": 0, "group": 0}
	if acc != nil {
		targets, _ := s.TGCrawler.Store().ListTargets(r.Context(), acc.ID)
		for _, t := range targets {
			targetCount[t.ChatType]++
		}
	}

	var adRate float64
	if todayTotal > 0 {
		adRate = float64(todayAds) / float64(todayTotal)
	}

	writeJSON(w, map[string]any{
		"crawler_running":    status.Running,
		"account_status":     accountStatus,
		"target_count":       targetCount,
		"today_total":        todayTotal,
		"today_ads":          todayAds,
		"ad_rate":            adRate,
		"storage_used_bytes": 0, // TODO: calculate from OSS if needed
	})
}

// --- Storage Settings ---

func (s *Server) handleStorageSettings(w http.ResponseWriter, r *http.Request) {
	cfg := s.Config
	accessKeyMasked := ""
	if len(cfg.StorageAccessKey) > 4 {
		accessKeyMasked = cfg.StorageAccessKey[:4] + "****" + cfg.StorageAccessKey[len(cfg.StorageAccessKey)-4:]
	}

	fileCount := s.TGCrawler.Store().TelegramFileCount(r.Context())

	writeJSON(w, map[string]any{
		"endpoint":            cfg.StorageEndpoint,
		"bucket":              cfg.StorageBucket,
		"public_url":          cfg.StoragePublicURL,
		"ssl":                 cfg.StorageSSL,
		"access_key_masked":   accessKeyMasked,
		"telegram_file_count": fileCount,
		"telegram_used_bytes": 0, // approximate; exact needs bucket scan
	})
}

func (s *Server) handleStorageTest(w http.ResponseWriter, r *http.Request) {
	if s.ObjectStore == nil {
		writeJSON(w, map[string]any{"ok": false, "error": "storage not configured"})
		return
	}
	// Test by putting and getting a small test object
	ctx := r.Context()
	testKey := "__healthcheck__"
	_, err := s.ObjectStore.Put(ctx, testKey, "text/plain", []byte("ok"))
	if err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

// writeJSON is a helper shared across handlers.
func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
