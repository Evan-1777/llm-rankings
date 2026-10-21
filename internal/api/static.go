package api

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

const indexHTML = "index.html"

type staticHandler struct {
	root  fs.FS
	index []byte
}

func newStaticHandler(dist fs.FS) http.Handler {
	if dist == nil {
		return &staticHandler{}
	}
	root, err := fs.Sub(dist, "dist")
	if err != nil {
		return &staticHandler{}
	}
	index, err := fs.ReadFile(root, indexHTML)
	if err != nil {
		index = nil
	}
	return &staticHandler{root: root, index: index}
}

func (h *staticHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.root == nil || h.index == nil {
		http.Error(w, "前端资源尚未构建", http.StatusServiceUnavailable)
		return
	}

	name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if name == "" || name == "." {
		name = indexHTML
	}
	if name != indexHTML {
		if info, err := fs.Stat(h.root, name); err == nil && !info.IsDir() {
			if strings.HasPrefix(name, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				w.Header().Set("Cache-Control", "public, max-age=86400")
			}
			http.ServeFileFS(w, r, h.root, name)
			return
		}
		// Missing assets must stay 404 instead of falling back to the SPA.
		if strings.HasPrefix(name, "assets/") || path.Ext(name) != "" {
			http.NotFound(w, r)
			return
		}
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write(h.index)
	}
}
