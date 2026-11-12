import type { SortDir } from "../domain/ranking";
import { Icon } from "./Icons";
import styles from "./SortButton.module.css";

interface SortButtonProps {
  label: string;
  /** Second line under the label: the column weight or a group summary. */
  sub?: string;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right";
  /** Let long labels wrap instead of overrunning the column. */
  wrap?: boolean;
  onClick: () => void;
}

/** Shared column sort control; the semantic <th> and aria-sort stay with the page. */
export function SortButton({ label, sub, active, dir, align = "left", wrap = false, onClick }: SortButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.button} ${align === "right" ? styles.right : ""}`}
      onClick={onClick}
    >
      <span className={`${styles.label} ${active ? styles.active : ""} ${wrap ? styles.wrap : ""}`}>
        {label}
        {active ? <Icon name={dir === "asc" ? "arrowUp" : "arrowDown"} size={11} /> : null}
      </span>
      {sub != null ? <span className={styles.sub}>{sub}</span> : null}
    </button>
  );
}
