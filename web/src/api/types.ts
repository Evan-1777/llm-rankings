export interface Counts {
  models: number;
  scoredModels: number;
  dimensions: number;
}

export interface Dimension {
  id: number;
  name: string;
  description: string;
  weight: number;
  textMode: boolean;
  /** Dimensions sharing a name form one board column; empty means no group. */
  groupName: string;
  /** Fixed percentage baseline; null means the current highest score is used. */
  baselineMax: number | null;
  /** Baseline used by the current snapshot; only the list and export fill it. */
  effectiveBaselineMax?: number | null;
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
  /** Dimensions sharing a name form one board column; empty means no group. */
  groupName: string;
  baselineMax: number | null;
  effectiveBaselineMax: number | null;
  /** Converted value a skip contributes to the composite; null for text columns. */
  skipMedian: number | null;
}

export interface RankingModel {
  slug: string;
  name: string;
  vendor: string;
  hidden: boolean;
  score: number | null;
  rank: number | null;
  /** Rated dimensions with a positive weight; skipped ones are not counted. */
  scoredCount: number;
  scores: Record<string, number>;
  /** Dimensions this model does not use; the composite imputes their median. */
  skips: number[];
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
  hidden: boolean;
  commentary?: string;
  commentaryPublic?: boolean;
  commentaryAt?: string;
  archivedAt: string | null;
  /** Every stored score, including archived and zero-weight dimensions. */
  scoreCount: number;
  /** Scores on enabled dimensions with a positive weight. */
  scoredDimensions: number;
  updatedAt: string;
}

/** Full model row returned by create/update/hide/archive; notes stay admin-only by route. */
export interface ModelResponse {
  slug: string;
  name: string;
  vendor: string;
  notes: string;
  hidden: boolean;
  archivedAt: string | null;
  commentary: string;
  commentaryPublic: boolean;
  commentaryAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelDimension {
  id: number;
  name: string;
  weight: number;
  textMode: boolean;
  /** Dimensions sharing a name form one board column; empty means no group. */
  groupName: string;
  value: number | null;
  baselineMax: number | null;
  effectiveBaselineMax: number | null;
  /** Converted value a skip contributes to the composite; null for text columns. */
  skipMedian: number | null;
  text?: string;
  note?: string;
}

export interface ModelDetail {
  slug: string;
  name: string;
  vendor: string;
  notes?: string;
  hidden: boolean;
  commentary?: string;
  commentaryPublic?: boolean;
  commentaryAt?: string;
  score: number | null;
  rank: number | null;
  dimensions: ModelDimension[];
  scoredCount: number;
  dimensionCount: number;
  /** Dimensions this model does not use; the composite imputes their median. */
  skips: number[];
  updatedAt: string;
}

export interface DimensionInput {
  name: string;
  description: string;
  weight: number;
  textMode: boolean;
  baselineMax: number | null;
  /** null clears the group; omitted keeps the stored value. */
  groupName?: string | null;
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
  hidden?: boolean;
  commentary?: string;
  commentaryPublic?: boolean;
  commentaryAt?: string;
}

export interface DisplaySettings {
  scorePercentageMode: boolean;
  scorePercentageMaxMode: boolean;
  maintenanceMode: boolean;
  /** Saved Markdown notes shown below the rankings; empty when unset. */
  rankingNotes: string;
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
