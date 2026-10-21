package api

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
)

type errorEnvelope struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorEnvelope{Error: errorDetail{Code: code, Message: message}})
}

func writeFields(w http.ResponseWriter, status int, code, message string, fields map[string]string) {
	writeJSON(w, status, errorEnvelope{Error: errorDetail{Code: code, Message: message, Fields: fields}})
}

// readJSON decodes one JSON object, rejecting unknown fields and oversized bodies.
func (s *Server) readJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	contentType := r.Header.Get("Content-Type")
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil || mediaType != "application/json" {
		writeError(w, http.StatusBadRequest, "malformed", "请求体必须为 JSON")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "malformed", "请求体格式不正确")
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "malformed", "请求体只能包含一个 JSON 对象")
		return false
	}
	return true
}

func (s *Server) internalError(w http.ResponseWriter, err error) {
	s.log.Error("internal error", "error", err)
	writeError(w, http.StatusInternalServerError, "internal", "服务器内部错误")
}
