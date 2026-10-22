package api

import "net/http"

type displaySettingsResponse struct {
	ScorePercentageMode bool `json:"scorePercentageMode"`
}

type displaySettingsInput struct {
	ScorePercentageMode *bool `json:"scorePercentageMode"`
}

func (s *Server) handleGetDisplaySettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	enabled, err := s.store.DisplaySettings(r.Context())
	if err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, displaySettingsResponse{ScorePercentageMode: enabled})
}

func (s *Server) handlePutDisplaySettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var input displaySettingsInput
	if !s.readJSON(w, r, &input) {
		return
	}
	if input.ScorePercentageMode == nil {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "请检查显示设置", map[string]string{
			"scorePercentageMode": "请提供百分比模式设置",
		})
		return
	}
	if err := s.store.UpdateDisplaySettings(r.Context(), *input.ScorePercentageMode); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, displaySettingsResponse{ScorePercentageMode: *input.ScorePercentageMode})
}
