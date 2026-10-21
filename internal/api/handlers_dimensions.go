package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"llmrank/internal/store"
)

type dimensionResponse struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Weight      int     `json:"weight"`
	ArchivedAt  *string `json:"archivedAt"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

type bootstrapResponse struct {
	Authenticated bool                `json:"authenticated"`
	Dimensions    []dimensionResponse `json:"dimensions"`
	Counts        countsResponse      `json:"counts"`
	TotalWeight   int                 `json:"totalWeight"`
	Now           string              `json:"now"`
}

type countsResponse struct {
	Models       int `json:"models"`
	ScoredModels int `json:"scoredModels"`
	Dimensions   int `json:"dimensions"`
}

func toDimensionResponse(d store.Dimension) dimensionResponse {
	var archived *string
	if d.ArchivedAt != nil {
		value := d.ArchivedAt.UTC().Format(time.RFC3339)
		archived = &value
	}
	return dimensionResponse{
		ID:          d.ID,
		Name:        d.Name,
		Description: d.Description,
		Weight:      d.Weight,
		ArchivedAt:  archived,
		CreatedAt:   d.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:   d.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func (s *Server) handleListDimensions(w http.ResponseWriter, r *http.Request) {
	includeArchived := r.URL.Query().Get("includeArchived") == "1"
	if includeArchived && !s.auth.Authenticated(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "请先登录")
		return
	}
	dims, err := s.store.ListDimensions(r.Context(), includeArchived)
	if err != nil {
		s.internalError(w, err)
		return
	}
	out := make([]dimensionResponse, 0, len(dims))
	for _, d := range dims {
		out = append(out, toDimensionResponse(d))
	}
	writeJSON(w, http.StatusOK, map[string]any{"dimensions": out})
}

type dimensionInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Weight      int    `json:"weight"`
}

type dimensionPatch struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Weight      *int    `json:"weight"`
}

func validateDimension(name, description string, weight int) map[string]string {
	fields := map[string]string{}
	if length := utf8.RuneCountInString(name); length < 1 || length > 40 {
		fields["name"] = "名称需为 1–40 个字符"
	}
	if utf8.RuneCountInString(description) > 500 {
		fields["description"] = "说明不能超过 500 个字符"
	}
	if weight < 0 || weight > 100 {
		fields["weight"] = "权重需为 0–100 的整数"
	}
	if len(fields) == 0 {
		return nil
	}
	return fields
}

func (s *Server) handleCreateDimension(w http.ResponseWriter, r *http.Request) {
	var input dimensionInput
	if !s.readJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if fields := validateDimension(input.Name, input.Description, input.Weight); fields != nil {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "请检查维度信息", fields)
		return
	}
	d, err := s.store.CreateDimension(r.Context(), input.Name, input.Description, input.Weight)
	if err != nil {
		if errors.Is(err, store.ErrConflict) {
			writeFields(w, http.StatusConflict, "conflict", "维度名称已存在", map[string]string{"name": "维度名称已存在"})
			return
		}
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toDimensionResponse(d))
}

func (s *Server) handleUpdateDimension(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	var patch dimensionPatch
	if !s.readJSON(w, r, &patch) {
		return
	}
	if patch.Name == nil && patch.Description == nil && patch.Weight == nil {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "没有需要更新的字段", map[string]string{"_": "没有需要更新的字段"})
		return
	}
	current, err := s.store.DimensionByID(r.Context(), id)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	name, description, weight := current.Name, current.Description, current.Weight
	if patch.Name != nil {
		name = strings.TrimSpace(*patch.Name)
	}
	if patch.Description != nil {
		description = *patch.Description
	}
	if patch.Weight != nil {
		weight = *patch.Weight
	}
	if fields := validateDimension(name, description, weight); fields != nil {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "请检查维度信息", fields)
		return
	}
	updated, err := s.store.UpdateDimension(r.Context(), id, name, description, weight)
	if err != nil {
		if errors.Is(err, store.ErrConflict) {
			writeFields(w, http.StatusConflict, "conflict", "维度名称已存在", map[string]string{"name": "维度名称已存在"})
			return
		}
		s.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDimensionResponse(updated))
}

func (s *Server) handleArchiveDimension(w http.ResponseWriter, r *http.Request) {
	s.setDimensionArchived(w, r, true)
}

func (s *Server) handleRestoreDimension(w http.ResponseWriter, r *http.Request) {
	s.setDimensionArchived(w, r, false)
}

func (s *Server) setDimensionArchived(w http.ResponseWriter, r *http.Request, archived bool) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	d, err := s.store.SetDimensionArchived(r.Context(), id, archived)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDimensionResponse(d))
}

func (s *Server) handleDeleteDimension(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	if err := s.store.DeleteDimension(r.Context(), id); err != nil {
		s.writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseID(w http.ResponseWriter, r *http.Request, name string) (int64, bool) {
	raw := r.PathValue(name)
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "malformed", "路径参数不正确")
		return 0, false
	}
	return id, true
}

func (s *Server) writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "对象不存在")
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, "conflict", "对象已存在")
	case errors.Is(err, store.ErrArchived):
		writeFields(w, http.StatusUnprocessableEntity, "validation", "维度已归档", map[string]string{"dimensionId": "维度已归档"})
	case errors.Is(err, store.ErrInvalid):
		writeFields(w, http.StatusUnprocessableEntity, "validation", "评分不合法", map[string]string{"value": "评分需为有限且不小于 0 的数"})
	default:
		s.internalError(w, err)
	}
}
