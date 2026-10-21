import { formatPercent, truncatePercent } from "../domain/ranking";
import ui from "./ui.module.css";

export function Coverage({ coverage, provisional }: { coverage: number; provisional: boolean }) {
  const width = Math.max(0, Math.min(100, coverage * 100));
  return (
    <span className={ui.coverage}>
      <span className={ui.coverageLabel}>
        <span>{formatPercent(coverage)}</span>
        {provisional ? (
          <span className={ui.tag} title={`覆盖率低于 80%（当前 ${truncatePercent(coverage)}%）`}>
            暂定
          </span>
        ) : null}
      </span>
      <span className={ui.coverageTrack}>
        <span
          className={`${ui.coverageFill} ${provisional ? ui.coverageProvisional : ""}`}
          style={{ width: `${width}%` }}
        />
      </span>
    </span>
  );
}
