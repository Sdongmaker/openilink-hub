package api

import (
	"encoding/json"
	"net/http"
	"strings"
)

// Supported OAuth provider names for validation.
var knownOAuthProviders = map[string]bool{
	"github": true, "linuxdo": true,
}

// GET /api/admin/config/oauth — get OAuth config (secrets masked)
func (s *Server) handleGetOAuthConfig(w http.ResponseWriter, r *http.Request) {
	dbConf, err := s.DB.ListConfigByPrefix("oauth.")
	if err != nil {
		jsonError(w, "query failed", http.StatusInternalServerError)
		return
	}

	type providerConfig struct {
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
		Enabled      bool   `json:"enabled"`
		Source       string `json:"source"` // "db" or "env"
	}

	result := map[string]*providerConfig{}
	for name := range oauthProviderDefs {
		pc := &providerConfig{}

		// Check DB first
		if id := dbConf["oauth."+name+".client_id"]; id != "" {
			pc.ClientID = id
			pc.ClientSecret = maskSecret(dbConf["oauth."+name+".client_secret"])
			pc.Enabled = true
			pc.Source = "db"
		} else {
			// Check env fallback
			var envID, envSecret string
			switch name {
			case "github":
				envID = s.Config.GitHubClientID
				envSecret = s.Config.GitHubClientSecret
			case "linuxdo":
				envID = s.Config.LinuxDoClientID
				envSecret = s.Config.LinuxDoClientSecret
			}
			if envID != "" {
				pc.ClientID = envID
				pc.ClientSecret = maskSecret(envSecret)
				pc.Enabled = true
				pc.Source = "env"
			}
		}

		result[name] = pc
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// PUT /api/admin/config/oauth/{provider} — set OAuth config for a provider
func (s *Server) handleSetOAuthConfig(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("provider")
	if !knownOAuthProviders[name] {
		jsonError(w, "unknown provider", http.StatusBadRequest)
		return
	}

	var req struct {
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	if req.ClientID == "" {
		jsonError(w, "client_id required", http.StatusBadRequest)
		return
	}

	if err := s.DB.SetConfig("oauth."+name+".client_id", req.ClientID); err != nil {
		jsonError(w, "save failed", http.StatusInternalServerError)
		return
	}
	if req.ClientSecret != "" {
		if err := s.DB.SetConfig("oauth."+name+".client_secret", req.ClientSecret); err != nil {
			jsonError(w, "save failed", http.StatusInternalServerError)
			return
		}
	}
	jsonOK(w)
}

// DELETE /api/admin/config/oauth/{provider} — remove OAuth config (revert to env)
func (s *Server) handleDeleteOAuthConfig(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("provider")
	if !knownOAuthProviders[name] {
		jsonError(w, "unknown provider", http.StatusBadRequest)
		return
	}

	s.DB.DeleteConfig("oauth." + name + ".client_id")
	s.DB.DeleteConfig("oauth." + name + ".client_secret")
	jsonOK(w)
}

func maskSecret(s string) string {
	if len(s) <= 8 {
		return strings.Repeat("*", len(s))
	}
	return s[:4] + strings.Repeat("*", len(s)-8) + s[len(s)-4:]
}
