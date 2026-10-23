package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"

	"llmrank/internal/api"
	"llmrank/internal/auth"
	"llmrank/internal/store"

	"golang.org/x/crypto/bcrypt"
)

const testPassword = "correct horse battery"

type env struct {
	server *httptest.Server
	admin  *http.Client
	anon   *http.Client
	store  *store.Store
}

func newEnv(t *testing.T) *env {
	t.Helper()
	st, err := store.Open(t.TempDir() + "/test.db")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	hash, err := bcrypt.GenerateFromPassword([]byte(testPassword), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	manager, err := auth.New(string(hash), strings.Repeat("s", 32), false)
	if err != nil {
		t.Fatal(err)
	}
	assets := fstest.MapFS{
		"dist/index.html":        {Data: []byte("<!doctype html><title>LLM Rank</title>")},
		"dist/assets/app-abc.js": {Data: []byte("console.log(1)")},
	}
	handler := api.New(st, manager, slog.New(slog.NewTextHandler(io.Discard, nil)), assets, false)
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	jar, _ := cookiejar.New(nil)
	return &env{
		server: srv,
		admin:  &http.Client{Jar: jar},
		anon:   &http.Client{},
		store:  st,
	}
}

func (e *env) do(t *testing.T, client *http.Client, method, path string, body any, headers map[string]string) (int, []byte, http.Header) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequest(method, e.server.URL+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return resp.StatusCode, data, resp.Header
}

func (e *env) login(t *testing.T) {
	t.Helper()
	code, body, _ := e.do(t, e.admin, http.MethodPost, "/api/auth/login", map[string]string{"password": testPassword}, nil)
	if code != http.StatusOK {
		t.Fatalf("login = %d %s", code, body)
	}
}

func createDimension(t *testing.T, e *env, name string, weight int) int64 {
	t.Helper()
	code, body, _ := e.do(t, e.admin, http.MethodPost, "/api/dimensions", map[string]any{
		"name": name, "description": "", "weight": weight,
	}, nil)
	if code != http.StatusCreated {
		t.Fatalf("create dimension = %d %s", code, body)
	}
	var out struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatal(err)
	}
	return out.ID
}

func createTextDimension(t *testing.T, e *env, name string) int64 {
	t.Helper()
	code, body, _ := e.do(t, e.admin, http.MethodPost, "/api/dimensions", map[string]any{
		"name": name, "description": "", "weight": 0, "textMode": true,
	}, nil)
	if code != http.StatusCreated {
		t.Fatalf("create text dimension = %d %s", code, body)
	}
	var out struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatal(err)
	}
	return out.ID
}

func createModel(t *testing.T, e *env, slug, name string) {
	t.Helper()
	code, body, _ := e.do(t, e.admin, http.MethodPost, "/api/models", map[string]any{
		"name": name, "slug": slug, "vendor": "Vendor", "notes": "private note",
	}, nil)
	if code != http.StatusCreated {
		t.Fatalf("create model = %d %s", code, body)
	}
}

type rankingOutput struct {
	TotalWeight int     `json:"totalWeight"`
	UpdatedAt   *string `json:"updatedAt"`
	Dimensions  []struct {
		ID     int64  `json:"id"`
		Weight int    `json:"weight"`
		Name   string `json:"name"`
	} `json:"dimensions"`
	Models []struct {
		Slug        string             `json:"slug"`
		Hidden      bool               `json:"hidden"`
		Score       *float64           `json:"score"`
		Coverage    float64            `json:"coverage"`
		Provisional bool               `json:"provisional"`
		Rank        *int               `json:"rank"`
		Scores      map[string]float64 `json:"scores"`
	} `json:"models"`
}

func (e *env) rankings(t *testing.T, client *http.Client) rankingOutput {
	t.Helper()
	code, body, _ := e.do(t, client, http.MethodGet, "/api/rankings", nil, nil)
	if code != http.StatusOK {
		t.Fatalf("rankings = %d %s", code, body)
	}
	var out rankingOutput
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func TestRankingFlowAndPrivacy(t *testing.T) {
	e := newEnv(t)
	e.login(t)
	createDimension(t, e, "Reasoning", 50)
	createDimension(t, e, "Coding", 30)
	createDimension(t, e, "Writing", 20)
	createDimension(t, e, "Unused", 0)
	createModel(t, e, "gpt-5", "GPT-5")
	createModel(t, e, "unscored", "Unscored")

	dims := e.rankings(t, e.admin).Dimensions
	if len(dims) != 4 {
		t.Fatalf("zero-weight dimension must stay visible in rankings: %+v", dims)
	}
	byName := map[string]int64{}
	for _, d := range dims {
		byName[d.Name] = d.ID
	}
	scores := []struct {
		dim   int64
		value float64
		note  string
	}{
		{byName["Reasoning"], 12.5, "long context"},
		{byName["Coding"], 8, ""},
		{byName["Writing"], 0, ""},
	}
	for _, sc := range scores {
		code, body, _ := e.do(t, e.admin, http.MethodPut, "/api/models/gpt-5/scores/"+itoa(sc.dim), map[string]any{
			"value": sc.value, "note": sc.note,
		}, nil)
		if code != http.StatusOK {
			t.Fatalf("score = %d %s", code, body)
		}
	}

	anonRanking := e.rankings(t, e.anon)
	if anonRanking.TotalWeight != 100 || len(anonRanking.Models) != 2 {
		t.Fatalf("ranking summary = %+v", anonRanking)
	}
	first := anonRanking.Models[0]
	if first.Slug != "gpt-5" || first.Score == nil || math.Abs(*first.Score-8.65) > 1e-9 {
		t.Fatalf("weighted score = %+v", first)
	}
	if first.Coverage != 1 || first.Provisional || first.Rank == nil || *first.Rank != 1 {
		t.Fatalf("coverage/rank = %+v", first)
	}
	if anonRanking.UpdatedAt == nil {
		t.Fatal("updatedAt must be set when data exists")
	}
	last := anonRanking.Models[1]
	if last.Slug != "unscored" || last.Score != nil || last.Rank != nil {
		t.Fatalf("unscored row = %+v", last)
	}

	code, publicDetail, _ := e.do(t, e.anon, http.MethodGet, "/api/models/gpt-5", nil, nil)
	if code != http.StatusOK {
		t.Fatalf("detail = %d", code)
	}
	if strings.Contains(string(publicDetail), `"notes"`) || strings.Contains(string(publicDetail), `"note"`) {
		t.Fatalf("public detail leaked private fields: %s", publicDetail)
	}
	code, adminDetail, _ := e.do(t, e.admin, http.MethodGet, "/api/models/gpt-5", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(adminDetail), "private note") || !strings.Contains(string(adminDetail), "long context") {
		t.Fatalf("admin detail missing private data: %d %s", code, adminDetail)
	}
	code, publicModels, _ := e.do(t, e.anon, http.MethodGet, "/api/models", nil, nil)
	if code != http.StatusOK || strings.Contains(string(publicModels), "private note") {
		t.Fatalf("public model list leaked notes: %s", publicModels)
	}
}

func TestAuthWriteProtectionOriginAndLimiter(t *testing.T) {
	e := newEnv(t)
	code, _, _ := e.do(t, e.anon, http.MethodPost, "/api/dimensions", map[string]any{"name": "X", "weight": 10}, nil)
	if code != http.StatusUnauthorized {
		t.Fatalf("anonymous write = %d, want 401", code)
	}

	host := strings.TrimPrefix(e.server.URL, "http://")
	code, _, _ = e.do(t, e.anon, http.MethodPost, "/api/dimensions", map[string]any{"name": "X", "weight": 10}, map[string]string{"Origin": "https://" + host})
	if code != http.StatusUnauthorized {
		t.Fatalf("same-host origin should pass origin guard, got %d", code)
	}
	code, _, _ = e.do(t, e.anon, http.MethodPost, "/api/dimensions", map[string]any{"name": "X", "weight": 10}, map[string]string{"Origin": "https://evil.test"})
	if code != http.StatusForbidden {
		t.Fatalf("cross-host origin = %d, want 403", code)
	}
	code, _, _ = e.do(t, e.anon, http.MethodPost, "/api/dimensions", map[string]any{"name": "X", "weight": 10}, map[string]string{"Origin": "not a url"})
	if code != http.StatusForbidden {
		t.Fatalf("malformed origin = %d, want 403", code)
	}

	for i := 0; i < 5; i++ {
		code, _, _ = e.do(t, e.anon, http.MethodPost, "/api/auth/login", map[string]string{"password": "wrong"}, nil)
		if code != http.StatusUnauthorized {
			t.Fatalf("failed login %d = %d", i+1, code)
		}
	}
	code, _, header := e.do(t, e.anon, http.MethodPost, "/api/auth/login", map[string]string{"password": "wrong"}, nil)
	if code != http.StatusTooManyRequests || header.Get("Retry-After") == "" {
		t.Fatalf("rate limit = %d retry=%q", code, header.Get("Retry-After"))
	}
}

func TestValidationConflictsAndArchive(t *testing.T) {
	e := newEnv(t)
	e.login(t)
	dimID := createDimension(t, e, "Reasoning", 50)

	code, body, _ := e.do(t, e.admin, http.MethodPost, "/api/dimensions", map[string]any{"name": "Reasoning", "weight": 10}, nil)
	if code != http.StatusConflict {
		t.Fatalf("duplicate dimension = %d %s", code, body)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPost, "/api/dimensions", map[string]any{"name": "X", "weight": 101}, nil)
	if code != http.StatusUnprocessableEntity || !strings.Contains(string(body), "weight") {
		t.Fatalf("weight validation = %d %s", code, body)
	}
	code, _, _ = e.do(t, e.admin, http.MethodPost, "/api/dimensions", map[string]any{"name": "X", "weight": 10, "unknown": true}, nil)
	if code != http.StatusBadRequest {
		t.Fatalf("unknown field = %d, want 400", code)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPost, "/api/models", map[string]any{"name": "纯中文", "slug": ""}, nil)
	if code != http.StatusUnprocessableEntity || !strings.Contains(string(body), "slug") {
		t.Fatalf("empty slug = %d %s", code, body)
	}
	createModel(t, e, "model-a", "Model A")
	code, body, _ = e.do(t, e.admin, http.MethodPut, "/api/models/model-a/scores/"+itoa(dimID), map[string]any{"value": -1}, nil)
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("negative score = %d %s", code, body)
	}

	code, _, _ = e.do(t, e.admin, http.MethodPost, "/api/dimensions/"+itoa(dimID)+"/archive", nil, nil)
	if code != http.StatusOK {
		t.Fatalf("archive = %d", code)
	}
	if got := e.rankings(t, e.anon); len(got.Dimensions) != 0 {
		t.Fatalf("archived dimension leaked into rankings: %+v", got.Dimensions)
	}
	code, _, _ = e.do(t, e.anon, http.MethodGet, "/api/dimensions?includeArchived=1", nil, nil)
	if code != http.StatusUnauthorized {
		t.Fatalf("anonymous includeArchived = %d, want 401", code)
	}
	code, body, _ = e.do(t, e.admin, http.MethodGet, "/api/dimensions?includeArchived=1", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(body), "archivedAt") {
		t.Fatalf("admin archived list = %d %s", code, body)
	}

	code, _, _ = e.do(t, e.admin, http.MethodPatch, "/api/dimensions/"+itoa(dimID), map[string]any{"name": "推理", "description": "updated", "weight": 100}, nil)
	if code != http.StatusOK {
		t.Fatalf("patch = %d", code)
	}
}

func TestZeroWeightRankingAndUpdatedAt(t *testing.T) {
	e := newEnv(t)
	e.login(t)
	dimID := createDimension(t, e, "Idle", 0)
	createModel(t, e, "m", "Model")
	code, body, _ := e.do(t, e.admin, http.MethodPut, "/api/models/m/scores/"+itoa(dimID), map[string]any{"value": 9}, nil)
	if code != http.StatusOK {
		t.Fatalf("score on zero-weight dimension = %d %s", code, body)
	}
	ranking := e.rankings(t, e.anon)
	if ranking.TotalWeight != 0 || len(ranking.Models) != 1 || len(ranking.Dimensions) != 1 || ranking.Dimensions[0].Weight != 0 {
		t.Fatalf("zero-weight ranking = %+v", ranking)
	}
	if ranking.Models[0].Score != nil || ranking.Models[0].Rank != nil || ranking.Models[0].Coverage != 0 {
		t.Fatalf("zero-weight row = %+v", ranking.Models[0])
	}
	if ranking.Models[0].Scores[itoa(dimID)] != 9 {
		t.Fatalf("zero-weight value must stay visible: %+v", ranking.Models[0].Scores)
	}
	if ranking.UpdatedAt == nil {
		t.Fatal("updatedAt should reflect the stored score")
	}
}

func TestDeleteScoreIsIdempotent(t *testing.T) {
	e := newEnv(t)
	e.login(t)
	dimID := createDimension(t, e, "Reasoning", 50)
	createModel(t, e, "m", "Model")
	path := "/api/models/m/scores/" + itoa(dimID)
	code, body, _ := e.do(t, e.admin, http.MethodPut, path, map[string]any{"value": 9, "note": "n"}, nil)
	if code != http.StatusOK {
		t.Fatalf("put score = %d %s", code, body)
	}
	for i := 0; i < 2; i++ {
		code, body, _ = e.do(t, e.admin, http.MethodDelete, path, nil, nil)
		if code != http.StatusNoContent {
			t.Fatalf("delete #%d = %d %s", i+1, code, body)
		}
	}
	code, body, _ = e.do(t, e.admin, http.MethodDelete, "/api/models/missing/scores/"+itoa(dimID), nil, nil)
	if code != http.StatusNotFound {
		t.Fatalf("unknown model delete = %d %s", code, body)
	}
}

func TestPutScoreKeepsNoteWhenOmitted(t *testing.T) {
	e := newEnv(t)
	e.login(t)
	dimID := createDimension(t, e, "Reasoning", 50)
	createModel(t, e, "m", "Model")
	path := "/api/models/m/scores/" + itoa(dimID)

	noteOf := func(body []byte) string {
		t.Helper()
		var out struct {
			Note string `json:"note"`
		}
		if err := json.Unmarshal(body, &out); err != nil {
			t.Fatalf("decode score response: %v (%s)", err, body)
		}
		return out.Note
	}

	code, body, _ := e.do(t, e.admin, http.MethodPut, path, map[string]any{"value": 8, "note": "keep me"}, nil)
	if code != http.StatusOK || noteOf(body) != "keep me" {
		t.Fatalf("initial put = %d %s", code, body)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPut, path, map[string]any{"value": 9}, nil)
	if code != http.StatusOK || noteOf(body) != "keep me" {
		t.Fatalf("omitted note must keep the stored note: %d %s", code, body)
	}
	code, detail, _ := e.do(t, e.admin, http.MethodGet, "/api/models/m", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(detail), "keep me") {
		t.Fatalf("admin detail lost the note: %d %s", code, detail)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPut, path, map[string]any{"value": 9, "note": ""}, nil)
	if code != http.StatusOK || noteOf(body) != "" {
		t.Fatalf("explicit empty note must clear: %d %s", code, body)
	}

	createModel(t, e, "fresh", "Fresh")
	code, body, _ = e.do(t, e.admin, http.MethodPut, "/api/models/fresh/scores/"+itoa(dimID), map[string]any{"value": 7}, nil)
	if code != http.StatusOK || noteOf(body) != "" {
		t.Fatalf("new score without note must start empty: %d %s", code, body)
	}
}

func TestDisplaySettingsEndpoint(t *testing.T) {
	e := newEnv(t)
	path := "/api/display-settings"
	settings := func(percentage, percentageMax, maintenance bool) map[string]any {
		return map[string]any{
			"scorePercentageMode":    percentage,
			"scorePercentageMaxMode": percentageMax,
			"maintenanceMode":        maintenance,
		}
	}

	code, body, header := e.do(t, e.anon, http.MethodGet, path, nil, nil)
	if code != http.StatusOK || !strings.Contains(string(body), `"scorePercentageMode":false`) || !strings.Contains(string(body), `"scorePercentageMaxMode":false`) || !strings.Contains(string(body), `"maintenanceMode":false`) {
		t.Fatalf("anonymous default = %d %s", code, body)
	}
	if header.Get("Cache-Control") != "no-store" {
		t.Fatalf("GET cache-control = %q", header.Get("Cache-Control"))
	}

	code, _, _ = e.do(t, e.anon, http.MethodPut, path, settings(true, false, true), nil)
	if code != http.StatusUnauthorized {
		t.Fatalf("anonymous put = %d, want 401", code)
	}

	e.login(t)
	code, _, _ = e.do(t, e.admin, http.MethodPut, path, map[string]any{}, nil)
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("missing fields = %d, want 422", code)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPut, path, map[string]any{"scorePercentageMode": true, "maintenanceMode": true}, nil)
	if code != http.StatusUnprocessableEntity || !strings.Contains(string(body), "scorePercentageMaxMode") {
		t.Fatalf("missing max share = %d %s, want 422", code, body)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPut, path, map[string]any{"scorePercentageMode": true, "scorePercentageMaxMode": true}, nil)
	if code != http.StatusUnprocessableEntity || !strings.Contains(string(body), "maintenanceMode") {
		t.Fatalf("missing maintenance = %d %s, want 422", code, body)
	}
	code, _, _ = e.do(t, e.admin, http.MethodPut, path, map[string]any{
		"scorePercentageMode":    true,
		"scorePercentageMaxMode": false,
		"maintenanceMode":        true,
		"unknown":                1,
	}, nil)
	if code != http.StatusBadRequest {
		t.Fatalf("unknown field = %d, want 400", code)
	}
	code, _, _ = e.do(t, e.admin, http.MethodPut, path, settings(true, false, true), map[string]string{"Origin": "https://evil.test"})
	if code != http.StatusForbidden {
		t.Fatalf("cross-origin put = %d, want 403", code)
	}

	code, body, header = e.do(t, e.admin, http.MethodPut, path, settings(true, true, false), nil)
	if code != http.StatusOK ||
		!strings.Contains(string(body), `"scorePercentageMode":true`) ||
		!strings.Contains(string(body), `"scorePercentageMaxMode":true`) ||
		!strings.Contains(string(body), `"maintenanceMode":false`) {
		t.Fatalf("admin put = %d %s", code, body)
	}
	if header.Get("Cache-Control") != "no-store" {
		t.Fatalf("PUT cache-control = %q", header.Get("Cache-Control"))
	}
	code, body, _ = e.do(t, e.anon, http.MethodGet, path, nil, nil)
	if code != http.StatusOK ||
		!strings.Contains(string(body), `"scorePercentageMode":true`) ||
		!strings.Contains(string(body), `"scorePercentageMaxMode":true`) ||
		!strings.Contains(string(body), `"maintenanceMode":false`) {
		t.Fatalf("anonymous read after write = %d %s", code, body)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPut, path, settings(false, false, true), nil)
	if code != http.StatusOK || !strings.Contains(string(body), `"scorePercentageMode":false`) || !strings.Contains(string(body), `"maintenanceMode":true`) {
		t.Fatalf("maintenance only = %d %s", code, body)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPut, path, settings(false, false, false), nil)
	if code != http.StatusOK || !strings.Contains(string(body), `"maintenanceMode":false`) {
		t.Fatalf("disable = %d %s", code, body)
	}
}

func TestMaintenanceGate(t *testing.T) {
	e := newEnv(t)
	e.login(t)
	settingsPath := "/api/display-settings"
	update := func(percentage, maintenance bool) {
		t.Helper()
		code, body, _ := e.do(t, e.admin, http.MethodPut, settingsPath, map[string]any{
			"scorePercentageMode":    percentage,
			"scorePercentageMaxMode": false,
			"maintenanceMode":        maintenance,
		}, nil)
		if code != http.StatusOK {
			t.Fatalf("set maintenance=%v = %d %s", maintenance, code, body)
		}
	}

	update(false, true)

	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/api/rankings"},
		{http.MethodGet, "/api/bootstrap"},
		{http.MethodGet, "/api/models"},
		{http.MethodGet, "/api/export"},
		{http.MethodPost, "/api/dimensions"},
	} {
		code, body, _ := e.do(t, e.anon, tc.method, tc.path, nil, nil)
		if code != http.StatusServiceUnavailable || !strings.Contains(string(body), `"maintenance"`) {
			t.Fatalf("%s %s = %d %s, want 503 maintenance", tc.method, tc.path, code, body)
		}
	}

	// Authentication, health and the public settings stay reachable.
	code, body, _ := e.do(t, e.anon, http.MethodPost, "/api/auth/login", map[string]string{"password": "wrong"}, nil)
	if code != http.StatusUnauthorized {
		t.Fatalf("login during maintenance = %d %s, want 401 from the handler", code, body)
	}
	code, body, _ = e.do(t, e.anon, http.MethodGet, "/api/health", nil, nil)
	if code != http.StatusOK {
		t.Fatalf("health during maintenance = %d %s", code, body)
	}
	code, body, _ = e.do(t, e.anon, http.MethodPost, "/api/auth/logout", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(body), `"authenticated":false`) {
		t.Fatalf("logout during maintenance = %d %s", code, body)
	}
	code, body, _ = e.do(t, e.anon, http.MethodGet, settingsPath, nil, nil)
	if code != http.StatusOK || !strings.Contains(string(body), `"maintenanceMode":true`) {
		t.Fatalf("public settings during maintenance = %d %s", code, body)
	}
	for _, path := range []string{"/", "/login"} {
		code, body, _ = e.do(t, e.anon, http.MethodGet, path, nil, nil)
		if code != http.StatusOK || !strings.Contains(string(body), "LLM Rank") {
			t.Fatalf("SPA %s during maintenance = %d %s", path, code, body)
		}
	}

	// The administrator keeps full access.
	code, body, _ = e.do(t, e.admin, http.MethodGet, "/api/rankings", nil, nil)
	if code != http.StatusOK {
		t.Fatalf("admin rankings during maintenance = %d %s", code, body)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPost, "/api/dimensions", map[string]any{"name": "D", "description": "", "weight": 10}, nil)
	if code != http.StatusCreated {
		t.Fatalf("admin write during maintenance = %d %s", code, body)
	}

	update(false, false)
	code, body, _ = e.do(t, e.anon, http.MethodGet, "/api/rankings", nil, nil)
	if code != http.StatusOK {
		t.Fatalf("anonymous access after disabling maintenance = %d %s", code, body)
	}
}

func TestExportAndStatic(t *testing.T) {
	e := newEnv(t)
	code, _, _ := e.do(t, e.anon, http.MethodGet, "/api/export", nil, nil)
	if code != http.StatusUnauthorized {
		t.Fatalf("anonymous export = %d", code)
	}
	e.login(t)
	createDimension(t, e, "D", 10)
	createModel(t, e, "m", "Model")
	code, body, header := e.do(t, e.admin, http.MethodGet, "/api/export", nil, nil)
	if code != http.StatusOK || !strings.Contains(header.Get("Content-Disposition"), "attachment") {
		t.Fatalf("export = %d %s", code, header)
	}
	var snapshot map[string]any
	if err := json.Unmarshal(body, &snapshot); err != nil {
		t.Fatalf("export is not JSON: %v", err)
	}
	for _, key := range []string{"version", "exportedAt", "dimensions", "models", "scores", "texts"} {
		if _, ok := snapshot[key]; !ok {
			t.Fatalf("export missing %q", key)
		}
	}

	code, body, _ = e.do(t, e.anon, http.MethodGet, "/api/unknown", nil, nil)
	if code != http.StatusNotFound || !strings.Contains(string(body), `"not_found"`) {
		t.Fatalf("API 404 = %d %s", code, body)
	}
	code, body, _ = e.do(t, e.anon, http.MethodGet, "/api", nil, nil)
	if code != http.StatusNotFound || !strings.Contains(string(body), `"not_found"`) {
		t.Fatalf("API root 404 = %d %s", code, body)
	}
	code, body, _ = e.do(t, e.anon, http.MethodGet, "/models/gpt-5", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(body), "LLM Rank") {
		t.Fatalf("SPA fallback = %d %s", code, body)
	}
	code, _, header = e.do(t, e.anon, http.MethodGet, "/assets/app-abc.js", nil, nil)
	if code != http.StatusOK || !strings.Contains(header.Get("Cache-Control"), "immutable") {
		t.Fatalf("asset = %d %q", code, header.Get("Cache-Control"))
	}
	code, _, header = e.do(t, e.anon, http.MethodGet, "/", nil, nil)
	if code != http.StatusOK || header.Get("Cache-Control") != "no-cache" {
		t.Fatalf("index = %d %q", code, header.Get("Cache-Control"))
	}
}

func itoa(value int64) string {
	return strconv.FormatInt(value, 10)
}

type dimensionSummary struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Weight    int    `json:"weight"`
	UpdatedAt string `json:"updatedAt"`
}

func (e *env) dimensionList(t *testing.T, client *http.Client, path string) []dimensionSummary {
	t.Helper()
	code, body, _ := e.do(t, client, http.MethodGet, path, nil, nil)
	if code != http.StatusOK {
		t.Fatalf("GET %s = %d %s", path, code, body)
	}
	var out struct {
		Dimensions []dimensionSummary `json:"dimensions"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	return out.Dimensions
}

func dimensionIDs(list []dimensionSummary) []int64 {
	out := make([]int64, len(list))
	for i, dimension := range list {
		out[i] = dimension.ID
	}
	return out
}

func TestReorderDimensionsFlow(t *testing.T) {
	e := newEnv(t)
	e.login(t)

	code, body, _ := e.do(t, e.admin, http.MethodPut, "/api/dimensions/order", map[string]any{"ids": []int64{}}, nil)
	if code != http.StatusNoContent {
		t.Fatalf("empty library order = %d %s", code, body)
	}

	first := createDimension(t, e, "First", 10)
	second := createDimension(t, e, "Second", 20)
	third := createDimension(t, e, "Third", 30)
	createModel(t, e, "model-a", "Model A")

	want := []int64{third, first, second}
	code, body, _ = e.do(t, e.admin, http.MethodPut, "/api/dimensions/order", map[string]any{"ids": want}, nil)
	if code != http.StatusNoContent {
		t.Fatalf("reorder = %d %s", code, body)
	}

	for _, path := range []string{
		"/api/bootstrap",
		"/api/dimensions?includeArchived=1",
		"/api/rankings",
		"/api/models/model-a",
		"/api/export",
	} {
		got := dimensionIDs(e.dimensionList(t, e.admin, path))
		if len(got) != len(want) {
			t.Fatalf("%s dimensions = %v", path, got)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Fatalf("%s order = %v, want %v", path, got, want)
			}
		}
	}

	before := e.dimensionList(t, e.admin, "/api/dimensions?includeArchived=1")
	for name, payload := range map[string]any{
		"missing":      map[string]any{},
		"null":         map[string]any{"ids": nil},
		"short":        map[string]any{"ids": []int64{third, first}},
		"unknown":      map[string]any{"ids": []int64{third, first, second, 999}},
		"duplicate":    map[string]any{"ids": []int64{third, third, first}},
		"non-positive": map[string]any{"ids": []int64{third, first, 0}},
	} {
		code, body, _ = e.do(t, e.admin, http.MethodPut, "/api/dimensions/order", payload, nil)
		wantStatus := http.StatusUnprocessableEntity
		if name == "short" || name == "unknown" {
			wantStatus = http.StatusConflict
		}
		if code != wantStatus {
			t.Fatalf("%s order = %d %s, want %d", name, code, body, wantStatus)
		}
		if wantStatus == http.StatusUnprocessableEntity && !strings.Contains(string(body), `"ids"`) {
			t.Fatalf("%s order missing fields.ids: %s", name, body)
		}
	}
	code, body, _ = e.do(t, e.admin, http.MethodPut, "/api/dimensions/order", map[string]any{"ids": "broken"}, nil)
	if code != http.StatusBadRequest {
		t.Fatalf("type error order = %d %s, want 400", code, body)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPut, "/api/dimensions/order", map[string]any{"ids": []int64{}}, nil)
	if code != http.StatusConflict {
		t.Fatalf("empty order on non-empty library = %d %s, want 409", code, body)
	}
	after := e.dimensionList(t, e.admin, "/api/dimensions?includeArchived=1")
	if len(after) != len(before) {
		t.Fatalf("failed orders changed dimensions: %v", after)
	}
	for i := range before {
		if after[i].ID != before[i].ID || after[i].UpdatedAt != before[i].UpdatedAt {
			t.Fatalf("failed order changed dimension %d: %+v -> %+v", before[i].ID, before[i], after[i])
		}
	}

	code, _, _ = e.do(t, e.anon, http.MethodPut, "/api/dimensions/order", map[string]any{"ids": want}, nil)
	if code != http.StatusUnauthorized {
		t.Fatalf("anonymous reorder = %d, want 401", code)
	}
	code, _, _ = e.do(t, e.admin, http.MethodPut, "/api/dimensions/order", map[string]any{"ids": want}, map[string]string{"Origin": "https://evil.test"})
	if code != http.StatusForbidden {
		t.Fatalf("cross-origin reorder = %d, want 403", code)
	}
}
func TestModelCommentaryVisibilityAndValidation(t *testing.T) {
	e := newEnv(t)
	e.login(t)
	createDimension(t, e, "Quality", 50)
	createModel(t, e, "voice", "Voice")
	path := "/api/models/voice"

	code, body, _ := e.do(t, e.admin, http.MethodPatch, path, map[string]any{
		"commentary": "第一段\nsecond line",
	}, nil)
	if code != http.StatusOK || !strings.Contains(string(body), `"commentary":"第一段\nsecond line"`) ||
		!strings.Contains(string(body), `"commentaryPublic":false`) || !strings.Contains(string(body), `"name":"Voice"`) ||
		!strings.Contains(string(body), `"vendor":"Vendor"`) || !strings.Contains(string(body), "private note") {
		t.Fatalf("commentary-only patch = %d %s", code, body)
	}

	code, detail, _ := e.do(t, e.anon, http.MethodGet, path, nil, nil)
	if code != http.StatusOK || strings.Contains(string(detail), "commentary") || strings.Contains(string(detail), "second line") {
		t.Fatalf("anonymous detail leaked private commentary: %d %s", code, detail)
	}
	code, detail, _ = e.do(t, e.admin, http.MethodGet, path, nil, nil)
	if code != http.StatusOK || !strings.Contains(string(detail), "second line") || !strings.Contains(string(detail), `"commentaryPublic":false`) {
		t.Fatalf("admin detail missing private commentary: %d %s", code, detail)
	}

	code, body, _ = e.do(t, e.admin, http.MethodPatch, path, map[string]any{
		"commentaryPublic": true,
		"commentaryAt":     "2026-10-23",
	}, nil)
	if code != http.StatusOK {
		t.Fatalf("publish commentary = %d %s", code, body)
	}
	code, detail, _ = e.do(t, e.anon, http.MethodGet, path, nil, nil)
	if code != http.StatusOK || !strings.Contains(string(detail), "second line") ||
		!strings.Contains(string(detail), `"commentaryPublic":true`) || !strings.Contains(string(detail), `"commentaryAt":"2026-10-23"`) {
		t.Fatalf("public commentary missing from anonymous detail: %d %s", code, detail)
	}

	code, models, _ := e.do(t, e.anon, http.MethodGet, "/api/models", nil, nil)
	if code != http.StatusOK || strings.Contains(string(models), "commentary") {
		t.Fatalf("anonymous list leaked commentary: %d %s", code, models)
	}
	code, models, _ = e.do(t, e.admin, http.MethodGet, "/api/models", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(models), "second line") || !strings.Contains(string(models), `"commentaryPublic":true`) {
		t.Fatalf("admin list missing commentary: %d %s", code, models)
	}

	code, body, _ = e.do(t, e.admin, http.MethodPatch, path, map[string]any{"commentary": strings.Repeat("字", 501)}, nil)
	if code != http.StatusUnprocessableEntity || !strings.Contains(string(body), "评语不能超过 500 个字符") {
		t.Fatalf("oversized commentary = %d %s", code, body)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPatch, path, map[string]any{"commentaryAt": "2026-13-01"}, nil)
	if code != http.StatusUnprocessableEntity || !strings.Contains(string(body), "评语时间需为 YYYY-MM-DD") {
		t.Fatalf("invalid commentary date = %d %s", code, body)
	}

	code, body, _ = e.do(t, e.admin, http.MethodGet, "/api/export", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(body), `"commentary": "第一段`) ||
		!strings.Contains(string(body), `"commentaryPublic": true`) || !strings.Contains(string(body), `"commentaryAt": "2026-10-23"`) {
		t.Fatalf("export missing commentary: %d %s", code, body)
	}

	code, body, _ = e.do(t, e.admin, http.MethodPatch, path, map[string]any{
		"commentary": "", "commentaryAt": "", "commentaryPublic": false,
	}, nil)
	if code != http.StatusOK || !strings.Contains(string(body), `"commentary":""`) ||
		!strings.Contains(string(body), `"commentaryAt":""`) || !strings.Contains(string(body), `"commentaryPublic":false`) {
		t.Fatalf("clear commentary = %d %s", code, body)
	}
	code, detail, _ = e.do(t, e.anon, http.MethodGet, path, nil, nil)
	if code != http.StatusOK || strings.Contains(string(detail), "commentary") {
		t.Fatalf("cleared public commentary still visible: %d %s", code, detail)
	}
}

func TestModelVisibilityArchiveAndText(t *testing.T) {
	e := newEnv(t)
	e.login(t)
	numericID := createDimension(t, e, "Reasoning", 50)
	textID := createTextDimension(t, e, "Notes")
	createModel(t, e, "visible", "Visible")
	createModel(t, e, "hidden", "Hidden")
	createModel(t, e, "archived", "Archived")

	code, body, _ := e.do(t, e.admin, http.MethodPatch, "/api/models/hidden", map[string]any{"hidden": true}, nil)
	if code != http.StatusOK || !strings.Contains(string(body), `"hidden":true`) {
		t.Fatalf("hide model = %d %s", code, body)
	}
	code, detail, _ := e.do(t, e.admin, http.MethodGet, "/api/models/hidden", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(detail), `"name":"Hidden"`) || !strings.Contains(string(detail), `"vendor":"Vendor"`) || !strings.Contains(string(detail), "private note") {
		t.Fatalf("hidden-only patch clobbered profile: %d %s", code, detail)
	}

	code, models, _ := e.do(t, e.anon, http.MethodGet, "/api/models", nil, nil)
	if code != http.StatusOK || strings.Contains(string(models), `"slug":"hidden"`) {
		t.Fatalf("anonymous list must exclude hidden models: %d %s", code, models)
	}
	code, models, _ = e.do(t, e.admin, http.MethodGet, "/api/models", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(models), `"slug":"hidden"`) || !strings.Contains(string(models), `"hidden":true`) {
		t.Fatalf("admin default list must include hidden models: %d %s", code, models)
	}
	code, _, _ = e.do(t, e.anon, http.MethodGet, "/api/models/hidden", nil, nil)
	if code != http.StatusNotFound {
		t.Fatalf("anonymous hidden detail = %d, want 404", code)
	}
	code, _, _ = e.do(t, e.anon, http.MethodGet, "/api/models?includeArchived=1", nil, nil)
	if code != http.StatusUnauthorized {
		t.Fatalf("anonymous includeArchived = %d, want 401", code)
	}

	public := e.rankings(t, e.anon)
	for _, model := range public.Models {
		if model.Slug == "hidden" {
			t.Fatalf("hidden model leaked into public rankings: %+v", public.Models)
		}
	}
	code, _, _ = e.do(t, e.anon, http.MethodGet, "/api/rankings?includeHidden=1", nil, nil)
	if code != http.StatusUnauthorized {
		t.Fatalf("anonymous includeHidden = %d, want 401", code)
	}
	code, body, _ = e.do(t, e.admin, http.MethodGet, "/api/rankings?includeHidden=1", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(body), `"slug":"hidden"`) || !strings.Contains(string(body), `"hidden":true`) {
		t.Fatalf("admin includeHidden = %d %s", code, body)
	}
	var adminRanking rankingOutput
	if err := json.Unmarshal(body, &adminRanking); err != nil {
		t.Fatal(err)
	}
	for _, model := range adminRanking.Models {
		if model.Slug == "hidden" && model.Rank != nil {
			t.Fatalf("hidden model must not receive a rank: %+v", model)
		}
	}

	code, body, _ = e.do(t, e.admin, http.MethodPost, "/api/models/archived/archive", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(body), "archivedAt") {
		t.Fatalf("archive model = %d %s", code, body)
	}
	code, models, _ = e.do(t, e.anon, http.MethodGet, "/api/models", nil, nil)
	if code != http.StatusOK || strings.Contains(string(models), `"slug":"archived"`) {
		t.Fatalf("archived model still listed: %s", models)
	}
	code, models, _ = e.do(t, e.admin, http.MethodGet, "/api/models?includeArchived=1", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(models), `"archivedAt":"`) {
		t.Fatalf("admin archived list = %d %s", code, models)
	}
	code, _, _ = e.do(t, e.anon, http.MethodGet, "/api/models/archived", nil, nil)
	if code != http.StatusNotFound {
		t.Fatalf("archived detail = %d, want 404", code)
	}
	code, _, _ = e.do(t, e.admin, http.MethodPut, "/api/models/archived/scores/"+itoa(numericID), map[string]any{"value": 8}, nil)
	if code != http.StatusNotFound {
		t.Fatalf("archived model score = %d, want 404", code)
	}
	code, _, _ = e.do(t, e.admin, http.MethodPatch, "/api/models/archived", map[string]any{"name": "Renamed"}, nil)
	if code != http.StatusNotFound {
		t.Fatalf("archived model patch = %d, want 404", code)
	}
	code, _, _ = e.do(t, e.admin, http.MethodPost, "/api/models/archived/restore", nil, nil)
	if code != http.StatusOK {
		t.Fatalf("restore model = %d", code)
	}
	code, _, _ = e.do(t, e.anon, http.MethodGet, "/api/models/archived", nil, nil)
	if code != http.StatusOK {
		t.Fatalf("restored detail = %d", code)
	}

	textPath := "/api/models/hidden/texts/" + itoa(textID)
	code, body, _ = e.do(t, e.admin, http.MethodPut, textPath, map[string]any{"text": "第一条\nsecond line"}, nil)
	if code != http.StatusOK {
		t.Fatalf("put text = %d %s", code, body)
	}
	code, detail, _ = e.do(t, e.admin, http.MethodGet, "/api/models/hidden", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(detail), `"textMode":true`) || !strings.Contains(string(detail), "second line") {
		t.Fatalf("admin detail missing text: %d %s", code, detail)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPut, textPath, map[string]any{"text": strings.Repeat("字", 2001)}, nil)
	if code != http.StatusUnprocessableEntity || !strings.Contains(string(body), "text") {
		t.Fatalf("oversized text = %d %s", code, body)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPut, "/api/models/hidden/texts/"+itoa(numericID), map[string]any{"text": "wrong"}, nil)
	if code != http.StatusUnprocessableEntity || !strings.Contains(string(body), "dimensionId") {
		t.Fatalf("text on numeric dimension = %d %s", code, body)
	}
	code, body, _ = e.do(t, e.admin, http.MethodPut, "/api/models/hidden/scores/"+itoa(textID), map[string]any{"value": 8}, nil)
	if code != http.StatusUnprocessableEntity || !strings.Contains(string(body), "dimensionId") {
		t.Fatalf("score on text dimension = %d %s", code, body)
	}
	code, _, _ = e.do(t, e.admin, http.MethodPut, textPath, map[string]any{"text": ""}, nil)
	if code != http.StatusNoContent {
		t.Fatalf("clear text = %d", code)
	}
	code, detail, _ = e.do(t, e.admin, http.MethodGet, "/api/models/hidden", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(detail), `"text":""`) {
		t.Fatalf("cleared text not empty: %d %s", code, detail)
	}

	// Text dimensions reject text writes once archived, and scores on them never count.
	code, _, _ = e.do(t, e.admin, http.MethodPost, "/api/dimensions/"+itoa(textID)+"/archive", nil, nil)
	if code != http.StatusOK {
		t.Fatalf("archive text dimension = %d", code)
	}
	code, _, _ = e.do(t, e.admin, http.MethodPut, textPath, map[string]any{"text": "late"}, nil)
	if code != http.StatusNotFound {
		t.Fatalf("archived text dimension write = %d, want 404", code)
	}

	code, body, _ = e.do(t, e.admin, http.MethodGet, "/api/export", nil, nil)
	if code != http.StatusOK || !strings.Contains(string(body), `"hidden": true`) || !strings.Contains(string(body), `"texts": [`) {
		t.Fatalf("export missing new fields: %d", code)
	}
}
