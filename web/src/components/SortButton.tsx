import type { SortDir } from "../domain/ranking";
import { Icon } from "./Icons";
import styles from "./SortButton.module.css";

interface SortButtonProps {
  label: string;
  /** Reserved second line under the label; the workbench renders the weight here. */
  sub?: string;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right";
  /** Let long labels wrap instead of overrunning the column. */
  wrap?: boolean;
  /** Extra class for the button, for column-level layout such as header anchors. */
  className?: string;
  onClick: () => void;
}

/** Shared column sort control; the semantic <th> and aria-sort stay with the page. */
export function SortButton({ label, sub, active, dir, align = "left", wrap = false, className, onClick }: SortButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.button} ${align === "right" ? styles.right : ""} ${className ?? ""}`}
      onClick={onClick}
    >
      <span className={`${styles.label} ${active ? styles.active : ""} ${wrap ? styles.wrap : ""}`}>
        {label}
        {/* Out of flow: the arrow marks the sort without pushing the label off
            the anchor its column shares with the values below. */}
        {active ? <Icon name={dir === "asc" ? "arrowUp" : "arrowDown"} size={11} className={styles.arrow} /> : null}
      </span>
      {/* Rendered in every column so all first lines share one baseline. */}
      <span className={styles.sub}>{sub ?? ""}</span>
    </button>
  );
}
