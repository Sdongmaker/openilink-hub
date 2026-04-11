package api

import (
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/openilink/openilink-hub/internal/auth"
	"github.com/openilink/openilink-hub/internal/store"
)

const (
	passwordLoginWindow    = 10 * time.Minute
	passwordLoginBlockTime = 15 * time.Minute
	passwordLoginMaxFails  = 5
)

type loginAttemptState struct {
	Count        int
	WindowStart  time.Time
	BlockedUntil time.Time
}

var (
	loginAttemptMu sync.Mutex
	loginAttempts  = map[string]loginAttemptState{}
)

// --- Password auth ---

func (s *Server) handlePasswordRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username    string `json:"username"`
		Password    string `json:"password"`
		Email       string `json:"email"`
		DisplayName string `json:"display_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Username == "" || req.Password == "" {
		jsonError(w, "username and password required", http.StatusBadRequest)
		return
	}
	if err := store.ValidateUsername(req.Username); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if len(req.Password) < 8 {
		jsonError(w, "password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	// First user becomes admin; also check registration gate
	count, _ := s.Store.UserCount()
	if count > 0 && !s.registrationEnabled() {
		jsonError(w, "registration is disabled", http.StatusForbidden)
		return
	}

	// Check if username taken
	if _, err := s.Store.GetUserByUsername(req.Username); err == nil {
		jsonError(w, "username already taken", http.StatusConflict)
		return
	}

	displayName := req.DisplayName
	if displayName == "" {
		displayName = req.Username
	}

	role := store.RoleMember
	if count == 0 {
		role = store.RoleSuperAdmin
	}

	hash := auth.HashPassword(req.Password)
	user, err := s.Store.CreateUserFull(req.Username, req.Email, displayName, hash, role)
	if err != nil {
		jsonError(w, "create user failed", http.StatusInternalServerError)
		return
	}

	token, _ := auth.CreateSession(s.Store, user.ID)
	setSessionCookie(w, token)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ok": true, "user": user})
}

func (s *Server) handlePasswordLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" || req.Password == "" {
		jsonError(w, "username and password required", http.StatusBadRequest)
		return
	}

	if retryAfter, limited := checkPasswordLoginLimit(passwordLoginKey(r, req.Username)); limited {
		w.Header().Set("Retry-After", retryAfter)
		jsonError(w, "too many login attempts, please try again later", http.StatusTooManyRequests)
		return
	}

	user, err := s.Store.GetUserByUsername(req.Username)
	if err != nil {
		recordPasswordLoginFailure(passwordLoginKey(r, req.Username))
		jsonError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if user.Status != store.StatusActive {
		jsonError(w, "account disabled", http.StatusForbidden)
		return
	}
	if user.PasswordHash == "" || !auth.CheckPassword(req.Password, user.PasswordHash) {
		recordPasswordLoginFailure(passwordLoginKey(r, req.Username))
		jsonError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	clearPasswordLoginFailures(passwordLoginKey(r, req.Username))

	token, _ := auth.CreateSession(s.Store, user.ID)
	setSessionCookie(w, token)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ok": true, "user": user})
}

func passwordLoginKey(r *http.Request, username string) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return strings.ToLower(strings.TrimSpace(username)) + "|" + host
}

func checkPasswordLoginLimit(key string) (string, bool) {
	loginAttemptMu.Lock()
	defer loginAttemptMu.Unlock()

	state, ok := loginAttempts[key]
	if !ok {
		return "", false
	}
	if !state.BlockedUntil.IsZero() {
		if time.Now().Before(state.BlockedUntil) {
			return fmtRetryAfter(state.BlockedUntil.Sub(time.Now())), true
		}
		delete(loginAttempts, key)
	}
	return "", false
}

func recordPasswordLoginFailure(key string) {
	loginAttemptMu.Lock()
	defer loginAttemptMu.Unlock()

	now := time.Now()
	state := loginAttempts[key]
	if state.WindowStart.IsZero() || now.Sub(state.WindowStart) > passwordLoginWindow {
		state = loginAttemptState{WindowStart: now}
	}
	state.Count++
	if state.Count >= passwordLoginMaxFails {
		state.BlockedUntil = now.Add(passwordLoginBlockTime)
	}
	loginAttempts[key] = state
}

func clearPasswordLoginFailures(key string) {
	loginAttemptMu.Lock()
	defer loginAttemptMu.Unlock()
	delete(loginAttempts, key)
}

func fmtRetryAfter(d time.Duration) string {
	seconds := int(d.Seconds())
	if seconds < 1 {
		seconds = 1
	}
	return strconv.Itoa(seconds)
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.NewPassword == "" {
		jsonError(w, "new_password required", http.StatusBadRequest)
		return
	}
	if len(req.NewPassword) < 8 {
		jsonError(w, "password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	user, err := s.Store.GetUserByID(userID)
	if err != nil {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	// If user already has a password, verify old password
	if user.PasswordHash != "" {
		if req.OldPassword == "" || !auth.CheckPassword(req.OldPassword, user.PasswordHash) {
			jsonError(w, "old password incorrect", http.StatusUnauthorized)
			return
		}
	}

	hash := auth.HashPassword(req.NewPassword)
	if err := s.Store.UpdateUserPassword(userID, hash); err != nil {
		jsonError(w, "update failed", http.StatusInternalServerError)
		return
	}
	jsonOK(w)
}
