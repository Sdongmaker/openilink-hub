package web

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestHasVisibleEntriesIgnoresPlaceholder(t *testing.T) {
	t.Run("placeholder only", func(t *testing.T) {
		files := fstest.MapFS{
			"placeholder.txt": &fstest.MapFile{Data: []byte("placeholder")},
		}
		if hasVisibleEntries(files) {
			t.Fatal("expected placeholder-only fs to be treated as empty")
		}
	})

	t.Run("real frontend files", func(t *testing.T) {
		files := fstest.MapFS{
			"index.html": &fstest.MapFile{Data: []byte("<html>ok</html>")},
		}
		if !hasVisibleEntries(files) {
			t.Fatal("expected index.html to be treated as visible content")
		}
	})
}

func TestEmbeddedHandlerServesIndexAndSPA(t *testing.T) {
	frontend := fstest.MapFS{
		"index.html":     &fstest.MapFile{Data: []byte("<html>spa</html>")},
		"assets/app.js":  &fstest.MapFile{Data: []byte("console.log('ok')")},
		"favicon.svg":    &fstest.MapFile{Data: []byte("<svg></svg>")},
	}

	h := newEmbeddedHandler(fs.FS(frontend))

	t.Run("root serves index", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		resp := httptest.NewRecorder()
		h.ServeHTTP(resp, req)

		if resp.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", resp.Code, http.StatusOK)
		}
		if !strings.Contains(resp.Body.String(), "spa") {
			t.Fatalf("body = %q, want index content", resp.Body.String())
		}
	})

	t.Run("asset path serves asset", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/assets/app.js", nil)
		resp := httptest.NewRecorder()
		h.ServeHTTP(resp, req)

		if resp.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", resp.Code, http.StatusOK)
		}
		if !strings.Contains(resp.Body.String(), "console.log") {
			t.Fatalf("body = %q, want asset content", resp.Body.String())
		}
	})

	t.Run("spa route falls back to index", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/bots/123", nil)
		resp := httptest.NewRecorder()
		h.ServeHTTP(resp, req)

		if resp.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", resp.Code, http.StatusOK)
		}
		if !strings.Contains(resp.Body.String(), "spa") {
			t.Fatalf("body = %q, want index content", resp.Body.String())
		}
	})
}