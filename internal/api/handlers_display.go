package api

import (
	"net/http"

	"llmrank/internal/store"
)

type displaySettingsResponse struct {
	ScorePercentageMode    bool `json:"scorePercentageMode"`
	ScorePercentageMaxMode bool `json:"scorePercentageMaxMode"`
	MaintenanceMode        bool `json:"maintenanceMode"`
}

type displaySettingsInput struct {
	ScorePercentageMode    *bool `json:"scorePercentageMode"`
	ScorePercentageMaxMode *bool `json:"scorePercentageMaxMode"`
	MaintenanceMode        *bool `json:"maintenanceMode"`
}

func toDisplaySettingsResponse(settings store.DisplaySettings) displaySettingsResponse {
	return displaySettingsResponse{
		ScorePercentageMode:    settings.ScorePercentageMode,
		ScorePercentageMaxMode: settings.ScorePercentageMaxMode,
		MaintenanceMode:        settings.MaintenanceMode,
	}
}

func (s *Server) handleGetDisplaySettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	settings, err := s.store.DisplaySettings(r.Context())
	if err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDisplaySettingsResponse(settings))
}

func (s *Server) handlePutDisplaySettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var input displaySettingsInput
	if !s.readJSON(w, r, &input) {
		return
	}
	fields := map[string]string{}
	if input.ScorePercentageMode == nil {
		fields["scorePercentageMode"] = "请提供百分比模式设置"
	}
	if input.ScorePercentageMaxMode == nil {
		fields["scorePercentageMaxMode"] = "请提供最高分占比设置"
	}
	if input.MaintenanceMode == nil {
		fields["maintenanceMode"] = "请提供维护模式设置"
	}
	if len(fields) > 0 {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "请检查显示设置", fields)
		return
	}
	settings := store.DisplaySettings{
		ScorePercentageMode:    *input.ScorePercentageMode,
		ScorePercentageMaxMode: *input.ScorePercentageMaxMode,
		MaintenanceMode:        *input.MaintenanceMode,
	}
	if err := s.store.UpdateDisplaySettings(r.Context(), settings); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDisplaySettingsResponse(settings))
}
