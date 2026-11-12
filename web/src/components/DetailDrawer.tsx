import { useMemo, useState } from "react";
import type { RankingModel } from "../api/types";
import { barWidth, dimensionMax, dimensionRanks, formatDimension, type Dimension } from "../domain/ranking";
import { Dialog, DialogHeader } from "./Dialog";
import ui from "./ui.module.css";
import styles from "./DetailDrawer.module.css";

export interface DetailTarget {
  kicker: string;
  title: string;
  /** Group colour; null for a single dimension. */
  color: string | null;
  meta: string;
  dimensions: Dimension[];
}

interface DetailDrawerProps {
  target: DetailTarget | null;
  rows: RankingModel[];
  onClose: () => void;
}

/** Group and single-dimension detail share one drawer, so the two entries behave alike. */
export function DetailDrawer({ target, rows, onClose }: DetailDrawerProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const dimension = target?.dimensions.find((item) => item.id === activeId) ?? target?.dimensions[0] ?? null;
  const ranks = useMemo(
    () => (dimension ? dimensionRanks(rows, [dimension.id]).get(dimension.id) ?? new Map<string, number>() : new Map<string, number>()),
    [rows, dimension],
  );
  const max = useMemo(() => (dimension ? dimensionMax(rows, dimension.id) : 0), [rows, dimension]);

  if (!target || !dimension) return null;

  const scored = rows
    .filter((row) => ranks.has(row.slug))
    .sort((a, b) => (ranks.get(a.slug) ?? 0) - (ranks.get(b.slug) ?? 0));
  const skipped = rows.filter((row) => row.skips.includes(dimension.id));

  return (
    <Dialog open width="drawer" labelledBy="drawer-title" onRequestClose={onClose}>
      <DialogHeader titleId="drawer-title" kicker={target.kicker} title={target.title} onClose={onClose} />
      <div className={ui.dialogBody}>
        <p className={styles.meta}>{target.meta}</p>
        {target.dimensions.length > 1 ? (
          <div className={styles.picker} role="tablist" aria-label="组内维度">
            {target.dimensions.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === dimension.id}
                className={`${styles.pick} ${item.id === dimension.id ? styles.pickActive : ""}`}
                onClick={() => setActiveId(item.id)}
              >
                <span className={styles.swatch} style={{ background: target.color ?? "var(--rule)" }} aria-hidden="true" />
                {item.name}
              </button>
            ))}
          </div>
        ) : null}
        <ol className={styles.rankList}>
          {scored.map((row) => (
            <li key={row.slug} className={styles.rankRow}>
              <span className={styles.rankNo}>{String(ranks.get(row.slug)).padStart(2, "0")}</span>
              <span className={styles.rankIdentity}>
                <span className={styles.rankName}>{row.name}</span>
                <span className={styles.rankVendor}>{row.vendor || "—"}</span>
              </span>
              <span className={styles.rankBar} aria-hidden="true">
                <span style={{ width: `${barWidth(row.scores[String(dimension.id)], max)}%` }} />
              </span>
              <span className={styles.rankNum}>{formatDimension(row.scores[String(dimension.id)])}</span>
            </li>
          ))}
          {skipped.map((row) => (
            <li key={row.slug} className={`${styles.rankRow} ${styles.rankSkipped}`}>
              <span className={styles.rankNo}>—</span>
              <span className={styles.rankIdentity}>
                <span className={styles.rankName}>{row.name}</span>
                <span className={styles.rankVendor}>{row.vendor || "—"}</span>
              </span>
              <span className={styles.rankBar} aria-hidden="true" />
              <span className={styles.rankNum}>Skip</span>
            </li>
          ))}
        </ol>
      </div>
      <div className={ui.dialogFoot}>
        <span className={styles.foot}>
          {scored.length} 个模型在该维度有评分
          {skipped.length > 0
            ? ` / ${skipped.length} 个已跳过（计入总分时取该维度 60% 中位分 ${formatDimension(dimension.skipMedian)}）`
            : ""}
        </span>
      </div>
    </Dialog>
  );
}
