export interface Counts {
  models: number;
  scoredModels: number;
  dimensions: number;
  scores: number;
}

export interface Dimension {
  id: number;
  name: string;
  description: string;
  weight: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Bootstrap {
  authenticated: boolean;
  dimensions: Dimension[];
  counts: Counts;
  totalWeight: number;
  now: string;
}

export interface RankingDimension {
  id: number;
  name: string;
  weight: number;
}

export interface RankingModel {
  slug: string;
  name: string;
  vendor: string;
  score: number | null;
  coverage: number;
  provisional: boolean;
  rank: number | null;
  scores: Record<string, number>;
}

export interface Rankings {
  totalWeight: number;
  updatedAt: string | null;
  dimensions: RankingDimension[];
  models: RankingModel[];
}

export interface ModelSummary {
  slug: string;
  name: string;
  vendor: string;
  notes?: string;
  scoreCount: number;
  updatedAt: string;
}

export interface ModelDimension {
  id: number;
  name: string;
  weight: number;
  value: number | null;
  note?: string;
}

export interface ModelDetail {
  slug: string;
  name: string;
  vendor: string;
  notes?: string;
  score: number | null;
  coverage: number;
  provisional: boolean;
  rank: number | null;
  dimensions: ModelDimension[];
  scoredCount: number;
  dimensionCount: number;
  updatedAt: string;
}

export interface DimensionInput {
  name: string;
  description: string;
  weight: number;
}

export interface ModelInput {
  name: string;
  slug: string;
  vendor: string;
  notes: string;
}

export interface ModelPatch {
  name?: string;
  vendor?: string;
  notes?: string;
}

export interface ScoreResponse {
  modelSlug: string;
  dimensionId: number;
  value: number;
  note: string;
  updatedAt: string;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export interface ExportSnapshot {
  version: number;
  exportedAt: string;
  dimensions: Dimension[];
  models: Array<{
    slug: string;
    name: string;
    vendor: string;
    notes: string;
    createdAt: string;
    updatedAt: string;
  }>;
  scores: Array<{
    modelSlug: string;
    dimensionId: number;
    value: number;
    note: string;
    updatedAt: string;
  }>;
}
