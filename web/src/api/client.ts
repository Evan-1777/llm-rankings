import type {
  Bootstrap,
  Dimension,
  DimensionInput,
  DisplaySettings,
  ErrorEnvelope,
  ModelDetail,
  ModelInput,
  ModelPatch,
  ModelSummary,
  Rankings,
  ScoreResponse,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event("llmrank:unauthorized"));
    }
    const envelope = payload as ErrorEnvelope | null;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? "error",
      envelope?.error?.message ?? "请求失败，请稍后重试",
      envelope?.error?.fields,
    );
  }
  return payload as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const fieldMessage = error.fields ? Object.values(error.fields)[0] : undefined;
    return fieldMessage ?? error.message;
  }
  if (error instanceof Error && error.name === "AbortError") return "";
  return "请求失败，请稍后重试";
}

export const api = {
  bootstrap: (signal?: AbortSignal) => request<Bootstrap>("/api/bootstrap", { signal }),
  login: (password: string) =>
    request<{ authenticated: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ authenticated: boolean }>("/api/auth/logout", { method: "POST" }),

  rankings: (signal?: AbortSignal) => request<Rankings>("/api/rankings", { signal }),

  displaySettings: (signal?: AbortSignal) => request<DisplaySettings>("/api/display-settings", { signal }),
  updateDisplaySettings: (input: DisplaySettings) =>
    request<DisplaySettings>("/api/display-settings", { method: "PUT", body: JSON.stringify(input) }),

  dimensions: (includeArchived: boolean, signal?: AbortSignal) =>
    request<{ dimensions: Dimension[] }>(
      `/api/dimensions${includeArchived ? "?includeArchived=1" : ""}`,
      { signal },
    ),
  createDimension: (input: DimensionInput) =>
    request<Dimension>("/api/dimensions", { method: "POST", body: JSON.stringify(input) }),
  updateDimension: (id: number, input: DimensionInput) =>
    request<Dimension>(`/api/dimensions/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  setDimensionArchived: (id: number, archived: boolean) =>
    request<Dimension>(`/api/dimensions/${id}/${archived ? "archive" : "restore"}`, { method: "POST" }),
  deleteDimension: (id: number) => request<void>(`/api/dimensions/${id}`, { method: "DELETE" }),
  reorderDimensions: (ids: number[]) =>
    request<void>("/api/dimensions/order", { method: "PUT", body: JSON.stringify({ ids }) }),

  models: (signal?: AbortSignal) => request<{ models: ModelSummary[] }>("/api/models", { signal }),
  model: (slug: string, signal?: AbortSignal) =>
    request<ModelDetail>(`/api/models/${encodeURIComponent(slug)}`, { signal }),
  createModel: (input: ModelInput) =>
    request<{ slug: string }>("/api/models", { method: "POST", body: JSON.stringify(input) }),
  updateModel: (slug: string, patch: ModelPatch) =>
    request<{ slug: string }>(`/api/models/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteModel: (slug: string) =>
    request<void>(`/api/models/${encodeURIComponent(slug)}`, { method: "DELETE" }),

  putScore: (slug: string, dimensionId: number, value: number, note?: string) =>
    request<ScoreResponse>(`/api/models/${encodeURIComponent(slug)}/scores/${dimensionId}`, {
      method: "PUT",
      body: JSON.stringify(note === undefined ? { value } : { value, note }),
    }),
  deleteScore: (slug: string, dimensionId: number) =>
    request<void>(`/api/models/${encodeURIComponent(slug)}/scores/${dimensionId}`, {
      method: "DELETE",
    }),
};