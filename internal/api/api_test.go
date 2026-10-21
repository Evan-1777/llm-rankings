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
	if len(dims) != 3 {
		t.Fatalf("zero-weight dimension must not enter rankings: %+v", dims)
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
	if ranking.TotalWeight != 0 || len(ranking.Models) != 1 || ranking.Dimensions == nil || len(ranking.Dimensions) != 0 {
		t.Fatalf("zero-weight ranking = %+v", ranking)
	}
	if ranking.Models[0].Score != nil || ranking.Models[0].Rank != nil || ranking.Models[0].Coverage != 0 {
		t.Fatalf("zero-weight row = %+v", ranking.Models[0])
	}
	if ranking.UpdatedAt == nil {
		t.Fatal("updatedAt should reflect the stored score")
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
	for _, key := range []string{"version", "exportedAt", "dimensions", "models", "scores"} {
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
