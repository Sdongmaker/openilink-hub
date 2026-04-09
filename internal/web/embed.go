package web

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

// Handler returns an http.Handler that serves the embedded frontend.
// Falls back to index.html for SPA routing.
// If dist/ doesn't exist (dev mode), returns nil.
func Handler() http.Handler {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		return nil
	}

	if !hasVisibleEntries(sub) {
		return nil
	}

	return newEmbeddedHandler(sub)
}

func hasVisibleEntries(sub fs.FS) bool {
	// Ignore placeholder files used only to satisfy go:embed during backend-only test runs.
	entries, _ := fs.ReadDir(sub, ".")
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), ".") && entry.Name() != "placeholder.txt" {
			return true
		}
	}
	return false
}

func newEmbeddedHandler(sub fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		servePath := r.URL.Path
		if path == "" {
			servePath = "/"
		} else if _, err := fs.Stat(sub, path); err != nil {
			servePath = "/"
		}

		req := r.Clone(r.Context())
		req.URL.Path = servePath
		fileServer.ServeHTTP(w, req)
	})
}

// DevDistExists checks if a local dist/ directory exists (for dev builds).
func DevDistExists() bool {
	info, err := os.Stat("dist")
	return err == nil && info.IsDir()
}
