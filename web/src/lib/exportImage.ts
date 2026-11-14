import type { RankingDimension, Rankings } from "../api/types";
import {
  boardColumns,
  dimensionKey,
  formatDimension,
  groupKey,
  groupValue,
  snapshotBaselines,
  type DimensionGroup,
} from "../domain/ranking.ts";
import {
  boardDisplays,
  displayScoreLabel,
  formatDisplayScore,
  scoreEmphasisTone,
  type ScoreDisplayMode,
  type ScoreRange,
  type ScoreTone,
} from "./scoreEmphasis.ts";

/** Rendered at twice the layout size so the PNG stays sharp on retina screens. */
const DENSITY = 2;

const PAD = 24;

/** Design tokens copied from global.css so the image matches the board. */
const TOKENS = {
  paper: "#f2efe6",
  ink: "#14130f",
  ink3: "#6b665a",
  rule: "#d3ccbc",
  signal: "#b92a20",
  scoreLow: "#e89a8b",
  scoreLowRule: "#8f1c14",
  scoreHigh: "#9fcbd2",
  scoreHighRule: "#174f5b",
  sans: '"Helvetica Neue", Helvetica, Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  mono: '"SFMono-Regular", "Cascadia Mono", "Roboto Mono", "Liberation Mono", Menlo, monospace',
};

/** The board's value chip: 13px mono in a 1.5 line box, 5px vertical and 9px horizontal padding, 58px minimum width. */
const VALUE_BOX = {
  fontSize: 13,
  height: 13 * 1.5 + 5 * 2,
  minWidth: 58,
  padX: 9,
  /** Distance from the chip's right edge to its text, and the board's underline gap. */
  textInset: 8,
};

/** Display settings of the board the image is exported from. */
export interface ExportDisplay extends ScoreDisplayMode {
  /** Browser preference: the board's red-blue tone behind read-only dimension and group values. */
  emphasis: boolean;
}

export interface ExportColumn {
  key: string;
  label: string;
  /** Left edge in CSS pixels. */
  x: number;
  width: number;
  kind: "rank" | "model" | "score" | "group" | "dimension";
  group?: DimensionGroup<RankingDimension>;
  dimension?: RankingDimension;
}

export interface ExportLayout {
  width: number;
  columns: ExportColumn[];
  rowHeight: number;
  headerHeight: number;
}

/**
 * Column set and coordinates of the exported board. It always covers every
 * enabled column, independent of which columns the viewport hides.
 */
export function planExportLayout(dimensions: RankingDimension[], preferredWidth = 1200): ExportLayout {
  const { columns: orderedColumns } = boardColumns(dimensions);
  const plans: Omit<ExportColumn, "x">[] = [
    { key: "rank", label: "综合排名", width: 72, kind: "rank" },
    { key: "model", label: "模型", width: 260, kind: "model" },
    { key: "score", label: "综合分", width: 96, kind: "score" },
    ...orderedColumns.map((column): Omit<ExportColumn, "x"> =>
      column.kind === "group"
        ? { key: groupKey(column.group.name), label: column.group.name, width: 120, kind: "group", group: column.group }
        : {
            key: dimensionKey(column.dimension.id),
            label: column.dimension.name,
            width: 100,
            kind: "dimension",
            dimension: column.dimension,
          },
    ),
  ];

  // Stretch the rating columns over the leftover width so the table fills the
  // canvas instead of packing everything against the left edge.
  const flexible = plans.filter((column) => column.kind !== "rank" && column.kind !== "model" && column.kind !== "score");
  const minimum = plans.reduce((sum, column) => sum + column.width, 0);
  const surplus = preferredWidth - PAD * 2 - minimum;
  const extra = flexible.length > 0 && surplus > 0 ? Math.floor(surplus / flexible.length) : 0;
  for (const column of flexible) column.width += extra;

  const columns: ExportColumn[] = [];
  let x = PAD;
  for (const column of plans) {
    columns.push({ ...column, x });
    x += column.width;
  }
  return { width: Math.max(preferredWidth, x + PAD), columns, rowHeight: 44, headerHeight: 112 };
}

function channels(hex: string): number[] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

/**
 * Tone fill of one value cell: the board blends the colour token into the paper
 * at an integer strength (`color-mix` with a rounded percentage), so the image
 * fills the already blended colour instead.
 */
export function toneFill(direction: "low" | "high", strength: number): string {
  const alpha = Math.round(strength * 100) / 100;
  const tone = channels(direction === "low" ? TOKENS.scoreLow : TOKENS.scoreHigh);
  const paper = channels(TOKENS.paper);
  const mixed = tone.map((channel, index) => Math.round(paper[index] + (channel - paper[index]) * alpha));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

/**
 * Draws one read-only score the way the board renders it: right aligned on the
 * column anchor, inside the value chip's tone fill and underline when it has one.
 */
function drawValue(
  ctx: CanvasRenderingContext2D,
  column: ExportColumn,
  y: number,
  text: string,
  tone: ScoreTone | null,
): void {
  ctx.font = `${VALUE_BOX.fontSize}px ${TOKENS.mono}`;
  const width = ctx.measureText(text).width;
  const rightEdge = column.x + column.width - VALUE_BOX.textInset;
  const left = rightEdge - width;
  if (tone) {
    const boxWidth = Math.max(VALUE_BOX.minWidth, width + VALUE_BOX.padX * 2);
    // The chip centres its line box on the text, so the box sits 0.3em above the baseline.
    const boxTop = y - VALUE_BOX.fontSize * 0.3 - VALUE_BOX.height / 2;
    ctx.fillStyle = toneFill(tone.direction, tone.strength);
    ctx.fillRect(rightEdge + VALUE_BOX.padX - boxWidth, boxTop, boxWidth, VALUE_BOX.height);
  }
  ctx.fillStyle = TOKENS.ink;
  ctx.fillText(text, left, y);
  if (tone) {
    ctx.fillStyle = tone.direction === "low" ? TOKENS.scoreLowRule : TOKENS.scoreHighRule;
    ctx.fillRect(left, y + 4, width, 2);
  }
}

/** Draws the rankings board onto the canvas at 2x density, following the board's display settings. */
export function renderExportCanvas(
  canvas: HTMLCanvasElement,
  rankings: Rankings,
  display: ExportDisplay,
  now = new Date(),
): void {
  const layout = planExportLayout(rankings.dimensions);
  const baselines = snapshotBaselines(rankings.dimensions);
  const displays = boardDisplays(rankings.dimensions, rankings.models);
  const rows = rankings.models;
  const toneOf = (value: number | null | undefined, range: ScoreRange | null) =>
    display.emphasis ? scoreEmphasisTone(value, range) : null;
  const height = layout.headerHeight + 52 + rows.length * layout.rowHeight + 44;
  canvas.width = layout.width * DENSITY;
  canvas.height = height * DENSITY;
  canvas.style.width = `${layout.width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器不支持画布导出");
  ctx.setTransform(DENSITY, 0, 0, DENSITY, 0, 0);

  ctx.fillStyle = TOKENS.paper;
  ctx.fillRect(0, 0, layout.width, height);

  ctx.fillStyle = TOKENS.ink;
  ctx.font = `700 30px ${TOKENS.sans}`;
  ctx.fillText("LLM Rank · 综合排行", PAD, 52);
  ctx.fillStyle = TOKENS.ink3;
  ctx.font = `12px ${TOKENS.mono}`;
  const groupCount = layout.columns.filter((column) => column.kind === "group").length;
  const info = `${rows.length} 个模型 · ${rankings.dimensions.length} 个维度 · ${groupCount} 个维度组 · Skip 按 60% 中位分计入`;
  ctx.fillText(display.emphasis ? `${info} · 低分红 → 高分蓝` : info, PAD, 78);

  const headRule = layout.headerHeight;
  ctx.strokeStyle = TOKENS.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, headRule);
  ctx.lineTo(layout.width, headRule);
  ctx.stroke();

  const right = (column: ExportColumn) => column.x + column.width - VALUE_BOX.textInset;
  ctx.font = `10px ${TOKENS.mono}`;
  for (const column of layout.columns) {
    ctx.fillStyle = TOKENS.ink;
    // The composite header names the active percentage mode, like the board's.
    const label = column.kind === "score" ? displayScoreLabel(display, column.label, "综合强度", "综合占比") : column.label;
    // Numeric headers share the right anchor of the values below them.
    const x = column.kind === "rank" || column.kind === "model" ? column.x : right(column) - ctx.measureText(label).width;
    ctx.fillText(label, x, headRule + 28);
  }
  ctx.beginPath();
  ctx.moveTo(0, headRule + 40);
  ctx.lineTo(layout.width, headRule + 40);
  ctx.stroke();

  rows.forEach((model, index) => {
    const y = headRule + 46 + index * layout.rowHeight + 28;
    // The board marks rank 1, not the first row; an unranked board marks nothing.
    const top = model.rank === 1;
    if (top) {
      ctx.fillStyle = TOKENS.signal;
      ctx.fillRect(PAD - 8, y - 14, 3, 18);
    }
    for (const column of layout.columns) {
      if (column.kind === "rank") {
        ctx.fillStyle = top ? TOKENS.signal : TOKENS.ink;
        ctx.font = `13px ${TOKENS.mono}`;
        ctx.fillText(model.rank == null ? "—" : String(model.rank).padStart(2, "0"), column.x, y);
        continue;
      }
      if (column.kind === "model") {
        ctx.fillStyle = TOKENS.ink;
        ctx.font = `14px ${TOKENS.sans}`;
        ctx.fillText(model.name, column.x, y);
        continue;
      }
      // The composite is a weight average, not a board column with a range, so
      // the board never tones it either.
      if (column.kind === "score") {
        drawValue(ctx, column, y, formatDisplayScore(model.score, display, displays.compositeRange, displays.compositeMax), null);
        continue;
      }
      if (column.kind === "group" && column.group) {
        const cell = displays.groups.get(column.group.name);
        const value = groupValue(column.group, model.scores, baselines, model.skips);
        drawValue(ctx, column, y, formatDisplayScore(value, display, cell?.range, cell?.max, formatDimension), toneOf(value, cell?.range ?? null));
        continue;
      }
      if (column.kind === "dimension" && column.dimension) {
        if (model.skips.includes(column.dimension.id)) {
          ctx.fillStyle = TOKENS.ink3;
          ctx.font = `11px ${TOKENS.mono}`;
          ctx.fillText("Skip", right(column) - ctx.measureText("Skip").width, y);
          continue;
        }
        const cell = displays.dimensions.get(column.dimension.id);
        const value = model.scores[String(column.dimension.id)];
        drawValue(ctx, column, y, formatDisplayScore(value, display, cell?.range, cell?.max, formatDimension), toneOf(value, cell?.range ?? null));
      }
    }
    ctx.strokeStyle = TOKENS.rule;
    ctx.beginPath();
    ctx.moveTo(0, y + 14);
    ctx.lineTo(layout.width, y + 14);
    ctx.stroke();
  });

  ctx.strokeStyle = TOKENS.ink;
  ctx.beginPath();
  ctx.moveTo(0, height - 40);
  ctx.lineTo(layout.width, height - 40);
  ctx.stroke();
  ctx.fillStyle = TOKENS.ink3;
  ctx.font = `10px ${TOKENS.mono}`;
  ctx.fillText(
    `导出时间 ${now.toISOString().slice(0, 10)} · ${displayScoreLabel(display, "加权平均", "相对强度", "最高分占比")}`,
    PAD,
    height - 18,
  );
}

/** Renders the board and hands the PNG to the browser as a download. */
export async function downloadRankingsImage(rankings: Rankings, display: ExportDisplay, now = new Date()): Promise<void> {
  const canvas = document.createElement("canvas");
  renderExportCanvas(canvas, rankings, display, now);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("图片生成失败");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `llm-rank-${now.toISOString().slice(0, 10)}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
