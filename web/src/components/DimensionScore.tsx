import type { CSSProperties } from "react";
import type { ScoreRange } from "../lib/scoreEmphasis";
import { formatStrengthPercentile, scoreEmphasisTone } from "../lib/scoreEmphasis";
import { useDisplayPreferences } from "../preferences/DisplayPreferences";
import { formatDimension } from "../domain/ranking";
import styles from "./DimensionScore.module.css";

interface DimensionScoreProps {
  value: number | null | undefined;
  range?: ScoreRange;
  className?: string;
}

/** One read-only dimension value with the shared score/gap format and the red-blue tone background. */
export function DimensionScore({ value, range, className }: DimensionScoreProps) {
  const { dimensionScoreEmphasis, scorePercentageMode } = useDisplayPreferences();
  const tone = dimensionScoreEmphasis ? scoreEmphasisTone(value, range) : null;
  const low = tone?.direction === "low";
  const style: CSSProperties | undefined =
    tone == null
      ? undefined
      : ({
          "--tone-bg": low ? "var(--score-low)" : "var(--score-high)",
          "--tone-mix": `${Math.round(tone.strength * 100)}%`,
          "--tone-rule": low ? "var(--score-low-rule)" : "var(--score-high-rule)",
        } as CSSProperties);
  return (
    <span className={[styles.score, tone ? styles.tone : "", className ?? ""].filter(Boolean).join(" ")} style={style}>
      {scorePercentageMode ? formatStrengthPercentile(value, range) : formatDimension(value)}
    </span>
  );
}
