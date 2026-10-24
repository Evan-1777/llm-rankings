package api

import (
	"net/http"
	"unicode/utf8"

	"llmrank/internal/store"
)

// rankingNotesLimit bounds the public notes payload; it is measured in Unicode code points.
const rankingNotesLimit = 20000

type displaySettingsResponse struct {
	ScorePercentageMode    bool   `json:"scorePercentageMode"`
	ScorePercentageMaxMode bool   `json:"scorePercentageMaxMode"`
	MaintenanceMode        bool   `json:"maintenanceMode"`
	RankingNotes           string `json:"rankingNotes"`
}

type displaySettingsInput struct {
	ScorePercentageMode    *bool   `json:"scorePercentageMode"`
	ScorePercentageMaxMode *bool   `json:"scorePercentageMaxMode"`
	MaintenanceMode        *bool   `json:"maintenanceMode"`
	RankingNotes           *string `json:"rankingNotes"`
}

func toDisplaySettingsResponse(settings store.DisplaySettings) displaySettingsResponse {
	return displaySettingsResponse{
		ScorePercentageMode:    settings.ScorePercentageMode,
		ScorePercentageMaxMode: settings.ScorePercentageMaxMode,
		MaintenanceMode:        settings.MaintenanceMode,
		RankingNotes:           settings.RankingNotes,
	}
}

func (s *Server) handleGetDisplaySettings(w http.ResponseWriter, r *http.Request) {
	settings, err := s.store.DisplaySettings(r.Context())
	if err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDisplaySettingsResponse(settings))
}

func (s *Server) handlePutDisplaySettings(w http.ResponseWriter, r *http.Request) {
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
	if input.RankingNotes == nil {
		fields["rankingNotes"] = "请提供排行榜备注"
	} else if utf8.RuneCountInString(*input.RankingNotes) > rankingNotesLimit {
		fields["rankingNotes"] = "排行榜备注不能超过 20000 个字符"
	}
	if len(fields) > 0 {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "请检查显示设置", fields)
		return
	}
	settings := store.DisplaySettings{
		ScorePercentageMode:    *input.ScorePercentageMode,
		ScorePercentageMaxMode: *input.ScorePercentageMaxMode,
		MaintenanceMode:        *input.MaintenanceMode,
		RankingNotes:           *input.RankingNotes,
	}
	if err := s.store.UpdateDisplaySettings(r.Context(), settings); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDisplaySettingsResponse(settings))
}
