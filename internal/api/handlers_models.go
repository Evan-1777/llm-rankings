package api

import (
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"llmrank/internal/domain"
	"llmrank/internal/store"
)

type modelResponse struct {
	Slug       string  `json:"slug"`
	Name       string  `json:"name"`
	Vendor     string  `json:"vendor"`
	Notes      string  `json:"notes"`
	Hidden     bool    `json:"hidden"`
	ArchivedAt *string `json:"archivedAt"`
	CreatedAt  string  `json:"createdAt"`
	UpdatedAt  string  `json:"updatedAt"`
}

type modelListItem struct {
	Slug             string  `json:"slug"`
	Name             string  `json:"name"`
	Vendor           string  `json:"vendor"`
	Notes            *string `json:"notes,omitempty"`
	Hidden           bool    `json:"hidden"`
	ArchivedAt       *string `json:"archivedAt"`
	ScoreCount       int     `json:"scoreCount"`
	ScoredDimensions int     `json:"scoredDimensions"`
	UpdatedAt        string  `json:"updatedAt"`
}

type modelDetailResponse struct {
	Slug           string           `json:"slug"`
	Name           string           `json:"name"`
	Vendor         string           `json:"vendor"`
	Notes          *string          `json:"notes,omitempty"`
	Hidden         bool             `json:"hidden"`
	Score          *float64         `json:"score"`
	Coverage       float64          `json:"coverage"`
	Provisional    bool             `json:"provisional"`
	Rank           *int             `json:"rank"`
	Dimensions     []modelDimension `json:"dimensions"`
	ScoredCount    int              `json:"scoredCount"`
	DimensionCount int              `json:"dimensionCount"`
	UpdatedAt      string           `json:"updatedAt"`
}

type modelDimension struct {
	ID       int64    `json:"id"`
	Name     string   `json:"name"`
	Weight   int      `json:"weight"`
	TextMode bool     `json:"textMode"`
	Value    *float64 `json:"value"`
	Text     *string  `json:"text,omitempty"`
	Note     *string  `json:"note,omitempty"`
}

func stampString(t *time.Time) *string {
	if t == nil {
		return nil
	}
	value := t.UTC().Format(time.RFC3339)
	return &value
}

func toModelResponse(m store.Model) modelResponse {
	return modelResponse{
		Slug:       m.Slug,
		Name:       m.Name,
		Vendor:     m.Vendor,
		Notes:      m.Notes,
		Hidden:     m.Hidden,
		ArchivedAt: stampString(m.ArchivedAt),
		CreatedAt:  m.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:  m.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func (s *Server) handleListModels(w http.ResponseWriter, r *http.Request) {
	includeArchived := r.URL.Query().Get("includeArchived") == "1"
	if includeArchived && !s.auth.Authenticated(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "请先登录")
		return
	}
	models, err := s.store.ListModels(r.Context(), includeArchived)
	if err != nil {
		s.internalError(w, err)
		return
	}
	admin := s.auth.Authenticated(r)
	out := make([]modelListItem, 0, len(models))
	for _, m := range models {
		item := modelListItem{
			Slug:             m.Slug,
			Name:             m.Name,
			Vendor:           m.Vendor,
			Hidden:           m.Hidden,
			ArchivedAt:       stampString(m.ArchivedAt),
			ScoreCount:       m.ScoreCount,
			ScoredDimensions: m.ScoredDimensions,
			UpdatedAt:        m.UpdatedAt.UTC().Format(time.RFC3339),
		}
		if admin {
			notes := m.Notes
			item.Notes = &notes
		}
		out = append(out, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": out})
}

type modelCreateInput struct {
	Name   string `json:"name"`
	Slug   string `json:"slug"`
	Vendor string `json:"vendor"`
	Notes  string `json:"notes"`
}

type modelPatch struct {
	Name   *string `json:"name"`
	Vendor *string `json:"vendor"`
	Notes  *string `json:"notes"`
	Hidden *bool   `json:"hidden"`
}

func validateModel(name, slug, vendor, notes string) map[string]string {
	fields := map[string]string{}
	if length := utf8.RuneCountInString(name); length < 1 || length > 80 {
		fields["name"] = "名称需为 1–80 个字符"
	}
	if slug != "" && !validSlug(slug) {
		fields["slug"] = "slug 只能包含小写字母、数字与连字符，且不能以连字符开头或结尾"
	}
	if length := utf8.RuneCountInString(vendor); length > 80 {
		fields["vendor"] = "厂商不能超过 80 个字符"
	}
	if utf8.RuneCountInString(notes) > 2000 {
		fields["notes"] = "备注不能超过 2000 个字符"
	}
	if len(fields) == 0 {
		return nil
	}
	return fields
}

func validSlug(slug string) bool {
	if len(slug) < 1 || len(slug) > 64 {
		return false
	}
	previousHyphen := true
	for _, r := range slug {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			previousHyphen = false
		case r == '-':
			if previousHyphen {
				return false
			}
			previousHyphen = true
		default:
			return false
		}
	}
	return !previousHyphen
}

func (s *Server) handleCreateModel(w http.ResponseWriter, r *http.Request) {
	var input modelCreateInput
	if !s.readJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Slug = strings.ToLower(strings.TrimSpace(input.Slug))
	input.Vendor = strings.TrimSpace(input.Vendor)
	fields := validateModel(input.Name, input.Slug, input.Vendor, input.Notes)
	if input.Slug == "" {
		if fields == nil {
			fields = map[string]string{}
		}
		fields["slug"] = "请填写 slug"
	}
	if fields != nil {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "请检查模型信息", fields)
		return
	}
	m, err := s.store.CreateModel(r.Context(), input.Slug, input.Name, input.Vendor, input.Notes)
	if err != nil {
		if errors.Is(err, store.ErrConflict) {
			writeFields(w, http.StatusConflict, "conflict", "slug 已存在", map[string]string{"slug": "slug 已存在"})
			return
		}
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toModelResponse(m))
}

func (s *Server) handleUpdateModel(w http.ResponseWriter, r *http.Request) {
	current, err := s.store.ModelBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	if current.ArchivedAt != nil {
		writeError(w, http.StatusNotFound, "not_found", "对象不存在")
		return
	}
	var patch modelPatch
	if !s.readJSON(w, r, &patch) {
		return
	}
	if patch.Name == nil && patch.Vendor == nil && patch.Notes == nil && patch.Hidden == nil {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "没有需要更新的字段", map[string]string{"_": "没有需要更新的字段"})
		return
	}
	name, vendor, notes := current.Name, current.Vendor, current.Notes
	if patch.Name != nil {
		name = strings.TrimSpace(*patch.Name)
	}
	if patch.Vendor != nil {
		vendor = strings.TrimSpace(*patch.Vendor)
	}
	if patch.Notes != nil {
		notes = *patch.Notes
	}
	if fields := validateModel(name, current.Slug, vendor, notes); fields != nil {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "请检查模型信息", fields)
		return
	}
	updated := current
	if patch.Name != nil || patch.Vendor != nil || patch.Notes != nil {
		updated, err = s.store.UpdateModel(r.Context(), current.ID, name, vendor, notes)
		if err != nil {
			s.writeStoreError(w, err)
			return
		}
	}
	if patch.Hidden != nil {
		updated, err = s.store.SetModelHidden(r.Context(), current.ID, *patch.Hidden)
		if err != nil {
			s.writeStoreError(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, toModelResponse(updated))
}

func (s *Server) handleGetModel(w http.ResponseWriter, r *http.Request) {
	model, err := s.store.ModelBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	if model.ArchivedAt != nil {
		writeError(w, http.StatusNotFound, "not_found", "对象不存在")
		return
	}
	snapshot, err := s.loadRanking(r.Context())
	if err != nil {
		s.internalError(w, err)
		return
	}
	admin := s.auth.Authenticated(r)
	scores, err := s.store.ScoresForModel(r.Context(), model.ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	notesByDimension := make(map[int64]string, len(scores))
	for _, sc := range scores {
		notesByDimension[sc.DimensionID] = sc.Note
	}
	texts, err := s.store.TextsForModel(r.Context(), model.ID)
	if err != nil {
		s.internalError(w, err)
		return
	}

	var row *domain.Row
	for i := range snapshot.result.Rows {
		if snapshot.result.Rows[i].ID == model.ID {
			row = &snapshot.result.Rows[i]
			break
		}
	}
	if row == nil {
		s.internalError(w, errors.New("model missing from ranking snapshot"))
		return
	}

	dimensions := make([]modelDimension, 0, len(snapshot.dimensions))
	scoredCount := 0
	dimensionCount := 0
	for _, d := range snapshot.dimensions {
		item := modelDimension{ID: d.ID, Name: d.Name, Weight: d.Weight, TextMode: d.TextMode}
		if d.TextMode {
			text := texts[d.ID]
			item.Text = &text
			if admin {
				note := notesByDimension[d.ID]
				item.Note = &note
			}
			dimensions = append(dimensions, item)
			continue
		}
		if value, ok := row.DimensionScores[d.ID]; ok {
			v := value
			item.Value = &v
			if d.Weight > 0 {
				scoredCount++
			}
		}
		if admin {
			note := notesByDimension[d.ID]
			item.Note = &note
		}
		if d.Weight > 0 {
			dimensionCount++
		}
		dimensions = append(dimensions, item)
	}

	var rank *int
	if row.Rank > 0 {
		value := row.Rank
		rank = &value
	}
	response := modelDetailResponse{
		Slug:           model.Slug,
		Name:           model.Name,
		Vendor:         model.Vendor,
		Hidden:         model.Hidden,
		Score:          row.Score,
		Coverage:       row.Coverage,
		Provisional:    row.Provisional,
		Rank:           rank,
		Dimensions:     dimensions,
		ScoredCount:    scoredCount,
		DimensionCount: dimensionCount,
		UpdatedAt:      model.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if admin {
		notes := model.Notes
		response.Notes = &notes
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleArchiveModel(w http.ResponseWriter, r *http.Request) {
	s.setModelArchived(w, r, true)
}

func (s *Server) handleRestoreModel(w http.ResponseWriter, r *http.Request) {
	s.setModelArchived(w, r, false)
}

func (s *Server) setModelArchived(w http.ResponseWriter, r *http.Request, archived bool) {
	model, err := s.store.ModelBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	updated, err := s.store.SetModelArchived(r.Context(), model.ID, archived)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toModelResponse(updated))
}

func (s *Server) handleDeleteModel(w http.ResponseWriter, r *http.Request) {
	model, err := s.store.ModelBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	if err := s.store.DeleteModel(r.Context(), model.ID); err != nil {
		s.writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
