import type { RankingDimension, Rankings } from "../api/types";
import {
  boardColumns,
  dimensionKey,
  formatDimension,
  formatScore,
  groupKey,
  groupValue,
  snapshotBaselines,
  type DimensionGroup,
} from "../domain/ranking.ts";

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
  sans: '"Helvetica Neue", Helvetica, Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  mono: '"SFMono-Regular", "Cascadia Mono", "Roboto Mono", "Liberation Mono", Menlo, monospace',
};

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

/** Draws the rankings board onto the canvas at 2x density. */
export function renderExportCanvas(canvas: HTMLCanvasElement, rankings: Rankings, now = new Date()): void {
  const layout = planExportLayout(rankings.dimensions);
  const baselines = snapshotBaselines(rankings.dimensions);
  const rows = rankings.models;
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
  ctx.fillText(
    `${rows.length} 个模型 · ${rankings.dimensions.length} 个维度 · ${groupCount} 个维度组 · Skip 按 60% 中位分计入`,
    PAD,
    78,
  );

  const headRule = layout.headerHeight;
  ctx.strokeStyle = TOKENS.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, headRule);
  ctx.lineTo(layout.width, headRule);
  ctx.stroke();

  const right = (column: ExportColumn) => column.x + column.width - 8;
  ctx.font = `10px ${TOKENS.mono}`;
  for (const column of layout.columns) {
    ctx.fillStyle = TOKENS.ink;
    // Numeric headers share the right anchor of the values below them.
    const x =
      column.kind === "rank" || column.kind === "model" ? column.x : right(column) - ctx.measureText(column.label).width;
    ctx.fillText(column.label, x, headRule + 28);
  }
  ctx.beginPath();
  ctx.moveTo(0, headRule + 40);
  ctx.lineTo(layout.width, headRule + 40);
  ctx.stroke();

  rows.forEach((model, index) => {
    const y = headRule + 46 + index * layout.rowHeight + 28;
    if (index === 0) {
      ctx.fillStyle = TOKENS.signal;
      ctx.fillRect(PAD - 8, y - 14, 3, 18);
    }
    for (const column of layout.columns) {
      if (column.kind === "rank") {
        ctx.fillStyle = index === 0 ? TOKENS.signal : TOKENS.ink;
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
      if (column.kind === "score") {
        ctx.fillStyle = TOKENS.ink;
        ctx.font = `13px ${TOKENS.mono}`;
        const value = formatScore(model.score);
        ctx.fillText(value, right(column) - ctx.measureText(value).width, y);
        continue;
      }
      if (column.kind === "group" && column.group) {
        // Same format as the dimension columns beside it.
        const value = formatDimension(groupValue(column.group, model.scores, baselines, model.skips));
        ctx.fillStyle = TOKENS.ink;
        ctx.font = `13px ${TOKENS.mono}`;
        ctx.fillText(value, right(column) - ctx.measureText(value).width, y);
        continue;
      }
      if (column.kind === "dimension" && column.dimension) {
        if (model.skips.includes(column.dimension.id)) {
          ctx.fillStyle = TOKENS.ink3;
          ctx.font = `11px ${TOKENS.mono}`;
          ctx.fillText("Skip", right(column) - ctx.measureText("Skip").width, y);
          continue;
        }
        const value = formatDimension(model.scores[String(column.dimension.id)]);
        ctx.fillStyle = TOKENS.ink;
        ctx.font = `13px ${TOKENS.mono}`;
        ctx.fillText(value, right(column) - ctx.measureText(value).width, y);
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
    `导出时间 ${now.toISOString().slice(0, 10)} · 加权平均`,
    PAD,
    height - 18,
  );
}

/** Renders the board and hands the PNG to the browser as a download. */
export async function downloadRankingsImage(rankings: Rankings, now = new Date()): Promise<void> {
  const canvas = document.createElement("canvas");
  renderExportCanvas(canvas, rankings, now);
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
