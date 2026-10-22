import type { CSSProperties } from "react";
import type { ScoreRange } from "../lib/scoreEmphasis";
import { scoreEmphasisAlpha } from "../lib/scoreEmphasis";
import { useDisplayPreferences } from "../preferences/DisplayPreferences";
import { formatDimension } from "../domain/ranking";
import styles from "./DimensionScore.module.css";

interface DimensionScoreProps {
  value: number | null | undefined;
  range?: ScoreRange;
  className?: string;
}

/** One read-only dimension value with the shared ink emphasis background. */
export function DimensionScore({ value, range, className }: DimensionScoreProps) {
  const { dimensionScoreEmphasis } = useDisplayPreferences();
  const alpha = dimensionScoreEmphasis ? scoreEmphasisAlpha(value, range) : null;
  const style: CSSProperties | undefined = alpha == null ? undefined : { backgroundColor: `rgba(20, 19, 15, ${alpha})` };
  return (
    <span className={className ? `${styles.score} ${className}` : styles.score} style={style}>
      {formatDimension(value)}
    </span>
  );
}
